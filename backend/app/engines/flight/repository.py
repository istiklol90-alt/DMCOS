"""Flight Engine repository -- thin data access, no business rules."""

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.flight.models import FlightDeparture, FlightHold, FlightLeg, FlightPriceChange


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _save(db: Session, obj):
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def _update(db: Session, obj, fields: dict):
    for k, v in fields.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# Legs ----------------------------------------------------------------------

def list_legs(db: Session) -> list[FlightLeg]:
    return db.query(FlightLeg).order_by(FlightLeg.destination_country, FlightLeg.direction, FlightLeg.flight_number).all()


def get_leg(db: Session, leg_id: int) -> Optional[FlightLeg]:
    return db.query(FlightLeg).filter(FlightLeg.id == leg_id).first()


def create_leg(db: Session, **fields) -> FlightLeg:
    return _save(db, FlightLeg(**fields))


def update_leg(db: Session, leg: FlightLeg, fields: dict) -> FlightLeg:
    return _update(db, leg, fields)


# Departures ----------------------------------------------------------------

def get_departure(db: Session, departure_id: int) -> Optional[FlightDeparture]:
    return db.query(FlightDeparture).filter(FlightDeparture.id == departure_id).first()


def find_departure(db: Session, leg_id: int, on: date, cabin: str) -> Optional[FlightDeparture]:
    return (
        db.query(FlightDeparture)
        .filter(FlightDeparture.leg_id == leg_id, FlightDeparture.date == on, FlightDeparture.cabin == cabin)
        .first()
    )


def add_departures(db: Session, rows: list[dict]) -> int:
    for r in rows:
        db.add(FlightDeparture(**r))
    db.commit()
    return len(rows)


def list_departures(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    leg_ids: Optional[list[int]] = None,
    cabin: Optional[str] = None,
) -> list[FlightDeparture]:
    q = db.query(FlightDeparture)
    if date_from:
        q = q.filter(FlightDeparture.date >= date_from)
    if date_to:
        q = q.filter(FlightDeparture.date <= date_to)
    if leg_ids is not None:
        q = q.filter(FlightDeparture.leg_id.in_(leg_ids))
    if cabin:
        q = q.filter(FlightDeparture.cabin == cabin)
    return q.order_by(FlightDeparture.date, FlightDeparture.leg_id, FlightDeparture.cabin).all()


def update_departure(db: Session, dep: FlightDeparture, fields: dict) -> FlightDeparture:
    return _update(db, dep, fields)


def add_price_change(db: Session, **fields) -> FlightPriceChange:
    return _save(db, FlightPriceChange(**fields))


def list_price_changes(db: Session, departure_id: int) -> list[FlightPriceChange]:
    return (
        db.query(FlightPriceChange)
        .filter(FlightPriceChange.departure_id == departure_id)
        .order_by(FlightPriceChange.changed_at.desc(), FlightPriceChange.id.desc())
        .all()
    )


# Holds -----------------------------------------------------------------------

def add_hold(db: Session, **fields) -> FlightHold:
    return _save(db, FlightHold(**fields))


def list_holds_for_booking(db: Session, booking_id: int) -> list[FlightHold]:
    return db.query(FlightHold).filter(FlightHold.booking_id == booking_id).all()
