#!/usr/bin/env python3
"""
Script to initialize default protocols for users (doctors).
Protocols are user-owned, not patient-specific, so this script initializes
protocols once per user rather than per patient.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.core.database import SessionLocal, engine
from app.protocols import crud, models
from app.patients.models import Patient
from app.users.models import User

def initialize_protocols_for_all_users():
    """Initialize default protocols for all users who have patients"""
    db = SessionLocal()
    try:
        # Get all unique user IDs from patients (doctors who have patients)
        user_ids = db.query(Patient.doctor_id).filter(
            Patient.is_active == True
        ).distinct().all()
        
        if not user_ids:
            print("No users with active patients found.")
            return
        
        user_ids = [uid[0] for uid in user_ids]  # Extract from tuples
        print(f"Found {len(user_ids)} users with active patients.")
        
        total_created = 0
        for user_id in user_ids:
            user = db.query(User).filter(User.id == user_id).first()
            user_name = user.username if user else f"User {user_id}"
            print(f"Initializing protocols for user: {user_name} (ID: {user_id})")
            
            # Check if user already has default protocols
            existing_protocols = db.query(models.ProtocolLibrary).filter(
                and_(
                    models.ProtocolLibrary.user_id == user_id,
                    models.ProtocolLibrary.is_default == True,
                    models.ProtocolLibrary.is_active == True
                )
            ).all()
            
            if existing_protocols:
                print(f"  - User already has {len(existing_protocols)} default protocols. Skipping.")
                continue
            
            # Create default protocols for this user
            created_protocols = crud.create_default_protocols(db, user_id)
            total_created += len(created_protocols)
            print(f"  - Created {len(created_protocols)} default protocols.")
        
        print(f"\nTotal protocols created: {total_created}")
        print("Protocol initialization complete!")
        
    except Exception as e:
        print(f"Error initializing protocols: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

def initialize_protocols_for_user(user_id: int):
    """Initialize default protocols for a specific user"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User with ID {user_id} not found.")
            return
        
        print(f"Initializing protocols for user: {user.username} (ID: {user_id})")
        
        # Check if user already has default protocols
        existing_protocols = db.query(models.ProtocolLibrary).filter(
            and_(
                models.ProtocolLibrary.user_id == user_id,
                models.ProtocolLibrary.is_default == True,
                models.ProtocolLibrary.is_active == True
            )
        ).all()
        
        if existing_protocols:
            print(f"  - User already has {len(existing_protocols)} default protocols. Skipping.")
            return
        
        # Create default protocols for this user
        created_protocols = crud.create_default_protocols(db, user_id)
        print(f"  - Created {len(created_protocols)} default protocols.")
        print("Protocol initialization complete!")
        
    except Exception as e:
        print(f"Error initializing protocols: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            user_id = int(sys.argv[1])
            initialize_protocols_for_user(user_id)
        except ValueError:
            print("Error: User ID must be an integer")
            sys.exit(1)
    else:
        initialize_protocols_for_all_users()


