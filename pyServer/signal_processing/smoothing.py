"""
Smoothing Module

Simple exponential moving average for smoothing signals over time.
"""

import numpy as np


class EMA:
    """
    Exponential Moving Average for smoothing signals.
    """
    
    def __init__(self, alpha: float = 0.3, shape: tuple = (1,)):
        """
        Initialize EMA with smoothing factor alpha.
        alpha: smoothing factor (0-1, higher = more smoothing)
        shape: shape of input data for initialization
        """
        self.alpha = alpha
        self.value = np.zeros(shape)  # Initialize to zeros with given shape
        self.initialized = False

    def update(self, new_value):
        """
        Update the EMA with a new value.
        """
        if not self.initialized:
            # First update: initialize with new value
            self.value = np.asarray(new_value, dtype=float)
            self.initialized = True
            return self.value
        
        # Subsequent updates: apply EMA formula
        new_value = np.asarray(new_value, dtype=float)
        self.value = self.alpha * new_value + (1.0 - self.alpha) * self.value
        return self.value