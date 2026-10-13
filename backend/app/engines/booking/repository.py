from datetime import date, datetime, time, timedelta
from typing import Optional
import uuid

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.booking.models import Booking, Guest, BookingCorrespondence, BookingRoom, BookingRoomGuest


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


def create_booking(db: Session, **fields) -> Booking:
    """Insert a new booking row from already-resolved fields (contract_id/rate_id/meal_plan_id/currency/total_amount already determined by service.py, not the caller). New bookings start with the model's default status ("Draft") unless status is explicitly passed.

    Decision 090: booking_number is a simple sequential BK-000001 scheme
    keyed to the row's own real autoincrement id -- not passed in by the
    caller (replaces the old UUID-based _generate_booking_number, same
    simplification requested for invoice numbers). The id doesn't exist
    until the row is actually inserted, so a placeholder is used to
    satisfy the NOT NULL/UNIQUE column constraints through flush, then
    immediately overwritten with the real sequential number before
    commit -- the placeholder is never visible to any caller."""
    fields["booking_number"] = f"__pending-{uuid.uuid4().hex}"
    booking = Booking(**fields)
    db.add(booking)
    db.flush()
    booking.booking_number = f"BK-{booking.id:06d}"
    db.commit()
    db.refresh(booking)
    return booking


def get_booking(db: Session, booking_id: int) -> Optional[Booking]:
    """Fetch a single booking by its primary key, or None if it doesn't exist."""
    return db.query(Booking).filter(Booking.id == booking_id).first()


def get_booking_by_number(db: Session, booking_number: str) -> Optional[Booking]:
    """Fetch a single booking by its unique booking_number, or None if it doesn't exist."""
    return db.query(Booking).filter(Booking.booking_number == booking_number).first()


def list_bookings(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    created_from: date | None = None,
    created_to: date | None = None,
    search: str | None = None,
    status: str | None = None,
    hotel_id: int | None = None,
    agent_id: int | None = None,
    arrival_from: date | None = None,
    arrival_to: date | None = None,
    date_view: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    claimed_by: int | None = None,
    unassigned: bool = False,
    mine_user_id: int | None = None,
) -> list[Booking]:
    """Return a page of bookings across all agents/hotels, for admin listing screens.

    created_from/created_to filter on Booking.created_at (a full
    datetime) -- created_to is treated as inclusive of that whole day,
    matching the "which applications came in on day X" question the
    admin Bookings screen's "By date"/"created" view asks. Ordered
    newest-first (Booking.id.desc()): if `limit` is ever actually hit,
    the most recent rows must win, not the oldest -- previously this
    was ascending, meaning once total bookings exceeded `limit`, brand
    new applications would silently stop appearing in an unscoped
    fetch at all (a real, found bug, not hypothetical).

    search is an optional case-insensitive partial match on
    booking_number -- same .ilike() pattern api/routes.py's own
    GET /users?search= already established (Decision 087). Deliberately
    combinable with created_from/created_to at the query-builder level
    (both are just additional .filter() calls), even though the admin
    Bookings screen's own frontend wiring chooses to only ever send one
    or the other at a time -- see Reservations.tsx's fetch effect.

    Decision 152 adds status/hotel_id/arrival_from/arrival_to filtering and
    an explicit sort, so the admin screen can paginate for real: with only
    a page in memory, filtering and sorting client-side would silently mean
    "within this page" -- an answer that looks right and isn't. Every new
    parameter is optional and defaults to the previous behavior, so every
    existing caller is unaffected."""
    query = _apply_booking_filters(
        db.query(Booking), created_from, created_to, search, status, hotel_id, agent_id,
        arrival_from, arrival_to, date_view, date_from, date_to,
        claimed_by=claimed_by, unassigned=unassigned, mine_user_id=mine_user_id,
    )
    return query.order_by(*_booking_order_by(sort_by, sort_dir)).offset(skip).limit(limit).all()


# Whitelist, not a passthrough: sort_by arrives from a query string, and
# handing an arbitrary attribute name to getattr(Booking, ...) would let a
# caller order by anything on the model.
_SORTABLE = {
    "created_at": Booking.created_at,
    "arrival_date": Booking.arrival_date,
    "status": Booking.status,
}


def _booking_order_by(sort_by: str | None, sort_dir: str | None) -> tuple:
    """Default stays Booking.id.desc() -- newest-first, exactly as before.
    Booking.id is appended as a tiebreaker for every other sort so a page
    boundary can never show the same row twice or skip one because two rows
    share an arrival_date.

    Always returns a TUPLE, and callers must splat it into order_by(*...):
    order_by() takes criteria as separate arguments, and handing it a single
    tuple raises at query time (found by the pagination test, not in review).
    """
    column = _SORTABLE.get((sort_by or "").strip())
    if column is None:
        return (Booking.id.desc(),)
    descending = (sort_dir or "desc").strip().lower() != "asc"
    return (column.desc() if descending else column.asc(), Booking.id.desc())


# Statuses after which a booking is no longer anyone's open work. The same
# three Decision 164's carry-forward has always excluded.
_CLOSED_STATUSES = ("Cancelled", "Rejected", "Completed")


def _unassigned_open():
    """Decision 200: "nobody has taken this on, and it is still open".

    ONE expression, used by both the "created today" carry-forward (Decision
    164) and the Unassigned work queue, so the two can never come to mean
    slightly different things. Decision 177: this is about the owner, not
    about the status being Pending -- a Confirmed booking with no owner is
    still unowned."""
    return and_(Booking.claimed_by.is_(None), Booking.status.notin_(_CLOSED_STATUSES))


def _apply_booking_filters(
    query,
    created_from: date | None,
    created_to: date | None,
    search: str | None,
    status: str | None,
    hotel_id: int | None,
    agent_id: int | None,
    arrival_from: date | None,
    arrival_to: date | None,
    date_view: str | None,
    date_from: date | None,
    date_to: date | None,
    *,
    claimed_by: int | None = None,
    unassigned: bool = False,
    mine_user_id: int | None = None,
):
    """Shared by list_bookings and count_bookings so the page and its total
    can never be computed from different filter sets -- the classic way a
    paginated list ends up claiming "1-50 of 400" while only 120 rows exist.

    Decision 200 adds the three keyword-only owner filters. Each one adds a
    condition only when supplied, so a call without them builds exactly the
    query it built before."""
    # A plain "whose is it" filter -- no status condition, so a manager's
    # finished bookings stay findable.
    if claimed_by is not None:
        query = query.filter(Booking.claimed_by == claimed_by)
    # The two work queues. Both mean OPEN work: a cancelled booking nobody
    # owned is not waiting for anyone.
    if unassigned:
        query = query.filter(_unassigned_open())
    if mine_user_id is not None:
        query = query.filter(
            Booking.claimed_by == mine_user_id,
            Booking.status.notin_(_CLOSED_STATUSES),
        )
    if created_from is not None:
        query = query.filter(Booking.created_at >= datetime.combine(created_from, time.min))
    if created_to is not None:
        query = query.filter(Booking.created_at < datetime.combine(created_to, time.min) + timedelta(days=1))
    if search:
        query = query.filter(Booking.booking_number.ilike(f"%{search}%"))
    if status:
        query = query.filter(Booking.status == status)
    if hotel_id is not None:
        query = query.filter(Booking.hotel_id == hotel_id)
    if agent_id is not None:
        query = query.filter(Booking.agent_id == agent_id)
    # arrival_* filter on a plain Date column, so both bounds are inclusive
    # -- unlike created_to above, which has to span a whole day of a DateTime.
    if arrival_from is not None:
        query = query.filter(Booking.arrival_date >= arrival_from)
    if arrival_to is not None:
        query = query.filter(Booking.arrival_date <= arrival_to)

    # Decision 152: the admin screen's three "By date" views, moved here
    # verbatim from Reservations.tsx's client-side filter. They are three
    # genuinely different questions and each keeps its exact original
    # semantics; the point of moving them is that they were being answered
    # from whatever slice happened to be loaded, so "who is staying next
    # week" silently excluded anyone booked before the newest N rows.
    if date_view and date_from is not None and date_to is not None:
        if date_view == "staying":
            # A stay occupies [arrival_date, departure_date); it belongs in
            # the range if that interval overlaps [date_from, date_to] at
            # all. Cancelled/Rejected were never really staying.
            query = query.filter(
                Booking.arrival_date <= date_to,
                Booking.departure_date > date_from,
                Booking.status.notin_(("Cancelled", "Rejected")),
            )
        elif date_view == "created":
            in_range = and_(
                Booking.created_at >= datetime.combine(date_from, time.min),
                Booking.created_at < datetime.combine(date_to, time.min) + timedelta(days=1),
            )
            # Decision 164: a booking nobody has taken on carries forward to
            # TODAY, every day, until someone takes it.
            #
            # Without this the default admin view ("created today") silently
            # drops yesterday's untouched bookings: not cancelled, not
            # rejected, nobody working them, and never seen again. At this
            # volume a quietly lost booking is the most expensive failure the
            # screen has.
            #
            # Scoped to a range that actually CONTAINS today -- browsing a
            # historical window must still answer "what came in that week",
            # not have today's backlog float into it.
            today = date.today()
            if date_from <= today <= date_to:
                query = query.filter(or_(in_range, _unassigned_open()))
            else:
                query = query.filter(in_range)
        elif date_view == "cancellations":
            query = query.filter(
                Booking.arrival_date >= date_from,
                Booking.arrival_date <= date_to,
                Booking.status == "Cancelled",
            )
    return query


def count_bookings(
    db: Session,
    created_from: date | None = None,
    created_to: date | None = None,
    search: str | None = None,
    status: str | None = None,
    hotel_id: int | None = None,
    agent_id: int | None = None,
    arrival_from: date | None = None,
    arrival_to: date | None = None,
    date_view: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    claimed_by: int | None = None,
    unassigned: bool = False,
    mine_user_id: int | None = None,
) -> int:
    """How many bookings match the same filters list_bookings would apply,
    ignoring skip/limit -- what a paginated screen needs to say "of N"."""
    query = _apply_booking_filters(
        db.query(Booking), created_from, created_to, search, status, hotel_id, agent_id,
        arrival_from, arrival_to, date_view, date_from, date_to,
        claimed_by=claimed_by, unassigned=unassigned, mine_user_id=mine_user_id,
    )
    return query.count()


def list_bookings_by_agent(db: Session, agent_id: int) -> list[Booking]:
    """Return every booking made by one agent."""
    return db.query(Booking).filter(Booking.agent_id == agent_id).order_by(Booking.id).all()


def list_bookings_by_hotel(db: Session, hotel_id: int) -> list[Booking]:
    """Return every booking for one hotel, across all agents."""
    return db.query(Booking).filter(Booking.hotel_id == hotel_id).order_by(Booking.id).all()


def update_booking(db: Session, booking: Booking, **fields) -> Booking:
    """Apply the given field values (e.g. special_requests, flight numbers) to an existing booking row and persist them. Does not touch status — use update_booking_status for that. Does not touch cancellation fields — use cancel_booking for that."""
    for key, value in fields.items():
        setattr(booking, key, value)
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


def update_booking_status(db: Session, booking: Booking, status: str) -> Booking:
    """Change only the booking's lifecycle status (e.g. Pending -> Confirmed) without touching any other field. Caller is responsible for validating the status value and the transition itself. Not for cancellation — use request_cancellation/confirm_cancellation, which set several related fields atomically at each of the two stages."""
    booking.status = status
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


def request_cancellation(
    db: Session, booking: Booking, reason: str, cancellation_fee: Optional[float], cancelled_by: int
) -> Booking:
    """
    Decision 104, stage 1 of 2 (renamed from the old single-stage
    cancel_booking, which this function replaces): set
    status="Cancellation Requested" together with cancellation_reason,
    cancelled_at, cancellation_fee, and cancelled_by in one write, since
    these fields only ever change together as part of the same
    cancellation-request event (02_Logic_Rules.md #49: "every
    cancellation must have reason"). These fields are the frozen
    request-time snapshot — confirm_cancellation (stage 2) never touches
    them again.
    """
    booking.status = "Cancellation Requested"
    booking.cancellation_reason = reason
    booking.cancelled_at = datetime.utcnow()
    booking.cancellation_fee = cancellation_fee
    booking.cancelled_by = cancelled_by
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


def confirm_cancellation(
    db: Session, booking: Booking, confirmation_number: str, confirmed_by: int
) -> Booking:
    """
    Decision 104, stage 2 of 2: set status="Cancelled" together with
    cancellation_confirmation_number/cancellation_confirmed_at/
    cancellation_confirmed_by in one write. Deliberately does not touch
    cancellation_reason/cancelled_at/cancellation_fee/cancelled_by — those
    were already frozen by request_cancellation and represent a different
    moment (the request), not this one (the hotel's confirmation).
    """
    booking.status = "Cancelled"
    booking.cancellation_confirmation_number = confirmation_number
    booking.cancellation_confirmed_at = datetime.utcnow()
    booking.cancellation_confirmed_by = confirmed_by
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


def cancel_free_of_charge(db: Session, booking: Booking, reason: str, cancelled_by: int) -> Booking:
    """
    Decision 168: a one-step cancellation with no fee, for an application
    the company itself could not fulfil (every room declined).

    Deliberately NOT routed through request_cancellation + confirm_
    cancellation: that pair models the agent asking and the hotel
    acknowledging, and stage 2 requires the hotel's own cancellation
    reference. There is no such reference here -- nobody is cancelling
    against the hotel; the rooms were already declined and released. It
    writes the same audit fields both stages do (who, when, why) so the
    record is no thinner, and fills the confirmation-stage fields with
    the same actor and moment, because in this flow the decision and its
    confirmation genuinely ARE the same act.

    cancellation_fee is a real, computed 0.0 -- the manager granting a
    free-of-charge cancellation -- never NULL, which throughout this
    project means "not computed".
    """
    now = datetime.utcnow()
    booking.status = "Cancelled"
    booking.cancellation_reason = reason
    booking.cancelled_at = now
    booking.cancellation_fee = 0.0
    booking.cancelled_by = cancelled_by
    booking.cancellation_confirmed_at = now
    booking.cancellation_confirmed_by = cancelled_by
    booking.updated_at = now
    db.commit()
    db.refresh(booking)
    return booking


# ---------------------------------------------------------------------------
# BookingRoom / BookingRoomGuest (Stage 2 — multi-room applications)
# ---------------------------------------------------------------------------


def create_booking_room(db: Session, **fields) -> BookingRoom:
    """Insert a new room row under an application. No flush/commit-then-overwrite
    trick needed here (unlike Booking.booking_number) — BookingRoom has no
    unique generated identifier of its own, just sequence_number, already
    known by the caller before insert."""
    room = BookingRoom(**fields)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def get_booking_room(db: Session, booking_room_id: int) -> Optional[BookingRoom]:
    """Fetch a single room by its primary key, or None if it doesn't exist."""
    return db.query(BookingRoom).filter(BookingRoom.id == booking_room_id).first()


def list_booking_rooms(db: Session, booking_id: int) -> list[BookingRoom]:
    """Return every room belonging to one application, in display order."""
    return (
        db.query(BookingRoom)
        .filter(BookingRoom.booking_id == booking_id)
        .order_by(BookingRoom.sequence_number)
        .all()
    )


def list_booking_rooms_bulk(db: Session, booking_ids: list[int]) -> list[BookingRoom]:
    """Bulk variant of list_booking_rooms for many applications in one query
    -- used by Finance Engine's list-level financials aggregation to avoid
    an N+1 (one query per booking) when computing figures for a whole
    Bookings list page at once."""
    if not booking_ids:
        return []
    return (
        db.query(BookingRoom)
        .filter(BookingRoom.booking_id.in_(booking_ids))
        .order_by(BookingRoom.booking_id, BookingRoom.sequence_number)
        .all()
    )


def update_booking_room(db: Session, room: BookingRoom, **fields) -> BookingRoom:
    """Apply the given field values to an existing room row and persist them — generic update, same shape as update_booking."""
    for key, value in fields.items():
        setattr(room, key, value)
    room.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(room)
    return room


def create_booking_room_guest_link(db: Session, booking_room_id: int, guest_id: int) -> BookingRoomGuest:
    """Assign one of the application's guests to one specific room."""
    link = BookingRoomGuest(booking_room_id=booking_room_id, guest_id=guest_id)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def list_guests_for_room(db: Session, booking_room_id: int) -> list[Guest]:
    """Return the actual Guest rows assigned to one room, via the BookingRoomGuest link table."""
    return (
        db.query(Guest)
        .join(BookingRoomGuest, BookingRoomGuest.guest_id == Guest.id)
        .filter(BookingRoomGuest.booking_room_id == booking_room_id)
        .all()
    )


def list_pending_approval_booking_rooms(db: Session) -> list[BookingRoom]:
    """
    Stage 3's "needs urgent approve" list: every room whose allotment was
    successfully reserved (status="Pending") and hasn't yet been approved
    or rejected by a manager. A plain query, not a new audit table --
    BookingRoom's own status/approved_by/rejected_by columns already
    carry everything needed.
    """
    return (
        db.query(BookingRoom)
        .filter(
            BookingRoom.status == "Pending",
            BookingRoom.approved_by.is_(None),
            BookingRoom.rejected_by.is_(None),
        )
        .order_by(BookingRoom.created_at)
        .all()
    )


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


def create_guest(db: Session, **fields) -> Guest:
    """Insert a new guest row (must include booking_id, first_name, last_name) and return it with its generated id."""
    guest = Guest(**fields)
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return guest


def get_guest(db: Session, guest_id: int) -> Optional[Guest]:
    """Fetch a single guest by its primary key, or None if it doesn't exist."""
    return db.query(Guest).filter(Guest.id == guest_id).first()


def list_guests(db: Session, booking_id: int) -> list[Guest]:
    """Return every guest attached to one booking."""
    return db.query(Guest).filter(Guest.booking_id == booking_id).all()


def update_guest(db: Session, guest: Guest, **fields) -> Guest:
    """Apply the given field values to an existing guest row and persist them."""
    for key, value in fields.items():
        setattr(guest, key, value)
    db.commit()
    db.refresh(guest)
    return guest


# ---------------------------------------------------------------------------
# Booking Correspondence (Decision 049)
# ---------------------------------------------------------------------------


def create_booking_correspondence(db: Session, **fields) -> BookingCorrespondence:
    """Insert a new correspondence row (must include booking_id, direction, body) and return it with its generated id."""
    row = BookingCorrespondence(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_booking_correspondence(db: Session, booking_id: int) -> list[BookingCorrespondence]:
    """Return every correspondence row for one booking, oldest first -- the thread, in reading order."""
    return (
        db.query(BookingCorrespondence)
        .filter(BookingCorrespondence.booking_id == booking_id)
        .order_by(BookingCorrespondence.created_at)
        .all()
    )


def update_booking_correspondence_status(db: Session, row: BookingCorrespondence, status: str) -> BookingCorrespondence:
    """Change only a correspondence row's status (e.g. the outbound message an inbound reply answers, sent -> replied) without touching any other field."""
    row.status = status
    db.commit()
    db.refresh(row)
    return row
