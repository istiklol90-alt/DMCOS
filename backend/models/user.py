from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from models.base import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="agent")
    # The agent's travel agency/company name -- never existed on User
    # before, only on AgentRegistration (the original application),
    # never copied onto the approved account. Set at approval time
    # (api/routes.py's approve_registration); backfilled once for
    # already-approved agents by matching email against
    # AgentRegistration.company_name. NULL for admin accounts and any
    # agent account created before this field existed and not yet
    # backfilled.
    company_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_first_login = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # ⬇️ НОВЫЕ ПОЛЯ ДЛЯ УПРАВЛЕНИЯ СТАТУСОМ
    status = Column(String, default="active")  # active, suspended, blocked
    status_reason = Column(Text, nullable=True)  # Причина блокировки
    status_updated_at = Column(DateTime, nullable=True)
    updated_by = Column(Integer, nullable=True)  # Кто изменил статус