# Release Notes — v2.0.5 (corrected build)

**Branch:** `signal`
**Date:** 2026-07-22
**Component:** `pyServer` (real-time signal-processing runtime) + `frontend` (session recording / WebSocket handling)

## Summary
This build replaces the clinical neurofeedback runtime that was previously implemented as a single ~950-line WebSocket handler (`sp_routes.py`) with a corrected, modularized runtime. The rewrite fixes device configuration, filtering, feature extraction, and recording behavior identified as incorrect in the prior implementation, while preserving the existing `/sp` API surface so the frontend integration point is unchanged.

## What was corrected
- **Device configuration on connect:** the live session previously never sent gain/operation mode to the device, leaving it at whatever it was last set to. It now sends `Config_GAIN_24` and `Oprate_NOR_OPR` right after connecting, before acquisition starts.
- **No silent simulated fallback:** the simulated-device fallback was removed. If the real device is absent or silent for 2s, the session now surfaces a WebSocket error and aborts instead of quietly switching to simulated data. A live session now requires real hardware.
- **Real-time filtering:** the clinical route now uses stateful real-time filtering instead of `filtfilt`, matching a live streaming context (chain: high-pass 0.5 Hz → low-pass 40 Hz → notch 50 Hz, no CAR/laplacian).
- **Feature extraction correctness:** Welch PSD → band power → `sqrt(power)` in volts for single-band features; power ratio for ratio features (e.g. theta/beta). Baseline is a feature baseline (not a raw-EEG baseline), computed over the first 30s of each round.
- **Single-channel handling:** protocols are one-channel; the protocol electrode label maps to hardware CH0. CH1/CH2 are preserved in the stream but ignored clinically.
- **Session/round timing:** `round_duration = session_duration / session_rounds`; each round is 30s baseline + remaining training time, with rounds advancing automatically under continuous acquisition (no frontend resume step needed).
- **Feedback logic:** strict AND across all feature conditions — `feedback = 1.0` only when every configured feature condition passes.
- **Recording:** sessions now save continuous raw + filtered EEG alongside epoch-level feature/feedback logs and metadata, via the new recording module.

## Architectural changes
The former monolithic handler is now split into dedicated modules under `pyServer/signal_processing/`:
- `session_runner.py` — the async neurofeedback session loop (device acquisition, processing, feedback).
- `runtime_models.py` — session/protocol/feature data structures.
- `baseline.py` — per-round feature baselining.
- `feedback_runtime.py` — feedback evaluation.
- `payloads.py` — outbound WebSocket payload construction.
- `protocol_features.py` — protocol → feature/band configuration.
- `recording.py` — session recording (EEG + feature/feedback logs + metadata).
- `device_acquisition.py` and `preprocessing.py` were updated to match.

`sp_routes.py` is reduced from ~1185 lines to a thin router that delegates to `session_runner.py`.

Frontend touch-points: `WebSocketManager.js` and `SessionRecordingPanel.js` were updated to match the corrected payload/recording behavior. Legacy payload shapes (5-second EEG display window, existing message types) are preserved for frontend compatibility — no `/sp` endpoint signatures changed.

## Not changed
- `/sp` endpoint routes and existing message-type contracts.
- Serial port auto-detection (still no hardcoded COM port).
- Hardware wire protocol (3× little-endian float32 per sample, 12 bytes).

## Known limitations / not verified pre-handover
- Not tested against real serial hardware in the development environment (device unavailable there).
- Full FastAPI app import with all runtime dependencies (`pyserial`, auth libs) was not exercised in the dev sandbox — only source-level compile checks were run there.

See `NEUROFEEDBACK_REWRITE_FINAL_REVIEW.md` for the full list of confirmed clinical/runtime decisions and pre-handover checks already performed.
