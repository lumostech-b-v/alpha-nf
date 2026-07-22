"""
Runtime models for the neurofeedback clinical loop.

These models are intentionally small and explicit. They separate hardware
channels, protocol/electrode labels, runtime timing, feature metrics, baseline
state, and session state so the route does not become one large function again.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Literal, Optional, Union


FeatureMode = Literal["enhance", "inhibit"]
FeatureMetric = Literal["sqrt_power_v", "power_ratio"]
FeatureUnit = Literal["V", "ratio"]
SessionPhase = Literal["initializing", "warmup", "baseline", "training", "complete", "stopped", "error"]


FS_HZ = 250
HARDWARE_CHANNELS = 3
DEVICE_SAMPLE_UNIT = "V"
DEFAULT_GAIN = 24
DEFAULT_BAUDRATE = 115200
BYTES_PER_SAMPLE = 12
SAMPLE_UNPACK_FORMAT = "<fff"

RUNTIME_EPOCH_SECONDS = 1.0
RUNTIME_STEP_SECONDS = 0.5
BASELINE_DURATION_SECONDS = 30.0
DISPLAY_SCALE_UV = 1e6
DISPLAY_Y_LIMITS_UV = (-150.0, 150.0)
DISPLAY_WINDOW_SECONDS = 5.0



@dataclass(frozen=True)
class ActiveChannel:
    """A protocol-defined clinical channel mapped onto a hardware stream index."""

    hardware_index: int
    label: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class WelchConfig:
    """Welch PSD configuration kept independent from runtime epoch overlap."""

    profile_name: str = "deepsearch_v1_pending_neuroguide_comparison"
    window: str = "hann"
    nperseg: int = 250
    noverlap: int = 0
    nfft: int = 250
    detrend: str = "constant"
    scaling: str = "density"
    average: str = "mean"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BandFeatureSpec:
    name: str
    mode: FeatureMode
    low_hz: float
    high_hz: float
    channel: ActiveChannel
    metric: Literal["sqrt_power_v"] = "sqrt_power_v"

    @property
    def unit(self) -> FeatureUnit:
        return "V"

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["unit"] = self.unit
        return d


@dataclass(frozen=True)
class RatioFeatureSpec:
    name: str
    mode: FeatureMode
    numerator_low_hz: float
    numerator_high_hz: float
    denominator_low_hz: float
    denominator_high_hz: float
    channel: ActiveChannel
    metric: Literal["power_ratio"] = "power_ratio"

    @property
    def unit(self) -> FeatureUnit:
        return "ratio"

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["unit"] = self.unit
        return d


FeatureSpec = Union[BandFeatureSpec, RatioFeatureSpec]


@dataclass(frozen=True)
class FeatureValue:
    name: str
    value: float
    unit: FeatureUnit
    mode: FeatureMode
    metric: FeatureMetric
    band_power_v2: Optional[float] = None
    numerator_power_v2: Optional[float] = None
    denominator_power_v2: Optional[float] = None

    def to_payload_value(self) -> float:
        return float(self.value)


@dataclass(frozen=True)
class ProtocolRuntimeConfig:
    protocol_name: str
    protocol_id: Optional[int]
    active_channels: list[ActiveChannel]
    feature_specs: list[FeatureSpec]
    combination_method: str = "strict_and"
    feature_weights: Dict[str, float] = field(default_factory=dict)
    legacy_selected_features: list[str] = field(default_factory=list)

    @property
    def active_channel_indices(self) -> list[int]:
        return [ch.hardware_index for ch in self.active_channels]

    @property
    def active_channel_labels(self) -> list[str]:
        return [ch.label for ch in self.active_channels]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol_name": self.protocol_name,
            "protocol_id": self.protocol_id,
            "active_channels": [ch.to_dict() for ch in self.active_channels],
            "feature_specs": [spec.to_dict() for spec in self.feature_specs],
            "combination_method": self.combination_method,
            "feature_weights": self.feature_weights,
            "legacy_selected_features": self.legacy_selected_features,
        }


@dataclass(frozen=True)
class SessionConfig:
    total_session_duration_seconds: float
    session_rounds: int
    round_duration_seconds: float
    baseline_duration_seconds: float
    training_duration_seconds: float
    reward_threshold_pct: float
    inhibit_threshold_pct: float
    runtime_epoch_seconds: float = RUNTIME_EPOCH_SECONDS
    runtime_step_seconds: float = RUNTIME_STEP_SECONDS
    epoch_samples: int = 250
    step_samples: int = 125
    fs: int = FS_HZ
    display_window_seconds: float = DISPLAY_WINDOW_SECONDS
    display_window_samples: int = 1250
    patient_id: Optional[int] = None
    patient_name: str = "Unknown"
    user_id: Optional[int] = None
    session_type: Optional[str] = None
    protocol_type: Optional[str] = None

    @classmethod
    def from_start_command(
        cls,
        start_command: Dict[str, Any],
        patient_name: str = "Unknown",
    ) -> "SessionConfig":
        total = float(start_command.get("session_duration", 1500.0))
        rounds = int(start_command.get("session_rounds", 5))
        if rounds <= 0:
            raise ValueError("session_rounds must be >= 1")
        total = max(10.0, min(24 * 3600.0, total))
        round_duration = total / rounds
        baseline = BASELINE_DURATION_SECONDS
        training = round_duration - baseline
        if training <= 0:
            raise ValueError(
                f"Each round must be longer than baseline: round_duration={round_duration:.2f}s, "
                f"baseline={baseline:.2f}s"
            )
        reward_pct = float(start_command.get("reward_threshold_percentage", 20.0)) / 100.0
        inhibit_pct = float(start_command.get("inhibit_threshold_percentage", 20.0)) / 100.0
        reward_pct = max(0.0, min(1.0, reward_pct))
        inhibit_pct = max(0.0, min(1.0, inhibit_pct))
        fs = FS_HZ
        epoch_samples = int(RUNTIME_EPOCH_SECONDS * fs)
        step_samples = int(RUNTIME_STEP_SECONDS * fs)
        display_window_samples = int(DISPLAY_WINDOW_SECONDS * fs)
        return cls(
            total_session_duration_seconds=total,
            session_rounds=rounds,
            round_duration_seconds=round_duration,
            baseline_duration_seconds=baseline,
            training_duration_seconds=training,
            reward_threshold_pct=reward_pct,
            inhibit_threshold_pct=inhibit_pct,
            epoch_samples=epoch_samples,
            step_samples=step_samples,
            fs=fs,
            display_window_samples=display_window_samples,
            patient_id=_safe_int(start_command.get("patientId")),
            patient_name=patient_name,
            user_id=_safe_int(start_command.get("user_id")),
            session_type=start_command.get("session_type"),
            protocol_type=start_command.get("protocol_type"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FeatureBaselineState:
    values: list[float] = field(default_factory=list)
    mean: Optional[float] = None
    std: Optional[float] = None
    threshold: Optional[float] = None


@dataclass
class RoundRuntimeState:
    round_number: int
    round_started_at: float
    baseline_locked: bool = False
    baseline_locked_at: Optional[float] = None
    feature_baselines: Dict[str, FeatureBaselineState] = field(default_factory=dict)
    round_training_history: list[float] = field(default_factory=list)
    raw_buffer_all_v: Optional[Any] = None
    clean_buffer_all_v: Optional[Any] = None


@dataclass
class SessionRuntimeState:
    session_started_at: float
    phase: SessionPhase = "initializing"
    current_round: int = 0
    stop_requested: bool = False
    global_epoch_index: int = 0
    global_sample_index: int = 0
    session_training_history: list[float] = field(default_factory=list)


def _safe_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None
