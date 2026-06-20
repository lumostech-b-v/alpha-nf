from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional, List

# -------------------
# User schemas
# -------------------
class UserBase(BaseModel):
    username: str
    email: EmailStr
    first_name: str
    last_name: str


class UserCreate(UserBase):
    password: str  # plain password to be hashed before saving


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None


class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# -------------------
# Authentication schemas
# -------------------
class LoginRequest(BaseModel):
    username: str  # Can be username or email
    password: str


class LoginResponse(BaseModel):
    success: bool
    user: Optional[User] = None
    token: Optional[str] = None
    message: str


class TokenData(BaseModel):
    user_id: int
    username: str


class TokenVerifyResponse(BaseModel):
    valid: bool
    user: Optional[User] = None
    token_data: Optional[TokenData] = None
