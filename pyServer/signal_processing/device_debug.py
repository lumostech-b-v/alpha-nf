"""Step-by-step device-connection diagnostic for the in-app debug window.

Runs the same flow a real session uses (scan -> select -> open -> configure ->
start -> read -> decode), emitting one event per step so the frontend can show
the flow visually. If the standard sequence yields zero bytes it retries with
DTR/RTS combinations and alternate command line endings, because USB-CDC
devices sometimes only transmit with specific control-line states.

Blocking serial work only - callers run it in a thread and receive events via
the ``emit`` callback.
"""

from __future__ import annotations

import struct
import time
from typing import Callable, Optional

import serial

from signal_processing.device_acquisition import (
    BAUDRATE,
    BYTES_PER_SAMPLE,
    UNPACK_FORMAT,
    _load_serial_port_config,
    find_serial_port,
    list_ports_diagnostic,
)

COMMANDS = ["Config_GAIN_24", "Oprate_NOR_OPR", "Contl_STRT_AQU"]
READ_SECONDS = 3.0

Emit = Callable[[dict], None]


def _read_for(port: serial.Serial, seconds: float) -> bytes:
    data = bytearray()
    deadline = time.time() + seconds
    while time.time() < deadline:
        n = port.in_waiting
        if n > 0:
            data.extend(port.read(n))
        else:
            time.sleep(0.005)
    return bytes(data)


def _decode(data: bytes) -> list[tuple[float, float, float]]:
    samples = []
    for i in range(0, len(data) - BYTES_PER_SAMPLE + 1, BYTES_PER_SAMPLE):
        try:
            samples.append(struct.unpack(UNPACK_FORMAT, data[i:i + BYTES_PER_SAMPLE]))
        except struct.error:
            break
    return samples


def _open_port(com: str, dtr: bool, rts: bool) -> serial.Serial:
    port = serial.Serial()
    port.port = com
    port.baudrate = BAUDRATE
    port.bytesize = serial.EIGHTBITS
    port.parity = serial.PARITY_NONE
    port.stopbits = serial.STOPBITS_ONE
    port.timeout = 1
    # Set control lines before open so the device sees them at connect time.
    port.dtr = dtr
    port.rts = rts
    port.open()
    return port


def _attempt(emit: Emit, step_id: str, label: str, com: str, dtr: bool, rts: bool, ending: str) -> int:
    """One open/command/read cycle. Returns bytes received, -1 on open failure."""
    emit({"type": "step", "id": step_id, "label": label, "status": "running", "detail": ""})
    port: Optional[serial.Serial] = None
    try:
        try:
            port = _open_port(com, dtr, rts)
        except Exception as exc:
            emit({"type": "step", "id": step_id, "label": label, "status": "fail", "detail": f"Open failed: {exc}"})
            return -1
        port.reset_input_buffer()

        pre = _read_for(port, 1.0)
        for cmd in COMMANDS:
            port.write((cmd + ending).encode("ascii"))
            time.sleep(0.05)
        data = _read_for(port, READ_SECONDS)

        detail = f"{len(data)} bytes in {READ_SECONDS:.0f}s"
        if pre:
            detail += f" (+{len(pre)} bytes before any command - device streams by default)"
        if data:
            samples = _decode(data)
            rate = len(samples) / READ_SECONDS
            detail += f", {len(samples)} samples (~{rate:.0f} Hz)"
            first = "; ".join(f"[{s[0]:.6f}, {s[1]:.6f}, {s[2]:.6f}]" for s in samples[:3])
            emit({"type": "step", "id": step_id, "label": label, "status": "ok",
                  "detail": detail, "first_samples": first, "hex": data[:24].hex(" ")})
            return len(data)
        emit({"type": "step", "id": step_id, "label": label, "status": "fail", "detail": detail})
        return len(pre)
    finally:
        if port is not None:
            try:
                port.close()
            except Exception:
                pass


def run_device_debug(emit: Emit) -> None:
    """Run the whole diagnostic, emitting step events and a final verdict."""

    def step(step_id: str, label: str, status: str, detail: str = "") -> None:
        emit({"type": "step", "id": step_id, "label": label, "status": status, "detail": detail})

    def verdict(status: str, message: str) -> None:
        emit({"type": "verdict", "status": status, "message": message})

    try:
        all_ports = list_ports_diagnostic()
        candidates = find_serial_port()
        step("scan", "Scan serial ports", "ok" if candidates else "fail",
             f"candidates: {candidates or 'none'} | all system ports: {all_ports}")

        configured = _load_serial_port_config()
        com = configured or (candidates[0] if candidates else None)
        if com is None:
            step("select", "Select port", "fail", "No usable port. Is the device plugged in via USB?")
            verdict("fail", "No serial port found for the EEG device. Plug it in via USB, "
                            "or set device.serial_port in config.json.")
            return
        step("select", "Select port", "ok",
             f"{com} ({'from config.json' if configured else 'auto-detected'})")

        got = _attempt(emit, "standard", "Standard start sequence (as the app does it)",
                       com, dtr=True, rts=True, ending="\r\n")
        if got > 0:
            samples = got // BYTES_PER_SAMPLE
            if samples > 0:
                verdict("ok", "Device streams with the standard sequence. "
                              "A real session should work on this port.")
            else:
                verdict("warn", "Bytes arrive but do not decode as 12-byte samples - "
                                "possible framing/protocol mismatch. Share the hex preview above.")
            return
        if got == -1:
            verdict("fail", f"Could not open {com}. Another program may be holding the port "
                            "(orphan main.exe, vendor software, serial monitor). Close it and retry.")
            return

        for dtr, rts in [(False, True), (True, False), (False, False)]:
            if _attempt(emit, f"ctrl_{int(dtr)}{int(rts)}",
                        f"Retry with DTR={'on' if dtr else 'off'}, RTS={'on' if rts else 'off'}",
                        com, dtr=dtr, rts=rts, ending="\r\n") > 0:
                verdict("warn", f"Device only streams with DTR={dtr}, RTS={rts}. "
                                "The app must set these control lines when opening the port - report this.")
                return

        for ending, name in [("\n", "LF"), ("\r", "CR")]:
            if _attempt(emit, f"ending_{name}", f"Retry with {name} line ending",
                        com, dtr=True, rts=True, ending=ending) > 0:
                verdict("warn", f"Device only responds to {name} line endings - report this.")
                return

        verdict("fail", "Zero bytes in every configuration. The device is not transmitting on "
                        "this port: check that the headset is powered on, charged, and "
                        "paired/connected to its receiver, and verify with the vendor's own "
                        "software that it streams. This is not an app-side problem.")
    except Exception as exc:  # never let the debug flow kill the socket silently
        verdict("fail", f"Diagnostic crashed: {exc!r}")
    finally:
        emit({"type": "done"})
