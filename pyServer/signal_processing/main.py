# main.py
"""
To do:

    1. change the data pipeline so that it is getting data from the /device/eeg_data_collector
    2. make the output sendable via http.



Bring modules together into a simple real-time loop.
This uses SimulatedAcquisition by default. Replace with your hardware acquisition.
Computes bandpower (alpha) every epoch, normalizes against baseline, smooths, and prints feedback value.
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
from signal_processing.preprocessing import common_average_reference, design_notch, RealTimeFilter, design_bandpass
from signal_processing.features import welch_bandpower
from signal_processing.normalization import BaselineManager
from signal_processing.smoothing import EMA
from signal_processing.feedback import linear_map, sigmoid_map
from signal_processing.acquisition import SimulatedAcquisition

def main():
    acq = SimulatedAcquisition(fs=cfg.fs, channels=cfg.channels)
    epoch_samples = int(cfg.epoch_seconds * cfg.fs)
    step_samples = int(epoch_samples * (1.0 - cfg.overlap))
    # Design filters
    notch_sos = design_notch(cfg.fs, cfg.notch_freq, q=30.0)
    bp_sos = design_bandpass(cfg.fs, cfg.bandpass[0], cfg.bandpass[1], order=4)
    notch_rt = RealTimeFilter(notch_sos, cfg.channels)
    bp_rt = RealTimeFilter(bp_sos, cfg.channels)

    # Baseline manager for alpha band power
    baseline = BaselineManager(channels=cfg.channels, max_len=120)
    ema = EMA(alpha=0.3, shape=(cfg.channels,))

    # pre-fill buffer for overlap
    buffer = np.zeros((0, cfg.channels))
    print("Starting real-time loop. Press Ctrl+C to stop.")
    try:
        while True:
            # read one step of data
            block = acq.read_samples(step_samples)  # (step_samples, channels)
            # append
            buffer = np.vstack([buffer, block])
            # keep only up to epoch_samples
            if buffer.shape[0] < epoch_samples:
                continue
            if buffer.shape[0] > epoch_samples:
                buffer = buffer[-epoch_samples:, :]

            # Preprocess (ref, notch, bandpass) using RT filters
            x_ref = common_average_reference(buffer)
            x_notched = notch_rt.apply_block(x_ref)
            x_bp = bp_rt.apply_block(x_notched)

            # Artifact simple reject: amplitude thresholding (microvolts)
            # If too noisy -> skip updating baseline and produce no reward
            from signal_processing.artifact import amplitude_threshold_epochs
            good_mask = amplitude_threshold_epochs(x_bp, threshold_uv=200.0)
            if not np.all(good_mask):
                print("Artifact detected in epoch. skipping this epoch.")
                # shift buffer by step_samples and continue
                # buffer already rolling by design
                continue

            # Feature extraction: bandpower per channel for alpha
            alpha_band = cfg.bands["alpha"]
            p_alpha = welch_bandpower(x_bp, fs=cfg.fs, band=alpha_band)
            # Add to baseline and compute zscore once enough baseline exists
            baseline.add(p_alpha)
            z = baseline.zscore(p_alpha)

            # Smooth z across time
            s = ema.update(z)

            # Map to feedback (example: sigmoid, clipped 0..1)
            feedback_val = sigmoid_map(s.mean(), gain=1.5, shift=1.0, clip=(0.0, 1.0))

            # Emit feedback (here we print; replace with UDP, OSC, serial, etc.)
            print(f"[{time.strftime('%H:%M:%S')}] alpha mean power: {p_alpha.mean():.2e}, zmean: {z.mean():.2f}, feedback: {feedback_val:.3f}")

            # loop continues: the buffer overlapped will be handled by reading step_samples next
            # sleep a tiny bit to avoid busy waiting if acquisition is fast
            # in real hardware, read_samples blocks returning real-time data
    except KeyboardInterrupt:
        print("Stopping...")

if __name__ == "__main__":
    main()
