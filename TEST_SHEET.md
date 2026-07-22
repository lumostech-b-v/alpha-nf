# Test Sheet — Build Handover to Testing

**Build:** v2.0.5 — `signal` branch (corrected neurofeedback runtime)
**Date:** 2026-07-22
**Prerequisite:** Real EEG device connected and powered on. This build has no simulated-device fallback — a live session cannot be tested without hardware.

## How to fill this out
For each row, run the step, mark **Pass / Fail**, and note the observed behavior (values, screenshots, log lines) in Notes — especially for anything marked Fail.

## 1. Device connection & startup

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 1.1 | Launch app with device connected via serial | COM port is auto-detected; no manual port entry needed | | |
| 1.2 | Start a live session | Device receives `Config_GAIN_24`, then `Oprate_NOR_OPR`, then `Contl_STRT_AQU`, in that order, before acquisition begins | | |
| 1.3 | Start a live session with the device physically disconnected | Session does not silently proceed; a clear error is shown and the session does not start | | |
| 1.4 | Start a session, then unplug/silence the device mid-session (>2s no data) | Frontend shows a WebSocket error; session aborts; session is **not** marked completed | | |

## 2. Data acquisition & display

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 2.1 | Observe backend sample rate during a session | Exactly 125 samples received per 0.5s step (250 Hz effective) | | |
| 2.2 | Observe EEG values | Values are in plausible ranges for volts at gain=24 (no clipping, no flat-line, no all-zero stream) | | |
| 2.3 | Watch the frontend EEG plot | Flowing 5-second strip (1250 samples), scaled to µV, fixed visual range ±150 µV | | |
| 2.4 | Compare protocol electrode channel to device stream | Only CH1/CH0 (per mapping) is used clinically; CH2/CH3 present in stream but not used in calculations | | |

## 3. Baseline, rounds, and timing

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 3.1 | Start a round | First 30 seconds is baseline; no feedback/success scoring during this window | | |
| 3.2 | Let a round complete | Round duration = `session_duration / session_rounds`; remaining time after baseline is training | | |
| 3.3 | Let multiple rounds run back to back | Rounds advance automatically with continuous acquisition — no manual "resume" action needed from the frontend | | |
| 3.4 | Run a full multi-round session | Total elapsed time matches configured session duration | | |

## 4. Feedback logic

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 4.1 | Use a protocol with multiple feature conditions | `feedback = 1.0` only when **all** feature conditions pass simultaneously (strict AND); any single failing condition yields no reward | | |
| 4.2 | Use a single-band protocol (e.g. one reward/inhibit band) | Feature value reflects `sqrt(power)` in volts, not raw power | | |
| 4.3 | Use a ratio protocol (e.g. theta/beta ratio) | Feature value reflects the power ratio, threshold/scoring behaves sensibly | | |

## 5. Recording & session completion

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 5.1 | Complete a full session | Continuous raw + filtered EEG recorded for the whole session | | |
| 5.2 | Inspect recorded output | Epoch-level feature and feedback logs present, with metadata (patient/protocol/session info) | | |
| 5.3 | Complete a session normally | Frontend POSTs the finished session to `/sessions` and it appears in session history | | |
| 5.4 | Abort a session via device failure (see 1.4) | Session is not saved as completed; partial recording (if any) does not corrupt session history | | |

## 6. Regression checks (existing behavior that must still work)

| # | Step | Expected result | Pass/Fail | Notes |
|---|------|------------------|-----------|-------|
| 6.1 | Load each bundled protocol (ADHD, Anxiety, Depression, Insomnia, Migraine, OCD, PTSD, Theta/Beta Ratio) | All load and start without error | | |
| 6.2 | Existing `/sp` WebSocket message types (frontend ⇄ backend) | No changes to contract — frontend session UI behaves as before aside from the corrections above | | |
| 6.3 | CSV export after a completed live session | Export still works and contains sensible values | | |

## Sign-off

- Tester name: ______________________
- Date tested: ______________________
- Overall result: ☐ Pass  ☐ Pass with notes  ☐ Fail
- Blocking issues found: ______________________
