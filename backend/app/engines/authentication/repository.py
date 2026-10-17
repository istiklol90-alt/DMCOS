from datetime import datetime
from sqlalchemy.orm import Session

from database.db import SessionLocal
from models.user import User


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


BLOCKED_STATUSES = {"suspended", "blocked"}


def is_user_blocked(user: User) -> bool:
    """Security (2026-10-16): a deactivated or blocked account may neither
    sign in nor keep using a token it already holds."""
    return user.is_active is False or (user.status or "").strip().lower() in BLOCKED_STATUSES


def get_active_user_by_email(db: Session, email: str) -> User | None:
    """The user behind a token, or None when the account is missing or
    blocked -- every engine's get_current_user goes through this."""
    user = get_user_by_email(db, email)
    return None if user is None or is_user_blocked(user) else user


def update_last_login(db: Session, user: User, last_login: datetime) -> None:
    user.last_login = last_login
    db.commit()


def update_password(db: Session, user: User, hashed_password: str) -> None:
    user.password = hashed_password
    user.is_first_login = False
    db.commit()
