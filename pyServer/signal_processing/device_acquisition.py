"""
Real hardware EEG acquisition over serial.

Clinical neurofeedback route policy:
- Real hardware only; no simulated fallback.
- Auto-detect serial port unless config.json explicitly sets device.serial_port.
- Device stream is fixed: 3 little-endian floats per EEG sample = 12 bytes.
- Device values are volts.
- Default clinical gain is 24.
"""

from __future__ import annotations

import glob
import json
import logging
import os
import struct
import sys
import threading
import time
from collections import deque
from typing import Optional

import numpy as np
import serial

logger = logging.getLogger(__name__)

FS_HZ = 250
HARDWARE_CHANNELS = 3
BAUDRATE = 115200
BYTES_PER_SAMPLE = 12
UNPACK_FORMAT = "<fff"
DEFAULT_GAIN = 24


def _load_serial_port_config() -> Optional[str]:
    """Return config.json device.serial_port if present; otherwise None."""
    try:
        config_path = os.path.join(os.path.dirname(__file__), "..", "config.json")
        with open(os.path.normpath(config_path), encoding="utf-8") as f:
            cfg = json.load(f)
        port = str(cfg.get("device", {}).get("serial_port", "")).strip()
        return port or None
    except Exception:
        return None


def find_serial_port() -> list[str]:
    """Find likely serial ports. The caller chooses the first candidate."""
    if sys.platform.startswith("win"):
        import serial.tools.list_ports

        ports_info = [p for p in serial.tools.list_ports.comports() if "bluetooth" not in p.description.lower()]
        usb_ports = [p.device for p in ports_info if "USB" in p.description.upper() or "SERIAL" in p.description.upper()]
        eeg_ports = [
            p.device
            for p in ports_info
            if any(k in p.description.lower() for k in ["i8", "eeg", "neuro", "brain"])
            and p.device not in usb_ports
        ]
        other_ports = [p.device for p in ports_info if p.device not in usb_ports and p.device not in eeg_ports]
        return usb_ports + eeg_ports + other_ports

    ports = glob.glob("/dev/tty.*") + glob.glob("/dev/cu.*") + glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")
    # Bluetooth/debug ports open successfully but never stream EEG data — never valid candidates.
    ports = [p for p in ports if not any(skip in p.lower() for skip in ("bluetooth", "iserial", "debug"))]
    usb_ports = [p for p in ports if "usb" in p.lower() or "acm" in p.lower()]
    modem_ports = [p for p in ports if "modem" in p.lower() and p not in usb_ports]
    eeg_ports = [
        p
        for p in ports
        if any(k in p.lower() for k in ["serial", "i8", "eeg", "neuro", "brain"])
        and p not in usb_ports
        and p not in modem_ports
    ]
    # No catch-all fallback: on macOS every paired Bluetooth device exposes a port named
    # after itself (e.g. /dev/cu.<HeadphoneName>) that opens fine but never streams.
    # Unrecognized ports must be selected explicitly via config.json device.serial_port.
    return usb_ports + modem_ports + eeg_ports


def list_ports_diagnostic() -> str:
    """Human-readable summary of every serial port on the system, for error messages."""
    try:
        if sys.platform.startswith("win"):
            import serial.tools.list_ports

            entries = [f"{p.device} ({p.description})" for p in serial.tools.list_ports.comports()]
        else:
            entries = glob.glob("/dev/tty.*") + glob.glob("/dev/cu.*") + glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")
        return "; ".join(entries) if entries else "none"
    except Exception as exc:
        return f"unavailable ({exc})"


class DeviceAcquisition:
    """Threaded acquisition wrapper for the 3-channel serial EEG device."""

    def __init__(
        self,
        target_channels: int = HARDWARE_CHANNELS,
        fs: int = FS_HZ,
        verbose: bool = False,
        port: Optional[str] = None,
        baudrate: int = BAUDRATE,
        max_buffer_seconds: float = 10.0,
    ):
        if int(target_channels) != HARDWARE_CHANNELS:
            raise ValueError("Device protocol is fixed to 3 hardware channels; use active-channel mapping clinically")
        self.target_channels = HARDWARE_CHANNELS
        self.fs = int(fs or FS_HZ)
        if self.fs != FS_HZ:
            raise ValueError("Hardware sampling rate is fixed at 250 Hz")
        self.verbose = bool(verbose)
        self.baudrate = int(baudrate)
        self.max_buffer_samples = max(HARDWARE_CHANNELS, int(max_buffer_seconds * self.fs))
        self.data_buffer: deque[list[float]] = deque(maxlen=self.max_buffer_samples)
        self.data_lock = threading.Lock()
        self.byte_lock = threading.Lock()
        self.running = False
        self.read_thread: Optional[threading.Thread] = None
        self.serial_port: Optional[serial.Serial] = None
        self.byte_buffer = bytearray()
        self.bytes_received = 0
        self.samples_received = 0
        self.read_error_count = 0

        self.com_port = port or _load_serial_port_config() or self._auto_detect_port()
        self.connect_serial(self.com_port, self.baudrate)
        self.running = True
        self.read_thread = threading.Thread(target=self._read_data_loop, daemon=True)
        self.read_thread.start()

    def _auto_detect_port(self) -> str:
        ports = find_serial_port()
        logger.info("Serial port candidates: %s (all system ports: %s)", ports, list_ports_diagnostic())
        if not ports:
            raise RuntimeError(
                "No serial port found for the EEG device (Bluetooth/debug ports are ignored). "
                "Plug in the device via USB, or set device.serial_port in config.json."
            )
        if self.verbose:
            print(f"Available serial ports: {ports}; using {ports[0]}")
        return ports[0]

    def connect_serial(self, port: str, baudrate: int = BAUDRATE) -> bool:
        self.com_port = port
        self.baudrate = int(baudrate)
        try:
            self.serial_port = serial.Serial(
                port=self.com_port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1,
            )
            self.serial_port.reset_input_buffer()
            if self.verbose:
                print(f"Connected to {self.com_port} at {self.baudrate} baud")
            return True
        except serial.SerialException as exc:
            raise RuntimeError(f"Failed to connect to serial device at {self.com_port}: {exc}") from exc

    def configure_for_neurofeedback(self, gain: int = DEFAULT_GAIN) -> None:
        if gain not in (8, 12, 24):
            raise ValueError("gain must be 8, 12, or 24")
        self.send_command(f"Config_GAIN_{gain:02d}")
        time.sleep(0.1)
        self.send_command("Oprate_NOR_OPR")
        time.sleep(0.1)
        self.clear_buffers(reset_serial=True)

    def start_streaming(self) -> None:
        self.clear_buffers(reset_serial=True)
        self.send_command("Contl_STRT_AQU")

    def stop_streaming(self) -> None:
        try:
            self.send_command("Contl_STOP_AQU")
        except Exception:
            pass

    def clear_buffers(self, reset_serial: bool = False) -> None:
        with self.data_lock:
            self.data_buffer.clear()
        with self.byte_lock:
            self.byte_buffer.clear()
        if reset_serial and self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.reset_input_buffer()
            except Exception:
                pass

    def _read_data_loop(self) -> None:
        while self.running:
            try:
                if not (self.serial_port and self.serial_port.is_open):
                    time.sleep(0.01)
                    continue
                available = self.serial_port.in_waiting
                if available <= 0:
                    time.sleep(0.001)
                    continue
                chunk = self.serial_port.read(available)
                self.bytes_received += len(chunk)
                samples: list[list[float]] = []
                with self.byte_lock:
                    self.byte_buffer.extend(chunk)
                    while len(self.byte_buffer) >= BYTES_PER_SAMPLE:
                        sample_bytes = bytes(self.byte_buffer[:BYTES_PER_SAMPLE])
                        del self.byte_buffer[:BYTES_PER_SAMPLE]
                        try:
                            val1, val2, val3 = struct.unpack(UNPACK_FORMAT, sample_bytes)
                        except struct.error:
                            continue
                        if not (np.isfinite(val1) and np.isfinite(val2) and np.isfinite(val3)):
                            continue
                        samples.append([float(val1), float(val2), float(val3)])
                if samples:
                    self.samples_received += len(samples)
                    if self.verbose:
                        for val1, val2, val3 in samples:
                            print(f"[C1: {val1:.9f}, C2: {val2:.9f}, C3: {val3:.9f}]")
                    with self.data_lock:
                        self.data_buffer.extend(samples)
            except Exception as exc:
                self.read_error_count += 1
                if self.read_error_count <= 5:
                    logger.warning("Serial read loop error on %s: %r", self.com_port, exc)
                time.sleep(0.05)

    def read_samples(self, num_samples: int = 1, timeout: Optional[float] = None) -> np.ndarray:
        if num_samples <= 0:
            return np.empty((0, HARDWARE_CHANNELS), dtype=np.float64)
        collected: list[list[float]] = []
        start = time.time()
        timeout_s = float(timeout) if timeout is not None else max(1.0, num_samples / self.fs * 3.0)
        while len(collected) < num_samples:
            with self.data_lock:
                while self.data_buffer and len(collected) < num_samples:
                    collected.append(self.data_buffer.popleft())
            if len(collected) >= num_samples:
                break
            if time.time() - start > timeout_s:
                break
            time.sleep(0.001)
        if not collected:
            return np.empty((0, HARDWARE_CHANNELS), dtype=np.float64)
        return np.asarray(collected, dtype=np.float64).reshape((-1, HARDWARE_CHANNELS))

    def send_command(self, cmd: str) -> bool:
        if not (self.serial_port and self.serial_port.is_open):
            raise RuntimeError("Serial port is not open")
        command = cmd if cmd.endswith("\r\n") else f"{cmd}\r\n"
        self.serial_port.write(command.encode("ascii"))
        self.serial_port.flush()
        return True

    def stop(self) -> None:
        self.running = False
        if self.read_thread and self.read_thread.is_alive():
            self.read_thread.join(timeout=1.0)
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
            if self.verbose:
                print("Serial port closed")

    def is_running(self) -> bool:
        return bool(self.running and self.read_thread and self.read_thread.is_alive())
