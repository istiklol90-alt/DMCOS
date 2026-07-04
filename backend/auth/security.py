# DEPRECATED (TASK-003): password hashing has been consolidated onto the
# passlib-based implementation in app/engines/authentication/service.py
# (get_password_hash/verify_password). Nothing imports this module anymore
# as of TASK-003 -- api/routes.py was the only caller and now uses the
# passlib version instead. Left in place, not deleted: existing user rows
# hashed by this raw-bcrypt function remain in the database, and passlib's
# CryptContext(schemes=["bcrypt"]) has been empirically confirmed compatible
# with hashes this function produced (bcrypt is the same underlying
# algorithm/format either way), so no data migration is required. Do not
# wire anything new to this module -- use the authentication engine's
# service.py instead.
import bcrypt


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")

    hashed = bcrypt.hashpw(
        password_bytes,
        bcrypt.gensalt()
    )

    return hashed.decode("utf-8")


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )