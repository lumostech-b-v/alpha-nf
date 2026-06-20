from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List

# -------------------
# Patient schemas
# -------------------
class PatientBase(BaseModel):
    first_name: str
    last_name: str
    gender: Optional[bool] = None
    phone_number: Optional[str] = None
    date_of_birth: date


class PatientCreate(PatientBase):
    doctor_id: int


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[bool] = None
    phone_number: Optional[str] = None
    date_of_birth: Optional[date] = None
    is_active: Optional[bool] = None
    sync_enabled: Optional[bool] = None
    disorder_id: Optional[int] = None  # Link patient to disorder


class Patient(PatientBase):
    id: int
    is_active: bool
    sync_enabled: Optional[bool] = None
    last_synced: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    doctor_id: int
    disorder_id: Optional[int] = None

    class Config:
        from_attributes = True
