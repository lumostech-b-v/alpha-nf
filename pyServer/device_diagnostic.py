"""
Standalone EEG hardware acquisition diagnostic.

Opens the serial port directly (no app code involved), sends the start
sequence, and reports exactly what came back. If the standard sequence
yields zero bytes, it automatically tries DTR/RTS combinations and
alternate command line endings, since USB-CDC devices sometimes only
transmit with specific control-line states.

Usage (on the machine the device is plugged into):
    python device_diagnostic.py            # auto-pick the first COM port
    python device_diagnostic.py COM4       # explicit port
"""

from __future__ import annotations

import struct
import sys
import time

import serial
import serial.tools.list_ports

BAUDRATE = 115200
COMMANDS = ["Config_GAIN_24", "Oprate_NOR_OPR", "Contl_STRT_AQU"]
READ_SECONDS = 3.0
BYTES_PER_SAMPLE = 12


def list_ports() -> list[str]:
    ports = list(serial.tools.list_ports.comports())
    print(f"System serial ports ({len(ports)}):")
    for p in ports:
        print(f"  {p.device}  --  {p.description}  [hwid: {p.hwid}]")
    return [p.device for p in ports]


def read_for(port: serial.Serial, seconds: float) -> bytes:
    data = bytearray()
    deadline = time.time() + seconds
    while time.time() < deadline:
        n = port.in_waiting
        if n > 0:
            data.extend(port.read(n))
        else:
            time.sleep(0.005)
    return bytes(data)


def decode_samples(data: bytes) -> list[tuple[float, float, float]]:
    samples = []
    for i in range(0, len(data) - BYTES_PER_SAMPLE + 1, BYTES_PER_SAMPLE):
        try:
            samples.append(struct.unpack("<fff", data[i:i + BYTES_PER_SAMPLE]))
        except struct.error:
            break
    return samples


def report(data: bytes) -> int:
    print(f"  raw bytes received in {READ_SECONDS:.0f}s: {len(data)}")
    if data:
        print(f"  first 32 bytes (hex): {data[:32].hex(' ')}")
        samples = decode_samples(data)
        print(f"  decoded 12-byte samples: {len(samples)}")
        for s in samples[:5]:
            print(f"    [C1: {s[0]:.9f}, C2: {s[1]:.9f}, C3: {s[2]:.9f}]")
        rate = len(samples) / READ_SECONDS
        print(f"  approx sample rate: {rate:.1f} Hz (expected ~250)")
    return len(data)


def send_sequence(port: serial.Serial, ending: str = "\r\n") -> None:
    for cmd in COMMANDS:
        payload = (cmd + ending).encode("ascii")
        port.write(payload)
        print(f"  sent: {cmd!r} + {ending!r} ({len(payload)} bytes) -- OK")
        time.sleep(0.05)


def run_attempt(com: str, dtr: bool, rts: bool, ending: str) -> int:
    print(f"\n--- Attempt: port={com} dtr={dtr} rts={rts} line_ending={ending!r} ---")
    try:
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
    except Exception as exc:
        print(f"  OPEN FAILED: {exc!r}")
        return -1
    try:
        print("  serial open: yes")
        port.reset_input_buffer()

        pre = read_for(port, 1.0)
        if pre:
            print(f"  NOTE: device sent {len(pre)} bytes BEFORE any command (streams by default)")

        send_sequence(port, ending)
        return report(read_for(port, READ_SECONDS))
    finally:
        try:
            port.close()
        except Exception:
            pass


def main() -> None:
    ports = list_ports()
    if len(sys.argv) > 1:
        com = sys.argv[1]
    elif ports:
        com = ports[0]
    else:
        print("No serial ports found. Is the device plugged in?")
        sys.exit(1)
    print(f"\nTesting port: {com}")

    # Phase 1: exact app behavior (pyserial defaults: DTR and RTS asserted, CRLF).
    got = run_attempt(com, dtr=True, rts=True, ending="\r\n")
    if got > 0:
        print("\nRESULT: device streams with the standard sequence. "
              "The app-side behavior should work; problem is elsewhere.")
        return

    # Phase 2: control-line variations.
    for dtr, rts in [(False, True), (True, False), (False, False)]:
        if run_attempt(com, dtr=dtr, rts=rts, ending="\r\n") > 0:
            print(f"\nRESULT: device only streams with dtr={dtr} rts={rts}. "
                  "The app must set these control lines at open.")
            return

    # Phase 3: line-ending variations (default control lines).
    for ending in ["\n", "\r"]:
        if run_attempt(com, dtr=True, rts=True, ending=ending) > 0:
            print(f"\nRESULT: device only responds to line ending {ending!r}. "
                  "The app must use this ending for commands.")
            return

    print("\nRESULT: zero bytes in every configuration. The device is not "
          "transmitting at all on this port: check that the headset is powered "
          "on, charged, and paired/connected to its receiver, and verify with "
          "the vendor's own software that it streams. This is not an app bug.")


if __name__ == "__main__":
    main()
