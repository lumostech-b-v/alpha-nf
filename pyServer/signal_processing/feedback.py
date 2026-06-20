"""
Feedback Module

Functions for mapping features to feedback values.
"""

import numpy as np


def sigmoid_map(x, gain=1.5, shift=1.0, clip=None):
    """
    Sigmoid mapping function.
    x: input value or array
    gain: steepness of the curve
    shift: shift along x-axis
    clip: tuple (min, max) to clip output, or None
    """
    result = 1.0 / (1.0 + np.exp(-gain * (x - shift)))
    if clip is not None:
        result = np.clip(result, clip[0], clip[1])
    return result


def linear_map(x, a=1.0, b=0.0, clip=None):
    """
    Linear mapping function: y = a*x + b
    x: input value or array
    a, b: linear coefficients
    clip: tuple (min, max) to clip output, or None
    """
    result = a * x + b
    if clip is not None:
        result = np.clip(result, clip[0], clip[1])
    return result


def threshold_reward(x, threshold=0.0, low_reward=0.0, high_reward=1.0):
    """
    Threshold-based reward mapping.
    x: input value or array
    threshold: threshold value
    low_reward: reward value when x < threshold
    high_reward: reward value when x >= threshold
    """
    if hasattr(x, '__len__'):
        # If x is an array
        result = np.where(x >= threshold, high_reward, low_reward)
    else:
        # If x is a scalar
        result = high_reward if x >= threshold else low_reward
    return result