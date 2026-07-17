from sqlalchemy import Column, Integer, Float, String, DateTime
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
    """One row per contract that actually offers an Exclusive-agent
    discount on its room rate -- most contracts will have no row at
    all, by design (only a handful of real hotels offer this
    arrangement). contract_id references Contract Engine's Contract.id
    as a plain Integer, same decoupling convention as everywhere else.
    Managed through the existing Contracts admin view, one field per
    contract row, not a separate admin surface."""

    __tablename__ = "contract_exclusive_discounts"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, nullable=False, unique=True)
    discount_percent = Column(Float, nullable=False)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
