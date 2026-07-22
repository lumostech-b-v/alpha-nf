"""Session recording utilities for continuous raw/filtered EEG and epoch features."""

from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import numpy as np

from signal_processing.runtime_models import (
    DEFAULT_BAUDRATE,
    DEFAULT_GAIN,
    HARDWARE_CHANNELS,
    SAMPLE_UNPACK_FORMAT,
    BYTES_PER_SAMPLE,
    DEVICE_SAMPLE_UNIT,
    ProtocolRuntimeConfig,
    SessionConfig,
    WelchConfig,
)


def recordings_root() -> str:
    try:
        from app.core.database import get_database_path

        base = os.path.dirname(get_database_path())
    except Exception:
        base = os.getcwd()
    root = os.path.join(base, "eeg_recordings")
    os.makedirs(root, exist_ok=True)
    return root


def create_session_dir(patient_id: Optional[int], protocol_id: Optional[int]) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    pid = patient_id if patient_id is not None else "unknown"
    pr = protocol_id if protocol_id is not None else "legacy"
    path = os.path.join(recordings_root(), f"session_{ts}_patient_{pid}_protocol_{pr}")
    os.makedirs(path, exist_ok=True)
    return path


def recording_relative_path(path: str) -> str:
    """Return path relative to eeg_recordings for safe /sp/recording access."""
    try:
        return os.path.relpath(os.path.abspath(path), os.path.abspath(recordings_root()))
    except Exception:
        return os.path.basename(path)


class SessionRecorders:
    def __init__(self, session_dir: str):
        self.session_dir = session_dir
        self.eeg_path = os.path.join(session_dir, "eeg_raw_clean.csv")
        self.feature_path = os.path.join(session_dir, "feature_feedback_log.csv")
        self.metadata_path = os.path.join(session_dir, "metadata.json")
        self._eeg_file = open(self.eeg_path, "w", newline="", encoding="utf-8")
        self._feature_file = open(self.feature_path, "w", newline="", encoding="utf-8")
        self.eeg_writer = csv.writer(self._eeg_file)
        self.feature_writer = csv.writer(self._feature_file)
        self._write_headers()

    @classmethod
    def open(
        cls,
        session_config: SessionConfig,
        protocol_config: ProtocolRuntimeConfig,
        welch_config: WelchConfig,
        preprocessing_config: Dict[str, Any],
    ) -> "SessionRecorders":
        recorder = cls(create_session_dir(session_config.patient_id, protocol_config.protocol_id))
        recorder.write_metadata(session_config, protocol_config, welch_config, preprocessing_config)
        return recorder

    def _write_headers(self) -> None:
        self.eeg_writer.writerow([
            "timestamp",
            "session_elapsed_s",
            "global_sample_index",
            "round_number",
            "round_elapsed_s",
            "phase",
            "hardware_ch0_raw_v",
            "hardware_ch1_raw_v",
            "hardware_ch2_raw_v",
            "hardware_ch0_clean_v",
            "hardware_ch1_clean_v",
            "hardware_ch2_clean_v",
            "active_hardware_index",
            "active_electrode_label",
            "fs",
            "gain",
        ])
        self.feature_writer.writerow([
            "timestamp",
            "session_elapsed_s",
            "global_epoch_index",
            "round_number",
            "round_elapsed_s",
            "phase",
            "baseline_locked",
            "baseline_progress_pct",
            "feature_values_json",
            "feature_units_json",
            "feature_modes_json",
            "baseline_means_json",
            "thresholds_json",
            "feature_passes_json",
            "epoch_binary",
            "feedback",
            "round_success_rate",
            "session_success_rate",
        ])

    def write_metadata(
        self,
        session_config: SessionConfig,
        protocol_config: ProtocolRuntimeConfig,
        welch_config: WelchConfig,
        preprocessing_config: Dict[str, Any],
    ) -> None:
        metadata = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hardware": {
                "fs": session_config.fs,
                "baudrate": DEFAULT_BAUDRATE,
                "hardware_channels": HARDWARE_CHANNELS,
                "sample_format": SAMPLE_UNPACK_FORMAT,
                "bytes_per_sample": BYTES_PER_SAMPLE,
                "sample_unit": DEVICE_SAMPLE_UNIT,
                "gain": DEFAULT_GAIN,
                "start_command": "Contl_STRT_AQU",
                "stop_command": "Contl_STOP_AQU",
                "gain_command": "Config_GAIN_24",
                "operation_mode_command": "Oprate_NOR_OPR",
            },
            "session": session_config.to_dict(),
            "protocol": protocol_config.to_dict(),
            "preprocessing": preprocessing_config,
            "welch": welch_config.to_dict(),
            "recording_files": {
                "eeg": recording_relative_path(self.eeg_path),
                "features": recording_relative_path(self.feature_path),
                "metadata": recording_relative_path(self.metadata_path),
            },
        }
        with open(self.metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def write_eeg_block(
        self,
        raw_block_all_v: np.ndarray,
        clean_block_all_v: np.ndarray,
        *,
        timestamp_iso: str,
        session_elapsed_s: float,
        start_sample_index: int,
        round_number: int,
        round_elapsed_s: float,
        phase: str,
        active_hardware_index: int,
        active_electrode_label: str,
        fs: int,
        gain: int = DEFAULT_GAIN,
    ) -> None:
        raw = np.asarray(raw_block_all_v, dtype=np.float64)
        clean = np.asarray(clean_block_all_v, dtype=np.float64)
        if raw.shape != clean.shape:
            raise ValueError("raw and clean blocks must have identical shape")
        if raw.ndim != 2 or raw.shape[1] != HARDWARE_CHANNELS:
            raise ValueError("EEG block must have shape (samples, 3)")
        for i in range(raw.shape[0]):
            t = session_elapsed_s + i / fs
            self.eeg_writer.writerow([
                timestamp_iso,
                round(t, 6),
                int(start_sample_index + i),
                int(round_number),
                round(round_elapsed_s + i / fs, 6),
                phase,
                float(raw[i, 0]),
                float(raw[i, 1]),
                float(raw[i, 2]),
                float(clean[i, 0]),
                float(clean[i, 1]),
                float(clean[i, 2]),
                int(active_hardware_index),
                active_electrode_label,
                int(fs),
                int(gain),
            ])
        self._eeg_file.flush()

    def write_feature_epoch(
        self,
        *,
        timestamp_iso: str,
        session_elapsed_s: float,
        global_epoch_index: int,
        round_number: int,
        round_elapsed_s: float,
        phase: str,
        baseline_locked: bool,
        baseline_progress_pct: float,
        feature_values: Dict[str, float],
        feature_units: Dict[str, str],
        feature_modes: Dict[str, str],
        baseline_means: Dict[str, float],
        thresholds: Dict[str, float],
        feature_passes: Dict[str, bool],
        epoch_binary: float,
        feedback: float,
        round_success_rate: float,
        session_success_rate: float,
    ) -> None:
        self.feature_writer.writerow([
            timestamp_iso,
            round(session_elapsed_s, 6),
            int(global_epoch_index),
            int(round_number),
            round(round_elapsed_s, 6),
            phase,
            bool(baseline_locked),
            round(baseline_progress_pct, 4),
            json.dumps(feature_values, ensure_ascii=False),
            json.dumps(feature_units, ensure_ascii=False),
            json.dumps(feature_modes, ensure_ascii=False),
            json.dumps(baseline_means, ensure_ascii=False),
            json.dumps(thresholds, ensure_ascii=False),
            json.dumps(feature_passes, ensure_ascii=False),
            float(epoch_binary),
            float(feedback),
            float(round_success_rate),
            float(session_success_rate),
        ])
        self._feature_file.flush()

    def close(self) -> None:
        for f in (getattr(self, "_eeg_file", None), getattr(self, "_feature_file", None)):
            try:
                if f:
                    f.close()
            except Exception:
                pass

    def files_payload(self) -> Dict[str, str]:
        return {
            "eeg": recording_relative_path(self.eeg_path),
            "features": recording_relative_path(self.feature_path),
            "metadata": recording_relative_path(self.metadata_path),
        }
