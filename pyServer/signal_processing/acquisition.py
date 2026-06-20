# acquisition.py
"""
Acquisition interface + simulator.
Implement hardware-specific acquisition by subclassing BaseAcquisition
and implementing `read_samples(num_samples)` to return shape (num_samples, channels).
"""

import numpy as np
import time
from typing import Optional
from collections import deque
from signal_processing.config import cfg

class BaseAcquisition:
    def __init__(self, fs: int = cfg.fs, channels: int = cfg.channels):
        self.fs = fs
        self.channels = channels

    def read_samples(self, num_samples: int) -> np.ndarray:
        """
        Blocking read: return a numpy array shape (num_samples, channels)
        Override this for hardware (e.g. from amplifier SDK).
        """
        raise NotImplementedError

class SimulatedAcquisition(BaseAcquisition):
    # ---- Deterministic artifact injection (for testing the artifact UI) ----
    # Every ARTIFACT_CYCLE seconds we inject one of each artifact type in turn so
    # the clinician can verify each shows up on the live EEG. Set to False / 0 to
    # disable. Amplitudes are tuned against the detector thresholds and the
    # filter chain (HP 0.5 / LP 40 / notch 50 Hz) used in sp_routes:
    #   amplitude  : filtered peak > 150 uV   (checked first in the cascade)
    #   eye_blink  : <3 Hz slow-wave ptp > 60 uV
    #   emg        : 40-120 Hz RMS / total RMS > 0.35 on the RAW signal
    INJECT_ARTIFACTS = True
    ARTIFACT_CYCLE = 18.0       # seconds for one full blink->amplitude->emg loop
    BLINK_CENTER = 3.0          # seconds into the cycle
    AMP_CENTER = 9.0
    EMG_CENTER = 15.0

    def __init__(self, fs=cfg.fs, channels=cfg.channels, seed: Optional[int]=0):
        super().__init__(fs, channels)
        self.rng = np.random.default_rng(seed)
        self.t = 0.0
        self.running = True
        self._next_read_time = None  # wall-clock pacing target

    def _artifact_waveform(self, times: np.ndarray) -> np.ndarray:
        """Return the additive artifact signal (volts) for the given time vector."""
        if not self.INJECT_ARTIFACTS:
            return np.zeros_like(times)

        phase = np.mod(times, self.ARTIFACT_CYCLE)

        # 1. Eye blink — biphasic slow deflection (derivative-of-Gaussian).
        #    ptp ~90 uV (> 60) but max |value| ~45 uV so it stays under the
        #    150 uV amplitude gate, letting the eye-blink detector fire.
        u = (phase - self.BLINK_CENTER) / 0.10
        blink = 105e-6 * (-u) * np.exp(-(u ** 2))

        # 2. High amplitude — sharp narrow spike well above the 150 uV gate.
        ua = (phase - self.AMP_CENTER) / 0.06
        high_amp = 260e-6 * np.exp(-(ua ** 2))

        # 3. EMG — 70 Hz burst inside a ~0.4 s window. 70 Hz sits above the 40 Hz
        #    low-pass (so it's invisible to the amplitude/blink detectors on the
        #    filtered signal) but trips the EMG ratio on the raw signal.
        emg_window = np.exp(-(((phase - self.EMG_CENTER) / 0.18) ** 2))
        emg = 70e-6 * emg_window * np.sin(2 * np.pi * 70.0 * times)

        return blink + high_amp + emg

    def read_samples(self, num_samples: int, timeout: Optional[float] = None) -> np.ndarray:
        """
        Generate simulated EEG-like signal: sum of sinusoids in standard bands + noise.
        timeout parameter is accepted for compatibility but ignored (simulated data is instant).
        """
        if not self.running:
            return np.empty((0, self.channels), dtype=np.float64)

        # Real-time pacing: a real amplifier delivers samples at the sample rate,
        # but this simulator returns instantly. Without pacing the processing loop
        # free-runs and the simulated artifact cycle collapses into a fraction of a
        # second, so every epoch looks like an artifact. Sleep so each read takes
        # ~num_samples/fs seconds of wall-clock, like hardware.
        now = time.perf_counter()
        if self._next_read_time is None:
            self._next_read_time = now
        self._next_read_time += num_samples / self.fs
        delay = self._next_read_time - now
        if delay > 0:
            time.sleep(delay)
        elif delay < -1.0:
            # Fell far behind (e.g. debugger pause); resync to avoid a burst.
            self._next_read_time = time.perf_counter()

        dt = 1.0 / self.fs
        times = self.t + np.arange(num_samples) * dt
        self.t = times[-1] + dt

        # Deterministic artifact term shared across channels (computed once).
        artifact = self._artifact_waveform(times)

        # Build multi-channel with slight differences
        # Increased amplitude for better visibility and more realistic variation
        signals = []
        for ch in range(self.channels):
            s = np.zeros(num_samples, dtype=float)
            # alpha component (increased amplitude for visibility)
            s += 50e-6 * np.sin(2 * np.pi * 10.0 * times + ch * 0.1)
            # beta component
            s += 20e-6 * np.sin(2 * np.pi * 20.0 * times + ch * 0.2)
            # theta component (add more variation)
            s += 30e-6 * np.sin(2 * np.pi * 6.0 * times + ch * 0.15)
            # low frequency drift
            s += 10e-6 * np.sin(2 * np.pi * 1.0 * times)
            # Gaussian noise (increased for more realistic signal)
            s += 5e-6 * self.rng.standard_normal(num_samples)
            # injected test artifacts (blink / high-amplitude / emg in rotation)
            s += artifact
            signals.append(s)
        return np.stack(signals, axis=-1)
    
    def stop(self):
        """Stop the simulated acquisition (no-op for simulated device)"""
        self.running = False
    
    def send_command(self, cmd: str):
        """Send a command (no-op for simulated device, but accepts for compatibility)"""
        pass
