"""
Test script for device acquisition based on the working realtime_plotter_mac.py approach
This allows testing that the whole device acquisition system works properly.
"""

import time
import numpy as np
import matplotlib.pyplot as plt
import sys
import os

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from signal_processing.device_acquisition import DeviceAcquisition


def test_device_acquisition():
    """
    Test the device acquisition system with real-time plotting like in realtime_plotter_mac.py
    """
    print("Testing Device Acquisition System...")
    
    try:
        # Create device acquisition instance (matches parameters from realtime_plotter_mac.py)
        device = DeviceAcquisition(
            target_channels=3,
            fs=250,  # 250 Hz sampling rate
            verbose=True
        )
        
        print("Device acquisition initialized successfully!")
        print("Collecting data for 10 seconds...")
        
        # Collect and display data for 10 seconds
        start_time = time.time()
        sample_count = 0
        
        while time.time() - start_time < 10:  # Collect for 10 seconds
            # Read a small block of data
            samples = device.read_samples(num_samples=10, timeout=1.0)
            
            if samples.size > 0:
                sample_count += samples.shape[0]
                
                # Print some basic stats every second
                if sample_count % 250 == 0:  # Print every ~1 second of data
                    print(f"Collected {sample_count} samples from device")
                    print(f"  Sample shape: {samples.shape}")
                    print(f"  Channel 1 mean: {np.mean(samples[:, 0]):.2f}, std: {np.std(samples[:, 0]):.2f}")
                    print(f"  Channel 2 mean: {np.mean(samples[:, 1]):.2f}, std: {np.std(samples[:, 1]):.2f}")
                    print(f"  Channel 3 mean: {np.mean(samples[:, 2]):.2f}, std: {np.std(samples[:, 2]):.2f}")
            
            time.sleep(0.01)  # Small delay
        
        print(f"\nTest completed! Collected total: {sample_count} samples")
        print(f"Average sampling rate: {sample_count / 10:.2f} samples/second")
        
        # Test sending commands to the device (like in realtime_plotter_mac.py)
        print("\nTesting device commands...")
        device.send_command("Config_GAIN_08")  # Send gain command
        time.sleep(0.1)
        device.send_command("Oprate_NOR_OPR")  # Send normal operation command
        time.sleep(0.1)
        print("Commands sent successfully")
        
        device.stop()
        print("Device acquisition stopped successfully")
        
        return True
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_device_with_plotting():
    """
    Test the device acquisition with real-time plotting (similar to realtime_plotter_mac.py)
    """
    print("\nTesting Device Acquisition with Real-time Plotting...")
    
    try:
        from collections import deque
        import matplotlib.animation as animation
        from matplotlib.widgets import Button
        
        # Create device acquisition
        device = DeviceAcquisition(
            target_channels=3,
            fs=250,
            verbose=True
        )
        
        # Set up plotting parameters
        window_size = 1000  # 4 seconds at 250 Hz
        data1 = deque(maxlen=window_size)
        data2 = deque(maxlen=window_size)
        data3 = deque(maxlen=window_size)
        time_data = deque(maxlen=window_size)
        
        # Create plot
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10))
        fig.suptitle('Device Acquisition Test - Real-Time Data', fontsize=14, fontweight='bold')
        
        # Configure subplots
        ax1.set_ylabel('Amplitude (μV)', fontsize=10)
        ax1.set_title('Channel 1', fontsize=11)
        ax1.grid(True, alpha=0.3)
        
        ax2.set_ylabel('Amplitude (μV)', fontsize=10)
        ax2.set_title('Channel 2', fontsize=11)
        ax2.grid(True, alpha=0.3)
        
        ax3.set_ylabel('Amplitude (μV)', fontsize=10)
        ax3.set_xlabel('Time (seconds)', fontsize=10)
        ax3.set_title('Channel 3', fontsize=11)
        ax3.grid(True, alpha=0.3)
        
        # Initialize line objects
        line1, = ax1.plot([], [], 'b-', linewidth=1.5)
        line2, = ax2.plot([], [], 'r-', linewidth=1.5)
        line3, = ax3.plot([], [], 'g-', linewidth=1.5)
        
        def update_plot(frame):
            """Update the plot with new data"""
            # Read a small block of data from device
            samples = device.read_samples(num_samples=10, timeout=0.1)
            
            if samples.size > 0:
                current_time = time.time()
                
                for i in range(samples.shape[0]):
                    # Add data to deques
                    data1.append(samples[i, 0])
                    data2.append(samples[i, 1])
                    data3.append(samples[i, 2])
                    
                    # Calculate elapsed time
                    elapsed = current_time + i * (1.0/250)  # Approximate time per sample
                    time_data.append(elapsed)
            
            # Convert deques to arrays for plotting
            time_array = list(time_data)
            data1_array = list(data1)
            data2_array = list(data2)
            data3_array = list(data3)
            
            if len(time_array) > 0:
                # Update line data
                line1.set_data(time_array, data1_array)
                line2.set_data(time_array, data2_array)
                line3.set_data(time_array, data3_array)
                
                # Update axis limits
                time_min = min(time_array) if time_array else 0
                time_max = max(time_array) if time_array else 1
                time_range = time_max - time_min if time_max > time_min else 1.0
                
                # Set x-axis limits with some padding
                for ax in [ax1, ax2, ax3]:
                    ax.set_xlim(time_min - 0.05 * time_range, time_max + 0.05 * time_range)
                
                # Set y-axis limits for each channel
                if len(data1_array) > 0:
                    y1_min, y1_max = min(data1_array), max(data1_array)
                    y1_range = y1_max - y1_min if y1_max > y1_min else 1.0
                    ax1.set_ylim(y1_min - 0.1 * y1_range, y1_max + 0.1 * y1_range)
                
                if len(data2_array) > 0:
                    y2_min, y2_max = min(data2_array), max(data2_array)
                    y2_range = y2_max - y2_min if y2_max > y2_min else 1.0
                    ax2.set_ylim(y2_min - 0.1 * y2_range, y2_max + 0.1 * y2_range)
                
                if len(data3_array) > 0:
                    y3_min, y3_max = min(data3_array), max(data3_array)
                    y3_range = y3_max - y3_min if y3_max > y3_max else 1.0
                    ax3.set_ylim(y3_min - 0.1 * y3_range, y3_max + 0.1 * y3_range)
            
            return line1, line2, line3
        
        # Start animation
        ani = animation.FuncAnimation(
            fig,
            update_plot,
            interval=50,  # Update plot every 50ms
            blit=True,
            cache_frame_data=False
        )
        
        print("Real-time plotting started. Close the plot window to stop the test.")
        print("The test will run for 15 seconds automatically.")
        
        # Set timer to close automatically after 15 seconds
        timer = fig.canvas.new_timer(interval=15000)  # 15 seconds
        timer.single_shot = True
        timer.add_callback(lambda: plt.close('all'))
        
        # Handle window close event
        def on_close(event):
            device.stop()
            print("\nDevice acquisition stopped by user")
        
        fig.canvas.mpl_connect('close_event', on_close)
        timer.start()
        
        # Show plot
        plt.tight_layout()
        plt.show()
        
        # Stop device when done
        device.stop()
        print("Device acquisition stopped after plotting test")
        
        return True
        
    except Exception as e:
        print(f"Plotting test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("Running Device Acquisition Tests\n")
    
    # Run basic test
    success1 = test_device_acquisition()
    
    if success1:
        print("\n" + "="*50)
        print("Basic test passed! Running plotting test...\n")
        
        # Run plotting test
        success2 = test_device_with_plotting()
        
        if success2:
            print("\n" + "="*50)
            print("ALL TESTS PASSED! Device acquisition system is working properly.")
        else:
            print("\n" + "="*50)
            print("PLOTTING TEST FAILED! Check the error above.")
    else:
        print("\n" + "="*50)
        print("BASIC TEST FAILED! Check the error above.")