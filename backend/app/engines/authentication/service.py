from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# Consolidated on passlib's bcrypt scheme as the single hashing implementation
# (TASK-003 final step). auth/security.py's separate raw-bcrypt hash_password()
# is now deprecated but intentionally left in place, unused, since passlib's
# bcrypt scheme is confirmed compatible with hashes it produced (bcrypt is the
# same underlying algorithm/format either way) -- see verification notes in
# the TASK-003 commit.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
