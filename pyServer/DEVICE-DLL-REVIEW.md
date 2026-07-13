# Hardware "DLL" Review — `device_acquisition.py`

Documents the module the team refers to as "the DLL" for the live acquisition
path: `pyServer/signal_processing/device_acquisition.py` (class
`DeviceAcquisition`). This is the only module that talks to the EEG headset in
a live session — it does so over a plain serial connection, not an actual
`.dll`.

---

## 1. Input / Output Interface

- `DeviceAcquisition(fs=None, verbose=True)` — constructor. `fs` defaults to
  250 Hz if not supplied by the caller. Opens the connection immediately (see
  lifecycle below) — there is no separate "init without connect."
- `find_serial_port()` — module-level helper, not a method. Scans OS-level
  serial devices and ranks candidates; used only when `config.json`'s
  `device.serial_port` is unset.
- `.read_samples(num_samples=1, timeout=None)` — pulls samples off the
  internal buffer. Returns a NumPy array shaped `(n, 1)`, **CH1 only**.
  Blocks until `num_samples` are available or `timeout` elapses (default
  timeout = `max(5.0, num_samples/fs * 2.0)`).
- `.send_command(cmd: str)` — writes an ASCII string to the serial port,
  appending `\r\n` if missing. This is the *only* outbound control path —
  there is no structured command API, just raw strings the caller must know.
- `.stop()` — stops the background reader thread and closes the serial port.
  Does **not** send any stop command to the device itself (see §2.6).
- `.is_running()` — returns the internal `running` flag.

There is no documented command vocabulary inside `device_acquisition.py`
itself — `send_command()` just writes whatever string it's given. In the live
session (`sp_routes.py`), only two commands are ever sent:
`"Contl_STRT_AQU"` and `"Contl_STOP_AQU"`.

However, a wider command set clearly exists on the wire protocol — it's just
not used by the live path. A separate standalone diagnostic script,
`realtime_plotter_mac.py` (its own serial connection, independent of
`DeviceAcquisition`), sends several more: `Config_GAIN_08`, `Config_GAIN_12`,
`Config_GAIN_24` (gain selection buttons), `Oprate_IMP_CHK` (impedance
check), `Oprate_TST_SIG` (test signal), and `Oprate_NOR_OPR` (normal
operation). `test_device_acquisition.py` also demonstrates sending
`Config_GAIN_08` followed by `Oprate_NOR_OPR`. None of these are sent
anywhere in the live session path — meaning **gain is never configured by
software during a real session**; whatever gain the device is left at
(factory default, or whatever a previous tool last set) is what's in effect.
The full meaning of this command set, and whether more commands exist, isn't
documented anywhere in this codebase (see open questions).

## 2. Acquisition Lifecycle

1. **Device initialization** — happens inside `__init__`, not as a separate
   step. Resolves the serial port: prefers `config.json`'s `device.serial_port`
   if set, otherwise auto-scans (`find_serial_port()`) and picks the top-ranked
   candidate, falling back to a hardcoded default (`COM3` on Windows,
   `/dev/tty.usbserial` elsewhere) if none are found.
2. **Device connection** — `connect_serial()` opens the port at **115200
   baud, 8 data bits, no parity, 1 stop bit**, with a 1s read timeout, then
   calls `reset_input_buffer()` to discard whatever the device already sent
   ("pre-start zeros," per the inline comment — implying the device emits
   zero-valued samples before it's told to start). If this fails, the
   constructor raises `RuntimeError` — there is no retry logic.
3. **Acquisition start** — **not initiated by this module.** The background
   reader thread starts immediately on construction and will decode/buffer
   whatever bytes are on the wire, regardless of whether real acquisition has
   begun on the device. The actual "start" trigger is the caller
   (`sp_routes.py`) sending the raw string command `"Contl_STRT_AQU"` via
   `send_command()`. If the caller never sends it, this module has no way of
   knowing the device isn't really acquiring — it just keeps reading whatever
   bytes exist.
4. **Data reading / streaming** — a daemon thread (`_read_data_loop`) polls
   `serial_port.in_waiting`, reads available bytes into a `bytearray`, and
   decodes them 12 bytes at a time (see §3). Decoded samples are pushed into
   `self.data_buffer`, a list capped at 1000 entries (oldest dropped via
   `pop(0)` once full — an O(n) operation per sample). `read_samples()` is
   the only consumer; it drains samples off the front of this buffer.
5. **Acquisition stop** — again, **not initiated by this module.** The caller
   sends `"Contl_STOP_AQU"` before tearing down. `device_acquisition.py`
   itself has no method that maps to "stop acquisition" on the device side —
   `.stop()` only stops the *local* reader thread and closes the port.
6. **Device disconnection** — `.stop()` sets `running = False`, joins the
   reader thread (1s timeout), and closes the serial port if open. Note: in
   the one error path in `sp_routes.py` where the device connects but sends no
   test data, the code calls `acq.stop()` directly **without** first sending
   `"Contl_STOP_AQU"` — worth confirming with hardware whether that's safe
   (see open questions).

## 3. Data Output Format

- **Channels on the wire:** every sample is **3 little-endian float32 values**
  (12 bytes), unpacked via `struct.unpack('<fff', ...)`. This is hardcoded —
  the module has no concept of a device that sends more or fewer channels.
- **Channels exposed to the app:** `read_samples()` returns **only column 0
  (CH1)** — `out[:, 0:1]`. Columns 2 and 3 are decoded, held in the internal
  buffer, and printed to the console when `verbose=True`, but otherwise
  discarded. `target_channels` is hardcoded to `1` regardless of what the
  device actually reports.
- **Sample format:** raw `float32`, no integer/ADC-count representation is
  ever seen at this layer — if the device performs ADC→volts conversion in
  firmware, that already happened before the byte stream reaches this file.
- **Units:** **not specified anywhere in this module.** No comment, constant,
  or docstring states what unit the 3 floats are in. The only clue in the
  codebase is downstream, in `sp_routes.py`: `VISUALIZATION_SCALE = 1e6  #
  Convert volts to microvolts for plotting`, applied to whatever
  `read_samples()` returns. That implies an *assumption* that the wire values
  are volts — but that assumption lives in the consumer, not in
  `device_acquisition.py`, and is not verified against any hardware spec in
  this repo.
- **Scaling:** none. `device_acquisition.py` passes wire values straight
  through — no gain division/multiplication, no offset removal, no
  calibration applied.
- **Timestamping:** **none.** No per-sample timestamp is read from the device
  or attached by this module. Sample-to-sample timing is entirely implicit —
  inferred from wall-clock arrival + the assumed configured sample rate
  (`fs`). If the device's actual output rate drifts from the configured `fs`,
  nothing in this file would detect it.
- **Packet structure:** none. There are no sync bytes, packet headers, sample
  counters/sequence IDs, or checksums/CRC in the protocol as implemented.
  It's a flat, continuous stream of 12-byte records. A malformed 12-byte
  chunk (`struct.error`) is silently dropped (`continue`) with **no
  resynchronization logic** — if the byte stream ever loses alignment (e.g.
  a dropped byte mid-stream), there is no sync-word search to recover; every
  subsequent sample would be misinterpreted until the connection is reset.

## 4. Hard-Coded Assumptions

- **Sample rate** — defaults to 250 Hz (from `config.json`'s
  `collector.sampling_rate`, passed in as `cfg.fs`). Not read from or
  negotiated with the device — purely a software-side config value. No
  runtime check that the device is actually sampling at this rate.
- **Channel count (wire)** — 3 floats/sample, hardcoded in
  `_read_data_loop`. No negotiation, no header declaring channel count.
- **Channel count (exposed)** — 1 (CH1 only), hardcoded via
  `target_channels`/`read_samples`, regardless of device capability;
  channels 2–3 are decoded then thrown away.
- **Montage / electrode layout** — **not present in this file at all.** No
  channel-to-electrode-position mapping exists here. (A `channel_labels`
  list exists in `config.json` under `collector`, but it's for an unrelated
  standalone CSV-dump script, not consumed by this module.)
- **Reference channel** — **not defined anywhere in this module.** No
  mention of which physical electrode serves as reference.
- **Ground channel** — **not defined anywhere in this module.** Same — no
  mention.
- **Gain** — **not applied, and never configured, by the live path.** No
  gain constant/multiplier exists in `device_acquisition.py`, and
  `sp_routes.py` never sends a gain command to the device. A real
  gain-selection command *does* exist on the wire protocol
  (`Config_GAIN_08` / `Config_GAIN_12` / `Config_GAIN_24`, presumably
  gain values 8/12/24) — it's just only ever sent by the standalone
  `realtime_plotter_mac.py` diagnostic tool, never by the live session. In
  practice this means a real session runs at whatever gain the device
  happens to be left at, with no guarantee of what that is. (Separately, a
  `gain: 24` value in `config.json`'s `mock` block is for unrelated
  mock/simulated-device tooling, not this live path.)
- **ADC resolution** — **not applied / not visible.** Data arrives as
  `float32`; if there's an ADC bit-depth → volts conversion, it happens
  upstream in device firmware, invisible to this file.
- **Signal range** — **not enforced.** No clipping or range validation in
  this module. (Range/clip logic exists downstream in `sp_routes.py`'s
  artifact checks and plot limits, not here.)
- **Buffer size** — `data_buffer` is capped at 1000 samples (≈4s at 250 Hz).
  Oldest sample dropped via `pop(0)` once exceeded — if the consumer
  (`read_samples`) falls behind acquisition, data is silently lost with no
  warning.
- **Internal filtering** — **none.** This module does zero signal
  conditioning — no HP/LP/notch, no CAR. All filtering happens later in
  `preprocessing.py`.

## 5. Raw vs. Modified Signal

At the `device_acquisition.py` boundary, the signal is a **verbatim
pass-through** of whatever floats arrive over the wire — no filtering,
scaling, gain, or unit conversion is applied inside this file. In that narrow
sense, what this module hands to the rest of the app is "raw."

However, whether the *device firmware itself* has already applied gain, ADC
scaling, or any conditioning before it puts bytes on the wire is **unknown
from this codebase** — there's no spec or comment confirming it. So:

- **Software-side:** raw pass-through, confirmed by reading the code.
- **Device-side:** unknown whether the floats are true raw ADC-derived
  values or already-scaled/conditioned signal. This is the single biggest
  gap and the most important question to put to the hardware developer.

## 6. Open Questions for the Hardware Developer

1. **Units** — What physical unit are the 3 floats in per sample (volts,
   microvolts, raw ADC counts, something else)? The app currently assumes
   volts (multiplies by `1e6` to get µV) — is that assumption correct?
2. **Channel mapping** — What do the 3 channels (`val1`, `val2`, `val3`)
   physically correspond to? The app only ever uses `val1` (treated as CH1) —
   is that guaranteed to be a consistent, meaningful channel across devices,
   or could channel order vary by firmware/hardware revision?
3. **Gain / ADC resolution** — The wire protocol has `Config_GAIN_08` /
   `Config_GAIN_12` / `Config_GAIN_24` commands, but the live session never
   sends any of them, so gain is left at whatever the device defaults to or
   was last set to. What is the device's power-on/default gain? Does it
   persist gain settings across power cycles or connections? Should the live
   session be explicitly setting gain on every start instead of leaving it
   unspecified? And separately: has any ADC-to-voltage scaling already been
   applied on-device before the 3 floats are sent, and if so, what are the
   exact resolution values?
4. **Reference / ground** — Which physical electrode(s) serve as reference
   and ground? This isn't represented anywhere in the current software.
5. **Montage** — Is there a fixed electrode montage this device is wired for,
   or is it configurable? Nothing in `device_acquisition.py` encodes one.
6. **Sample rate** — Is the device's actual output rate fixed, configurable,
   or does it need to be told the rate to sample at? Currently the app just
   *assumes* 250 Hz and has no way to detect drift or mismatch.
7. **Command protocol** — Beyond `Contl_STRT_AQU` / `Contl_STOP_AQU` and the
   gain/operation-mode commands found in `realtime_plotter_mac.py`
   (`Config_GAIN_08/12/24`, `Oprate_IMP_CHK`, `Oprate_TST_SIG`,
   `Oprate_NOR_OPR`), is there a fuller documented command set? Is
   `Oprate_NOR_OPR` ("normal operation") required before `Contl_STRT_AQU` for
   valid data, or is the device already in that mode by default? The live
   session never sends it — is that a problem? Are there
   acknowledgements/responses the app should be reading and currently isn't?
8. **Pre-start zeros** — The code discards the input buffer on connect to
   skip "pre-start zeros." Is it expected/guaranteed the device sends zeros
   before `Contl_STRT_AQU`, or could it send other garbage/partial frames
   that this discard wouldn't catch?
9. **Packet integrity** — There's no sync word, sequence counter, or
   checksum in the wire protocol. Is byte-level framing guaranteed reliable
   (e.g. does the OS/driver layer guarantee no dropped bytes), or should the
   app be defending against stream desync?
10. **Stop without command** — In one error path the app closes the serial
    port without ever sending `Contl_STOP_AQU` (because start was sent but no
    data arrived). Is it safe to disconnect from the device without a
    matching stop command, or could that leave the device in a bad state for
    the next connection attempt?
11. **Buffer overrun behavior** — If the app's 1000-sample ring buffer fills
    (consumer falling behind), samples are silently dropped. Is there a
    device-side buffer/flow-control mechanism that should be relied on
    instead, or is silent local dropping the intended behavior?
