from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

# Import Patient for forward reference (circular import handling)
# from app.patients.models import Patient  # Will be imported where needed

class Disorder(Base):
    __tablename__ = "disorders"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign key - Disorder belongs to a patient
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    
    # Version tracking - each update creates a new version
    version = Column(Integer, nullable=False, default=1)  # Version number for this patient's disorder
    
    # Disorder information
    disorder = Column(String, nullable=False)  # Disorder name
    
    # QEEG findings
    left_alpha_excess = Column(Boolean, default=False)
    frontal_beta_low = Column(Boolean, default=False)
    high_beta_high = Column(Boolean, default=False)
    high_tbr = Column(Boolean, default=False)
    paf_slow = Column(Boolean, default=False)
    coherence = Column(Boolean, default=False)
    qeeg_other = Column(String, nullable=True)
    
    # Symptoms
    isi = Column(Boolean, default=False)  # ISI (Insomnia Severity Index)
    gad7 = Column(Boolean, default=False)  # GAD-7 (Generalized Anxiety Disorder)
    phq = Column(Boolean, default=False)  # PHQ (Patient Health Questionnaire)
    
    # Cognitive
    wm = Column(Boolean, default=False)  # Working Memory
    executive_c = Column(Boolean, default=False)  # Executive Control
    sustained_a = Column(Boolean, default=False)  # Sustained Attention
    cognitive_other = Column(String, nullable=True)
    
    # Observation
    trauma = Column(Boolean, default=False)
    rumination = Column(Boolean, default=False)
    anxiety = Column(Boolean, default=False)
    observation_note = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    patient = relationship("Patient", foreign_keys=[patient_id], back_populates="disorder_versions")

class Block(Base):
    __tablename__ = "blocks"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys - Block belongs directly to Patient
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    protocol_id = Column(Integer, ForeignKey("protocol_library.id"), nullable=True)  # Can be null initially
    
    # Block configuration - start and end session numbers
    start_session = Column(Integer, nullable=False)  # Start session number
    end_session = Column(Integer, nullable=False)  # End session number
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    patient = relationship("Patient", back_populates="blocks")
    protocol = relationship("ProtocolLibrary", foreign_keys=[protocol_id])
    # Cascade delete: when block is deleted, delete all associated sessions
    sessions = relationship("Session", back_populates="block", cascade="all, delete-orphan")

class Checkpoint(Base):
    __tablename__ = "checkpoints"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Checkpoint data
    session_value = Column(Integer, nullable=False)  # Session number for this checkpoint
    checkpoint_type = Column(String, nullable=False)  # Type of checkpoint
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    patient = relationship("Patient")
    user = relationship("User")
