"""Package Engine data model (TASK-002, 2026-10-17).

Architecture: docs/plans/package-engine-architecture.md. Business rules:
docs/plans/package-pricing.md. Every rate, price and rule here is data an
admin edits -- never a constant in code.

Conventions (same as every engine): cross-engine ids (user_id, agent_id,
booking_id) are plain Integers, never a ForeignKey; intra-engine references
are plain Integers too (this project uses no relationship()). Amounts always
travel with a currency. `channel_id` is NULL for our own B2B site; a future
white-label partner becomes a channel with its own tiers, add-ons and rules.
Flight supply lives in Flight Engine (slice 2), not here.
"""

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from models.base import Base


class PackageChannel(Base):
    """A sales channel. Our own B2B site is the default; white label later."""

    __tablename__ = "package_channels"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CommissionTier(Base):
    """An agent commission level on a whole package (owner: one % per
    package for now, any value -- 5, 8, 10, 15 ...). gross = net / (1 - rate)."""

    __tablename__ = "package_commission_tiers"

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, nullable=True)
    name = Column(String(100), nullable=False)
    rate_percent = Column(Float, nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    updated_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AgentPackageSettings(Base):
    """Per-agent package settings. No row = the channel's default tier and
    no one-way flights -- new agents need nothing configured."""

    __tablename__ = "package_agent_settings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True)
    tier_id = Column(Integer, nullable=True)
    # Owner, 2026-10-17: a package with only the outbound or only the return
    # flight is allowed for agents the admin selects.
    one_way_flights_allowed = Column(Boolean, nullable=False, default=False)
    updated_by = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PackageAddOn(Base):
    """An optional extra the agent may add to a package: insurance, visa
    (later excursions). Entered by a manager for now; an insurer / visa API
    later becomes another supplier, same table shape.

    basis: per_person | per_person_per_day | per_booking.
    destination_country NULL = offered for every destination."""

    __tablename__ = "package_add_ons"

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, nullable=True)
    kind = Column(String(30), nullable=False)  # insurance | visa
    name = Column(String(200), nullable=False)
    supplier = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    destination_country = Column(String(100), nullable=True)
    basis = Column(String(30), nullable=False, default="per_person")
    currency = Column(String(10), nullable=False)
    cost = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, nullable=True)
    updated_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PackageAddOnPriceChange(Base):
    """Append-only audit of every cost / price change on an add-on."""

    __tablename__ = "package_add_on_price_changes"

    id = Column(Integer, primary_key=True)
    add_on_id = Column(Integer, nullable=False, index=True)
    old_cost = Column(Float, nullable=True)
    new_cost = Column(Float, nullable=True)
    old_price = Column(Float, nullable=True)
    new_price = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    changed_by = Column(Integer, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())


class PackageCancellationRule(Base):
    """Penalty for cancelling one component type, by notice period. A
    package's penalty is the sum of its components'. Hotels keep their own
    contract tiers; these rules cover the other components."""

    __tablename__ = "package_cancellation_rules"

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, nullable=True)
    component_type = Column(String(30), nullable=False)  # transfer | flight | insurance | visa
    days_before = Column(Integer, nullable=False)
    penalty_percent = Column(Float, nullable=False)
    note = Column(Text, nullable=True)
    updated_by = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PackageQuote(Base):
    """A priced package, computed server-side, valid until expires_at.
    `components` keeps the staff-side detail (including cost); agent-facing
    responses are built from net / gross / commission only."""

    __tablename__ = "package_quotes"

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, nullable=False, index=True)
    channel_id = Column(Integer, nullable=True)
    hotel_id = Column(Integer, nullable=False)
    destination_country = Column(String(100), nullable=True)
    check_in = Column(Date, nullable=False)
    check_out = Column(Date, nullable=False)
    party = Column(JSON, nullable=False)
    components = Column(JSON, nullable=False)
    currency = Column(String(10), nullable=False)
    cost_total = Column(Float, nullable=False)
    net_total = Column(Float, nullable=False)
    gross_total = Column(Float, nullable=False)
    commission = Column(Float, nullable=False)
    commission_rate = Column(Float, nullable=False)
    status = Column(String(20), nullable=False, default="quoted")  # quoted | booked | expired
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)


class BookingPackage(Base):
    """The package snapshot of a booking, frozen at booking time (owner:
    invoice shows net only; the booking keeps gross, net and the agent's
    profit)."""

    __tablename__ = "booking_packages"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, nullable=False, unique=True)
    quote_id = Column(Integer, nullable=True)
    currency = Column(String(10), nullable=False)
    cost_total = Column(Float, nullable=False)
    net_total = Column(Float, nullable=False)
    gross_total = Column(Float, nullable=False)
    commission = Column(Float, nullable=False)
    commission_rate = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BookingPackageLine(Base):
    """One non-hotel component of a booked package (insurance, visa, later
    flight seats). The hotel and transfer stay on the booking itself."""

    __tablename__ = "booking_package_lines"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, nullable=False, index=True)
    component_type = Column(String(30), nullable=False)
    add_on_id = Column(Integer, nullable=True)
    description = Column(String(300), nullable=False)
    quantity = Column(Float, nullable=False, default=1)
    currency = Column(String(10), nullable=False)
    cost_total = Column(Float, nullable=False)
    net_total = Column(Float, nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
