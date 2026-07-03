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
    x_bp: preprocessed EEG data (samples, channels) — always a single channel (CH1) in the live app.
    fs: sampling frequency
    bands: dict of {band_name: (low_freq, high_freq)} or
                   {"numerator": band_name, "denominator": band_name}
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
            # This is a regular frequency band
            regular_bands[name] = config

    for name, config in regular_bands.items():
        low, high = config[0], config[1]
        features[name] = welch_bandpower(x_bp, fs=fs, band=(low, high), return_amplitude=return_amplitude)

    # Calculate ratio bands from the computed regular bands
    for name, config in ratio_bands.items():
        numerator_name = config["numerator"]
        denominator_name = config["denominator"]

        numerator_values = features.get(numerator_name)
        denominator_values = features.get(denominator_name)

        if numerator_values is not None and denominator_values is not None:
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