"""
Device Acquisition Module

A clean and straightforward implementation for acquiring EEG data from the serial device,
with simple filtering and data handling for neurofeedback applications.
"""

import time
import struct
import threading
import numpy as np
import serial
import glob
import sys
import os
from scipy import signal

def _load_serial_port_config() -> str | None:
    """Return the serial_port value from config.json if set, else None."""
    try:
        import json
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
        with open(os.path.normpath(config_path)) as f:
            cfg = json.load(f)
        port = cfg.get('device', {}).get('serial_port', '').strip()
        return port if port else None
    except Exception:
        return None


def find_serial_port():
    """Find the best available serial port for the device (cross-platform)"""
    if sys.platform.startswith('win'):
        # Windows: COM ports
        import serial.tools.list_ports
        ports_info = serial.tools.list_ports.comports()

        # Prioritize USB serial devices — check description, not port name
        usb_ports = [p.device for p in ports_info if 'USB' in p.description.upper() or 'SERIAL' in p.description.upper()]
        # Look for potential EEG device names in description
        eeg_ports = [p.device for p in ports_info if any(k in p.description.lower() for k in ['i8', 'eeg', 'neuro', 'brain']) and p.device not in usb_ports]
        other_ports = [p.device for p in ports_info if p.device not in usb_ports and p.device not in eeg_ports]

        return usb_ports + eeg_ports + other_ports
    else:
        # macOS/Linux: /dev/tty.* and /dev/cu.*
        ports = glob.glob('/dev/tty.*') + glob.glob('/dev/cu.*')

        # Prioritize USB serial devices
        usb_ports = [port for port in ports if 'usb' in port.lower()]
        modem_ports = [port for port in ports if 'modem' in port.lower() and port not in usb_ports]
        # Look for potential EEG device names
        eeg_ports = [port for port in ports if any(keyword in port.lower() for keyword in ['serial', 'i8', 'eeg', 'neuro', 'brain']) and port not in usb_ports and port not in modem_ports]
        other_ports = [port for port in ports if port not in usb_ports and port not in modem_ports and port not in eeg_ports and
                       not any(skip in port for skip in ['Bluetooth', 'iSerial', 'debug'])]

        return usb_ports + modem_ports + eeg_ports + other_ports


class DeviceAcquisition:
    """
    Device acquisition for EEG data from serial device.
    Provides a clean interface for reading data samples.
    """
    
    def __init__(self, target_channels=3, fs=None, verbose=True):
        self.verbose = bool(verbose)
        self.requested_target_channels = int(target_channels)
        self.target_channels = 3  # Fixed to 3 as per serial device protocol
        self.fs = int(fs or 250)  # Default to 250 Hz if not specified
        self.serial_port = None
        self.running = False
        self.data_buffer = []
        self.data_lock = threading.Lock()

        # Threading for continuous data reading
        self.read_thread = None

        # Use port from config.json if set, otherwise auto-detect
        configured_port = _load_serial_port_config()
        if configured_port:
            self.com_port = configured_port
            if self.verbose:
                print(f"Using configured serial port: {self.com_port}")
        else:
            available_ports = find_serial_port()
            if self.verbose and available_ports:
                print(f"Available serial ports found: {available_ports}")
            elif self.verbose:
                print("No serial ports found! Available ports on system:")
                if sys.platform.startswith('win'):
                    import serial.tools.list_ports
                    ports_info = serial.tools.list_ports.comports()
                    for port_info in ports_info:
                        print(f"  {port_info.device} - {port_info.description}")
                    print("Defaulting to COM3 - make sure your device is connected!")
                else:
                    system_ports = glob.glob('/dev/tty.*') + glob.glob('/dev/cu.*')
                    for port in system_ports:
                        print(f"  {port}")
                    print("Defaulting to /dev/tty.usbserial - make sure your device is connected!")

            if sys.platform.startswith('win'):
                self.com_port = available_ports[0] if available_ports else 'COM3'
            else:
                self.com_port = available_ports[0] if available_ports else '/dev/tty.usbserial'
        self.baudrate = 115200

        # Connect to the device
        if not self.connect_serial():
            raise RuntimeError(f"Failed to connect to serial device at {self.com_port}")

        # Start data reading thread
        self.running = True
        self.read_thread = threading.Thread(target=self._read_data_loop, daemon=True)
        self.read_thread.start()

        if self.verbose:
            print(f"DeviceAcquisition initialized — fs={self.fs}, requested_target_channels={self.requested_target_channels}")
            print(f"Connected to {self.com_port} at {self.baudrate} baud")

    def connect_serial(self, port=None, baudrate=115200):
        """Connect to the serial port"""
        if port:
            self.com_port = port
        self.baudrate = baudrate

        try:
            self.serial_port = serial.Serial(
                port=self.com_port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1
            )
            self.serial_port.reset_input_buffer()  # discard pre-start zeros
            if self.verbose:
                print(f"Connected to {self.com_port} at {self.baudrate} baud")
            return True
        except serial.SerialException as e:
            if self.verbose:
                print(f"Error connecting to {self.com_port}: {e}")
                print("Available ports on your system:")
                for port in find_serial_port():
                    print(f"  {port}")
            return False

    def _read_data_loop(self):
        """Continuously read data from serial port"""
        bytes_per_sample = 12  # 3 floats * 4 bytes = 12 bytes
        buffer = bytearray()
        
        while self.running:
            try:
                if self.serial_port and self.serial_port.is_open:
                    available = self.serial_port.in_waiting
                    if available > 0:
                        new_data = self.serial_port.read(available)
                        buffer.extend(new_data)
                        
                        # Process complete samples
                        while len(buffer) >= bytes_per_sample:
                            sample_bytes = buffer[:bytes_per_sample]
                            buffer = buffer[bytes_per_sample:]
                            
                            try:
                                # Unpack 3 float values
                                val1, val2, val3 = struct.unpack('<fff', sample_bytes)
                                
                                # Print raw signal values for debugging if verbose is enabled
                                if self.verbose:
                                    print(f"[C1: {val1:.6f}, C2: {val2:.6f}, C3: {val3:.6f}]")

                                # Add to buffer with thread safety
                                with self.data_lock:
                                    self.data_buffer.append([val1, val2, val3])
                                    if len(self.data_buffer) > 1000:  # Keep buffer size reasonable
                                        self.data_buffer.pop(0)  # Remove oldest
                            except struct.error:
                                continue  # Skip malformed data
                else:
                    time.sleep(0.01)
            except Exception:
                time.sleep(0.1)

    def read_samples(self, num_samples=1, timeout=None):
        """Read a specified number of samples from the device"""
        if num_samples <= 0:
            return np.empty((0, self.requested_target_channels), dtype=np.float64)

        collected = []
        start_time = time.time()
        timeout = float(timeout) if timeout is not None else max(5.0, num_samples / max(1, self.fs) * 2.0)

        while len(collected) < num_samples:
            # Get samples from buffer with thread safety
            with self.data_lock:
                if len(self.data_buffer) > 0:
                    # Take as many samples as possible up to what we need
                    available = min(len(self.data_buffer), num_samples - len(collected))
                    for i in range(available):
                        collected.append(self.data_buffer.pop(0))

            # Check if we have enough samples
            if len(collected) >= num_samples:
                break

            # Check timeout
            if time.time() - start_time > timeout:
                break

            # Small delay to prevent busy waiting
            time.sleep(0.001)

        if len(collected) == 0:
            return np.empty((0, self.requested_target_channels), dtype=np.float64)

        # Convert to numpy array (fixed to 3 channels from serial device)
        out = np.array(collected, dtype=np.float64)

        # Expand or contract the channels to match requested_target_channels
        if out.shape[1] != self.requested_target_channels and out.shape[0] > 0:
            if out.shape[1] < self.requested_target_channels:
                # Expand 3 channels to requested number by repeating values
                expanded = np.zeros((out.shape[0], self.requested_target_channels))
                for i in range(out.shape[0]):
                    # Use the 3 available channels and repeat them to fill requested channels
                    for ch in range(self.requested_target_channels):
                        expanded[i, ch] = out[i, ch % 3]  # Cycle through the 3 available channels
                out = expanded
            else:
                # If we had more channels than expected (hypothetically), trim to requested
                out = out[:, :self.requested_target_channels]

        return out

    def send_command(self, cmd):
        """Send a command to the device"""
        if self.serial_port and self.serial_port.is_open:
            if not cmd.endswith('\r\n'):
                cmd += '\r\n'
            self.serial_port.write(cmd.encode('ascii'))

    def stop(self):
        """Stop the acquisition and close connection"""
        self.running = False
        if self.read_thread and self.read_thread.is_alive():
            self.read_thread.join(timeout=1.0)
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
            if self.verbose:
                print("Serial port closed")

    def is_running(self):
        """Check if the device acquisition is still running"""
        return self.running