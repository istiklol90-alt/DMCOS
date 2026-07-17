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
# ContractExclusiveDiscount
# ---------------------------------------------------------------------------

def get_contract_exclusive_discount(db: Session, contract_id: int) -> ContractExclusiveDiscount | None:
    return repository.get_contract_exclusive_discount(db, contract_id)


def set_contract_exclusive_discount(
    db: Session, contract_id: int, discount_percent: float, created_by: int
) -> ContractExclusiveDiscount:
    if discount_percent <= 0 or discount_percent >= 100:
        raise ValueError("discount_percent must be between 0 and 100 (exclusive)")
    existing = repository.get_contract_exclusive_discount(db, contract_id)
    if existing is not None:
        return repository.update_contract_exclusive_discount(db, existing, discount_percent)
    return repository.create_contract_exclusive_discount(
        db, contract_id=contract_id, discount_percent=discount_percent, created_by=created_by
    )


def clear_contract_exclusive_discount(db: Session, contract_id: int) -> None:
    existing = repository.get_contract_exclusive_discount(db, contract_id)
    if existing is None:
        raise ValueError(f"Contract {contract_id} has no exclusive discount configured")
    repository.delete_contract_exclusive_discount(db, existing)


# ---------------------------------------------------------------------------
# Core pricing calculation -- see docs/interface-contracts/pricing-booking.md
# ---------------------------------------------------------------------------

def apply_agent_pricing(db: Session, agent_id: int, contract_id: int, room_net_total: float, nights: int) -> dict:
    """
    Computes the agent-facing room price from Contract Engine's already-
    resolved net total (which already includes any tactical SpecialOffer/
    Promotion discount -- untouched here). Does NOT validate agent_id or
    contract_id exist -- trusts the caller (Booking Engine's create_booking
    already calls _require_agent and has a real contract.id by this point).

    Discount only applies when BOTH hold: agent_id is in ExclusiveAgent,
    AND contract_id has a ContractExclusiveDiscount row. Order: discount
    the net total first, then add the flat global per-night markup on top
    of the (possibly discounted) net -- owner-confirmed calculation order.
    """
    settings = get_pricing_settings(db)
    excl = is_exclusive(db, agent_id)
    contract_discount = repository.get_contract_exclusive_discount(db, contract_id)

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
