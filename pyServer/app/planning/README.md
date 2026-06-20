# Planning Module

The Planning module manages treatment plans, checkpoints, blocks, and disorders for neurofeedback therapy. It provides a structured approach to organizing therapy sessions and tracking patient progress.

## Overview

The Planning module consists of four main entities:

1. **Disorders** - Medical conditions with severity levels and test information
2. **Plans** - Treatment plans for patients
3. **Checkpoints** - Assessment points within a plan, each associated with a disorder
4. **Blocks** - Training sessions within checkpoints, each with an assigned protocol

## Database Schema

### Disorders Table
- `id` - Primary key
- `disorder` - Disorder name (e.g., "ADHD", "Anxiety", "Depression")

**QEEG Findings:**
- `left_alpha_excess` - Left alpha excess finding
- `frontal_beta_low` - Frontal beta low finding
- `high_beta_high` - High beta high finding
- `paf_slow` - PAF slow finding
- `coherence` - Coherence finding
- `qeeg_other` - Other QEEG findings (text)

**Symptoms:**
- `isi` - ISI (Insomnia Severity Index)
- `gad7` - GAD-7 (Generalized Anxiety Disorder)
- `phq` - PHQ (Patient Health Questionnaire)

**Cognitive:**
- `wm` - Working Memory
- `executive_c` - Executive Control
- `sustained_a` - Sustained Attention
- `cognitive_other` - Other cognitive findings (text)

**Observation:**
- `trauma` - Trauma observation
- `rumination` - Rumination observation
- `anxiety` - Anxiety observation
- `observation_note` - Additional observation notes (text)

**Timestamps:**
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Plans Table
- `id` - Primary key
- `patient_id` - Foreign key to patients table
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Checkpoints Table
- `id` - Primary key
- `order_index` - Order within the plan
- `plan_id` - Foreign key to plans table
- `disorder_id` - Foreign key to disorders table (NEW)
- `is_completed` - Completion status
- `completed_at` - Completion timestamp
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Blocks Table
- `id` - Primary key
- `order_index` - Order within the checkpoint
- `checkpoint_id` - Foreign key to checkpoints table
- `protocol_id` - Foreign key to protocol_library table (NEW)
- `session_count` - Number of sessions in the block
- `current_session` - Current session number
- `is_completed` - Completion status
- `completed_at` - Completion timestamp
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Key Features

### Simplified Disorder Management
- Create disorders with just the name (all other fields default to false)
- Comprehensive disorder fields available for future detailed assessment
- Disorders can be updated later with detailed QEEG findings, symptoms, and observations

### Simple Workflow
- **Step 1**: Create disorder with name only
- **Step 2**: Choose protocol from available protocols
- **Step 3**: Start session with selected protocol
- No complex planning required for initial sessions

### Protocol Assignment
- Direct protocol selection from patient's protocol library
- No automatic assignment - user chooses appropriate protocol
- Simple session creation with selected protocol

## API Endpoints

### Disorder Endpoints
- `POST /planning/disorders/` - Create a new disorder
- `GET /planning/disorders/` - Get all disorders
- `GET /planning/disorders/{disorder_id}` - Get a specific disorder
- `PUT /planning/disorders/{disorder_id}` - Update a disorder
- `DELETE /planning/disorders/{disorder_id}` - Delete a disorder

### Protocol Assignment Endpoints
- `POST /planning/blocks/{block_id}/assign-default-protocol` - Assign default protocol to block
- `POST /planning/blocks/{block_id}/assign-protocol` - Assign specific protocol to block

## Usage Examples

### Creating a Simple Disorder (Recommended Workflow)
```python
disorder_data = {
    "disorder": "ADHD",
    "left_alpha_excess": False,
    "frontal_beta_low": False,
    "high_beta_high": False,
    "paf_slow": False,
    "coherence": False,
    "qeeg_other": None,
    "isi": False,
    "gad7": False,
    "phq": False,
    "wm": False,
    "executive_c": False,
    "sustained_a": False,
    "cognitive_other": None,
    "trauma": False,
    "rumination": False,
    "anxiety": False,
    "observation_note": None
}
```

### Creating a Detailed Disorder (Advanced)
```python
disorder_data = {
    "disorder": "ADHD",
    "left_alpha_excess": True,
    "frontal_beta_low": True,
    "high_beta_high": False,
    "paf_slow": False,
    "coherence": True,
    "qeeg_other": "Additional QEEG findings",
    "isi": False,
    "gad7": True,
    "phq": True,
    "wm": True,
    "executive_c": True,
    "sustained_a": False,
    "cognitive_other": "Additional cognitive findings",
    "trauma": False,
    "rumination": True,
    "anxiety": True,
    "observation_note": "Patient shows signs of executive dysfunction"
}
```

### Creating a Checkpoint with Disorder
```python
checkpoint_data = {
    "plan_id": 1,
    "order_index": 1,
    "disorder_id": 1
}
```

### Assigning Protocol to Block
```python
# Assign default protocol
POST /planning/blocks/1/assign-default-protocol
{
    "patient_id": 1,
    "user_id": 1
}

# Assign specific protocol
POST /planning/blocks/1/assign-protocol
{
    "protocol_id": 2
}
```

## Database Migrations

The module includes automatic database migrations that:
- Create the disorders table
- Add disorder_id column to checkpoints table
- Add protocol_id column to blocks table
- Preserve existing data during migration
- Create a default disorder for existing data

## Integration with Protocols Module

The Planning module integrates with the Protocols module to:
- Assign default protocols to blocks
- Allow users to change protocol assignments
- Reference protocols from the protocol_library table

## Future Enhancements

- Disorder progression tracking
- Automated protocol recommendations based on disorder severity
- Integration with assessment results
- Advanced disorder categorization
