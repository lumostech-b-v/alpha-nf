from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime
from app.sessions import schemas, crud
from app.sessions.crud import SessionCRUD
from app.core import database

router = APIRouter(prefix="/sessions", tags=["Sessions"])
get_db = database.get_db
session_crud = SessionCRUD()

# -------------------
# Create session
# -------------------
@router.post("/", response_model=schemas.Session)
def create_session(session: schemas.SessionCreate, db: Session = Depends(get_db)):
    return session_crud.create(db, session)

# -------------------
# GET by session_id
# -------------------
@router.get("/by-id/{session_id}", response_model=schemas.Session)
def get_session_by_id(session_id: int, db: Session = Depends(get_db)):
    session = session_crud.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

# -------------------
# GET by patient_id
# -------------------
@router.get("/by-patient/{patient_id}", response_model=list[schemas.Session])
def get_sessions_by_patient(patient_id: int, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_patient(db, patient_id)
    # Return empty list instead of 404 when no sessions found (collection query)
    return sessions if sessions else []

# -------------------
# GET by doctor_id
# -------------------
@router.get("/by-doctor/{doctor_id}", response_model=list[schemas.Session])
def get_sessions_by_doctor(doctor_id: int, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_doctor(db, doctor_id)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found for this doctor")
    return sessions

# -------------------
# GET by patient_id and doctor_id
# -------------------
@router.get("/by-patient-doctor/{patient_id}/{doctor_id}", response_model=list[schemas.Session])
def get_sessions_by_patient_and_doctor(patient_id: int, doctor_id: int, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_patient_and_doctor(db, patient_id, doctor_id)
    # Return empty list instead of 404 when no sessions found (collection query)
    return sessions if sessions else []


# -------------------
# GET by protocol_type
# -------------------
@router.get("/by-protocol/{protocol_type}", response_model=list[schemas.Session])
def get_sessions_by_protocol(protocol_type: str, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_protocol_type(db, protocol_type)
    if not sessions:
        raise HTTPException(status_code=404, detail=f"No sessions found with protocol: {protocol_type}")
    return sessions

# -------------------
# GET by feedback_type
# -------------------
@router.get("/by-feedback/{feedback_type}", response_model=list[schemas.Session])
def get_sessions_by_feedback_type(feedback_type: str, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_feedback_type(db, feedback_type)
    if not sessions:
        raise HTTPException(status_code=404, detail=f"No sessions found with feedback type: {feedback_type}")
    return sessions

# -------------------
# GET unsynced sessions
# -------------------
@router.get("/unsynced", response_model=list[schemas.Session])
def get_unsynced_sessions(db: Session = Depends(get_db)):
    sessions = session_crud.get_unsynced_sessions(db)
    if not sessions:
        raise HTTPException(status_code=404, detail="No unsynced sessions found")
    return sessions

# -------------------
# GET by date range
# -------------------
@router.get("/by-date-range/", response_model=list[schemas.Session])
def get_sessions_by_date_range(start_date: datetime, end_date: datetime, db: Session = Depends(get_db)):
    sessions = session_crud.get_by_date_range(db, start_date, end_date)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found in this date range")
    return sessions

# -------------------
# GET all
# -------------------
@router.get("/", response_model=list[schemas.Session])
def list_sessions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return session_crud.get_all(db, skip=skip, limit=limit)

# -------------------
# Update
# -------------------
@router.put("/{session_id}", response_model=schemas.Session)
def update_session(session_id: int, session: schemas.SessionUpdate, db: Session = Depends(get_db)):
    db_session = session_crud.update(db, session_id, session)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db_session

# -------------------
# Mark as completed
# -------------------
@router.patch("/{session_id}/complete", response_model=schemas.Session)
def complete_session(session_id: int, end_time: Optional[datetime] = None, db: Session = Depends(get_db)):
    if end_time is None:
        end_time = datetime.now()
    db_session = session_crud.mark_as_completed(db, session_id, end_time)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db_session

# -------------------
# Mark as synced
# -------------------
@router.patch("/{session_id}/sync", response_model=schemas.Session)
def sync_session(session_id: int, db: Session = Depends(get_db)):
    db_session = session_crud.mark_as_synced(db, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db_session

# -------------------
# Delete
# -------------------
@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    success = session_crud.delete(db, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}
