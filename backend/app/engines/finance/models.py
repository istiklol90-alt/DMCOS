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
    # Decision 079: Draft now means "created, awaiting accounting
    # review, not agent-visible" (creation writes Draft, not Issued);
    # Issued means "reviewed, approved, PDF'd, emailed, agent-visible"
    # (set only by a future approve_and_send_invoice action).
    status = Column(String(20), nullable=False, default="Draft")
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Decision 081: set only when send_real_email actually returns True
    # (real SMTP configured and the send succeeded) -- stays NULL when
    # it fell back to console-log-only (this project's current real
    # state -- no SMTP configured anywhere in this environment yet),
    # same NULL-vs-real-value audit precedent as agent_markup_amount
    # etc. Distinguishes "Issued" (accounting approved it) from
    # "actually delivered to the agent" -- approve_and_send_invoice
    # flips status regardless of send success, matching every other
    # email call site in this project (email is always best-effort,
    # never blocks the real action).
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    # Decision 083 (Requirement 2), superseded by Decision 093: this was
    # originally a single overwritable text field (NULL = clean,
    # non-NULL = both "needs review" and the reason in one field) --
    # replaced by the InvoiceReviewNote child table below. The physical
    # `review_flag` column still exists in the SQLite file (SQLite
    # column drops are unnecessary DDL risk for zero benefit) but is no
    # longer mapped here; its history was backfilled into
    # InvoiceReviewNote rows before this line was removed. Real,
    # DB-traced bug this fixed: the old field was always overwritten by
    # a new flag (never "set once"), but flag_acknowledged_at was never
    # reset alongside it, so a second flag after an acknowledgment
    # silently never re-appeared as urgent -- a class of bug the new
    # "urgency computed from latest note vs. acknowledged_at" design
    # eliminates structurally instead of patching around it.
    # Decision 085: flag_acknowledged_at/flag_acknowledged_by now mean
    # "all InvoiceReviewNotes as of this timestamp were reviewed" --
    # still set by approve_and_send_invoice (Draft path) and
    # acknowledge_review_flag (Issued path), same actor+timestamp
    # pairing as approved_by/voided_by below. A note created AFTER this
    # timestamp makes the invoice urgent again automatically -- no
    # field needs to be manually cleared.
    flag_acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    # Decision 089: who acknowledged the flag -- set alongside
    # flag_acknowledged_at by both approve_and_send_invoice (Draft path)
    # and acknowledge_review_flag (Issued path), same actor+timestamp
    # pairing as approved_by/voided_by below.
    flag_acknowledged_by = Column(Integer, nullable=True)
    # Decision 085 (audit-trail completeness, Requirement raised via
    # live project-owner review): who approved/voided this invoice, and
    # when. Previously only created_by/created_at existed -- who took
    # the approve or void action was never captured at all. approved_at/
    # voided_at are unconditional (always set on their respective
    # action), deliberately separate from flag_acknowledged_at (which
    # only fires when a flag existed) -- these answer "when was this
    # approved" even for the common case of an invoice with no flag.
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    voided_by = Column(Integer, nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)


class InvoiceReviewNote(Base):
    """Decision 093: append-only numbered history of every 'this
    invoice's booking changed after the invoice existed' event --
    replaces Invoice.review_flag's single overwritable text field, which
    had a real, DB-traced bug: a second flag after acknowledgment
    silently never re-surfaced as urgent (see Invoice.flag_acknowledged_at's
    docstring). Never updated or deleted once created -- same
    "never mutate history" principle as AI Core Engine's
    HumanGateDecision and this Engine's own AgentStatementLine.
    sequence_number is assigned by service.py (1, 2, 3... per invoice,
    never reused), not a DB identity column, so it reads naturally as
    "Изменено 1", "Изменено 2" in the UI regardless of the row's own
    internal id.

    Decision 094: change_description alone ("Даты изменены с X на Y")
    doesn't tell accounting whether the price actually moved or why --
    the 8 nullable old_*/new_* columns below capture the real price
    breakdown (via Contract/Pricing Engine's own get_room_price/
    get_transfer_price/get_mandatory_tax/apply_agent_pricing) for BOTH
    the old and new dates, snapshotted server-side at the moment this
    note is created -- never client-supplied (a permanent financial
    audit record shouldn't trust a client's report of historical
    pricing) and never reconstructed later (season/offer availability
    can itself change over time, so a later recompute wouldn't
    necessarily match what was true at the actual moment of change).
    old_offer_name/new_offer_name are NULL when no SpecialOffer applied
    ("только контракт" at display time), not an empty string.
    change_description itself became nullable here (a real SQLite table
    rebuild, not just an ALTER -- the table had only test rows, so this
    was cheap) since a structured note doesn't need a redundant
    free-text sentence; it's still used verbatim by the 14 pre-Decision-
    094 legacy notes, which have no structured snapshot at all.

    Deliberately NOT built here, logged for later only: a per-note
    hotel-confirmation status/comment (e.g. "Отправлено отелю, ожидаем
    подтверждения" / "Отель подтвердил по этой цене") -- ties into
    Decision 029's future AI-hotel-correspondence work, not something
    this session has any real need to build yet.

    Decision 108: generalized to be booking-rooted, not invoice-rooted.
    A large fraction of real bookings get changed before any invoice
    ever exists (invoice creation is a separate, manual, later action) --
    every note-creating function used to silently no-op in that case, so
    no durable "needs review" signal existed at all for those changes.
    booking_id is now the real anchor (NOT NULL, always set);
    sequence_number is now assigned per-BOOKING (not per-invoice), so a
    booking's own numbered history survives across invoice
    creation/void. invoice_id stays as optional, informational-only
    metadata -- set when an invoice happened to exist at note-creation
    time, never load-bearing for urgency (see list_urgent_bookings).
    Deliberately did NOT rename this model/table despite the scope
    change -- avoids touching already-verified, LOCKED code
    (InvoiceDetailModal, formatSingleNote, formatReviewNotes,
    deriveChangeHighlights) that has nothing to do with this decision."""

    __tablename__ = "invoice_review_notes"

    id = Column(Integer, primary_key=True)
    # Decision 108: plain Integer, no ForeignKey -- same cross-engine
    # convention every other Engine reference in this project already
    # uses (Booking lives in a different Engine). The real anchor now;
    # always set.
    booking_id = Column(Integer, nullable=False)
    # Intra-engine relation (Invoice lives in this same Engine) -- real
    # ForeignKey, same convention as CreditNote.invoice_id. Decision 108:
    # made nullable -- optional, informational metadata only now, not
    # required for a note to exist.
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    sequence_number = Column(Integer, nullable=False)
    change_description = Column(String(500), nullable=True)
    old_arrival_date = Column(Date, nullable=True)
    old_departure_date = Column(Date, nullable=True)
    old_total = Column(Float, nullable=True)
    old_offer_name = Column(String(100), nullable=True)
    new_arrival_date = Column(Date, nullable=True)
    new_departure_date = Column(Date, nullable=True)
    new_total = Column(Float, nullable=True)
    new_offer_name = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BookingReviewAcknowledgment(Base):
    """Decision 108: one row per booking, upserted -- replaces
    Invoice.flag_acknowledged_at/flag_acknowledged_by as the real,
    AUTHORITATIVE source of truth for "has anyone reviewed this
    booking's changes" (list_urgent_booking_ids/list_urgent_bookings
    read only this table, never the Invoice columns). Those two Invoice
    columns are kept physically in place (same precedent as Decision
    093's own review_flag column retirement on this same LOCKED table
    -- no destructive removal) AND kept in sync via a mirrored write in
    service.acknowledge_booking_review -- a real finding made while
    implementing, not the original plan: financeShared.tsx's
    isUrgentFlag (Финансы→Счета's general/searched invoice table and
    InvoiceDetailModal, not just the pre-filtered urgent panel)
    recomputes urgency client-side from these two fields, so leaving
    them genuinely frozen/stale would have silently broken those
    already-LOCKED frontend surfaces. Their existing pre-migration
    values were also copied into this table once.

    Deliberately booking-rooted, not invoice-rooted: acknowledging from
    Бронирования and acknowledging from Финансы→Счета are the SAME
    action now (per the project owner's explicit "unified acknowledgment"
    decision) -- one booking, one acknowledgment state, actionable from
    either screen. acknowledge_review_flag (the existing invoice-keyed
    function Финансы→Счета's endpoint already calls) becomes a thin
    wrapper that resolves the invoice's booking_id and writes here."""

    __tablename__ = "booking_review_acknowledgments"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, nullable=False, unique=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=False)
    acknowledged_by = Column(Integer, nullable=True)


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


class Voucher(Base):
    """Decision 097: the guest-facing proof-of-booking document -- hotel
    name/dates/room type/guest names/meal plan/the hotel's own
    confirmation number, what a guest presents at check-in. Deliberately
    carries NO pricing/discount/commission figures at all -- that's
    Invoice's job, a completely separate document for a completely
    separate audience (agent/accounting vs. the guest). This is
    `01_Modules_List.md` §11's originally-deferred "Voucher" item
    (Decision 076 explicitly excluded it from Finance Engine's initial
    scope); built now as a genuine additive extension to this
    already-LOCKED Engine, not a new deferral being closed early.

    Lives in Finance Engine, not Booking Engine, despite being
    booking-content-heavy: every piece of infrastructure this needs
    already exists here and nowhere else (the generate-a-document/
    resolve-agent-email/send-via-email_service pattern Invoice already
    established, the read-only booking_service/hotel_service/
    contract_service cross-engine imports, the sequential-number scheme
    Decision 090 introduced). Booking Engine has never had a new entity
    added to it this whole project -- every LOCKED-Booking-Engine touch
    (Decisions 082/084/089/090/095) has been a single field, never a
    table.

    Fields are a frozen snapshot at generation time, same "never
    silently drift if the booking changes later" principle Invoice's
    own fields already follow -- resolved once, from booking/hotel/
    contract/guest data, then never re-derived.

    Deliberately NOT "one per booking" like Invoice -- mirrors
    CreditNote's append-only relationship to Invoice instead: a hotel
    correcting its confirmation number later produces a new Voucher,
    not a blocked-on-one-existing error. No status/review workflow
    (unlike Invoice's Draft/Issued gate) -- generation IS the send
    action here, since nothing about a guest-facing document needs an
    internal accounting approval step the way an agent's bill does."""

    __tablename__ = "vouchers"

    id = Column(Integer, primary_key=True)
    voucher_number = Column(String(50), unique=True, nullable=False)
    # Cross-engine refs into Booking/Hotel Engine -- plain Integer, no
    # ForeignKey, same convention every Engine uses.
    booking_id = Column(Integer, nullable=False)
    agent_id = Column(Integer, nullable=False)
    hotel_id = Column(Integer, nullable=False)
    confirmation_number = Column(String(100), nullable=False)
    hotel_name = Column(String(200), nullable=False)
    arrival_date = Column(Date, nullable=False)
    departure_date = Column(Date, nullable=False)
    room_type_name = Column(String(200), nullable=False)
    meal_plan_label = Column(String(100), nullable=True)
    guest_names = Column(Text, nullable=True)
    adults = Column(Integer, nullable=False)
    children = Column(Integer, nullable=False, default=0)
    infants = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Decision 081's own email_sent_at precedent exactly: set only when
    # send_real_email genuinely returns True. No SMTP configured
    # anywhere in this project today, so this stays NULL for every real
    # voucher, same as every invoice email -- an honest signal, not a
    # silent failure.
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
