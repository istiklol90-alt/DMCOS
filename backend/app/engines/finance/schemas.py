from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    booking_id: int
    agent_id: int
    hotel_id: int
    issue_date: date
    currency: str
    subtotal: float
    discount: Optional[float] = None
    commission: Optional[float] = None
    tax: Optional[float] = None
    total: float
    status: str
    created_by: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# CreditNote
# ---------------------------------------------------------------------------

class CreditNoteResponse(BaseModel):
    id: int
    credit_note_number: str
    invoice_id: int
    amount: float
    currency: str
    reason: str
    issue_date: date
    status: str
    created_by: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CreditNoteCreate(BaseModel):
    amount: float
    reason: str


# ---------------------------------------------------------------------------
# AgentStatement
# ---------------------------------------------------------------------------

class AgentStatementResponse(BaseModel):
    id: int
    statement_number: str
    agent_id: int
    period_start: date
    period_end: date
    currency: str
    total_net: float
    total_sale: float
    total_profit: float
    status: str
    generated_by: int
    generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AgentStatementCreate(BaseModel):
    agent_id: int
    period_start: date
    period_end: date
    currency: str


class AgentStatementLineResponse(BaseModel):
    id: int
    statement_id: int
    booking_id: int
    invoice_id: Optional[int] = None
    net_amount: float
    sale_amount: float
    profit_amount: Optional[float] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# HotelCashbackArrangement / HotelCashbackFulfillment -- Decision 009
# ---------------------------------------------------------------------------

class HotelCashbackArrangementResponse(BaseModel):
    id: int
    hotel_id: int
    terms: str
    rebate_percentage: Optional[float] = None
    volume_threshold: Optional[float] = None
    currency: str
    start_date: date
    end_date: Optional[date] = None
    status: str
    created_by: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HotelCashbackArrangementCreate(BaseModel):
    terms: str
    currency: str
    start_date: date
    rebate_percentage: Optional[float] = None
    volume_threshold: Optional[float] = None
    end_date: Optional[date] = None


class HotelCashbackArrangementStatusUpdate(BaseModel):
    status: str


class HotelCashbackFulfillmentResponse(BaseModel):
    id: int
    arrangement_id: int
    fulfillment_date: date
    amount: float
    cumulative_sales_volume_at_time: Optional[float] = None
    notes: Optional[str] = None
    recorded_by: int
    recorded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HotelCashbackFulfillmentCreate(BaseModel):
    fulfillment_date: date
    amount: float
    cumulative_sales_volume_at_time: Optional[float] = None
    notes: Optional[str] = None
