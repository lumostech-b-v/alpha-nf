from sqlalchemy.orm import Session
from typing import List, Optional
from app.users.schemas import UserCreate, UserBase, UserUpdate, User
from app.users.models import User
from passlib.context import CryptContext

# Use pbkdf2_sha256 to avoid bcrypt backend/version issues and support long passwords
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

class UserCRUD:
    def create(self, db: Session, user_create: UserCreate) -> User:
        #check if the user is new and unique.

        # Hash password using pbkdf2_sha256 (no 72-byte limit)
        hashed_password = pwd_context.hash(user_create.password)
        db_user = User(**user_create.dict(exclude={"password"}), password_hash=hashed_password)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    def get_by_userid(self, db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()

    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_username(self, db: Session, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    def get_by_name(self, db: Session, first_name: str, last_name: str) -> List[User]:
        return db.query(User).filter(User.first_name == first_name).filter(User.last_name == last_name).all()

    def get_all(self, db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        return db.query(User).offset(skip).limit(limit).all()

    def update(self, db: Session, user_id: int, user_update: UserUpdate) -> Optional[User]:
        db_user = self.get_by_userid(db, user_id)
        if not db_user:
            return None
        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_user, field, value)
        db.commit()
        db.refresh(db_user)
        return db_user

    def delete(self, db: Session, user_id: int) -> bool:
        db_user = self.get_by_userid(db, user_id)
        if not db_user:
            return False
        db.delete(db_user)
        db.commit()
        return True

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def authenticate_user(self, db: Session, username: str, password: str) -> Optional[User]:
        """Authenticate a user by username/email and password"""
        # Try to find user by username first, then by email
        user = self.get_by_username(db, username)
        if not user:
            user = self.get_by_email(db, username)
        
        if not user:
            return None
        
        if not self.verify_password(password, user.password_hash):
            return None
        
        return user
