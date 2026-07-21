from datetime import date, datetime
from typing import Optional
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.finance.models import (
    Invoice,
    InvoiceReviewNote,
    BookingReviewAcknowledgment,
    CreditNote,
    AgentStatement,
    AgentStatementLine,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
    Voucher,
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

def get_invoice(db: Session, invoice_id: int) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.id == invoice_id).first()


def get_invoice_by_booking(db: Session, booking_id: int) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.booking_id == booking_id).first()


def list_invoices(db: Session) -> list[Invoice]:
    return db.query(Invoice).all()


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
