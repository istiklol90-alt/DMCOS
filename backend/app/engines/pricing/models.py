from sqlalchemy import Column, Integer, Float, String, Date, DateTime
from sqlalchemy.sql import func

from models.base import Base


class PricingSettings(Base):
    """Single global row (id always 1) holding the standard per-night
    markup applied to every agent's room price. Get-or-created by
    service.get_pricing_settings on first read -- nothing seeds this
    row directly, so a fresh database only gets it once someone calls
    that function. Does NOT hold an exclusive-discount percent -- that
    varies per contract (see ContractExclusiveDiscount), not globally."""

    __tablename__ = "pricing_settings"

    id = Column(Integer, primary_key=True)
    standard_markup_amount_per_night = Column(Float, nullable=False, default=10.0)
    currency = Column(String, nullable=False, default="USD")
    updated_by = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExclusiveAgent(Base):
    """One row per agent currently in the Exclusive pricing tier.
    Absence of a row means Standard. user_id/assigned_by reference
    Authentication Engine's User.id as plain Integers, no ForeignKey --
    same cross-engine decoupling convention as agent_id everywhere else
    in this project. Being Exclusive is necessary but not sufficient
    for a discount -- the contract being booked also needs its own
    ContractExclusiveDiscount row."""

    __tablename__ = "exclusive_agents"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True)
    assigned_by = Column(Integer, nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())


class ContractExclusiveDiscount(Base):
    """One or more rows per contract that offers an Exclusive-agent
    discount on its room rate -- most contracts will have none at all,
    by design (only a handful of real hotels offer this arrangement).
    contract_id references Contract Engine's Contract.id as a plain
    Integer, same decoupling convention as everywhere else. Managed
    through the existing Contracts admin view, not a separate admin
    surface.

    Decision 071: extended from a single flat per-contract row to a
    flexible, layered mechanism -- room_type_id/meal_plan_id (nullable,
    same "flexible core" wildcard pattern as Contract Engine's own
    SpecialOfferRoomDiscount.room_type_id) let a manager choose between
    one contract-wide % (both NULL) or granular per-room-type/meal-plan
    %s, and start_date/end_date (nullable) scope a row to a booking
    window -- NULL on both means always active. Multiple rows can now
    coexist per contract at different specificity/date windows;
    service.find_contract_exclusive_discount resolves which one (if
    any) applies to a given booking via a most-specific-match-wins
    rule, mirroring Decisions 051/053's tier-selection precedent. No
    longer unique on contract_id alone."""

    __tablename__ = "contract_exclusive_discounts"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, nullable=False)
    room_type_id = Column(Integer, nullable=True)
    meal_plan_id = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    discount_percent = Column(Float, nullable=False)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
