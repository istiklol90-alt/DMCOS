from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "agent"

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    is_active: bool
    is_first_login: bool
    last_login: Optional[datetime]  # ← ВАЖНО!
    created_at: Optional[datetime]

    class Config:
        from_attributes = True