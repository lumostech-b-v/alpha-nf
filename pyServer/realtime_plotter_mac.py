import serial
import struct
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.widgets import Button
from collections import deque
import time
import threading
import csv
from datetime import datetime as dt
import numpy as np
from scipy import signal
import glob
import sys


# Cross-platform serial port - automatically detect available ports, prioritizing USB serial devices
def get_serial_ports():
    """Lists available serial ports on current platform, prioritizing USB serial devices"""
    if sys.platform.startswith('win'):
        # Windows: Use pySerial to list available COM ports
        import serial.tools.list_ports
        ports_info = serial.tools.list_ports.comports()
        ports = [port.device for port in ports_info]

        # Prioritize USB serial devices
        usb_ports = [port for port in ports if 'USB' in port.upper() or 'SERIAL' in port.upper()]
        other_ports = [port for port in ports if port not in usb_ports and not any(skip in port for skip in ['Bluetooth', 'iSerial', 'debug'])]

        # Return USB ports first, then other valid ports
        return usb_ports + other_ports
    else:
        # macOS/Linux: /dev/tty.* and /dev/cu.*
        ports = glob.glob('/dev/tty.*') + glob.glob('/dev/cu.*')

        # Separate USB serial devices from others
        usb_ports = [port for port in ports if 'usb' in port.lower() and 'modem' in port.lower()]
        other_ports = [port for port in ports if port not in usb_ports and not any(skip in port for skip in ['Bluetooth', 'iSerial', 'debug'])]

        # Return USB ports first, then other valid ports
        return usb_ports + other_ports

# Automatically find a suitable port or use a default
available_ports = get_serial_ports()
if available_ports:
    com_port = available_ports[0]  # Use the first available port (preferably USB)
    port_type = "USB Serial" if any(keyword in com_port.upper() for keyword in ['USB', 'SERIAL']) else "Other"
    print(f"Using detected {port_type} port: {com_port}")
else:
    if sys.platform.startswith('win'):
        com_port = 'COM3'  # Default Windows port
        print(f"No ports detected, using default: {com_port}")
    else:
        com_port = '/dev/tty.usbserial'  # Default macOS/Linux port
        print(f"No ports detected, using default: {com_port}")


class RealTimePlotter:
    def __init__(self, port=com_port, baudrate=115200, sample_rate=250, window_size=1000):
        self.port = port
        self.baudrate = baudrate
        self.sample_rate = sample_rate
        self.window_size = window_size

        # Data storage for display (moving window) - raw data
        self.data1_raw = deque(maxlen=window_size)
        self.data2_raw = deque(maxlen=window_size)
        self.data3_raw = deque(maxlen=window_size)
        self.time_data = deque(maxlen=window_size)

        # Data storage for display (moving window) - filtered data
        self.data1_filtered = deque(maxlen=window_size)
        self.data2_filtered = deque(maxlen=window_size)
        self.data3_filtered = deque(maxlen=window_size)

        # Data storage for saving (all data)
        self.all_data1 = []
        self.all_data2 = []
        self.all_data3 = []
        self.all_time_data = []

        # Serial connection
        self.ser = None
        self.running = False
        self.start_time = None

        # Threading
        self.data_lock = threading.Lock()
        self.read_thread = None

        # Design filters
        self.setup_filters()

        # Setup plot
        self.setup_plot()
        
        # Update device status to show port detection
        if available_ports:
            self.device_status_text.set_text(f'Device Status: Found {len(available_ports)} port(s), using {self.port}')
            self.device_status_text.set_color('orange')
        else:
            self.device_status_text.set_text(f'Device Status: No ports found, using default {self.port}')
            self.device_status_text.set_color('red')

    def setup_filters(self):
        """Design Butterworth filters for EEG signal processing"""
        # High-pass filter: 0.5 Hz, order 4
        self.hp_b, self.hp_a = signal.butter(4, 0.5, btype='high', fs=self.sample_rate)

        # Low-pass filter: 40 Hz, order 4
        self.lp_b, self.lp_a = signal.butter(4, 40, btype='low', fs=self.sample_rate)

        # Notch filter: 50 Hz, order 4 (using Butterworth bandstop)
        # For 50 Hz notch, use bandwidth of 2 Hz (49-51 Hz)
        notch_freq = 50.0
        notch_bandwidth = 2.0
        low_cutoff = notch_freq - notch_bandwidth / 2
        high_cutoff = notch_freq + notch_bandwidth / 2
        self.notch_b, self.notch_a = signal.butter(4, [low_cutoff, high_cutoff], btype='bandstop', fs=self.sample_rate)

        # Combine filters: cascade high-pass, low-pass, and notch
        # We'll apply them sequentially: high-pass -> low-pass -> notch
        print("Filters designed:")
        print(f"  High-pass: 0.5 Hz, order 4 (Butterworth)")
        print(f"  Low-pass: 40 Hz, order 4 (Butterworth)")
        print(f"  Notch: 50 Hz, order 4 (Butterworth bandstop, {low_cutoff}-{high_cutoff} Hz)")

    def apply_filters(self, data_array):
        """Apply all filters to a data array"""
        if len(data_array) == 0:
            return np.array([])

        data = np.array(data_array)

        # filtfilt requires minimum length: 3 * max(len(a), len(b)) - 1
        # For order 4 filters, we need at least ~30-50 samples
        min_length = 50

        if len(data) < min_length:
            # Not enough samples, return raw data
            return data

        try:
            # Apply high-pass filter
            data = signal.filtfilt(self.hp_b, self.hp_a, data)

            # Apply low-pass filter
            data = signal.filtfilt(self.lp_b, self.lp_a, data)

            # Apply notch filter
            data = signal.filtfilt(self.notch_b, self.notch_a, data)
        except ValueError as e:
            # If filtfilt fails (e.g., not enough samples), return raw data
            print(f"Filtering error (data length: {len(data)}): {e}")
            return np.array(data_array)

        return data

    def setup_plot(self):
        """Setup the matplotlib figure with subplots and buttons"""
        self.fig, (self.ax1, self.ax2, self.ax3) = plt.subplots(3, 1, figsize=(12, 10))
        self.fig.suptitle(f'{self.port} Real-Time Data', fontsize=14, fontweight='bold')

        # Configure subplots
        self.ax1.set_ylabel('Amplitude (μV)', fontsize=10)
        self.ax1.set_title('Channel 1 (Filtered EEG)', fontsize=11)
        self.ax1.grid(True, alpha=0.3)

        self.ax2.set_ylabel('Amplitude (μV)', fontsize=10)
        self.ax2.set_title('Channel 2 (Filtered EEG)', fontsize=11)
        self.ax2.grid(True, alpha=0.3)

        self.ax3.set_ylabel('Amplitude (μV)', fontsize=10)
        self.ax3.set_xlabel('Time (seconds)', fontsize=10)
        self.ax3.set_title('Channel 3 (Filtered EEG)', fontsize=11)
        self.ax3.grid(True, alpha=0.3)

        # Initialize line objects
        self.line1, = self.ax1.plot([], [], 'b-', linewidth=1.5)
        self.line2, = self.ax2.plot([], [], 'r-', linewidth=1.5)
        self.line3, = self.ax3.plot([], [], 'g-', linewidth=1.5)
        
        # Data reception status
        self.last_data_time = time.time()

        # Setup device status indicator
        self.device_status_text = self.fig.text(0.02, 0.96, 'Device Status: Not Found', 
                                                fontsize=10, color='red', weight='bold',
                                                horizontalalignment='left', verticalalignment='top')

        # Setup buttons
        self.setup_buttons()

        # Adjust layout to make room for buttons
        plt.tight_layout(rect=[0, 0.18, 1, 0.95])

    def setup_buttons(self):
        """Setup all control buttons"""
        # Group 1: Gain Settings
        gain_label_y = 0.12
        gain_button_y = 0.09  # Buttons positioned lower than label
        button_height = 0.03
        button_width = 0.08
        button_spacing = 0.01

        # Gain buttons
        ax_gain8 = plt.axes([0.05, gain_button_y, button_width, button_height])
        ax_gain12 = plt.axes([0.15, gain_button_y, button_width, button_height])
        ax_gain24 = plt.axes([0.25, gain_button_y, button_width, button_height])

        self.btn_gain8 = Button(ax_gain8, 'Gain 8')
        self.btn_gain12 = Button(ax_gain12, 'Gain 12')
        self.btn_gain24 = Button(ax_gain24, 'Gain 24')

        self.btn_gain8.on_clicked(lambda x: self.send_command("Config_GAIN_08"))
        self.btn_gain12.on_clicked(lambda x: self.send_command("Config_GAIN_12"))
        self.btn_gain24.on_clicked(lambda x: self.send_command("Config_GAIN_24"))

        # Group 2: Operation Modes
        mode_label_y = 0.08
        mode_button_y = 0.05  # Buttons positioned lower than label
        ax_imp = plt.axes([0.05, mode_button_y, button_width, button_height])
        ax_test = plt.axes([0.15, mode_button_y, button_width, button_height])
        ax_normal = plt.axes([0.25, mode_button_y, button_width, button_height])

        self.btn_imp = Button(ax_imp, 'Impedance')
        self.btn_test = Button(ax_test, 'Test Signal')
        self.btn_normal = Button(ax_normal, 'Normal')

        self.btn_imp.on_clicked(lambda x: self.send_command("Oprate_IMP_CHK"))
        self.btn_test.on_clicked(lambda x: self.send_command("Oprate_TST_SIG"))
        self.btn_normal.on_clicked(lambda x: self.send_command("Oprate_NOR_OPR"))

        # Group 3: Acquisition Control
        acq_label_y = 0.04
        acq_button_y = 0.01  # Buttons positioned lower than label
        ax_start = plt.axes([0.05, acq_button_y, button_width, button_height])
        ax_stop = plt.axes([0.15, acq_button_y, button_width, button_height])
        ax_save = plt.axes([0.25, acq_button_y, button_width, button_height])

        self.btn_start = Button(ax_start, 'Start', color='lightgreen')
        self.btn_stop = Button(ax_stop, 'Stop', color='lightcoral')
        self.btn_save = Button(ax_save, 'Save', color='lightblue')

        def on_start_clicked(event):
            # Clear saved data when starting new acquisition
            self.clear_saved_data()
            self.send_command("Contl_STRT_AQU")

        self.btn_start.on_clicked(on_start_clicked)
        self.btn_stop.on_clicked(lambda x: self.send_command("Contl_STOP_AQU"))
        self.btn_save.on_clicked(lambda x: self.save_data_to_file())

        # Add labels for button groups (positioned above buttons with more spacing)
        self.fig.text(0.01, gain_label_y, 'Gain Settings:', fontsize=9, weight='bold')
        self.fig.text(0.01, mode_label_y, 'Operation Modes:', fontsize=9, weight='bold')
        self.fig.text(0.01, acq_label_y, 'Acquisition Control:', fontsize=9, weight='bold')

    def connect_serial(self):
        """Connect to the serial port"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1
            )
            print(f"Connected to {self.port} at {self.baudrate} baud")
            # Update device status indicator
            self.device_status_text.set_text(f'Device Status: Connected to {self.port}')
            self.device_status_text.set_color('green')
            self.fig.canvas.draw_idle()  # Redraw the plot to show the status
            return True
        except serial.SerialException as e:
            print(f"Error connecting to {self.port}: {e}")
            print("Available ports on your system:")
            for port in get_serial_ports():
                print(f"  {port}")
            # Update device status indicator
            self.device_status_text.set_text(f'Device Status: Connection Failed - {self.port}')
            self.device_status_text.set_color('red')
            self.fig.canvas.draw_idle()  # Redraw the plot to show the status
            return False

    def send_command(self, command):
        """Send a command to the device"""
        if self.ser and self.ser.is_open:
            try:
                # Add line ending if not present
                if not command.endswith('\r\n'):
                    command += '\r\n'
                self.ser.write(command.encode('ascii'))
                print(f"Sent command: {command.strip()}")
            except Exception as e:
                print(f"Error sending command: {e}")
        else:
            print("Serial port not connected")

    def read_data_thread(self):
        """Thread function to continuously read data from serial port"""
        bytes_per_sample = 12  # 3 floats * 4 bytes each
        buffer = bytearray()

        while self.running:
            try:
                if self.ser and self.ser.is_open:
                    # Read available data
                    available = self.ser.in_waiting
                    if available > 0:
                        new_data = self.ser.read(available)
                        buffer.extend(new_data)

                        # Process complete samples
                        while len(buffer) >= bytes_per_sample:
                            # Extract one sample (12 bytes)
                            sample_bytes = buffer[:bytes_per_sample]
                            buffer = buffer[bytes_per_sample:]

                            # Decode three floats (assuming little-endian)
                            try:
                                val1, val2, val3 = struct.unpack('<fff', sample_bytes)

                                # Calculate time based on sample rate
                                if self.start_time is None:
                                    self.start_time = time.time()

                                current_time = time.time()
                                elapsed = current_time - self.start_time

                                # Update data with thread safety
                                with self.data_lock:
                                    # Add raw data to display window (deque)
                                    self.data1_raw.append(val1)
                                    self.data2_raw.append(val2)
                                    self.data3_raw.append(val3)
                                    self.time_data.append(elapsed)

                                    # Apply filters to the entire window for each channel
                                    # filtfilt requires at least 50 samples for order 4 filters
                                    min_samples_for_filtering = 50

                                    if len(self.data1_raw) >= min_samples_for_filtering:
                                        # Convert to numpy arrays for filtering
                                        data1_array = np.array(self.data1_raw)
                                        data2_array = np.array(self.data2_raw)
                                        data3_array = np.array(self.data3_raw)

                                        # Apply filters
                                        filtered1 = self.apply_filters(data1_array)
                                        filtered2 = self.apply_filters(data2_array)
                                        filtered3 = self.apply_filters(data3_array)

                                        # Ensure filtered arrays have same length as raw arrays
                                        if len(filtered1) == len(data1_array) and \
                                           len(filtered2) == len(data2_array) and \
                                           len(filtered3) == len(data3_array):
                                            # Update filtered data efficiently
                                            # Clear and repopulate to avoid recreating deques
                                            self.data1_filtered.clear()
                                            self.data2_filtered.clear()
                                            self.data3_filtered.clear()
                                            for val in filtered1:
                                                self.data1_filtered.append(val)
                                            for val in filtered2:
                                                self.data2_filtered.append(val)
                                            for val in filtered3:
                                                self.data3_filtered.append(val)
                                        else:
                                            # Length mismatch, just append raw data
                                            self.data1_filtered.append(val1)
                                            self.data2_filtered.append(val2)
                                            self.data3_filtered.append(val3)
                                    else:
                                        # Not enough samples yet, just store raw data
                                        self.data1_filtered.append(val1)
                                        self.data2_filtered.append(val2)
                                        self.data3_filtered.append(val3)

                                    # Add to full data storage for saving (save filtered data)
                                    if len(self.data1_filtered) > 0:
                                        self.all_data1.append(self.data1_filtered[-1])
                                        self.all_data2.append(self.data2_filtered[-1])
                                        self.all_data3.append(self.data3_filtered[-1])
                                        self.all_time_data.append(elapsed)
                                        
                                    # Update last data time for status indicator
                                    self.last_data_time = time.time()

                            except struct.error as e:
                                print(f"Error decoding data: {e}")
                                continue
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"Error in read thread: {e}")
                time.sleep(0.1)

    def update_plot(self, frame):
        """Update the plot with new filtered data"""
        with self.data_lock:
            if len(self.time_data) > 0:
                time_array = list(self.time_data)
                data1_array = list(self.data1_filtered)
                data2_array = list(self.data2_filtered)
                data3_array = list(self.data3_filtered)
            else:
                time_array = []
                data1_array = []
                data2_array = []
                data3_array = []

        # Update line data
        self.line1.set_data(time_array, data1_array)
        self.line2.set_data(time_array, data2_array)
        self.line3.set_data(time_array, data3_array)

        # Update axis limits
        if len(time_array) > 0:
            time_min = min(time_array)
            time_max = max(time_array)
            time_range = time_max - time_min if time_max > time_min else 1.0

            # Set x-axis limits with some padding
            for ax in [self.ax1, self.ax2, self.ax3]:
                ax.set_xlim(time_min - 0.05 * time_range, time_max + 0.05 * time_range)

            # Set y-axis limits for each channel
            if len(data1_array) > 0:
                y1_min, y1_max = min(data1_array), max(data1_array)
                y1_range = y1_max - y1_min if y1_max > y1_min else 1.0
                self.ax1.set_ylim(y1_min - 0.1 * y1_range, y1_max + 0.1 * y1_range)

            if len(data2_array) > 0:
                y2_min, y2_max = min(data2_array), max(data2_array)
                y2_range = y2_max - y2_min if y2_max > y2_min else 1.0
                self.ax2.set_ylim(y2_min - 0.1 * y2_range, y2_max + 0.1 * y2_range)

            if len(data3_array) > 0:
                y3_min, y3_max = min(data3_array), max(data3_array)
                y3_range = y3_max - y3_min if y3_max > y3_min else 1.0
                self.ax3.set_ylim(y3_min - 0.1 * y3_range, y3_max + 0.1 * y3_range)
                
        # Update device status indicator based on connection status
        if self.ser and self.ser.is_open:
            self.device_status_text.set_text(f'Device Status: Connected to {self.port}')
            self.device_status_text.set_color('green')
        else:
            self.device_status_text.set_text(f'Device Status: Not Connected')
            self.device_status_text.set_color('red')

        return self.line1, self.line2, self.line3

    def clear_saved_data(self):
        """Clear all saved data (keeps display window intact)"""
        with self.data_lock:
            # Clear raw data buffers
            self.data1_raw.clear()
            self.data2_raw.clear()
            self.data3_raw.clear()
            # Clear filtered data buffers
            self.data1_filtered.clear()
            self.data2_filtered.clear()
            self.data3_filtered.clear()
            # Clear time data
            self.time_data.clear()
            # Clear saved data
            self.all_data1.clear()
            self.all_data2.clear()
            self.all_data3.clear()
            self.all_time_data.clear()
        print("Saved data cleared")

    def start(self):
        """Start the real-time plotting"""
        if not self.connect_serial():
            return

        self.running = True
        self.start_time = None

        # Start data reading thread
        self.read_thread = threading.Thread(target=self.read_data_thread, daemon=True)
        self.read_thread.start()

        # Start animation
        self.ani = animation.FuncAnimation(
            self.fig,
            self.update_plot,
            interval=50,  # Update plot every 50ms
            blit=True,
            cache_frame_data=False
        )

        # Handle window close event
        def on_close(event):
            self.running = False
            if self.ser and self.ser.is_open:
                self.send_command("Contl_STOP_AQU")
                self.ser.close()
            # Update device status indicator
            if hasattr(self, 'device_status_text'):
                self.device_status_text.set_text('Device Status: Disconnected')
                self.device_status_text.set_color('red')
                if hasattr(self, 'fig'):
                    self.fig.canvas.draw_idle()
            print("Application closed")

        self.fig.canvas.mpl_connect('close_event', on_close)

        plt.show()

    def save_data_to_file(self, filename=None):
        """Save all collected data to a CSV file"""
        if filename is None:
            # Generate filename with timestamp
            timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
            filename = f"data_export_{timestamp}.csv"

        try:
            with self.data_lock:
                # Get all data
                time_array = list(self.all_time_data)
                data1_array = list(self.all_data1)
                data2_array = list(self.all_data2)
                data3_array = list(self.all_data3)

            if len(time_array) == 0:
                print("No data to save")
                return None

            # Write to CSV file
            with open(filename, 'w', newline='') as csvfile:
                writer = csv.writer(csvfile)
                # Write header
                writer.writerow(['Time (seconds)', 'Channel 1', 'Channel 2', 'Channel 3'])
                # Write data
                for i in range(len(time_array)):
                    writer.writerow([
                        f"{time_array[i]:.6f}",
                        f"{data1_array[i]:.6f}",
                        f"{data2_array[i]:.6f}",
                        f"{data3_array[i]:.6f}"
                    ])

            print(f"Data saved to {filename} ({len(time_array)} samples)")
            return filename
        except Exception as e:
            print(f"Error saving data to file: {e}")
            return None

    def stop(self):
        """Stop the real-time plotting"""
        self.running = False
        if self.ser and self.ser.is_open:
            self.send_command("Contl_STOP_AQU")
            self.ser.close()
            # Update device status indicator
            if hasattr(self, 'device_status_text'):
                self.device_status_text.set_text('Device Status: Disconnected')
                self.device_status_text.set_color('red')
                if hasattr(self, 'fig'):
                    self.fig.canvas.draw_idle()


if __name__ == "__main__":
    # Create and start the plotter
    plotter = RealTimePlotter(
        port=com_port,
        baudrate=115200,
        sample_rate=250,
        window_size=1000
    )

    try:
        plotter.start()
    except KeyboardInterrupt:
        print("\nStopping...")
        plotter.stop()
    except Exception as e:
        print(f"Error: {e}")
        plotter.stop()
