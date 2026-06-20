#!/usr/bin/env python3
"""
Production Mock Device - A realistic EEG data generator without external dependencies.
Generates natural-looking EEG signals with proper frequency bands and artifacts.
"""

import numpy as np
import time
import sys
from typing import List, Dict, Union
import os

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config_loader import get_mock_config

_MOCK_CFG = get_mock_config()
MAIN_CHANNELS = int(_MOCK_CFG.get('main_channels', 24))
EXTRA_CHANNELS = int(_MOCK_CFG.get('extra_channels', 0))
NUM_CHANNELS = MAIN_CHANNELS + EXTRA_CHANNELS
METADATA_SIZE = 6
debug_mode = bool(_MOCK_CFG.get('debug_mode', False))

def simple_logger(message):
    if debug_mode:
        print(f"Mock Log: {message}")

class Settings:
    def __init__(self):
        self.debug_mode = bool(_MOCK_CFG.get('debug_mode', False))
        self.test_signal = False
        self.sampling_rate = 250
        self.leadoff_mode = False
        self.gain = 24
        self.exgain = 24
        self.exchannels_on = [True] * EXTRA_CHANNELS
        self.linked_ear = False
        self.channels_on = [True] * NUM_CHANNELS  
        self.interaction = ['0'] * 4

    def __setattr__(self, name, value):
        if hasattr(self, 'debug_mode') and self.debug_mode:
            if hasattr(self, name):
                old_value = getattr(self, name)
                if old_value != value:
                    if name == 'channels_on':
                        simple_logger(f"Number of channels turned on changed from {sum(old_value)} to {sum(value)}")
                    elif name == 'exchannels_on':
                        simple_logger(f"Number of extra channels turned on changed from {sum(old_value)} to {sum(value)}")
                    else:
                        simple_logger(f"Setting {name} changed from {old_value} to {value}")
        super().__setattr__(name, value)

class ProductionMockDevice:
    """Production-ready mock device with realistic EEG data generation"""
    
    _port_in_use = False

    def __init__(self):
        self.debug_mode = False
        if self.debug_mode:
            simple_logger("Initializing Production Mock Device")
        
        self.connected = False
        self.gathering = False
        self.settings = Settings()
        self._sample_count = 0
        self._buffer = []
        self.device_id = 1
        self.user_input_keys = 0

        self.num_channels = NUM_CHANNELS
        self.total_samples = int(_MOCK_CFG.get('total_samples', 15000))
        
        # Initialize realistic EEG data generator
        self._init_eeg_generator()
        self.current_index = 0

        if self.debug_mode:
            simple_logger(f"Generated {self.total_samples} samples for {self.num_channels} channels")

    def _init_eeg_generator(self):
        """Initialize realistic EEG data generator with different brain regions"""
        
        # Channel mapping to brain regions
        self.channel_regions = {
            # Frontal channels - Alpha and Beta waves
            0: 'frontal',    # Ex1
            1: 'frontal',    # Ex2  
            2: 'frontal',    # Ex3
            3: 'frontal',    # Fp1
            4: 'frontal',    # Fp2
            5: 'frontal',    # F3
            6: 'frontal',    # F4
            13: 'frontal',   # F7
            14: 'frontal',   # F8
            
            # Central channels - Mu rhythm and Beta
            7: 'central',    # C3
            8: 'central',    # C4
            19: 'central',   # Cz
            
            # Parietal channels - Alpha and Theta
            9: 'parietal',   # P3
            10: 'parietal',  # P4
            21: 'parietal',  # Pz
            
            # Occipital channels - Strong Alpha
            11: 'occipital', # O1
            12: 'occipital', # O2
            
            # Temporal channels - Mixed frequencies
            15: 'temporal',  # T3
            16: 'temporal',  # T4
            17: 'temporal',  # T5
            18: 'temporal',  # T6
            
            # Reference channels - Lower amplitude
            22: 'reference', # A1
            23: 'reference', # A2
        }
        
        # EEG frequency bands (Hz)
        self.frequency_bands = {
            'delta': (0.5, 4),      # Deep sleep
            'theta': (4, 8),        # Drowsiness, meditation
            'alpha': (8, 13),       # Relaxed, eyes closed
            'beta': (13, 30),       # Active thinking, concentration
            'gamma': (30, 100)      # High cognitive processing
        }
        
        # Brain region characteristics (amplitudes in microvolts)
        self.region_profiles = {
            'frontal': {
                'alpha_amp': 30,      # Increased for realism
                'beta_amp': 50,       # Increased for realism
                'theta_amp': 20,
                'gamma_amp': 15,
                'delta_amp': 10
            },
            'central': {
                'alpha_amp': 40,
                'beta_amp': 30,
                'theta_amp': 25,
                'gamma_amp': 20,
                'delta_amp': 12,
                'mu_amp': 60  # Mu rhythm (8-12 Hz) - stronger
            },
            'parietal': {
                'alpha_amp': 70,      # Strong alpha in parietal
                'beta_amp': 35,
                'theta_amp': 30,
                'gamma_amp': 18,
                'delta_amp': 15
            },
            'occipital': {
                'alpha_amp': 100,     # Very strong alpha in occipital
                'beta_amp': 25,
                'theta_amp': 35,
                'gamma_amp': 15,
                'delta_amp': 18
            },
            'temporal': {
                'alpha_amp': 35,
                'beta_amp': 45,
                'theta_amp': 25,
                'gamma_amp': 20,
                'delta_amp': 12
            },
            'reference': {
                'alpha_amp': 10,
                'beta_amp': 8,
                'theta_amp': 5,
                'gamma_amp': 3,
                'delta_amp': 2
            }
        }
        
        # Generate realistic EEG data
        self.loaded_data = self._generate_realistic_eeg_data()
    
    def _generate_realistic_eeg_data(self):
        """Generate realistic EEG data with proper frequency content and natural variations"""
        
        # Use longer duration for better frequency resolution and natural variations
        duration = 10.0  # seconds - longer for more natural variations
        fs = int(_MOCK_CFG.get('sampling_rate', self.settings.sampling_rate))
        self.settings.sampling_rate = fs
        num_samples = int(fs * duration)
        t = np.linspace(0, duration, num_samples)
        dt = 1.0 / fs
        
        # Initialize data array
        eeg_data = np.zeros((num_samples, NUM_CHANNELS))
        
        # Generate shared phase relationships for correlated channels
        shared_phases = {}
        for region in ['frontal', 'central', 'parietal', 'occipital', 'temporal']:
            shared_phases[region] = {
                'alpha': np.random.uniform(0, 2 * np.pi),
                'beta': np.random.uniform(0, 2 * np.pi),
                'theta': np.random.uniform(0, 2 * np.pi),
                'gamma': np.random.uniform(0, 2 * np.pi),
                'delta': np.random.uniform(0, 2 * np.pi)
            }
        
        # Generate data for each channel
        for ch in range(NUM_CHANNELS):
            region = self.channel_regions.get(ch, 'frontal')
            profile = self.region_profiles[region]
            
            # Initialize channel signal
            signal = np.zeros(num_samples)
            
            # Generate frequency-modulated signals with amplitude envelopes
            # This creates more natural, non-stationary signals
            
            # Delta waves (0.5-4 Hz) - slow, large amplitude variations
            delta_base_freq = np.random.uniform(1.0, 2.5)
            delta_freq_mod = 0.3 * np.sin(2 * np.pi * 0.1 * t)  # Slow frequency modulation
            delta_freq = delta_base_freq + delta_freq_mod
            delta_phase = np.cumsum(2 * np.pi * delta_freq * dt)
            delta_amp_mod = 1.0 + 0.3 * np.sin(2 * np.pi * 0.05 * t)  # Amplitude modulation
            signal += profile.get('delta_amp', 10) * delta_amp_mod * np.sin(delta_phase + shared_phases[region]['delta'])
            
            # Theta waves (4-8 Hz) - drowsiness, meditation
            theta_base_freq = np.random.uniform(5.0, 7.0)
            theta_freq_mod = 0.5 * np.sin(2 * np.pi * 0.15 * t)
            theta_freq = theta_base_freq + theta_freq_mod
            theta_phase = np.cumsum(2 * np.pi * theta_freq * dt)
            theta_amp_mod = 1.0 + 0.4 * np.sin(2 * np.pi * 0.08 * t)
            signal += profile['theta_amp'] * theta_amp_mod * np.sin(theta_phase + shared_phases[region]['theta'])
            
            # Alpha waves (8-13 Hz) - relaxed, eyes closed
            alpha_base_freq = np.random.uniform(9.0, 11.5)
            alpha_freq_mod = 0.8 * np.sin(2 * np.pi * 0.2 * t)
            alpha_freq = alpha_base_freq + alpha_freq_mod
            alpha_phase = np.cumsum(2 * np.pi * alpha_freq * dt)
            # Alpha amplitude varies more (waxing and waning)
            alpha_amp_mod = 1.0 + 0.6 * np.sin(2 * np.pi * 0.12 * t) + 0.3 * np.sin(2 * np.pi * 0.25 * t)
            signal += profile['alpha_amp'] * alpha_amp_mod * np.sin(alpha_phase + shared_phases[region]['alpha'])
            
            # Mu rhythm (8-12 Hz) - central channels only
            if region == 'central':
                mu_base_freq = np.random.uniform(9.5, 11.0)
                mu_freq_mod = 0.6 * np.sin(2 * np.pi * 0.18 * t)
                mu_freq = mu_base_freq + mu_freq_mod
                mu_phase = np.cumsum(2 * np.pi * mu_freq * dt)
                mu_amp_mod = 1.0 + 0.5 * np.sin(2 * np.pi * 0.1 * t)
                signal += profile['mu_amp'] * mu_amp_mod * np.sin(mu_phase + shared_phases[region]['alpha'] * 0.7)
            
            # Beta waves (13-30 Hz) - active thinking, concentration
            # Multiple beta components for richness
            for beta_idx in range(3):  # Low, mid, high beta
                beta_freq_range = [(13, 18), (18, 23), (23, 30)][beta_idx]
                beta_base_freq = np.random.uniform(beta_freq_range[0], beta_freq_range[1])
                beta_freq_mod = 1.0 * np.sin(2 * np.pi * (0.3 + beta_idx * 0.1) * t)
                beta_freq = beta_base_freq + beta_freq_mod
                beta_phase = np.cumsum(2 * np.pi * beta_freq * dt)
                beta_amp_mod = 1.0 + 0.3 * np.sin(2 * np.pi * (0.15 + beta_idx * 0.05) * t)
                beta_amp = profile['beta_amp'] / 3.0  # Divide amplitude across components
                signal += beta_amp * beta_amp_mod * np.sin(beta_phase + shared_phases[region]['beta'] + beta_idx * 0.5)
            
            # Gamma waves (30-100 Hz) - high cognitive processing
            # Multiple gamma components
            for gamma_idx in range(2):
                gamma_freq_range = [(30, 50), (50, 80)][gamma_idx]
                gamma_base_freq = np.random.uniform(gamma_freq_range[0], gamma_freq_range[1])
                gamma_freq_mod = 2.0 * np.sin(2 * np.pi * (0.4 + gamma_idx * 0.2) * t)
                gamma_freq = gamma_base_freq + gamma_freq_mod
                gamma_phase = np.cumsum(2 * np.pi * gamma_freq * dt)
                gamma_amp_mod = 1.0 + 0.2 * np.sin(2 * np.pi * (0.2 + gamma_idx * 0.1) * t)
                gamma_amp = profile['gamma_amp'] / 2.0
                signal += gamma_amp * gamma_amp_mod * np.sin(gamma_phase + shared_phases[region]['gamma'] + gamma_idx * 0.3)
            
            # Add 1/f noise (pink noise) - more realistic than white noise
            # Generate pink noise by filtering white noise
            white_noise = np.random.normal(0, 1, num_samples)
            # Simple 1/f approximation using frequency domain
            freqs = np.fft.fftfreq(num_samples, dt)
            fft_noise = np.fft.fft(white_noise)
            # Apply 1/sqrt(f) filter (avoid division by zero)
            with np.errstate(divide='ignore', invalid='ignore'):
                pink_filter = 1.0 / np.sqrt(np.abs(freqs) + 0.01)
                pink_filter[0] = 0  # Remove DC component
            fft_pink = fft_noise * pink_filter
            pink_noise = np.real(np.fft.ifft(fft_pink))
            # Normalize and scale
            pink_noise = pink_noise / np.std(pink_noise) * np.random.uniform(2, 5)
            signal += pink_noise
            
            # Add white noise component (electrode noise, amplifier noise)
            white_noise_level = np.random.uniform(1, 2)
            signal += np.random.normal(0, white_noise_level, num_samples)
            
            # Add realistic artifacts
            # Eye blinks (frontal channels) - slow, large amplitude
            if region == 'frontal':
                blink_times = np.random.poisson(0.02 * duration)  # ~2 blinks per 10 seconds
                for _ in range(blink_times):
                    blink_time = np.random.uniform(0.5, duration - 0.5)
                    blink_idx = int(blink_time * fs)
                    if 0 < blink_idx < num_samples - 1:
                        # Eye blink: slow rise, fast fall (exponential)
                        blink_duration = int(0.4 * fs)  # 400ms
                        blink_envelope = np.exp(-np.linspace(0, 3, blink_duration))
                        blink_envelope = blink_envelope / np.max(blink_envelope)
                        blink_amp = np.random.uniform(80, 150)
                        start_idx = max(0, blink_idx - blink_duration // 2)
                        end_idx = min(num_samples, start_idx + blink_duration)
                        actual_duration = end_idx - start_idx
                        if actual_duration > 0:
                            signal[start_idx:end_idx] += blink_amp * blink_envelope[:actual_duration]
            
            # Muscle artifacts (temporal channels) - fast, high frequency
            if region == 'temporal':
                muscle_times = np.random.poisson(0.03 * duration)
                for _ in range(muscle_times):
                    muscle_time = np.random.uniform(0.5, duration - 0.5)
                    muscle_idx = int(muscle_time * fs)
                    if 0 < muscle_idx < num_samples - 1:
                        muscle_duration = int(0.2 * fs)  # 200ms
                        muscle_freq = np.random.uniform(50, 100)
                        muscle_phase = np.cumsum(2 * np.pi * muscle_freq * dt)
                        muscle_envelope = np.exp(-np.linspace(0, 5, muscle_duration))
                        muscle_amp = np.random.uniform(40, 80)
                        start_idx = max(0, muscle_idx - muscle_duration // 2)
                        end_idx = min(num_samples, start_idx + muscle_duration)
                        actual_duration = end_idx - start_idx
                        if actual_duration > 0:
                            muscle_signal = muscle_amp * muscle_envelope[:actual_duration] * np.sin(muscle_phase[:actual_duration])
                            signal[start_idx:end_idx] += muscle_signal
            
            # Movement artifacts (all channels, less frequent)
            if np.random.random() < 0.1:  # 10% chance per channel
                movement_time = np.random.uniform(1.0, duration - 1.0)
                movement_idx = int(movement_time * fs)
                if 0 < movement_idx < num_samples - 1:
                    movement_duration = int(0.5 * fs)  # 500ms
                    movement_amp = np.random.uniform(30, 60)
                    movement_envelope = np.exp(-np.linspace(0, 4, movement_duration))
                    start_idx = max(0, movement_idx - movement_duration // 2)
                    end_idx = min(num_samples, start_idx + movement_duration)
                    actual_duration = end_idx - start_idx
                    if actual_duration > 0:
                        signal[start_idx:end_idx] += movement_amp * movement_envelope[:actual_duration] * np.random.choice([-1, 1])
            
            # Apply slow DC drift (baseline wander)
            dc_drift = np.cumsum(np.random.normal(0, 0.1, num_samples))
            signal += dc_drift
            
            # Apply gain (convert to device units)
            gain = int(_MOCK_CFG.get('gain', self.settings.gain))
            signal *= gain
            
            # Store in data array
            eeg_data[:, ch] = signal
        
        # Repeat data to reach total_samples if needed
        if num_samples < self.total_samples:
            repeats = int(np.ceil(self.total_samples / num_samples))
            eeg_data = np.tile(eeg_data, (repeats, 1))
            eeg_data = eeg_data[:self.total_samples, :]
        
        if self.debug_mode:
            simple_logger(f"Generated realistic EEG data: {eeg_data.shape}")
            simple_logger(f"Signal range: {np.min(eeg_data):.2f} to {np.max(eeg_data):.2f}")
        
        return eeg_data.astype(np.float64)

    def connect(self) -> bool:
        print("---------Connecting to production mock device")
        if ProductionMockDevice._port_in_use:
            if self.debug_mode:
                simple_logger("Cannot connect - port already in use")
            return False
            
        if self.debug_mode:
            simple_logger("Device connected")
        ProductionMockDevice._port_in_use = True
        self.connected = True
        simple_logger("Device connected successfully")
        return True

    def disconnect(self) -> None:
        self.connected = False
        self.gathering = False
        ProductionMockDevice._port_in_use = False
        simple_logger("Device disconnected")

    def set(self, settings: Settings) -> bool:
        if ProductionMockDevice._port_in_use and not self.connected:
            if self.debug_mode:
                simple_logger("Error configuring device: The port is already open.")
            return False
            
        if self.debug_mode:
            simple_logger("Applying new settings")
        self.settings = settings
        return True

    def start(self) -> bool:
        if self.debug_mode:
            simple_logger("Attempting to start data acquisition")
        status = self.getStatus()
        if not status or not status.get('connected', False):
            if self.debug_mode:
                simple_logger("Cannot start - device not connected")
            return False
        if self.total_samples == 0:
            self.debug("No data loaded to start acquisition.")
            if self.debug_mode:
                simple_logger("Cannot start - no data loaded")
            return False
        self.gathering = True
        if self.debug_mode:
            simple_logger("Data acquisition started successfully")
        return True
    
    def stop(self) -> bool:
        self.gathering = False
        self.disconnect()
        return True

    def updateStatus(self):
        """Update internal status values"""
        max_buffer_size = self.settings.sampling_rate * 2
        self._buffer = self._buffer[-max_buffer_size:] if len(self._buffer) > max_buffer_size else self._buffer
        
        self._sample_count = self.current_index
        self._mode = self.gathering
        self._connected = self.connected and time.time() % 300 != 0
        self._buffer_len = len(self._buffer)
        
    def getStatus(self) -> Dict[str, Union[bool, int]]:
        self.updateStatus()
        
        status = {
            "mode": self._mode,
            "cnt": self._sample_count,
            "buff_len": self._buffer_len,
            "connected": self._connected
        }
        return status

    def getData(self, num_samples: int = 0) -> Union[List[List[float]], bool]:
        if not self.gathering or self.total_samples == 0:
            if self.debug_mode:
                simple_logger("Cannot get data - device not gathering or no samples available")
            return False

        samples_per_second = self.settings.sampling_rate
        if samples_per_second <= 0:
            if self.debug_mode:
                simple_logger("Invalid sampling rate")
            return False

        num_samples_to_get = max(1, num_samples)

        # Ensure we don't exceed total samples
        if self.current_index + num_samples_to_get > self.total_samples:
            self.current_index = 0

        # Timing control for realistic sampling
        BASE_JITTER = float(_MOCK_CFG.get('timing', {}).get('base_jitter', 0.05))
        DRIFT_FACTOR = float(_MOCK_CFG.get('timing', {}).get('drift_factor', 0.98))
        MIN_SLEEP_FRACTION = float(_MOCK_CFG.get('timing', {}).get('min_sleep_fraction', 0.9))

        target_interval = 1.0 / samples_per_second
        actual_interval = target_interval * DRIFT_FACTOR
        combined_data = []

        if not hasattr(self, 'next_sample_time'):
            self.next_sample_time = time.perf_counter()

        for sample_num in range(num_samples_to_get):
            # Wait until it's time for the next sample
            current_time = time.perf_counter()
            sleep_duration = self.next_sample_time - current_time
            
            if sleep_duration > 0:
                remaining = sleep_duration
                while remaining > 0:
                    time.sleep(max(0, remaining * MIN_SLEEP_FRACTION))
                    remaining = self.next_sample_time - time.perf_counter()

            # Create sample with metadata + channel data
            sample = [0.0] * (METADATA_SIZE + NUM_CHANNELS)
            
            # Fill metadata positions
            sample[0] = self._sample_count
            sample[1] = self._sample_count % 256
            sample[2] = 0
            sample[3] = self.device_id
            sample[4] = self.user_input_keys
            sample[5] = 0

            # Fill channel data with realistic EEG data
            for i in range(NUM_CHANNELS):
                if bool(_MOCK_CFG.get('leadoff_mode', self.settings.leadoff_mode)):
                    # Lead-off mode - use fixed voltages
                    sample_voltages = [-0.001, -0.5, -5.0, -1500.584, -2777.712, -3873.656,
                                     15968.696, 25688.2, 346459.872, 562034.168, 766023.032,
                                     1019052.656, 1884576.0, 2868464.0, -1597.632, 12899.4,
                                     33551.152, 52788.808, -237294.896, -414274.592, -714982.544,
                                     -937069.408, -0.104, -0.752]
                    sample[i + METADATA_SIZE] = sample_voltages[i] if i < len(sample_voltages) else 0.0
                else:
                    # Normal mode - use realistic EEG data
                    sample[i + METADATA_SIZE] = self.loaded_data[self.current_index, i]

            # Add to buffer
            self._buffer.append(sample)
            combined_data.append(sample)
            
            # Update counts
            self.current_index += 1
            self._sample_count += 1
            if self.current_index >= self.total_samples:
                self.current_index = 0

            # Calculate next sample time with realistic jitter
            jitter = np.random.uniform(-BASE_JITTER, BASE_JITTER)
            self.next_sample_time += actual_interval * (1 + jitter)

        # Reset timing if we've fallen too far behind
        if time.perf_counter() > self.next_sample_time + actual_interval * 3:
            self.next_sample_time = time.perf_counter() + actual_interval

        # Update buffer
        max_buffer_size = self.settings.sampling_rate * 100
        if len(self._buffer) > max_buffer_size:
            self._buffer = self._buffer[-max_buffer_size:]

        return combined_data if combined_data else False

    def debug(self, message: str) -> None:
        if self.debug_mode:
            simple_logger(f"Debug - {message}")


# Alias for compatibility
Device = ProductionMockDevice


def main():
    """Test the production mock device"""
    print("Testing Production Mock Device")
    print("=" * 35)
    
    device = ProductionMockDevice()
    settings = Settings()
    settings.sampling_rate = 250
    
    if device.connect():
        device.set(settings)
        if device.start():
            print("✓ Production mock device connected and started!")
            
            # Get a few samples to test
            print("\nGetting 5 samples...")
            for i in range(5):
                data = device.getData(1)
                if data:
                    sample = data[0]
                    print(f"Sample {i+1}: {len(sample)} values")
                    # Show channels 6-11 (EEG channels)
                    eeg_channels = sample[6:12]
                    print(f"  EEG channels 6-11: {[f'{x:.2f}' for x in eeg_channels]}")
                time.sleep(0.1)
            
            device.stop()
        else:
            print("✗ Failed to start device")
    else:
        print("✗ Failed to connect to device")
    
    print("\nTest completed!")


if __name__ == "__main__":
    main()
