from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# -------------------
# Session schemas
# -------------------

class SessionBase(BaseModel):
    session_type: str = "training"  # 'baseline' or 'training'
    protocol_type: str  # 'TBR', 'Alpha', 'Beta'
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    channels: str  # JSON array of used channels
    sample_rate: int = 250
    session_rounds: int = 5
    overall_success_rate: Optional[float] = None
    total_reward_time_seconds: Optional[int] = None
    total_artifact_time_seconds: Optional[int] = None
    average_impedance: Optional[float] = None
    baseline_data: Optional[str] = None  # JSON object with baseline values
    thresholds: Optional[str] = None  # JSON object with calculated thresholds
    raw_data_file: Optional[str] = None
    processed_data_file: Optional[str] = None
    doctor_notes: Optional[str] = None
    feedback_type: Optional[str] = None  # 'sigmoid', 'linear', or 'threshold'


class SessionCreate(SessionBase):
    patient_id: int
    doctor_id: int


class SessionUpdate(BaseModel):
    session_type: Optional[str] = None
    protocol_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    channels: Optional[str] = None
    sample_rate: Optional[int] = None
    session_rounds: Optional[int] = None
    overall_success_rate: Optional[float] = None
    total_reward_time_seconds: Optional[int] = None
    total_artifact_time_seconds: Optional[int] = None
    average_impedance: Optional[float] = None
    baseline_data: Optional[str] = None
    thresholds: Optional[str] = None
    raw_data_file: Optional[str] = None
    processed_data_file: Optional[str] = None
    doctor_notes: Optional[str] = None
    feedback_type: Optional[str] = None  # 'sigmoid', 'linear', or 'threshold'
    synced: Optional[bool] = None
    sync_timestamp: Optional[datetime] = None


class Session(SessionBase):
    id: int
    patient_id: int
    doctor_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    synced: bool
    sync_timestamp: Optional[datetime] = None
    
    class Config:
        from_attributes = True
