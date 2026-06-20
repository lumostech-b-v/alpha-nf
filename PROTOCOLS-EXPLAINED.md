# How Protocols Work — Plain English Guide

## What a Protocol Is

A protocol is a training prescription. It tells the system:

- **Which brain region to watch** — e.g. the top of the head (Cz), the forehead (Fz), or the back (Pz)
- **Which brainwave frequencies to encourage** (reward)
- **Which frequencies to suppress** (inhibit)

Example: the ADHD TBR protocol says _"watch Cz, reward 15–18 Hz beta, inhibit 4–7 Hz theta"_. The idea is that with enough practice the brain learns to produce more beta and less theta, which is associated with better focus.

---

## From Protocol to Live Session — Step by Step

### 1. Protocol definition (the recipe)

Protocols are stored in the database as JSON. Each one contains a list of **frequency bands**, each tagged as either `reward` (we want more of this) or `inhibit` (we want less of this), with the target frequency range and EEG channel.

### 2. Baseline collection (~30 seconds)

At the start of every round the system watches the brain quietly for about 30 seconds without giving any feedback. It records the average level of each frequency band. This personal baseline is the reference point — it compensates for the fact that every brain is naturally different.

### 3. Threshold calculation

Once the baseline is locked the system sets a target line for each band:

| Band type | Threshold |
|-----------|-----------|
| Reward (encourage) | 20% above the person's baseline |
| Inhibit (suppress) | 20% below the person's baseline |

The 20% is a configurable parameter (`threshold_percentage`). The threshold stays fixed for the rest of that round.

### 4. Real-time EEG processing (every second)

Every second the system takes the most recent EEG data and runs it through a short pipeline:

1. **Feature extraction** — uses Welch's method (a standard spectral analysis technique) to calculate how much signal exists in each target frequency band, expressed as amplitude in µV. For ratio bands (e.g. Theta/Beta Ratio) it divides one band's power by another.

2. **Feedback mapping** — compares the current value to the threshold and produces a 0–1 score:
   - **Threshold mode** (default): binary — either the band crossed the threshold (score = 1) or it didn't (score = 0)
   - **Sigmoid / linear modes**: a smooth curve from 0 to 1 rather than a hard cut-off

3. **Combine features** — if the protocol has multiple bands, their scores are averaged (weighted average by default).

4. **Send to frontend** — the combined score and the session success rate are sent over WebSocket to the display.

---

## What "Success Rate" Means

Success rate is the **percentage of seconds so far in the session where all bands crossed their thresholds at the same time**.

```
Success rate = (number of successful 1-second epochs) ÷ (total epochs so far) × 100
```

A single epoch is successful when:
- every **reward** band is **above** its threshold, AND
- every **inhibit** band is **below** its threshold

### How it is displayed

| Success rate | Gauge colour |
|---|---|
| ≥ 70% | Green |
| 40–69% | Orange |
| < 40% | Red |

The gauge also controls the visual feedback shown to the client (image blur, lamp brightness, dot size) — higher success = clearer image / brighter lamp.

---

## Success Rate vs. Feedback Value — Two Different Numbers

These are easy to confuse:

| | Feedback value | Overall success rate |
|---|---|---|
| **What it is** | Current 0–1 score for this second | Percentage of all seconds that succeeded |
| **Changes** | Every second | Every second (running average) |
| **Used for** | Driving the visual display in real time | Showing overall session progress |

Think of the feedback value as "how well are you doing right now" and the success rate as "how well have you done across the whole session".

---

## Ratio Protocols (e.g. Theta/Beta Ratio)

Some protocols use a ratio instead of a single band. TBR (Theta/Beta Ratio) is the most common:

```
TBR = theta power ÷ beta power
```

A high TBR means too much slow (theta) relative to fast (beta) activity — associated with inattention. The goal is to bring the ratio down. The same threshold logic applies: the system computes a baseline TBR and then rewards the client whenever the live TBR drops below the threshold.

---

## Per-Round Reset

Each round starts a fresh baseline collection. This means:

- Thresholds recalibrate at the start of every round (they don't drift across rounds)
- Success history is tracked across the whole session, not just the current round
- A default session has 5 rounds; round duration = total session time ÷ 5

---

## Quick Reference — Key Numbers

| Parameter | Default | What it controls |
|---|---|---|
| Baseline duration | 30 s | How long to collect reference data before feedback starts |
| Threshold percentage | 20% | How far above/below baseline before a band counts as successful |
| Epoch length | 1 s | How often a new EEG window is processed |
| EMA smoothing alpha | 0.3 | How quickly displayed thresholds react to new data (higher = snappier) |
| Target success rate | ~70% | Conventional clinical target (not enforced automatically) |
