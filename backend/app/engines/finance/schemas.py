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


class InvoiceRoomLineResponse(BaseModel):
    """Stage 4 (multi-room booking applications): one FROZEN line item
    per billable room in the application, snapshotted once at invoice
    creation time (service.create_invoice_for_booking) into the
    InvoiceRoomLine table -- the project owner's explicit "room 1: names
    + sum, room 2: names + sum, grand total" requirement. Never
    recomputed live from BookingRoom's current data (an earlier version
    did, and a real bug was caught in verification -- see
    InvoiceRoomLine's own model docstring). Invoice's own subtotal/
    discount/commission/tax/total columns remain the grand-total
    aggregate, unchanged in shape. booking_room_id is None only for a
    legacy booking with zero BookingRoom rows at all (created via the
    original single-room create_booking, predates this feature)."""
    booking_room_id: Optional[int] = None
    sequence_number: int
    guest_names: Optional[str] = None
    currency: str
    room_net: float
    room_sale: float
    transfer_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    discount_amount: Optional[float] = None
    commission_amount: Optional[float] = None
    subtotal: float
    net_total: float
    sale_total: float
    profit: Optional[float] = None

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
    # Decision 182: resolved for display, never stored -- the list showed
    # "#29" and "#2" where a booking number and a hotel name belong.
    booking_number: Optional[str] = None
    hotel_name: Optional[str] = None
    agent_name: Optional[str] = None
    # Decision 182: what the booking costs now, so the list can tell a real
    # money difference from a booking that merely changed.
    booking_total_now: Optional[float] = None
    booking_status: Optional[str] = None
    review_notes: List[InvoiceReviewNoteResponse] = []
    room_breakdown: List[InvoiceRoomLineResponse] = []
    flag_acknowledged_at: Optional[datetime] = None
    flag_acknowledged_by: Optional[int] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    voided_by: Optional[int] = None
    voided_at: Optional[datetime] = None
    # Decision 202
    submitted_for_posting_by: Optional[int] = None
    submitted_for_posting_at: Optional[datetime] = None
    returned_by: Optional[int] = None
    returned_at: Optional[datetime] = None
    return_note: Optional[str] = None

    class Config:
        from_attributes = True


class ReturnInvoiceRequest(BaseModel):
    """Decision 202: accounting hands a Ready-for-posting invoice back to
    reservations. The note is required -- a return without a reason leaves
    the manager guessing what to fix."""
    note: str


class FlagForReviewRequest(BaseModel):
    """Decision 094: dropped the free-text `reason` -- a permanent
    financial audit record shouldn't be built from client-supplied
    prose. old_arrival_date/old_departure_date are the only real input
    needed (the new dates are already on the booking row by the time
    this call runs, read directly from there); the service layer
    recomputes the actual price breakdown for both sides itself."""
    old_arrival_date: date
    old_departure_date: date


class BookingListFinancialsResponse(BaseModel):
    """Bulk, list-level Net/Sale/Profit -- not a real ORM model (a computed
    cross-engine aggregate), same 'plain dict validated structurally'
    shape as UrgentBookingResponse below. See
    service.compute_bookings_list_financials's own docstring for why this
    exists: the Bookings list needs to know about a room's manual
    commercial-line correction, the same live figure BookingDetail's
    header already reflects, instead of silently staying on the frozen
    Pricing-Engine snapshot."""
    booking_id: int
    currency: str
    net_total: float
    sale_total: float
    profit: Optional[float] = None
    has_manual_adjustment: bool


class CommercialSummaryLineResponse(BaseModel):
    """One category's effective cost/price for one room -- base plus any
    manual adjustment, already summed. `adjusted` says a manager has
    touched this line, so the figure is no longer purely system-computed."""
    category: str
    cost: float
    price: float
    adjusted: bool


class CommercialSummaryRoomResponse(BaseModel):
    booking_room_id: int
    sequence_number: int
    room_type_id: int
    status: str
    billable: bool
    lines: list[CommercialSummaryLineResponse]
    net_total: float
    sale_total: float


class BookingCommercialSummaryResponse(BaseModel):
    """Read-only whole-application money summary -- see
    service.get_booking_commercial_summary. `sale_total` is the figure the
    agent actually booked at (room + transfer + tax, across every billable
    room), which is NOT what BookingRoom.total_amount alone shows."""
    booking_id: int
    currency: str
    rooms: list[CommercialSummaryRoomResponse]
    net_total: float
    sale_total: float
    has_manual_adjustment: bool
    # Decision 202: the agent price the commercial breakdown now says,
    # manual price corrections included. Equal to sale_total until someone
    # corrects a price; it reaches the agent only on a posted invoice.
    ledger_sale_total: Optional[float] = None
    # Decision 191: ONE hotel confirmation for the whole application.
    hotel_confirmed_amount: Optional[float] = None
    hotel_reference: Optional[str] = None
    hotel_note: Optional[str] = None
    hotel_confirmed_by: Optional[int] = None
    hotel_confirmed_at: Optional[datetime] = None
    hotel_difference: Optional[float] = None
    billable_rooms: int = 0


class PriceBreakdownLineResponse(BaseModel):
    """Agent-facing. Price only -- there is deliberately no cost, margin or
    adjustment field on this model, so none can be sent by accident."""
    category: str
    price: float


class PriceBreakdownRoomResponse(BaseModel):
    booking_room_id: int
    sequence_number: int
    room_type_id: int
    status: str
    billable: bool
    lines: list[PriceBreakdownLineResponse]
    total: float


class BookingPriceBreakdownResponse(BaseModel):
    """Decision 181: what the agent sees -- her own price, per room and per
    category, exactly as quoted at booking. See
    service.get_booking_price_breakdown."""
    booking_id: int
    currency: str
    rooms: list[PriceBreakdownRoomResponse]
    total: float


class HotelPriceConfirmationUpsert(BaseModel):
    """Decision 190: what the hotel says one room costs us."""
    confirmed_amount: float
    hotel_reference: Optional[str] = None
    note: Optional[str] = None


class UrgentBookingResponse(BaseModel):
    """Decision 108: Бронирования's own "Требует внимания" panel --
    not a real ORM model (a computed cross-engine summary), same
    'plain dict validated structurally' shape service.list_urgent_bookings
    returns.

    Decision 112: latest_change_description/latest_note_at (raw, flattened
    strings) replaced with the full latest_note object (reusing
    InvoiceReviewNoteResponse) plus currency -- so the frontend can run the
    exact same formatSingleNote() logic InvoiceDetailModal already uses,
    instead of displaying change_description raw. Two different display
    paths reading the same underlying data were exactly the kind of drift
    this project avoids everywhere else; this makes them structurally the
    same code, not just visually consistent by coincidence."""
    booking_id: int
    booking_number: str
    currency: str
    latest_note: Optional[InvoiceReviewNoteResponse] = None
    # Decision 204: why a booking is in the queue. review_pending = the
    # booking changed and nobody has marked it reviewed (the original
    # reason; latest_note is only filled then). invoice_returned_* = its
    # invoice is back with reservations, with accounting's note.
    review_pending: bool = True
    invoice_returned_note: Optional[str] = None
    invoice_returned_at: Optional[datetime] = None
    # Decision 205: the booking's manager, so the queue can be narrowed to
    # one manager's own bookings.
    claimed_by: Optional[int] = None


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
    # Stage 4: which room within the application, when applicable -- None
    # for a voucher generated the original way (booking with no
    # BookingRoom rows at all).
    booking_room_id: Optional[int] = None
    agent_id: int
    hotel_id: int
    # Decision 166: None when the voucher was sent at approval time, before
    # the hotel replied. The response model was `str` and returned a 500 on
    # the very first such voucher -- the row was written and the caller saw
    # a server error, which is exactly why the send is best-effort on the
    # frontend and the approval was still correct.
    confirmation_number: Optional[str] = None
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


# ---------------------------------------------------------------------------
# BookingCommercialLine -- per-room, per-category cost/price ledger with a
# manual adjustment mechanism. See the model's own docstring for the full
# rationale.
# ---------------------------------------------------------------------------

class BookingCommercialLineResponse(BaseModel):
    id: int
    booking_room_id: int
    category: str
    base_cost: Optional[float] = None
    base_price: Optional[float] = None
    adjustment_cost: float
    adjustment_price: float
    adjustment_note: Optional[str] = None
    adjusted_by: Optional[int] = None
    adjusted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BookingCommercialLineUpsert(BaseModel):
    """All fields optional -- an upsert PUT only changes what it's
    given, same convention as service.upsert_commercial_line. A caller
    recording a discount only needs to send adjustment_cost/
    adjustment_price/note, not re-send the base figures."""
    base_cost: Optional[float] = None
    base_price: Optional[float] = None
    adjustment_cost: Optional[float] = None
    adjustment_price: Optional[float] = None
    note: Optional[str] = None
