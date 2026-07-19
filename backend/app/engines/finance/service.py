"""
Business/orchestration layer for the Finance Engine.

Same layering as every other Engine (08_Coding_Standards.md: "Business
logic inside Services", "Database access through Repository Layer").
This is the second Engine (after Booking Engine) to read from another
Engine's service.py directly -- app.engines.booking.service, read-only,
to fetch Booking rows for financial computation. Finance Engine never
writes back into Booking Engine, and never touches LOCKED Booking
Engine's own code -- Invoice generation is a manual, Finance-side
action (this session's decision), not a hook fired from
create_booking, so no change to Booking Engine's service.py was
needed.

compute_booking_financials is the single source of truth for
Net/Sale/Profit math, replacing Reservations.tsx's stale inline
calculation (which still shows Net == Sale and a hardcoded Profit
placeholder, predating Decision 069's Pricing Engine integration --
flagged, not fixed, by this Engine). Every other function in this
module (Invoice/AgentStatement generation) builds on it rather than
recomputing its own version.
"""

from datetime import date, datetime
import uuid

from sqlalchemy.orm import Session

from app.engines.finance import repository
from app.engines.finance import validators
from app.engines.finance.models import (
    Invoice,
    CreditNote,
    AgentStatement,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
)
from app.engines.booking.models import Booking
from models.user import User
from services import email_service

# Read-only cross-engine dependency, same pattern as Booking Engine's own
# imports of Hotel/Contract Engine's service.py.
from app.engines.booking import service as booking_service
# Decision 081: same read-only pattern -- only needed to resolve
# hotel_name for approve_and_send_invoice's email content.
from app.engines.hotel import service as hotel_service

# Booking Engine's validators.TERMINAL_STATUSES -- deliberately not
# imported (validators.py isn't the cross-engine contract surface,
# service.py is), duplicated here as a plain constant instead.
CANCELLED_BOOKING_STATUSES = {"Cancelled", "Rejected"}


# ---------------------------------------------------------------------------
# Core financial computation -- single source of truth for Net/Sale/Profit
# ---------------------------------------------------------------------------

def compute_booking_financials(booking: Booking) -> dict:
    """
    Derives Net/Sale/Profit from Booking's own columns -- no re-pricing,
    no calls into Contract/Pricing Engine, just arithmetic over the
    frozen snapshot Booking Engine already wrote at booking time.

    room_sale = booking.total_amount (Pricing Engine's agent_room_total,
    per Decision 069 -- already includes markup/exclusive-discount).
    room_net recovers the pre-Pricing-Engine figure exactly as
    Booking.total_amount's own docstring specifies:
        room_net = total_amount - agent_markup_amount + agent_exclusive_discount_amount

    transfer_total/mandatory_tax_total are pass-through at cost --
    Pricing Engine's LOCKED entry confirms it never touches either --
    so they add identically to both net_total and sale_total and
    contribute zero profit.

    agent_markup_amount/agent_exclusive_discount_amount are NULL
    together on any booking that predates Decision 069 (no backfill was
    done). markup_computed=False flags this case: profit is None (not
    computed), not 0 (a real zero-margin sale) -- the same NULL-vs-zero
    distinction the columns themselves already carry. subtotal/net_total/
    sale_total remain concrete numbers either way (a pre-069 booking's
    total_amount is itself the raw net, so the formulas collapse
    correctly with markup/discount treated as 0).

    total = subtotal - discount + commission + tax always reconciles to
    sale_total exactly -- verified by construction, and re-verified
    against real booking data before this function is considered done.
    """
    transfer = booking.transfer_total or 0.0
    tax = booking.mandatory_tax_total or 0.0
    markup_computed = booking.agent_markup_amount is not None
    markup = booking.agent_markup_amount or 0.0
    discount = booking.agent_exclusive_discount_amount or 0.0

    room_net = booking.total_amount - markup + discount
    subtotal = room_net + transfer
    net_total = room_net + transfer + tax
    sale_total = booking.total_amount + transfer + tax
    profit = (markup - discount) if markup_computed else None

    return {
        "booking_id": booking.id,
        "currency": booking.currency,
        "room_net": room_net,
        "room_sale": booking.total_amount,
        "transfer_amount": booking.transfer_total,
        "tax_amount": booking.mandatory_tax_total,
        "discount_amount": booking.agent_exclusive_discount_amount,
        "commission_amount": booking.agent_markup_amount,
        "markup_computed": markup_computed,
        "subtotal": subtotal,
        "net_total": net_total,
        "sale_total": sale_total,
        "profit": profit,
    }


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

def _generate_invoice_number() -> str:
    """No documented format exists anywhere in the docs, same as Booking Engine's own booking_number -- our own scheme."""
    return f"INV-{uuid.uuid4().hex[:12].upper()}"


def create_invoice_for_booking(db: Session, booking_id: int, created_by: int) -> Invoice:
    """
    Manually-triggered Invoice generation. Raises if a booking's already
    been invoiced -- one Invoice per booking, no duplicates.

    Decision 079: status is now set to "Draft", not "Issued" -- Draft
    means "created, awaiting accounting review," deliberately NOT
    agent-visible and with no PDF/email side effects yet. Only a future
    approve_and_send_invoice action (not built yet) moves Draft ->
    Issued, atomically generating the PDF, emailing it to the agent,
    and making it agent-visible -- all three happen together, not as
    separate steps. This reverses this function's original behavior
    (previously wrote "Issued" immediately, treating Draft as
    unreachable); the docstring's old claim that Draft was "effectively
    unreachable" no longer holds.

    issue_date is still set to today's date at creation time, same as
    before -- Stage 4 (approve_and_send_invoice) hasn't been designed
    yet, so whether "issue_date" should instead mean the actual
    approval/send date (requiring issue_date to become nullable, or a
    separate approved_at/sent_at field) is an open question left for
    that stage, not decided here.
    """
    booking = booking_service.get_booking(db, booking_id)
    if repository.get_invoice_by_booking(db, booking_id) is not None:
        raise ValueError(f"Booking {booking_id} already has an invoice")

    financials = compute_booking_financials(booking)
    return repository.create_invoice(
        db,
        invoice_number=_generate_invoice_number(),
        booking_id=booking.id,
        agent_id=booking.agent_id,
        hotel_id=booking.hotel_id,
        issue_date=date.today(),
        currency=booking.currency,
        subtotal=financials["subtotal"],
        discount=financials["discount_amount"],
        commission=financials["commission_amount"],
        tax=financials["tax_amount"],
        total=financials["sale_total"],
        status="Draft",
        created_by=created_by,
    )


def get_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = repository.get_invoice(db, invoice_id)
    if invoice is None:
        raise ValueError(f"Invoice {invoice_id} not found")
    return invoice


def get_invoice_by_booking(db: Session, booking_id: int) -> Invoice:
    """So a caller (Reservations.tsx's invoice button) can distinguish
    "not yet invoiced" from "already invoiced" without guessing --
    raises the same as get_invoice rather than returning None, matching
    this Engine's uniform ValueError-to-400 convention."""
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None:
        raise ValueError(f"Booking {booking_id} has no invoice")
    return invoice


def flag_invoice_for_review(db: Session, booking_id: int, reason: str) -> Invoice | None:
    """
    Decision 083 (Requirement 2): called via frontend orchestration from
    Reservations.tsx's date-change handler, best-effort, after
    change_booking_dates already succeeded -- mirrors Decision 080's
    claim-auto-invoice shape exactly, for the same reason (avoids a
    circular import: this module already imports booking_service, so
    Booking Engine calling back into Finance Engine at module level
    would break at import time).

    Silently no-ops (returns None, not an error) in the overwhelmingly
    common case of no invoice existing yet for this booking, and also
    when an invoice exists but isn't Draft -- an already-Issued
    invoice's staleness is a Credit Note's job, not this flag's; a Void
    invoice is already dead. Never raises for either case, since the
    caller's date-change action must never appear to fail because of
    this best-effort side effect.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None or invoice.status != "Draft":
        return None
    return repository.update_invoice(db, invoice, review_flag=reason)


def list_invoices(db: Session) -> list[Invoice]:
    """Admin-wide, unfiltered -- for the Финансы tab's invoice table.
    No pagination yet, same simplification Pricing Engine's
    list_exclusive_agents already makes at this project's current data
    volume."""
    return repository.list_invoices(db)


def list_invoices_by_agent(db: Session, agent_id: int) -> list[Invoice]:
    return repository.list_invoices_by_agent(db, agent_id)


def void_invoice(db: Session, invoice_id: int, voided_by: int) -> Invoice:
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_not_void(invoice)
    return repository.update_invoice(
        db, invoice, status="Void", voided_by=voided_by, voided_at=datetime.utcnow()
    )


def approve_and_send_invoice(db: Session, invoice_id: int, approved_by: int) -> Invoice:
    """
    Decision 081 (Stage B): "Одобрить и отправить" -- the single
    accounting action that flips Draft -> Issued and emails the agent
    a plain-text summary (real PDF is Stage C, not built yet). Only
    valid from Draft (validators.validate_invoice_draft).

    Requires the invoice's agent to resolve to a real User with a real
    email -- sending is meaningless without one, so this is a hard
    ValueError here, unlike every other Finance Engine function, which
    (per Decision 078's known limitation) trusts agent_id/hotel_id
    without validating existence at all.

    Status flips to Issued regardless of whether the email actually
    sent -- matching every other email call site in this project
    (send_booking_confirmation_email, registration emails), where
    email is always best-effort and never blocks the real action.
    email_sent_at is set only when send_real_email genuinely returns
    True; with no SMTP configured anywhere in this project today, that
    means it stays NULL for every real invoice until real credentials
    exist -- an honest, visible signal, not a silent failure.

    Decision 085: approved_by/approved_at are set unconditionally (who
    and when this action happened, regardless of email/flag state).
    flag_acknowledged_at is set only if review_flag was populated --
    the narrower "a flagged invoice was reviewed and approved anyway"
    signal the frontend uses to stop treating it as urgent, distinct
    from the unconditional approval record.
    """
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_draft(invoice)
    had_flag = invoice.review_flag is not None

    agent = db.query(User).filter(User.id == invoice.agent_id).first()
    if agent is None or not agent.email:
        raise ValueError(f"Agent {invoice.agent_id} has no resolvable email -- cannot send invoice")

    booking = booking_service.get_booking(db, invoice.booking_id)
    hotel = hotel_service.get_hotel(db, invoice.hotel_id)

    sent = email_service.send_invoice_email({
        "invoice_number": invoice.invoice_number,
        "hotel_name": hotel.hotel_name,
        "booking_number": booking.booking_number,
        "issue_date": invoice.issue_date,
        "subtotal": invoice.subtotal,
        "discount": invoice.discount,
        "commission": invoice.commission,
        "tax": invoice.tax,
        "total": invoice.total,
        "currency": invoice.currency,
        "agent_name": agent.name,
        "agent_email": agent.email,
    })

    now = datetime.utcnow()
    return repository.update_invoice(
        db, invoice,
        status="Issued",
        email_sent_at=now if sent else None,
        approved_by=approved_by,
        approved_at=now,
        flag_acknowledged_at=now if had_flag else None,
    )


# ---------------------------------------------------------------------------
# CreditNote
# ---------------------------------------------------------------------------

def _generate_credit_note_number() -> str:
    return f"CN-{uuid.uuid4().hex[:12].upper()}"


def create_credit_note(
    db: Session, invoice_id: int, amount: float, reason: str, created_by: int
) -> CreditNote:
    """A credit note always corrects an already-Issued Invoice -- can't
    be raised against a Draft (nothing issued yet) or Void (already
    nullified) one, and can't push total credited past the invoice's
    own total (validators.validate_credit_note_amount). reason is
    required at the call site (not just the schema) since these are
    always a manual, negotiated adjustment."""
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_issued(invoice)
    existing_credit_notes = repository.list_credit_notes_by_invoice(db, invoice_id)
    validators.validate_credit_note_amount(invoice, existing_credit_notes, amount)
    validators.validate_reason(reason)

    return repository.create_credit_note(
        db,
        credit_note_number=_generate_credit_note_number(),
        invoice_id=invoice_id,
        amount=amount,
        currency=invoice.currency,
        reason=reason,
        issue_date=date.today(),
        status="Issued",
        created_by=created_by,
    )


def list_credit_notes_by_invoice(db: Session, invoice_id: int) -> list[CreditNote]:
    return repository.list_credit_notes_by_invoice(db, invoice_id)


# ---------------------------------------------------------------------------
# AgentStatement -- aggregation over a period, single-currency
# ---------------------------------------------------------------------------

def _generate_statement_number() -> str:
    return f"STMT-{uuid.uuid4().hex[:12].upper()}"


def generate_agent_statement(
    db: Session,
    agent_id: int,
    period_start: date,
    period_end: date,
    currency: str,
    generated_by: int,
) -> AgentStatement:
    """
    Aggregates every one of the agent's bookings whose created_at falls
    inside [period_start, period_end] and whose currency matches --
    created_at (when the charge was incurred), not arrival_date (when
    the stay happens), since a statement is an account of charges, not
    a travel calendar. Cancelled/Rejected bookings are excluded (no
    revenue realized, same allotment-release boundary Booking Engine
    itself treats as terminal).

    Produces status="Draft" -- unlike Invoice, a statement gets an
    explicit finalize_agent_statement step, since reviewing an agent's
    whole-period total before it's considered final is a real,
    distinct business action (an Invoice is definitionally already
    final at generation; a statement is a rollup a manager may want to
    check first).

    Empty periods (no matching bookings) are not an error -- a
    statement with zero totals is a valid, honest answer, not an
    exceptional one.

    validators.validate_no_overlapping_statement blocks generating a
    second statement for the same agent/currency whose period overlaps
    an existing one, Draft or Finalized -- prevents the same bookings
    silently being double-counted across two statements.
    """
    same_currency_statements = [
        s for s in repository.list_agent_statements_by_agent(db, agent_id) if s.currency == currency
    ]
    validators.validate_no_overlapping_statement(same_currency_statements, period_start, period_end)

    all_bookings = booking_service.list_bookings_by_agent(db, agent_id)
    eligible = [
        b for b in all_bookings
        if b.currency == currency
        and b.status not in CANCELLED_BOOKING_STATUSES
        and period_start <= b.created_at.date() <= period_end
    ]

    statement = repository.create_agent_statement(
        db,
        statement_number=_generate_statement_number(),
        agent_id=agent_id,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        total_net=0,
        total_sale=0,
        total_profit=0,
        status="Draft",
        generated_by=generated_by,
    )

    total_net = 0.0
    total_sale = 0.0
    total_profit = 0.0
    for booking in eligible:
        financials = compute_booking_financials(booking)
        invoice = repository.get_invoice_by_booking(db, booking.id)
        repository.create_statement_line(
            db,
            statement_id=statement.id,
            booking_id=booking.id,
            invoice_id=invoice.id if invoice else None,
            net_amount=financials["net_total"],
            sale_amount=financials["sale_total"],
            profit_amount=financials["profit"],
        )
        total_net += financials["net_total"]
        total_sale += financials["sale_total"]
        # A pre-Decision-069 booking's real profit contribution is a
        # true $0 (no markup was ever layered on), not missing data --
        # unlike the per-line profit_amount above, the aggregate can
        # safely treat None as 0 here.
        total_profit += financials["profit"] or 0.0

    return repository.update_agent_statement(
        db, statement, total_net=total_net, total_sale=total_sale, total_profit=total_profit
    )


def get_agent_statement(db: Session, statement_id: int) -> AgentStatement:
    statement = repository.get_agent_statement(db, statement_id)
    if statement is None:
        raise ValueError(f"Agent statement {statement_id} not found")
    return statement


def list_statement_lines(db: Session, statement_id: int) -> list:
    return repository.list_statement_lines(db, statement_id)


def finalize_agent_statement(db: Session, statement_id: int) -> AgentStatement:
    statement = get_agent_statement(db, statement_id)
    validators.validate_statement_not_finalized(statement)
    return repository.update_agent_statement(db, statement, status="Finalized")


# ---------------------------------------------------------------------------
# HotelCashbackArrangement / HotelCashbackFulfillment -- Decision 009
# ---------------------------------------------------------------------------

def create_cashback_arrangement(
    db: Session,
    hotel_id: int,
    terms: str,
    currency: str,
    start_date_value: date,
    created_by: int,
    rebate_percentage: float | None = None,
    volume_threshold: float | None = None,
    end_date_value: date | None = None,
) -> HotelCashbackArrangement:
    """Deliberately not an automatic formula -- per Decision 009, these
    are negotiated per-hotel and recorded manually as agreed. terms
    (free text) is the actual source of truth; rebate_percentage/
    volume_threshold are a convenience for the common shape, not
    required."""
    validators.validate_cashback_arrangement_fields(
        terms, rebate_percentage, start_date_value, end_date_value
    )

    return repository.create_cashback_arrangement(
        db,
        hotel_id=hotel_id,
        terms=terms,
        rebate_percentage=rebate_percentage,
        volume_threshold=volume_threshold,
        currency=currency,
        start_date=start_date_value,
        end_date=end_date_value,
        status="Active",
        created_by=created_by,
    )


def list_cashback_arrangements_by_hotel(db: Session, hotel_id: int) -> list[HotelCashbackArrangement]:
    return repository.list_cashback_arrangements_by_hotel(db, hotel_id)


def update_cashback_arrangement_status(db: Session, arrangement_id: int, status: str) -> HotelCashbackArrangement:
    arrangement = repository.get_cashback_arrangement(db, arrangement_id)
    if arrangement is None:
        raise ValueError(f"Cashback arrangement {arrangement_id} not found")
    validators.validate_cashback_status(status)
    return repository.update_cashback_arrangement(db, arrangement, status=status)


def record_cashback_fulfillment(
    db: Session,
    arrangement_id: int,
    fulfillment_date: date,
    amount: float,
    recorded_by: int,
    cumulative_sales_volume_at_time: float | None = None,
    notes: str | None = None,
) -> HotelCashbackFulfillment:
    arrangement = repository.get_cashback_arrangement(db, arrangement_id)
    if arrangement is None:
        raise ValueError(f"Cashback arrangement {arrangement_id} not found")
    validators.validate_fulfillment_amount(amount)

    return repository.create_cashback_fulfillment(
        db,
        arrangement_id=arrangement_id,
        fulfillment_date=fulfillment_date,
        amount=amount,
        cumulative_sales_volume_at_time=cumulative_sales_volume_at_time,
        notes=notes,
        recorded_by=recorded_by,
    )


def list_cashback_fulfillments(db: Session, arrangement_id: int) -> list[HotelCashbackFulfillment]:
    return repository.list_cashback_fulfillments(db, arrangement_id)
