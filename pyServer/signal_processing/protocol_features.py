"""
Protocol feature parsing and Welch-based feature computation.

Clinical unit policy:
- Device and filtered EEG are in volts.
- Single-band protocol features are sqrt(Welch band power), in volts.
- Ratio protocol features are ratios of Welch band powers, dimensionless.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, Sequence

import numpy as np
from scipy import signal

from signal_processing.runtime_models import (
    ActiveChannel,
    BandFeatureSpec,
    FeatureSpec,
    FeatureValue,
    ProtocolRuntimeConfig,
    RatioFeatureSpec,
    WelchConfig,
)

_DASH_RE = r"[-–—]"
_BAND_RE = re.compile(rf"\(?\s*(\d+(?:\.\d+)?)\s*{_DASH_RE}\s*(\d+(?:\.\d+)?)\s*Hz?\s*\)?", re.IGNORECASE)
_RATIO_RE = re.compile(
    rf"\(\s*(\d+(?:\.\d+)?)\s*{_DASH_RE}\s*(\d+(?:\.\d+)?)\s*Hz?\s*\)\s*/\s*"
    rf"\(\s*(\d+(?:\.\d+)?)\s*{_DASH_RE}\s*(\d+(?:\.\d+)?)\s*Hz?\s*\)",
    re.IGNORECASE,
)


def normalize_label(label: str) -> str:
    clean = str(label or "CH1").strip()
    return clean or "CH1"


def slug(text: str) -> str:
    s = str(text).lower().replace("–", "-").replace("—", "-")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "feature"


def parse_protocol_entry(
    entry: Dict[str, Any],
    protocol_id: int | None = None,
    default_hardware_index: int = 0,
) -> ProtocolRuntimeConfig:
    """Parse the simple JSON protocol pattern used by the ADHD/Anxiety files."""
    protocol_name = str(entry.get("protocol") or entry.get("name") or "Protocol")
    channel_label = normalize_label(entry.get("channel") or "CH1")
    active = ActiveChannel(default_hardware_index, channel_label)

    feature_specs: list[FeatureSpec] = []
    feature_specs.extend(parse_feature_expression(entry.get("reward", "-"), "enhance", active, prefix="reward"))
    feature_specs.extend(parse_feature_expression(entry.get("inhibit", "-"), "inhibit", active, prefix="inhibit"))

    if not feature_specs:
        raise ValueError(f"Protocol '{protocol_name}' does not define any valid reward/inhibit features")

    return ProtocolRuntimeConfig(
        protocol_name=protocol_name,
        protocol_id=protocol_id,
        active_channels=[active],
        feature_specs=feature_specs,
        feature_weights={spec.name: 1.0 for spec in feature_specs},
        legacy_selected_features=[spec.name for spec in feature_specs],
    )


def _parse_named_ratio(expr: str) -> tuple[float, float, float, float, str | None] | None:
    """Parse common named ratio expressions from older protocol files.

    Returns numerator/denominator bands plus an optional forced mode.
    The only clinical named ratio currently supported is theta/beta ratio,
    which is treated as an inhibit target by convention in this codebase.
    """
    clean = str(expr or "").lower().replace("–", "-").replace("—", "-")
    clean = re.sub(r"[^a-z0-9/]+", " ", clean).strip()
    compact = clean.replace(" ", "")
    if "theta/betaratio" in compact or compact in {"theta/beta", "tbr", "thetabetaratio"}:
        return 4.0, 8.0, 15.0, 18.0, "inhibit"
    return None


def parse_feature_expression(
    expression: Any,
    mode: str,
    active_channel: ActiveChannel,
    prefix: str,
) -> list[FeatureSpec]:
    """Parse '-', a single band, '+' separated bands, or a ratio expression."""
    expr = str(expression or "-").strip()
    expr = expr.replace("Hz", "Hz")
    if expr in {"", "-", "None", "none", "null"}:
        return []

    mode_clean = "inhibit" if mode == "inhibit" else "enhance"

    ratio_match = _RATIO_RE.fullmatch(expr)
    named_ratio = None if ratio_match else _parse_named_ratio(expr)
    if ratio_match or named_ratio:
        if ratio_match:
            n_low, n_high, d_low, d_high = [float(x) for x in ratio_match.groups()]
            ratio_mode = mode_clean
            ratio_prefix = prefix
        else:
            assert named_ratio is not None
            n_low, n_high, d_low, d_high, forced_mode = named_ratio
            ratio_mode = forced_mode or mode_clean
            ratio_prefix = ratio_mode if forced_mode else prefix
        _validate_band(n_low, n_high)
        _validate_band(d_low, d_high)
        name = make_ratio_name(ratio_prefix, n_low, n_high, d_low, d_high, active_channel.label)
        return [
            RatioFeatureSpec(
                name=name,
                mode=ratio_mode,
                numerator_low_hz=n_low,
                numerator_high_hz=n_high,
                denominator_low_hz=d_low,
                denominator_high_hz=d_high,
                channel=active_channel,
            )
        ]

    specs: list[FeatureSpec] = []
    for part in re.split(r"\s*\+\s*", expr):
        if not part.strip():
            continue
        # Allow human annotations after a valid band, e.g.
        # "12-15 Hz (SMR)" or "9-12 Hz (center on PAF if available)".
        match = _BAND_RE.search(part.strip())
        if not match:
            raise ValueError(f"Could not parse frequency expression: {part!r}")
        low, high = float(match.group(1)), float(match.group(2))
        _validate_band(low, high)
        name = make_band_name(prefix, low, high, active_channel.label)
        specs.append(
            BandFeatureSpec(
                name=name,
                mode=mode_clean,
                low_hz=low,
                high_hz=high,
                channel=active_channel,
            )
        )
    return specs


def protocol_runtime_from_sp_config(
    sp_config: Dict[str, Any],
    protocol_name: str = "Protocol",
    protocol_id: int | None = None,
) -> ProtocolRuntimeConfig:
    """
    Convert the legacy protocol_to_signal_processing_format() output into the new explicit specs.

    Current clinical protocols are single-channel. The protocol/electrode label is taken from
    sp_config['channels'][0] when available, while hardware index 0 is the active input.
    """
    channels = sp_config.get("channels") or []
    channel_label = normalize_label(channels[0] if channels else "CH1")
    active = ActiveChannel(0, channel_label)

    bands = sp_config.get("bands", {})
    feature_modes = sp_config.get("feature_modes", {})
    selected = sp_config.get("selected_features") or list(bands.keys())
    feature_weights = sp_config.get("feature_weights", {}) or {}
    specs: list[FeatureSpec] = []

    for name in selected:
        if name not in bands:
            continue
        cfg = bands[name]
        mode = "inhibit" if feature_modes.get(name) == "inhibit" else "enhance"
        if isinstance(cfg, dict) and "numerator" in cfg and "denominator" in cfg:
            numerator_cfg = bands.get(cfg["numerator"])
            denominator_cfg = bands.get(cfg["denominator"])
            n_low, n_high = _range_from_band_config(numerator_cfg, cfg.get("numerator"))
            d_low, d_high = _range_from_band_config(denominator_cfg, cfg.get("denominator"))
            specs.append(
                RatioFeatureSpec(
                    name=slug(name),
                    mode=mode,
                    numerator_low_hz=n_low,
                    numerator_high_hz=n_high,
                    denominator_low_hz=d_low,
                    denominator_high_hz=d_high,
                    channel=active,
                )
            )
        elif isinstance(cfg, (tuple, list)) and len(cfg) >= 2:
            low, high = float(cfg[0]), float(cfg[1])
            _validate_band(low, high)
            specs.append(
                BandFeatureSpec(
                    name=slug(name),
                    mode=mode,
                    low_hz=low,
                    high_hz=high,
                    channel=active,
                )
            )

    if not specs:
        raise ValueError("No valid feature specs could be created from protocol configuration")

    return ProtocolRuntimeConfig(
        protocol_name=protocol_name,
        protocol_id=protocol_id,
        active_channels=[active],
        feature_specs=specs,
        combination_method=sp_config.get("combination_method", "strict_and"),
        feature_weights={spec.name: float(feature_weights.get(spec.name, 1.0)) for spec in specs},
        legacy_selected_features=[spec.name for spec in specs],
    )


def protocol_runtime_from_legacy_start_command(start_command: Dict[str, Any]) -> ProtocolRuntimeConfig:
    """Fallback parser for old frontend commands without protocol_id."""
    channel_label = normalize_label(start_command.get("channel") or "CH1")
    active = ActiveChannel(0, channel_label)
    bands = start_command.get("custom_bands") or {}
    selected = start_command.get("features") or list(bands.keys())
    modes = start_command.get("feature_modes") or {}
    specs: list[FeatureSpec] = []
    for name in selected:
        cfg = bands.get(name)
        mode = "inhibit" if modes.get(name) == "inhibit" else "enhance"
        if isinstance(cfg, (list, tuple)) and len(cfg) >= 2:
            specs.append(
                BandFeatureSpec(
                    name=slug(name),
                    mode=mode,
                    low_hz=float(cfg[0]),
                    high_hz=float(cfg[1]),
                    channel=active,
                )
            )
    if not specs:
        raise ValueError("No valid protocol features were provided in the start command")
    return ProtocolRuntimeConfig(
        protocol_name=str(start_command.get("protocol_name") or "Legacy Protocol"),
        protocol_id=None,
        active_channels=[active],
        feature_specs=specs,
        feature_weights={spec.name: 1.0 for spec in specs},
        legacy_selected_features=[spec.name for spec in specs],
    )


def compute_protocol_features(
    clean_epoch_all_v: np.ndarray,
    fs: int,
    feature_specs: Sequence[FeatureSpec],
    welch_config: WelchConfig,
) -> Dict[str, FeatureValue]:
    """Compute all protocol features from filtered EEG in volts."""
    x = np.asarray(clean_epoch_all_v, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    if x.ndim != 2 or x.shape[0] < 2:
        raise ValueError("clean_epoch_all_v must have shape (samples, channels) and at least 2 samples")

    values: Dict[str, FeatureValue] = {}
    power_cache: Dict[tuple[int, float, float], float] = {}

    for spec in feature_specs:
        ch = int(spec.channel.hardware_index)
        if ch < 0 or ch >= x.shape[1]:
            raise ValueError(f"Feature {spec.name} requested hardware channel {ch}, but input has {x.shape[1]} channels")
        channel_signal = x[:, ch]

        if isinstance(spec, BandFeatureSpec):
            p = _band_power_cached(power_cache, channel_signal, fs, spec.low_hz, spec.high_hz, ch, welch_config)
            val = math.sqrt(max(0.0, p))
            values[spec.name] = FeatureValue(
                name=spec.name,
                value=float(val),
                unit="V",
                mode=spec.mode,
                metric="sqrt_power_v",
                band_power_v2=float(p),
            )
        elif isinstance(spec, RatioFeatureSpec):
            num = _band_power_cached(power_cache, channel_signal, fs, spec.numerator_low_hz, spec.numerator_high_hz, ch, welch_config)
            den = _band_power_cached(power_cache, channel_signal, fs, spec.denominator_low_hz, spec.denominator_high_hz, ch, welch_config)
            ratio = float(num / den) if den > 1e-30 else 0.0
            values[spec.name] = FeatureValue(
                name=spec.name,
                value=ratio,
                unit="ratio",
                mode=spec.mode,
                metric="power_ratio",
                numerator_power_v2=float(num),
                denominator_power_v2=float(den),
            )
        else:
            raise TypeError(f"Unsupported feature spec type: {type(spec)!r}")

    return values


def welch_band_power_v2(
    x_v: np.ndarray,
    fs: int,
    low_hz: float,
    high_hz: float,
    welch_config: WelchConfig,
) -> float:
    """Return integrated Welch band power in V² for a single channel."""
    x = np.asarray(x_v, dtype=np.float64).reshape(-1)
    if x.size < 2:
        return 0.0
    nperseg = min(int(welch_config.nperseg), x.size)
    if nperseg < 2:
        return 0.0
    noverlap = min(int(welch_config.noverlap), max(0, nperseg - 1))
    nfft = max(int(welch_config.nfft), nperseg)
    freqs, pxx = signal.welch(
        x,
        fs=fs,
        window=welch_config.window,
        nperseg=nperseg,
        noverlap=noverlap,
        nfft=nfft,
        detrend=welch_config.detrend,
        scaling=welch_config.scaling,
        average=welch_config.average,
        axis=0,
    )
    if freqs.size < 2:
        return 0.0
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0
    # Welch with scaling='density' gives V²/Hz, so integrate over Hz.
    return float(np.trapz(pxx[mask], freqs[mask]))


def make_band_name(prefix: str, low: float, high: float, label: str) -> str:
    return slug(f"{prefix}_{_fmt_hz(low)}_{_fmt_hz(high)}hz_{label}")


def make_ratio_name(prefix: str, n_low: float, n_high: float, d_low: float, d_high: float, label: str) -> str:
    return slug(f"{prefix}_ratio_{_fmt_hz(n_low)}_{_fmt_hz(n_high)}_over_{_fmt_hz(d_low)}_{_fmt_hz(d_high)}hz_{label}")


def _fmt_hz(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v).replace(".", "p")


def _validate_band(low: float, high: float) -> None:
    if not (0.0 <= low < high):
        raise ValueError(f"Invalid band range: {low}-{high} Hz")


def _range_from_band_config(config: Any, band_name: str | None = None) -> tuple[float, float]:
    if isinstance(config, (tuple, list)) and len(config) >= 2:
        low, high = float(config[0]), float(config[1])
        _validate_band(low, high)
        return low, high
    if band_name:
        match = _BAND_RE.fullmatch(str(band_name).strip())
        if match:
            low, high = float(match.group(1)), float(match.group(2))
            _validate_band(low, high)
            return low, high
    raise ValueError(f"Could not resolve band range for {band_name!r}")


def _band_power_cached(
    cache: Dict[tuple[int, float, float], float],
    channel_signal: np.ndarray,
    fs: int,
    low: float,
    high: float,
    channel_index: int,
    welch_config: WelchConfig,
) -> float:
    key = (channel_index, float(low), float(high))
    if key not in cache:
        cache[key] = welch_band_power_v2(channel_signal, fs, low, high, welch_config)
    return cache[key]
