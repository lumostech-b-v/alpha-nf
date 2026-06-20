from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.planning import crud, schemas

router = APIRouter(prefix="/planning", tags=["planning"])

# -------------------
# Disorder routes
# -------------------

@router.post("/disorders/", response_model=schemas.Disorder)
def create_disorder(disorder: schemas.DisorderCreate, db: Session = Depends(get_db)):
    """Create a new disorder"""
    return crud.create_disorder(db=db, disorder=disorder)

@router.get("/disorders/", response_model=List[schemas.Disorder])
def get_disorders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all disorders"""
    return crud.get_disorders(db=db, skip=skip, limit=limit)

@router.get("/disorders/{disorder_id}", response_model=schemas.Disorder)
def get_disorder(disorder_id: int, db: Session = Depends(get_db)):
    """Get a specific disorder"""
    disorder = crud.get_disorder(db=db, disorder_id=disorder_id)
    if disorder is None:
        raise HTTPException(status_code=404, detail="Disorder not found")
    return disorder

@router.put("/disorders/{disorder_id}", response_model=schemas.Disorder)
def update_disorder(disorder_id: int, disorder_update: schemas.DisorderUpdate, db: Session = Depends(get_db)):
    """Update a disorder (creates a new version, keeps previous versions)"""
    try:
        disorder = crud.update_disorder(db=db, disorder_id=disorder_id, disorder_update=disorder_update)
    except Exception as e:
        print("error happend")
        print(e)
        breakpoint()
    if disorder is None:
        raise HTTPException(status_code=404, detail="Disorder not found")
    return disorder

@router.put("/disorders/patient/{patient_id}", response_model=schemas.Disorder)
def update_disorder_for_patient(patient_id: int, disorder_update: schemas.DisorderUpdate, db: Session = Depends(get_db)):
    """Update disorder for a patient (creates a new version, keeps previous versions)"""
    disorder = crud.update_disorder_for_patient(db=db, patient_id=patient_id, disorder_update=disorder_update)
    if disorder is None:
        raise HTTPException(status_code=404, detail="No disorder found for patient")
    return disorder

@router.delete("/disorders/{disorder_id}")
def delete_disorder(disorder_id: int, db: Session = Depends(get_db)):
    """Delete a disorder version (only this version, previous versions are preserved)"""
    success = crud.delete_disorder(db=db, disorder_id=disorder_id)
    if not success:
        raise HTTPException(status_code=404, detail="Disorder not found")
    return {"message": "Disorder version deleted successfully"}

@router.get("/disorders/patient/{patient_id}", response_model=schemas.Disorder)
def get_latest_disorder_by_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get the latest disorder version for a patient"""
    disorder = crud.get_latest_disorder_by_patient(db=db, patient_id=patient_id)
    if disorder is None:
        raise HTTPException(status_code=404, detail="No disorder found for patient")
    return disorder

@router.get("/disorders/patient/{patient_id}/versions", response_model=List[schemas.Disorder])
def get_disorder_versions_by_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get all disorder versions for a patient, ordered by version descending (latest first)"""
    return crud.get_disorder_versions_by_patient(db=db, patient_id=patient_id)

# -------------------
# Block routes
# -------------------

@router.post("/blocks/", response_model=schemas.Block)
def create_block(block: schemas.BlockCreate, db: Session = Depends(get_db)):
    """Create a new block"""
    return crud.create_block(db=db, block=block)

@router.post("/blocks/default", response_model=schemas.Block)
def create_default_block(patient_id: int, start_session: int, end_session: int, protocol_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Create a default block for a patient"""
    return crud.create_default_block(
        db=db, 
        patient_id=patient_id, 
        start_session=start_session,
        end_session=end_session,
        protocol_id=protocol_id
    )

@router.get("/blocks/patient/{patient_id}", response_model=List[schemas.Block])
def get_blocks_by_patient(patient_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all blocks for a patient"""
    return crud.get_blocks_by_patient(db=db, patient_id=patient_id, skip=skip, limit=limit)

@router.get("/blocks/current/patient/{patient_id}", response_model=schemas.Block)
def get_current_block(patient_id: int, db: Session = Depends(get_db)):
    """Get the current active block for a patient"""
    block = crud.get_current_block(db=db, patient_id=patient_id)
    if block is None:
        raise HTTPException(status_code=404, detail="No active block found for patient")
    return block

@router.get("/blocks/{block_id}", response_model=schemas.Block)
def get_block(block_id: int, db: Session = Depends(get_db)):
    """Get a specific block"""
    block = crud.get_block(db=db, block_id=block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block

@router.put("/blocks/{block_id}", response_model=schemas.Block)
def update_block(block_id: int, block_update: schemas.BlockUpdate, db: Session = Depends(get_db)):
    """Update a block"""
    block = crud.update_block(db=db, block_id=block_id, block_update=block_update)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block

@router.delete("/blocks/{block_id}")
def delete_block(block_id: int, db: Session = Depends(get_db)):
    """Delete a block (soft delete)"""
    success = crud.delete_block(db=db, block_id=block_id)
    if not success:
        raise HTTPException(status_code=404, detail="Block not found")
    return {"message": "Block deleted successfully"}

@router.post("/blocks/{block_id}/assign-default-protocol", response_model=schemas.Block)
def assign_default_protocol_to_block(block_id: int, user_id: int, db: Session = Depends(get_db)):
    """Assign a default protocol to a block"""
    block = crud.assign_default_protocol_to_block(db=db, block_id=block_id, user_id=user_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block

@router.post("/blocks/{block_id}/assign-protocol", response_model=schemas.Block)
def assign_protocol_to_block(block_id: int, protocol_id: int, db: Session = Depends(get_db)):
    """Assign a specific protocol to a block"""
    block = crud.assign_protocol_to_block(db=db, block_id=block_id, protocol_id=protocol_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block

# -------------------
# Checkpoint routes
# -------------------

@router.post("/checkpoints/", response_model=schemas.Checkpoint)
def create_checkpoint(checkpoint: schemas.CheckpointCreate, db: Session = Depends(get_db)):
    """Create a new checkpoint"""
    return crud.create_checkpoint(db=db, checkpoint=checkpoint)

# Note: Use get_checkpoints_by_patient or get_checkpoints_by_user instead
# Generic get_all_checkpoints can be added to CRUD if needed

@router.get("/checkpoints/{checkpoint_id}", response_model=schemas.Checkpoint)
def get_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    """Get a specific checkpoint"""
    checkpoint = crud.get_checkpoint(db=db, checkpoint_id=checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return checkpoint

@router.get("/checkpoints/patient/{patient_id}", response_model=List[schemas.Checkpoint])
def get_checkpoints_by_patient(patient_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all checkpoints for a patient"""
    return crud.get_checkpoints_by_patient(db=db, patient_id=patient_id, skip=skip, limit=limit)

@router.get("/checkpoints/user/{user_id}", response_model=List[schemas.Checkpoint])
def get_checkpoints_by_user(user_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all checkpoints created by a user"""
    return crud.get_checkpoints_by_user(db=db, user_id=user_id, skip=skip, limit=limit)

@router.put("/checkpoints/{checkpoint_id}", response_model=schemas.Checkpoint)
def update_checkpoint(checkpoint_id: int, checkpoint_update: schemas.CheckpointUpdate, db: Session = Depends(get_db)):
    """Update a checkpoint"""
    checkpoint = crud.update_checkpoint(db=db, checkpoint_id=checkpoint_id, checkpoint_update=checkpoint_update)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return checkpoint

@router.delete("/checkpoints/{checkpoint_id}")
def delete_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    """Delete a checkpoint"""
    success = crud.delete_checkpoint(db=db, checkpoint_id=checkpoint_id)
    if not success:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return {"message": "Checkpoint deleted successfully"}

# -------------------
# Plan Generation routes
# -------------------

@router.post("/generate-plan", response_model=schemas.GeneratePlanResponse)
def generate_plan_from_disorder(request: schemas.GeneratePlanRequest, db: Session = Depends(get_db)):
    """
    Generate treatment blocks based on disorder type.
    Returns a plan with generated blocks (not yet saved to database).
    """
    generated_blocks = crud.generate_blocks_from_disorder(
        db=db,
        disorder_name=request.disorder_name,
        patient_id=request.patient_id,
        total_sessions=request.total_sessions
    )
    
    # Calculate total sessions from blocks
    total_sessions = max([block.end_session for block in generated_blocks], default=20) if generated_blocks else 20
    
    return schemas.GeneratePlanResponse(
        blocks=generated_blocks,
        total_sessions=total_sessions,
        disorder_name=request.disorder_name
    )

@router.post("/generate-plan/create", response_model=List[schemas.Block])
def generate_and_create_plan_from_disorder(request: schemas.GeneratePlanRequest, db: Session = Depends(get_db)):
    """
    Generate treatment blocks from disorder and immediately create them in the database.
    Automatically deletes existing blocks before creating new ones.
    """
    # Automatically delete existing blocks if they exist
    existing_blocks = crud.get_blocks_by_patient(db=db, patient_id=request.patient_id)
    if existing_blocks:
        for block in existing_blocks:
            crud.delete_block(db=db, block_id=block.id)
    
    # Generate blocks
    generated_blocks = crud.generate_blocks_from_disorder(
        db=db,
        disorder_name=request.disorder_name,
        patient_id=request.patient_id,
        total_sessions=request.total_sessions
    )
    
    if not generated_blocks:
        raise HTTPException(status_code=400, detail="No blocks generated for this disorder")
    
    # Create blocks in database
    created_blocks = crud.create_blocks_from_generated(
        db=db,
        patient_id=request.patient_id,
        generated_blocks=generated_blocks
    )
    
    return created_blocks

