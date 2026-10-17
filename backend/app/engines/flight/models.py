"""Flight Engine data model (2026-10-17).

Seats we hold on flights, entered by our own staff for now (owner: "I can
add the departure dates, the number of seats and the amounts myself");
GDS later through Integration Engine behind the same search / hold shape.

A *leg* is one direction of one flight number (outbound or return), so a
one-way package is simply one leg. A *departure* is that leg on one date in
one cabin, with its own seats, cost and price -- the price per date is what
the owner changes from the load (e.g. many free seats on 20.10: cost 1000,
price 200).

Conventions: plain Integer ids, no ForeignKey; amounts with a currency;
cost is staff-only (api/redaction.py strips `cost` / `cost_per_seat`).
"""

from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from models.base import Base


class FlightLeg(Base):
    __tablename__ = "flight_legs"

    id = Column(Integer, primary_key=True)
    direction = Column(String(10), nullable=False)  # outbound | return
    airline = Column(String(100), nullable=True)
    flight_number = Column(String(20), nullable=False)
    origin = Column(String(100), nullable=False)          # e.g. "Dubai (DXB)"
    destination = Column(String(100), nullable=False)     # e.g. "Male (MLE)"
    destination_country = Column(String(100), nullable=False)  # the package destination (hotel country)
    departure_time = Column(String(5), nullable=False)    # "08:45", local
    arrival_time = Column(String(5), nullable=False)
    arrival_day_offset = Column(Integer, nullable=False, default=0)  # +1 when it lands the next day
    currency = Column(String(10), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FlightDeparture(Base):
    __tablename__ = "flight_departures"

    id = Column(Integer, primary_key=True)
    leg_id = Column(Integer, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    cabin = Column(String(20), nullable=False)  # economy | business
    seats_total = Column(Integer, nullable=False)
    seats_sold = Column(Integer, nullable=False, default=0)  # confirmed + held, maintained by holds
    cost_per_seat = Column(Float, nullable=False)
    price_per_seat = Column(Float, nullable=False)
    standard_price = Column(Float, nullable=False)  # the price set when the schedule was created
    active = Column(Boolean, nullable=False, default=True)
    updated_by = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FlightPriceChange(Base):
    """Append-only history of price / cost / seat changes on a departure."""

    __tablename__ = "flight_price_changes"

    id = Column(Integer, primary_key=True)
    departure_id = Column(Integer, nullable=False, index=True)
    old_price = Column(Float, nullable=True)
    new_price = Column(Float, nullable=True)
    old_cost = Column(Float, nullable=True)
    new_cost = Column(Float, nullable=True)
    old_seats = Column(Integer, nullable=True)
    new_seats = Column(Integer, nullable=True)
    reason = Column(Text, nullable=True)
    changed_by = Column(Integer, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())


class FlightHold(Base):
    """Seats held for a quote / booking, so the last seat cannot be sold
    twice. Released on reject / cancel / expiry (used by Package Engine)."""

    __tablename__ = "flight_holds"

    id = Column(Integer, primary_key=True)
    departure_id = Column(Integer, nullable=False, index=True)
    seats = Column(Integer, nullable=False)
    booking_id = Column(Integer, nullable=True, index=True)
    quote_id = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="held")  # held | confirmed | released
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
