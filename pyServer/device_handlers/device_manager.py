#!/usr/bin/env python3
"""
Clean Device Manager - A simple device manager without PyQt5 and logger dependencies.
Handles device detection and fallback to mock device automatically.
"""

import os
import sys
import traceback
from typing import Tuple, Type, Optional

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config_loader import get_device_config, get_mock_config, expand_search_paths


class CleanDeviceManager:
    """Simple device manager that handles real device or falls back to mock device"""
    
    def __init__(self):
        self.device = None
        self.settings = None
        self.using_mock = False
        self.config = get_device_config()
        
    def _try_load_real_device(self) -> Tuple[Type, Type]:
# Try to import pythonnet for real device support
        import clr
        PYTHONNET_AVAILABLE = True

        """Try to load the real I8 device"""
        if not PYTHONNET_AVAILABLE:
            raise ImportError("pythonnet not available")
        
        print("Searching for real device DLL...")
        
        # Search paths for the DLL from config
        device_cfg = get_device_config()
        dll_name = device_cfg.get('dll_name', 'I8Library1.dll')
        search_paths = expand_search_paths(device_cfg.get('dll_search_paths', [os.path.dirname(__file__), os.getcwd()]))
        
        dll_found = False
        dll_path = None

        for base_path in search_paths:
            if not os.path.exists(base_path):
                continue

            # Look for configured DLL (with Windows-specific extension)
            dll_file = os.path.join(base_path, dll_name)
            if os.path.exists(dll_file):
                dll_path = dll_file
                dll_found = True
                print(f"Found DLL at: {dll_path}")
                break

        if not dll_found:
            raise FileNotFoundError(f"{dll_name} not found in search paths")

        # Load the DLL
        try:
            clr.AddReference(dll_path)
            from I8Library1 import I8Device
            print("Successfully loaded real device DLL")
            return I8Device, None
        except Exception as e:
            raise RuntimeError(f"Failed to load DLL: {e}")
    
    def initialize_device(self) -> bool:
        """Initialize device - try real device first, fallback to mock"""
        print("=" * 50)
        print("INITIALIZING DEVICE")
        print("=" * 50)
        
        device_mode = str(get_device_config().get('mode', 'Auto')).lower()
        print(f"Device mode: {device_mode}")
        
        # Force demo mode if configured
        if device_mode == 'demo':
            print("Demo mode configured - using mock device")
            return self._initialize_mock_device()
        
        # Try real device first (unless demo mode is forced)
        if device_mode in ['auto', 'real']:
            try:
                print("Attempting to connect to real device...")
                DeviceClass, _ = self._try_load_real_device()
                
                # Create device instance
                self.device = DeviceClass()
                
                # Test connection
                status = self.device.getStatus()
                if status:
                    print("✓ Real device connected successfully!")
                    self.using_mock = False
                    return True
                else:
                    print("✗ Real device status check failed")
                    
            except Exception as e:
                print(f"✗ Failed to connect to real device: {e}")
        
        # Fall back to mock device
        print("Falling back to demo device...")
        return self._initialize_mock_device()
    
    def _initialize_mock_device(self) -> bool:
        """Initialize mock device"""
        try:
            # Import production mock device
            from device_handlers.mock_device import Device, Settings
            
            print("Initializing demo device...")
            self.device = Device()
            self.settings = Settings()
            mock_cfg = get_mock_config()
            self.settings.sampling_rate = int(mock_cfg.get('sampling_rate', 250))
            # Optional settings
            if hasattr(self.settings, 'gain'):
                self.settings.gain = int(mock_cfg.get('gain', getattr(self.settings, 'gain', 24)))
            if hasattr(self.settings, 'exgain'):
                self.settings.exgain = int(mock_cfg.get('exgain', getattr(self.settings, 'exgain', 24)))
            if hasattr(self.settings, 'leadoff_mode'):
                self.settings.leadoff_mode = bool(mock_cfg.get('leadoff_mode', getattr(self.settings, 'leadoff_mode', False)))
            
            # Connect and start the device
            if self.device.connect():
                self.device.set(self.settings)
                if self.device.start():
                    print("✓ Demo device connected successfully!")
                    self.using_mock = True
                    return True
                else:
                    print("✗ Failed to start demo device")
            else:
                print("✗ Failed to connect to demo device")
                
        except Exception as e:
            print(f"✗ Failed to initialize demo device: {e}")
            traceback.print_exc()
        
        return False
    
    def get_device(self):
        """Get the initialized device"""
        return self.device
    
    def get_settings(self):
        """Get the device settings"""
        return self.settings
    
    def is_mock_device(self) -> bool:
        """Check if using mock device"""
        return self.using_mock
    
    def stop(self):
        """Stop the device"""
        if self.device:
            try:
                if hasattr(self.device, 'stop'):
                    self.device.stop()
                if hasattr(self.device, 'disconnect'):
                    self.device.disconnect()
                print("Device stopped")
            except Exception as e:
                print(f"Error stopping device: {e}")



def main():
    """Test the device manager"""
    print("Testing Clean Device Manager")
    print("=" * 30)
    
    try:
        manager = CleanDeviceManager()
        success = manager.initialize_device()
        
        if success:
            print(f"\n✓ Device initialized successfully!")
            print(f"Using mock device: {manager.is_mock_device()}")
            print(f"Device type: {type(manager.get_device()).__name__}")
        else:
            print("\n✗ Failed to initialize device")
            
    except Exception as e:
        print(f"\n✗ Error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    main()
