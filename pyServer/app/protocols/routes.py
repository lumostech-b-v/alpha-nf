from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user
from app.protocols import crud, schemas
from app.users.models import User as UserModel

router = APIRouter(prefix="/protocols", tags=["protocols"])

@router.post("/", response_model=schemas.Protocol)
def create_protocol(
    protocol: schemas.ProtocolCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new protocol for the current user"""
    return crud.create_protocol(db, protocol, current_user.id)

@router.get("/", response_model=List[schemas.Protocol])
def get_all_protocols(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all protocols for the current user (protocols are user-owned, not patient-specific)"""
    from app.protocols.schemas import Protocol
    
    db_protocols = crud.get_all_protocols(db, current_user.id)
    
    # Filter out protocols with invalid structure (old format)
    # This allows the API to work while you migrate old protocols to the new structure
    valid_protocols = []
    for db_protocol in db_protocols:
        try:
            # Validate structure matches new schema
            protocol_dict = {
                "id": db_protocol.id,
                "name": db_protocol.name,
                "note": db_protocol.note,
                "user_id": db_protocol.user_id,
                "is_default": db_protocol.is_default,
                "is_active": db_protocol.is_active,
                "created_at": db_protocol.created_at,
                "updated_at": db_protocol.updated_at,
                "features": db_protocol.features
            }
            Protocol(**protocol_dict)  # Will raise ValidationError if invalid
            valid_protocols.append(db_protocol)
        except Exception:
            # Skip protocols with invalid structure (old format)
            # These will need to be migrated or recreated
            continue
    
    return valid_protocols

@router.get("/{protocol_id}", response_model=schemas.Protocol)
def get_protocol(
    protocol_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get a specific protocol by ID"""
    from app.protocols.schemas import Protocol
    
    protocol = crud.get_protocol(db, protocol_id, current_user.id)
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    # Validate protocol structure matches new schema
    try:
        protocol_dict = {
            "id": protocol.id,
            "name": protocol.name,
            "note": protocol.note,
            "user_id": protocol.user_id,
            "is_default": protocol.is_default,
            "is_active": protocol.is_active,
            "created_at": protocol.created_at,
            "updated_at": protocol.updated_at,
            "features": protocol.features
        }
        Protocol(**protocol_dict)  # Validate
        return protocol
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Protocol has invalid structure (old format). Please migrate or recreate this protocol. Error: {str(e)}"
        )

@router.put("/{protocol_id}", response_model=schemas.Protocol)
def update_protocol(
    protocol_id: int,
    protocol_update: schemas.ProtocolUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update an existing protocol"""
    # Check if protocol is default before attempting update
    existing_protocol = crud.get_protocol(db, protocol_id, current_user.id)
    if existing_protocol and existing_protocol.is_default:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Default protocols cannot be modified"
        )
    
    protocol = crud.update_protocol(db, protocol_id, protocol_update, current_user.id)
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    return protocol

@router.delete("/{protocol_id}")
def delete_protocol(
    protocol_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a protocol (soft delete)"""
    # Check if protocol is default before attempting delete
    existing_protocol = crud.get_protocol(db, protocol_id, current_user.id)
    if existing_protocol and existing_protocol.is_default:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Default protocols cannot be deleted"
        )
    
    success = crud.delete_protocol(db, protocol_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    return {"message": "Protocol deleted successfully"}

@router.post("/initialize-defaults")
def initialize_default_protocols(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Initialize the 3 default protocols for the current user"""
    created_protocols = crud.create_default_protocols(db, current_user.id)
    return {
        "message": f"Initialized {len(created_protocols)} default protocols",
        "protocols_created": len(created_protocols)
    }
