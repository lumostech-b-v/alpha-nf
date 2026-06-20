from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.patients import schemas, crud
from app.patients.crud import PatientCRUD
from app.core import database
from app.core.auth import get_current_user
from app.users.models import User as UserModel

router = APIRouter(prefix="/patients", tags=["Patients"])

get_db = database.get_db
patient_crud = PatientCRUD()

# -------------------
# Create patient
# -------------------
@router.post("/", response_model=schemas.Patient)
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user), request: Request = None):
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Headers: {dict(request.headers)}")
    # Auto-assign the current user as the doctor
    patient.doctor_id = current_user.id
    return patient_crud.create(db, patient)

# -------------------
# GET by patient_id
# -------------------
@router.get("/by-id/{patient_id}", response_model=schemas.Patient)
def get_patient_by_id(patient_id: int, db: Session = Depends(get_db)):
    patient = patient_crud.get(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

# -------------------
# GET by doctor_id
# -------------------
@router.get("/by-doctor/{doctor_id}", response_model=list[schemas.Patient])
def get_patients_by_doctor(doctor_id: int, db: Session = Depends(get_db)):
    patients = patient_crud.get_by_doctor(db, doctor_id)
    if not patients:
        raise HTTPException(status_code=404, detail="No patients found for this doctor")
    return patients

# -------------------
# GET by phone number
# -------------------
@router.get("/by-phone/{phone_number}", response_model=list[schemas.Patient])
def get_patients_by_phone_number(phone_number: str, db: Session = Depends(get_db)):
    patients = patient_crud.get_by_phone_number(db, phone_number)
    if not patients:
        raise HTTPException(status_code=404, detail="No patients found with this phone number")
    return patients

# -------------------
# GET by first + last name
# -------------------
@router.get("/by-name/", response_model=list[schemas.Patient])
def get_patients_by_name(first_name: str, last_name: str, db: Session = Depends(get_db)):
    patients = patient_crud.get_by_name(db, first_name, last_name)
    if not patients:
        raise HTTPException(status_code=404, detail="No patients found")
    return patients

# -------------------
# GET all (user-specific)
# -------------------
@router.get("/", response_model=list[schemas.Patient])
def list_patients(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all patients for the current authenticated user"""
    return patient_crud.get_by_doctor(db, current_user.id)

# -------------------
# Update
# -------------------
@router.put("/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, patient: schemas.PatientUpdate, db: Session = Depends(get_db)):
    db_patient = patient_crud.update(db, patient_id, patient)
    if not db_patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return db_patient

# -------------------
# Delete
# -------------------
@router.delete("/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    success = patient_crud.delete(db, patient_id)
    if not success:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"ok": True}
