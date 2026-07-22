"""
Preprocessing Module

Referencing, filters (notch, bandpass), and a real-time filter class.
Designed to support both offline zero-phase filtering (filtfilt) and online filtering (sosfilt with state).
Based on the original API expected by the system.
"""

import numpy as np
from scipy import signal
from typing import Tuple, Optional


def common_average_reference(x: np.ndarray) -> np.ndarray:
    """
    x: array (samples, channels)
    subtract the average across channels for each timepoint.
    """
    mean = np.mean(x, axis=1, keepdims=True)
    return x - mean


def laplacian_reference(x: np.ndarray, neighbor_map: Optional[dict] = None) -> np.ndarray:
    """
    x: (samples, channels)
    neighbor_map: dict channel_index -> list of neighbor indices
    If neighbor_map None -> fallback to common average.
    """
    if neighbor_map is None:
        return common_average_reference(x)
    out = x.copy()
    for ch, neigh in neighbor_map.items():
        out[:, ch] = x[:, ch] - np.mean(x[:, neigh], axis=1)
    return out


def design_notch(fs: int, freq: float = 50.0, q: float = 30.0):
    """
    Design a second-order IIR notch as second-order section (sos).
    """
    b, a = signal.iirnotch(w0=freq/(fs/2), Q=q)
    sos = signal.tf2sos(b, a)
    return sos


def design_bandpass(fs: int, low: float, high: float, order: int = 4, ftype="butter"):
    """
    Return sos for bandpass Butterworth (or other) filter.
    Uses normalized frequencies wrt Nyquist.
    """
    nyq = fs / 2.0
    lown = max(low/nyq, 1e-6)
    highn = min(high/nyq, 0.999999)
    sos = signal.butter(order, [lown, highn], btype='band', output='sos')
    return sos


class RealTimeFilter:
    """
    Legacy real-time filtering helper using SOS sections with persistent state.

    Kept for backward compatibility. New clinical runtime should use
    RealTimeEEGFilterChain below. Initial states are zero to avoid the large
    unscaled sosfilt_zi startup transient for microvolt-level EEG in volts.
    """

    def __init__(self, sos, channels: int):
        self.sos = sos
        self.channels = channels
        # zi per channel and per sos section. Zero initial conditions are safer
        # for EEG in volts than unscaled sosfilt_zi() unit-step states.
        self.zi = np.zeros((channels, sos.shape[0], 2), dtype=np.float64)
        # zi shape: (channels, n_sections, 2)

    def apply_block(self, x_block: np.ndarray) -> np.ndarray:
        """
        x_block: (samples, channels)
        returns y: (samples, channels)
        updates internal state
        """
        if x_block.ndim == 1:
            x_block = x_block[:, None]
        n_samples, n_ch = x_block.shape
        y = np.zeros_like(x_block)
        for ch in range(min(n_ch, self.channels)):  # Prevent index out of bounds
            y[:, ch], self.zi[ch] = signal.sosfilt(self.sos, x_block[:, ch], zi=self.zi[ch])
        return y


class PlotterAlignedFilterChain:
    """
    DEPRECATED for clinical runtime.

    Kept temporarily only for comparison/debug with the old plotter behavior.
    New sp_routes/session_runner must use RealTimeEEGFilterChain instead.

    Simple zero-phase filter chain (high-pass -> low-pass -> notch)
    that mirrors the filters used in realtime_plotter_mac.py.

    This intentionally avoids CAR and any additional processing so that
    the filtered output matches the debugging plotter as closely as possible.
    """

    def __init__(self, fs: int, min_length: int = 50):
        self.fs = fs
        self.min_length = max(10, int(min_length))

        # Match realtime_plotter_mac.py design exactly
        self.hp_b, self.hp_a = signal.butter(4, 0.5, btype="high", fs=fs)
        self.lp_b, self.lp_a = signal.butter(4, 40.0, btype="low", fs=fs)

        notch_freq = 50.0
        notch_bandwidth = 2.0
        low_cutoff = notch_freq - notch_bandwidth / 2.0
        high_cutoff = notch_freq + notch_bandwidth / 2.0
        self.notch_b, self.notch_a = signal.butter(
            4, [low_cutoff, high_cutoff], btype="bandstop", fs=fs
        )

    def process(self, data: np.ndarray) -> np.ndarray:
        """
        Apply the cascaded filters using filtfilt so that the response
        matches the realtime plotter (zero phase distortion).
        """
        if data.size == 0:
            return data

        if data.shape[0] < self.min_length:
            return data

        y = signal.filtfilt(self.hp_b, self.hp_a, data, axis=0)
        y = signal.filtfilt(self.lp_b, self.lp_a, y, axis=0)
        y = signal.filtfilt(self.notch_b, self.notch_a, y, axis=0)
        return y


def amplitude_threshold_epochs(x, threshold_uv=500.0):
    """
    Detect epochs with amplitude exceeding threshold.
    x: input data array (n_samples, n_channels)
    threshold_uv: threshold in microvolts
    Returns: boolean array indicating good (True) or bad (False) epochs
    """
    if x.size == 0:
        return np.array([True])
    
    # Calculate max absolute amplitude per epoch (per channel)
    max_abs = np.max(np.abs(x), axis=0)
    
    # Check if any channel exceeds threshold
    good_epoch = np.all(max_abs <= threshold_uv)
    
    return np.array([good_epoch])


def preprocessing_pipeline(data, fs=250):
    """
    Apply a simple preprocessing pipeline:
    1. Common average reference
    2. Notch filtering (50 Hz)
    3. Bandpass filtering (0.5-40 Hz)
    This is a simple offline version using filtfilt, not real-time filtering
    Note: For real-time processing, use the config values from signal_processing.config
    """
    if data.size == 0:
        return data

    # Step 1: Common average reference
    data = common_average_reference(data)

    # Step 2: Notch filter for 50 Hz line noise
    b, a = signal.iirnotch(50.0/(fs/2), Q=30.0)
    filtered_data = np.zeros_like(data)
    for ch in range(data.shape[1]):
        filtered_data[:, ch] = signal.filtfilt(b, a, data[:, ch])

    # Step 3: Bandpass filter (0.5-40 Hz)
    nyq = fs / 2.0
    low = max(0.5 / nyq, 1e-6)
    high = min(20.0 / nyq, 0.999999)
    b, a = signal.butter(4, [low, high], btype='band', fs=fs)
    for ch in range(filtered_data.shape[1]):
        filtered_data[:, ch] = signal.filtfilt(b, a, filtered_data[:, ch])

    return filtered_data

class RealTimeEEGFilterChain:
    """
    Continuous stateful EEG filter chain for clinical neurofeedback runtime.

    This replaces PlotterAlignedFilterChain for live sessions. The old
    PlotterAlignedFilterChain is kept temporarily for comparison/debug only;
    it should not be used in the clinical WebSocket route.

    Processing order:
        high-pass 0.5 Hz -> low-pass 40 Hz -> notch 50 Hz

    Input/output units are unchanged. If input is volts, output is volts.
    """

    def __init__(
        self,
        fs: int = 250,
        channels: int = 3,
        highpass_hz: float = 0.5,
        lowpass_hz: float = 40.0,
        notch_hz: float = 50.0,
        notch_q: float = 30.0,
        order: int = 4,
    ):
        self.fs = int(fs)
        self.channels = int(channels)
        self.highpass_hz = float(highpass_hz)
        self.lowpass_hz = float(lowpass_hz)
        self.notch_hz = float(notch_hz)
        self.notch_q = float(notch_q)
        self.order = int(order)

        nyquist = self.fs / 2.0
        if not (0.0 < self.highpass_hz < nyquist):
            raise ValueError(f"Invalid highpass_hz={self.highpass_hz} for fs={self.fs}")
        if not (0.0 < self.lowpass_hz < nyquist):
            raise ValueError(f"Invalid lowpass_hz={self.lowpass_hz} for fs={self.fs}")
        if self.highpass_hz >= self.lowpass_hz:
            raise ValueError("highpass_hz must be lower than lowpass_hz")
        if not (0.0 < self.notch_hz < nyquist):
            raise ValueError(f"Invalid notch_hz={self.notch_hz} for fs={self.fs}")

        self.hp_sos = signal.butter(self.order, self.highpass_hz, btype="highpass", fs=self.fs, output="sos")
        self.lp_sos = signal.butter(self.order, self.lowpass_hz, btype="lowpass", fs=self.fs, output="sos")
        notch_b, notch_a = signal.iirnotch(w0=self.notch_hz, Q=self.notch_q, fs=self.fs)
        self.notch_sos = signal.tf2sos(notch_b, notch_a)
        self.reset()

    def reset(self) -> None:
        # Use zero initial conditions. Do NOT use unscaled sosfilt_zi here:
        # sosfilt_zi assumes a unit-step input, which would create enormous
        # startup transients when the real EEG input is in volts/microvolts.
        # The session runner performs a short warm-up before baseline/training.
        self.hp_zi = self._make_zero_zi(self.hp_sos)
        self.lp_zi = self._make_zero_zi(self.lp_sos)
        self.notch_zi = self._make_zero_zi(self.notch_sos)

    def process_block(self, raw_block_v: np.ndarray) -> np.ndarray:
        x = np.asarray(raw_block_v, dtype=np.float64)
        if x.size == 0:
            return x.reshape((0, self.channels))
        if x.ndim == 1:
            x = x[:, None]
        if x.ndim != 2:
            raise ValueError("raw_block_v must have shape (samples, channels)")
        if x.shape[1] != self.channels:
            raise ValueError(f"Expected {self.channels} channels, got {x.shape[1]}")
        if not np.all(np.isfinite(x)):
            raise ValueError("raw_block_v contains NaN or Inf")

        y, self.hp_zi = signal.sosfilt(self.hp_sos, x, axis=0, zi=self.hp_zi)
        y, self.lp_zi = signal.sosfilt(self.lp_sos, y, axis=0, zi=self.lp_zi)
        y, self.notch_zi = signal.sosfilt(self.notch_sos, y, axis=0, zi=self.notch_zi)
        return y

    def _make_zero_zi(self, sos: np.ndarray) -> np.ndarray:
        return np.zeros((sos.shape[0], 2, self.channels), dtype=np.float64)
