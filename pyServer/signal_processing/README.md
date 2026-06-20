# Neurofeedback Signal Processing Pipeline

Real-time EEG signal processing for neurofeedback training with adaptive thresholding and multi-feature protocols.

## Overview

```
EEG Data → Preprocessing → Feature Extraction → Normalization → Smoothing → Feedback
```

**Pipeline Components:**
1. **Acquisition** – EEG recording (256 Hz, 8-24 channels)
2. **Preprocessing** – Referencing, filtering, artifact removal
3. **Feature Extraction** – Band power, ratios, connectivity
4. **Normalization** – Baseline correction with z-scores
5. **Smoothing** – Temporal integration (EMA)
6. **Feedback Mapping** – Continuous, threshold, or adaptive

---

## Sampling System

- **Sampling Rate**: 256 Hz
- **Epoch Length**: 1.0 second (processing window)
- **Overlap**: 50% (0.5s step size)
- **Feedback Rate**: 2 Hz (new feedback every 0.5 seconds)
- **Baseline Collection**: 30 samples = 15 seconds
- **Performance Tracking**: 50 samples = 25 seconds

---

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8000/nfcore_start');
```

### Start Command Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start` | boolean | - | Must be `true` to begin session |
| `features` | array | `["alpha"]` | Frequency bands/ratios to train |
| `feature_modes` | object | `{}` | `"enhance"` or `"inhibit"` per feature |
| `feature_weights` | object | `{}` | Weight per feature (default: 1.0) |
| `combination_method` | string | `"weighted_average"` | How to combine features |
| `custom_bands` | object | `{}` | Custom frequency ranges |
| `mapping` | string | `"sigmoid"` | `"sigmoid"`, `"linear"`, `"threshold"` |
| `success_rate` | float | `0.7` | Target success rate for adaptive threshold |
| `session_duration` | float | `60.0` | Session duration in seconds (10-3600) |

### Available Features
- **Bands**: `alpha`, `beta`, `theta`, `delta`, `gamma`, `smr`
- **Ratios**: `theta_beta_ratio`, `alpha_beta_ratio`, `theta_alpha_ratio`

---

## Usage Examples

### 1. Basic Alpha Training
```json
{
  "start": true,
  "features": ["alpha"],
  "feature_modes": {"alpha": "enhance"},
  "session_duration": 120
}
```

### 2. ADHD Protocol
```json
{
  "start": true,
  "features": ["smr", "theta", "beta"],
  "feature_modes": {
    "smr": "enhance",
    "theta": "inhibit", 
    "beta": "inhibit"
  },
  "feature_weights": {"smr": 3.0, "theta": 1.5, "beta": 1.0},
  "session_duration": 300
}
```

### 3. Adaptive Threshold Examples

#### Beginner Training (60% success rate)
```json
{
  "start": true,
  "features": ["alpha"],
  "mapping": "threshold",
  "success_rate": 0.6,
  "session_duration": 90
}
```

#### Standard Training (70% success rate)
```json
{
  "start": true,
  "features": ["alpha"],
  "mapping": "threshold",
  "success_rate": 0.7,
  "session_duration": 120
}
```

#### Expert Training (85% success rate)
```json
{
  "start": true,
  "features": ["alpha"],
  "mapping": "threshold",
  "success_rate": 0.85
}
```

#### Multi-Feature Threshold Training
```json
{
  "start": true,
  "features": ["alpha", "theta"],
  "feature_modes": {
    "alpha": "enhance",
    "theta": "enhance"
  },
  "combination_method": "weighted_average",
  "feature_weights": {"alpha": 2.0, "theta": 1.0},
  "mapping": "threshold",
  "success_rate": 0.75,
  "session_duration": 180
}
```

#### SMR Training with Threshold
```json
{
  "start": true,
  "features": ["smr"],
  "feature_modes": {"smr": "enhance"},
  "custom_bands": {"smr": [12, 15]},
  "mapping": "threshold",
  "success_rate": 0.7,
  "session_duration": 240
}
```

#### Anxiety Reduction (Theta/Beta Ratio)
```json
{
  "start": true,
  "features": ["theta_beta_ratio"],
  "feature_modes": {"theta_beta_ratio": "inhibit"},
  "mapping": "threshold",
  "success_rate": 0.65,
  "session_duration": 150
}
```

### 4. Advanced Mapping Examples

#### Sigmoid Mapping with Custom Bands
```json
{
  "start": true,
  "features": ["alpha", "gamma_low"],
  "feature_modes": {
    "alpha": "enhance",
    "gamma_low": "enhance"
  },
  "custom_bands": {
    "gamma_low": [30, 50],
    "gamma_high": [50, 100]
  },
  "combination_method": "product",
  "mapping": "sigmoid",
  "session_duration": 200
}
```

#### Linear Mapping with Multiple Features
```json
{
  "start": true,
  "features": ["delta", "theta", "alpha", "beta"],
  "feature_modes": {
    "delta": "enhance",
    "theta": "enhance",
    "alpha": "enhance", 
    "beta": "inhibit"
  },
  "feature_weights": {
    "delta": 1.0,
    "theta": 2.0,
    "alpha": 3.0,
    "beta": 1.5
  },
  "combination_method": "max",
  "mapping": "linear",
  "session_duration": 300
}
```

#### Product Combination with Custom Bands
```json
{
  "start": true,
  "features": ["alpha", "theta", "smr"],
  "feature_modes": {
    "alpha": "enhance",
    "theta": "enhance",
    "smr": "enhance"
  },
  "custom_bands": {
    "smr": [12, 15],
    "alpha_wide": [7, 13]
  },
  "combination_method": "product",
  "mapping": "sigmoid",
  "session_duration": 180
}
```

---

## Session Duration Examples

### Quick Test Session (30 seconds)
```json
{
  "start": true,
  "features": ["alpha"],
  "session_duration": 30
}
```

### Standard Training Session (2 minutes)
```json
{
  "start": true,
  "features": ["alpha"],
  "session_duration": 120
}
```

### Extended Training Session (10 minutes)
```json
{
  "start": true,
  "features": ["alpha", "theta"],
  "session_duration": 600
}
```

### Long Research Session (30 minutes)
```json
{
  "start": true,
  "features": ["alpha"],
  "session_duration": 1800
}
```

### Complete Example (All Parameters)
```json
{
  "start": true,
  "features": ["alpha", "theta", "beta", "theta_beta_ratio"],
  "feature_modes": {
    "alpha": "enhance",
    "theta": "enhance", 
    "beta": "inhibit",
    "theta_beta_ratio": "inhibit"
  },
  "feature_weights": {
    "alpha": 2.0,
    "theta": 1.5,
    "beta": 1.0,
    "theta_beta_ratio": 3.0
  },
  "combination_method": "weighted_average",
  "custom_bands": {
    "smr": [12, 15],
    "gamma_low": [30, 50],
    "gamma_high": [50, 100]
  },
  "mapping": "threshold",
  "success_rate": 0.75,
  "session_duration": 300
}
```

### Combination Method Examples

#### Weighted Average (Default)
```json
{
  "start": true,
  "features": ["alpha", "theta"],
  "feature_weights": {"alpha": 3.0, "theta": 1.0},
  "combination_method": "weighted_average",
  "session_duration": 120
}
```

#### Product (Multiplicative)
```json
{
  "start": true,
  "features": ["alpha", "theta"],
  "combination_method": "product",
  "session_duration": 120
}
```

#### Maximum (Best Performance)
```json
{
  "start": true,
  "features": ["alpha", "theta", "beta"],
  "combination_method": "max",
  "session_duration": 120
}
```

#### Minimum (Most Conservative)
```json
{
  "start": true,
  "features": ["alpha", "theta", "beta"],
  "combination_method": "min",
  "session_duration": 120
}
```

**Duration Limits:**
- **Minimum**: 10 seconds
- **Maximum**: 3600 seconds (1 hour)
- **Default**: 60 seconds

---

## API Response Format

### Feedback Message
```json
{
  "type": "feedback",
  "timestamp": "2024-01-15T10:30:00Z",
  "session_time": 15,
  "selected_features": ["alpha"],
  "feature_modes": {"alpha": "enhance"},
  "combination_method": "weighted_average",
  "combined_value": 0.75,
  "feedback": 1.0,
  "individual_features": {"alpha": 0.8},
  "z_scores": {"alpha": 1.2},
  "raw_band_powers": {"alpha_mean": 15.3},
  "baseline_status": {
    "alpha": {
      "is_ready": true,
      "progress": 1.0,
      "samples_collected": 45
    }
  },
  "baseline_overall": {
    "all_ready": true,
    "min_progress": 1.0,
    "total_samples": 45,
    "status": "ready"
  },
  "threshold_stats": {
    "alpha": {
      "current_threshold": 0.65,
      "success_rate": 0.72,
      "samples_count": 45,
      "target_success_rate": 0.7,
      "recent_values_mean": 0.68,
      "recent_values_std": 0.12
    },
    "theta": {
      "current_threshold": 0.58,
      "success_rate": 0.68,
      "samples_count": 45,
      "target_success_rate": 0.7,
      "recent_values_mean": 0.55,
      "recent_values_std": 0.15
    }
  },
  "feature_thresholds": {
    "alpha": {
      "threshold": 0.65,
      "current_value": 0.8,
      "success": true
    },
    "theta": {
      "threshold": 0.58,
      "current_value": 0.45,
      "success": false
    }
  }
}
```

**Response Fields:**
- `individual_features`: Processed values (z-scored, smoothed, enhance/inhibit applied)
- `z_scores`: Baseline-normalized z-scores for each feature  
- `raw_band_powers`: Mean power values for all computed frequency bands
- `baseline_status`: Per-feature baseline collection status and progress
- `baseline_overall`: Overall baseline collection status across all features
- `threshold_stats`: Adaptive threshold statistics (only when `mapping: "threshold"`)
- `feature_thresholds`: Live threshold values paired with each feature (only when `mapping: "threshold"`)

---

## Adaptive Threshold System

The adaptive threshold automatically adjusts to maintain your target success rate:

- **Tracks Performance**: Monitors last 50 samples (25 seconds)
- **Adjusts Threshold**: Increases if too easy, decreases if too hard
- **Smooth Adaptation**: 5% adjustment rate prevents sudden changes
- **Bounds**: Keeps threshold between 0.0 and 1.0

**How it works:**
1. Starts with threshold 0.5
2. Tracks success rate over sliding window
3. Adjusts threshold to maintain target success rate
4. Provides real-time statistics in `threshold_stats`

**Feature-Specific Threshold Data:**
When using `mapping: "threshold"`, each selected feature gets its own independent adaptive threshold:
- Each feature maintains its own 70% success rate target
- Each feature has its own threshold that adapts independently
- `threshold`: Current adaptive threshold value for that specific feature
- `current_value`: Current feature value (processed)
- `success`: Boolean indicating if current value exceeds that feature's threshold

---

## Common Protocols

| Protocol | Features | Modes | Use Case |
|----------|----------|-------|----------|
| **Alpha** | `["alpha"]` | `{"alpha": "enhance"}` | Relaxation, meditation |
| **ADHD** | `["smr", "theta", "beta"]` | `{"smr": "enhance", "theta": "inhibit", "beta": "inhibit"}` | Attention training |
| **Peak Performance** | `["alpha", "theta"]` | `{"alpha": "enhance", "theta": "enhance"}` | Flow states |
| **Sleep** | `["delta", "beta"]` | `{"delta": "enhance", "beta": "inhibit"}` | Sleep improvement |
| **Anxiety** | `["theta_beta_ratio"]` | `{"theta_beta_ratio": "inhibit"}` | Stress reduction |

---

## Configuration

**Default Frequency Bands:**
- **Delta**: 1-4 Hz
- **Theta**: 4-8 Hz  
- **Alpha**: 8-12 Hz
- **Beta**: 13-30 Hz
- **SMR**: 12-15 Hz
- **Gamma**: 30+ Hz

**Default Settings:**
- Session length: 60 seconds
- Baseline collection: 15 seconds (30 samples)
- Performance tracking: 25 seconds (50 samples)
- Feedback rate: 2 Hz (every 0.5 seconds)

---

## Error Handling

- **Invalid features**: Skipped with warning
- **No valid features**: Session terminates with error
- **WebSocket disconnect**: Graceful shutdown
- **Device errors**: Error messages sent to client
- **Artifacts**: High-amplitude epochs automatically skipped

---

## Development

**Start server:**
```bash
python -m api.main
# or
uvicorn api.main:app --reload
```

**Environment variables:**
- `HOST`: Server host (default: 0.0.0.0)
- `PORT`: Server port (default: 8000)  
- `LOG_LEVEL`: Logging level (default: INFO)
- `CORS_ORIGINS`: CORS origins (default: *)