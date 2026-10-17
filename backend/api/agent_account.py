"""The signed-in agent's own account (Decision 215): read-only profile and
their own client markup, per destination.

Every endpoint acts on the caller only -- the user id always comes from the
JWT, never from the request -- so one agent can neither read nor change
another's data. The markup is display-only: nothing here touches pricing,
bookings or invoices.
"""

from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_active_user_by_email
from app.engines.hotel.models import Hotel
from database.db import SessionLocal
from models.agent import AgentRegistration
from models.agent_markup import AgentMarkup

router = APIRouter(prefix="/me", tags=["My account"])

MAX_PERCENT = 100.0

# Same local JWT decode every engine carries (Decision 006).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_active_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


class AccountResponse(BaseModel):
    name: str
    email: str
    role: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    preferred_currency: Optional[str] = None
    member_since: Optional[datetime] = None


class MarkupsResponse(BaseModel):
    # Percent applied where a destination has no row of its own (None = 0).
    default_percent: Optional[float] = None
    # Destination country -> percent.
    by_country: Dict[str, float] = {}
    # Destinations that exist in the hotel catalogue, for the settings form.
    countries: list[str] = []
    updated_at: Optional[datetime] = None


class MarkupsUpdate(BaseModel):
    default_percent: Optional[float] = Field(default=None, ge=0, le=MAX_PERCENT)
    by_country: Dict[str, float] = {}


def _catalogue_countries(db: Session) -> list[str]:
    rows = db.query(Hotel.country).filter(Hotel.country.isnot(None)).distinct().all()
    return sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()})


def _markups_response(db: Session, user_id: int) -> MarkupsResponse:
    rows = db.query(AgentMarkup).filter(AgentMarkup.user_id == user_id).all()
    default = next((r.percent for r in rows if r.country is None), None)
    by_country = {r.country: r.percent for r in rows if r.country is not None}
    updated = max((r.updated_at for r in rows), default=None)
    return MarkupsResponse(
        default_percent=default,
        by_country=by_country,
        countries=_catalogue_countries(db),
        updated_at=updated,
    )


@router.get("/account", response_model=AccountResponse)
def my_account(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Profile shown on the agent's account page: the user row plus the
    agency details from their approved registration (matched by e-mail).
    Read-only -- details are changed by the company, not by the agent."""
    reg = (
        db.query(AgentRegistration)
        .filter(AgentRegistration.email == current_user.email)
        .order_by(AgentRegistration.id.desc())
        .first()
    )
    return AccountResponse(
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
        company_name=(reg.company_name if reg else None) or current_user.company_name,
        contact_person=reg.contact_person if reg else None,
        phone=reg.phone if reg else None,
        whatsapp=reg.whatsapp if reg else None,
        country=reg.country if reg else None,
        city=reg.city if reg else None,
        preferred_currency=reg.preferred_currency if reg else None,
        member_since=current_user.created_at,
    )


@router.get("/markups", response_model=MarkupsResponse)
def my_markups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _markups_response(db, current_user.id)


@router.put("/markups", response_model=MarkupsResponse)
def save_my_markups(
    payload: MarkupsUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replaces the caller's markups as a whole: the default and one row
    per destination. A destination left out (or set to the default's
    value) has no row of its own and follows the default."""
    clean: Dict[str, float] = {}
    for country, pct in payload.by_country.items():
        name = (country or "").strip()
        if not name:
            continue
        if pct is None or pct < 0 or pct > MAX_PERCENT:
            raise HTTPException(status_code=422, detail=f"Markup for {name} must be between 0 and {MAX_PERCENT:g}%.")
        clean[name] = round(float(pct), 2)

    now = datetime.utcnow()
    db.query(AgentMarkup).filter(AgentMarkup.user_id == current_user.id).delete()
    if payload.default_percent is not None:
        db.add(AgentMarkup(user_id=current_user.id, country=None, percent=round(payload.default_percent, 2), updated_at=now))
    for name, pct in clean.items():
        db.add(AgentMarkup(user_id=current_user.id, country=name, percent=pct, updated_at=now))
    db.commit()
    return _markups_response(db, current_user.id)
