import json
import os
import threading
from typing import Any, Dict

_CONFIG_LOCK = threading.Lock()
_CONFIG_CACHE: Dict[str, Any] | None = None

_DEFAULTS: Dict[str, Any] = {
	"device": {
		"mode": "Auto",
		"dll_name": "I8Library1.dll",
		"dll_search_paths": [".", "..", "${CWD}"]
	},
	"mock": {
		"debug_mode": False,
		"main_channels": 24,
		"extra_channels": 0,
		"sampling_rate": 250,
		"gain": 24,
		"exgain": 24,
		"linked_ear": False,
		"total_samples": 15000,
		"timing": {
			"base_jitter": 0.05,
			"drift_factor": 0.98,
			"min_sleep_fraction": 0.9
		},
		"leadoff_mode": False
	},
	"collector": {
		"sampling_rate": 250,
        "data_dir": "../../eeg_data",
		"csv_prefix": "eeg_data_",
		"channel_labels": [
			"Ex1", "Ex2", "Ex3", "Fp1", "Fp2", "F3", "F4", "C3", "C4",
			"P3", "P4", "O1", "O2", "F7", "F8", "T3", "T4", "T5", "T6",
			"Cz", "Fz", "Pz", "A1", "A2"
		],
		"print_every_n_samples": 50,
		"duration_seconds": 30
	}
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
	result = dict(base)
	for key, value in override.items():
		if key in result and isinstance(result[key], dict) and isinstance(value, dict):
			result[key] = _deep_merge(result[key], value)
		else:
			result[key] = value
	return result


def _load_from_disk(config_path: str) -> Dict[str, Any]:
	if not os.path.exists(config_path):
		return {}
	with open(config_path, "r", encoding="utf-8") as f:
		try:
			return json.load(f)
		except Exception:
			return {}


def get_config_path() -> str:
	# Prefer local config.json in this directory
	here = os.path.dirname(os.path.abspath(__file__))
	return os.path.join(here, "config.json")


def get_config() -> Dict[str, Any]:
	global _CONFIG_CACHE
	if _CONFIG_CACHE is not None:
		return _CONFIG_CACHE
	with _CONFIG_LOCK:
		if _CONFIG_CACHE is not None:
			return _CONFIG_CACHE
		config_path = get_config_path()
		disk_cfg = _load_from_disk(config_path)
		_CONFIG_CACHE = _deep_merge(_DEFAULTS, disk_cfg if isinstance(disk_cfg, dict) else {})
		return _CONFIG_CACHE


def get_device_config() -> Dict[str, Any]:
	return get_config().get("device", {})


def get_mock_config() -> Dict[str, Any]:
	return get_config().get("mock", {})


def get_collector_config() -> Dict[str, Any]:
	return get_config().get("collector", {})


def expand_search_paths(paths: list[str]) -> list[str]:
	cwd = os.getcwd()
	here = os.path.dirname(os.path.abspath(__file__))
	expanded: list[str] = []
	for p in paths:
		if p == "${CWD}":
			expanded.append(cwd)
		elif p == ".":
			expanded.append(here)
		elif p == "..":
			expanded.append(os.path.dirname(here))
		else:
			expanded.append(p)
	return expanded
