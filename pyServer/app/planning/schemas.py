from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

# -------------------
# Disorder schemas
# -------------------

class DisorderBase(BaseModel):
    disorder: str
    
    # QEEG findings
    left_alpha_excess: bool = False
    frontal_beta_low: bool = False
    high_beta_high: bool = False
    high_tbr: bool = False
    paf_slow: bool = False
    coherence: bool = False
    qeeg_other: Optional[str] = None
    
    # Symptoms
    isi: bool = False
    gad7: bool = False
    phq: bool = False
    
    # Cognitive
    wm: bool = False
    executive_c: bool = False
    sustained_a: bool = False
    cognitive_other: Optional[str] = None
    
    # Observation
    trauma: bool = False
    rumination: bool = False
    anxiety: bool = False
    observation_note: Optional[str] = None

class DisorderCreate(DisorderBase):
    patient_id: int  # Disorder belongs to a patient

class DisorderUpdate(BaseModel):
    disorder: Optional[str] = None
    
    # QEEG findings
    left_alpha_excess: Optional[bool] = None
    frontal_beta_low: Optional[bool] = None
    high_beta_high: Optional[bool] = None
    high_tbr: Optional[bool] = None
    paf_slow: Optional[bool] = None
    coherence: Optional[bool] = None
    qeeg_other: Optional[str] = None
    
    # Symptoms
    isi: Optional[bool] = None
    gad7: Optional[bool] = None
    phq: Optional[bool] = None
    
    # Cognitive
    wm: Optional[bool] = None
    executive_c: Optional[bool] = None
    sustained_a: Optional[bool] = None
    cognitive_other: Optional[str] = None
    
    # Observation
    trauma: Optional[bool] = None
    rumination: Optional[bool] = None
    anxiety: Optional[bool] = None
    observation_note: Optional[str] = None

class Disorder(DisorderBase):
    id: int
    patient_id: int
    version: int  # Version number for this patient's disorder
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# -------------------
# Plan schemas
# -------------------

# -------------------
# Block schemas
# -------------------

class BlockBase(BaseModel):
    start_session: int
    end_session: int

class BlockCreate(BlockBase):
    patient_id: int
    protocol_id: Optional[int] = None
    target: Optional[str] = None

class BlockUpdate(BaseModel):
    start_session: Optional[int] = None
    end_session: Optional[int] = None
    protocol_id: Optional[int] = None

class Block(BlockBase):
    id: int
    patient_id: int
    protocol_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# -------------------
# Checkpoint schemas
# -------------------

class CheckpointBase(BaseModel):
    session_value: int
    checkpoint_type: str

class CheckpointCreate(CheckpointBase):
    patient_id: int
    user_id: int

class CheckpointUpdate(BaseModel):
    session_value: Optional[int] = None
    checkpoint_type: Optional[str] = None

class Checkpoint(CheckpointBase):
    id: int
    patient_id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# -------------------
# Plan Generation schemas
# -------------------

class GeneratePlanRequest(BaseModel):
    """Request to generate blocks from disorder"""
    disorder_name: str
    patient_id: int
    total_sessions: Optional[int] = None  # Optional: if not provided, uses default for disorder

class GeneratedBlock(BaseModel):
    """A generated block (not yet saved to database)"""
    start_session: int
    end_session: int
    protocol_id: Optional[int] = None
    protocol_name: Optional[str] = None  # For display purposes
    target: Optional[str] = None

class GeneratePlanResponse(BaseModel):
    """Response containing generated blocks"""
    blocks: List[GeneratedBlock]
    total_sessions: int
    disorder_name: str
