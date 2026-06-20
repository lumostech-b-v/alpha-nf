from pydantic import BaseModel
from typing import List
from app.users.schemas import User
from app.patients.schemas import Patient
from app.sessions.schemas import Session

class UserWithPatients(User):
    patients: List[Patient] = []

class PatientWithDoctor(Patient):
    doctor: User

# Session with related data
class SessionWithPatient(Session):
    patient: Patient

class SessionWithDoctor(Session):
    doctor: User

class SessionComplete(Session):
    patient: Patient
    doctor: User

# Patient with sessions
class PatientWithSessions(Patient):
    sessions: List[Session] = []

# Doctor with sessions
class UserWithSessions(User):
    sessions: List[Session] = []

# Complete patient data (doctor + sessions)
class PatientComplete(Patient):
    doctor: User
    sessions: List[Session] = []
