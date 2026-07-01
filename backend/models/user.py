from sqlalchemy import Column, Integer, String, Boolean, DateTime
from models.base import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="agent")
    is_active = Column(Boolean, default=True)
    is_first_login = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)  # ← ДОБАВЛЕНО!
    created_at = Column(DateTime, default=datetime.utcnow)