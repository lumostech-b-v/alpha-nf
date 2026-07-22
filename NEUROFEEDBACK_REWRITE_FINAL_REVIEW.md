# Neurofeedback Rewrite Final Review

## Scope
This package replaces the clinical neurofeedback runtime centered on `pyServer/signal_processing/sp_routes.py` and the modules directly called by that route. Dead/legacy code outside this path was left in place unless it interfered with the new runtime.

## Confirmed clinical/runtime decisions implemented
- Existing `/sp` endpoints preserved.
- Real hardware only; no silent simulated fallback.
- Serial port auto-detection preserved; no hardcoded COM port.
- Device settings: baudrate 115200, Fs=250 Hz, gain=24, operation command `Oprate_NOR_OPR`, start command `Contl_STRT_AQU`, stop command `Contl_STOP_AQU`.
- Hardware stream fixed at 3 floats per sample = 12 bytes, little-endian `<fff`.
- Device values are volts; all clinical calculations remain in volts.
- Current protocols are one-channel: protocol electrode label maps to hardware CH0; CH1/CH2 are preserved but ignored clinically.
- Runtime step: 0.5 s = 125 samples.
- Clinical epoch: 1.0 s = 250 samples.
- EEG plot display: flowing 5 s = 1250 samples, display-scaled to µV only, fixed visual range ±150 µV.
- Stateful real-time filtering replaces `filtfilt` in the clinical route.
- Filter chain: high-pass 0.5 Hz, low-pass 40 Hz, notch 50 Hz, no CAR/laplacian.
- Feature extraction: Welch PSD -> band power -> sqrt(power) in volts for single-band features; power ratio for ratio features.
- Baseline is feature baseline, not raw EEG baseline.
- Baseline duration: 30 s per round.
- Session duration is total session time; `round_duration = session_duration / session_rounds`; each round has 30 s baseline + remaining training time.
- Rounds advance automatically with continuous acquisition; no frontend resume needed.
- Strict AND feedback: all feature conditions must pass for `feedback=1.0`.
- Artifact logic is not used for clinical calculation in this version.
- Recording saves continuous raw+filtered EEG and epoch-level feature/feedback logs with metadata.

## Modified / added files
- `pyServer/signal_processing/sp_routes.py`
- `pyServer/signal_processing/session_runner.py`
- `pyServer/signal_processing/runtime_models.py`
- `pyServer/signal_processing/protocol_features.py`
- `pyServer/signal_processing/baseline.py`
- `pyServer/signal_processing/feedback_runtime.py`
- `pyServer/signal_processing/preprocessing.py`
- `pyServer/signal_processing/device_acquisition.py`
- `pyServer/signal_processing/recording.py`
- `pyServer/signal_processing/payloads.py`
- `frontend/src/renderer/js/core/WebSocketManager.js`
- `frontend/src/renderer/js/features/SessionRecordingPanel.js`

## Checks performed
- Python compile check for `pyServer/signal_processing` and `pyServer/app`: passed.
- JavaScript syntax check for modified frontend files: passed.
- Parsed all project protocol JSON files: ADHD, Anxiety, Depression, Insomnia, Migraine, OCD, PTSD, Theta/Beta Ratio: passed.
- Mock Welch feature computation for all protocol entries: passed.
- DB-style signal-processing config conversion including a ratio feature: passed.
- EEG display payload shape/range/unit consistency for 5-second display window: passed.
- Feedback payload uses the same 5-second display window for legacy EEG plot compatibility: passed.

## Not verified in this environment
- Real serial hardware streaming, because the device is not connected here.
- Full FastAPI application import with all runtime dependencies, because this sandbox does not include every dependency from `requirements.txt` such as `pyserial` / auth libraries. Source-level compile checks passed, and `requirements.txt` includes the needed packages.

## First hardware test checklist
1. Confirm the selected COM port is detected correctly.
2. Confirm startup commands are accepted by the device: `Config_GAIN_24`, `Oprate_NOR_OPR`, `Contl_STRT_AQU`.
3. Confirm the backend receives exactly 125 samples per 0.5-second step.
4. Confirm signal values are in volts and plausible after gain=24.
5. Confirm no clipping/flat/all-zero device stream.
6. Confirm the frontend plot shows a flowing 5-second EEG strip.
7. Confirm baseline lasts 30 seconds per round.
8. Confirm round transitions happen automatically.
9. Confirm hardware failure shows frontend error and does not mark the session completed.
