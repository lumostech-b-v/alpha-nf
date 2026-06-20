from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class ProtocolLibrary(Base):
    __tablename__ = "protocol_library"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    note = Column(Text, nullable=True)
    features = Column(JSON, nullable=False)  # Store features as JSON for flexibility
    is_default = Column(Boolean, default=False)  # Mark default protocols that cannot be deleted
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Foreign key - each protocol belongs to a user
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Relationships
    user = relationship("User")


