"""
Features Module

Clean implementation for extracting features from EEG data.
"""

import numpy as np
from scipy import signal
from typing import Tuple, Dict, Union, Optional, List
from signal_processing.config import cfg


def compute_features(x_bp, fs, bands, return_amplitude: bool = True):
    """
    Compute band amplitudes/powers for all frequency bands using welch_bandpower.
    x_bp: preprocessed EEG data (samples, channels)
    fs: sampling frequency
    bands: dict of {band_name: (low_freq, high_freq, channel_index) or
                   {"numerator": band_name, "denominator": band_name, "numerator_channel": channel_idx, "denominator_channel": channel_idx} or
                   {"numerator": band_name, "denominator": band_name}}
    return_amplitude: if True, return amplitude (µV) instead of power (µV²)
                     Amplitude is the standard unit used in neurofeedback apps
    """
    features = {}

    # First compute all regular band powers
    regular_bands = {}
    ratio_bands = {}

    for name, config in bands.items():
        if isinstance(config, dict) and "numerator" in config and "denominator" in config:
            # This is a ratio band
            ratio_bands[name] = config
        elif isinstance(config, (tuple, list)) and len(config) >= 2:
            # This is a regular frequency band - can have optional channel index
            regular_bands[name] = config

    # Calculate regular bands first
    # We need to pre-compute all single-channel features to use in ratios
    single_channel_features = {}

    for name, config in regular_bands.items():
        if len(config) >= 3:  # Has channel index as the third element
            low, high, channel_idx = config[0], config[1], config[2]
            # Extract data from specific channel if index is valid
            if 0 <= channel_idx < x_bp.shape[1]:
                channel_data = x_bp[:, channel_idx:channel_idx+1]
                single_channel_features[f"{name}_ch{channel_idx}"] = welch_bandpower(channel_data, fs=fs, band=(low, high), return_amplitude=return_amplitude)
                # For the main feature, store the single channel result if channel was specified
                features[name] = welch_bandpower(channel_data, fs=fs, band=(low, high), return_amplitude=return_amplitude)
            else:
                # Channel index out of bounds, use all channels
                features[name] = welch_bandpower(x_bp, fs=fs, band=(low, high), return_amplitude=return_amplitude)
        else:  # Only frequency range provided, use all channels
            low, high = config[:2]
            features[name] = welch_bandpower(x_bp, fs=fs, band=(low, high), return_amplitude=return_amplitude)

    # Calculate ratio bands from the computed regular bands
    for name, config in ratio_bands.items():
        numerator_name = config["numerator"]
        denominator_name = config["denominator"]

        # Determine which channels to use for numerator and denominator
        numerator_channel = config.get("numerator_channel")
        denominator_channel = config.get("denominator_channel")

        # Get the band definitions to access their frequency ranges
        numerator_config = bands.get(numerator_name)
        denominator_config = bands.get(denominator_name)

        numerator_values = None
        denominator_values = None

        # Get numerator values
        if numerator_channel is not None and numerator_config:
            # Use specific channel for numerator
            # The numerator_config could be (low, high, channel_idx) or (low, high)
            if isinstance(numerator_config, (tuple, list)) and len(numerator_config) >= 2:
                if len(numerator_config) >= 3:  # Has channel index
                    low, high, _ = numerator_config[0], numerator_config[1], numerator_config[2]
                else:  # Only frequency range
                    low, high = numerator_config[0], numerator_config[1]

                # Use the specifically requested channel for numerator, not the one in numerator_config
                if 0 <= numerator_channel < x_bp.shape[1]:
                    channel_data = x_bp[:, numerator_channel:numerator_channel+1]
                    numerator_values = welch_bandpower(channel_data, fs=fs, band=(low, high), return_amplitude=return_amplitude)
        elif numerator_name in features:
            # Use all channels for numerator as computed earlier
            numerator_values = features[numerator_name]

        # Get denominator values
        if denominator_channel is not None and denominator_config:
            # Use specific channel for denominator
            # The denominator_config could be (low, high, channel_idx) or (low, high)
            if isinstance(denominator_config, (tuple, list)) and len(denominator_config) >= 2:
                if len(denominator_config) >= 3:  # Has channel index
                    low, high, _ = denominator_config[0], denominator_config[1], denominator_config[2]
                else:  # Only frequency range
                    low, high = denominator_config[0], denominator_config[1]

                # Use the specifically requested channel for denominator, not the one in denominator_config
                if 0 <= denominator_channel < x_bp.shape[1]:
                    channel_data = x_bp[:, denominator_channel:denominator_channel+1]
                    denominator_values = welch_bandpower(channel_data, fs=fs, band=(low, high), return_amplitude=return_amplitude)
        elif denominator_name in features:
            # Use all channels for denominator as computed earlier
            denominator_values = features[denominator_name]

        # Calculate the ratio if both numerator and denominator are available
        if numerator_values is not None and denominator_values is not None:
            # Handle the case where we want to compute ratio from specific channels
            if numerator_channel is not None and denominator_channel is not None:
                # Both numerator and denominator from specific channels - return single value
                if len(numerator_values) > 0 and len(denominator_values) > 0:
                    # Get value from the specific channels (first element since single channel computation returns shape [1])
                    num_val = numerator_values[0] if len(numerator_values) > 0 else 0.0
                    den_val = denominator_values[0] if len(denominator_values) > 0 else 0.0
                    if den_val != 0:
                        features[name] = np.array([num_val / den_val])
                    else:
                        features[name] = np.array([0.0])
            else:
                # Calculate ratio element-wise for applicable channels
                denominator_values = np.where(denominator_values == 0, 1e-10, denominator_values)
                features[name] = numerator_values / denominator_values
        else:
            # If numerator or denominator not found, return zeros
            if features:
                first_feature = next(iter(features.values()))
                features[name] = np.zeros_like(first_feature)
            else:
                features[name] = np.array([0.0])

    return features


def welch_bandpower(x: np.ndarray, fs: int, band: Tuple[float,float], axis=0, return_amplitude: bool = False) -> np.ndarray:
    """
    Compute band power via Welch method for each channel.
    x: (samples, channels) or (samples,) -> returns shape (channels,)
    band: (low, high)
    return_amplitude: if True, return sqrt(power) to get amplitude in µV instead of power in µV²
    """
    if x.size == 0:
        return np.array([0.0] * (x.shape[1] if x.ndim > 1 else 1))

    # Use appropriate window size based on data length
    nperseg = min(int(fs * 2), x.shape[0])  # Maximum 2-second segments
    if nperseg < 2:  # Need at least 2 samples for Welch
        return np.array([0.0] * (x.shape[1] if x.ndim > 1 else 1))

    f, Pxx = signal.welch(x, fs=fs, nperseg=nperseg, axis=axis, window='hann')
    df = f[1] - f[0] if len(f) > 1 else 1
    idx = np.logical_and(f >= band[0], f <= band[1])

    # Handle case where no frequency bins match the band
    if not np.any(idx):
        return np.array([0.0] * (Pxx.shape[1] if Pxx.ndim > 1 else 1))

    power = np.sum(Pxx[idx, ...], axis=0) * df
    
    # Return amplitude (µV) instead of power (µV²) if requested
    if return_amplitude:
        return np.sqrt(power)
    return power


def bandpower_time_series_blockwise(x: np.ndarray, fs: int, band: Tuple[float,float], block_sec: float=1.0):
    """
    Compute bandpower time-series by sliding window and returning an array (n_frames, channels).
    Useful for plotting feature over time or feeding smoothing.
    """
    step_sec = block_sec
    block = int(block_sec * fs)
    step = int(step_sec * fs)
    n = x.shape[0]
    frames = []
    for start in range(0, n - block + 1, step):
        block_x = x[start:start+block, :]
        p = welch_bandpower(block_x, fs, band)
        frames.append(p)
    return np.stack(frames, axis=0)  # (n_frames, channels)