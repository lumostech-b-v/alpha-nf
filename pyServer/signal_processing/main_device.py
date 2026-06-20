#!/usr/bin/env python3
"""
main_device.py

Real-time neurofeedback loop wired to DeviceAcquisition (your device/mock-device).
This is the same processing pipeline you had earlier, but it reads from the device handler
instead of the SimulatedAcquisition.

It adapts to device sampling rate and channel count automatically.
"""

import time
import numpy as np
import sys
import os

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from signal_processing.config import cfg
from app.core.main import app

# local wrapper that reads from the actual device
from signal_processing.device_acquisition import DeviceAcquisition

# pipeline modules (unchanged)
from signal_processing.preprocessing import common_average_reference, design_notch, RealTimeFilter, design_bandpass
from signal_processing.features import welch_bandpower
from signal_processing.normalization import BaselineManager
from signal_processing.smoothing import EMA
from signal_processing.feedback import sigmoid_map
from signal_processing.artifact import amplitude_threshold_epochs


def run_real_time_loop(runtime_seconds: float = 30.0):
    # Initialize device-backed acquisition
    acq = DeviceAcquisition(target_channels=24, fs=cfg.fs, verbose=True)

    # Use device's channel count and sampling rate (DeviceAcquisition already read them)
    device_channels = acq.target_channels
    fs = acq.fs

    # Override cfg.fs and cfg.channels locally for filter design consistency
    # (we don't mutate global cfg, but use local values when designing filters)
    epoch_seconds = cfg.epoch_seconds
    overlap = cfg.overlap

    epoch_samples = int(epoch_seconds * fs)
    step_samples = max(1, int(epoch_samples * (1.0 - overlap)))

    # Design real-time filters using the pipeline functions
    notch_sos = design_notch(fs, cfg.notch_freq, q=30.0)
    bp_sos = design_bandpass(fs, cfg.bandpass[0], cfg.bandpass[1], order=4)

    notch_rt = RealTimeFilter(notch_sos, device_channels)
    bp_rt = RealTimeFilter(bp_sos, device_channels)

    # baseline and smoothing configured per device channel count
    baseline = BaselineManager(channels=device_channels, max_len=120)
    ema = EMA(alpha=0.3, shape=(device_channels,))

    # rolling buffer for epoch formation
    buffer = np.zeros((0, device_channels), dtype=np.float64)

    print("Starting device-backed neurofeedback loop. Ctrl-C to stop.")
    start_time = time.time()
    try:
        while (time.time() - start_time) < runtime_seconds:
            # request next block (step_samples)
            block = acq.read_samples(step_samples, timeout=1.0)

            if block is None or block.size == 0:
                # no data right now — skip iteration (device might be paused)
                time.sleep(0.001)
                continue

            # append to rolling buffer and keep last epoch_samples
            buffer = np.vstack([buffer, block])
            if buffer.shape[0] > epoch_samples:
                buffer = buffer[-epoch_samples:, :]

            if buffer.shape[0] < epoch_samples:
                # not enough samples yet for an epoch
                continue

            # Preprocess: referencing + notch + bandpass (real-time)
            x_ref = common_average_reference(buffer)
            x_notch = notch_rt.apply_block(x_ref)
            x_bp = bp_rt.apply_block(x_notch)

            # Simple artifact check (amplitude threshold)
            if cfg.ARTIFACT_CHECK:
                good_mask = amplitude_threshold_epochs(x_bp, threshold_uv=500.0)
                if not np.all(good_mask):
                    print("Artifact detected in epoch — skipping feedback update.")
                    continue

            # Feature extraction: alpha band power per channel using Welch over the epoch
            alpha_band = cfg.bands.get("alpha", (8, 12))
            p_alpha = welch_bandpower(x_bp, fs=fs, band=alpha_band)

            # update baseline, compute z-score and smooth
            baseline.add(p_alpha)
            z = baseline.zscore(p_alpha)
            s = ema.update(z)

            # map to a single feedback value (example)
            feedback_val = sigmoid_map(np.nanmean(s), gain=1.5, shift=1.0, clip=(0.0, 1.0))

            # emit feedback (here: print - replace with OSC/serial/UDP to UI)
            timestamp = time.strftime("%H:%M:%S")
            print(f"[{timestamp}] alpha mean: {p_alpha.mean():.2e}, zmean: {z.mean():.2f}, feedback: {feedback_val:.3f}")

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        print("Cleaning up — stopping device")
        acq.stop()
        print("Stopped.")


if __name__ == "__main__":
    # run for a default duration (change as required)
    run_real_time_loop(runtime_seconds=float(cfg.__dict__.get('run_seconds', 60.0)))
