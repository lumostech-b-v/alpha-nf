# config.py
"""
Central configuration for the neurofeedback pipeline.
Adjust sampling rate, bands of interest, window sizes, etc.
"""

from dataclasses import dataclass

@dataclass
class Config:
    fs: int = 256                 # sampling rate (Hz)
    channels: int = 8             # number of EEG channels
    buffer_seconds: float = 4.0   # ring buffer length (s) for features
    epoch_seconds: float = 1.0    # processing epoch length (s)
    overlap: float = 0.5          # epoch overlap fraction (0..1)
    notch_freq: float = 50.0      # notch filter frequency (Hz) - matches realtime_plotter_mac.py
    bandpass: tuple = (0.5, 20.0) # overall bandpass (Hz) for cleaning: (high-pass, low-pass) - matches realtime_plotter_mac.py
    # Example target bands to compute band powers
    bands: dict = None
    ARTIFACT_CHECK = True

cfg = Config()
cfg.DEBUG_SIGNALS = False  # Disable detailed signal debugging output
cfg.bands = {
    # Standard frequency bands
    "delta": (1, 4),
    "theta": (4, 8),
    "alpha": (8, 12),
    "smr": (12, 15),
    "beta": (15, 30),
    "gamma": (30, 45),
    
    # Protocol-specific bands for P1, P2, P3
    # P1 - Frontal-Activation
    "p1_reward": (15, 18),      # Beta reward band
    "p1_inhibit_alpha": (8, 12), # Alpha inhibit
    "p1_inhibit_beta": (22, 30), # High-beta inhibit
    
    # P2 - Calm-Arousal  
    "p2_reward": (8, 12),       # Alpha reward (center to PAF)
    "p2_inhibit_beta": (22, 30), # High-beta inhibit
    "p2_inhibit_theta": (2, 7),  # Theta inhibit (if drowsy)
    
    # P3 - SMR-Stability
    "p3_reward": (12, 15),      # SMR reward
    "p3_inhibit_theta": (2, 7),  # Theta inhibit
    "p3_inhibit_beta": (20, 30), # Beta inhibit
    
    # Additional protocol-specific bands
    "low_beta": (12, 15),       # Alternative SMR range
    "high_beta": (22, 30),      # High beta for anxiety
    "low_theta": (2, 7),        # Low theta for drowsiness
}
