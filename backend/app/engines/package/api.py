"""Package Engine API (TASK-004) under /package-engine.

Agent endpoints act on the caller only (agent id from the JWT) and never
return our cost; admin endpoints are admin-only. Every route is covered by
backend/security_audit.py.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_active_user_by_email
from app.engines.package import repository, service
from app.engines.package.repository import get_db
from app.engines.package.schemas import (
    AddOnAgentResponse,
    AddOnCreate,
    AddOnStaffResponse,
    AddOnUpdate,
    AgentSettingsResponse,
    AgentSettingsUpdate,
    BookPackageRequest,
    BookPackageResponse,
    BookingPackageResponse,
    CancellationRuleCreate,
    CancellationRuleResponse,
    CancellationRuleUpdate,
    CommissionTierCreate,
    CommissionTierResponse,
    CommissionTierUpdate,
    DefaultCommission,
    MyPackageSettings,
    PriceChangeResponse,
    QuoteRequest,
    QuoteResponse,
)
from models.user import User

router = APIRouter(prefix="/package-engine", tags=["Package Engine"])

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


def _is_admin(current_user) -> bool:
    return (current_user.role or "").strip().lower() == "admin"


def _admin_only(current_user=Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Agent side
# ---------------------------------------------------------------------------

@router.get("/me", response_model=MyPackageSettings)
def my_package_settings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    c = service.agent_commission(db, current_user.id)
    return MyPackageSettings(rate_percent=c["rate_percent"], one_way_flights_allowed=c["one_way_flights_allowed"])


@router.get("/add-ons/available", response_model=list[AddOnAgentResponse])
def available_add_ons(
    destination: str | None = None,
    kind: str | None = None,
    currency: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Active insurance / visa options for a destination -- price only. Pass
    the destination's currency to get only options a package there can use."""
    rows = repository.list_add_ons(db, kind=kind, active_only=True)
    return [
        r for r in rows
        if (not r.destination_country or not destination or r.destination_country == destination)
        and (not currency or r.currency == currency.upper())
    ]


@router.post("/quotes", response_model=QuoteResponse)
def create_quote(data: QuoteRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    admin = _is_admin(current_user)
    if data.agent_id is not None and not admin and data.agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to quote for another agent")
    agent_id = data.agent_id if (admin and data.agent_id) else current_user.id
    quote = _run(lambda: service.quote_ground_package(
        db, agent_id, data.hotel_id, data.room_type_id, data.meal_plan, data.check_in, data.check_out,
        data.adults, data.children, data.infants, data.transfer_type, data.add_on_ids,
    ))
    return service.staff_view(quote) if admin else service.agent_view(quote)


@router.get("/quotes/{quote_id}", response_model=QuoteResponse)
def get_quote(quote_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    admin = _is_admin(current_user)
    quote = _run(lambda: service.get_quote_for(db, quote_id, current_user.id, admin))
    return service.staff_view(quote) if admin else service.agent_view(quote)


@router.post("/quotes/{quote_id}/book", response_model=BookPackageResponse)
def book_quote(quote_id: int, data: BookPackageRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    booking = _run(lambda: service.book_package(db, quote_id, current_user.id, _is_admin(current_user), data.model_dump()))
    return BookPackageResponse(booking_id=booking.id, booking_number=booking.booking_number)


@router.get("/bookings/{booking_id}", response_model=BookingPackageResponse)
def get_booking_package(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.engines.booking import service as booking_service

    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    if not _is_admin(current_user) and booking.agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your booking")
    pkg = service.get_booking_package(db, booking_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="This booking is not a package")
    if not _is_admin(current_user):
        pkg["cost_total"] = None
        for line in pkg["lines"]:
            line["cost_total"] = None
    return pkg


# ---------------------------------------------------------------------------
# Admin: commission tiers and agents
# ---------------------------------------------------------------------------

@router.get("/tiers", response_model=list[CommissionTierResponse], dependencies=[Depends(_admin_only)])
def list_tiers(db: Session = Depends(get_db)):
    return repository.list_tiers(db)


@router.post("/tiers", response_model=CommissionTierResponse, dependencies=[Depends(_admin_only)])
def create_tier(data: CommissionTierCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.create_tier(db, data.name, data.rate_percent, data.is_default, current_user.id))


@router.put("/tiers/{tier_id}", response_model=CommissionTierResponse, dependencies=[Depends(_admin_only)])
def update_tier(tier_id: int, data: CommissionTierUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.update_tier(db, tier_id, data.model_dump(exclude_unset=True), current_user.id))


def _agent_row(db: Session, user: User) -> AgentSettingsResponse:
    c = service.agent_commission(db, user.id)
    settings = repository.get_agent_settings(db, user.id)
    return AgentSettingsResponse(
        user_id=user.id, name=user.name, email=user.email, tier_id=c["tier_id"], tier_name=c["tier_name"],
        rate_percent=c["rate_percent"], one_way_flights_allowed=c["one_way_flights_allowed"],
        own_rate=bool(settings and settings.tier_id),
    )


@router.get("/commission", response_model=DefaultCommission, dependencies=[Depends(_admin_only)])
def get_default_commission(db: Session = Depends(get_db)):
    return DefaultCommission(rate_percent=service.get_default_rate(db))


@router.put("/commission", response_model=DefaultCommission, dependencies=[Depends(_admin_only)])
def set_default_commission(data: DefaultCommission, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _run(lambda: service.set_default_rate(db, data.rate_percent, current_user.id))
    return DefaultCommission(rate_percent=service.get_default_rate(db))


@router.get("/agents", response_model=list[AgentSettingsResponse], dependencies=[Depends(_admin_only)])
def list_agent_exceptions(db: Session = Depends(get_db)):
    """Only agents with settings of their own (a different % or one-way
    flights) -- with thousands of agents, everyone else simply follows the
    rate for all agents and is found through /agents/search."""
    ids = [r.user_id for r in repository.list_agent_settings(db)]
    users = db.query(User).filter(User.id.in_(ids)).order_by(User.name).all() if ids else []
    return [_agent_row(db, u) for u in users]


@router.get("/agents/search", response_model=list[AgentSettingsResponse], dependencies=[Depends(_admin_only)])
def search_agents(q: str = "", db: Session = Depends(get_db)):
    term = q.strip()
    if len(term) < 2:
        return []
    like = f"%{term}%"
    users = (
        db.query(User)
        .filter(User.role.ilike("agent"), (User.name.ilike(like)) | (User.email.ilike(like)) | (User.company_name.ilike(like)))
        .order_by(User.name)
        .limit(10)
        .all()
    )
    return [_agent_row(db, u) for u in users]


@router.put("/agents/{user_id}", response_model=AgentSettingsResponse, dependencies=[Depends(_admin_only)])
def update_agent(user_id: int, data: AgentSettingsUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or (user.role or "").lower() != "agent":
        raise HTTPException(status_code=404, detail="Agent not found")
    fields = data.model_dump(exclude_unset=True)
    if "rate_percent" in fields:
        _run(lambda: service.set_agent_rate(db, user_id, fields.pop("rate_percent"), current_user.id))
    if fields:
        _run(lambda: service.set_agent_settings(db, user_id, fields, current_user.id))
    return _agent_row(db, user)


@router.delete("/agents/{user_id}", dependencies=[Depends(_admin_only)])
def reset_agent(user_id: int, db: Session = Depends(get_db)):
    """Back to the rate for all agents and no one-way flights."""
    service.reset_agent(db, user_id)
    return {"reset": user_id}


# ---------------------------------------------------------------------------
# Admin: add-ons (insurance, visa)
# ---------------------------------------------------------------------------

@router.get("/add-ons", response_model=list[AddOnStaffResponse], dependencies=[Depends(_admin_only)])
def list_add_ons(kind: str | None = None, db: Session = Depends(get_db)):
    return repository.list_add_ons(db, kind=kind)


@router.post("/add-ons", response_model=AddOnStaffResponse, dependencies=[Depends(_admin_only)])
def create_add_on(data: AddOnCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.create_add_on(db, data.model_dump(), current_user.id))


@router.put("/add-ons/{add_on_id}", response_model=AddOnStaffResponse, dependencies=[Depends(_admin_only)])
def update_add_on(add_on_id: int, data: AddOnUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.update_add_on(db, add_on_id, data.model_dump(exclude_unset=True), current_user.id))


@router.get("/add-ons/{add_on_id}/price-changes", response_model=list[PriceChangeResponse], dependencies=[Depends(_admin_only)])
def add_on_price_changes(add_on_id: int, db: Session = Depends(get_db)):
    return repository.list_price_changes(db, add_on_id)


# ---------------------------------------------------------------------------
# Admin: cancellation rules
# ---------------------------------------------------------------------------

@router.get("/cancellation-rules", response_model=list[CancellationRuleResponse], dependencies=[Depends(_admin_only)])
def list_cancellation_rules(db: Session = Depends(get_db)):
    return repository.list_cancellation_rules(db)


@router.post("/cancellation-rules", response_model=CancellationRuleResponse, dependencies=[Depends(_admin_only)])
def create_cancellation_rule(data: CancellationRuleCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.create_cancellation_rule(db, data.model_dump(), current_user.id))


@router.put("/cancellation-rules/{rule_id}", response_model=CancellationRuleResponse, dependencies=[Depends(_admin_only)])
def update_cancellation_rule(rule_id: int, data: CancellationRuleUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.update_cancellation_rule(db, rule_id, data.model_dump(exclude_unset=True), current_user.id))


@router.delete("/cancellation-rules/{rule_id}", dependencies=[Depends(_admin_only)])
def delete_cancellation_rule(rule_id: int, db: Session = Depends(get_db)):
    _run(lambda: service.delete_cancellation_rule(db, rule_id))
    return {"deleted": rule_id}
