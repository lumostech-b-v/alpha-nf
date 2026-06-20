"""
Artifact Detection Module

Three detectors:
  - amplitude_threshold_epochs : simple peak-amplitude gate (existing)
  - eye_blink_detection        : large slow-wave (< 3 Hz) deflection
  - emg_detection              : elevated high-frequency (> 40 Hz) power ratio

All functions expect signal in microvolts (µV).
"""

import numpy as np
from scipy import signal as sp_signal


def amplitude_threshold_epochs(x_uv, threshold_uv=100.0):
    """
    Flag an epoch when any channel exceeds threshold_uv in peak amplitude.
    x_uv: (samples, channels) in µV
    Returns boolean array — True = clean, False = artifact.
    """
    if x_uv.size == 0:
        return np.array([True])

    max_abs = np.max(np.abs(x_uv), axis=0)
    good_epoch = np.all(max_abs <= threshold_uv)
    return np.array([good_epoch])


def eye_blink_detection(x_uv, fs, threshold_uv=60.0):
    """
    Detect eye-blink artifacts as large slow deflections (< 3 Hz).

    Eye blinks generate biphasic low-frequency waves that propagate from
    frontal to central channels (~20-80 µV at Cz). We isolate the slow
    component with a 3 Hz lowpass and flag peak-to-peak amplitude.

    x_uv  : (samples, channels) in µV — use filtered signal (0.5-40 Hz)
    fs    : sampling rate in Hz
    threshold_uv : peak-to-peak threshold on the slow component (µV)

    Returns dict:
        detected  : bool
        type      : "eye_blink"
        channels  : list of flagged channel indices
        message   : human-readable string
    """
    min_samples = int(fs * 0.3)
    if x_uv.size == 0 or x_uv.shape[0] < min_samples:
        return {"detected": False, "type": "eye_blink", "channels": [], "message": ""}

    # Lowpass at 3 Hz to keep only the blink waveform
    sos = sp_signal.butter(2, 3.0, btype="low", fs=fs, output="sos")
    x_slow = sp_signal.sosfiltfilt(sos, x_uv, axis=0)

    ptp = np.ptp(x_slow, axis=0)  # peak-to-peak per channel
    flagged = np.where(ptp > threshold_uv)[0].tolist()

    return {
        "detected": bool(flagged),
        "type": "eye_blink",
        "channels": flagged,
        "message": "Eye blink detected" if flagged else "",
    }


def emg_detection(x_raw_uv, fs, emg_low=40.0, ratio_threshold=0.35):
    """
    Detect muscle (EMG) artifacts by checking whether high-frequency power
    (>40 Hz) is disproportionately large relative to total signal power.

    Must be applied to the RAW (unfiltered) signal because the standard
    EEG filter chain cuts off at 40 Hz, removing all EMG content.

    x_raw_uv      : (samples, channels) in µV — raw unfiltered data
    fs            : sampling rate in Hz
    emg_low       : lower edge of EMG band in Hz (default 40)
    ratio_threshold: EMG-band RMS / total-signal RMS above which to flag

    Returns dict:
        detected  : bool
        type      : "emg"
        channels  : list of flagged channel indices
        message   : human-readable string
    """
    nyq = fs / 2.0
    emg_high = min(nyq * 0.95, 120.0)

    min_samples = int(fs * 0.3)
    if x_raw_uv.size == 0 or x_raw_uv.shape[0] < min_samples or emg_low >= nyq:
        return {"detected": False, "type": "emg", "channels": [], "message": ""}

    # Bandpass to EMG range on the raw signal
    sos_emg = sp_signal.butter(4, [emg_low, emg_high], btype="band", fs=fs, output="sos")
    x_emg = sp_signal.sosfiltfilt(sos_emg, x_raw_uv, axis=0)

    rms_total = np.sqrt(np.mean(x_raw_uv ** 2, axis=0))
    rms_emg = np.sqrt(np.mean(x_emg ** 2, axis=0))

    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(rms_total > 1e-9, rms_emg / rms_total, 0.0)

    flagged = np.where(ratio > ratio_threshold)[0].tolist()

    return {
        "detected": bool(flagged),
        "type": "emg",
        "channels": flagged,
        "message": "Muscle artifact (EMG) detected" if flagged else "",
    }
