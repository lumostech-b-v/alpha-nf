# NeuroFeedback — Backend Master Document

> A complete, A-to-Z technical reference for the `pyServer/` FastAPI backend: architecture,
> the real-time EEG signal-processing pipeline, every calculation it performs, the data model,
> the protocol engine, and the known sharp edges. Written against the code as of branch `dev`
> (API version 2.0.1).

---

## 0. TL;DR — what the backend actually does

The backend is a **FastAPI app on `localhost:8000`** that:

1. Serves CRUD REST APIs for **users, patients, protocols, treatment plans, and sessions** (SQLite via SQLAlchemy).
2. Owns the **EEG device I/O** (real serial I8 hardware, or a simulator/mock fallback).
3. Runs the **real-time neurofeedback DSP loop** over a single WebSocket (`/sp/nfcore_start`):
   acquire → filter → extract band features → collect baseline → derive thresholds →
   score success → stream feedback to the renderer ~1×/sec.

Crucially: **the WebSocket loop does *not* write session results to the database.** It only streams
live values. Persistence of the finished session (success rate, thresholds, CSV) is done by the
**frontend** calling the REST `/sessions` endpoints afterward.

---

## 1. Process & deployment architecture

```
┌────────────────────────────┐     HTTP + WebSocket      ┌─────────────────────────────────────┐
│ Electron renderer (vanilla │  ───────────────────────► │ FastAPI app  (app/core/main.py)       │
│ JS, axios, chart.js)       │     localhost:8000        │                                       │
│  frontend/src/renderer     │ ◄───────────────────────  │  REST routers:                        │
└────────────────────────────┘                           │   /users /patients /sessions          │
        ▲  spawns + manages                               │   /protocols /planning                │
        │                                                 │  WebSocket router: /sp/*              │
┌────────────────────────────┐                            │                                       │
│ Electron main process      │                            │  signal_processing/  (DSP pipeline)   │
│  frontend/src/main.js      │                            │  device_handlers/    (real/mock I/O)  │
│  - kills orphan backends   │                            │     └── SQLite app.db (SQLAlchemy)    │
│  - frees port 8000         │                            └─────────────────────────────────────┘
│  - spawns main.exe         │
└────────────────────────────┘
```

- **Dev:** you run `uvicorn app.core.main:app --reload` yourself; `npm run dev` does **not** start the backend.
- **Prod:** the backend is a PyInstaller **onefile** binary (`pyServer/dist/main.exe`) that Electron spawns from `resources/backend/main.exe`. `main.py::create_app()` is the entry composed object.
- **App composition** (`app/core/main.py:71`): one router included per domain package + the `/sp` signal-processing router. On startup the lifespan handler runs `Base.metadata.create_all`, then the hand-rolled migrations, then `sync_all_default_protocols`.

### Module size map (where the weight is)
| Area | File | ~Lines |
|---|---|---|
| WebSocket DSP monolith | `signal_processing/sp_routes.py` | **969** |
| Hand-rolled migrations | `app/core/migrations.py` | 994 |
| Protocol CRUD + defaults | `app/protocols/crud.py` | 695 |
| Mock device | `device_handlers/mock_device.py` | 586 |
| Planning CRUD | `app/planning/crud.py` | 410 |
| Device acquisition (serial) | `signal_processing/device_acquisition.py` | 256 |

---

## 2. The signal-processing pipeline (the heart)

The DSP stages are composable modules, wired together inside the WebSocket handler.

```
   device/sim          preprocessing            features            normalization-ish        feedback
 ┌────────────┐   ┌────────────────────┐   ┌───────────────┐   ┌────────────────────┐   ┌──────────────┐
 │ acquisition│ → │ PlotterAligned     │ → │ welch_bandpower│ → │ baseline mean +    │ → │ success /    │
 │ read 250   │   │ FilterChain        │   │  → amplitude   │   │ static threshold + │   │ feedback     │
 │ samples/s  │   │ HP0.5→LP40→Notch50 │   │  (µV)          │   │ "z-score"          │   │ mapping      │
 └────────────┘   └────────────────────┘   └───────────────┘   └────────────────────┘   └──────────────┘
                          artifact (informational only, never gates an epoch)
```

### 2.1 Timing / framing constants (`sp_routes.py`)
| Parameter | Value | Meaning |
|---|---|---|
| `epoch_seconds` | `1.0` | Processing window length |
| `overlap` | `0.0` | No overlap — a fresh 1 s window each step |
| `epoch_samples` | `int(1.0 * fs)` = 256 (sim) / 250 (device) | Samples per epoch |
| `step_samples` | `epoch_samples` | Samples read per loop iteration |
| `feedback_interval` | `1.0 s` (tunable 0.1–10 via `update_feedback_interval`) | Feedback push cadence |
| `eeg_update_interval` | `0.1 s` (10 Hz) | EEG waveform push cadence |
| `message_check_interval` | `0.5 s` | Non-blocking inbound command poll |
| `baseline_collection_duration` | `30.0 s` (fixed, all rounds) | Baseline window before thresholds lock |
| `round_duration` | `total_session_duration / session_rounds` | Per-round length |

> ⚠️ **Dead constant:** `sp_routes.py:94` sets `round_duration = 30.0` with a "TEMPORARY TESTING"
> comment, but `:261` immediately overwrites it with `total_session_duration / session_rounds`.
> The 30 s testing value has **no effect** — the real round length is total/rounds.

### 2.2 Acquisition

**Real device** — `signal_processing/device_acquisition.py::DeviceAcquisition`
- Serial @ **115200 baud**, port from `config.json → device.serial_port` or auto-detected (`find_serial_port`, cross-platform: COM* on Windows, `/dev/cu.*` / `/dev/tty.*` on macOS).
- A background thread reads bytes, unpacks **3 little-endian float32** per sample (`struct.unpack('<fff')` = 12 bytes/sample), and pushes `[c1,c2,c3]` into a thread-safe buffer (capped 1000 samples).
- `read_samples(n)` pops `n` rows; **channel count is hard-fixed to 3** (the serial protocol). If a caller requests more channels, channels are **cycled/repeated** to fill (`out[i, ch] = out[i, ch % 3]`).

**Simulator fallback** — `signal_processing/acquisition.py::SimulatedAcquisition`
- Used whenever the real device fails or sends no data within 2 s (`sp_routes.py:206-235`).
- Synthesises EEG as a sum of sinusoids (per channel, µV amplitudes):
  - alpha 10 Hz @ 50 µV, beta 20 Hz @ 20 µV, theta 6 Hz @ 30 µV, drift 1 Hz @ 10 µV, Gaussian noise @ 5 µV.
- **Real-time pacing:** sleeps `num_samples/fs` of wall-clock per read so the loop runs at true device speed (otherwise it free-runs and artifact injection collapses).
- **Deterministic artifact injection** on an 18 s cycle for UI testing: eye-blink (t=3 s, derivative-of-Gaussian ~90 µV ptp), high-amplitude spike (t=9 s, ~260 µV), EMG burst (t=15 s, 70 Hz). Amplitudes are tuned against the detector thresholds.

> ⚠️ **fs inconsistency:** `cfg.fs = 256` (`signal_processing/config.py`), but the hardware and
> `config.json` use **250 Hz**. `DeviceAcquisition` is constructed with `fs=cfg.fs` (256), so its
> `self.fs` becomes 256 even though the I8 streams at 250. Welch frequency bins are computed with the
> reported `fs`, so on real hardware band edges are scaled by 256/250 ≈ **+2.4%** (e.g. a "12 Hz"
> bin is really ~11.7 Hz). Harmless for the simulator (self-consistent at 256); a real bug on device.

### 2.3 Preprocessing — `PlotterAlignedFilterChain` (`preprocessing.py:88`)

The live path deliberately mirrors `realtime_plotter_mac.py` for visual parity — **no common-average
reference (CAR)** is applied in the live loop. Three zero-phase (`filtfilt`) Butterworth stages:

| Stage | Design | Cutoff |
|---|---|---|
| High-pass | `butter(4, 0.5, 'high')` | 0.5 Hz (drift removal) |
| Low-pass | `butter(4, 40.0, 'low')` | 40 Hz |
| Notch (band-stop) | `butter(4, [49, 51], 'bandstop')` | 50 Hz ±1 (mains) |

- Applied with `filtfilt` (zero phase, non-causal) on each 1 s buffer. Skipped if `< min_length` (50) samples.
- The module *also* contains a `RealTimeFilter` (stateful `sosfilt`, causal) and offline helpers
  (`common_average_reference`, `laplacian_reference`, `design_bandpass`, `preprocessing_pipeline`)
  — **but the live loop uses only `PlotterAlignedFilterChain`.** The others are available/legacy.

> Note: `config.py` advertises `bandpass=(0.5, 20.0)` and `notch=50`, but the live chain actually
> low-passes at **40 Hz** (hard-coded in `PlotterAlignedFilterChain`), not 20. The 40 Hz LP is what
> lets the EMG detector see >40 Hz content on the *raw* signal.

### 2.4 Feature extraction — band power → amplitude (`features.py`)

The core quantity is **band power via Welch's method**, then converted to **amplitude (µV)**:

```
welch_bandpower(x, fs, band):
    nperseg = min(fs*2, n_samples)          # ≤ 2 s segments; here epoch=1 s → nperseg = fs
    f, Pxx = scipy.signal.welch(x, fs, nperseg, window='hann')   # PSD, µV²/Hz
    df  = f[1]-f[0]                          # bin width ≈ 1 Hz (since nperseg≈fs)
    idx = (f >= low) & (f <= high)
    power = Σ Pxx[idx] * df                  # band power, µV²   (rectangular integration of PSD)
    return sqrt(power) if return_amplitude else power            # amplitude µV  (live loop uses µV)
```

- The live loop calls `compute_features(x_clean * 1e6, fs, bands, return_amplitude=True)` — i.e.
  signal is converted **volts → µV** first (`VISUALIZATION_SCALE = 1e6`), so features come out in **µV**.
- **Frequency resolution** is ~1 Hz (1 s Hann window). Narrow bands (e.g. SMR 12–15 Hz) therefore
  integrate only ~3–4 PSD bins.
- **Per-channel vs all-channel:** a band may carry a 3rd tuple element = channel index. If valid,
  the feature is computed on that single channel; otherwise on all acquired channels and then
  `np.nanmean`-reduced to a scalar in the loop (`sp_routes.py:539`).

#### Ratio features (e.g. Theta/Beta Ratio)
A band config of the form `{"numerator": <band>, "denominator": <band>, ...}` is computed as:
```
ratio = amplitude(numerator_band) / amplitude(denominator_band)
```
with channel-specific variants supported, and divide-by-zero guarded (`denominator==0 → 1e-10`, or
single-channel `→ 0.0`). This is how the ADHD **TBR** protocol works:
`theta_beta_ratio = amp(4–8 Hz) / amp(15–18 Hz)`, mode `inhibit`.

### 2.5 Baseline & threshold derivation (`sp_routes.py:541-576`)

During the **first 30 s of every round** (`baseline_collection_duration`), each selected feature's
per-epoch scalar is appended to a per-feature buffer. When `round_elapsed ≥ 30 s` the baseline
**locks once** and static thresholds are derived from the baseline mean:

```
baseline_mean = mean(baseline_buffer[feature])           # over ~30 epochs

if mode == "inhibit":                                    # we want the band to go DOWN
    threshold = baseline_mean * (1 - inhibit_pct)        # inhibit_pct default 0.20
else:  # "enhance"                                        # we want the band to go UP
    threshold = baseline_mean * (1 + reward_pct)         # reward_pct  default 0.20
```

- `reward_threshold_percentage` / `inhibit_threshold_percentage` come from the start command
  (default **20%**). So an enhance target sits 20% above baseline; an inhibit target 20% below.
- Baseline is **per-round** (`build_round_state()` re-creates buffers each round), so each round
  re-baselines for 30 s. A round shorter than 30 s never leaves baseline.

#### The "z-score" (`sp_routes.py:588-592`)
The streamed `z_scores[feature]` is **not a statistical z-score** (no standard deviation):
```
z = (value - threshold) / abs(threshold)        # relative deviation from threshold
```
It's a normalized distance from the locked threshold, used to drive the sigmoid/linear mappings.
(The `BaselineManager`/`AdaptiveThreshold` classes in `normalization.py` *do* implement a true
mean/std z-score and an adaptive threshold, but the live loop does **not** use them — it uses the
inline static-threshold logic above. Those classes are effectively dormant.)

### 2.6 Smoothing (`smoothing.py` + inline EMA)

- `smoothing.py::EMA` is the general exponential-moving-average helper: `v ← α·new + (1-α)·v`.
- The live loop applies its **own inline EMA** to the *displayed* threshold only, to reduce visual
  jitter (`sp_routes.py:730`): `α = 0.1`. The **scoring** always uses the raw locked threshold; only
  the number shown to the clinician is smoothed.

### 2.7 Success scoring & feedback (`sp_routes.py:626-675`)

Three mapping types (start command `mapping`, default `fixed_threshold`):

| `mapping` | Per-feature success | Notes |
|---|---|---|
| `fixed_threshold` | enhance: `1 if value ≥ threshold else 0`; inhibit: `1 if value ≤ threshold else 0` | Binary |
| `sigmoid` | `sigmoid_map(z, gain=5, shift=0, clip=0..1)` = `1/(1+e^(-5z))`; `z→-z` if inhibit | Continuous 0–1 |
| `linear` | `linear_map(z, a=0.5, b=0.5, clip=0..1)` = `clip(0.5z+0.5)`; `z→-z` if inhibit | Continuous 0–1 |

Aggregation:
```
feedback_val = mean(per-feature success)                 # the continuous "reward" 0..1 streamed each second

# Epoch win = ALL features must win simultaneously (binarised at 0.5):
epoch_binary = 1.0 if (every feature's binary success == 1) else 0.0

session_epoch_history.append(epoch_binary)               # one entry per epoch, survives round resets
overall_success_rate = mean(session_epoch_history)       # the headline % shown to clinician
```

- So **`feedback`** is a soft per-second reward signal (drives the visual/animation, e.g. the
  "FEEDBACK RATE 49" gauge = `feedback × 100`), while **`overall_success_rate`** is the strict
  "all bands on target at once" hit-rate across the whole session (the true "% won").
- `threshold_stats[feature]` is streamed only to supply **`current_threshold`** (chart threshold
  line fallback on the frontend). It no longer carries any rolling success rate.

> 🧹 **Removed dead code (cleanup):** the former per-feature rolling success history
> (`threshold_success_history` = `deque(maxlen=60)`), the unread `session_success_history`, and the
> `threshold_stats` fields `success_rate` / `samples_count` / `target_success_rate` /
> `recent_values_mean` / `recent_values_std` were deleted. Their only consumer was the frontend
> `getCurrentSuccessRates()` → `getSessionPerformanceSummary()` chain, which had **no callers** —
> the values were computed and transmitted but never rendered. `feedback`, `overall_success_rate`,
> the band bars, and the threshold line are unaffected. The dead frontend getters were removed too.

### 2.8 Artifact detection (`artifact.py`) — informational only

Run each epoch but **never gate/skip** an epoch (blocking would stall the baseline). On detection the
loop just emits a `{"type":"artifact"}` message. Cascade (first hit wins):

1. **Amplitude** — `amplitude_threshold_epochs(x_uv, threshold=500_000 µV)`. The 500,000 µV gate in the
   live loop is effectively *disabled* (no real EEG reaches it); the meaningful amplitude test lives in
   the simulator's tuned injection, not here.
2. **Eye blink** — `eye_blink_detection`: 3 Hz low-pass (`sosfiltfilt`), flag if peak-to-peak of the
   slow component `> 60 µV`.
3. **EMG** — `emg_detection` on the **raw** (unfiltered) signal: band-pass 40–120 Hz, flag if
   `RMS(EMG band) / RMS(total) > 0.35`. Must use raw because the 40 Hz LP removes EMG from the clean signal.

---

## 3. The WebSocket session state machine (`/sp/nfcore_start`)

A single long-lived coroutine. Lifecycle:

```
accept → send "welcome" → receive start_command → echo
   ↓ (start_command.start == true)
load protocol (DB) OR legacy inline bands  →  resolve patient name  →  validate features
   ↓
init device (try real, 2 s data probe → fall back to SimulatedAcquisition)
   ↓
build round_state (baseline buffers, thresholds, success history)
   ↓
WHILE current_round ≤ session_rounds:
     if round_elapsed ≥ round_duration:
         send "round_complete"
         if last round:  set waiting_for_resume → await "resume"/"stop" (≤300 s) → break
         else:           await "resume"/"stop" → current_round++ → rebuild round_state → send "round_start"
     else:
         poll inbound msgs (update_feedback_interval / stop)   [every 0.5 s, 1 ms timeout]
         block = acq.read_samples(step_samples)                [the real ~1 s pace-gate]
         buffer = last epoch_samples of vstack(buffer, block)
         x_clean = filter_chain.process(buffer)
         send "eeg_data"        (≤10 Hz, scaled to µV, 3 channels, signal_stats)
         artifact check → maybe send "artifact"
         features = compute_features(x_clean*1e6, …)
         update baseline buffers / lock thresholds at 30 s
         compute z_scores, success, feedback_val
         send "session_update"  (≤1 Hz: time, overall_success_rate, session_info)
         send "feedback"        (≤feedback_interval: per-feature values, thresholds, band_info, baseline_status, eeg_data)
     sleep 0.01
   ↓
finally: send Contl_STOP_AQU to device, acq.stop(), drop from active_connections
```

### Control messages
| Inbound (renderer→server) | Effect |
|---|---|
| `{start:true, …}` | Begin session (carries protocol_id/user_id, durations, rounds, mapping, threshold %s, patientId) |
| `{type:"resume"}` | Advance past a `round_complete` gate (next round / finalize) |
| `{type:"stop"}` | Send `Contl_STOP_AQU`, return (ends session) |
| `{type:"update_feedback_interval", interval}` | Re-throttle feedback (0.1–10 s) |

| Outbound (server→renderer) | When |
|---|---|
| `welcome`, `echo` | Handshake |
| `eeg_data` | ≤10 Hz waveform + stats |
| `artifact` | On detection |
| `session_update` | ≤1 Hz |
| `feedback` | ≤feedback_interval (the big payload) |
| `round_complete` / `round_start` | Round boundaries |
| `error` | Exceptions / bad params |

- `/sp/device/status` (GET) — reports serial port availability.
- `/sp/nfcore_stop` (POST) — closes all active WebSocket connections (`active_connections` WeakSet).

> ⚠️ **Architectural note:** all of transport, the round state machine, DSP orchestration, and payload
> building live in this one ~970-line handler. There is **no DB write here** — session results are
> not persisted by the backend loop. The frontend is responsible for POSTing the finished session.

---

## 4. Protocol engine — from JSON to DSP

### 4.1 Where protocols live
- **Seed definitions:** `app/protocols/crud.py::create_default_protocols` (and `protocols/*.json` at repo
  root: adhd, anxiety, depression, insomnia, migraine, ocd, ptsd, theta_beta_ratio).
- **Storage:** table `protocol_library`, column `features` = **JSON** (`app/protocols/models.py`).
  Protocols are **user-owned** (`user_id` FK), not patient-specific. `is_default` protocols can't be deleted.
- On startup, `sync_all_default_protocols` refreshes default protocols for all users.

### 4.2 The `features` JSON schema
```jsonc
{
  "frequency_bands": [
    // regular band:
    { "frequency_range": [12.0, 15.0], "channels": ["Cz"], "type": "reward" },   // → mode "enhance"
    { "frequency_range": [2.0, 7.0],   "channels": ["Cz"], "type": "inhibit" },  // → mode "inhibit"
    // ratio band:
    { "type": "ratio", "name": "theta_beta_ratio",
      "numerator": "theta", "denominator": "beta",
      "numerator_range": [4.0, 8.0], "denominator_range": [15.0, 18.0],
      "mode": "inhibit", "channels": ["Cz"] }
  ],
  "combination_method": "weighted_average"   // optional; default weighted_average
}
```

### 4.3 Conversion to DSP format — `app/protocols/utils.py::protocol_to_signal_processing_format`
Produces exactly what the WebSocket loop consumes:
- `bands` — `{name: (low, high)}` or `(low, high, channel_idx)` for regular; `{numerator, denominator, …}` for ratio.
- `feature_modes` — `{name: "enhance"|"inhibit"}` (reward→enhance, inhibit→inhibit).
- `feature_weights` — `{name: weight}` (default 1.0; used by `weighted_average`).
- `selected_features` — the bands to score, **excluding helper sub-bands** added only to support a ratio
  (e.g. raw `theta`/`beta` added so a TBR ratio can be computed but not charted as their own bars).
- `combination_method` — from the protocol or default `weighted_average`.

**Sub-band resolution order** (for ratio numerator/denominator referenced by name): explicit
`*_range` from UI → `UI_PREDEFINED_BANDS` label table → `cfg.bands` → parsed numeric label like `"10–20"`
→ else raise. This backward-compat ladder lets old protocols (saved before ranges were persisted) still resolve.

### 4.4 Feature combination (`sp_routes.py:606-624`)
With one feature, combined value = that value. With multiple:
| `combination_method` | Formula |
|---|---|
| `weighted_average` (default) | `np.average(values, weights=feature_weights)` |
| `product` | `Π values` |
| `max` | `max(values)` |
| `min` | `min(values)` |
| (fallback) | `mean(values)` |

> Note: `combined_value` is streamed for display, but the **success/overall_success_rate** logic uses the
> per-feature threshold tests (Section 2.7), *not* `combined_value`.

---

## 5. Data model (SQLite via SQLAlchemy)

No Alembic — startup runs `create_all` then hand-rolled SQL in `app/core/migrations.py`.

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, username, hashed_password, … | JWT auth (`app/core/auth.py`) |
| `patients` | id, first_name, last_name, doctor_id (FK users), is_active | Owned by a doctor |
| `disorders` | id, patient_id, **version**, QEEG flags (high_tbr, paf_slow, …), symptom flags (isi, gad7, phq), cognitive flags | **Versioned** per patient — each update = new row |
| `blocks` | id, patient_id, protocol_id (FK), start_session, end_session | A treatment-plan block = a range of session #s on one protocol; cascade-deletes its sessions |
| `checkpoints` | id, patient_id, user_id, session_value, checkpoint_type | Plan milestones |
| `protocol_library` | id, name, note, **features (JSON)**, is_default, is_active, user_id | The protocol engine source |
| `sessions` | id, patient_id, doctor_id, block_id, session_type, protocol_type, start/end_time, duration_seconds, **channels (JSON text)**, sample_rate, session_rounds, **overall_success_rate**, total_reward_time_seconds, total_artifact_time_seconds, average_impedance, **baseline_data (JSON)**, **thresholds (JSON)**, raw_data_file, processed_data_file, doctor_notes, feedback_type, synced/sync_timestamp | Written by the **frontend** via REST after a session, not by the WS loop |

- **Database path** (`app/core/database.py`): env `DATABASE_URL` wins; else frozen-exe dir (if writable) →
  OS user-data dir (`~/Library/Application Support/NeuroFeedbackSystem` on macOS, `%LOCALAPPDATA%` on Windows)
  → dev: `pyServer/app.db`. SQLite with `check_same_thread=False`.

---

## 6. REST API surface (by domain router)

| Prefix | Highlights |
|---|---|
| `/users` | register/login (JWT), CRUD |
| `/patients` | CRUD, list by doctor |
| `/protocols` | CRUD protocol library, defaults |
| `/planning` | disorders (versioned), blocks, checkpoints — the treatment-plan builder |
| `/sessions` | create, complete (`PATCH /{id}/complete`), update, by-patient / by-doctor / by-protocol / by-date-range, sync flags |
| `/sp` | `GET /device/status`, `WS /nfcore_start`, `POST /nfcore_stop` |
| `/`, `/health` | liveness |

- **Auth:** `app/core/auth.py` — JWT, `SECRET_KEY` from `JWT_SECRET_KEY` (insecure dev default; **must** be
  set in prod). `get_current_user` / `get_current_user_optional` dependencies.
- **CORS:** `*` by default, override via `CORS_ORIGINS`.

---

## 7. Device modes & config

`device_handlers/device_manager.py` reads `config.json → device.mode`:
- `Auto` / `real` → try real I8 via `pythonnet` + `I8Library1.dll`; on failure → `mock_device.py`.
- `demo` → straight to mock.

But note: the **live WebSocket loop does not go through `device_manager`** — it directly instantiates
`DeviceAcquisition` (serial) and falls back to `SimulatedAcquisition`. The `mock_device.py` / `device_manager`
path is used by the standalone collector/test tooling (`eeg_data_collector.py`, `test_device_acquisition.py`).

`config.json` is the single source of truth for device behavior: `serial_port`, mock channel/sampling params
(8 main channels, 250 Hz, gain 24), and the collector's 24 channel labels (Ex1–A2).

---

## 8. Worked example — ADHD TBR session, end to end

1. Renderer opens `WS /sp/nfcore_start`, sends
   `{start:true, protocol_id:<M1 TBR>, user_id, patientId, session_rounds:5, session_duration:1500, mapping:"fixed_threshold", reward_threshold_percentage:20, inhibit_threshold_percentage:20}`.
2. Backend loads protocol M1 → `protocol_to_signal_processing_format` →
   `bands = { theta:(4,8), beta:(15,18) [helpers], theta_beta_ratio:{num:theta,den:beta} }`,
   `feature_modes = { theta_beta_ratio: "inhibit" }`, `selected_features = ["theta_beta_ratio"]`.
3. `round_duration = 1500/5 = 300 s`. Device probe fails on a dev Mac → `SimulatedAcquisition(fs=256, 3ch)`.
4. Each second: read 256 samples → HP/LP/Notch filtfilt → `amp(4–8Hz)`, `amp(15–18Hz)` →
   `TBR = amp_theta / amp_beta`.
5. First 30 s: collect TBR into baseline buffer. At 30 s: `baseline_mean = mean(buffer)`,
   and since mode=inhibit → `threshold = baseline_mean * (1 - 0.20)` = 80% of baseline.
6. From 30–300 s: each epoch, `success = 1 if TBR ≤ threshold else 0` (we want theta/beta *down*).
   `epoch_binary` feeds `session_epoch_history`; `overall_success_rate = mean(history)`.
7. `feedback` (0/1 here) streamed each second drives the reward animation; `session_update` streams the
   running success %. At 300 s → `round_complete`; renderer sends `resume` → round 2 re-baselines, etc.
8. After round 5 + resume, loop finalizes. **The frontend** then POSTs the session row
   (overall_success_rate, thresholds, baseline_data, CSV file path) to `/sessions`.

---

## 9. Known sharp edges & gotchas (verified in code)

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **fs mismatch 256 vs 250** — `cfg.fs=256` used for real device that streams 250 Hz | `config.py:11`, `sp_routes.py:207` | Band edges off by ~2.4% on real hardware |
| 2 | **Dead "TEMPORARY TESTING" round_duration=30** overwritten 167 lines later | `sp_routes.py:94` vs `:261` | None (confusing only) — real value is total/rounds |
| 3 | **"z_score" is not a z-score** — `(value−threshold)/|threshold|`, no std | `sp_routes.py:590` | Misnamed; fine for mapping, but don't trust as statistical z |
| 4 | **`normalization.py` (BaselineManager/AdaptiveThreshold) is dormant** — live loop uses inline static thresholds instead | `normalization.py` | The "adaptive threshold" feature isn't actually wired into the live loop |
| 5 | **Live amplitude artifact gate = 500,000 µV** → effectively disabled | `sp_routes.py:501` | Amplitude artifacts only flagged via blink/EMG in practice |
| 6 | **No CAR / referencing in live path** | `PlotterAlignedFilterChain` | Single-channel placements unaffected; multi-channel has no spatial filter |
| 7 | **Real device hard-fixed to 3 channels**, extra channels are cycled/repeated | `device_acquisition.py:69, 223` | "active_channel_count" defaults to 1 (CH1) unless a band names channels |
| 8 | **WS loop never persists results** — relies entirely on frontend REST | `sp_routes.py` (no db.add) | If the renderer crashes post-session, the session is lost |
| 9 | **Migrations re-inspect schema on every startup** (no versioning) | `app/core/migrations.py` (~994 lines) | Slow startup, hard to reason about; Alembic would help |
| 10 | **LP cutoff really 40 Hz**, though `config.py` says bandpass `(0.5, 20)` | `preprocessing.py:103` | Config value is misleading; 40 Hz is intentional (needed for EMG detect) |
| 11 | **`config.py:17` comment vs reality** — declares notch 50 Hz fixed (EU mains); US 60 Hz would need a change | `preprocessing.py:105` | Region-locked to 50 Hz |

---

## 10. Quick reference — the calculations in one place

```
# Filtering (per 1 s buffer, zero-phase)
x_clean = notch50( lp40( hp0.5( buffer ) ) )                      # Butterworth order 4, filtfilt

# Band power → amplitude (per band, per epoch)
Pxx        = welch(x_clean_µV, fs, nperseg=fs, hann)             # PSD µV²/Hz
power      = Σ Pxx[f∈band] · df                                  # µV²
amplitude  = sqrt(power)                                          # µV   ← the feature value
ratio      = amplitude(num_band) / amplitude(den_band)           # for ratio features

# Baseline (first 30 s of each round)
baseline_mean = mean(per-epoch amplitudes over baseline window)

# Threshold (locked once per round)
threshold = baseline_mean · (1 + reward_pct)   if enhance        # default reward_pct = 0.20
threshold = baseline_mean · (1 − inhibit_pct)  if inhibit        # default inhibit_pct = 0.20

# Normalized deviation ("z_score")
z = (value − threshold) / |threshold|

# Per-feature success
fixed:   enhance → 1 if value ≥ threshold ;  inhibit → 1 if value ≤ threshold
sigmoid: success = 1/(1+e^(−5·z))            (z negated for inhibit)
linear:  success = clip(0.5·z + 0.5, 0, 1)   (z negated for inhibit)

# Aggregation
feedback_val         = mean(per-feature success)                 # soft reward 0..1, streamed each second
epoch_binary         = 1 if ALL features' binary success == 1 else 0
overall_success_rate = mean(epoch_binary over whole session)     # headline %

# Display threshold smoothing (display only, not scoring)
shown_threshold ← 0.1·threshold + 0.9·shown_threshold            # EMA α=0.1
```

---

## 11. Changelog

**Dead-code removal (rolling success history).** Deleted the per-feature rolling success metric that
was computed every epoch but never rendered:
- **Backend** (`signal_processing/sp_routes.py`): removed `threshold_success_history` (`deque(maxlen=60)`)
  from `build_round_state()`, removed the unread `session_success_history` accumulator, removed the
  per-epoch appends and the now-unused `valid_features_this_epoch` list, slimmed `threshold_stats[feature]`
  down to just `current_threshold` (the only field the frontend reads), and dropped the now-unused
  `defaultdict` import.
- **Frontend** (`renderer/js/core/WebSocketManager.js`): removed `getCurrentSuccessRates()` and
  `getSessionPerformanceSummary()` (the only — and orphaned — consumers).
- **Unaffected:** `feedback` (reward gauge), `overall_success_rate` (the headline "% won",
  via `session_epoch_history`), the band amplitude bars, and the threshold line.

---

*Generated from a full read of `pyServer/signal_processing/*`, `app/**`, `config.json`, and
`protocols/*.json`. Line references are accurate as of branch `dev`, API v2.0.1.*
