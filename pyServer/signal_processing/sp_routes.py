"""Clean neurofeedback signal-processing routes.

Compatibility goals:
- Keep the existing /sp endpoints.
- Keep existing WebSocket start-command fields.
- Preserve legacy payload fields while adding clearer fields.

Clinical runtime policy:
- Real hardware only; no simulated fallback.
- Fs=250 Hz, gain=24, 3 hardware channels, volts.
- Current protocols are single-channel: protocol electrode label is mapped to hardware CH0.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from weakref import WeakSet

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from signal_processing.device_acquisition import find_serial_port
from signal_processing.device_debug import run_device_debug
from signal_processing.payloads import build_error_payload
from signal_processing.protocol_features import (
    parse_protocol_entry,
    protocol_runtime_from_legacy_start_command,
    protocol_runtime_from_sp_config,
)
from signal_processing.runtime_models import SessionConfig
from signal_processing.session_runner import run_neurofeedback_session

LOGGER_NAME = "pyserver.api"
logger = logging.getLogger(LOGGER_NAME)

router = APIRouter(prefix="/sp", tags=["Signal Processing"])
active_connections = WeakSet()

# The current application should run one clinical NF stream at a time.
# The lock enforces that contract; the event lets POST /sp/nfcore_stop interrupt
# the active WebSocket session.
_nfcore_stop_event: Optional[asyncio.Event] = None
_nfcore_session_lock: Optional[asyncio.Lock] = None


def _get_nfcore_session_lock() -> asyncio.Lock:
    global _nfcore_session_lock
    if _nfcore_session_lock is None:
        _nfcore_session_lock = asyncio.Lock()
    return _nfcore_session_lock


@router.get("/device/status")
async def device_status() -> JSONResponse:
    """Return serial-device availability. Does not start acquisition."""
    try:
        available_ports = find_serial_port()
        if available_ports:
            return JSONResponse({
                "status": "available",
                "using_mock": False,
                "ports": available_ports,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        return JSONResponse({
            "status": "unavailable",
            "using_mock": False,
            "message": "No serial ports found",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.exception("Error in device_status endpoint: %s", exc)
        return JSONResponse({
            "status": "error",
            "message": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, status_code=500)


@router.websocket("/device_debug")
async def device_debug(websocket: WebSocket) -> None:
    """Stream a step-by-step device-connection diagnostic to the debug window."""
    await websocket.accept()

    lock = _get_nfcore_session_lock()
    if lock.locked():
        await websocket.send_json(build_error_payload(
            "A neurofeedback session is running - stop it before running the device diagnostic"))
        await websocket.close()
        return

    async with lock:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict] = asyncio.Queue()

        def emit(event: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        worker = loop.run_in_executor(None, run_device_debug, emit)
        try:
            while True:
                event = await queue.get()
                if event.get("type") == "done":
                    break
                await websocket.send_json(event)
        except WebSocketDisconnect:
            logger.info("Device debug WebSocket disconnected mid-run")
        finally:
            await worker
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/nfcore_start")
async def nfcore(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time neurofeedback signal processing."""
    global _nfcore_stop_event

    await websocket.accept()
    active_connections.add(websocket)
    logger.info("Neurofeedback WebSocket connected")

    try:
        await websocket.send_json({
            "type": "welcome",
            "time": datetime.now(timezone.utc).isoformat(),
            "message": "WebSocket ready for streaming",
        })

        start_command = await websocket.receive_json()
        logger.debug("Received neurofeedback start_command: %s", start_command)
        await websocket.send_json({
            "type": "echo",
            "time": datetime.now(timezone.utc).isoformat(),
            "message": f"Start command received {start_command}",
        })

        if not start_command.get("start"):
            await websocket.send_json(build_error_payload("Start command must include start=true"))
            return

        # The app keeps this socket open from startup; only a real start command
        # claims the single-session lock, so idle connections never block the
        # device diagnostic or another session.
        lock = _get_nfcore_session_lock()
        if lock.locked():
            await websocket.send_json(build_error_payload("Another neurofeedback session is already running"))
            return

        async with lock:
            _nfcore_stop_event = asyncio.Event()

            patient_name = _resolve_patient_name(start_command.get("patientId"))
            session_config = SessionConfig.from_start_command(start_command, patient_name=patient_name)
            protocol_config = _load_protocol_runtime_config(start_command)

            logger.info(
                "Starting NF session: duration=%ss rounds=%s round_duration=%ss fs=%s protocol=%s",
                session_config.total_session_duration_seconds,
                session_config.session_rounds,
                session_config.round_duration_seconds,
                session_config.fs,
                protocol_config.protocol_name,
            )

            await run_neurofeedback_session(
                websocket,
                session_config,
                protocol_config,
                logger=logger,
                stop_event=_nfcore_stop_event,
            )

    except WebSocketDisconnect:
        logger.info("Neurofeedback WebSocket disconnected")
    except Exception as exc:
        logger.exception("nfcore failed: %s", exc)
        try:
            await websocket.send_json(build_error_payload(str(exc)))
        except Exception:
            pass
    finally:
        _nfcore_stop_event = None
        try:
            active_connections.discard(websocket)
        except Exception:
            pass
        logger.info("Neurofeedback WebSocket session closed")


@router.post("/nfcore_stop")
async def nfcore_stop() -> JSONResponse:
    """Request the active neurofeedback WebSocket session to stop."""
    global _nfcore_stop_event
    if _nfcore_stop_event is not None:
        _nfcore_stop_event.set()
        status = "stop_requested"
    else:
        status = "no_active_session"
    return JSONResponse({
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/recording/{filename:path}")
async def get_recording(filename: str):
    """Return a recording file from the eeg_recordings directory.

    Security rule: do not serve arbitrary absolute paths. New recorder payloads
    should provide paths relative to eeg_recordings, for example
    session_20260714_153000_patient_1_protocol_2/eeg_raw_clean.csv.
    """
    try:
        from signal_processing.recording import recordings_root

        root = os.path.abspath(recordings_root())
    except Exception:
        root = os.path.abspath(os.path.join(os.getcwd(), "eeg_recordings"))

    # Preserve compatibility with clients that send only a basename, while blocking
    # absolute paths and ../ traversal.
    if os.path.isabs(filename):
        return JSONResponse({"status": "forbidden", "message": "Absolute paths are not allowed"}, status_code=403)

    requested = os.path.abspath(os.path.join(root, filename))
    if not (requested == root or requested.startswith(root + os.sep)):
        return JSONResponse({"status": "forbidden", "message": "Path is outside recording directory"}, status_code=403)

    if os.path.exists(requested) and os.path.isfile(requested):
        return FileResponse(requested, filename=os.path.basename(requested))

    return JSONResponse({"status": "not_found", "filename": filename}, status_code=404)


def _load_protocol_runtime_config(start_command: Dict[str, Any]):
    """Load DB protocol if protocol_id exists; otherwise parse legacy/simple input."""
    protocol_id = start_command.get("protocol_id")
    user_id = start_command.get("user_id")
    if protocol_id:
        if not user_id:
            raise ValueError("user_id required when using protocol_id")
        try:
            from app.core.database import SessionLocal
            from app.protocols import crud as protocol_crud
            from app.protocols.utils import protocol_to_signal_processing_format
        except Exception as exc:
            raise RuntimeError(f"Could not import protocol/database helpers: {exc}") from exc

        db = SessionLocal()
        try:
            protocol = protocol_crud.get_protocol(db, protocol_id, user_id)
            if not protocol:
                raise ValueError(f"Protocol {protocol_id} not found")
            sp_config = protocol_to_signal_processing_format(protocol)
            protocol_name = str(getattr(protocol, "name", None) or f"Protocol {protocol_id}")
            return protocol_runtime_from_sp_config(sp_config, protocol_name=protocol_name, protocol_id=int(protocol_id))
        finally:
            db.close()

    # Simple protocol JSON pattern: {protocol, channel, reward, inhibit, note}
    if any(k in start_command for k in ("reward", "inhibit", "channel", "protocol")):
        return parse_protocol_entry(start_command, protocol_id=None, default_hardware_index=0)

    # Backward-compatible fallback for older frontend test commands.
    return protocol_runtime_from_legacy_start_command(start_command)


def _resolve_patient_name(patient_id: Any) -> str:
    if not patient_id:
        return "Unknown"
    try:
        from app.core.database import SessionLocal
        from app.patients.crud import PatientCRUD

        db = SessionLocal()
        try:
            patient = PatientCRUD().get(db, int(patient_id))
            if patient:
                return f"{patient.first_name} {patient.last_name}"
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Could not resolve patient name for patientId=%s: %s", patient_id, exc)
    return "Unknown"
