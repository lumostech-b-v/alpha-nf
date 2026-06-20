from sqlalchemy.orm import Session
from typing import List, Optional
from app.patients.schemas import PatientCreate, PatientUpdate
from app.patients.models import Patient
from passlib.context import CryptContext

# -------------------
# Patient CRUD
# -------------------
class PatientCRUD:
    def create(self, db: Session, patient_create: PatientCreate) -> Patient:
        db_patient = Patient(**patient_create.dict())
        db.add(db_patient)
        db.commit()
        db.refresh(db_patient)
        
        return db_patient

    def get(self, db: Session, patient_id: int) -> Optional[Patient]:
        return db.query(Patient).filter(Patient.id == patient_id).first()

    def get_all(self, db: Session, skip: int = 0, limit: int = 100) -> List[Patient]:
        return db.query(Patient).offset(skip).limit(limit).all()

    def get_by_doctor(self, db: Session, doctor_id: int) -> List[Patient]:
        return db.query(Patient).filter(Patient.doctor_id == doctor_id).all()

    def get_by_phone_number(self, db: Session, phone_number: str) -> List[Patient]:
        return db.query(Patient).filter(Patient.phone_number == phone_number).all()

    def get_by_name(self, db: Session, first_name: str, last_name: str) -> List[Patient]:
        return db.query(Patient).filter(Patient.first_name == first_name).filter(Patient.last_name == last_name).all()

    def update(self, db: Session, patient_id: int, patient_update: PatientUpdate) -> Optional[Patient]:
        db_patient = self.get(db, patient_id)
        if not db_patient:
            return None
        update_data = patient_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_patient, field, value)
        db.commit()
        db.refresh(db_patient)
        return db_patient

    def delete(self, db: Session, patient_id: int) -> bool:
        db_patient = self.get(db, patient_id)
        if not db_patient:
            return False
        db.delete(db_patient)
        db.commit()
        return True
