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


def update_last_login(db: Session, user: User, last_login: datetime) -> None:
    user.last_login = last_login
    db.commit()


def update_password(db: Session, user: User, hashed_password: str) -> None:
    user.password = hashed_password
    user.is_first_login = False
    db.commit()
