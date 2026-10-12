from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
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
    ContractExclusiveDiscountCreate,
    ContractExclusiveDiscountUpdate,
    AgentPriceResponse,
    NightlyPriceResponse,
    DateScanResultResponse,
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
def get_settings(
    currency: str = "USD", db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Decision 193: one markup per currency. Defaults to USD, so a caller
    that predates multi-currency behaves exactly as before."""
    _require_admin(current_user)
    return service.get_pricing_settings(db, currency)


@router.get("/settings/all", response_model=list[PricingSettingsResponse])
def list_settings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Every configured currency's markup, for the admin screen. MUST stay
    declared before nothing in particular -- /settings/all does not collide
    with any parametrized route here, but it is grouped with its sibling
    deliberately."""
    _require_admin(current_user)
    return service.list_pricing_settings(db)


@router.put("/settings", response_model=PricingSettingsResponse)
def update_settings(
    data: PricingSettingsUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return _run(lambda: service.update_pricing_settings(
        db, data.standard_markup_amount_per_night,
        updated_by=current_user.id, currency=data.currency,
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
# Per-contract exclusive discount (Decision 071: list-based, one contract
# can have multiple rows at different room-type/meal-plan/date specificity)
# ---------------------------------------------------------------------------

@router.get("/contracts/{contract_id}/exclusive-discounts", response_model=list[ContractExclusiveDiscountResponse])
def get_contract_discounts(contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_contract_exclusive_discounts(db, contract_id)


@router.post(
    "/contracts/{contract_id}/exclusive-discounts",
    response_model=ContractExclusiveDiscountResponse,
    status_code=201,
)
def create_contract_discount(
    contract_id: int,
    data: ContractExclusiveDiscountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.create_contract_exclusive_discount(
        db, contract_id, data.discount_percent, created_by=current_user.id,
        room_type_id=data.room_type_id, meal_plan_id=data.meal_plan_id,
        start_date=data.start_date, end_date=data.end_date,
    ))


@router.put("/exclusive-discounts/{discount_id}", response_model=ContractExclusiveDiscountResponse)
def update_contract_discount(
    discount_id: int,
    data: ContractExclusiveDiscountUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.update_contract_exclusive_discount(
        db, discount_id, data.discount_percent,
        room_type_id=data.room_type_id, meal_plan_id=data.meal_plan_id,
        start_date=data.start_date, end_date=data.end_date,
    ))


@router.delete("/exclusive-discounts/{discount_id}", status_code=204)
def delete_contract_discount(discount_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    _run(lambda: service.delete_contract_exclusive_discount(db, discount_id))


# ---------------------------------------------------------------------------
# Agent-facing price preview (Decision 070, extended by 071)
# ---------------------------------------------------------------------------

@router.get("/agent-price", response_model=AgentPriceResponse)
def get_agent_price(
    agent_id: int,
    contract_id: int,
    room_net_total: float,
    nights: int,
    room_type_id: int,
    meal_plan_id: int,
    check_in: date,
    check_out: date,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Thin wrapper around apply_agent_pricing -- no admin gating, unlike
    every other endpoint in this router, since agents call this directly
    from HotelSearch.tsx's search results (same trust level create_booking
    already extends to a client-supplied agent_id). Exists so the search
    preview and the real booking total can never diverge: this is the
    exact same function create_booking calls server-side, not a
    reimplementation.
    """
    return _run(lambda: service.apply_agent_pricing(
        db, agent_id, contract_id, room_net_total, nights, room_type_id, meal_plan_id, check_in, check_out
    ))


@router.get("/agent-price/nightly", response_model=list[NightlyPriceResponse])
def get_agent_price_nightly(
    agent_id: int,
    contract_id: int,
    room_net_total: float,
    nights: int,
    room_type_id: int,
    meal_plan_id: int,
    check_in: date,
    check_out: date,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 074: on-demand per-night breakdown, separate from
    /agent-price (which stays lean for the default search response) --
    only called when an agent expands "Показать цены по ночам" for a
    specific meal-plan option. Thin wrapper around
    build_nightly_breakdown, the same per-night computation
    apply_agent_pricing itself sums, so this can never disagree with the
    aggregate total already shown.
    """
    return _run(lambda: service.build_nightly_breakdown(
        db, agent_id, contract_id, room_net_total, nights, room_type_id, meal_plan_id, check_in, check_out
    ))


# ---------------------------------------------------------------------------
# Flexible-date scan (Decision 149)
# ---------------------------------------------------------------------------

@router.get("/date-scan", response_model=list[DateScanResultResponse])
def get_date_scan(
    agent_id: int,
    nights: int,
    adults: int,
    hotel_ids: list[int] = Query(...),
    check_ins: list[date] = Query(...),
    children: int = 0,
    infants: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 149: powers HotelSearch.tsx's "Flexible Dates" mode. Not admin
    gated, same reasoning as /agent-price directly above -- agents call this
    themselves from the search screen.

    Takes an explicit list of candidate check-in dates (repeated query
    params) rather than a mode + window, so the frontend can send them in
    small chunks and fill its price strip in progressively; the whole scan
    is real pricing work (~0.3-0.5s per hotel per date), not a lookup.
    Requests above service.MAX_SCAN_UNITS hotel-date pairs are rejected
    with a 400 rather than silently truncated.
    """
    return _run(lambda: service.scan_dates(
        db, agent_id, hotel_ids, check_ins, nights, adults, children, infants
    ))
