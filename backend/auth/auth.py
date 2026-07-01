from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import os
import secrets
from pydantic import BaseModel

from database.db import SessionLocal
from models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Модель для запроса
class LoginRequest(BaseModel):
    email: str
    password: str

# Настройки безопасности
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ============================================================
# СМЕНА ПАРОЛЯ
# ============================================================

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not verify_password(data.old_password, user.password):
            raise HTTPException(status_code=400, detail="Invalid old password")
        
        if len(data.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        
        user.password = get_password_hash(data.new_password)
        user.is_first_login = False
        db.commit()
        
        return {
            "success": True,
            "message": "Password changed successfully"
        }
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ЛОГИН (UAE TIME - UTC+4)
# ============================================================

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    print(f"🔐 Попытка входа: {data.email}")
    
    user = db.query(User).filter(User.email == data.email).first()
    
    if not user:
        print(f"❌ Пользователь не найден: {data.email}")
        return {"success": False, "message": "Invalid email or password"}
    
    if not verify_password(data.password, user.password):
        print(f"❌ Неверный пароль для: {data.email}")
        return {"success": False, "message": "Invalid email or password"}
    
    # ✅ UAE TIME (UTC+4)
    uae_tz = timezone(timedelta(hours=4))
    user.last_login = datetime.now(uae_tz)
    db.commit()
    
    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    
    print(f"✅ Вход успешен: {data.email}")
    return {
        "success": True,
        "message": "Login successful",
        "role": user.role,
        "access_token": access_token,
        "is_first_login": user.is_first_login,
        "last_login": user.last_login,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "last_login": user.last_login
        }
    }