"""
Normalization Module

Manages baseline collection and z-score normalization for features.
"""

import numpy as np
from collections import deque
from typing import Optional


class BaselineManager:
    """
    Manages baseline collection and z-score computation for features.
    """
    
    def __init__(self, channels: int = 1, max_len: int = 60):
        self.channels = channels
        self.max_len = max_len
        self.buffer = deque(maxlen=max_len)
        self.baseline_mean = None
        self.baseline_std = None
        self.baseline_locked = False
        self.samples_for_baseline = max_len  # Minimum samples needed for baseline

    def add(self, value):
        """Add a value to the baseline buffer."""
        if not self.baseline_locked:
            self.buffer.append(value)
            
            # Calculate baseline if we have enough samples
            if len(self.buffer) >= self.samples_for_baseline:
                self._calculate_baseline()
    
    def _calculate_baseline(self):
        """Calculate baseline statistics."""
        values = np.array(list(self.buffer))
        self.baseline_mean = np.mean(values, axis=0)
        self.baseline_std = np.std(values, axis=0)
        # Avoid division by zero
        self.baseline_std = np.where(self.baseline_std == 0, 1, self.baseline_std)
        
    def zscore(self, value):
        """Compute z-score relative to baseline."""
        if self.baseline_mean is None or self.baseline_std is None:
            # Return 0 if no baseline available
            if hasattr(value, '__len__'):
                return np.zeros_like(value, dtype=float)
            else:
                return 0.0
        
        # Calculate z-score
        z = (value - self.baseline_mean) / self.baseline_std
        return z

    def lock_baseline(self):
        """Lock the baseline so it doesn't update."""
        self.baseline_locked = True

    def is_baseline_ready(self):
        """Check if baseline has been collected."""
        return self.baseline_mean is not None

    def baseline_progress(self):
        """Return baseline collection progress (0 to 1)."""
        return min(1.0, len(self.buffer) / self.samples_for_baseline)

    def reset(self):
        """Reset the baseline manager."""
        self.buffer.clear()
        self.baseline_mean = None
        self.baseline_std = None
        self.baseline_locked = False


class AdaptiveThreshold:
    """
    Adaptive threshold that adjusts based on success rate.
    """
    
    def __init__(self, target_success_rate=0.7, window_size=50, initial_threshold=0.0, adjustment_rate=0.1):
        self.target_success_rate = target_success_rate
        self.window_size = window_size
        self.current_threshold = initial_threshold
        self.adjustment_rate = adjustment_rate
        
        # Track recent values and successes
        self.values = deque(maxlen=window_size)
        self.successes = deque(maxlen=window_size)
        
    def update(self, value, threshold=None):
        """
        Update the threshold based on the new value.
        Returns True if the current value would pass the threshold test.
        """
        if threshold is None:
            threshold = self.current_threshold
            
        # Record the value and success
        success = 1 if value >= threshold else 0
        self.values.append(value)
        self.successes.append(success)
        
        # Adjust threshold based on success rate
        if len(self.successes) >= 10:  # Need some data to make adjustment
            actual_success_rate = sum(self.successes) / len(self.successes)
            
            # Adjust threshold if success rate is off target
            if actual_success_rate > self.target_success_rate:
                # Too many successes - raise threshold
                self.current_threshold += self.adjustment_rate
            elif actual_success_rate < self.target_success_rate:
                # Too few successes - lower threshold
                self.current_threshold -= self.adjustment_rate
        
        return success == 1

    def get_stats(self):
        """Get statistics about the adaptive threshold."""
        if len(self.values) == 0:
            return {
                "current_threshold": float(self.current_threshold),
                "success_rate": 0.0,
                "samples_count": 0,
                "target_success_rate": float(self.target_success_rate),
                "recent_values_mean": 0.0,
                "recent_values_std": 0.0
            }
        
        recent_values = list(self.values)
        recent_successes = list(self.successes)
        
        return {
            "current_threshold": float(self.current_threshold),
            "success_rate": float(sum(recent_successes) / len(recent_successes)),
            "samples_count": len(recent_successes),
            "target_success_rate": float(self.target_success_rate),
            "recent_values_mean": float(np.mean(recent_values)),
            "recent_values_std": float(np.std(recent_values))
        }


class FixedThreshold:
    """
    Fixed threshold with mode (enhance/inhibit).
    """
    
    def __init__(self, threshold, mode="enhance"):
        self.threshold = threshold
        self.mode = mode  # "enhance" or "inhibit"
        
    def check(self, value):
        """
        Check if value passes the threshold test based on mode.
        For enhance: value >= threshold
        For inhibit: value < threshold (opposite condition)
        """
        if self.mode == "enhance":
            return value >= self.threshold
        elif self.mode == "inhibit":
            return value < self.threshold
        else:
            raise ValueError(f"Invalid mode: {self.mode}. Use 'enhance' or 'inhibit'")