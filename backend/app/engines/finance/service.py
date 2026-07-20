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
import io
import uuid

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session

from app.engines.finance import repository
from app.engines.finance import validators
from app.engines.finance.models import (
    Invoice,
    CreditNote,
    AgentStatement,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
    Voucher,
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
# Decision 094: same read-only pattern -- add_invoice_review_note prices
# a booking's OLD dates itself (server-side, never client-supplied) via
# the exact same functions Booking Engine's own create_booking/
# change_booking_dates use internally.
from app.engines.contract import service as contract_service
from app.engines.pricing import service as pricing_service

# Booking Engine's validators.TERMINAL_STATUSES -- deliberately not
# imported (validators.py isn't the cross-engine contract surface,
# service.py is), duplicated here as a plain constant instead. Decision
# 104: also includes "Cancellation Requested" (not itself terminal in
# Booking Engine, but not a real, billable sale from Finance Engine's
# perspective either) -- both here (blocks new invoices, see
# create_invoice_for_booking below) and in generate_agent_statement's
# existing exclusion (a booking mid-cancellation shouldn't count toward
# a finalized agent rollup any more than an already-cancelled one does).
CANCELLED_BOOKING_STATUSES = {"Cancellation Requested", "Cancelled", "Rejected"}


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


def _attach_review_notes(db: Session, invoice: Invoice) -> Invoice:
    """Decision 093: no SQLAlchemy relationship() exists anywhere in
    this project (every intra-engine FK, e.g. CreditNote.invoice_id, is
    a plain Column, listed explicitly via its own repository function)
    -- kept consistent here rather than introducing the first one.
    review_notes is set as a plain ad-hoc attribute so InvoiceResponse's
    from_attributes validation picks it up like any other field; every
    service function that returns an Invoice (or list of them) must
    call this (or _attach_review_notes_bulk) before returning, since
    the attribute doesn't exist on the ORM object otherwise -- and
    db.refresh() wipes any previously-attached value, so this must run
    AFTER the last refresh, not before."""
    invoice.review_notes = repository.list_review_notes_by_invoice(db, invoice.id)
    return invoice


def _attach_review_notes_bulk(db: Session, invoices: list[Invoice]) -> list[Invoice]:
    notes_by_invoice = repository.list_review_notes_by_invoice_ids(db, [inv.id for inv in invoices])
    for inv in invoices:
        inv.review_notes = notes_by_invoice.get(inv.id, [])
    return invoices


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
    if booking.status in CANCELLED_BOOKING_STATUSES:
        raise ValueError(f"Cannot create an invoice for a booking with status '{booking.status}'")
    if repository.get_invoice_by_booking(db, booking_id) is not None:
        raise ValueError(f"Booking {booking_id} already has an invoice")

    financials = compute_booking_financials(booking)
    invoice = repository.create_invoice(
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
    return _attach_review_notes(db, invoice)


def get_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = repository.get_invoice(db, invoice_id)
    if invoice is None:
        raise ValueError(f"Invoice {invoice_id} not found")
    return _attach_review_notes(db, invoice)


def get_invoice_by_booking(db: Session, booking_id: int) -> Invoice:
    """So a caller (Reservations.tsx's invoice button) can distinguish
    "not yet invoiced" from "already invoiced" without guessing --
    raises the same as get_invoice rather than returning None, matching
    this Engine's uniform ValueError-to-400 convention."""
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None:
        raise ValueError(f"Booking {booking_id} has no invoice")
    return _attach_review_notes(db, invoice)


def _price_stay(db: Session, booking: Booking, contract_id: int, meal_code: str, arrival: date, departure: date) -> dict:
    """Decision 094: the exact same pricing chain Booking Engine's own
    create_booking/change_booking_dates use internally, factored out
    here so both the old- and new-dates snapshot (when the new one
    isn't just read off the booking row) go through identical logic.
    Returns {"total": agent-facing grand total including transfer/tax,
    "offer_id": the single applied SpecialOffer id, or None}."""
    nights = (departure - arrival).days
    price = contract_service.get_room_price(
        db, contract_id, booking.room_type_id, arrival, departure, meal_code,
        booking.adults, booking.children, booking.infants,
    )
    transfer_total = 0.0
    if booking.transfer_type:
        transfer_total = contract_service.get_transfer_price(
            db, contract_id, booking.transfer_type, arrival, departure,
            booking.adults, booking.children, booking.infants,
        )["total"]
    tax_total = contract_service.get_mandatory_tax(db, contract_id, nights, booking.adults, booking.children)["total"]
    agent_pricing = pricing_service.apply_agent_pricing(
        db, booking.agent_id, contract_id, price["final_total"], nights,
        booking.room_type_id, price["meal_plan_id"], arrival, departure,
    )
    offer_id = price["applied_special_offer_ids"][0] if price["applied_special_offer_ids"] else None
    return {"total": agent_pricing["agent_room_total"] + transfer_total + tax_total, "offer_id": offer_id}


def add_invoice_review_note(
    db: Session, booking_id: int, old_arrival_date: date, old_departure_date: date
) -> Invoice | None:
    """
    Decision 083 (Requirement 2), restructured by Decision 093, extended
    by Decision 094: called via frontend orchestration from
    Reservations.tsx's date-change handler, best-effort, after
    change_booking_dates already succeeded -- mirrors Decision 080's
    claim-auto-invoice shape exactly, for the same reason (avoids a
    circular import: this module already imports booking_service, so
    Booking Engine calling back into Finance Engine at module level
    would break at import time).

    Silently no-ops (returns None, not an error) in the overwhelmingly
    common case of no invoice existing yet for this booking, and also
    when the invoice is already Void (already dead, nothing to note).
    Never raises for either case, since the caller's date-change action
    must never appear to fail because of this best-effort side effect.

    Decision 094: captures the real price breakdown for both sides of
    the change, snapshotted server-side right now -- never
    client-supplied (a permanent financial audit record shouldn't trust
    a client's report of historical pricing) and never reconstructed
    later (season/offer availability can itself change over time, so a
    later recompute wouldn't necessarily match what was true at the
    actual moment of change).

    NEW snapshot is read directly off the booking's current row, never
    recomputed -- change_booking_dates has already computed and stored
    exactly this, moments before this call runs; recomputing separately
    would be redundant and could theoretically diverge from what's
    actually stored. OLD snapshot must be recomputed, since the
    pre-change values are gone from the booking row by this point:
    resolves whichever contract actually covered the OLD dates (may
    differ from the booking's current contract if the change crossed a
    contract boundary), resolves the booking's current meal_plan_id to
    its portable meal code first (meal codes, not ids, are portable
    across contracts -- the same assumption get_room_price's own
    signature already makes everywhere), then prices the old dates
    against the old contract using that code. Wrapped in a broad
    try/except: if the old dates genuinely can't be repriced (no
    contract covered them, no meal plan match, etc.), old_total/
    old_offer_name stay None and change_description alone carries the
    fallback description -- this best-effort note must never fail the
    caller's already-succeeded date change.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None or invoice.status == "Void":
        return None

    booking = booking_service.get_booking(db, booking_id)

    new_total = booking.total_amount + (booking.transfer_total or 0.0) + (booking.mandatory_tax_total or 0.0)
    new_offer_name = None
    if booking.applied_special_offer_id is not None:
        new_offer_name = contract_service.get_special_offer(db, booking.applied_special_offer_id).offer_name

    old_total = None
    old_offer_name = None
    try:
        old_contract = contract_service.get_active_contract(db, booking.hotel_id, old_arrival_date)
        if old_contract is not None:
            current_meal_plans = contract_service.get_meal_plans(db, booking.contract_id, booking.room_type_id)
            meal_code = next((mp.meal_code for mp in current_meal_plans if mp.id == booking.meal_plan_id), None)
            if meal_code is not None:
                old_result = _price_stay(db, booking, old_contract.id, meal_code, old_arrival_date, old_departure_date)
                old_total = old_result["total"]
                if old_result["offer_id"] is not None:
                    old_offer_name = contract_service.get_special_offer(db, old_result["offer_id"]).offer_name
    except ValueError:
        pass

    existing_notes = repository.list_review_notes_by_invoice(db, invoice.id)
    next_sequence = len(existing_notes) + 1
    fallback_description = (
        f"Даты изменены: {old_arrival_date.isoformat()} – {old_departure_date.isoformat()} "
        f"→ {booking.arrival_date.isoformat()} – {booking.departure_date.isoformat()}"
    )
    repository.create_review_note(
        db,
        invoice_id=invoice.id,
        sequence_number=next_sequence,
        change_description=fallback_description,
        old_arrival_date=old_arrival_date,
        old_departure_date=old_departure_date,
        old_total=old_total,
        old_offer_name=old_offer_name,
        new_arrival_date=booking.arrival_date,
        new_departure_date=booking.departure_date,
        new_total=new_total,
        new_offer_name=new_offer_name,
    )
    return _attach_review_notes(db, invoice)


def add_cancellation_requested_note(db: Session, booking_id: int) -> Invoice | None:
    """
    Decision 104: same frontend-orchestrated, best-effort pattern as
    add_invoice_review_note above, for the same reason (Finance Engine
    already imports booking_service at module level, so a reverse import
    would break at import time) -- called right after
    POST /booking-engine/bookings/{id}/cancel (stage 1) succeeds.

    Takes no reason parameter -- same Decision 094 principle
    (FlagForReviewRequest itself) applies: a permanent financial audit
    record shouldn't be built from client-supplied prose. Reads
    booking.cancellation_reason directly off the booking row (already
    frozen server-side by request_cancellation) instead.

    Unlike a date-change note, there's no price to compare (nothing has
    been repriced), so this only ever populates change_description and
    leaves all 8 price-snapshot columns NULL -- InvoiceReviewNote's own
    columns are already nullable for exactly this kind of event-only
    note; no schema change needed. Same silent no-op precedent as
    add_invoice_review_note: no invoice yet, or already Void, is the
    overwhelmingly common/expected case, not an error.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None or invoice.status == "Void":
        return None

    booking = booking_service.get_booking(db, booking_id)
    next_sequence = len(repository.list_review_notes_by_invoice(db, invoice.id)) + 1
    repository.create_review_note(
        db,
        invoice_id=invoice.id,
        sequence_number=next_sequence,
        change_description=f"Запрошена отмена бронирования: {booking.cancellation_reason}",
    )
    return _attach_review_notes(db, invoice)


def add_cancellation_confirmed_note(db: Session, booking_id: int) -> Invoice | None:
    """Decision 104: same shape as add_cancellation_requested_note above (including reading cancellation_confirmation_number directly off the booking row, never from the client), called after stage 2 (POST /confirm-cancellation) succeeds -- gives accounting a second, distinct signal that the cancellation is now final, not just requested."""
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None or invoice.status == "Void":
        return None

    booking = booking_service.get_booking(db, booking_id)
    next_sequence = len(repository.list_review_notes_by_invoice(db, invoice.id)) + 1
    repository.create_review_note(
        db,
        invoice_id=invoice.id,
        sequence_number=next_sequence,
        change_description=f"Отмена подтверждена отелем (номер: {booking.cancellation_confirmation_number})",
    )
    return _attach_review_notes(db, invoice)


def acknowledge_review_flag(db: Session, invoice_id: int, acknowledged_by: int) -> Invoice:
    """
    Decision 089: "Отметить как проверено" -- lets accounting dismiss the
    current urgent state on an Issued invoice (where
    approve_and_send_invoice's own flag_acknowledged_at write doesn't
    apply, since that function is gated to Draft-only) without
    re-sending anything. Requires at least one existing review note:
    unlike add_invoice_review_note's best-effort orchestration call,
    this is a deliberate action a human clicked a button for, so
    acknowledging an invoice with no notes at all is a caller error, not
    a silent no-op.

    Decision 093: this only needs to stamp flag_acknowledged_at/
    flag_acknowledged_by "as of now" -- it does NOT need to touch any
    individual note. A note created after this timestamp automatically
    makes the invoice urgent again (list_urgent_invoices' own logic),
    so there is nothing else to update here for that to work correctly.
    """
    invoice = get_invoice(db, invoice_id)
    if not invoice.review_notes:
        raise ValueError(f"Invoice {invoice_id} has no review notes to acknowledge")
    updated = repository.update_invoice(
        db, invoice, flag_acknowledged_at=datetime.utcnow(), flag_acknowledged_by=acknowledged_by
    )
    return _attach_review_notes(db, updated)


def list_invoices(db: Session) -> list[Invoice]:
    """Admin-wide, unfiltered -- for the Финансы tab's invoice table.
    No pagination yet, same simplification Pricing Engine's
    list_exclusive_agents already makes at this project's current data
    volume."""
    return _attach_review_notes_bulk(db, repository.list_invoices(db))


def list_invoices_by_agent(db: Session, agent_id: int) -> list[Invoice]:
    return _attach_review_notes_bulk(db, repository.list_invoices_by_agent(db, agent_id))


def list_invoices_by_agent_in_range(db: Session, agent_id: int, start_date: date, end_date: date) -> list[Invoice]:
    return _attach_review_notes_bulk(
        db, repository.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)
    )


def list_urgent_invoices(db: Session) -> list[Invoice]:
    return _attach_review_notes_bulk(db, repository.list_urgent_invoices(db))


def build_agent_invoice_export(db: Session, agent_id: int, start_date: date, end_date: date) -> bytes:
    """
    Decision 086: a real, downloadable .xlsx statement of "here's what
    was invoiced" for one agent over one period -- deliberately a
    separate, simpler mechanism from AgentStatement (Decision 077/078),
    which aggregates bookings into net/sale/profit rollups as a formal
    lockable document and has never had any frontend built for it. This
    is a raw, unaggregated list of real Invoice rows (filtered by
    issue_date, not booking dates -- an accounting-period export, not a
    travel calendar), matching what a real business document handed to
    an agent would show.

    Deliberately excludes any paid/unpaid or running-balance-owed
    tracking -- that requires Payment Engine (not yet started) to have
    any real payment data to reference. This is a clean statement of
    invoiced amounts, not a payment reconciliation.
    """
    invoices = repository.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)

    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"
    headers = [
        "Booking №", "Отель", "Заезд", "Выезд", "№ счёта", "Дата выставления",
        "Сумма", "Прибыль", "Валюта", "Статус",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for invoice in invoices:
        booking = booking_service.get_booking(db, invoice.booking_id)
        hotel = hotel_service.get_hotel(db, invoice.hotel_id)
        # Decision 101: same commission - discount formula as everywhere
        # else this session added Profit -- empty cell (not 0) when
        # either side is None, same NULL-vs-zero distinction the rest of
        # this Engine already carries.
        profit = (
            invoice.commission - invoice.discount
            if invoice.commission is not None and invoice.discount is not None
            else ""
        )
        ws.append([
            booking.booking_number,
            hotel.hotel_name,
            booking.arrival_date.isoformat(),
            booking.departure_date.isoformat(),
            invoice.invoice_number,
            invoice.issue_date.isoformat(),
            invoice.total,
            profit,
            invoice.currency,
            invoice.status,
        ])

    for column_cells in ws.columns:
        max_length = max(len(str(cell.value)) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = max_length + 2

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def void_invoice(db: Session, invoice_id: int, voided_by: int) -> Invoice:
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_not_void(invoice)
    updated = repository.update_invoice(
        db, invoice, status="Void", voided_by=voided_by, voided_at=datetime.utcnow()
    )
    return _attach_review_notes(db, updated)


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
    and when this action happened, regardless of email/note state).
    flag_acknowledged_at/flag_acknowledged_by are set only if at least
    one review note existed -- the narrower "a flagged invoice was
    reviewed and approved anyway" signal the frontend uses to stop
    treating it as urgent, distinct from the unconditional approval
    record. Decision 089 added flag_acknowledged_by alongside the
    already-existing flag_acknowledged_at, for the same actor+timestamp
    pairing every other Finance Engine action already has
    (approved_by/approved_at, voided_by/voided_at) -- and so this path
    and acknowledge_review_flag's leave an identically-shaped audit
    trail regardless of which one dismissed the current urgent state.
    Decision 093: had_flag now checks review_notes (the new child table)
    instead of the retired review_flag column -- same meaning, new
    source.
    """
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_draft(invoice)
    had_flag = len(invoice.review_notes) > 0

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
    updated = repository.update_invoice(
        db, invoice,
        status="Issued",
        email_sent_at=now if sent else None,
        approved_by=approved_by,
        approved_at=now,
        flag_acknowledged_at=now if had_flag else None,
        flag_acknowledged_by=approved_by if had_flag else None,
    )
    return _attach_review_notes(db, updated)


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


# ---------------------------------------------------------------------------
# Voucher -- Decision 097
# ---------------------------------------------------------------------------

def create_and_send_voucher(db: Session, booking_id: int, created_by: int) -> Voucher:
    """
    Decision 097: called via frontend orchestration from Reservations.tsx's
    confirmation-number editor, immediately after PUT .../bookings/{id}
    saves a new non-empty confirmation_number -- same shape as Decision
    080's claim-auto-invoice and Decision 083's date-change-flag, for the
    same reason (avoids a circular import: this module already imports
    booking_service, so Booking Engine calling back into Finance Engine
    at module level would break at import time; also keeps LOCKED
    Booking Engine's own code completely untouched by this feature).

    Unlike those two best-effort orchestration calls, this one DOES
    raise on failure (mirrors approve_and_send_invoice's own hard-fail
    for an unresolvable agent email) -- a voucher silently failing to
    generate would leave a manager believing the guest has their
    confirmation document when they don't, a worse outcome than a
    visible error the frontend can surface.

    Requires booking.confirmation_number to already be set (raises
    otherwise) -- the confirmation number IS the voucher's whole reason
    to exist; generating one without it would be meaningless. Requires
    the agent to resolve to a real User with a real email, same
    "sending is meaningless without one" reasoning approve_and_send_
    invoice already established.

    Every field is resolved fresh from live Booking/Hotel/Contract
    Engine data (read-only cross-engine calls, same pattern as every
    other Finance Engine function) and frozen onto the Voucher row at
    creation -- deliberately no pricing/discount/commission fields
    anywhere in this payload or the model itself; this is the
    guest-facing document, Invoice is the financial one.

    email_sent_at is computed BEFORE the row is created (not created
    then updated) -- Voucher has no Draft-then-Issued staged lifecycle
    like Invoice does, so there's no reason to insert first and patch
    the send outcome in afterward. Same "email is always best-effort,
    never blocks the real action" contract as every other email call
    site in this project: send_real_email never raises, and with no
    SMTP configured anywhere in this project today, email_sent_at stays
    NULL for every real voucher, same honest signal Invoice's own
    field already gives.
    """
    booking = booking_service.get_booking(db, booking_id)
    if not booking.confirmation_number:
        raise ValueError(f"Booking {booking_id} has no confirmation_number -- nothing to generate a voucher for")

    agent = db.query(User).filter(User.id == booking.agent_id).first()
    if agent is None or not agent.email:
        raise ValueError(f"Agent {booking.agent_id} has no resolvable email -- cannot send voucher")

    hotel = hotel_service.get_hotel(db, booking.hotel_id)
    room_type = hotel_service.get_room_type(db, booking.room_type_id)
    meal_plan = contract_service.get_contract_meal_plan(db, booking.meal_plan_id)
    guests = booking_service.list_guests(db, booking_id)
    guest_names = ", ".join(f"{g.first_name} {g.last_name}" for g in guests) or None

    sent = email_service.send_voucher_email({
        "confirmation_number": booking.confirmation_number,
        "hotel_name": hotel.hotel_name,
        "booking_number": booking.booking_number,
        "arrival_date": booking.arrival_date,
        "departure_date": booking.departure_date,
        "room_type_name": room_type.room_name,
        "meal_plan_label": meal_plan.meal_name or meal_plan.meal_code,
        "guest_names": guest_names,
        "adults": booking.adults,
        "children": booking.children,
        "infants": booking.infants,
        "agent_name": agent.name,
        "agent_email": agent.email,
    })

    return repository.create_voucher(
        db,
        booking_id=booking.id,
        agent_id=booking.agent_id,
        hotel_id=booking.hotel_id,
        confirmation_number=booking.confirmation_number,
        hotel_name=hotel.hotel_name,
        arrival_date=booking.arrival_date,
        departure_date=booking.departure_date,
        room_type_name=room_type.room_name,
        meal_plan_label=meal_plan.meal_name or meal_plan.meal_code,
        guest_names=guest_names,
        adults=booking.adults,
        children=booking.children,
        infants=booking.infants,
        created_by=created_by,
        email_sent_at=datetime.utcnow() if sent else None,
    )


def get_invoice_status(db: Session, booking_id: int) -> str | None:
    """
    Decision 102: the ONLY invoice-related data an agent's own view is
    ever allowed to receive over the network for their own booking --
    literally just the status string, never subtotal/discount/
    commission/tax/total. Returning None (not raising) when no invoice
    exists at all is deliberate: the caller (BookingDetail's
    "В работе" vs download-link decision) treats "no invoice yet" and
    "Draft" identically anyway, so this stays a plain lookup, not
    another ValueError-to-400 case.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)
    return invoice.status if invoice is not None else None


def get_latest_voucher(db: Session, booking_id: int) -> Voucher:
    """
    Decision 102: Voucher is deliberately append-only (Decision 097 --
    not "one per booking"), so a booking's confirmation_number being
    corrected later produces a NEW row, not an update to the old one.
    "The voucher" for download purposes is always the most recent one.
    """
    vouchers = repository.list_vouchers_by_booking(db, booking_id)
    if not vouchers:
        raise ValueError(f"Booking {booking_id} has no voucher yet")
    return vouchers[-1]


def build_voucher_download_text(voucher: Voucher) -> str:
    """Decision 102: same guest-facing-only content shape as
    send_voucher_email's own table -- zero pricing/discount/commission
    fields, reused verbatim as a real downloadable .txt rather than
    only ever existing as an email body."""
    lines = [
        f"ВАУЧЕР {voucher.voucher_number}",
        "",
        f"Отель: {voucher.hotel_name}",
        f"Номер подтверждения отеля: {voucher.confirmation_number}",
        f"Заезд: {voucher.arrival_date.isoformat()}",
        f"Выезд: {voucher.departure_date.isoformat()}",
        f"Тип номера: {voucher.room_type_name}",
        f"План питания: {voucher.meal_plan_label or '—'}",
        f"Гости: {voucher.guest_names or '—'}",
        f"Взрослые / Дети / Младенцы: {voucher.adults} / {voucher.children} / {voucher.infants}",
        "",
        "Этот документ подтверждает бронирование для гостя.",
    ]
    return "\n".join(lines)


def build_invoice_download_text(db: Session, invoice: Invoice) -> str:
    """
    Decision 102: only ever reachable for a status=="Issued" invoice
    (the caller/endpoint enforces this, matching the existing Draft-
    invisibility principle -- Draft content is never exposed to an
    agent through any path). Same line items send_invoice_email has
    already been putting in the agent's own inbox since Decision 081 --
    Комиссия/Скидка on an agent's OWN invoice is their bill's own
    breakdown, not the internal Profit framing Decision 102's list/
    detail-view fix was actually about; reuses that already-approved
    content shape here, not a more revealing new one.
    """
    booking = booking_service.get_booking(db, invoice.booking_id)
    hotel = hotel_service.get_hotel(db, invoice.hotel_id)
    lines = [
        f"СЧЁТ {invoice.invoice_number}",
        "",
        f"Отель: {hotel.hotel_name}",
        f"Бронирование: {booking.booking_number}",
        f"Дата выставления: {invoice.issue_date.isoformat()}",
        f"Сумма номера (нетто): {invoice.subtotal} {invoice.currency}",
        f"Скидка: {invoice.discount if invoice.discount is not None else '—'} {invoice.currency}",
        f"Комиссия: {invoice.commission if invoice.commission is not None else '—'} {invoice.currency}",
        f"Налог: {invoice.tax if invoice.tax is not None else '—'} {invoice.currency}",
        f"ИТОГО К ОПЛАТЕ: {invoice.total} {invoice.currency}",
    ]
    return "\n".join(lines)
