#!/usr/bin/env python3
"""
Script to create a default doctor user for the neurofeedback system.
Run this script to set up the initial user account.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal
from app.users.models import User
from passlib.context import CryptContext

# Use pbkdf2_sha256 to avoid bcrypt backend/version issues
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def create_default_user():
    """Create a default doctor user"""
    print("Creating default doctor user...")
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Check if default user already exists
        existing_user = db.query(User).filter(User.username == 'default_doctor').first()
        if existing_user:
            print(f"Default user already exists: {existing_user.first_name} {existing_user.last_name}")
            print(f"Username: {existing_user.username}")
            print(f"Email: {existing_user.email}")
            return existing_user
        
        # Create new default user
        hashed_password = pwd_context.hash('neurofeedback123')
        user = User(
            username='default_doctor',
            email='doctor@neurofeedback.com',
            first_name='Default',
            last_name='Doctor',
            password_hash=hashed_password,
            is_active=True
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"Default user created successfully!")
        print(f"Username: {user.username}")
        print(f"Email: {user.email}")
        print(f"Name: {user.first_name} {user.last_name}")
        print(f"Password: neurofeedback123")
        print("\nYou can now login to the application with these credentials.")
        
        return user
        
    except Exception as e:
        print(f"Error creating default user: {e}")
        db.rollback()
        return None
    finally:
        db.close()

if __name__ == "__main__":
    create_default_user()
