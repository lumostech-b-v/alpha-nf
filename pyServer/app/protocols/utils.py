"""
Utility functions for converting protocols to signal processing format
"""
from typing import Dict, List, Tuple, Any
from app.protocols import models, schemas
from signal_processing.config import cfg


# Display-name → Hz range for the bands offered in the protocol-builder UI
# (frontend PREDEFINED_BANDS). Used as a fallback so ratio sub-bands referenced
# by their UI label (e.g. "Low Beta", "Slow Alpha") resolve even for protocols
# saved before explicit ranges were persisted. Keys are lowercased.
UI_PREDEFINED_BANDS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "slow alpha": (8.0, 9.0),
    "alpha": (8.0, 12.0),
    "fast alpha": (10.0, 12.0),
    "low beta": (12.0, 15.0),
    "beta": (15.0, 20.0),
    "high beta": (20.0, 30.0),
    "gamma": (30.0, 45.0),
}


def _parse_range_from_name(band_name: str):
    """Parse a custom band label like "10-20" / "10–20" / "0.5–4" into a
    (low, high) tuple. Returns None if the name isn't a numeric range."""
    import re

    if not isinstance(band_name, str):
        return None
    # Match "<num><dash><num>" where dash is hyphen, en-dash or em-dash.
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*", band_name)
    if not m:
        return None
    low, high = float(m.group(1)), float(m.group(2))
    if high <= low:
        return None
    return (low, high)


def protocol_to_signal_processing_format(protocol: models.ProtocolLibrary) -> Dict[str, Any]:
    """
    Convert a protocol from the database to the format expected by signal processing.

    Returns a dict with:
    - bands: {band_name: (low_freq, high_freq, channel_index) or
              {"numerator": band_name, "denominator": band_name, "numerator_channel": channel_idx, "denominator_channel": channel_idx} or
              {"numerator": band_name, "denominator": band_name}}
    - feature_modes: {band_name: "enhance" | "inhibit"}
    - channels: List of channel names used in this protocol
    - feature_weights: {band_name: weight} (default 1.0)
    """
    if not protocol.features or "frequency_bands" not in protocol.features:
        raise ValueError(f"Protocol {protocol.id} has invalid features structure")

    bands = {}
    feature_modes = {}
    channels = set()
    feature_weights = {}

    # First pass: collect all regular bands and ratio bands
    regular_bands = []
    ratio_bands = []
    
    for idx, band_config in enumerate(protocol.features.get("frequency_bands", [])):
        if band_config.get("type") == "ratio":
            ratio_bands.append((idx, band_config))
        else:
            regular_bands.append((idx, band_config))

    # Convert regular frequency bands first
    for idx, band_config in regular_bands:
        # This is a regular frequency band
        # Use the original band names for proper reference in ratios
        original_name = band_config.get("name")
        if original_name:
            band_name = original_name
        else:
            band_name = f"band_{idx}"
            if band_config.get("type") == "reward":
                band_name = f"reward_{idx}"
            elif band_config.get("type") == "inhibit":
                band_name = f"inhibit_{idx}"
            else:
                band_name = f"band_{idx}"

        # Extract frequency range if it exists
        freq_range = band_config.get("frequency_range", [])
        channel_indices = band_config.get("channel_indices", [])

        if len(freq_range) != 2:
            raise ValueError(f"Invalid frequency_range for band {idx} in protocol {protocol.id}")
        
        # If a specific channel index is provided (first one in the list), include it in the tuple
        if channel_indices:
            # Use the first channel index if multiple are provided
            channel_idx = channel_indices[0] if isinstance(channel_indices, list) and channel_indices else channel_indices
            bands[band_name] = (float(freq_range[0]), float(freq_range[1]), channel_idx)
        else:
            bands[band_name] = (float(freq_range[0]), float(freq_range[1]))

        # Set mode: "enhance" for reward, "inhibit" for inhibit
        if band_config.get("type") == "reward":
            feature_modes[band_name] = "enhance"
        elif band_config.get("type") == "inhibit":
            feature_modes[band_name] = "inhibit"
        else:
            # For other types or default, use enhance
            feature_modes[band_name] = "enhance"

        # Collect channels
        band_channels = band_config.get("channels", [])
        if isinstance(band_channels, list):
            channels.update(band_channels)

        # Set weight if provided (default to 1.0)
        weight = band_config.get("weight", 1.0)
        feature_weights[band_name] = weight

    # Track sub-bands added purely to support ratio computation (not shown as chart bars)
    helper_bands: set = set()

    # Second pass: handle ratio bands and ensure underlying bands exist
    for idx, band_config in ratio_bands:
        # This is a ratio feature
        numerator_band = band_config.get("numerator")
        denominator_band = band_config.get("denominator")

        if not numerator_band or not denominator_band:
            raise ValueError(f"Ratio feature missing numerator or denominator in protocol {protocol.id}")

        def _resolve_sub_band(band_name: str, explicit_range, channel_idx):
            """Add a sub-band to bands dict, resolving from cfg or an explicit range."""
            if band_name in bands:
                return
            lower = band_name.lower()
            if explicit_range and len(explicit_range) == 2:
                # Hz range supplied directly by the UI (predefined or custom band) —
                # authoritative so the computed band matches what the clinician saw.
                freq_range = (float(explicit_range[0]), float(explicit_range[1]))
            elif lower in UI_PREDEFINED_BANDS:
                # Protocol saved before ranges were persisted: resolve by UI label.
                freq_range = UI_PREDEFINED_BANDS[lower]
            elif lower in cfg.bands:
                freq_range = cfg.bands[lower]
            elif (parsed := _parse_range_from_name(band_name)) is not None:
                # Custom band whose label encodes its range, e.g. "10–20" — for
                # protocols saved before explicit ranges were persisted.
                freq_range = parsed
            else:
                raise ValueError(
                    f"Band '{band_name}' not found in default bands and no explicit range provided "
                    f"for protocol {protocol.id}. Available bands: {list(cfg.bands.keys())}"
                )
            if channel_idx is not None:
                bands[band_name] = (freq_range[0], freq_range[1], channel_idx)
            else:
                bands[band_name] = (freq_range[0], freq_range[1])
            feature_modes[band_name] = "enhance"
            feature_weights[band_name] = 1.0
            helper_bands.add(band_name)

        _resolve_sub_band(
            numerator_band,
            band_config.get("numerator_range"),
            band_config.get("numerator_channel_index"),
        )
        _resolve_sub_band(
            denominator_band,
            band_config.get("denominator_range"),
            band_config.get("denominator_channel_index"),
        )

        # Generate a proper band name, using the provided name or creating one based on the numerator and denominator
        band_name = band_config.get("name") or f"ratio_{numerator_band}_over_{denominator_band}_{idx}"

        # Add the ratio configuration to bands
        ratio_config = {
            "numerator": numerator_band,
            "denominator": denominator_band
        }

        # Add channel information if specified
        if band_config.get("numerator_channel_index") is not None:
            ratio_config["numerator_channel"] = band_config.get("numerator_channel_index")
        if band_config.get("denominator_channel_index") is not None:
            ratio_config["denominator_channel"] = band_config.get("denominator_channel_index")

        bands[band_name] = ratio_config

        # Set mode for the ratio feature (default to "enhance")
        band_type = band_config.get("mode", "enhance")  # "enhance" or "inhibit"
        feature_modes[band_name] = band_type

        # Collect channels
        band_channels = band_config.get("channels", [])
        if isinstance(band_channels, list):
            channels.update(band_channels)

        # Set weight if provided (default to 1.0)
        weight = band_config.get("weight", 1.0)
        feature_weights[band_name] = weight


    return {
        "bands": bands,
        "feature_modes": feature_modes,
        "channels": sorted(list(channels)),
        "feature_weights": feature_weights,
        # Exclude helper sub-bands (theta/alpha/beta added to support ratio computation)
        "selected_features": [k for k in bands if k not in helper_bands],
        "combination_method": protocol.features.get("combination_method", "weighted_average"),  # Use from protocol or default
    }


def get_protocol_channels(protocol: models.ProtocolLibrary) -> List[str]:
    """Extract all unique channels from a protocol"""
    channels = set()
    if protocol.features and "frequency_bands" in protocol.features:
        for band_config in protocol.features.get("frequency_bands", []):
            band_channels = band_config.get("channels", [])
            if isinstance(band_channels, list):
                channels.update(band_channels)
    return sorted(list(channels))

