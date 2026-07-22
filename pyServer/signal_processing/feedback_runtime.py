"""Strict feedback evaluation for neurofeedback protocol features."""

from __future__ import annotations

from typing import Dict, Sequence

import numpy as np

from signal_processing.runtime_models import FeatureSpec, FeatureValue


def evaluate_feature_passes(
    feature_values: Dict[str, FeatureValue],
    thresholds: Dict[str, float],
    feature_specs: Sequence[FeatureSpec],
) -> Dict[str, bool]:
    passes: Dict[str, bool] = {}
    for spec in feature_specs:
        if spec.name not in feature_values or spec.name not in thresholds:
            passes[spec.name] = False
            continue
        value = float(feature_values[spec.name].value)
        threshold = float(thresholds[spec.name])
        if spec.mode == "inhibit":
            passes[spec.name] = bool(value <= threshold)
        else:
            passes[spec.name] = bool(value >= threshold)
    return passes


def evaluate_epoch_binary(feature_passes: Dict[str, bool]) -> float:
    return 1.0 if feature_passes and all(feature_passes.values()) else 0.0


def calculate_success_rate(history: list[float]) -> float:
    if not history:
        return 0.0
    return float(np.mean(history) * 100.0)


def reporting_combined_value(feature_values: Dict[str, FeatureValue]) -> float:
    """
    Display/reporting only. Clinical feedback is strict AND, not combined_value.
    """
    if not feature_values:
        return 0.0
    vals = [float(v.value) for v in feature_values.values()]
    return float(np.mean(vals))
