from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.pricing import service
from app.engines.pricing.repository import get_db
from app.engines.pricing.schemas import (
    PricingSettingsResponse,
    PricingSettingsUpdate,
    ExclusiveAgentResponse,
    ExclusiveAgentCreate,
    AgentSummary,
    ContractExclusiveDiscountResponse,
    ContractExclusiveDiscountUpsert,
)

router = APIRouter(prefix="/pricing-engine", tags=["Pricing Engine"])

# See Decision 006 (11_Decisions.md): duplicates JWT-decode logic locally
# rather than importing a shared dependency, same known technical debt as
# every other Engine's api.py -- now the 6th Engine repeating it.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def _require_admin(current_user) -> None:
    """Every endpoint in this router is Admin Panel-only -- there is no
    agent-facing surface for pricing configuration. Same role-check
    pattern as Booking Engine's _require_owner_or_admin."""
    role = (current_user.role or "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _run(operation):
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Global settings
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=PricingSettingsResponse)
def get_settings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.get_pricing_settings(db)


@router.put("/settings", response_model=PricingSettingsResponse)
def update_settings(
    data: PricingSettingsUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return _run(lambda: service.update_pricing_settings(
        db, data.standard_markup_amount_per_night, updated_by=current_user.id
    ))


# ---------------------------------------------------------------------------
# Agent categories
# ---------------------------------------------------------------------------

@router.get("/agents/standard", response_model=list[AgentSummary])
def get_standard_agents(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_standard_agents(db)


@router.get("/agents/exclusive", response_model=list[ExclusiveAgentResponse])
def get_exclusive_agents(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_exclusive_agents(db)


@router.post("/agents/exclusive", response_model=ExclusiveAgentResponse, status_code=201)
def add_exclusive_agent(
    data: ExclusiveAgentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    row = _run(lambda: service.add_exclusive_agent(db, data.user_id, assigned_by=current_user.id))
    return next(a for a in service.list_exclusive_agents(db) if a["user_id"] == row.user_id)


@router.delete("/agents/exclusive/{user_id}", status_code=204)
def remove_exclusive_agent(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    _run(lambda: service.remove_exclusive_agent(db, user_id))


# ---------------------------------------------------------------------------
# Per-contract exclusive discount
# ---------------------------------------------------------------------------

@router.get("/contracts/{contract_id}/exclusive-discount", response_model=ContractExclusiveDiscountResponse | None)
def get_contract_discount(contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.get_contract_exclusive_discount(db, contract_id)


@router.put("/contracts/{contract_id}/exclusive-discount", response_model=ContractExclusiveDiscountResponse)
def set_contract_discount(
    contract_id: int,
    data: ContractExclusiveDiscountUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.set_contract_exclusive_discount(
        db, contract_id, data.discount_percent, created_by=current_user.id
    ))


@router.delete("/contracts/{contract_id}/exclusive-discount", status_code=204)
def clear_contract_discount(contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    _run(lambda: service.clear_contract_exclusive_discount(db, contract_id))
