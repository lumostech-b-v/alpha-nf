"""Async neurofeedback session runner used by sp_routes.py.

The route stays thin; this module owns the real-time clinical loop.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from signal_processing.baseline import (
    add_baseline_feature_values,
    get_baseline_means,
    get_baseline_status,
    get_thresholds,
    initialize_round_baseline_state,
    lock_baseline_thresholds,
)
from signal_processing.device_acquisition import DeviceAcquisition, list_ports_diagnostic
from signal_processing.feedback_runtime import (
    calculate_success_rate,
    evaluate_epoch_binary,
    evaluate_feature_passes,
    reporting_combined_value,
)
from signal_processing.payloads import (
    build_eeg_data_payload,
    build_error_payload,
    build_feedback_payload,
    build_round_complete_payload,
    build_round_start_payload,
    build_session_complete_payload,
    utc_now,
)
from signal_processing.preprocessing import RealTimeEEGFilterChain
from signal_processing.protocol_features import compute_protocol_features
from signal_processing.recording import SessionRecorders, recording_relative_path
from signal_processing.runtime_models import (
    DEFAULT_GAIN,
    FS_HZ,
    HARDWARE_CHANNELS,
    ProtocolRuntimeConfig,
    RoundRuntimeState,
    SessionConfig,
    SessionRuntimeState,
    WelchConfig,
)


@dataclass
class NeurofeedbackSessionContext:
    websocket: WebSocket
    session_config: SessionConfig
    protocol_config: ProtocolRuntimeConfig
    welch_config: WelchConfig
    device: DeviceAcquisition
    filter_chain: RealTimeEEGFilterChain
    recorder: SessionRecorders
    runtime_state: SessionRuntimeState
    logger: logging.Logger
    stop_event: Optional[asyncio.Event] = None


class DeviceDataError(RuntimeError):
    """Raised when real hardware data is missing or invalid."""


def preprocessing_config_payload(filter_chain: RealTimeEEGFilterChain) -> dict[str, Any]:
    return {
        "type": "stateful_sos_realtime",
        "fs": filter_chain.fs,
        "hardware_channels": filter_chain.channels,
        "highpass_hz": filter_chain.highpass_hz,
        "lowpass_hz": filter_chain.lowpass_hz,
        "notch_hz": filter_chain.notch_hz,
        "notch_q": filter_chain.notch_q,
        "order": filter_chain.order,
        "use_car": False,
        "use_laplacian": False,
        "deprecated_plotter_aligned_filter_chain_used": False,
    }


async def initialize_real_device(logger: logging.Logger) -> DeviceAcquisition:
    """Open hardware, configure it, start streaming, and validate real samples."""
    device = await asyncio.to_thread(
        DeviceAcquisition,
        target_channels=HARDWARE_CHANNELS,
        fs=FS_HZ,
        verbose=False,
    )
    try:
        last_error: Optional[DeviceDataError] = None
        for attempt in range(1, 4):
            # First attempt mirrors the proven 2.0.5 flow: gain + operate + start sent
            # back-to-back right after the port opens, then read immediately.
            if attempt > 1:
                # The device may have missed commands sent right after the port opened
                # (e.g. while resetting on open): stop, settle, and start over.
                await asyncio.to_thread(device.stop_streaming)
                await asyncio.sleep(0.5)
                await asyncio.to_thread(device.clear_buffers, True)
            await asyncio.to_thread(device.configure_for_neurofeedback, DEFAULT_GAIN)
            await asyncio.to_thread(device.start_streaming)
            # read_samples returns as soon as it has FS_HZ samples, so the timeout
            # only matters when the device is slow or absent.
            test_block = await asyncio.to_thread(device.read_samples, FS_HZ, 4.0)
            try:
                validate_device_block(test_block, min_samples=max(50, FS_HZ // 2))
            except DeviceDataError as exc:
                last_error = exc
                logger.warning(
                    "Device validation attempt %s/3 failed: %s (port=%s, raw bytes received=%s, read errors=%s)",
                    attempt, exc, device.com_port, device.bytes_received, device.read_error_count,
                )
                continue
            logger.info("Device stream validated: shape=%s, fs=%s, gain=%s", test_block.shape, FS_HZ, DEFAULT_GAIN)
            return device
        raise DeviceDataError(
            f"{last_error} (port: {device.com_port}, raw bytes received: {device.bytes_received}, "
            f"read errors: {device.read_error_count}, system ports: {list_ports_diagnostic()})"
        )
    except Exception:
        try:
            await asyncio.to_thread(device.stop_streaming)
            await asyncio.to_thread(device.stop)
        finally:
            pass
        raise


def validate_device_block(block: np.ndarray, min_samples: int = 1) -> None:
    x = np.asarray(block, dtype=np.float64)
    if x.ndim != 2 or x.shape[1] != HARDWARE_CHANNELS:
        raise DeviceDataError(f"Expected hardware block shape (samples, 3), got {x.shape}")
    if x.shape[0] < min_samples:
        raise DeviceDataError(f"Insufficient real hardware samples: got {x.shape[0]}, expected at least {min_samples}")
    if not np.all(np.isfinite(x)):
        raise DeviceDataError("Hardware stream contains NaN or Inf")
    if np.allclose(x, 0.0):
        raise DeviceDataError("Hardware stream is all zeros")
    # A completely flat stream usually means the device is not delivering real EEG-like data.
    if float(np.nanstd(x)) <= 1e-15:
        raise DeviceDataError("Hardware stream is flat/constant")


async def run_neurofeedback_session(
    websocket: WebSocket,
    session_config: SessionConfig,
    protocol_config: ProtocolRuntimeConfig,
    *,
    logger: logging.Logger,
    stop_event: Optional[asyncio.Event] = None,
) -> dict[str, Any]:
    """Run one complete automatic multi-round neurofeedback session."""
    device: Optional[DeviceAcquisition] = None
    recorder: Optional[SessionRecorders] = None
    ctx: Optional[NeurofeedbackSessionContext] = None

    try:
        device = await initialize_real_device(logger)
        welch_config = WelchConfig()
        filter_chain = RealTimeEEGFilterChain(fs=FS_HZ, channels=HARDWARE_CHANNELS)
        recorder = SessionRecorders.open(
            session_config,
            protocol_config,
            welch_config,
            preprocessing_config_payload(filter_chain),
        )
        runtime_state = SessionRuntimeState(session_started_at=time.time(), phase="warmup")
        ctx = NeurofeedbackSessionContext(
            websocket=websocket,
            session_config=session_config,
            protocol_config=protocol_config,
            welch_config=welch_config,
            device=device,
            filter_chain=filter_chain,
            recorder=recorder,
            runtime_state=runtime_state,
            logger=logger,
            stop_event=stop_event,
        )

        await warmup_filters(ctx)
        completed_rounds = await run_automatic_rounds(ctx)
        session_success_rate = calculate_success_rate(ctx.runtime_state.session_training_history)
        payload = build_session_complete_payload(
            session_success_rate=session_success_rate,
            completed_rounds=completed_rounds,
            total_training_epochs=len(ctx.runtime_state.session_training_history),
            recording_files=ctx.recorder.files_payload(),
        )
        await websocket.send_json(payload)
        # Legacy frontend compatibility: the current Electron UI handles
        # type="complete" but may not yet handle type="session_complete".
        # Send the additive new event first, then the legacy completion event.
        try:
            legacy_complete = dict(payload)
            legacy_complete["type"] = "complete"
            await websocket.send_json(legacy_complete)
        except Exception:
            pass
        return payload

    except WebSocketDisconnect:
        raise
    except Exception as exc:
        # The route layer sends the error payload once. Re-raise here so cleanup
        # remains centralized and the WebSocket does not receive duplicate errors.
        logger.exception("Neurofeedback session failed: %s", exc)
        if ctx is not None:
            ctx.runtime_state.phase = "error"
        raise
    finally:
        await cleanup_session(ctx, device=device, recorder=recorder)


async def warmup_filters(ctx: NeurofeedbackSessionContext, warmup_seconds: float = 2.0) -> None:
    """Prime stateful filters before Round 1; warmup is not counted as session training."""
    blocks = max(1, int(math.ceil(warmup_seconds / ctx.session_config.runtime_step_seconds)))
    ctx.runtime_state.phase = "warmup"
    for _ in range(blocks):
        await poll_control_messages(ctx)
        if should_stop(ctx):
            raise RuntimeError("Session stopped during filter warmup")
        block_start_time = time.time()
        raw_block = await read_step_block(ctx)
        clean_block = ctx.filter_chain.process_block(raw_block)
        write_eeg_block(
            ctx,
            raw_block,
            clean_block,
            round_number=0,
            round_started_at=ctx.runtime_state.session_started_at,
            phase="warmup",
            block_started_at=block_start_time,
        )
        ctx.runtime_state.global_sample_index += raw_block.shape[0]


async def run_automatic_rounds(ctx: NeurofeedbackSessionContext) -> int:
    completed = 0
    for round_number in range(1, ctx.session_config.session_rounds + 1):
        await poll_control_messages(ctx)
        if should_stop(ctx):
            break
        round_completed = await run_one_round(ctx, round_number)
        if not round_completed:
            break
        completed += 1
    ctx.runtime_state.phase = "complete" if not should_stop(ctx) else "stopped"
    return completed


async def run_one_round(ctx: NeurofeedbackSessionContext, round_number: int) -> bool:
    cfg = ctx.session_config
    state = ctx.runtime_state
    state.current_round = round_number
    state.phase = "baseline"

    round_state = RoundRuntimeState(round_number=round_number, round_started_at=time.time())
    initialize_round_baseline_state(round_state, ctx.protocol_config.feature_specs)
    raw_buffer_all_v = np.empty((0, HARDWARE_CHANNELS), dtype=np.float64)
    clean_buffer_all_v = np.empty((0, HARDWARE_CHANNELS), dtype=np.float64)
    # Display buffer is separate from the clinical epoch buffer.
    # Clinical buffer: latest 1 s (250 samples) for Welch/features.
    # Display buffer: latest 5 s (1250 samples) for flowing EEG plotting only.
    clean_display_buffer_all_v = np.empty((0, HARDWARE_CHANNELS), dtype=np.float64)
    training_phase_started = False

    await ctx.websocket.send_json(build_round_start_payload(round_number, cfg))

    while True:
        await poll_control_messages(ctx)
        if should_stop(ctx):
            state.phase = "stopped"
            return False

        block_start_time = time.time()
        round_elapsed = block_start_time - round_state.round_started_at
        if round_elapsed >= cfg.round_duration_seconds:
            break

        # Classify the block/epoch by the time the block read starts. This avoids
        # a boundary bug where a baseline block could be reclassified as training
        # merely because reading/filtering crossed the 30 s boundary.
        phase = "baseline" if round_elapsed < cfg.baseline_duration_seconds else "training"
        state.phase = phase

        raw_block = await read_step_block(ctx)
        clean_block = ctx.filter_chain.process_block(raw_block)
        write_eeg_block(
            ctx,
            raw_block,
            clean_block,
            round_number,
            round_state.round_started_at,
            phase,
            block_started_at=block_start_time,
        )
        state.global_sample_index += raw_block.shape[0]

        if phase == "training" and not training_phase_started:
            # Baseline -> training boundary: lock thresholds from baseline feature
            # values and start feedback immediately. Hardware acquisition,
            # recording, filter state, and clinical rolling buffers all stay
            # continuous to avoid an artificial 1-second feedback delay. The first
            # training epoch may include the last part of the baseline window.
            if not round_state.baseline_locked:
                lock_baseline_thresholds(
                    round_state,
                    ctx.protocol_config.feature_specs,
                    cfg,
                    locked_at=block_start_time,
                )
            training_phase_started = True

        raw_buffer_all_v = append_and_trim(raw_buffer_all_v, raw_block, cfg.epoch_samples)
        clean_buffer_all_v = append_and_trim(clean_buffer_all_v, clean_block, cfg.epoch_samples)
        clean_display_buffer_all_v = append_and_trim(clean_display_buffer_all_v, clean_block, cfg.display_window_samples)

        if clean_buffer_all_v.shape[0] < cfg.epoch_samples:
            continue

        # Latest one-second clinical epoch; raw buffer is retained for recording/future diagnostics.
        clean_epoch_all_v = clean_buffer_all_v[-cfg.epoch_samples :, :]
        await send_eeg_data(ctx, clean_display_buffer_all_v, round_number, phase)

        feature_values = compute_protocol_features(
            clean_epoch_all_v,
            fs=cfg.fs,
            feature_specs=ctx.protocol_config.feature_specs,
            welch_config=ctx.welch_config,
        )
        state.global_epoch_index += 1

        now = time.time()
        round_elapsed = now - round_state.round_started_at

        if phase == "baseline":
            add_baseline_feature_values(round_state, feature_values)
            thresholds = get_thresholds(round_state)
            baseline_means = get_baseline_means(round_state)
            baseline_status = get_baseline_status(round_state, round_elapsed, cfg)
            feedback = 0.0
            epoch_binary = 0.0
            feature_passes: dict[str, bool] = {}
            round_success_rate = calculate_success_rate(round_state.round_training_history)
            session_success_rate = calculate_success_rate(state.session_training_history)
        else:
            if not round_state.baseline_locked:
                lock_baseline_thresholds(round_state, ctx.protocol_config.feature_specs, cfg, locked_at=now)
            thresholds = get_thresholds(round_state)
            baseline_means = get_baseline_means(round_state)
            baseline_status = get_baseline_status(round_state, round_elapsed, cfg)
            feature_passes = evaluate_feature_passes(feature_values, thresholds, ctx.protocol_config.feature_specs)
            epoch_binary = evaluate_epoch_binary(feature_passes)
            feedback = epoch_binary
            round_state.round_training_history.append(epoch_binary)
            state.session_training_history.append(epoch_binary)
            round_success_rate = calculate_success_rate(round_state.round_training_history)
            session_success_rate = calculate_success_rate(state.session_training_history)

        combined_value = reporting_combined_value(feature_values)
        await send_feedback_and_record_epoch(
            ctx=ctx,
            round_state=round_state,
            feature_values=feature_values,
            thresholds=thresholds,
            feature_passes=feature_passes,
            baseline_means=baseline_means,
            baseline_status=baseline_status,
            feedback=feedback,
            epoch_binary=epoch_binary,
            combined_value=combined_value,
            round_success_rate=round_success_rate,
            session_success_rate=session_success_rate,
            clean_epoch_all_v=clean_epoch_all_v,
            clean_display_buffer_all_v=clean_display_buffer_all_v,
        )

    round_success_rate = calculate_success_rate(round_state.round_training_history)
    await ctx.websocket.send_json(
        build_round_complete_payload(
            round_number,
            cfg,
            round_success_rate=round_success_rate,
            training_epochs=len(round_state.round_training_history),
            raw_data_file=recording_relative_path(ctx.recorder.eeg_path),
        )
    )
    return True


async def read_step_block(ctx: NeurofeedbackSessionContext) -> np.ndarray:
    """Read exactly one runtime step from real hardware.

    With fs=250 and runtime_step_seconds=0.5, every clinical step must contain
    exactly 125 new samples. A shorter block means the hardware stream is missing
    data or running slower than expected, so this version treats it as a real
    device/data error instead of silently changing the epoch timing.
    """
    expected = ctx.session_config.step_samples
    block = await asyncio.to_thread(
        ctx.device.read_samples,
        expected,
        max(1.0, ctx.session_config.runtime_step_seconds * 3.0),
    )
    validate_device_block(block, min_samples=expected)
    if block.shape[0] != expected:
        raise DeviceDataError(f"Expected exactly {expected} samples per runtime step, got {block.shape[0]}")
    return block


def append_and_trim(buffer: np.ndarray, block: np.ndarray, max_samples: int) -> np.ndarray:
    if block.size == 0:
        return buffer
    if buffer.size == 0:
        out = block.copy()
    else:
        out = np.vstack([buffer, block])
    return out[-max_samples:, :]


def write_eeg_block(
    ctx: NeurofeedbackSessionContext,
    raw_block: np.ndarray,
    clean_block: np.ndarray,
    round_number: int,
    round_started_at: float,
    phase: str,
    *,
    block_started_at: float,
) -> None:
    # Save sample timestamps relative to the start of the block, not the end of
    # read/filter/write. Otherwise each saved sample would be shifted forward by
    # roughly one runtime step.
    active = ctx.protocol_config.active_channels[0]
    ctx.recorder.write_eeg_block(
        raw_block,
        clean_block,
        timestamp_iso=utc_now(),
        session_elapsed_s=max(0.0, block_started_at - ctx.runtime_state.session_started_at),
        start_sample_index=ctx.runtime_state.global_sample_index,
        round_number=round_number,
        round_elapsed_s=max(0.0, block_started_at - round_started_at),
        phase=phase,
        active_hardware_index=active.hardware_index,
        active_electrode_label=active.label,
        fs=ctx.session_config.fs,
        gain=DEFAULT_GAIN,
    )


async def send_eeg_data(ctx: NeurofeedbackSessionContext, clean_display_buffer_all_v: np.ndarray, round_number: int, phase: str) -> None:
    payload = build_eeg_data_payload(
        clean_display_buffer_all_v,
        ctx.protocol_config,
        ctx.session_config,
        round_number=round_number,
        phase=phase,
    )
    await ctx.websocket.send_json(payload)


async def send_feedback_and_record_epoch(
    *,
    ctx: NeurofeedbackSessionContext,
    round_state: RoundRuntimeState,
    feature_values: dict[str, Any],
    thresholds: dict[str, float],
    feature_passes: dict[str, bool],
    baseline_means: dict[str, float],
    baseline_status: dict[str, Any],
    feedback: float,
    epoch_binary: float,
    combined_value: float,
    round_success_rate: float,
    session_success_rate: float,
    clean_epoch_all_v: np.ndarray,
    clean_display_buffer_all_v: np.ndarray,
) -> None:
    phase = ctx.runtime_state.phase
    now = time.time()
    round_elapsed = max(0.0, now - round_state.round_started_at)
    progress = min(1.0, max(0.0, round_elapsed / ctx.session_config.baseline_duration_seconds))
    fvals = {name: fv.to_payload_value() for name, fv in feature_values.items()}
    funits = {name: fv.unit for name, fv in feature_values.items()}
    fmodes = {name: fv.mode for name, fv in feature_values.items()}

    payload = build_feedback_payload(
        feedback=feedback,
        epoch_binary=epoch_binary,
        feature_values=feature_values,
        thresholds=thresholds,
        feature_passes=feature_passes,
        baseline_means=baseline_means,
        baseline_status=baseline_status,
        round_number=round_state.round_number,
        phase=phase,
        session_config=ctx.session_config,
        protocol_config=ctx.protocol_config,
        round_success_rate=round_success_rate,
        session_success_rate=session_success_rate,
        combined_value=combined_value,
        # Include the 5-second display buffer in the feedback payload as a
        # legacy-compatible eeg_data alias. The separate eeg_data message also
        # carries this same display window. Do not send the 1-second clinical
        # epoch here, otherwise the frontend plot can be overwritten by a short
        # non-flowing window.
        clean_epoch_all_v=clean_display_buffer_all_v,
    )
    await ctx.websocket.send_json(payload)

    ctx.recorder.write_feature_epoch(
        timestamp_iso=utc_now(),
        session_elapsed_s=now - ctx.runtime_state.session_started_at,
        global_epoch_index=ctx.runtime_state.global_epoch_index,
        round_number=round_state.round_number,
        round_elapsed_s=round_elapsed,
        phase=phase,
        baseline_locked=round_state.baseline_locked,
        baseline_progress_pct=progress * 100.0,
        feature_values=fvals,
        feature_units=funits,
        feature_modes=fmodes,
        baseline_means=baseline_means,
        thresholds=thresholds,
        feature_passes=feature_passes,
        epoch_binary=epoch_binary,
        feedback=feedback,
        round_success_rate=round_success_rate,
        session_success_rate=session_success_rate,
    )


async def poll_control_messages(ctx: NeurofeedbackSessionContext) -> None:
    if ctx.stop_event is not None and ctx.stop_event.is_set():
        ctx.runtime_state.stop_requested = True
        return
    try:
        msg = await asyncio.wait_for(ctx.websocket.receive_json(), timeout=0.001)
    except asyncio.TimeoutError:
        return
    except WebSocketDisconnect:
        raise
    except Exception:
        return

    msg_type = msg.get("type") or msg.get("command")
    if msg_type == "stop" or msg.get("stop") is True:
        ctx.runtime_state.stop_requested = True
    elif msg_type == "update_feedback_interval":
        # Runtime step is fixed at 0.5 s in this clinical version; acknowledge for compatibility.
        await ctx.websocket.send_json({
            "type": "feedback_interval_updated",
            "feedback_interval": ctx.session_config.runtime_step_seconds,
            "message": "Runtime step is fixed at 0.5 seconds for this version.",
            "timestamp": utc_now(),
        })


def should_stop(ctx: NeurofeedbackSessionContext) -> bool:
    return bool(ctx.runtime_state.stop_requested or (ctx.stop_event and ctx.stop_event.is_set()))


async def cleanup_session(
    ctx: Optional[NeurofeedbackSessionContext],
    *,
    device: Optional[DeviceAcquisition] = None,
    recorder: Optional[SessionRecorders] = None,
) -> None:
    dev = device or (ctx.device if ctx else None)
    rec = recorder or (ctx.recorder if ctx else None)
    if dev is not None:
        try:
            await asyncio.to_thread(dev.stop_streaming)
        except Exception:
            pass
        try:
            await asyncio.to_thread(dev.stop)
        except Exception:
            pass
    if rec is not None:
        try:
            rec.close()
        except Exception:
            pass
