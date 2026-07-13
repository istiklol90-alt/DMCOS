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
    # Decision 048: which Contract Engine SpecialOffer (if any) was active
    # when this booking was priced -- plain Integer, not a ForeignKey, same
    # cross-engine decoupling as hotel_id/contract_id/rate_id/room_type_id/
    # meal_plan_id above (SpecialOffer lives in Contract Engine's own
    # tables). Set by create_booking from get_room_price's
    # applied_special_offer_ids ONLY when exactly one id was returned --
    # left NULL both when no offer applied and when the price genuinely
    # involved more than one offer's mechanisms (ambiguous, never guessed).
    applied_special_offer_id = Column(Integer, nullable=True)
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
    # Decision 022's Booking Engine integration: the agent's selected
    # ContractTransferOption.transfer_type (None if the contract doesn't
    # require one and the agent didn't add one), and its own frozen
    # get_transfer_price snapshot — deliberately a separate column, NOT
    # folded into total_amount, so Finance Engine can itemize room vs.
    # transfer revenue later without unpacking a merged number.
    transfer_type = Column(String(50), nullable=True)
    transfer_total = Column(Float, nullable=True)
    # Frozen snapshot of Contract Engine's get_mandatory_tax at booking time
    # (e.g. Kandima's Green Tax) -- same separate-column precedent as
    # transfer_total, NOT folded into total_amount, so Finance Engine can
    # itemize room vs. transfer vs. tax revenue independently. NULL when the
    # contract has no mandatory_tax_per_person_per_night configured.
    mandatory_tax_total = Column(Float, nullable=True)
    # 02_Logic_Rules.md #50 fields not in 03_Domain_Model.md #37's flat list.
    special_requests = Column(Text, nullable=True)
    arrival_flight_number = Column(String(50), nullable=True)
    departure_flight_number = Column(String(50), nullable=True)
    # Decision 047: the guest's REAL flight date/time, deliberately
    # separate from arrival_date/departure_date (the room's check-in/
    # check-out) -- these can legitimately differ (e.g. a flight landing
    # the morning after check-in). arrival_flight_time/departure_flight_time
    # are "HH:MM" strings, same convention as Hotel.checkin_time/
    # checkout_time, not a SQL Time column.
    arrival_flight_date = Column(Date, nullable=True)
    arrival_flight_time = Column(String(5), nullable=True)
    departure_flight_date = Column(Date, nullable=True)
    departure_flight_time = Column(String(5), nullable=True)
    # Cancellation fields — the calculated penalty lives here (snapshot at
    # cancellation time via Contract Engine's get_cancellation_policy); the
    # actual refund transaction is Payment Engine's table, not this one.
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_fee = Column(Float, nullable=True)
    # Date-change audit fields (Decision 029/Stage 1) — mirror the
    # cancellation fields' shape exactly. Only the LATEST change's reason/
    # timestamp is retained (no history table) if dates are changed more
    # than once — same single-event simplification cancellation already
    # has, since a booking can only be cancelled once anyway.
    date_change_reason = Column(Text, nullable=True)
    dates_changed_at = Column(DateTime, nullable=True)
    # "Взято в работу" (Decision 045) -- tracks whether anyone has started
    # handling a new booking, independent of business `status`. Plain
    # Integer, not a ForeignKey, same cross-boundary-identity pattern as
    # agent_id/created_by above -- deliberately NOT a User-only construct:
    # per Decision 029's staged AI-autonomy roadmap, a future AI agent
    # (Stage 4/5) would claim bookings the identical way, through a
    # designated system User row, with zero schema change needed. No
    # claimed_by_type discriminator column -- speculative until a real
    # AI-agent identity actually exists to test against.
    claimed_by = Column(Integer, nullable=True)
    claimed_at = Column(DateTime, nullable=True)
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
