#!/usr/bin/env python3
"""
EEG Data Collector - A simple data collection system that saves EEG data to CSV.
Uses the clean device manager to handle device detection and fallback.
"""

import time
import csv
import os
import sys
import numpy as np
import threading
from datetime import datetime
from typing import Optional

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from device_handlers.device_manager import CleanDeviceManager
from config_loader import get_collector_config

class EEGDataCollector:
    """Simple EEG data collector that saves data to CSV"""
    
    def __init__(self, sampling_rate: int = None, csv_filename: Optional[str] = None):
        collector_cfg = get_collector_config()
        self.sampling_rate = int(collector_cfg.get('sampling_rate', 250) if sampling_rate is None else sampling_rate)
        self.device_manager = CleanDeviceManager()
        self.device = None
        self.settings = None
        self.running = False
        self.csv_file = None
        self.csv_writer = None
        self.channel_labels = []
        self.num_channels = 24
        
        # Setup CSV file
        if csv_filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            csv_prefix = str(collector_cfg.get('csv_prefix', 'eeg_data_'))
            csv_filename = f"{csv_prefix}{timestamp}.csv"
        
        self.csv_filename = csv_filename
        self._setup_csv_file()
        
        # Channel labels (24 channels from the device)
        self.channel_labels = list(collector_cfg.get('channel_labels', [
            'Ex1', 'Ex2', 'Ex3', 'Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4',
            'P3', 'P4', 'O1', 'O2', 'F7', 'F8', 'T3', 'T4', 'T5', 'T6',
            'Cz', 'Fz', 'Pz', 'A1', 'A2'
        ]))
        
        print(f"EEG Data Collector initialized")
        print(f"Sampling rate: {self.sampling_rate} Hz")
        print(f"CSV file: {csv_filename}")
        print(f"Channels: {self.num_channels}")
    
    def _setup_csv_file(self):
        """Setup CSV file with headers"""
        try:
            # Create data directory if it doesn't exist
            cfg = get_collector_config()
            data_dir = str(cfg.get('data_dir'))
            if not os.path.exists(data_dir):
                os.makedirs(data_dir)
                print(f"Created data directory: {data_dir}")
            
            # Full path to CSV file
            csv_path = os.path.join(data_dir, self.csv_filename)
            
            # Open CSV file
            self.csv_file = open(csv_path, 'w', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file)
            
            # Write headers
            headers = ["timestamp", "sample_number"] + self.channel_labels
            self.csv_writer.writerow(headers)
            self.csv_file.flush()
            
            print(f"CSV file created: {csv_path}")
            
        except Exception as e:
            print(f"Error setting up CSV file: {e}")
            self.csv_file = None
            self.csv_writer = None
    
    def initialize_device(self) -> bool:
        """Initialize the device using the device manager"""
        print("\nInitializing device...")
        success = self.device_manager.initialize_device()
        
        if success:
            self.device = self.device_manager.get_device()
            self.settings = self.device_manager.get_settings()
            print(f"✓ Device ready - Using mock: {self.device_manager.is_mock_device()}")
            return True
        else:
            print("✗ Failed to initialize device")
            return False
    
    def _process_device_data(self, raw_data) -> Optional[np.ndarray]:
        """Process raw device data and extract EEG channels"""
        try:
            if raw_data is False or raw_data is None:
                return None
            
            # Convert to numpy array
            if not isinstance(raw_data, np.ndarray):
                data_array = np.array(raw_data, dtype=np.float64)
            else:
                data_array = raw_data.astype(np.float64)
            
            # Handle different data formats
            if data_array.ndim == 1:
                # Single sample - reshape to (1, channels)
                data_array = data_array.reshape(1, -1)
            
            # Extract EEG channels (typically channels 6-30, which is indices 6-29)
            if data_array.shape[1] >= 30:
                # Full device data - extract channels 6-30 (24 channels)
                eeg_data = data_array[:, 6:30]
            elif data_array.shape[1] == 24:
                # Already EEG channels only
                eeg_data = data_array
            else:
                print(f"Warning: Unexpected data shape: {data_array.shape}")
                return None
            
            return eeg_data
            
        except Exception as e:
            print(f"Error processing device data: {e}")
            return None
    
    def _save_data_to_csv(self, eeg_data: np.ndarray, timestamp: str, sample_number: int):
        """Save EEG data to CSV file"""
        if self.csv_writer is None:
            return
        
        try:
            # Save each sample as a row
            for i in range(eeg_data.shape[0]):
                row = [timestamp, sample_number + i]
                
                # Add channel data
                for j in range(min(eeg_data.shape[1], self.num_channels)):
                    row.append(f"{eeg_data[i, j]:.6f}")
                
                # Pad with zeros if we have fewer channels
                while len(row) < 2 + self.num_channels:
                    row.append("0.000000")
                
                self.csv_writer.writerow(row)
            
            # Flush to disk periodically
            if sample_number % 100 == 0:
                self.csv_file.flush()
                
        except Exception as e:
            print(f"Error saving data to CSV: {e}")
    
    def collect_data(self, duration_seconds: int = 10):
        """Collect EEG data for specified duration"""
        if not self.device:
            print("Device not initialized!")
            return False
        
        print(f"\nStarting data collection for {duration_seconds} seconds...")
        print("Press Ctrl+C to stop early")
        print("-" * 50)
        
        self.running = True
        start_time = time.time()
        sample_number = 0
        
        try:
            while self.running and (time.time() - start_time) < duration_seconds:
                # Get data from device
                raw_data = self.device.getData(1)  # Get 1 sample
                
                if raw_data is not False:
                    # Process the data
                    eeg_data = self._process_device_data(raw_data)
                    
                    if eeg_data is not None:
                        # Create timestamp
                        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                        
                        # Save to CSV
                        self._save_data_to_csv(eeg_data, timestamp, sample_number)
                        
                        # Print progress
                        print_every = int(get_collector_config().get('print_every_n_samples', 50))
                        if sample_number % print_every == 0:
                            elapsed = time.time() - start_time
                            print(f"[{timestamp}] Sample {sample_number}, Elapsed: {elapsed:.1f}s")
                        
                        sample_number += eeg_data.shape[0]
                
                # Small delay to prevent overwhelming the device
                time.sleep(0.001)
                
        except KeyboardInterrupt:
            print("\nData collection interrupted by user")
        except Exception as e:
            print(f"Error during data collection: {e}")
        finally:
            self.running = False
            elapsed_time = time.time() - start_time
            print(f"\nData collection completed!")
            print(f"Total samples collected: {sample_number}")
            print(f"Duration: {elapsed_time:.1f} seconds")
            print(f"Average sampling rate: {sample_number/elapsed_time:.1f} Hz")
    
    def stop(self):
        """Stop data collection and cleanup"""
        print("Stopping data collection...")
        self.running = False
        
        # Close CSV file
        if self.csv_file:
            try:
                self.csv_file.flush()
                self.csv_file.close()
                print(f"Data saved to: {self.csv_filename}")
            except Exception as e:
                print(f"Error closing CSV file: {e}")
        
        # Stop device
        self.device_manager.stop()


def main():
    """Main function to run data collection"""
    print("EEG Data Collector")
    print("=================")
    
    try:
        # Create collector
        cfg = get_collector_config()
        collector = EEGDataCollector(sampling_rate=int(cfg.get('sampling_rate', 250)))
        
        # Initialize device
        if not collector.initialize_device():
            print("Failed to initialize device. Exiting.")
            return 1
        
        # Collect data for 30 seconds (you can change this)
        collector.collect_data(duration_seconds=int(cfg.get('duration_seconds', 30)))
        
        # Stop and cleanup
        collector.stop()
        
        print("\n✓ Data collection completed successfully!")
        return 0
        
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        return 0
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
