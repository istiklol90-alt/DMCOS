"""Flight Engine API under /flight-engine -- staff screens (seat blocks and
prices). Admin-only: the agent-facing "With flight" search is composed by
Package Engine (it already knows the agent's commission and one-way
permission), which calls service.search_flights directly.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_active_user_by_email
from app.engines.flight import repository, service
from app.engines.flight.repository import get_db
from app.engines.flight.schemas import (
    BulkPriceRequest,
    DepartureUpdate,
    GridRow,
    LegCreate,
    LegResponse,
    LegUpdate,
    PriceChangeResponse,
    ScheduleRequest,
    ScheduleResponse,
)

router = APIRouter(prefix="/flight-engine", tags=["Flight Engine"])

# Same local JWT decode every engine carries (Decision 006).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


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


def _admin_only(current_user=Depends(get_current_user)):
    if (current_user.role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/destinations", dependencies=[Depends(_admin_only)])
def destinations(db: Session = Depends(get_db)):
    """Our destinations = the countries we have hotels in -- the only
    choices for a flight's package destination."""
    return service.destinations(db)


def _leg_out(db: Session, leg) -> dict:
    deps = repository.list_departures(db, leg_ids=[leg.id])
    out = {c.name: getattr(leg, c.name) for c in leg.__table__.columns}
    out["departures"] = len(deps)
    out["seats_sold"] = sum(d.seats_sold for d in deps)
    dates = sorted(d.date for d in deps)
    out["first_date"] = dates[0] if dates else None
    out["last_date"] = dates[-1] if dates else None
    return out


@router.get("/legs", response_model=list[LegResponse], dependencies=[Depends(_admin_only)])
def list_legs(db: Session = Depends(get_db)):
    return [_leg_out(db, l) for l in repository.list_legs(db)]


@router.post("/legs", response_model=LegResponse, dependencies=[Depends(_admin_only)])
def create_leg(data: LegCreate, db: Session = Depends(get_db), current_user=Depends(_admin_only)):
    return _leg_out(db, _run(lambda: service.create_leg(db, data.model_dump(), current_user.id)))


@router.put("/legs/{leg_id}", response_model=LegResponse, dependencies=[Depends(_admin_only)])
def update_leg(leg_id: int, data: LegUpdate, db: Session = Depends(get_db)):
    return _leg_out(db, _run(lambda: service.update_leg(db, leg_id, data.model_dump(exclude_unset=True))))


@router.post("/legs/{leg_id}/schedule", response_model=ScheduleResponse, dependencies=[Depends(_admin_only)])
def generate_schedule(leg_id: int, data: ScheduleRequest, db: Session = Depends(get_db), current_user=Depends(_admin_only)):
    return _run(lambda: service.generate_schedule(
        db, leg_id, data.date_from, data.date_to, data.weekdays, [c.model_dump() for c in data.cabins], current_user.id
    ))


@router.get("/departures", response_model=list[GridRow], dependencies=[Depends(_admin_only)])
def departures_grid(date_from: date, date_to: date, destination: str | None = None, db: Session = Depends(get_db)):
    return service.grid(db, date_from, date_to, destination)


@router.put("/departures/{departure_id}", response_model=GridRow, dependencies=[Depends(_admin_only)])
def update_departure(departure_id: int, data: DepartureUpdate, db: Session = Depends(get_db), current_user=Depends(_admin_only)):
    dep = _run(lambda: service.update_departure(db, departure_id, data.model_dump(exclude_unset=True), current_user.id))
    return next(r for r in service.grid(db, dep.date, dep.date) if r["departure_id"] == dep.id)


@router.post("/departures/bulk-price", dependencies=[Depends(_admin_only)])
def bulk_price(data: BulkPriceRequest, db: Session = Depends(get_db), current_user=Depends(_admin_only)):
    return {"updated": _run(lambda: service.bulk_update_prices(db, data.departure_ids, data.price, data.percent, data.reason, current_user.id))}


@router.get("/departures/{departure_id}/history", response_model=list[PriceChangeResponse], dependencies=[Depends(_admin_only)])
def departure_history(departure_id: int, db: Session = Depends(get_db)):
    return repository.list_price_changes(db, departure_id)


@router.get("/search", dependencies=[Depends(_admin_only)])
def search(destination: str, out_date: date, back_date: date | None = None, pax: int = 1, one_way: bool = False,
           db: Session = Depends(get_db)):
    """Staff check of what an agent's "With flight" search will find."""
    return service.search_flights(db, destination, out_date, back_date, pax, one_way)
