## Database Schema

### Users (Doctors)
- Primary key: `id`
- Fields:
  - `username`: Unique identifier
  - `email`: Unique email address
  - `first_name`, `last_name`: Personal information
  - `password_hash`: Securely stored password
  - `is_active`: Account status
  - `created_at`, `updated_at`: Timestamps

### Patients
- Primary key: `id`
- Fields:
  - `first_name`, `last_name`: Personal information
  - `gender`: Optional boolean
  - `phone_number`: Optional phone number
  - `date_of_birth`: Required date
  - `doctor_id`: Foreign key to Users
  - `is_active`: Account status
  - `sync_enabled`: Cloud sync flag
  - `last_synced`: Last sync timestamp
  - `created_at`, `updated_at`: Timestamps

### Sessions
- Primary key: `id`
- Fields:
  - `patient_id`: Foreign key to Patients
  - `doctor_id`: Foreign key to Users
  - Session Configuration:
    - `session_type`: 'baseline' or 'training'
    - `protocol_type`: 'TBR', 'Alpha', or 'Beta'
    - `channels`: JSON array of EEG channels
    - `sample_rate`: Default 250Hz
    - `session_rounds`: Default 5
    - `round_duration_seconds`: Default 300 (5 minutes per round)
  - Timing:
    - `start_time`: Required
    - `end_time`: Optional
    - `duration_seconds`: Calculated
  - Status:
    - `status`: Session state
    - `synced`: Cloud sync status
    - `sync_timestamp`: Last sync time
  - Performance Metrics:
    - `overall_success_rate`
    - `total_reward_time_seconds`
    - `total_artifact_time_seconds`
    - `average_impedance`
  - Data Storage:
    - `baseline_data`: JSON baseline values
    - `thresholds`: JSON threshold values
    - `raw_data_file`: Path to raw data
    - `processed_data_file`: Path to processed data
    - `doctor_notes`: Optional session notes
  - `feedback_type`: Optional feedback mapping type ('sigmoid', 'linear', 'threshold')

## API Endpoints

### Users API (users)
- `POST /`: Create new user
- `GET /`: List all users
- `GET /by-id/{user_id}`: Get user by ID
- `GET /by-email/{email}`: Get user by email
- `GET /by-username/{username}`: Get user by username
- `GET /by-name/`: Get users by first and last name
- `PUT /{user_id}`: Update user
- `DELETE /{user_id}`: Delete user

### Patients API (patients)
- `POST /`: Create new patient
- `GET /`: List all patients
- `GET /by-id/{patient_id}`: Get patient by ID
- `GET /by-doctor/{doctor_id}`: Get patients by doctor
- `GET /by-phone/{phone_number}`: Get patients by phone number
- `GET /by-name/`: Get patients by first and last name
- `PUT /{patient_id}`: Update patient
- `DELETE /{patient_id}`: Delete patient

### Sessions API (sessions)
- `POST /`: Create new session
- `GET /`: List all sessions
- `GET /by-id/{session_id}`: Get session by ID
- `GET /by-patient/{patient_id}`: Get sessions by patient
- `GET /by-doctor/{doctor_id}`: Get sessions by doctor
- `GET /by-patient-doctor/{patient_id}/{doctor_id}`: Get sessions by patient-doctor pair
- `GET /by-type/{session_type}`: Get sessions by type
- `GET /by-protocol/{protocol_type}`: Get sessions by protocol
- `GET /by-feedback/{feedback_type}`: Get sessions by feedback type
- `GET /by-status/{status}`: Get sessions by status
- `GET /active`: Get active sessions
- `GET /unsynced`: Get unsynced sessions
- `GET /by-date-range/`: Get sessions within date range
- `PUT /{session_id}`: Update session
- `PATCH /{session_id}/complete`: Mark session as completed
- `PATCH /{session_id}/sync`: Mark session as synced
- `DELETE /{session_id}`: Delete session

## Database Configuration
- Database URL configured via environment variable `DATABASE_URL`
- Default: `sqlite:///./app.db`
- SQLite-specific settings enabled
- Debug SQL logging enabled
- Connection pooling configured

## Security Features
- Password hashing using bcrypt
- Input validation using Pydantic schemas
- Database connection management using dependency injection

## Sync System
The application includes a cloud synchronization system:
- Sessions can be marked for sync
- Sync status tracking
- Timestamp recording for last sync
- Separate endpoints for managing sync state

## Usage Example

```python
# Create a new user (doctor)
POST /users/
{
    "username": "dr.smith",
    "email": "smith@hospital.com",
    "first_name": "John",
    "last_name": "Smith",
    "password": "secure_password"
}

# Create a patient
POST /patients/
{
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1990-01-01",
    "phone_number": "+1234567890",
    "doctor_id": 1
}

# Create a session
POST /sessions/
{
    "session_type": "baseline",
    "protocol_type": "TBR",
    "start_time": "2023-01-01T10:00:00",
    "channels": "[\"C3\", \"C4\"]",
    "patient_id": 1,
    "doctor_id": 1
}
```

---

## REST API Manual (Users, Patients, Sessions)

Base URL
```
http://localhost:8000
```

Notes
- All endpoints below are prefixed by their router: `/users`, `/patients`, `/sessions`.
- Query parameters are sent as standard URL query strings.
- Timestamps use ISO 8601 (e.g., `2025-09-30T10:00:00`).

### Users API (`/users`)

- POST `/` — Create user
- GET `/` — List users (pagination: `skip`, `limit`)
- GET `/by-id/{user_id}` — Get user by id
- GET `/by-email/{email}` — Get user by email
- GET `/by-username/{username}` — Get user by username
- GET `/by-name/` — Get users by first and last name (query: `first_name`, `last_name`)
- PUT `/{user_id}` — Update user (partial via JSON body)
- DELETE `/{user_id}` — Delete user

Schemas (body)
- Create: `{ username, email, first_name, last_name, password }`
- Update: any subset of `{ username, email, first_name, last_name, is_active }`

Examples
```bash
# Create
curl -X POST http://localhost:8000/users/ \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "dr.smith",
    "email": "smith@hospital.com",
    "first_name": "John",
    "last_name": "Smith",
    "password": "secure_password"
  }'

# List
curl 'http://localhost:8000/users/?skip=0&limit=100'

# Get by id
curl http://localhost:8000/users/by-id/1

# Get by email
curl http://localhost:8000/users/by-email/smith@hospital.com

# Get by username
curl http://localhost:8000/users/by-username/dr.smith

# Get by name
curl 'http://localhost:8000/users/by-name/?first_name=John&last_name=Smith'

# Update
curl -X PUT http://localhost:8000/users/1 \
  -H 'Content-Type: application/json' \
  -d '{ "is_active": true }'

# Delete
curl -X DELETE http://localhost:8000/users/1
```

---

### Patients API (`/patients`)

- POST `/` — Create patient
- GET `/` — List patients (pagination: `skip`, `limit`)
- GET `/by-id/{patient_id}` — Get patient by id
- GET `/by-doctor/{doctor_id}` — Patients for doctor
- GET `/by-email/{email}` — Patients by email
- GET `/by-name/` — Patients by name (query: `first_name`, `last_name`)
- PUT `/{patient_id}` — Update patient
- DELETE `/{patient_id}` — Delete patient

Schemas (body)
- Create: `{ first_name, last_name, date_of_birth, phone_number?, gender?, doctor_id }`
- Update: any subset of `{ first_name, last_name, date_of_birth, phone_number, gender, is_active, sync_enabled }`

Examples
```bash
# Create
curl -X POST http://localhost:8000/patients/ \
  -H 'Content-Type: application/json' \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1990-01-01",
    "phone_number": "+1234567890",
    "doctor_id": 1
  }'

# List
curl 'http://localhost:8000/patients/?skip=0&limit=100'

# Get by id
curl http://localhost:8000/patients/by-id/1

# Get by doctor
curl http://localhost:8000/patients/by-doctor/1

# Get by phone number
curl http://localhost:8000/patients/by-phone/+1234567890

# Get by name
curl 'http://localhost:8000/patients/by-name/?first_name=Jane&last_name=Doe'

# Update
curl -X PUT http://localhost:8000/patients/1 \
  -H 'Content-Type: application/json' \
  -d '{ "sync_enabled": true }'

# Delete
curl -X DELETE http://localhost:8000/patients/1
```

---

### Sessions API (`/sessions`)

- POST `/` — Create session
- GET `/` — List sessions (pagination: `skip`, `limit`)
- GET `/by-id/{session_id}` — Get session by id
- GET `/by-patient/{patient_id}` — Sessions for a patient
- GET `/by-doctor/{doctor_id}` — Sessions for a doctor
- GET `/by-patient-doctor/{patient_id}/{doctor_id}` — Sessions for specific pair
- GET `/by-type/{session_type}` — Filter by type (e.g., `baseline`, `training`)
- GET `/by-protocol/{protocol_type}` — Filter by protocol (e.g., `TBR`, `Alpha`, `Beta`)
- GET `/by-status/{status}` — Filter by status
- GET `/active` — Active sessions
- GET `/unsynced` — Unsynced sessions
- GET `/by-date-range/` — Date range filter (query: `start_date`, `end_date` ISO8601)
- PUT `/{session_id}` — Update session
- PATCH `/{session_id}/complete` — Mark as completed (query or body `end_time` optional)
- PATCH `/{session_id}/sync` — Mark as synced
- DELETE `/{session_id}` — Delete session

Schemas (body)
- Create: fields from SessionCreate including `{ patient_id, doctor_id, session_type, protocol_type, start_time, channels, ... }`
- Update: any subset of session fields; also supports `{ synced, sync_timestamp }`

Examples
```bash
# Create
curl -X POST http://localhost:8000/sessions/ \
  -H 'Content-Type: application/json' \
  -d '{
    "session_type": "baseline",
    "protocol_type": "TBR",
    "start_time": "2025-09-30T10:00:00",
    "channels": "[\"C3\", \"C4\"]",
    "feedback_type": "sigmoid",
    "patient_id": 1,
    "doctor_id": 1
  }'

# List
curl 'http://localhost:8000/sessions/?skip=0&limit=100'

# Get by id
curl http://localhost:8000/sessions/by-id/1

# By patient
curl http://localhost:8000/sessions/by-patient/1

# By doctor
curl http://localhost:8000/sessions/by-doctor/1

# By patient-doctor pair
curl http://localhost:8000/sessions/by-patient-doctor/1/1

# By type
curl http://localhost:8000/sessions/by-type/baseline

# By protocol
curl http://localhost:8000/sessions/by-protocol/TBR

# By feedback type
curl http://localhost:8000/sessions/by-feedback/sigmoid

# By status
curl http://localhost:8000/sessions/by-status/active

# Active sessions
curl http://localhost:8000/sessions/active

# Unsynced sessions
curl http://localhost:8000/sessions/unsynced

# Date range
curl 'http://localhost:8000/sessions/by-date-range/?start_date=2025-09-30T00:00:00&end_date=2025-09-30T23:59:59'

# Update
curl -X PUT http://localhost:8000/sessions/1 \
  -H 'Content-Type: application/json' \
  -d '{ "status": "completed" }'

# Complete (end_time optional; defaults to now if omitted)
curl -X PATCH 'http://localhost:8000/sessions/1/complete?end_time=2025-09-30T11:00:00'

# Sync
curl -X PATCH http://localhost:8000/sessions/1/sync

# Delete
curl -X DELETE http://localhost:8000/sessions/1
```

