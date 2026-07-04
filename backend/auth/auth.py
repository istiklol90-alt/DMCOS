from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone

# TASK-003 migration: constants/config/schemas/repository/service now live in
# the authentication engine. backend/auth/ stays the mounted implementation
# (LEGACY status) until every piece has been migrated and main.py/
# api/routes.py import from the new location directly.
from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.schemas import LoginRequest, ChangePasswordRequest
from app.engines.authentication.repository import (
    get_db,
    get_user_by_email,
    update_last_login,
    update_password,
)
from app.engines.authentication.service import (
    create_access_token,
    verify_password,
    get_password_hash,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ============================================================
# СМЕНА ПАРОЛЯ
# ============================================================

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

        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password(data.old_password, user.password):
            raise HTTPException(status_code=400, detail="Invalid old password")

        if len(data.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

        update_password(db, user, get_password_hash(data.new_password))

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
    print(f"Login attempt: {data.email}")

    user = get_user_by_email(db, data.email)

    if not user:
        print(f"User not found: {data.email}")
        return {"success": False, "message": "Invalid email or password"}

    if not verify_password(data.password, user.password):
        print(f"Wrong password for: {data.email}")
        return {"success": False, "message": "Invalid email or password"}

    # ✅ UAE TIME (UTC+4)
    uae_tz = timezone(timedelta(hours=4))
    update_last_login(db, user, datetime.now(uae_tz))

    access_token = create_access_token(data={"sub": user.email, "role": user.role})

    print(f"Login successful: {data.email}")
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
