from sqlalchemy.orm import Session as DBSession
from typing import List, Optional
from datetime import datetime
from app.sessions.schemas import SessionCreate, SessionUpdate
from app.sessions.models import Session

# -------------------
# Session CRUD
# -------------------

class SessionCRUD:
    """CRUD operations for Session model"""
    
    def create(self, db: DBSession, session_create: SessionCreate) -> Session:
        """Create a new session"""
        db_session = Session(**session_create.dict())
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        return db_session
    
    def get(self, db: DBSession, session_id: int) -> Optional[Session]:
        """Get a single session by ID"""
        return db.query(Session).filter(Session.id == session_id).first()
    
    def get_all(self, db: DBSession, skip: int = 0, limit: int = 100) -> List[Session]:
        """Get all sessions with pagination"""
        return db.query(Session).offset(skip).limit(limit).all()
    
    def get_by_patient(self, db: DBSession, patient_id: int) -> List[Session]:
        """Get all sessions for a specific patient"""
        return db.query(Session).filter(Session.patient_id == patient_id).all()
    
    def get_by_doctor(self, db: DBSession, doctor_id: int) -> List[Session]:
        """Get all sessions conducted by a specific doctor"""
        return db.query(Session).filter(Session.doctor_id == doctor_id).all()
    
    def get_by_patient_and_doctor(self, db: DBSession, patient_id: int, doctor_id: int) -> List[Session]:
        """Get all sessions for a specific patient-doctor combination"""
        return db.query(Session).filter(
            Session.patient_id == patient_id,
            Session.doctor_id == doctor_id
        ).all()
    
    def get_by_protocol_type(self, db: DBSession, protocol_type: str) -> List[Session]:
        """Get all sessions by protocol type (TBR, Alpha, Beta)"""
        return db.query(Session).filter(Session.protocol_type == protocol_type).all()

    def get_by_feedback_type(self, db: DBSession, feedback_type: str) -> List[Session]:
        """Get all sessions by feedback type (sigmoid, linear, threshold)"""
        return db.query(Session).filter(Session.feedback_type == feedback_type).all()
    
    def get_by_date_range(self, db: DBSession, start_date: datetime, end_date: datetime) -> List[Session]:
        """Get all sessions within a date range"""
        return db.query(Session).filter(
            Session.start_time >= start_date,
            Session.start_time <= end_date
        ).all()
    
    
    def get_unsynced_sessions(self, db: DBSession) -> List[Session]:
        """Get all sessions that haven't been synced to cloud"""
        return db.query(Session).filter(Session.synced == False).all()
    
    def update(self, db: DBSession, session_id: int, session_update: SessionUpdate) -> Optional[Session]:
        """Update an existing session"""
        db_session = self.get(db, session_id)
        if not db_session:
            return None
        
        update_data = session_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_session, field, value)
        
        db.commit()
        db.refresh(db_session)
        return db_session
    
    def mark_as_completed(self, db: DBSession, session_id: int, end_time: datetime) -> Optional[Session]:
        """Set end time and calculate duration"""
        db_session = self.get(db, session_id)
        if not db_session:
            return None
        
        db_session.end_time = end_time
        
        # Calculate duration if start_time exists
        if db_session.start_time:
            duration = (end_time - db_session.start_time).total_seconds()
            db_session.duration_seconds = int(duration)
        
        db.commit()
        db.refresh(db_session)
        return db_session
    
    def mark_as_synced(self, db: DBSession, session_id: int) -> Optional[Session]:
        """Mark a session as synced to cloud"""
        db_session = self.get(db, session_id)
        if not db_session:
            return None
        
        db_session.synced = True
        db_session.sync_timestamp = datetime.now()
        
        db.commit()
        db.refresh(db_session)
        return db_session
    
    def delete(self, db: DBSession, session_id: int) -> bool:
        """Delete a session"""
        db_session = self.get(db, session_id)
        if not db_session:
            return False
        
        db.delete(db_session)
        db.commit()
        return True
