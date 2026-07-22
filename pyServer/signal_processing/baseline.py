"""Per-round feature baseline and fixed-threshold utilities."""

from __future__ import annotations

from typing import Dict, Sequence

import numpy as np

from signal_processing.runtime_models import (
    BandFeatureSpec,
    FeatureBaselineState,
    FeatureSpec,
    FeatureValue,
    RatioFeatureSpec,
    RoundRuntimeState,
    SessionConfig,
)


def initialize_round_baseline_state(round_state: RoundRuntimeState, feature_specs: Sequence[FeatureSpec]) -> None:
    round_state.baseline_locked = False
    round_state.baseline_locked_at = None
    round_state.feature_baselines = {spec.name: FeatureBaselineState() for spec in feature_specs}
    round_state.round_training_history = []


def add_baseline_feature_values(
    round_state: RoundRuntimeState,
    feature_values: Dict[str, FeatureValue],
) -> None:
    if round_state.baseline_locked:
        return
    for name, feature_value in feature_values.items():
        if name not in round_state.feature_baselines:
            round_state.feature_baselines[name] = FeatureBaselineState()
        round_state.feature_baselines[name].values.append(float(feature_value.value))


def lock_baseline_thresholds(
    round_state: RoundRuntimeState,
    feature_specs: Sequence[FeatureSpec],
    session_config: SessionConfig,
    locked_at: float,
) -> Dict[str, float]:
    """
    Lock thresholds from the mean of baseline feature values.

    Baseline values are the same feature metric used during training:
    - single bands: sqrt(Welch band power) in volts
    - ratios: power ratios
    """
    thresholds: Dict[str, float] = {}
    spec_by_name = {spec.name: spec for spec in feature_specs}

    for name, spec in spec_by_name.items():
        state = round_state.feature_baselines.setdefault(name, FeatureBaselineState())
        arr = np.asarray(state.values, dtype=np.float64)
        if arr.size == 0 or not np.any(np.isfinite(arr)):
            baseline_mean = 0.0
            baseline_std = 0.0
        else:
            arr = arr[np.isfinite(arr)]
            baseline_mean = float(np.mean(arr))
            baseline_std = float(np.std(arr))

        if spec.mode == "inhibit":
            threshold = baseline_mean * (1.0 - session_config.inhibit_threshold_pct)
        else:
            threshold = baseline_mean * (1.0 + session_config.reward_threshold_pct)

        state.mean = baseline_mean
        state.std = baseline_std
        state.threshold = float(threshold)
        thresholds[name] = float(threshold)

    round_state.baseline_locked = True
    round_state.baseline_locked_at = locked_at
    return thresholds


def should_lock_baseline(round_elapsed_s: float, session_config: SessionConfig) -> bool:
    return round_elapsed_s >= session_config.baseline_duration_seconds


def get_thresholds(round_state: RoundRuntimeState) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for name, state in round_state.feature_baselines.items():
        if state.threshold is not None:
            out[name] = float(state.threshold)
    return out


def get_baseline_means(round_state: RoundRuntimeState) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for name, state in round_state.feature_baselines.items():
        if state.mean is not None:
            out[name] = float(state.mean)
    return out


def get_baseline_status(round_state: RoundRuntimeState, round_elapsed_s: float, session_config: SessionConfig) -> Dict[str, object]:
    progress = min(1.0, max(0.0, round_elapsed_s / session_config.baseline_duration_seconds))
    per_feature = {}
    counts: list[int] = []
    for name, state in round_state.feature_baselines.items():
        count = len(state.values)
        counts.append(count)
        per_feature[name] = {
            "is_ready": bool(round_state.baseline_locked and state.threshold is not None),
            "progress": progress,
            "samples_collected": count,
            "baseline_locked": round_state.baseline_locked,
            "baseline_mean": state.mean,
            "threshold": state.threshold,
        }
    expected_feature_epochs = int(round(session_config.baseline_duration_seconds / session_config.runtime_step_seconds))
    return {
        "features": per_feature,
        "overall": {
            "all_ready": round_state.baseline_locked,
            "min_progress": progress,
            # Legacy name kept for UI compatibility. This is the total number of
            # feature values across all features, not raw EEG samples.
            "total_samples": int(sum(counts)),
            "feature_epochs_collected_min": int(min(counts)) if counts else 0,
            "feature_epochs_collected_max": int(max(counts)) if counts else 0,
            "expected_feature_epochs_nominal": expected_feature_epochs,
            "status": "ready" if round_state.baseline_locked else "collecting",
        },
    }
