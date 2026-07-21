from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

class InvoiceReviewNoteResponse(BaseModel):
    id: int
    sequence_number: int
    change_description: Optional[str] = None
    old_arrival_date: Optional[date] = None
    old_departure_date: Optional[date] = None
    old_total: Optional[float] = None
    old_offer_name: Optional[str] = None
    new_arrival_date: Optional[date] = None
    new_departure_date: Optional[date] = None
    new_total: Optional[float] = None
    new_offer_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


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
    email_sent_at: Optional[datetime] = None
    review_notes: List[InvoiceReviewNoteResponse] = []
    flag_acknowledged_at: Optional[datetime] = None
    flag_acknowledged_by: Optional[int] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    voided_by: Optional[int] = None
    voided_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FlagForReviewRequest(BaseModel):
    """Decision 094: dropped the free-text `reason` -- a permanent
    financial audit record shouldn't be built from client-supplied
    prose. old_arrival_date/old_departure_date are the only real input
    needed (the new dates are already on the booking row by the time
    this call runs, read directly from there); the service layer
    recomputes the actual price breakdown for both sides itself."""
    old_arrival_date: date
    old_departure_date: date


class UrgentBookingResponse(BaseModel):
    """Decision 108: Бронирования's own "Требует внимания" panel --
    not a real ORM model (a computed cross-engine summary), same
    'plain dict validated structurally' shape service.list_urgent_bookings
    returns."""
    booking_id: int
    booking_number: str
    latest_change_description: Optional[str] = None
    latest_note_at: Optional[datetime] = None


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


# ---------------------------------------------------------------------------
# Voucher -- Decision 097. Deliberately no pricing/discount/commission
# fields anywhere in this schema -- the guest-facing document, not
# Invoice's financial one.
# ---------------------------------------------------------------------------

class VoucherResponse(BaseModel):
    id: int
    voucher_number: str
    booking_id: int
    agent_id: int
    hotel_id: int
    confirmation_number: str
    hotel_name: str
    arrival_date: date
    departure_date: date
    room_type_name: str
    meal_plan_label: Optional[str] = None
    guest_names: Optional[str] = None
    adults: int
    children: int
    infants: int
    created_by: int
    created_at: Optional[datetime] = None
    email_sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HotelCashbackFulfillmentCreate(BaseModel):
    fulfillment_date: date
    amount: float
    cumulative_sales_volume_at_time: Optional[float] = None
    notes: Optional[str] = None
