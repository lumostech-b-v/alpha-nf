from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Boolean, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(200), nullable=False)
    last_name = Column(String(200), nullable=False)
    gender = Column(Boolean, nullable=True)
    phone_number = Column(String(200), nullable=True)
    date_of_birth = Column(Date, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    sync_enabled = Column(Boolean, nullable=True)
    last_synced = Column(DateTime, nullable=True)
    
    # Foreign keys
    doctor_id = Column(Integer, ForeignKey("users.id"))
    disorder_id = Column(Integer, ForeignKey("disorders.id"), nullable=True)  # One disorder per patient
    
    # Relationships
    doctor = relationship("User")
    # Latest disorder version - uses disorder_id pointing to Disorder.id
    disorder = relationship("Disorder", foreign_keys=[disorder_id], post_update=True)
    # All disorder versions - uses Disorder.patient_id pointing to Patient.id
    # Specify primaryjoin to avoid ambiguity since Patient also has disorder_id FK
    # Cascade delete: when patient is deleted, delete all disorder versions
    disorder_versions = relationship(
        "Disorder", 
        primaryjoin="Patient.id == Disorder.patient_id",
        back_populates="patient",
        cascade="all, delete-orphan"
    )
    sessions = relationship("Session", back_populates="patient", cascade="all, delete-orphan")
    blocks = relationship("Block", back_populates="patient", cascade="all, delete-orphan")
