from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.booking.models import Booking, Guest, BookingCorrespondence


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


def list_bookings(db: Session, skip: int = 0, limit: int = 100) -> list[Booking]:
    """Return a page of bookings across all agents/hotels, for admin listing screens."""
    return db.query(Booking).order_by(Booking.id).offset(skip).limit(limit).all()


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
    """Change only the booking's lifecycle status (e.g. Pending -> Confirmed) without touching any other field. Caller is responsible for validating the status value and the transition itself. Not for cancellation — use cancel_booking, which sets several related fields atomically."""
    booking.status = status
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


def cancel_booking(
    db: Session, booking: Booking, reason: str, cancellation_fee: Optional[float], cancelled_by: int
) -> Booking:
    """Set status="Cancelled" together with cancellation_reason, cancelled_at, cancellation_fee, and (Decision 084) cancelled_by in one write, since these fields only ever change together as part of the same cancellation event (02_Logic_Rules.md #49: "every cancellation must have reason")."""
    booking.status = "Cancelled"
    booking.cancellation_reason = reason
    booking.cancelled_at = datetime.utcnow()
    booking.cancellation_fee = cancellation_fee
    booking.cancelled_by = cancelled_by
    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


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
