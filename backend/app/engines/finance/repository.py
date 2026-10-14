from datetime import date, datetime
from typing import Optional
import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.booking.models import Booking
from app.engines.finance.models import (
    HotelPriceConfirmation,
    Invoice,
    InvoiceReviewNote,
    InvoiceRoomLine,
    BookingReviewAcknowledgment,
    CreditNote,
    AgentStatement,
    AgentStatementLine,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
    Voucher,
    BookingCommercialLine,
)


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

# Decision 202: money nobody has sent yet -- with reservations (Draft) or
# with accounting (Ready for posting). Both stay on today's list.
UNSENT_INVOICE_STATUSES = ("Draft", "Ready for posting")


def list_returned_invoices(db: Session) -> list[Invoice]:
    """Decision 204: invoices accounting has handed back to reservations
    and nobody has re-sent yet. Structural, nothing to clear: a re-send
    moves the invoice out of Draft, so it drops out of this list by
    itself."""
    return (
        db.query(Invoice)
        .filter(Invoice.status == "Draft", Invoice.return_note.isnot(None))
        .all()
    )


def get_invoice(db: Session, invoice_id: int) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.id == invoice_id).first()


def get_invoice_by_booking(db: Session, booking_id: int) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.booking_id == booking_id).first()


def _apply_invoice_filters(
    db, query, status=None, agent_id=None, booking_id=None, search=None, date_from=None, date_to=None
):
    """
    Decision 182: one filter definition, shared by the page query and the
    count. Decision 152 established the rule after the Bookings list shipped
    a count and a page built from two different predicates -- a screen that
    says "1-50 of N" is lying the moment those drift apart.

    Decision 183: date-scoped, with **Drafts carried forward**. At 100
    invoices a day an all-time list is unreadable within a fortnight, so the
    screen opens on a date range like the Bookings list does. But a Draft is
    money that has not been sent to anybody -- dropping out of view because
    it was raised last Tuesday is exactly how it stays unsent. So while an
    invoice is still Draft it appears in any range that contains today,
    whenever it was raised; the moment it is approved it returns to its own
    issue date and stops floating. Same rule, same reasoning as Decision
    164's unclaimed bookings.
    """
    # Decision 189: a search ignores the date scope. Typing "80" while the
    # screen sat on today returned nothing -- BK-000080's invoice was issued
    # on the 16th and is Issued, so it neither falls in today's range nor
    # carries forward. A search box that silently only searches the current
    # window is worse than no search box: it answers "not found" for
    # something that exists.
    #
    # Applied HERE, in the shared helper, rather than by having the caller
    # omit the dates -- the page and the count are two separate requests, and
    # one of them forgetting is exactly how "1-25 of 0" happens. The bookings
    # list solved the same gap caller-side (Decision 152); this is the same
    # rule enforced where it cannot be got wrong.
    if search:
        date_from = date_to = None

    if date_from is not None and date_to is not None:
        in_range = and_(Invoice.issue_date >= date_from, Invoice.issue_date <= date_to)
        today = date.today()
        if date_from <= today <= date_to:
            # Decision 186: two kinds of invoice refuse to leave today's
            # list -- a Draft (money nobody has been sent) and one whose
            # booking has changed and nobody has looked (money that may be
            # wrong). Those are exactly the two the old separate "Needs
            # attention" panel existed to surface, so with them carried
            # forward the panel has nothing left to say that this list
            # doesn't. Same urgency source as everywhere else
            # (list_urgent_booking_ids), never a second computation.
            urgent_ids = list_urgent_booking_ids(db)
            needs_attention = and_(
                Invoice.status != "Void", Invoice.booking_id.in_(urgent_ids)
            ) if urgent_ids else False
            query = query.filter(
                or_(in_range, Invoice.status.in_(UNSENT_INVOICE_STATUSES), needs_attention)
                if urgent_ids
                else or_(in_range, Invoice.status.in_(UNSENT_INVOICE_STATUSES))
            )
        else:
            # A historical window must still answer "what was issued that
            # week", not have today's unsent backlog float into it.
            query = query.filter(in_range)
    if status:
        query = query.filter(Invoice.status == status)
    if agent_id is not None:
        query = query.filter(Invoice.agent_id == agent_id)
    if booking_id is not None:
        query = query.filter(Invoice.booking_id == booking_id)
    if search:
        # Decision 185: one box, both numbers. The screen used to carry a
        # separate "By booking number" search in its own section at the
        # bottom; a person looking for a booking's invoice should not have to
        # know which of two fields to type it into. Matched by subquery so
        # this stays one SQL statement -- the filter is shared with the count,
        # and a second round trip would be a second chance to disagree.
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(term),
                Invoice.booking_id.in_(
                    select(Booking.id).where(Booking.booking_number.ilike(term))
                ),
            )
        )
    return query


_INVOICE_SORTS = {
    "issue_date": Invoice.issue_date,
    "total": Invoice.total,
    "status": Invoice.status,
    "invoice_number": Invoice.invoice_number,
}


def list_invoices(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    agent_id: Optional[int] = None,
    booking_id: Optional[int] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
) -> list[Invoice]:
    """
    Decision 182: filtered, sorted and paginated on the SERVER. It used to
    be `db.query(Invoice).all()` in no order at all -- fine at 53 rows,
    not at the 100-bookings-a-day this admin panel is built for, and the
    unordered result meant "the newest invoice" had no defined position.

    Every argument defaults to the previous behaviour, so nothing that
    already called this changes.
    """
    query = _apply_invoice_filters(
        db, db.query(Invoice), status, agent_id, booking_id, search, date_from, date_to
    )
    column = _INVOICE_SORTS.get(sort_by or "", Invoice.created_at)
    query = query.order_by(column.asc() if (sort_dir or "desc") == "asc" else column.desc())
    return query.offset(skip).limit(limit).all()


def count_invoices(
    db: Session,
    status: Optional[str] = None,
    agent_id: Optional[int] = None,
    booking_id: Optional[int] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> int:
    """How many match, ignoring pagination -- from the same helper the page
    itself uses."""
    return _apply_invoice_filters(
        db, db.query(Invoice), status, agent_id, booking_id, search, date_from, date_to
    ).count()


def list_invoices_by_agent(db: Session, agent_id: int) -> list[Invoice]:
    return db.query(Invoice).filter(Invoice.agent_id == agent_id).all()


def list_invoices_by_agent_in_range(db: Session, agent_id: int, start_date: date, end_date: date) -> list[Invoice]:
    return db.query(Invoice).filter(
        Invoice.agent_id == agent_id,
        Invoice.issue_date >= start_date,
        Invoice.issue_date <= end_date,
    ).all()


def list_urgent_booking_ids(db: Session) -> list[int]:
    """Decision 108: the real source of truth for "needs review" --
    booking-rooted, not invoice-rooted, so it correctly covers bookings
    that have never had an invoice created (the common case). Direct
    structural port of the query this replaced (Decision 087/093's
    "compute from the notes' own timestamps every time, not a field
    that has to be remembered and cleared"), just re-anchored to
    booking_id via BookingReviewAcknowledgment instead of
    Invoice.flag_acknowledged_at."""
    rows = (
        db.query(InvoiceReviewNote.booking_id, func.max(InvoiceReviewNote.created_at).label("latest"))
        .group_by(InvoiceReviewNote.booking_id)
        .all()
    )
    acks = {
        a.booking_id: a.acknowledged_at
        for a in db.query(BookingReviewAcknowledgment).all()
    }
    return [
        booking_id
        for booking_id, latest in rows
        if booking_id not in acks or latest > acks[booking_id]
    ]


def list_urgent_invoices(db: Session) -> list[Invoice]:
    """Decision 087: the one 'list many at once, unscoped by agent'
    query that stays safe at real scale, by construction -- an invoice
    with an unacknowledged review note should be rare, not proportional
    to total invoice count. If it isn't rare, that's a real operational
    signal, not a reason to hide the list.

    Decision 108: rewritten as a thin wrapper over list_urgent_booking_ids
    (the new real source of truth) -- returns non-Void invoices whose
    booking_id is in that set. Preserves this function's exact existing
    response contract (used by Финансы→Счета's own "Требует внимания"
    panel) with zero frontend changes needed there; the underlying
    urgency signal is now identical to Бронирования's own panel, not a
    second parallel computation."""
    urgent_booking_ids = list_urgent_booking_ids(db)
    if not urgent_booking_ids:
        return []
    return db.query(Invoice).filter(
        Invoice.status != "Void",
        Invoice.booking_id.in_(urgent_booking_ids),
    ).all()


# ---------------------------------------------------------------------------
# InvoiceReviewNote -- append-only, no update/delete.
# ---------------------------------------------------------------------------

def create_review_note(db: Session, **fields) -> InvoiceReviewNote:
    """Decision 094: generic **fields (same convention as create_invoice/
    create_credit_note elsewhere in this file) instead of an exhaustive
    parameter list -- the caller now assembles a real structured price
    snapshot (old_total/old_offer_name/new_total/new_offer_name/dates),
    not just invoice_id/sequence_number/change_description."""
    row = InvoiceReviewNote(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_review_notes_by_invoice(db: Session, invoice_id: int) -> list[InvoiceReviewNote]:
    return (
        db.query(InvoiceReviewNote)
        .filter(InvoiceReviewNote.invoice_id == invoice_id)
        .order_by(InvoiceReviewNote.sequence_number)
        .all()
    )


def list_review_notes_by_invoice_ids(db: Session, invoice_ids: list[int]) -> dict[int, list[InvoiceReviewNote]]:
    """Bulk variant for list-returning service functions -- one query
    for however many invoices are already in the (already-bounded)
    result set, instead of N+1."""
    if not invoice_ids:
        return {}
    notes = (
        db.query(InvoiceReviewNote)
        .filter(InvoiceReviewNote.invoice_id.in_(invoice_ids))
        .order_by(InvoiceReviewNote.invoice_id, InvoiceReviewNote.sequence_number)
        .all()
    )
    grouped: dict[int, list[InvoiceReviewNote]] = {iid: [] for iid in invoice_ids}
    for note in notes:
        grouped[note.invoice_id].append(note)
    return grouped


def list_review_notes_by_booking(db: Session, booking_id: int) -> list[InvoiceReviewNote]:
    """Decision 108: booking-rooted equivalent of list_review_notes_by_invoice
    -- a booking's full numbered change history, independent of whether
    an invoice exists (or ever existed) for it."""
    return (
        db.query(InvoiceReviewNote)
        .filter(InvoiceReviewNote.booking_id == booking_id)
        .order_by(InvoiceReviewNote.sequence_number)
        .all()
    )


# ---------------------------------------------------------------------------
# InvoiceRoomLine (Stage 4) -- frozen at invoice creation, never updated.
# ---------------------------------------------------------------------------

def create_invoice_room_line(db: Session, **fields) -> InvoiceRoomLine:
    row = InvoiceRoomLine(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_invoice_room_lines(db: Session, invoice_id: int) -> None:
    """Decision 202: only ever called on an invoice that has not been sent
    to anyone (Draft), when the manager's hand-over re-freezes it."""
    db.query(InvoiceRoomLine).filter(InvoiceRoomLine.invoice_id == invoice_id).delete()
    db.commit()


def list_invoice_room_lines(db: Session, invoice_id: int) -> list[InvoiceRoomLine]:
    return (
        db.query(InvoiceRoomLine)
        .filter(InvoiceRoomLine.invoice_id == invoice_id)
        .order_by(InvoiceRoomLine.sequence_number)
        .all()
    )


def list_invoice_room_lines_bulk(db: Session, invoice_ids: list[int]) -> dict[int, list[InvoiceRoomLine]]:
    """Bulk variant for list-returning service functions, same shape as list_review_notes_by_invoice_ids."""
    if not invoice_ids:
        return {}
    lines = (
        db.query(InvoiceRoomLine)
        .filter(InvoiceRoomLine.invoice_id.in_(invoice_ids))
        .order_by(InvoiceRoomLine.invoice_id, InvoiceRoomLine.sequence_number)
        .all()
    )
    grouped: dict[int, list[InvoiceRoomLine]] = {iid: [] for iid in invoice_ids}
    for line in lines:
        grouped[line.invoice_id].append(line)
    return grouped


# ---------------------------------------------------------------------------
# BookingReviewAcknowledgment (Decision 108) -- one row per booking, upserted.
# ---------------------------------------------------------------------------

def get_booking_acknowledgment(db: Session, booking_id: int) -> Optional[BookingReviewAcknowledgment]:
    return db.query(BookingReviewAcknowledgment).filter(BookingReviewAcknowledgment.booking_id == booking_id).first()


def upsert_booking_acknowledgment(db: Session, booking_id: int, acknowledged_by: int) -> BookingReviewAcknowledgment:
    row = get_booking_acknowledgment(db, booking_id)
    if row is None:
        row = BookingReviewAcknowledgment(booking_id=booking_id, acknowledged_at=datetime.utcnow(), acknowledged_by=acknowledged_by)
        db.add(row)
    else:
        row.acknowledged_at = datetime.utcnow()
        row.acknowledged_by = acknowledged_by
    db.commit()
    db.refresh(row)
    return row


def create_invoice(db: Session, **fields) -> Invoice:
    row = Invoice(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_invoice(db: Session, invoice: Invoice, **fields) -> Invoice:
    for key, value in fields.items():
        setattr(invoice, key, value)
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_invoice(db: Session, invoice: Invoice) -> None:
    db.delete(invoice)
    db.commit()


# ---------------------------------------------------------------------------
# CreditNote
# ---------------------------------------------------------------------------

def get_credit_note(db: Session, credit_note_id: int) -> Optional[CreditNote]:
    return db.query(CreditNote).filter(CreditNote.id == credit_note_id).first()


def list_credit_notes_by_invoice(db: Session, invoice_id: int) -> list[CreditNote]:
    return db.query(CreditNote).filter(CreditNote.invoice_id == invoice_id).all()


def create_credit_note(db: Session, **fields) -> CreditNote:
    row = CreditNote(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_credit_note(db: Session, credit_note: CreditNote, **fields) -> CreditNote:
    for key, value in fields.items():
        setattr(credit_note, key, value)
    db.commit()
    db.refresh(credit_note)
    return credit_note


def delete_credit_note(db: Session, credit_note: CreditNote) -> None:
    db.delete(credit_note)
    db.commit()


# ---------------------------------------------------------------------------
# AgentStatement
# ---------------------------------------------------------------------------

def get_agent_statement(db: Session, statement_id: int) -> Optional[AgentStatement]:
    return db.query(AgentStatement).filter(AgentStatement.id == statement_id).first()


def list_agent_statements_by_agent(db: Session, agent_id: int) -> list[AgentStatement]:
    return db.query(AgentStatement).filter(AgentStatement.agent_id == agent_id).all()


def create_agent_statement(db: Session, **fields) -> AgentStatement:
    row = AgentStatement(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_agent_statement(db: Session, statement: AgentStatement, **fields) -> AgentStatement:
    for key, value in fields.items():
        setattr(statement, key, value)
    db.commit()
    db.refresh(statement)
    return statement


def delete_agent_statement(db: Session, statement: AgentStatement) -> None:
    db.delete(statement)
    db.commit()


# ---------------------------------------------------------------------------
# AgentStatementLine -- append-only child rows, no update/delete.
# ---------------------------------------------------------------------------

def list_statement_lines(db: Session, statement_id: int) -> list[AgentStatementLine]:
    return db.query(AgentStatementLine).filter(
        AgentStatementLine.statement_id == statement_id
    ).all()


def create_statement_line(db: Session, **fields) -> AgentStatementLine:
    row = AgentStatementLine(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# HotelCashbackArrangement
# ---------------------------------------------------------------------------

def get_cashback_arrangement(db: Session, arrangement_id: int) -> Optional[HotelCashbackArrangement]:
    return db.query(HotelCashbackArrangement).filter(
        HotelCashbackArrangement.id == arrangement_id
    ).first()


def list_cashback_arrangements_by_hotel(db: Session, hotel_id: int) -> list[HotelCashbackArrangement]:
    return db.query(HotelCashbackArrangement).filter(
        HotelCashbackArrangement.hotel_id == hotel_id
    ).all()


def create_cashback_arrangement(db: Session, **fields) -> HotelCashbackArrangement:
    row = HotelCashbackArrangement(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_cashback_arrangement(
    db: Session, arrangement: HotelCashbackArrangement, **fields
) -> HotelCashbackArrangement:
    for key, value in fields.items():
        setattr(arrangement, key, value)
    db.commit()
    db.refresh(arrangement)
    return arrangement


def delete_cashback_arrangement(db: Session, arrangement: HotelCashbackArrangement) -> None:
    db.delete(arrangement)
    db.commit()


# ---------------------------------------------------------------------------
# HotelCashbackFulfillment -- append-only log, no update/delete.
# ---------------------------------------------------------------------------

def list_cashback_fulfillments(db: Session, arrangement_id: int) -> list[HotelCashbackFulfillment]:
    return db.query(HotelCashbackFulfillment).filter(
        HotelCashbackFulfillment.arrangement_id == arrangement_id
    ).all()


def create_cashback_fulfillment(db: Session, **fields) -> HotelCashbackFulfillment:
    row = HotelCashbackFulfillment(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Voucher -- append-only (not "one per booking"), no update/delete.
# ---------------------------------------------------------------------------

def create_voucher(db: Session, **fields) -> Voucher:
    """Decision 097: voucher_number is sequential (VCH-000001), same
    flush-before-commit technique Decision 090 introduced for
    booking_number -- a throwaway placeholder satisfies the column's
    NOT NULL/UNIQUE constraints until the row's real id exists after
    flush, then gets overwritten with the real sequential number before
    commit. Not a UUID scheme that would just need fixing later, same
    reasoning Decision 090 already established project-wide."""
    fields["voucher_number"] = f"__pending-{uuid.uuid4().hex}"
    row = Voucher(**fields)
    db.add(row)
    db.flush()
    row.voucher_number = f"VCH-{row.id:06d}"
    db.commit()
    db.refresh(row)
    return row


def list_vouchers_by_booking(db: Session, booking_id: int) -> list[Voucher]:
    return db.query(Voucher).filter(Voucher.booking_id == booking_id).order_by(Voucher.created_at).all()


def list_vouchers_by_room(db: Session, booking_room_id: int) -> list[Voucher]:
    """Stage 4: same append-only list, scoped to one room within a multi-room application."""
    return db.query(Voucher).filter(Voucher.booking_room_id == booking_room_id).order_by(Voucher.created_at).all()


# ---------------------------------------------------------------------------
# BookingCommercialLine -- one row per (booking_room_id, category), upserted.
# ---------------------------------------------------------------------------

def list_commercial_lines(db: Session, booking_room_id: int) -> list[BookingCommercialLine]:
    return (
        db.query(BookingCommercialLine)
        .filter(BookingCommercialLine.booking_room_id == booking_room_id)
        .all()
    )


def list_commercial_lines_bulk(db: Session, booking_room_ids: list[int]) -> list[BookingCommercialLine]:
    """Bulk variant of list_commercial_lines for many rooms in one query --
    deliberately read-only (unlike GET /booking-rooms/{id}/commercial-lines,
    which auto-seeds on first call via get_or_seed_commercial_lines): a
    whole Bookings list rendering should never have the side effect of
    writing seed rows for every room nobody has actually opened yet."""
    if not booking_room_ids:
        return []
    return (
        db.query(BookingCommercialLine)
        .filter(BookingCommercialLine.booking_room_id.in_(booking_room_ids))
        .all()
    )


def get_commercial_line(db: Session, booking_room_id: int, category: str) -> Optional[BookingCommercialLine]:
    return (
        db.query(BookingCommercialLine)
        .filter(
            BookingCommercialLine.booking_room_id == booking_room_id,
            BookingCommercialLine.category == category,
        )
        .first()
    )


def create_commercial_line(db: Session, **fields) -> BookingCommercialLine:
    row = BookingCommercialLine(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_commercial_line(db: Session, line: BookingCommercialLine, **fields) -> BookingCommercialLine:
    for key, value in fields.items():
        setattr(line, key, value)
    db.commit()
    db.refresh(line)
    return line


# ---------------------------------------------------------------------------
# HotelPriceConfirmation (Decision 190) -- one row per room, upserted.
# ---------------------------------------------------------------------------

def get_hotel_confirmation(db: Session, booking_id: int):
    return (
        db.query(HotelPriceConfirmation)
        .filter(HotelPriceConfirmation.booking_id == booking_id)
        .first()
    )


def upsert_hotel_confirmation(
    db: Session,
    booking_id: int,
    confirmed_amount: float,
    currency: str,
    hotel_reference,
    note,
    confirmed_by: int,
) -> HotelPriceConfirmation:
    row = get_hotel_confirmation(db, booking_id)
    if row is None:
        row = HotelPriceConfirmation(booking_id=booking_id)
        db.add(row)
    row.confirmed_amount = confirmed_amount
    row.currency = currency
    row.hotel_reference = hotel_reference
    row.note = note
    row.confirmed_by = confirmed_by
    row.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
