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

from datetime import date as date_type, datetime
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.engines.booking import repository
from app.engines.booking.models import Booking, Guest, BookingCorrespondence
from app.engines.booking.schemas import (
    BookingCreate,
    BookingUpdate,
    BookingCancelRequest,
    BookingDateChangeRequest,
    GuestCreate,
)
from app.engines.booking.validators import (
    validate_booking_status,
    validate_status_transition,
    validate_stay_dates,
    validate_nights_consistency,
    validate_occupancy,
    TERMINAL_STATUSES,
)

# Per docs/interface-contracts/contract-hotel-booking.md — the two other
# Engines Booking Engine is allowed to reach into directly.
from app.engines.hotel import service as hotel_service
from app.engines.contract import service as contract_service
# Decision 069, per docs/interface-contracts/pricing-booking.md — Pricing
# Engine takes plain numbers (room_net_total, nights) already resolved via
# Contract Engine above; zero code coupling to Contract Engine's signatures.
from app.engines.pricing import service as pricing_service

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

    Decision 022: if the resolved contract has transfer_required=true,
    data.transfer_type must be provided or this raises ValueError before
    any allotment/pricing work happens. If a transfer_type is given
    (required or not), it's priced via get_transfer_price and stored in
    its own transfer_total column — never folded into total_amount, which
    stays room-only, so Finance Engine can itemize room vs. transfer
    revenue separately later.

    Decision 033: always prices get_mandatory_tax (e.g. Kandima's Green
    Tax) and stores it in its own mandatory_tax_total column, same
    separate-column precedent as transfer_total — resolves to 0 for every
    contract that has no mandatory_tax_per_person_per_night configured, so
    this is a no-op for every contract except one that's actually been
    given a tax rate.

    Decision 069: after get_room_price resolves Contract Engine's net room
    total, pricing_service.apply_agent_pricing applies the global per-night
    markup (and, for Exclusive-tier agents at a contract with a configured
    ContractExclusiveDiscount, that contract's room-rate discount first) to
    produce the actual total_amount stored below — total_amount is the
    agent-facing price, not Contract Engine's raw net. transfer_total and
    mandatory_tax_total are untouched by this step, per
    docs/interface-contracts/pricing-booking.md Rule 3.
    """
    hotel_service.get_hotel(db, data.hotel_id)
    hotel_service.get_room_type(db, data.room_type_id)
    _require_agent(db, data.agent_id)
    validate_stay_dates(data.arrival_date, data.departure_date)
    validate_occupancy(data.adults, data.children, data.infants)

    contract = contract_service.get_active_contract(db, data.hotel_id, data.arrival_date)
    if contract is None:
        raise ValueError(f"Hotel {data.hotel_id} has no currently-active contract")

    if contract.transfer_required and data.transfer_type is None:
        raise ValueError(
            f"Hotel {data.hotel_id}'s contract requires selecting a transfer option"
        )

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

    transfer_total = None
    if data.transfer_type is not None:
        transfer_price = contract_service.get_transfer_price(
            db,
            contract.id,
            data.transfer_type,
            data.arrival_date,
            data.departure_date,
            data.adults,
            data.children,
            data.infants,
        )
        transfer_total = transfer_price["total"]

    nights = (data.departure_date - data.arrival_date).days
    validate_nights_consistency(nights, data.arrival_date, data.departure_date)

    mandatory_tax_total = contract_service.get_mandatory_tax(
        db, contract.id, nights, data.adults, data.children
    )["total"]

    # Decision 069/071/072: room-only, per docs/interface-contracts/pricing-booking.md.
    agent_pricing = pricing_service.apply_agent_pricing(
        db, data.agent_id, contract.id, price["final_total"], nights,
        data.room_type_id, price["meal_plan_id"], data.arrival_date, data.departure_date,
    )

    # Decision 048: reuses get_room_price's own applied_special_offer_ids
    # (never re-derived) -- only recorded when exactly one offer applied;
    # zero or multiple both stay NULL rather than guessing.
    special_offer_ids = price.get("applied_special_offer_ids", [])
    applied_special_offer_id = special_offer_ids[0] if len(special_offer_ids) == 1 else None

    contract_service.reserve_allotment(
        db, contract.id, data.room_type_id, data.arrival_date, data.departure_date
    )

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
            applied_special_offer_id=applied_special_offer_id,
            arrival_date=data.arrival_date,
            departure_date=data.departure_date,
            nights=nights,
            adults=data.adults,
            children=data.children,
            infants=data.infants,
            status="Pending",
            currency=price["currency"],
            total_amount=agent_pricing["agent_room_total"],
            agent_markup_amount=agent_pricing["markup_amount"],
            agent_exclusive_discount_amount=agent_pricing["exclusive_discount_amount"],
            transfer_type=data.transfer_type,
            transfer_total=transfer_total,
            mandatory_tax_total=mandatory_tax_total,
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


def cancel_booking(db: Session, booking_id: int, data: BookingCancelRequest, cancelled_by: int) -> Booking:
    """
    Cancel a booking: computes the cancellation fee from Contract Engine's
    get_cancellation_policy (see _resolve_cancellation_fee for the
    tier-selection logic), releases the reserved allotment, then records
    the cancellation (status, reason, timestamp, fee, and per Decision
    086, who) atomically via repository.cancel_booking.
    """
    booking = _require_booking(db, booking_id)
    validate_status_transition(booking.status, "Cancelled")

    policies = contract_service.get_cancellation_policy(db, booking.contract_id, booking.arrival_date)
    cancellation_fee = _resolve_cancellation_fee(policies, booking)

    contract_service.release_allotment(
        db, booking.contract_id, booking.room_type_id, booking.arrival_date, booking.departure_date
    )

    return repository.cancel_booking(db, booking, data.reason, cancellation_fee, cancelled_by)


def claim_booking(db: Session, booking_id: int, claimed_by: int) -> Booking:
    """
    "Взято в работу" (Decision 045) -- marks a booking as being actively
    handled, independent of its business status. Restricted to
    status == "Pending": claiming only means something for a booking
    nobody has looked at yet, so any other status raises. Also raises if
    already claimed, rather than silently overwriting who claimed it --
    the caller should check claimed_by is None before offering this
    action (the frontend does), but this re-validates independently
    rather than trusting that check, same discipline as every other
    write in this file.

    claimed_by is a plain user id, not necessarily a human manager's --
    see models.py's Booking.claimed_by docstring on why this is
    deliberately generic enough for a future AI agent (Decision 029's
    Stage 4/5) to claim bookings the identical way.
    """
    booking = _require_booking(db, booking_id)
    if booking.status != "Pending":
        raise ValueError(f"Cannot claim booking {booking_id}: status is '{booking.status}', not 'Pending'")
    if booking.claimed_by is not None:
        raise ValueError(f"Booking {booking_id} is already claimed (by user {booking.claimed_by})")
    return repository.update_booking(db, booking, claimed_by=claimed_by, claimed_at=datetime.utcnow())


def change_booking_dates(db: Session, booking_id: int, data: BookingDateChangeRequest) -> Booking:
    """
    Change a booking's arrival/departure dates (Decision 029, Stage 1 of
    the staged autonomous-booking-modification roadmap). Unlike
    special_requests/flight-number edits, this touches inventory and
    price, so it gets the same rigor as create_booking:

    1. Reject if the booking is terminal (Cancelled/Rejected) — same
       principle as validate_status_transition.
    2. validate_stay_dates on the new range.
    3. Re-resolve the active contract for the NEW arrival_date (may differ
       from the booking's current contract_id if the new dates fall into a
       different contract/season window).
    4. check_allotment for the new range — raises before anything is
       written if unavailable.
    5. Re-price via get_room_price (same room_type/occupancy, meal plan
       code resolved from the existing meal_plan_id), get_mandatory_tax
       for the new nights count (Decision 033), and, if a transfer was
       selected, get_transfer_price for the new dates too. All raise
       before any write on a real problem (capacity, no season, transfer
       option not active on the new contract).
    5b. Decision 082: re-applies Pricing Engine's markup/exclusive-
       discount via apply_agent_pricing, against the NEW contract (may
       differ from the old one) and the NEW dates — same call shape
       create_booking itself uses. Fixes a real, previously-shipped bug:
       this function predates Decision 069 (Pricing Engine didn't exist
       yet), and after Decision 069 added markup to create_booking, this
       function was never updated to match — it kept writing Contract
       Engine's raw net total directly into total_amount, silently
       stripping markup/exclusive-discount on every date change for
       every booking, while agent_markup_amount/agent_exclusive_discount_amount
       stayed frozen at their original (now-orphaned) values. Fixed the
       same additive way every other LOCKED-engine extension in this
       project has been: a new call site, no change to Pricing Engine
       itself.
    6. reserve_allotment on the NEW dates first. If this fails, nothing
       has changed — the OLD dates are still held. Only once that
       succeeds does this release the OLD dates and write the updated
       booking row (new dates, nights, contract_id, rate_id, total_amount,
       agent_markup_amount, agent_exclusive_discount_amount,
       transfer_total, mandatory_tax_total, date_change_reason,
       dates_changed_at).

    Compensating action if the booking-row write itself fails after the
    new reservation succeeded and the old one was released (mirrors
    Decision 012's standard for create_booking, not a true transaction):
    release the new reservation and attempt to re-reserve the old dates.
    If that re-reservation also fails (a second, independent failure —
    e.g. the old capacity was taken by another booking in the interim),
    the booking ends up holding NEITHER old nor new inventory. This
    residual risk is accepted for the same reason Decision 012 accepted
    it: a real fix needs actual DB-level transaction coordination across
    Hotel/Contract/Booking, which this project doesn't have.
    """
    booking = _require_booking(db, booking_id)
    if booking.status in TERMINAL_STATUSES:
        raise ValueError(
            f"Booking status '{booking.status}' is terminal (allotment already released) — "
            f"cannot change dates"
        )

    validate_stay_dates(data.new_arrival_date, data.new_departure_date)

    new_contract = contract_service.get_active_contract(db, booking.hotel_id, data.new_arrival_date)
    if new_contract is None:
        raise ValueError(f"Hotel {booking.hotel_id} has no currently-active contract for the new dates")

    available = contract_service.check_allotment(
        db, new_contract.id, booking.room_type_id, data.new_arrival_date, data.new_departure_date
    )
    if not available:
        raise ValueError(
            f"Room type {booking.room_type_id} is not available for "
            f"{data.new_arrival_date} to {data.new_departure_date}"
        )

    meal_plan = contract_service.get_contract_meal_plan(db, booking.meal_plan_id)

    price = contract_service.get_room_price(
        db,
        new_contract.id,
        booking.room_type_id,
        data.new_arrival_date,
        data.new_departure_date,
        meal_plan.meal_code,
        booking.adults,
        booking.children,
        booking.infants,
    )

    transfer_total = booking.transfer_total
    if booking.transfer_type is not None:
        transfer_price = contract_service.get_transfer_price(
            db,
            new_contract.id,
            booking.transfer_type,
            data.new_arrival_date,
            data.new_departure_date,
            booking.adults,
            booking.children,
            booking.infants,
        )
        transfer_total = transfer_price["total"]

    old_contract_id = booking.contract_id
    old_arrival_date = booking.arrival_date
    old_departure_date = booking.departure_date
    new_nights = (data.new_departure_date - data.new_arrival_date).days

    mandatory_tax_total = contract_service.get_mandatory_tax(
        db, new_contract.id, new_nights, booking.adults, booking.children
    )["total"]

    # Decision 082: re-derive the agent-facing price for the new dates,
    # same call shape create_booking uses -- new_contract.id since a
    # date change can land in a different contract/season.
    agent_pricing = pricing_service.apply_agent_pricing(
        db, booking.agent_id, new_contract.id, price["final_total"], new_nights,
        booking.room_type_id, price["meal_plan_id"], data.new_arrival_date, data.new_departure_date,
    )

    contract_service.reserve_allotment(
        db, new_contract.id, booking.room_type_id, data.new_arrival_date, data.new_departure_date
    )

    try:
        contract_service.release_allotment(
            db, old_contract_id, booking.room_type_id, old_arrival_date, old_departure_date
        )
        booking = repository.update_booking(
            db,
            booking,
            arrival_date=data.new_arrival_date,
            departure_date=data.new_departure_date,
            nights=new_nights,
            contract_id=new_contract.id,
            rate_id=price["rate_id"],
            total_amount=agent_pricing["agent_room_total"],
            agent_markup_amount=agent_pricing["markup_amount"],
            agent_exclusive_discount_amount=agent_pricing["exclusive_discount_amount"],
            transfer_total=transfer_total,
            mandatory_tax_total=mandatory_tax_total,
            date_change_reason=data.reason,
            dates_changed_at=datetime.utcnow(),
        )
    except Exception:
        contract_service.release_allotment(
            db, new_contract.id, booking.room_type_id, data.new_arrival_date, data.new_departure_date
        )
        try:
            contract_service.reserve_allotment(
                db, old_contract_id, booking.room_type_id, old_arrival_date, old_departure_date
            )
        except Exception:
            pass
        raise

    return booking


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


# ---------------------------------------------------------------------------
# Booking Correspondence (Decision 049)
# ---------------------------------------------------------------------------
# Deliberately no real SMTP/IMAP integration -- "sent" means "recorded as
# sent" (the manager still emails the text through their own client);
# inbound rows are logged manually until a real business mailbox exists
# (Decision 029 Stage 3+). See models.py's BookingCorrespondence docstring
# for the full status-semantics reasoning.


def send_correspondence(
    db: Session,
    booking_id: int,
    subject: Optional[str],
    body: str,
    recipient_email: Optional[str],
    recipient_email_secondary: Optional[str],
    created_by: Optional[int],
) -> BookingCorrespondence:
    """Record an outbound message (typically the Decision 046 LPO text, possibly edited by the manager before sending) against a booking's thread. status="sent" -- "awaiting_reply" is a computed UI label (latest row is outbound/sent with no inbound row after it), never written here. recipient_email/recipient_email_secondary (Decision 050) are recorded as given -- not required, since this is still record-only, no real send happens."""
    _require_booking(db, booking_id)
    return repository.create_booking_correspondence(
        db,
        booking_id=booking_id,
        direction="outbound",
        subject=subject,
        body=body,
        status="sent",
        sent_at=datetime.utcnow(),
        recipient_email=recipient_email,
        recipient_email_secondary=recipient_email_secondary,
        created_by=created_by,
    )


def add_correspondence_reply(
    db: Session, booking_id: int, subject: Optional[str], body: str, created_by: Optional[int]
) -> BookingCorrespondence:
    """Manually log a hotel's reply (received via the manager's own email client, no real IMAP integration yet). Also resolves the most recent unanswered outbound message (status="sent") to "replied", so the thread's own data -- not just this new row -- reflects that the exchange is answered."""
    _require_booking(db, booking_id)
    thread = repository.list_booking_correspondence(db, booking_id)
    for row in reversed(thread):
        if row.direction == "outbound" and row.status == "sent":
            repository.update_booking_correspondence_status(db, row, "replied")
            break
    return repository.create_booking_correspondence(
        db,
        booking_id=booking_id,
        direction="inbound",
        subject=subject,
        body=body,
        status="replied",
        received_at=datetime.utcnow(),
        created_by=created_by,
    )


def list_correspondence(db: Session, booking_id: int) -> list[BookingCorrespondence]:
    """Return a booking's full correspondence thread, oldest first."""
    _require_booking(db, booking_id)
    return repository.list_booking_correspondence(db, booking_id)
