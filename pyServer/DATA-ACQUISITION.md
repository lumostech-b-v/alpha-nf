# How EEG Data Gets From Hardware Into the App

A walkthrough of the live acquisition path, from the headset's serial cable to the
feedback the clinician sees on screen. Written from the code as it actually runs
today — not from what the file names imply.

## The short version

```
I8 headset --serial(115200 baud)--> DeviceAcquisition --1s epochs--> filter
    --> features --> baseline/threshold --> feedback score --> WebSocket --> renderer
```

There is also an `I8Library1.dll` in `device_handlers/`, loaded via `pythonnet`.
**It is not part of this path.** It's only used by a standalone script
(`device_handlers/eeg_data_collector.py`) that isn't wired into the live session.
The real-time pipeline talks to the device over a plain serial port instead. See
[Appendix: the DLL path](#appendix-the-unused-dll-path) at the bottom.

---

## 1. Finding the serial port

`signal_processing/device_acquisition.py` either uses a fixed port from
`config.json` (`device.serial_port`), or auto-scans and ranks candidates by
description:

```python
def find_serial_port():
    ports = glob.glob('/dev/tty.*') + glob.glob('/dev/cu.*')  # macOS/Linux
    usb_ports = [port for port in ports if 'usb' in port.lower()]
    eeg_ports = [port for port in ports
                 if any(k in port.lower() for k in ['serial', 'i8', 'eeg', 'neuro', 'brain'])]
    ...
    return usb_ports + modem_ports + eeg_ports + other_ports
```

On Windows this scans COM ports via `serial.tools.list_ports` instead of `/dev/tty.*`.

## 2. Opening the connection

`DeviceAcquisition.__init__` opens the port at **115200 baud, 8N1**, then starts a
background reader thread:

```python
self.serial_port = serial.Serial(
    port=self.com_port,
    baudrate=self.baudrate,
    bytesize=serial.EIGHTBITS,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    timeout=1
)
```

## 3. Decoding the wire protocol

The reader thread decodes raw bytes **12 bytes at a time as 3 little-endian
floats** — the protocol is hardcoded to exactly 3 channels:

```python
bytes_per_sample = 12  # 3 floats * 4 bytes = 12 bytes
...
val1, val2, val3 = struct.unpack('<fff', sample_bytes)
with self.data_lock:
    self.data_buffer.append([val1, val2, val3])
    if len(self.data_buffer) > 1000:
        self.data_buffer.pop(0)  # drop oldest once the ring buffer is full
```

Consumers pull samples out with `read_samples(n)`, which blocks (with a timeout)
until enough samples have arrived.

## 4. Starting a session — `signal_processing/sp_routes.py`

The WebSocket endpoint `/sp/nfcore_start` drives the whole session. It tries the
real device first, and **falls back to a simulator if the device is silent**:

```python
try:
    acq = DeviceAcquisition(target_channels=3, fs=cfg.fs, verbose=True)
    acq.send_command("Contl_STRT_AQU")
    test_block = acq.read_samples(10, timeout=2.0)
    if test_block is None or test_block.size == 0:
        use_simulated = True   # device connected but not sending data
except Exception:
    use_simulated = True       # device not found at all

if use_simulated:
    from signal_processing.acquisition import SimulatedAcquisition
    acq = SimulatedAcquisition(fs=cfg.fs, channels=3)
```

This means the app is always usable in a demo, even with no hardware plugged in.

## 5. Reading 1-second epochs

The main loop pulls one second of samples at a time and keeps a rolling buffer:

```python
epoch_seconds = 1.0
epoch_samples = int(epoch_seconds * fs)

block = acq.read_samples(step_samples, timeout=10.0)
buffer = np.vstack([buffer, block])
if buffer.shape[0] > epoch_samples:
    buffer = buffer[-epoch_samples:, :]   # keep only the most recent epoch
```

## 6. Filtering

Each epoch is run through `PlotterAlignedFilterChain` (`preprocessing.py`) —
high-pass → low-pass → notch — matching the offline reference plotter:

```python
filter_chain = PlotterAlignedFilterChain(fs=fs)
x_clean = filter_chain.process(buffer)
```

## 7. Sending live visualization data

The filtered signal (scaled to µV) is pushed to the renderer at ~10 Hz so the
live EEG chart updates smoothly:

```python
if current_time - last_eeg_send >= eeg_update_interval:  # 0.1s -> 10 Hz
    await websocket.send_json({
        "type": "eeg_data",
        "eeg_data": {
            "channels": eeg_visualization_data,
            "sampling_rate": int(fs),
            "signal_stats": { "mean_values": [...], "std_values": [...] },
        }
    })
```

## 8. Artifact detection (informational only)

Amplitude spikes, eye blinks, and EMG contamination are flagged but **never block
an epoch** — the session keeps running and just tells the clinician about it:

```python
if not np.all(amplitude_threshold_epochs(x_uv, threshold_uv=500_000.0)):
    artifact_result = {"type": "amplitude", "message": "High amplitude artifact detected"}
...
await websocket.send_json({"type": "artifact", "artifact_type": artifact_result["type"], ...})
```

## 9. Extracting features

Band-power amplitudes (µV, `sqrt(power)`) are computed per protocol-defined band
(e.g. theta, beta, theta/beta ratio):

```python
features = compute_features(x_clean * VISUALIZATION_SCALE, fs, bands, return_amplitude=True)
```

## 10. Baseline collection and thresholds

The first **30 seconds of every round** are spent collecting a baseline for each
feature. Once that window closes, reward/inhibit thresholds are locked in as a
percentage offset from the baseline mean:

```python
baseline_collection_duration = 30.0
...
if not round_state["baseline_locked"]:
    round_state["baseline_buffers"][feature_name].append(feature_mean)

if round_elapsed >= baseline_collection_duration:
    baseline_mean = float(np.mean(buf))
    thresholds[feature_name] = baseline_mean * (1 - inhibit_threshold_pct)  # or (1 + reward_threshold_pct)
    round_state["baseline_locked"] = True
```

## 11. Turning features into feedback

Once baseline is locked, each epoch's z-score relative to its threshold is mapped
to a 0–1 "success" value that drives the on-screen reward:

```python
success = sigmoid_map(z, gain=5.0, shift=0.0, clip=(0.0, 1.0))
# or, depending on the protocol:
success = linear_map(z, a=0.5, b=0.5, clip=(0.0, 1.0))
```

## 12. Rounds, and the frontend

The loop repeats for `session_rounds`, resetting the baseline each time, while the
filtered EEG for the active channels is also written to a CSV on disk for later
review. On the frontend, `WebSocketManager.js` receives the `eeg_data`, `artifact`,
and feedback messages over the same socket and updates the live chart and reward
animation.

---

## Appendix: the unused DLL path

`device_handlers/device_manager.py` implements a second acquisition path via
`pythonnet`, loading `I8Library1.dll` as a .NET assembly:

```python
import clr
clr.AddReference(dll_path)
from I8Library1 import I8Device

self.device = I8Device()
status = self.device.getStatus()
```

This is a real, working code path — but it's only reachable from the standalone
`device_handlers/eeg_data_collector.py` script (a CSV-dumping test tool), not from
`sp_routes.py`. The live neurofeedback WebSocket never touches it. Worth knowing
about if you're debugging "why doesn't changing the DLL do anything" — because in
the live app, it currently doesn't.
