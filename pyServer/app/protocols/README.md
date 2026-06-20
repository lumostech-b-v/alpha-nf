# Protocol Library Module

A comprehensive protocol library system for neurofeedback applications. Each user manages protocol libraries for their patients, with 3 default protocols that cannot be deleted.

## Features

- **Protocol Management**: Full CRUD operations with user isolation
- **Default Protocols**: Pre-configured neurofeedback protocols (protected from deletion)
- **Patient-Specific**: Each patient has their own protocol library
- **NF-Core Compatible**: Features designed for signal processing pipeline integration
- **Advanced Protocol Types**: Support for standard, ratio, and other specialized protocols
- **Channel-Specific Processing**: Ability to specify different EEG channels for different features

## API Endpoints & Examples

### 1. Login to Get Token
```bash
POST /users/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

### 2. Create Standard Protocol
```bash
POST /protocols/
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Custom Alpha Protocol",
  "note": "Customized alpha training for specific patient needs",
  "features": {
    "frequency_bands": [
      {
        "type": "reward",
        "frequency_range": [8.0, 12.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "standard",
    "combination_method": "weighted_average"
  }
}
```

### 3. Create Ratio Protocol
```bash
POST /protocols/
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Theta/Beta Ratio Training",
  "note": "Training to reduce theta/beta ratio for ADHD",
  "features": {
    "frequency_bands": [
      {
        "type": "ratio",
        "name": "theta_beta_ratio",
        "numerator": "theta",
        "denominator": "beta",
        "mode": "inhibit",
        "channels": ["Cz"],
        "numerator_channel_index": 1,
        "denominator_channel_index": 2
      },
      {
        "type": "inhibit",
        "name": "theta",
        "frequency_range": [4.0, 8.0],
        "channels": ["Cz"],
        "channel_indices": [1],
        "weight": 1.0
      },
      {
        "type": "reward",
        "name": "beta",
        "frequency_range": [13.0, 30.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "ratio",
    "combination_method": "weighted_average"
  }
}
```

### 4. Get All Protocols
```bash
GET /protocols/
Authorization: Bearer <token>
```

### 5. Get Specific Protocol
```bash
GET /protocols/5
Authorization: Bearer <token>
```

### 6. Update Protocol
```bash
PUT /protocols/5
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Protocol Name",
  "note": "Updated notes",
  "features": {
    "frequency_bands": [
      {
        "type": "reward",
        "frequency_range": [8.0, 12.0],
        "channels": ["Cz"],
        "channel_indices": [0],
        "weight": 1.5
      }
    ],
    "protocol_type": "standard",
    "combination_method": "weighted_average"
  }
}
```

### 7. Delete Protocol
```bash
DELETE /protocols/5
Authorization: Bearer <token>
```

### 8. Initialize Default Protocols
```bash
POST /protocols/initialize-defaults
Authorization: Bearer <token>
```

### 9. Verify Token
```bash
POST /users/verify
Authorization: Bearer <token>
```

## Protocol Types

### Standard Protocols (`protocol_type: "standard"`)
- Traditional neurofeedback protocols with individual frequency bands
- Bands can be "reward" (enhance) or "inhibit" modes
- Supports channel-specific processing with `channel_indices`

### Ratio Protocols (`protocol_type: "ratio"`)
- Specialized protocols that compute ratios between frequency bands
- Ratio bands defined with `type: "ratio"`, `numerator`, and `denominator`
- Supports channel-specific numerator and denominator with `numerator_channel_index` and `denominator_channel_index`

## Protocol Features Schema

### Standard Protocol Schema
```json
{
  "features": {
    "frequency_bands": [
      {
        "type": "reward|inhibit",
        "frequency_range": [min_freq, max_freq],
        "channels": ["channel_name"],
        "channel_indices": [0, 1, 2],  // Optional: specify channel indices
        "weight": 1.0,
        "name": "optional_name"
      }
    ],
    "protocol_type": "standard",  // Explicit protocol type
    "combination_method": "weighted_average"
  }
}
```

### Ratio Protocol Schema
```json
{
  "features": {
    "frequency_bands": [
      {
        "type": "ratio",  // Special type for ratio features
        "name": "ratio_feature_name",
        "numerator": "numerator_feature_name",  // References another band name
        "denominator": "denominator_feature_name",  // References another band name
        "mode": "enhance|inhibit",  // How to respond to this ratio value
        "channels": ["channel_name"],
        "numerator_channel_index": 1,  // Optional: specific channel for numerator
        "denominator_channel_index": 2  // Optional: specific channel for denominator
      },
      {
        "type": "reward|inhibit",
        "name": "numerator_feature_name",  // Must match numerator reference above
        "frequency_range": [min_freq, max_freq],
        "channels": ["channel_name"],
        "channel_indices": [numerator_channel_index],  // Same as numerator_channel_index
        "weight": 1.0
      },
      {
        "type": "reward|inhibit",
        "name": "denominator_feature_name",  // Must match denominator reference above
        "frequency_range": [min_freq, max_freq],
        "channels": ["channel_name"],
        "channel_indices": [denominator_channel_index],  // Same as denominator_channel_index
        "weight": 1.0
      }
    ],
    "protocol_type": "ratio",  // Explicit protocol type
    "combination_method": "weighted_average"
  }
}
```

### Channel-Specific Processing
- Individual frequency bands can specify channel indices with `channel_indices`
- Ratio features can specify different channels for numerator and denominator
- When channel indices are specified, features are computed from specific EEG channels
- If no channel index is specified, features are computed from all available channels

## Example Protocol Types

### 1. Basic Standard Protocol
```json
{
  "name": "Alpha Enhancement",
  "features": {
    "frequency_bands": [
      {
        "type": "reward",
        "frequency_range": [8.0, 12.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "standard",
    "combination_method": "weighted_average"
  }
}
```

### 2. Theta/Beta Ratio Protocol
```json
{
  "name": "ADHD Theta/Beta Training",
  "features": {
    "frequency_bands": [
      {
        "type": "ratio",
        "name": "theta_beta_ratio",
        "numerator": "theta",
        "denominator": "beta",
        "mode": "inhibit",
        "channels": ["Cz"],
        "numerator_channel_index": 1,
        "denominator_channel_index": 2
      },
      {
        "type": "inhibit",
        "name": "theta",
        "frequency_range": [4.0, 8.0],
        "channels": ["Cz"],
        "channel_indices": [1]
      },
      {
        "type": "reward",
        "name": "beta",
        "frequency_range": [13.0, 30.0],
        "channels": ["Cz"],
        "channel_indices": [2]
      }
    ],
    "protocol_type": "ratio",
    "combination_method": "weighted_average"
  }
}
```

### 3. Multi-Channel Protocol
```json
{
  "name": "Multi-Channel Training",
  "features": {
    "frequency_bands": [
      {
        "type": "reward",
        "frequency_range": [8.0, 12.0],
        "channels": ["F3", "F4"],
        "channel_indices": [0, 1],
        "weight": 1.5
      },
      {
        "type": "inhibit",
        "frequency_range": [1.0, 4.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "standard",
    "combination_method": "weighted_average"
  }
}
```

## Response Examples

### Successful Protocol Creation (Standard)
```json
{
  "id": 5,
  "name": "Custom Alpha Protocol",
  "note": "Customized alpha training",
  "features": {
    "frequency_bands": [
      {
        "type": "reward",
        "frequency_range": [8.0, 12.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "standard",
    "combination_method": "weighted_average"
  },
  "user_id": 1,
  "is_default": false,
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": null
}
```

### Successful Protocol Creation (Ratio)
```json
{
  "id": 6,
  "name": "Theta/Beta Ratio Training",
  "note": "Training to reduce theta/beta ratio",
  "features": {
    "frequency_bands": [
      {
        "type": "ratio",
        "name": "theta_beta_ratio",
        "numerator": "theta",
        "denominator": "beta",
        "mode": "inhibit",
        "channels": ["Cz"],
        "numerator_channel_index": 1,
        "denominator_channel_index": 2
      },
      {
        "type": "inhibit",
        "name": "theta",
        "frequency_range": [4.0, 8.0],
        "channels": ["Cz"],
        "channel_indices": [1],
        "weight": 1.0
      },
      {
        "type": "reward",
        "name": "beta",
        "frequency_range": [13.0, 30.0],
        "channels": ["Cz"],
        "channel_indices": [2],
        "weight": 1.0
      }
    ],
    "protocol_type": "ratio",
    "combination_method": "weighted_average"
  },
  "user_id": 1,
  "is_default": false,
  "is_active": true,
  "created_at": "2024-01-15T10:35:00Z",
  "updated_at": null
}
```

### Error Responses
```json
// 404 - Protocol not found
{
  "detail": "Protocol not found"
}

// 400 - Invalid protocol structure
{
  "detail": "Protocol has invalid structure (old format). Please migrate or recreate this protocol."
}

// 403 - Cannot modify default protocol
{
  "detail": "Default protocols cannot be modified"
}
```

## Frontend Implementation Guide

### How Frontend Knows Protocol Type:
1. **When retrieving protocols**: The `features.protocol_type` field indicates the protocol type
2. **When creating protocols**: Set `features.protocol_type` to "standard" or "ratio"
3. **For ratio protocols**: Check for bands with `type: "ratio"` containing numerator/denominator references

### Creating Standard Protocols:
- Set `features.protocol_type` to "standard"
- Define frequency bands with `type: "reward"` or `type: "inhibit"`
- Optionally specify channel indices with `channel_indices`

### Creating Ratio Protocols:
- Set `features.protocol_type` to "ratio"
- Define a ratio band with `type: "ratio"`, `numerator`, `denominator`, and `mode`
- Define the referenced numerator and denominator bands with proper names
- Optionally specify channel indices for numerator and denominator separately

## Default Protocols

1. **P1 — Frontal-Activation** - Core antidepressant target; corrects frontal asymmetry. Use: Frontal_asym_left↑ or Alpha Excess Left, Beta Low Frontal, Anhedonia/slowing. Site: F3 (alt: Fz) ref A1/A2. Reward: 15–18 Hz (consider 12–15 if Anxious). Inhibit: 8–12 Hz (alpha) at F3; 22–30 Hz (high-beta) if jittery.

2. **P2 — Calm-Arousal** - For anxious depression / agitation / worry overlay. Use: anxiety↑ or High Beta High, rumination↑. Sites: Pz (eyes-closed) or Fz/Cz (eyes-open) per QEEG. Reward: 8–12 Hz (center to PAF). Inhibit: 22–30 Hz; optional 2–7 Hz if drowsy.

3. **P3 — SMR-Stability** - Improve sleep, reduce tension, aid resilience. Use: sleep_deficit↑, Severe Insomnia, psychomotor restlessness. Site: C4 (alt: Cz). Reward: 12–15 Hz. Inhibit: 2–7 Hz, 20–30 Hz.

4. **Theta/Beta Ratio Training** - Training to reduce theta/beta ratio, commonly used for ADHD protocols. This computes the ratio of theta power to beta power and aims to decrease this ratio using specific channels.

## Security Notes

- Users can only access their own protocols
- Default protocols cannot be modified or deleted
- All operations require authentication
- Protocol ownership is verified before operations

## Development Notes

- When creating ratio protocols, ensure referenced numerator/denominator bands exist
- Channel indices are 0-based (0 for first channel, 1 for second, etc.)
- The processing pipeline automatically handles both standard and ratio protocols
- Both static and adaptive thresholds work with ratio protocols