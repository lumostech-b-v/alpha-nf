"""WebSocket payload builders. Legacy fields are preserved where practical."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

import numpy as np

from signal_processing.runtime_models import DISPLAY_SCALE_UV, DISPLAY_Y_LIMITS_UV, FeatureSpec, FeatureValue, ProtocolRuntimeConfig, SessionConfig


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_error_payload(message: str) -> Dict[str, Any]:
    return {"type": "error", "message": message, "time": utc_now()}


def build_round_start_payload(round_number: int, session_config: SessionConfig) -> Dict[str, Any]:
    return {
        "type": "round_start",
        "message": f"Starting round {round_number}",
        "round_number": round_number,
        "total_rounds": session_config.session_rounds,
        "round_duration_seconds": session_config.round_duration_seconds,
        "baseline_duration_seconds": session_config.baseline_duration_seconds,
        "training_duration_seconds": session_config.training_duration_seconds,
        "phase": "baseline",
        "timestamp": utc_now(),
    }


def build_round_complete_payload(
    round_number: int,
    session_config: SessionConfig,
    round_success_rate: float,
    training_epochs: int,
    raw_data_file: str | None,
) -> Dict[str, Any]:
    return {
        "type": "round_complete",
        "message": f"Round #{round_number} done",
        "round_number": round_number,
        "total_rounds": session_config.session_rounds,
        "round_success_rate": round_success_rate,
        "training_epochs": training_epochs,
        "next_round_auto_start": round_number < session_config.session_rounds,
        "raw_data_file": raw_data_file,
        "timestamp": utc_now(),
    }


def build_session_complete_payload(
    session_success_rate: float,
    completed_rounds: int,
    total_training_epochs: int,
    recording_files: Dict[str, str] | None,
) -> Dict[str, Any]:
    return {
        "type": "session_complete",
        "session_status": "completed",
        "session_success_rate": session_success_rate,
        "overall_success_rate": session_success_rate,
        "completed_rounds": completed_rounds,
        "total_training_epochs": total_training_epochs,
        "recording_files": recording_files or {},
        "timestamp": utc_now(),
    }


def build_eeg_data_payload(
    clean_epoch_all_v: np.ndarray,
    protocol_config: ProtocolRuntimeConfig,
    session_config: SessionConfig,
    *,
    round_number: int,
    phase: str,
    max_samples: int | None = None,
) -> Dict[str, Any]:
    active_indices = protocol_config.active_channel_indices
    active_labels = protocol_config.active_channel_labels
    active = np.asarray(clean_epoch_all_v, dtype=np.float64)[:, active_indices]
    target_samples = int(max_samples or session_config.display_window_samples)
    samples_to_send = min(target_samples, active.shape[0])
    display_uv = active[-samples_to_send:, :] * DISPLAY_SCALE_UV if samples_to_send > 0 else np.zeros((0, len(active_indices)))
    return {
        "type": "eeg_data",
        "timestamp": utc_now(),
        "round_number": round_number,
        "phase": phase,
        "eeg_data": {
            "channels": display_uv.tolist(),
            "channel_names": active_labels,
            "active_channel_count": len(active_indices),
            "active_hardware_indices": active_indices,
            "sampling_rate": int(session_config.fs),
            "unit": "uV_display",
            "timestamp": utc_now(),
            "display_window_seconds": float(session_config.display_window_seconds),
            "target_samples": int(session_config.display_window_samples),
            "samples_available": int(samples_to_send),
            "plot_limits": {"min": DISPLAY_Y_LIMITS_UV[0], "max": DISPLAY_Y_LIMITS_UV[1]},
            "signal_stats": _signal_stats(display_uv),
        },
    }


def build_feedback_payload(
    *,
    feedback: float,
    epoch_binary: float,
    feature_values: Dict[str, FeatureValue],
    thresholds: Dict[str, float],
    feature_passes: Dict[str, bool],
    baseline_means: Dict[str, float],
    baseline_status: Dict[str, Any],
    round_number: int,
    phase: str,
    session_config: SessionConfig,
    protocol_config: ProtocolRuntimeConfig,
    round_success_rate: float,
    session_success_rate: float,
    combined_value: float,
    clean_epoch_all_v: np.ndarray | None = None,
) -> Dict[str, Any]:
    fvals = {name: fv.to_payload_value() for name, fv in feature_values.items()}
    funits = {name: fv.unit for name, fv in feature_values.items()}
    fmodes = {name: fv.mode for name, fv in feature_values.items()}
    payload = {
        "type": "feedback",
        "timestamp": utc_now(),
        "round_number": round_number,
        "total_rounds": session_config.session_rounds,
        "phase": phase,
        "training_phase": phase,
        "training_phase_message": "Training in progress" if phase == "training" else "Taking baseline",
        "baseline_locked": bool(baseline_status.get("overall", {}).get("all_ready", phase == "training")),
        "feedback": float(feedback),
        "epoch_binary": float(epoch_binary),
        "combined_value": float(combined_value),
        "overall_success_rate": float(session_success_rate),
        "round_success_rate": float(round_success_rate),
        "session_success_rate": float(session_success_rate),
        "feature_values": fvals,
        "feature_units": funits,
        "feature_modes": fmodes,
        "thresholds": thresholds,
        "baseline_means": baseline_means,
        "feature_passes": feature_passes,
        "baseline_status": baseline_status.get("features", {}),
        "baseline_overall": baseline_status.get("overall", {}),
        # Legacy aliases for current frontend compatibility.
        "individual_features": fvals,
        "raw_band_powers": fvals,
        "feature_thresholds": _legacy_feature_thresholds(fvals, thresholds, feature_passes, fmodes),
        "active_channel_labels": protocol_config.active_channel_labels,
        "active_hardware_indices": protocol_config.active_channel_indices,
        "signal_info": {
            "channel_names": protocol_config.active_channel_labels,
            "active_channel_count": len(protocol_config.active_channel_indices),
            "sampling_rate": int(session_config.fs),
            "epoch_samples": int(session_config.epoch_samples),
            "step_samples": int(session_config.step_samples),
            "display_window_seconds": float(session_config.display_window_seconds),
            "display_window_samples": int(session_config.display_window_samples),
            "clinical_unit": "V",
            "display_unit": "uV_display",
            "visualization_scale": DISPLAY_SCALE_UV,
            "plot_limits": {"min": DISPLAY_Y_LIMITS_UV[0], "max": DISPLAY_Y_LIMITS_UV[1]},
        },
    }
    if clean_epoch_all_v is not None:
        payload["eeg_data"] = build_eeg_data_payload(
            clean_epoch_all_v,
            protocol_config,
            session_config,
            round_number=round_number,
            phase=phase,
        )["eeg_data"]
    return payload


def _legacy_feature_thresholds(
    feature_values: Dict[str, float],
    thresholds: Dict[str, float],
    passes: Dict[str, bool],
    modes: Dict[str, str],
) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for name, value in feature_values.items():
        if name not in thresholds:
            continue
        out[name] = {
            "threshold": thresholds[name],
            "raw_threshold": thresholds[name],
            "current_value": value,
            "success": passes.get(name, False),
            "mode": modes.get(name, "enhance"),
        }
    return out


def _signal_stats(x: np.ndarray) -> Dict[str, list[float]]:
    if x.size == 0:
        return {"mean_values": [], "std_values": [], "min_values": [], "max_values": []}
    return {
        "mean_values": [float(np.nanmean(x[:, i])) for i in range(x.shape[1])],
        "std_values": [float(np.nanstd(x[:, i])) for i in range(x.shape[1])],
        "min_values": [float(np.nanmin(x[:, i])) for i in range(x.shape[1])],
        "max_values": [float(np.nanmax(x[:, i])) for i in range(x.shape[1])],
    }
