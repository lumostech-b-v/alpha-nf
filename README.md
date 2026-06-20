# Neuro Feedback 

## High level idea

Electron (frontend) ⇄ HTTP API on the same machine (Python service).
```
[Electron UI]
     |
 HTTP (localhost)
     |
[FastAPI service]
  ├─ API layer (endpoints)
  ├─ Service layer (business logic) Add telemetry (later)
  ├─ Math module (NumPy/SciPy/PyTorch etc.)
  └─ Data layer (ORM -> DB)
     └─ SQLite (local) or Postgres (server mode) sqlite in case of single user.
```

## Best frameworks / tools

* Web framework: **FastAPI** (async, DI, docs, easy).
* ORM: **SQLAlchemy (1.4+)** + **Alembic** for migrations (or **Tortoise ORM** if you prefer async-first).
* Math libs: **NumPy**, **SciPy**, **pandas**, **PyTorch** (if ML).
* Packaging: **PyInstaller** or **briefcase** (but PyInstaller is common).
* IPC/Realtime : **WebSockets** or local **Socket**.
* Linting/format: **ruff**, **black**, **isort**.
* Logging/monitoring: **structlog** or Python `logging`, optionally push to local logs. --> ? winston
* Build for installer: **electron-builder** (frontend) + packaged Python binary included in installer.

## Example DB



### 1. **Patients Table**

* Stores basic patient info.
* **Columns:**

  * `patient_id` (primary key)
  * `name`
  * `age`
  * `gender`
  * other patient details --> including patient profile i.e. disorders.

---

### 2. **Sessions Table**

* Each session of a patient.
* **Columns:**

  * `session_id` (primary key)
  * `patient_id` (foreign key → Patients)
  * `date`
  * `general_notes` (that are for a single session only)

---

### 3. **SessionParts Table** (for later)

* A session is divided into parts.
* **Columns:**

  * `part_id` (primary key)
  * `session_id` (foreign key → Sessions)
  * `part_number` (e.g., 1, 2, 3 …)
  * `notes` (disorders, protocols, ...)

---

### 4. **Disorders Table**

* Master list of all possible disorders.
* **Columns:**

  * `disorder_id` (primary key)
  * `name`
  * `description`

---

### 5. **Protocols Table**

* Master list of possible protocols.
* **Columns:**

  * `protocol_id` (primary key)
  * `name`
  * `description`

---

### 6. **SessionPart\_Disorders Table** (many-to-many relationship)

* Links session parts with disorders.
* **Columns:**

  * `part_id` (foreign key → SessionParts)
  * `disorder_id` (foreign key → Disorders)

---

### 7. **SessionPart\_Protocols Table** (many-to-many relationship)

* Links session parts with protocols.
* **Columns:**

  * `part_id` (foreign key → SessionParts)
  * `protocol_id` (foreign key → Protocols)

electron --> api call (http, ws) --> Fast api.


## User Story:

### User login:

* The user logs in,

**API Calls:**
- `POST /users/login` - Authenticate user with username/email and password

**Example Input:**
```json
{
  "username": "dr.smith",
  "password": "secure_password"
}
```

**Example Output:**
```json
{
  "success": true,
  "user": { "id": 1, "username": "dr.smith", "first_name": "John", "last_name": "Smith" },
  "message": "Login successful"
}
```

### List patients and user history:

* list of the patients

**API Calls:**
- `GET /patients/by-doctor/{doctor_id}` - Get all patients for the logged-in doctor
- `GET /sessions/by-doctor/{doctor_id}` - Get recent sessions for the doctor

**Example Output:**
```json
// Patients: [{"id": 1, "first_name": "Jane", "last_name": "Doe", "date_of_birth": "1990-01-01"}]
// Sessions: [{"id": 1, "session_type": "training", "protocol_type": "TBR", "overall_success_rate": 0.75}]
```

* user's history: everything that user has done for the past few days.

**API Calls:**
- `GET /sessions/by-date-range/?start_date=2025-01-01&end_date=2025-01-31` - Get sessions within date range

**Example Output:**
```json
[{"id": 1, "session_type": "training", "start_time": "2025-01-15T10:00:00Z", "duration_seconds": 1800, "status": "completed"}]
```

### Choose patient: (goes to Home panel)

* choose the patient that is being visited.

**API Calls:**
- `GET /patients/by-id/{patient_id}` - Get detailed patient information
- `GET /sessions/by-patient/{patient_id}` - Get all sessions for selected patient

**Example Output:**
```json
// Patient: {"id": 1, "first_name": "Jane", "last_name": "Doe", "date_of_birth": "1990-01-01"}
// Sessions: [{"id": 1, "session_type": "baseline", "protocol_type": "TBR", "overall_success_rate": 0.68}]
```

### Choose patient: (Plan panel)
* Get their plan, their sessions, and their info. Each patient has a treatment plan with checkpoints, blocks, and assigned protocols.

**API Calls:**
- `GET /patients/by-id/{patient_id}` - Get patient information
- `GET /planning/plans/patient/{patient_id}` - Get patient's treatment plan
- `GET /planning/plans/{plan_id}` - Get detailed plan with checkpoints and blocks
- `GET /planning/blocks/current/patient/{patient_id}` - Get current active block
- `GET /sessions/by-patient/{patient_id}` - Get all sessions for the patient

**Example Output:**
```json
// Patient Plan Structure:
{
  "id": 1,
  "patient_id": 1,
  "checkpoints": [
    {
      "id": 1,
      "order_index": 1,
      "disorder_id": 1,
      "is_completed": false,
      "blocks": [
        {
          "id": 1,
          "order_index": 1,
          "protocol_id": 2,
          "session_count": 6,
          "current_session": 0,
          "is_completed": false
        }
      ]
    }
  ]
}
```

### Choose patient: (History of patient panel):

show a set of sessions, for each session, its duration, number of rounds, protocol(detailed not just p1)...

**API Calls:**
- `GET /sessions/by-patient/{patient_id}` - Get all sessions for the patient
- `GET /sessions/by-status/{status}` - Filter by session status

**Example Output:**
```json
[{"id": 1, "session_type": "training", "protocol_type": "TBR", "duration_seconds": 1800, "session_rounds": 3, "overall_success_rate": 0.75, "doctor_notes": "Good progress"}]
```

### Protocol Management

* Create, view, update, and delete custom protocols for patients. Each patient has their own protocol library with 6 default protocols that cannot be deleted.

**API Calls:**
- `POST /protocols/` - Create custom protocol for a patient
- `GET /protocols/` - List all protocols for the current user
- `GET /protocols/patient/{patient_id}` - Get protocols for specific patient
- `GET /protocols/{protocol_id}` - Get specific protocol details
- `PUT /protocols/{protocol_id}` - Update existing protocol
- `DELETE /protocols/{protocol_id}` - Delete custom protocol (default protocols cannot be deleted)

**Example Input (Create Protocol):**
```json
{
  "name": "Custom Alpha Protocol",
  "note": "Customized alpha training for specific patient needs",
  "patient_id": 1,
  "features": {
    "frequency_bands": {"alpha": [9, 11]},
    "channels": ["F3", "F4"],
    "threshold_type": "percentile",
    "threshold_value": 75.0,
    "feedback_type": "visual",
    "session_duration": 25,
    "target_metric": "power",
    "normalization_method": "baseline"
  }
}
```

**Example Output:**
```json
{
  "id": 5,
  "name": "Custom Alpha Protocol",
  "note": "Customized alpha training for specific patient needs",
  "patient_id": 1,
  "doctor_id": 1,
  "features": {
    "frequency_bands": {"alpha": [9, 11]},
    "channels": ["F3", "F4"],
    "threshold_type": "percentile",
    "threshold_value": 75.0,
    "feedback_type": "visual",
    "session_duration": 25,
    "target_metric": "power",
    "normalization_method": "baseline"
  },
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

### Simplified Workflow: Disorder → Protocol → Session

* **Step 1**: Create disorder with just the name (all other fields set to false)
* **Step 2**: Choose protocol from available protocols
* **Step 3**: Start session with selected protocol

**API Calls:**
- `POST /planning/disorders/` - Create new disorder (simplified)
- `GET /protocols/patient/{patient_id}` - Get available protocols
- `POST /sessions/` - Start session with selected protocol

**Example Input (Create Simple Disorder):**
```json
{
  "disorder": "ADHD",
  "left_alpha_excess": false,
  "frontal_beta_low": false,
  "high_beta_high": false,
  "paf_slow": false,
  "coherence": false,
  "qeeg_other": null,
  "isi": false,
  "gad7": false,
  "phq": false,
  "wm": false,
  "executive_c": false,
  "sustained_a": false,
  "cognitive_other": null,
  "trauma": false,
  "rumination": false,
  "anxiety": false,
  "observation_note": null
}
```

**Example Output:**
```json
{
  "id": 1,
  "disorder": "ADHD",
  "left_alpha_excess": false,
  "frontal_beta_low": false,
  "high_beta_high": false,
  "paf_slow": false,
  "coherence": false,
  "qeeg_other": null,
  "isi": false,
  "gad7": false,
  "phq": false,
  "wm": false,
  "executive_c": false,
  "sustained_a": false,
  "cognitive_other": null,
  "trauma": false,
  "rumination": false,
  "anxiety": false,
  "observation_note": null,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

### Treatment Plan Management

* Create and manage treatment plans with checkpoints (associated with disorders) and blocks (with assigned protocols).

**API Calls:**
- `POST /planning/plans/default` - Create default plan for patient
- `GET /planning/plans/patient/{patient_id}` - Get patient's plans
- `POST /planning/checkpoints/` - Create checkpoint with disorder
- `POST /planning/blocks/` - Create block for checkpoint
- `POST /planning/blocks/{block_id}/assign-default-protocol` - Assign default protocol to block
- `POST /planning/blocks/{block_id}/assign-protocol` - Assign specific protocol to block

**Example Input (Create Checkpoint with Disorder):**
```json
{
  "plan_id": 1,
  "order_index": 1,
  "disorder_id": 1
}
```

**Example Input (Create Block):**
```json
{
  "checkpoint_id": 1,
  "order_index": 1,
  "session_count": 6,
  "protocol_id": 2
}
```

**Example Input (Assign Protocol to Block):**
```json
{
  "patient_id": 1,
  "user_id": 1
}
```

### Start Session - Simple Protocol Selection

* After creating a disorder, users choose a protocol from the available protocols and start a session.

**API Calls:**
- `GET /protocols/patient/{patient_id}` - Get available protocols for patient
- `POST /sessions/` - Create new session with selected protocol
- `WebSocket /sp/nfcore_start` - Start real-time neurofeedback session

**Example Input (Start Session):**
```json
{
  "session_type": "training",
  "protocol_type": "P1_Frontal_Activation",
  "start_time": "2025-01-15T14:00:00Z",
  "channels": "[\"F3\"]",
  "patient_id": 1,
  "doctor_id": 1,
  "doctor_notes": "Frontal activation protocol for ADHD treatment"
}
```

**Example Output:**
```json
{"id": 2, "session_type": "training", "protocol_type": "P1_Frontal_Activation", "status": "active", "patient_id": 1, "doctor_id": 1}
```

### Start session - Start recording. (nf-core)

**API Calls:**
- `GET /sp/device/status` - Check device availability and status
- `WebSocket /sp/nfcore_start` - Start real-time neurofeedback session

**Example Input (WebSocket Start Command):**
```json
{
  "selected_features": ["alpha", "theta", "beta", "theta_beta_ratio"],
  "feature_modes": {"alpha": "enhance", "theta": "enhance", "beta": "inhibit", "theta_beta_ratio": "inhibit"},
  "mapping": "threshold",
  "success_rate": 0.75,
  "session_duration": 1800
}
```

**Example Output (Real-time Feedback):**
```json
{
  "type": "feedback",
  "session_time": 5,
  "selected_features": ["alpha", "theta", "beta", "theta_beta_ratio"],
  "feedback": 0.0,
  "individual_features": {"alpha": -0.095, "theta": 0.112, "beta": -0.0001},
  "baseline_status": {"alpha": {"is_ready": true, "progress": 1.0}},
  "threshold_stats": {"alpha": {"current_threshold": 0.5, "success_rate": 0.75}},
  "feature_thresholds": {"alpha": {"threshold": 0.5, "current_value": -0.095, "success": false}}
}
```

### Session Completion

**API Calls:**
- `PATCH /sessions/{session_id}/complete` - Mark session as completed
- `PUT /sessions/{session_id}` - Update session with final metrics

**Example Input:**
```json
{
  "end_time": "2025-01-15T14:30:00Z",
  "duration_seconds": 1800,
  "overall_success_rate": 0.78,
  "total_reward_time_seconds": 1404,
  "doctor_notes": "Excellent session, patient showed good focus"
}
```

**Example Output:**
```json
{"id": 2, "status": "completed", "overall_success_rate": 0.78, "duration_seconds": 1800}
```

## Complete API Reference

### Disorder Management (Planning Module)
- `POST /planning/disorders/` - Create disorder assessment
- `GET /planning/disorders/` - List all disorders
- `GET /planning/disorders/{disorder_id}` - Get specific disorder
- `PUT /planning/disorders/{disorder_id}` - Update disorder
- `DELETE /planning/disorders/{disorder_id}` - Delete disorder

### Treatment Plan Management (Planning Module)
- `POST /planning/plans/default` - Create default plan for patient
- `GET /planning/plans/patient/{patient_id}` - Get patient's plans
- `GET /planning/plans/{plan_id}` - Get detailed plan with checkpoints and blocks
- `POST /planning/checkpoints/` - Create checkpoint with disorder
- `GET /planning/checkpoints/plan/{plan_id}` - Get checkpoints for plan
- `POST /planning/blocks/` - Create block for checkpoint
- `GET /planning/blocks/checkpoint/{checkpoint_id}` - Get blocks for checkpoint
- `GET /planning/blocks/current/patient/{patient_id}` - Get current active block
- `POST /planning/blocks/{block_id}/assign-default-protocol` - Assign default protocol
- `POST /planning/blocks/{block_id}/assign-protocol` - Assign specific protocol

### Protocol Management
- `POST /protocols/` - Create custom protocol
- `GET /protocols/patient/{patient_id}` - Get protocols for patient
- `GET /protocols/{protocol_id}` - Get specific protocol
- `PUT /protocols/{protocol_id}` - Update protocol
- `DELETE /protocols/{protocol_id}` - Delete protocol
- `POST /protocols/patient/{patient_id}/initialize-defaults` - Initialize default protocols

### Session Management
- `POST /sessions/` - Create new session
- `GET /sessions/by-patient/{patient_id}` - Get sessions for patient
- `GET /sessions/by-doctor/{doctor_id}` - Get sessions for doctor
- `PUT /sessions/{session_id}` - Update session
- `PATCH /sessions/{session_id}/complete` - Mark session as completed

### Real-time Neurofeedback
- `WebSocket /sp/nfcore_start` - Start neurofeedback session
- `GET /sp/device/status` - Check device status

## Database Schema

### Disorders Table
- `id` - Primary key
- `disorder` - Disorder name (e.g., "ADHD", "Anxiety", "Depression")
- `left_alpha_excess` - Left alpha excess finding (boolean)
- `frontal_beta_low` - Frontal beta low finding (boolean)
- `high_beta_high` - High beta high finding (boolean)
- `paf_slow` - PAF slow finding (boolean)
- `coherence` - Coherence finding (boolean)
- `qeeg_other` - Other QEEG findings (text, optional)
- `isi` - ISI (Insomnia Severity Index) (boolean)
- `gad7` - GAD-7 (Generalized Anxiety Disorder) (boolean)
- `phq` - PHQ (Patient Health Questionnaire) (boolean)
- `wm` - Working Memory (boolean)
- `executive_c` - Executive Control (boolean)
- `sustained_a` - Sustained Attention (boolean)
- `cognitive_other` - Other cognitive findings (text, optional)
- `trauma` - Trauma observation (boolean)
- `rumination` - Rumination observation (boolean)
- `anxiety` - Anxiety observation (boolean)
- `observation_note` - Additional observation notes (text, optional)
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
- `disorder_id` - Foreign key to disorders table
- `is_completed` - Completion status
- `completed_at` - Completion timestamp
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Blocks Table
- `id` - Primary key
- `order_index` - Order within the checkpoint
- `checkpoint_id` - Foreign key to checkpoints table
- `protocol_id` - Foreign key to protocol_library table (optional)
- `session_count` - Number of sessions in the block
- `current_session` - Current session number
- `is_completed` - Completion status
- `completed_at` - Completion timestamp
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Coming Soon Features

### Advanced Analytics
- `GET /analytics/patient-progress/{patient_id}` - Patient progress over time
- `GET /analytics/session-comparison/` - Compare sessions
- `GET /analytics/protocol-effectiveness/` - Protocol effectiveness metrics
- `GET /analytics/disorder-tracking/{disorder_id}` - Disorder progression tracking

### Cloud Sync
- `POST /sync/upload` - Upload data to cloud
- `GET /sync/status` - Check sync status
- `POST /sync/download` - Download from cloud

### Advanced Planning Features
- `GET /planning/checkpoints/{checkpoint_id}/disorder-progression` - Track disorder changes
- `POST /planning/blocks/{block_id}/recommend-protocol` - AI-powered protocol recommendations
- `GET /planning/plans/{plan_id}/effectiveness` - Plan effectiveness metrics


migration:
    1. email --> number
    2. feedback type to sessions
    3. live session api websocket --> round config and feedback value.
