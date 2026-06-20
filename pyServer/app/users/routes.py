from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core import database
from app.core.auth import create_access_token, verify_token, get_current_user
from app.users.schemas import UserCreate, UserBase, UserUpdate, User as UserSchema, LoginRequest, LoginResponse, TokenVerifyResponse, TokenData
from app.users.models import User as UserModel
from app.users.crud import UserCRUD

router = APIRouter(prefix="/users", tags=["Users"])

get_db = database.get_db
user_crud = UserCRUD()

#create user
@router.post("/", response_model=UserSchema)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    try:
        return user_crud.create(db, user)
    except Exception as e:
        error_msg = str(e)
        if "UNIQUE constraint failed: users.email" in error_msg:
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        elif "UNIQUE constraint failed: users.username" in error_msg:
            raise HTTPException(status_code=400, detail="A user with this username already exists")
        else:
            print(f"Unexpected error creating user: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Failed to create user: {error_msg}")

# -------------------
# GET by user_id
# -------------------
@router.get("/by-id/{user_id}", response_model=UserSchema)
def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = user_crud.get_by_userid(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# -------------------
# GET by email
# -------------------
@router.get("/by-email/{email}", response_model=UserSchema)
def get_user_by_email(email: str, db: Session = Depends(get_db)):
    user = user_crud.get_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# -------------------
# GET by username
# -------------------
@router.get("/by-username/{username}", response_model=UserSchema)
def get_user_by_username(username: str, db: Session = Depends(get_db)):
    user = user_crud.get_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# -------------------
# GET by first + last name
# -------------------
@router.get("/by-name/", response_model=list[UserSchema])
def get_user_by_name(first_name: str, last_name: str, db: Session = Depends(get_db)):
    users = user_crud.get_by_name(db, first_name, last_name)
    if not users:
        raise HTTPException(status_code=404, detail="No users found")
    return users

# -------------------
# GET all
# -------------------
@router.get("/", response_model=list[UserSchema])
def list_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return user_crud.get_all(db, skip=skip, limit=limit)

@router.put("/{user_id}", response_model=UserSchema)
def update_user(user_id: int, user: UserUpdate, db: Session = Depends(get_db)):
    db_user = user_crud.update(db, user_id, user)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    success = user_crud.delete(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

# -------------------
# AUTHENTICATION
# -------------------
@router.post("/login", response_model=LoginResponse)
def login_user(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate a user with username/email and password"""
    user = user_crud.authenticate_user(db, login_data.username, login_data.password)
    
    if not user:
        return LoginResponse(
            success=False,
            message="Invalid username/email or password"
        )
    
    if not user.is_active:
        return LoginResponse(
            success=False,
            message="Account is deactivated"
        )
    
    # Create JWT token
    token_data = {
        "user_id": user.id,
        "username": user.username,
        "email": user.email
    }
    access_token = create_access_token(token_data)
    
    return LoginResponse(
        success=True,
        user=user,
        token=access_token,
        message="Login successful"
    )

@router.post("/verify", response_model=TokenVerifyResponse)
def verify_token_endpoint(current_user: UserModel = Depends(get_current_user)):
    """Verify the current JWT token and return user info"""
    return TokenVerifyResponse(
        valid=True,
        user=current_user,
        token_data=TokenData(
            user_id=current_user.id,
            username=current_user.username
        )
    )

@router.post("/verify-password")
def verify_password(user_id: int, password: str, db: Session = Depends(get_db)):
    """Verify a password for a specific user"""
    user = user_crud.get_by_userid(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_valid = user_crud.verify_password(password, user.password_hash)
    return {"valid": is_valid}
