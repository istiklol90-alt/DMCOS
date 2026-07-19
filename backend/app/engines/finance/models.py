from sqlalchemy import Column, Integer, Float, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.sql import func

from models.base import Base


class Invoice(Base):
    """Frozen financial document for one booking, manually generated (not
    automatic -- avoids reaching into LOCKED Booking Engine's service.py
    to add a trigger). Field set combines 03_Domain_Model.md #40's list
    (subtotal/tax/discount/total) with 02_Logic_Rules.md #53's list
    (Agent/Hotel/Commission) -- the two docs don't fully overlap, neither
    is treated as more authoritative, both are included.

    subtotal/discount/commission/tax are derived from Booking's own
    columns via service.compute_booking_financials, chosen so that:
        total = subtotal - discount + commission + tax
    reproduces exactly Booking.total_amount + transfer_total +
    mandatory_tax_total (Pricing Engine's "Sale" figure) -- subtotal is
    the pre-Pricing-Engine net room cost plus transfer (transfer/tax are
    pass-through, per Pricing Engine's LOCKED entry, so they never
    interact with discount/commission).

    discount/commission are nullable, not defaulted to 0 -- a booking
    that predates Decision 069 (Pricing Engine's Booking Engine
    integration) has no markup data at all, and "$0 commission" would
    misrepresent "commission was never computed" as "commission was
    computed and is zero". Same NULL-vs-zero precedent as
    Booking.agent_markup_amount/agent_exclusive_discount_amount
    themselves, and tax mirrors Booking.mandatory_tax_total's identical
    NULL="not configured" convention.
    """

    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_number = Column(String(50), unique=True, nullable=False)
    # Cross-engine refs into Booking Engine -- plain Integer, no
    # ForeignKey, same decoupling convention every Engine uses.
    booking_id = Column(Integer, nullable=False)
    agent_id = Column(Integer, nullable=False)
    hotel_id = Column(Integer, nullable=False)
    issue_date = Column(Date, nullable=False)
    currency = Column(String(3), nullable=False)
    subtotal = Column(Float, nullable=False)
    discount = Column(Float, nullable=True)
    commission = Column(Float, nullable=True)
    tax = Column(Float, nullable=True)
    total = Column(Float, nullable=False)
    # Draft / Issued / Void. Deliberately NOT Paid/Refunded
    # (02_Logic_Rules.md #54's Payment Workflow) -- that status belongs
    # to the separate, not-yet-built Payment Engine, kept out of scope
    # per this session's explicit Payment-vs-Finance Engine split.
    status = Column(String(20), nullable=False, default="Draft")
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CreditNote(Base):
    """Adjustment against an already-issued Invoice -- always references
    invoice_id (not booking_id directly), so a credit note can't exist
    without a prior formal Invoice to correct. Not documented in
    03_Domain_Model.md/04_Data_Dictionary at all (module-list name
    only) -- designed fresh from standard DMC/travel-finance
    conventions, reason is mandatory since these are always a manual,
    negotiated adjustment, never formula-driven."""

    __tablename__ = "credit_notes"

    id = Column(Integer, primary_key=True)
    credit_note_number = Column(String(50), unique=True, nullable=False)
    # Intra-engine relation (Invoice lives in this same Engine) -- real
    # ForeignKey, same convention as Guest.booking_id inside Booking
    # Engine.
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(3), nullable=False)
    reason = Column(Text, nullable=False)
    issue_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="Draft")
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentStatement(Base):
    """A generated, frozen aggregation snapshot for one agent over one
    period -- same 'generate once, never silently re-derive' principle
    as Invoice. Single-currency by design: no FX/multi-currency
    infrastructure exists anywhere in this project (every Engine's
    currency field is per-contract/per-booking, never global), so an
    agent with bookings in multiple currencies gets multiple statements,
    one per currency, rather than an unsound cross-currency sum."""

    __tablename__ = "agent_statements"

    id = Column(Integer, primary_key=True)
    statement_number = Column(String(50), unique=True, nullable=False)
    agent_id = Column(Integer, nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    currency = Column(String(3), nullable=False)
    total_net = Column(Float, nullable=False, default=0)
    total_sale = Column(Float, nullable=False, default=0)
    total_profit = Column(Float, nullable=False, default=0)
    # Draft / Finalized.
    status = Column(String(20), nullable=False, default="Draft")
    generated_by = Column(Integer, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentStatementLine(Base):
    """One row per booking a finalized AgentStatement covers -- the
    frozen, auditable list of what was included, so a statement's
    coverage is never silently re-derivable/changeable after the fact
    (mirrors HumanGateDecision's append-only audit-trail principle in AI
    Core Engine). invoice_id is nullable: a booking can be on a
    statement without a formal Invoice ever having been generated for
    it, since Invoice generation is manual (this session's decision),
    not automatic. profit_amount is nullable for the same
    NULL-vs-zero reason as Invoice.commission -- a pre-Decision-069
    booking's profit was never computed, not zero."""

    __tablename__ = "agent_statement_lines"

    id = Column(Integer, primary_key=True)
    statement_id = Column(Integer, ForeignKey("agent_statements.id"), nullable=False)
    # Cross-engine ref into Booking Engine -- plain Integer.
    booking_id = Column(Integer, nullable=False)
    # Intra-engine relation -- real ForeignKey.
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    net_amount = Column(Float, nullable=False)
    sale_amount = Column(Float, nullable=False)
    profit_amount = Column(Float, nullable=True)


class HotelCashbackArrangement(Base):
    """Decision 009 part 2: a manually-recorded, individually-negotiated
    per-hotel cashback deal (e.g. hotel rebates 5% of cumulative sales
    once a $1M threshold is reached). Deliberately NOT an automatic
    formula/calculator -- per the project owner, these are negotiated
    per-hotel and recorded manually as agreed. rebate_percentage/
    volume_threshold are nullable because 'terms' (free text) is the
    actual source of truth for irregular deals; the structured fields
    are a convenience for the common percent-of-volume shape, not a
    hard schema every real arrangement must fit."""

    __tablename__ = "hotel_cashback_arrangements"

    id = Column(Integer, primary_key=True)
    # Cross-engine ref into Hotel Engine -- plain Integer.
    hotel_id = Column(Integer, nullable=False)
    terms = Column(Text, nullable=False)
    rebate_percentage = Column(Float, nullable=True)
    volume_threshold = Column(Float, nullable=True)
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    # Active / Fulfilled / Expired.
    status = Column(String(20), nullable=False, default="Active")
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class HotelCashbackFulfillment(Base):
    """Each actual rebate payment recorded against a
    HotelCashbackArrangement -- a child table because cumulative-volume
    thresholds can realistically be hit more than once over an
    arrangement's life (e.g. a second $1M tranche), so fulfillment is a
    log, not a single flag on the arrangement itself."""

    __tablename__ = "hotel_cashback_fulfillments"

    id = Column(Integer, primary_key=True)
    arrangement_id = Column(
        Integer, ForeignKey("hotel_cashback_arrangements.id"), nullable=False
    )
    fulfillment_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    cumulative_sales_volume_at_time = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    recorded_by = Column(Integer, nullable=False)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
