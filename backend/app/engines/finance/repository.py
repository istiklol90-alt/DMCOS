from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.finance.models import (
    Invoice,
    CreditNote,
    AgentStatement,
    AgentStatementLine,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
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


def list_urgent_invoices(db: Session) -> list[Invoice]:
    """Decision 087: the one 'list many at once, unscoped by agent'
    query that stays safe at real scale, by construction -- a Draft
    invoice with an unacknowledged review_flag should be rare, not
    proportional to total invoice count. If it isn't rare, that's a
    real operational signal, not a reason to hide the list."""
    return db.query(Invoice).filter(
        Invoice.review_flag.isnot(None),
        Invoice.flag_acknowledged_at.is_(None),
        Invoice.status != "Void",
    ).all()


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
