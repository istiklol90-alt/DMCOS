from datetime import date

from sqlalchemy.orm import Session

from app.engines.pricing import repository
from app.engines.pricing.models import PricingSettings, ExclusiveAgent, ContractExclusiveDiscount
from models.user import User

DEFAULT_MARKUP_AMOUNT_PER_NIGHT = 10.0


# ---------------------------------------------------------------------------
# PricingSettings
# ---------------------------------------------------------------------------

def get_pricing_settings(db: Session) -> PricingSettings:
    """Get-or-create the single id=1 settings row. Never raises for
    'settings missing' -- a fresh database gets sane defaults the
    first time anything asks."""
    settings = repository.get_pricing_settings(db)
    if settings is None:
        settings = repository.create_pricing_settings(
            db, standard_markup_amount_per_night=DEFAULT_MARKUP_AMOUNT_PER_NIGHT
        )
    return settings


def update_pricing_settings(db: Session, standard_markup_amount_per_night: float, updated_by: int) -> PricingSettings:
    if standard_markup_amount_per_night < 0:
        raise ValueError("standard_markup_amount_per_night cannot be negative")
    settings = get_pricing_settings(db)
    return repository.update_pricing_settings(
        db, settings,
        standard_markup_amount_per_night=standard_markup_amount_per_night,
        updated_by=updated_by,
    )


# ---------------------------------------------------------------------------
# ExclusiveAgent
# ---------------------------------------------------------------------------

def _require_agent_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")
    if (user.role or "").strip().lower() != "agent":
        raise ValueError(f"User {user_id} is not an agent (role={user.role})")
    return user


def is_exclusive(db: Session, user_id: int) -> bool:
    return repository.get_exclusive_agent(db, user_id) is not None


def list_standard_agents(db: Session) -> list[dict]:
    exclusive_ids = {row.user_id for row in repository.list_exclusive_agents(db)}
    agents = db.query(User).filter(User.role == "agent").all()
    return [
        {"user_id": a.id, "name": a.name, "email": a.email}
        for a in agents
        if a.id not in exclusive_ids
    ]


def list_exclusive_agents(db: Session) -> list[dict]:
    rows = repository.list_exclusive_agents(db)
    result = []
    for row in rows:
        user = db.query(User).filter(User.id == row.user_id).first()
        result.append({
            "id": row.id,
            "user_id": row.user_id,
            "name": user.name if user else "(unknown)",
            "email": user.email if user else "(unknown)",
            "assigned_by": row.assigned_by,
            "assigned_at": row.assigned_at,
        })
    return result


def add_exclusive_agent(db: Session, user_id: int, assigned_by: int) -> ExclusiveAgent:
    _require_agent_user(db, user_id)
    if repository.get_exclusive_agent(db, user_id) is not None:
        raise ValueError(f"User {user_id} is already an Exclusive agent")
    return repository.create_exclusive_agent(db, user_id=user_id, assigned_by=assigned_by)


def remove_exclusive_agent(db: Session, user_id: int) -> None:
    row = repository.get_exclusive_agent(db, user_id)
    if row is None:
        raise ValueError(f"User {user_id} is not an Exclusive agent")
    repository.delete_exclusive_agent(db, row)


# ---------------------------------------------------------------------------
# ContractExclusiveDiscount -- Decision 071
# ---------------------------------------------------------------------------

def list_contract_exclusive_discounts(db: Session, contract_id: int) -> list[ContractExclusiveDiscount]:
    return repository.list_contract_exclusive_discounts(db, contract_id)


def _validate_discount_fields(discount_percent: float, start_date, end_date) -> None:
    if discount_percent <= 0 or discount_percent >= 100:
        raise ValueError("discount_percent must be between 0 and 100 (exclusive)")
    if start_date is not None and end_date is not None and start_date > end_date:
        raise ValueError("start_date must not be after end_date")


def create_contract_exclusive_discount(
    db: Session,
    contract_id: int,
    discount_percent: float,
    created_by: int,
    room_type_id: int | None = None,
    meal_plan_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ContractExclusiveDiscount:
    _validate_discount_fields(discount_percent, start_date, end_date)
    return repository.create_contract_exclusive_discount(
        db,
        contract_id=contract_id,
        room_type_id=room_type_id,
        meal_plan_id=meal_plan_id,
        start_date=start_date,
        end_date=end_date,
        discount_percent=discount_percent,
        created_by=created_by,
    )


def update_contract_exclusive_discount(
    db: Session,
    discount_id: int,
    discount_percent: float,
    room_type_id: int | None = None,
    meal_plan_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ContractExclusiveDiscount:
    row = repository.get_contract_exclusive_discount_by_id(db, discount_id)
    if row is None:
        raise ValueError(f"Exclusive discount {discount_id} not found")
    _validate_discount_fields(discount_percent, start_date, end_date)
    return repository.update_contract_exclusive_discount(
        db, row,
        room_type_id=room_type_id,
        meal_plan_id=meal_plan_id,
        start_date=start_date,
        end_date=end_date,
        discount_percent=discount_percent,
    )


def delete_contract_exclusive_discount(db: Session, discount_id: int) -> None:
    row = repository.get_contract_exclusive_discount_by_id(db, discount_id)
    if row is None:
        raise ValueError(f"Exclusive discount {discount_id} not found")
    repository.delete_contract_exclusive_discount(db, row)


def find_contract_exclusive_discount(
    db: Session, contract_id: int, room_type_id: int, meal_plan_id: int, check_in: date
) -> ContractExclusiveDiscount | None:
    """
    Most-specific-match-wins selection among a contract's
    ContractExclusiveDiscount rows (Decision 071), mirroring Decisions
    051/053's tier-selection precedent. A row is a candidate only if its
    room_type_id/meal_plan_id are either NULL (wildcard) or match exactly,
    AND check_in falls within its start_date/end_date (NULL on either
    means unbounded on that side). Among candidates, the one matching the
    most of {room_type_id, meal_plan_id} wins; ties (a config edge case,
    not expected in practice) prefer whichever candidate has an explicit
    date window over an always-active one, since setting a window is more
    deliberate manager intent than the default.
    """
    candidates = []
    for row in repository.list_contract_exclusive_discounts(db, contract_id):
        if row.room_type_id is not None and row.room_type_id != room_type_id:
            continue
        if row.meal_plan_id is not None and row.meal_plan_id != meal_plan_id:
            continue
        if row.start_date is not None and row.start_date > check_in:
            continue
        if row.end_date is not None and row.end_date < check_in:
            continue
        candidates.append(row)

    if not candidates:
        return None

    def specificity(row: ContractExclusiveDiscount) -> tuple[int, bool]:
        matched_fields = (row.room_type_id is not None) + (row.meal_plan_id is not None)
        has_date_window = row.start_date is not None or row.end_date is not None
        return (matched_fields, has_date_window)

    candidates.sort(key=specificity, reverse=True)
    return candidates[0]


# ---------------------------------------------------------------------------
# Core pricing calculation -- see docs/interface-contracts/pricing-booking.md
# ---------------------------------------------------------------------------

def apply_agent_pricing(
    db: Session,
    agent_id: int,
    contract_id: int,
    room_net_total: float,
    nights: int,
    room_type_id: int,
    meal_plan_id: int,
    check_in: date,
) -> dict:
    """
    Computes the agent-facing room price from Contract Engine's already-
    resolved net total (which already includes any tactical SpecialOffer/
    Promotion discount -- untouched here). Does NOT validate agent_id or
    contract_id exist -- trusts the caller (Booking Engine's create_booking
    already calls _require_agent and has a real contract.id by this point).

    Discount only applies when BOTH hold: agent_id is in ExclusiveAgent,
    AND find_contract_exclusive_discount finds a matching row for this
    exact room_type_id/meal_plan_id/check_in (Decision 071). Order:
    discount the net total first, then add the flat global per-night
    markup on top of the (possibly discounted) net -- owner-confirmed
    calculation order.
    """
    settings = get_pricing_settings(db)
    excl = is_exclusive(db, agent_id)
    contract_discount = find_contract_exclusive_discount(db, contract_id, room_type_id, meal_plan_id, check_in)

    if excl and contract_discount is not None:
        pct = contract_discount.discount_percent
        discounted_room = room_net_total * (1 - pct / 100)
    else:
        pct = 0.0
        discounted_room = room_net_total

    exclusive_discount_amount = room_net_total - discounted_room
    markup_amount = settings.standard_markup_amount_per_night * nights
    agent_room_total = discounted_room + markup_amount

    return {
        "room_net_total": room_net_total,
        "is_exclusive": excl,
        "contract_discount_percent": pct,
        "exclusive_discount_amount": exclusive_discount_amount,
        "markup_amount_per_night": settings.standard_markup_amount_per_night,
        "markup_amount": markup_amount,
        "agent_room_total": agent_room_total,
    }
