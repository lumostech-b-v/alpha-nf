from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Boolean, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    block_id = Column(Integer, ForeignKey("blocks.id"), nullable=True)  # Optional link to planning block
    
    # Session details
    session_type = Column(String(50), nullable=False, default="training")  # 'baseline' or 'training'
    protocol_type = Column(String(50), nullable=False)  # 'TBR', 'Alpha', 'Beta'
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    # EEG configuration
    channels = Column(Text, nullable=False)  # JSON array of used channels
    sample_rate = Column(Integer, default=250)
    session_rounds = Column(Integer, default=5)
    
    # Performance metrics
    overall_success_rate = Column(Float, nullable=True)
    total_reward_time_seconds = Column(Integer, nullable=True)
    total_artifact_time_seconds = Column(Integer, nullable=True)
    average_impedance = Column(Float, nullable=True)
    
    # Data storage
    baseline_data = Column(Text, nullable=True)  # JSON object with baseline values
    thresholds = Column(Text, nullable=True)  # JSON object with calculated thresholds
    raw_data_file = Column(String(500), nullable=True)
    processed_data_file = Column(String(500), nullable=True)
    
    # Doctor's notes/description
    doctor_notes = Column(Text, nullable=True)  # Doctor's description/notes about the session

    # Feedback mapping type
    feedback_type = Column(String(50), nullable=True)  # 'sigmoid', 'linear', or 'threshold'

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Sync status
    synced = Column(Boolean, default=False)
    sync_timestamp = Column(DateTime, nullable=True)
    
    # Relationships
    patient = relationship("Patient", back_populates="sessions")
    doctor = relationship("User")
    block = relationship("Block", back_populates="sessions")
