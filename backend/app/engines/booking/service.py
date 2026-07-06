"""
Business/orchestration layer for the Booking Engine.

Same layering as Hotel/Contract Engine (08_Coding_Standards.md: "Business
logic inside Services", "Database access through Repository Layer"):
this module calls validators.py before writing anything, and is the only
place that talks to Hotel Engine and Contract Engine directly — via
app.engines.hotel.service and app.engines.contract.service — per
docs/interface-contracts/contract-hotel-booking.md. repository.py and
models.py never import anything from either Engine.

agent_id is validated against models.user.User directly (a plain query,
not a cross-engine service call) since Users isn't wrapped behind an
Engine boundary the way Hotel/Contract are.

create_booking performs the full reserve-at-creation flow in one call:
validate hotel/room/agent exist, resolve the hotel's active contract,
check_allotment, get_room_price, reserve_allotment, then insert the
Booking row. reserve_allotment (a Contract Engine write) happens before
the Booking row is inserted (a Booking Engine write); if that insert
fails, the except clause around it calls release_allotment as a
best-effort compensating action before re-raising (Decision 012 in
11_Decisions.md). This is not a true distributed transaction — if
release_allotment itself also fails during that compensation, the
reservation stays orphaned. A real fix needs actual DB-level transaction
coordination across Hotel/Contract/Booking, which this project doesn't
have.

Booking.status's column default ("Draft") is effectively unreachable via
create_booking: this schema requires contract_id/rate_id/pricing to be
resolved before insert (all NOT NULL), and resolving them already means
check_allotment + reserve_allotment have run — so by the time a row can
be inserted, it's already a live, inventory-holding request, not an
inert draft. create_booking explicitly sets status="Pending", matching
02_Logic_Rules.md #46's workflow where "Agent submits booking request"
and "Booking is created" are the same step, not two.
"""

from datetime import date as date_type
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.engines.booking import repository
from app.engines.booking.models import Booking, Guest
from app.engines.booking.schemas import (
    BookingCreate,
    BookingUpdate,
    BookingCancelRequest,
    GuestCreate,
)
from app.engines.booking.validators import (
    validate_booking_status,
    validate_status_transition,
    validate_stay_dates,
    validate_nights_consistency,
    validate_occupancy,
)

# Per docs/interface-contracts/contract-hotel-booking.md — the two other
# Engines Booking Engine is allowed to reach into directly.
from app.engines.hotel import service as hotel_service
from app.engines.contract import service as contract_service

from models.user import User


# ---------------------------------------------------------------------------
# Internal existence guards
# ---------------------------------------------------------------------------


def _require_booking(db: Session, booking_id: int) -> Booking:
    booking = repository.get_booking(db, booking_id)
    if booking is None:
        raise ValueError(f"Booking {booking_id} not found")
    return booking


def _require_guest(db: Session, guest_id: int) -> Guest:
    guest = repository.get_guest(db, guest_id)
    if guest is None:
        raise ValueError(f"Guest {guest_id} not found")
    return guest


def _require_agent(db: Session, agent_id: int) -> User:
    """Validate agent_id against models.user.User directly — Users isn't wrapped behind an Engine boundary, so this is a plain query, not a cross-engine service call."""
    agent = db.query(User).filter(User.id == agent_id).first()
    if agent is None:
        raise ValueError(f"Agent (user) {agent_id} not found")
    return agent


def _generate_booking_number() -> str:
    """No documented format exists for booking_number anywhere in the docs — this is our own scheme, not sourced from 03_Domain_Model.md or 02_Logic_Rules.md."""
    return f"BK-{uuid.uuid4().hex[:12].upper()}"


# ---------------------------------------------------------------------------
# Cancellation fee resolution
# ---------------------------------------------------------------------------


def _resolve_cancellation_fee(policies: list, booking: Booking) -> Optional[float]:
    """
    Given the cancellation policy tiers applicable to this booking's
    arrival_date (from contract_service.get_cancellation_policy), pick the
    single tier that applies right now and compute the fee.

    Interpretation (not explicitly spelled out in the docs — derived from
    the example in get_cancellation_policy's own docstring, "30 days=10%,
    14 days=50%, 7 days=100%"): each tier means "if cancelling with FEWER
    than days_before_arrival days' notice, this penalty applies." Among
    tiers where the actual notice is less than the tier's threshold, the
    one with the SMALLEST days_before_arrival is the tightest/strictest
    applicable rule (closest to arrival = highest penalty) and wins. If no
    tier's threshold is breached (plenty of notice given), there's no fee.
    """
    today = date_type.today()
    notice_days = (booking.arrival_date - today).days
    applicable = [p for p in policies if notice_days < p.days_before_arrival]
    if not applicable:
        return None
    tier = min(applicable, key=lambda p: p.days_before_arrival)
    if tier.penalty_type == "percentage":
        return booking.total_amount * (tier.penalty_value / 100)
    return tier.penalty_value


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


def create_booking(db: Session, data: BookingCreate) -> Booking:
    """
    Create a new booking: validates the hotel/room type/agent exist,
    resolves the hotel's currently-active contract (02_Logic_Rules.md #45:
    "Booking cannot exist without an active contract"), confirms
    inventory via check_allotment, prices the stay via get_room_price,
    reserves the inventory via reserve_allotment, then inserts the row
    with status="Pending" (see this module's docstring for why not
    "Draft"). Raises ValueError at whichever step fails first — no
    inventory is reserved if any earlier validation fails.
    """
    hotel_service.get_hotel(db, data.hotel_id)
    hotel_service.get_room_type(db, data.room_type_id)
    _require_agent(db, data.agent_id)
    validate_stay_dates(data.arrival_date, data.departure_date)
    validate_occupancy(data.adults, data.children, data.infants)

    contract = contract_service.get_active_contract(db, data.hotel_id)
    if contract is None:
        raise ValueError(f"Hotel {data.hotel_id} has no currently-active contract")

    available = contract_service.check_allotment(
        db, contract.id, data.room_type_id, data.arrival_date, data.departure_date
    )
    if not available:
        raise ValueError(
            f"Room type {data.room_type_id} is not available for "
            f"{data.arrival_date} to {data.departure_date}"
        )

    price = contract_service.get_room_price(
        db,
        contract.id,
        data.room_type_id,
        data.arrival_date,
        data.departure_date,
        data.meal_plan,
        data.adults,
        data.children,
        data.infants,
    )

    contract_service.reserve_allotment(
        db, contract.id, data.room_type_id, data.arrival_date, data.departure_date
    )

    nights = (data.departure_date - data.arrival_date).days
    validate_nights_consistency(nights, data.arrival_date, data.departure_date)

    # Compensating action (Decision 012): reserve_allotment already
    # succeeded above. If the insert below fails for any reason, release
    # the reservation we just took rather than leaving it orphaned with no
    # booking to match. This is a best-effort compensation, not a true
    # transaction — if release_allotment itself also fails here, the
    # orphaned reservation still isn't fully closed. A real fix needs
    # actual DB-level transaction coordination across Hotel/Contract/
    # Booking, which this project doesn't have.
    try:
        booking = repository.create_booking(
            db,
            booking_number=_generate_booking_number(),
            agent_id=data.agent_id,
            hotel_id=data.hotel_id,
            contract_id=contract.id,
            rate_id=price["rate_id"],
            room_type_id=data.room_type_id,
            meal_plan_id=price["meal_plan_id"],
            market_id=data.market_id,
            arrival_date=data.arrival_date,
            departure_date=data.departure_date,
            nights=nights,
            adults=data.adults,
            children=data.children,
            infants=data.infants,
            status="Pending",
            currency=price["currency"],
            total_amount=price["final_total"],
            special_requests=data.special_requests,
            arrival_flight_number=data.arrival_flight_number,
            departure_flight_number=data.departure_flight_number,
            created_by=data.created_by,
        )
    except Exception:
        contract_service.release_allotment(
            db, contract.id, data.room_type_id, data.arrival_date, data.departure_date
        )
        raise

    return booking


def get_booking(db: Session, booking_id: int) -> Booking:
    """Fetch one booking by id, or raise ValueError if it doesn't exist."""
    return _require_booking(db, booking_id)


def get_booking_by_number(db: Session, booking_number: str) -> Booking:
    """Fetch one booking by its unique booking_number, or raise ValueError if it doesn't exist."""
    booking = repository.get_booking_by_number(db, booking_number)
    if booking is None:
        raise ValueError(f"Booking '{booking_number}' not found")
    return booking


def list_bookings(db: Session, skip: int = 0, limit: int = 100) -> list[Booking]:
    """Return a page of bookings across all agents/hotels."""
    return repository.list_bookings(db, skip=skip, limit=limit)


def list_bookings_by_agent(db: Session, agent_id: int) -> list[Booking]:
    """Return every booking made by one agent."""
    return repository.list_bookings_by_agent(db, agent_id)


def list_bookings_by_hotel(db: Session, hotel_id: int) -> list[Booking]:
    """Return every booking for one hotel."""
    return repository.list_bookings_by_hotel(db, hotel_id)


def update_booking(db: Session, booking_id: int, data: BookingUpdate) -> Booking:
    """
    Update a booking's editable fields (special_requests, flight numbers)
    and/or status from a single BookingUpdate payload. status is split
    out and routed through update_booking_status, matching Hotel/Contract
    Engine's pattern. Note: BookingUpdate.status cannot be "Cancelled" at
    the type level — use cancel_booking for that.
    """
    booking = _require_booking(db, booking_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if update_data:
        booking = repository.update_booking(db, booking, **update_data)
    if new_status is not None:
        booking = update_booking_status(db, booking_id, new_status)

    return booking


def update_booking_status(db: Session, booking_id: int, status: str) -> Booking:
    """
    Validate and apply a booking status change on its own. Enforces
    validate_status_transition (Cancelled/Rejected are terminal). If the
    new status is "Rejected", releases the reserved allotment first —
    same as cancel_booking's release, since a hotel-rejected booking also
    gives back the room it was holding.
    """
    booking = _require_booking(db, booking_id)
    validate_booking_status(status)
    validate_status_transition(booking.status, status)

    if status == "Rejected":
        contract_service.release_allotment(
            db, booking.contract_id, booking.room_type_id, booking.arrival_date, booking.departure_date
        )

    return repository.update_booking_status(db, booking, status)


def cancel_booking(db: Session, booking_id: int, data: BookingCancelRequest) -> Booking:
    """
    Cancel a booking: computes the cancellation fee from Contract Engine's
    get_cancellation_policy (see _resolve_cancellation_fee for the
    tier-selection logic), releases the reserved allotment, then records
    the cancellation (status, reason, timestamp, fee) atomically via
    repository.cancel_booking.
    """
    booking = _require_booking(db, booking_id)
    validate_status_transition(booking.status, "Cancelled")

    policies = contract_service.get_cancellation_policy(db, booking.contract_id, booking.arrival_date)
    cancellation_fee = _resolve_cancellation_fee(policies, booking)

    contract_service.release_allotment(
        db, booking.contract_id, booking.room_type_id, booking.arrival_date, booking.departure_date
    )

    return repository.cancel_booking(db, booking, data.reason, cancellation_fee)


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


def create_guest(db: Session, data: GuestCreate) -> Guest:
    """Add a guest to a booking. Raises ValueError if the booking doesn't exist."""
    _require_booking(db, data.booking_id)
    return repository.create_guest(db, **data.model_dump())


def get_guest(db: Session, guest_id: int) -> Guest:
    """Fetch one guest by id, or raise ValueError if it doesn't exist."""
    return _require_guest(db, guest_id)


def list_guests(db: Session, booking_id: int) -> list[Guest]:
    """Return every guest attached to one booking."""
    return repository.list_guests(db, booking_id)


def update_guest(db: Session, guest_id: int, **fields) -> Guest:
    """Update an existing guest's fields."""
    guest = _require_guest(db, guest_id)
    return repository.update_guest(db, guest, **fields)
