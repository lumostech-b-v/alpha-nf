from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
import logging
from app.planning import models, schemas
from app.protocols import crud as protocol_crud

logger = logging.getLogger(__name__)

# -------------------
# Disorder CRUD operations
# -------------------

def get_disorder(db: Session, disorder_id: int) -> Optional[models.Disorder]:
    return db.query(models.Disorder).filter(models.Disorder.id == disorder_id).first()

def get_disorders(db: Session, skip: int = 0, limit: int = 100) -> List[models.Disorder]:
    return db.query(models.Disorder).offset(skip).limit(limit).all()

def get_latest_disorder_by_patient(db: Session, patient_id: int) -> Optional[models.Disorder]:
    """Get the latest disorder version for a patient"""
    from app.patients.models import Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient and patient.disorder_id:
        return db.query(models.Disorder).filter(models.Disorder.id == patient.disorder_id).first()
    # Fallback: get latest by version if no disorder_id set
    latest = db.query(models.Disorder).filter(
        models.Disorder.patient_id == patient_id
    ).order_by(models.Disorder.version.desc()).first()
    return latest

def get_disorder_versions_by_patient(db: Session, patient_id: int) -> List[models.Disorder]:
    """Get all disorder versions for a patient, ordered by version descending"""
    return db.query(models.Disorder).filter(
        models.Disorder.patient_id == patient_id
    ).order_by(models.Disorder.version.desc()).all()

def get_disorder_by_patient(db: Session, patient_id: int) -> Optional[models.Disorder]:
    """Alias for get_latest_disorder_by_patient for backwards compatibility"""
    return get_latest_disorder_by_patient(db, patient_id)

def create_disorder(db: Session, disorder: schemas.DisorderCreate) -> models.Disorder:
    """Create a new disorder (first version) for a patient"""
    from app.patients.models import Patient
    
    disorder_data = disorder.dict()
    patient_id = disorder_data.get('patient_id')
    if not patient_id:
        raise ValueError("patient_id is required to create a disorder")
    
    # Remove patient_id from dict to pass remaining fields to model
    disorder_data.pop('patient_id', None)
    
    # Create disorder with version 1
    db_disorder = models.Disorder(
        patient_id=patient_id,
        version=1,
        **disorder_data
    )
    db.add(db_disorder)
    db.commit()
    db.refresh(db_disorder)
    
    # Update patient's disorder_id to point to this new disorder
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient:
        patient.disorder_id = db_disorder.id
        db.commit()
    
    return db_disorder

def update_disorder_for_patient(db: Session, patient_id: int, disorder_update: schemas.DisorderUpdate) -> Optional[models.Disorder]:
    """Update disorder by creating a new version (keeps previous versions)"""
    from app.patients.models import Patient
    
    # Get the current latest disorder
    current_disorder = get_latest_disorder_by_patient(db, patient_id)
    if not current_disorder:
        # If no disorder exists, create it
        disorder_data = disorder_update.dict(exclude_unset=True)
        disorder_data['patient_id'] = patient_id
        return create_disorder(db, schemas.DisorderCreate(**disorder_data))
    
    # Get next version number
    max_version = db.query(models.Disorder).filter(
        models.Disorder.patient_id == patient_id
    ).order_by(models.Disorder.version.desc()).first()
    
    next_version = (max_version.version if max_version else 0) + 1
    
    # Create new disorder version with updated data
    update_data = disorder_update.dict(exclude_unset=True)
    # Copy all fields from current disorder
    new_disorder_data = {
        'patient_id': patient_id,
        'version': next_version,
        'disorder': update_data.get('disorder', current_disorder.disorder),
        'left_alpha_excess': update_data.get('left_alpha_excess', current_disorder.left_alpha_excess),
        'frontal_beta_low': update_data.get('frontal_beta_low', current_disorder.frontal_beta_low),
        'high_beta_high': update_data.get('high_beta_high', current_disorder.high_beta_high),
        'high_tbr': update_data.get('high_tbr', getattr(current_disorder, 'high_tbr', False)),
        'paf_slow': update_data.get('paf_slow', current_disorder.paf_slow),
        'coherence': update_data.get('coherence', current_disorder.coherence),
        'qeeg_other': update_data.get('qeeg_other', current_disorder.qeeg_other),
        'isi': update_data.get('isi', current_disorder.isi),
        'gad7': update_data.get('gad7', current_disorder.gad7),
        'phq': update_data.get('phq', current_disorder.phq),
        'wm': update_data.get('wm', current_disorder.wm),
        'executive_c': update_data.get('executive_c', current_disorder.executive_c),
        'sustained_a': update_data.get('sustained_a', current_disorder.sustained_a),
        'cognitive_other': update_data.get('cognitive_other', current_disorder.cognitive_other),
        'trauma': update_data.get('trauma', current_disorder.trauma),
        'rumination': update_data.get('rumination', current_disorder.rumination),
        'anxiety': update_data.get('anxiety', current_disorder.anxiety),
        'observation_note': update_data.get('observation_note', current_disorder.observation_note),
    }
    
    new_disorder = models.Disorder(**new_disorder_data)
    db.add(new_disorder)
    db.commit()
    db.refresh(new_disorder)
    
    # Update patient's disorder_id to point to the new version
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient:
        patient.disorder_id = new_disorder.id
        db.commit()
    
    return new_disorder

def update_disorder(db: Session, disorder_id: int, disorder_update: schemas.DisorderUpdate) -> Optional[models.Disorder]:
    """Update a specific disorder (creates new version)"""
    db_disorder = db.query(models.Disorder).filter(models.Disorder.id == disorder_id).first()
    if db_disorder:
        return update_disorder_for_patient(db, db_disorder.patient_id, disorder_update)
    return None

def delete_disorder(db: Session, disorder_id: int) -> bool:
    """Delete a disorder (only this version, doesn't delete patient's history)"""
    db_disorder = db.query(models.Disorder).filter(models.Disorder.id == disorder_id).first()
    if db_disorder:
        # If this is the latest version, update patient's disorder_id to previous version
        from app.patients.models import Patient
        patient = db.query(Patient).filter(Patient.id == db_disorder.patient_id).first()
        if patient and patient.disorder_id == disorder_id:
            # Find previous version
            previous = db.query(models.Disorder).filter(
                and_(
                    models.Disorder.patient_id == db_disorder.patient_id,
                    models.Disorder.version < db_disorder.version
                )
            ).order_by(models.Disorder.version.desc()).first()
            if previous:
                patient.disorder_id = previous.id
            else:
                patient.disorder_id = None
        
        db.delete(db_disorder)
        db.commit()
        return True
    return False

# -------------------
# Block CRUD operations
# -------------------

def get_block(db: Session, block_id: int) -> Optional[models.Block]:
    return db.query(models.Block).filter(models.Block.id == block_id).first()

def get_blocks_by_patient(db: Session, patient_id: int, skip: int = 0, limit: int = 100) -> List[models.Block]:
    """Get all blocks for a patient, ordered by start_session"""
    return db.query(models.Block).filter(
        models.Block.patient_id == patient_id
    ).order_by(models.Block.start_session).offset(skip).limit(limit).all()

def get_current_block(db: Session, patient_id: int) -> Optional[models.Block]:
    """Get the current active block for a patient (based on session number)"""
    # This would need session context to determine which block is "current"
    # For now, return the block with the highest start_session
    return db.query(models.Block).filter(
        models.Block.patient_id == patient_id
    ).order_by(models.Block.start_session.desc()).first()

def create_block(db: Session, block: schemas.BlockCreate) -> models.Block:
    db_block = models.Block(**block.dict(exclude={'target'}))
    db.add(db_block)
    db.commit()
    db.refresh(db_block)
    return db_block

def create_default_block(db: Session, patient_id: int, start_session: int, end_session: int, protocol_id: Optional[int] = None) -> models.Block:
    """Create a default block for a patient"""
    db_block = models.Block(
        patient_id=patient_id, 
        start_session=start_session,
        end_session=end_session,
        protocol_id=protocol_id
    )
    db.add(db_block)
    db.commit()
    db.refresh(db_block)
    return db_block

def update_block(db: Session, block_id: int, block_update: schemas.BlockUpdate) -> Optional[models.Block]:
    db_block = db.query(models.Block).filter(models.Block.id == block_id).first()
    if db_block:
        update_data = block_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_block, field, value)
        db.commit()
        db.refresh(db_block)
    return db_block

def delete_block(db: Session, block_id: int) -> bool:
    db_block = db.query(models.Block).filter(models.Block.id == block_id).first()
    if db_block:
        db.delete(db_block)
        db.commit()
        return True
    return False

# Note: complete_block and advance_block_session removed as they're no longer needed
# with the simplified block structure

def assign_default_protocol_to_block(db: Session, block_id: int, user_id: int) -> Optional[models.Block]:
    """Assign a default protocol to a block based on the user's default protocols"""
    db_block = db.query(models.Block).filter(models.Block.id == block_id).first()
    if not db_block:
        return None
    
    # Get the first default protocol for this user
    all_protocols = protocol_crud.get_all_protocols(db, user_id)
    default_protocol = next((p for p in all_protocols if p.is_default), None)
    
    if default_protocol:
        db_block.protocol_id = default_protocol.id
        db.commit()
        db.refresh(db_block)
    
    return db_block

def assign_protocol_to_block(db: Session, block_id: int, protocol_id: int) -> Optional[models.Block]:
    """Assign a specific protocol to a block"""
    db_block = db.query(models.Block).filter(models.Block.id == block_id).first()
    if db_block:
        db_block.protocol_id = protocol_id
        db.commit()
        db.refresh(db_block)
    return db_block

# -------------------
# Checkpoint CRUD operations
# -------------------

def get_checkpoint(db: Session, checkpoint_id: int) -> Optional[models.Checkpoint]:
    return db.query(models.Checkpoint).filter(models.Checkpoint.id == checkpoint_id).first()

def get_checkpoints_by_patient(db: Session, patient_id: int, skip: int = 0, limit: int = 100) -> List[models.Checkpoint]:
    """Get all checkpoints for a patient"""
    return db.query(models.Checkpoint).filter(
        models.Checkpoint.patient_id == patient_id
    ).order_by(models.Checkpoint.session_value).offset(skip).limit(limit).all()

def get_checkpoints_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[models.Checkpoint]:
    """Get all checkpoints created by a user"""
    return db.query(models.Checkpoint).filter(
        models.Checkpoint.user_id == user_id
    ).order_by(models.Checkpoint.session_value).offset(skip).limit(limit).all()

def create_checkpoint(db: Session, checkpoint: schemas.CheckpointCreate) -> models.Checkpoint:
    """Create a new checkpoint"""
    db_checkpoint = models.Checkpoint(**checkpoint.dict())
    db.add(db_checkpoint)
    db.commit()
    db.refresh(db_checkpoint)
    return db_checkpoint

def update_checkpoint(db: Session, checkpoint_id: int, checkpoint_update: schemas.CheckpointUpdate) -> Optional[models.Checkpoint]:
    """Update a checkpoint"""
    db_checkpoint = db.query(models.Checkpoint).filter(models.Checkpoint.id == checkpoint_id).first()
    if db_checkpoint:
        update_data = checkpoint_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_checkpoint, field, value)
        db.commit()
        db.refresh(db_checkpoint)
    return db_checkpoint

def delete_checkpoint(db: Session, checkpoint_id: int) -> bool:
    """Delete a checkpoint"""
    db_checkpoint = db.query(models.Checkpoint).filter(models.Checkpoint.id == checkpoint_id).first()
    if db_checkpoint:
        db.delete(db_checkpoint)
        db.commit()
        return True
    return False

# -------------------
# Plan Generation operations
# -------------------

def get_default_plan_for_disorder(disorder_name: str) -> dict:
    """
    Simple function: takes disorder name, returns an empty plan (no default blocks).
    Returns a dict with 'total_sessions' and empty 'blocks' list.
    This function now returns empty blocks to require manual creation.
    """
    # Return empty plan - no default plans are assigned anymore
    return {
        'total_sessions': 25,  # Default session count, but no blocks are assigned
        'blocks': []  # Empty blocks list - user needs to create first block manually
    }


def generate_blocks_from_disorder(db: Session, disorder_name: str, patient_id: int, total_sessions: Optional[int] = None) -> List[schemas.GeneratedBlock]:
    """
    Generate treatment blocks based on disorder type.
    Simple: uses get_default_plan_for_disorder and maps protocol identifiers to actual protocol IDs.
    """
    # Get the simple plan for this disorder
    plan = get_default_plan_for_disorder(disorder_name)
    
    # Use provided total_sessions or default from plan
    final_total_sessions = total_sessions if total_sessions else plan['total_sessions']
    
    # Get patient's user to find their protocols
    from app.patients.models import Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    user_id = patient.doctor_id if patient and patient.doctor_id else None
    
    if not user_id:
        raise ValueError(f"Patient {patient_id} has no assigned doctor/user. Cannot generate blocks without protocols.")
    
    # Get protocols from library
    existing_protocols = protocol_crud.get_all_protocols(db, user_id)
    if not existing_protocols:
        raise ValueError(f"No protocols found in library for user {user_id}. Please create protocols first.")
    
    # Build simple map: P1, P2, P3 -> actual protocol
    protocol_map = {}
    for p in existing_protocols:
        p_name_upper = p.name.upper()
        if 'P1' in p_name_upper and 'P1' not in protocol_map:
            protocol_map['P1'] = p
        if 'P2' in p_name_upper and 'P2' not in protocol_map:
            protocol_map['P2'] = p
        if 'P3' in p_name_upper and 'P3' not in protocol_map:
            protocol_map['P3'] = p
    
    # Generate blocks
    generated_blocks = []
    for block_config in plan['blocks']:
        start = block_config['start_session']
        end = block_config['end_session']
        protocol_id_str = block_config['protocol_id']  # 'P1', 'P2', or 'P3'
        
        # Adjust if exceeds total sessions
        if end > final_total_sessions:
            end = final_total_sessions
        if start > final_total_sessions:
            continue
        
        # Find the actual protocol
        protocol = protocol_map.get(protocol_id_str)
        if not protocol:
            # Fallback: use first available protocol
            protocol = existing_protocols[0] if existing_protocols else None
        
        if not protocol or not protocol.id:
            raise ValueError(f"Could not find protocol {protocol_id_str} for user {user_id}")
        
        generated_blocks.append(schemas.GeneratedBlock(
            start_session=start,
            end_session=end,
            protocol_id=protocol.id,
            protocol_name=protocol.name,
            target=block_config['target']
        ))
    
    return generated_blocks

def create_blocks_from_generated(db: Session, patient_id: int, generated_blocks: List[schemas.GeneratedBlock]) -> List[models.Block]:
    """
    Create actual Block records in database from generated blocks.
    """
    created_blocks = []
    for gen_block in generated_blocks:
        # Verify protocol_id is set
        if not gen_block.protocol_id:
            raise ValueError(f"Cannot create block without protocol_id. Block: {gen_block.start_session}-{gen_block.end_session}")
        
        db_block = models.Block(
            patient_id=patient_id,
            protocol_id=gen_block.protocol_id,  # This MUST be set
            start_session=gen_block.start_session,
            end_session=gen_block.end_session
        )
        db.add(db_block)
        created_blocks.append(db_block)
    
    db.commit()
    
    # Refresh all blocks to get IDs and verify protocol_id is saved
    for block in created_blocks:
        db.refresh(block)
        if not block.protocol_id:
            logger.error(f"WARNING: Block {block.id} was created without protocol_id!")
    
    return created_blocks
