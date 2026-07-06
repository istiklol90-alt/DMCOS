from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
)
from models.base import Base
from datetime import datetime


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    booking_number = Column(String(50), unique=True, nullable=False)
    # Plain Integer, not a ForeignKey — validated against models.user.User
    # directly (Users isn't wrapped behind an Engine boundary the way
    # Hotel/Contract are, so no cross-engine service call is needed here).
    agent_id = Column(Integer, nullable=False)
    # Plain Integer, not ForeignKeys into Hotel/Contract Engine's tables —
    # existence validated in service.py via their own service functions
    # (per docs/interface-contracts/contract-hotel-booking.md), same
    # cross-engine decoupling pattern Contract Engine used for Hotel Engine.
    hotel_id = Column(Integer, nullable=False)
    contract_id = Column(Integer, nullable=False)
    # rate_id/meal_plan_id/market_id are informational snapshots taken
    # from get_room_price's result at booking time, not independently
    # re-validated against Contract Engine (which doesn't expose standalone
    # lookups for these — only the composite pricing functions).
    rate_id = Column(Integer, nullable=False)
    room_type_id = Column(Integer, nullable=False)
    meal_plan_id = Column(Integer, nullable=False)
    market_id = Column(Integer, nullable=True)
    arrival_date = Column(Date, nullable=False)
    departure_date = Column(Date, nullable=False)
    nights = Column(Integer, nullable=False)
    adults = Column(Integer, nullable=False)
    children = Column(Integer, nullable=False, default=0)
    infants = Column(Integer, nullable=False, default=0)
    status = Column(String(20), default="Draft")
    currency = Column(String(3), nullable=False)
    # Frozen snapshot of get_room_price's final_total/currency at booking
    # time — never recomputed later even if the contract's seasons/rates/
    # promotions change afterward (same "original price never changes"
    # principle 02_Logic_Rules.md #18 applies to contracts, extended here).
    total_amount = Column(Float, nullable=False)
    # 02_Logic_Rules.md #50 fields not in 03_Domain_Model.md #37's flat list.
    special_requests = Column(Text, nullable=True)
    arrival_flight_number = Column(String(50), nullable=True)
    departure_flight_number = Column(String(50), nullable=True)
    # Cancellation fields — the calculated penalty lives here (snapshot at
    # cancellation time via Contract Engine's get_cancellation_policy); the
    # actual refund transaction is Payment Engine's table, not this one.
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_fee = Column(Float, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Guest(Base):
    __tablename__ = "guests"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    gender = Column(String(20), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    nationality = Column(String(100), nullable=True)
    # 03_Domain_Model.md #38 lists these as current fields; 02_Logic_Rules.md
    # #50 parenthetically calls passport "(future)" — following the Domain
    # Model as canonical, included now (nullable) rather than deferred.
    passport_number = Column(String(50), nullable=True)
    passport_expiry = Column(Date, nullable=True)
    special_requests = Column(Text, nullable=True)
    # Not in either doc — a simple flag standing in for "Lead Guest"
    # (02_Logic_Rules.md #50) instead of a nullable FK on Booking that
    # would need setting after a Guest row already exists.
    is_lead_guest = Column(Boolean, default=False)
