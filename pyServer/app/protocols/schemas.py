from pydantic import BaseModel, field_validator
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

class FrequencyBandConfig(BaseModel):
    """Configuration for a single frequency band"""
    # Regular band fields
    frequency: Optional[float] = None  # The frequency number itself (e.g., 10.0 for 10 Hz)
    frequency_range: Optional[List[float]] = None  # [min, max] frequency range (e.g., [8.0, 12.0])
    channels: Optional[List[str]] = []  # List of channel names (e.g., ["F3", "F4"])
    channel_indices: Optional[List[int]] = []  # List of channel indices (e.g., [0, 1, 2] for channels 1, 2, 3)
    type: str  # Either "reward", "inhibit", or "ratio"

    # Ratio-specific fields
    numerator: Optional[str] = None  # Name of the numerator feature for ratio type
    denominator: Optional[str] = None  # Name of the denominator feature for ratio type
    numerator_channel_index: Optional[int] = None  # Specific channel index for numerator
    denominator_channel_index: Optional[int] = None  # Specific channel index for denominator
    name: Optional[str] = None  # Name for the ratio feature
    mode: Optional[str] = None  # "enhance" or "inhibit" for ratio type - whether to increase or decrease the ratio value

    @field_validator('type')
    def validate_type(cls, v):
        if v not in ["reward", "inhibit", "ratio"]:
            raise ValueError("type must be 'reward', 'inhibit', or 'ratio'")
        return v

    @field_validator('frequency_range')
    def validate_frequency_range(cls, v):
        if v is not None and len(v) != 2:
            raise ValueError('frequency_range must be a list with exactly 2 elements [min, max]')
        return v

class ProtocolFeatures(BaseModel):
    """Schema for protocol features that can be fed into nf-core"""
    # Frequency bands configuration - list of band configs
    frequency_bands: List[FrequencyBandConfig]
    # Protocol type to indicate special processing (e.g., ratio, connectivity, etc.)
    protocol_type: Optional[str] = "standard"  # "standard", "ratio", etc.

class ProtocolBase(BaseModel):
    name: str
    note: Optional[str] = None
    features: ProtocolFeatures

class ProtocolCreate(ProtocolBase):
    patient_id: Optional[int] = None  # Make patient_id optional to support user-level protocols

class ProtocolUpdate(BaseModel):
    name: Optional[str] = None
    note: Optional[str] = None
    features: Optional[ProtocolFeatures] = None

class ProtocolInDB(ProtocolBase):
    id: int
    user_id: int
    patient_id: Optional[int] = None  # May be null if protocol is user-level
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Protocol(ProtocolInDB):
    pass

class ProtocolList(BaseModel):
    protocols: List[Protocol]
    total: int

