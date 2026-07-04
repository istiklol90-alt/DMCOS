# RETIRED — DO NOT USE, kept only for history.
# This was already dead code before TASK-003: nothing ever imported it.
# auth/auth.py defined its own separate inline LoginRequest instead, and
# that inline version (now migrated to app/engines/authentication/schemas.py)
# is the canonical one. LoginResponse below was never used as a response_model
# anywhere either.

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    role: str | None = None
    access_token: str | None = None