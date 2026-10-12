from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date


# 02_Logic_Rules.md #18 "Currency Rules" — same documented set Contract
# Engine uses. Redefined locally rather than imported, to keep schemas.py
# decoupled from Contract Engine's schemas (same reasoning Contract Engine
# used for not importing Hotel Engine's schemas — only service.py crosses
# Engine boundaries, per the Interface Contract).
Currency = Literal["USD", "EUR", "GBP", "AED", "RUB", "KZT", "UZS", "TJS"]

# 03_Domain_Model.md #39 / 02_Logic_Rules.md #47 "Booking Status" — the
# documented set plus "Cancellation Requested" (Decision 104's two-stage
# cancellation intermediate), used for BookingResponse.
BookingStatus = Literal[
    "Draft", "Pending", "Waiting Hotel", "Confirmed", "Partially Confirmed",
    "Cancellation Requested", "Cancelled", "Rejected", "Completed",
]

# Same set minus "Cancellation Requested" and "Cancelled" — used only in
# BookingUpdate, so a status change can never smuggle a cancellation past
# the dedicated BookingCancelRequest/ConfirmCancellationRequest flows
# (which require a reason/confirmation number and trigger allotment
# side effects a generic field edit shouldn't be able to cause).
BookingUpdatableStatus = Literal[
    "Draft", "Pending", "Waiting Hotel", "Confirmed", "Partially Confirmed",
    "Rejected", "Completed",
]


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------
# contract_id/rate_id/meal_plan_id/currency/total_amount are deliberately
# absent from BookingCreate — they're resolved server-side in service.py
# via Contract Engine's get_active_contract/get_room_price, never accepted
# as caller input. A client should never be able to set its own price.


class BookingCreate(BaseModel):
    agent_id: int
    hotel_id: int
    room_type_id: int
    meal_plan: str = Field(..., min_length=2, max_length=20)
    arrival_date: date
    departure_date: date
    adults: int = Field(..., ge=1)
    children: int = Field(0, ge=0)
    infants: int = Field(0, ge=0)
    market_id: Optional[int] = None
    # ContractTransferOption.transfer_type the agent selected. Required by
    # create_booking only if the hotel's active contract has
    # transfer_required=true; otherwise an optional add-on, priced the same
    # way if given.
    transfer_type: Optional[str] = None
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    created_by: Optional[int] = None


class BookingUpdate(BaseModel):
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = Field(None, max_length=5)
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = Field(None, max_length=5)
    status: Optional[BookingUpdatableStatus] = None
    confirmation_number: Optional[str] = None


class BookingCancelRequest(BaseModel):
    reason: str = Field(..., min_length=2)


class ConfirmCancellationRequest(BaseModel):
    """Decision 104: stage 2 of the two-step cancellation workflow — the
    hotel's own acknowledgment reference, same shape as confirmation_number
    but mandatory here (there's no valid "Cancelled" state without it)."""
    cancellation_confirmation_number: str = Field(..., min_length=1)


class BookingDateChangeRequest(BaseModel):
    new_arrival_date: date
    new_departure_date: date
    reason: str = Field(..., min_length=2)


class RoomTransferChangeRequest(BaseModel):
    """
    Decision 199. `new_transfer_type` is deliberately Optional with no
    default: None is a real, meaningful value ("no transfer — the guests
    make their own way", Decision 196), so it must be sendable explicitly,
    while omitting the field entirely is a malformed request rather than a
    silent removal of the transfer.

    A reason is required, same as a date change: a change made months after
    booking, which moves money, needs to say why. Whoever reads the audit
    trail later is usually not the person who made it.
    """

    new_transfer_type: Optional[str] = Field(...)
    reason: str = Field(..., min_length=2)


class BookingResponse(BaseModel):
    id: int
    booking_number: str
    agent_id: int
    hotel_id: int
    contract_id: int
    rate_id: int
    room_type_id: int
    meal_plan_id: int
    market_id: Optional[int] = None
    applied_special_offer_id: Optional[int] = None
    arrival_date: date
    departure_date: date
    nights: int
    adults: int
    children: int
    infants: int
    status: str
    currency: str
    total_amount: float
    agent_markup_amount: Optional[float] = None
    agent_exclusive_discount_amount: Optional[float] = None
    transfer_type: Optional[str] = None
    transfer_total: Optional[float] = None
    mandatory_tax_total: Optional[float] = None
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = None
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_fee: Optional[float] = None
    cancelled_by: Optional[int] = None
    cancellation_confirmation_number: Optional[str] = None
    cancellation_confirmed_at: Optional[datetime] = None
    cancellation_confirmed_by: Optional[int] = None
    date_change_reason: Optional[str] = None
    dates_changed_at: Optional[datetime] = None
    claimed_by: Optional[int] = None
    claimed_at: Optional[datetime] = None
    confirmation_number: Optional[str] = None
    # Decision 155: who entered the hotel's confirmation number, and when.
    confirmation_number_by: Optional[int] = None
    confirmation_number_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    # Decision 178: the whole application's price -- every billable room's
    # room + transfer + tax. `total_amount` above is the REPRESENTATIVE
    # first room only, so a list rendering it as "the price" understated
    # every multi-room booking: BK-000080 showed 1964.50 for a booking the
    # agent pays 6700.50 on. Attached by the list/get endpoints; None only
    # for a legacy application with no BookingRoom rows, where the caller
    # falls back to the frozen columns exactly as before.
    application_total: Optional[float] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


class GuestFlightFields(BaseModel):
    """
    Decision 150: one guest's OWN flight, when it differs from the rest of
    the party's. All six are optional everywhere and NULL means "this guest
    is on the application's flight" (Booking.arrival_flight_* etc.), NOT
    "unknown" — see Guest's model docstring for why that NULL-or-value
    shape is the whole mechanism and no separate mode flag exists.

    Shared by every guest schema below so the four of them cannot drift
    apart field-by-field, which is exactly how Booking's own flight fields
    ended up spelled out four separate times in this file.
    """

    arrival_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = Field(None, max_length=5)
    departure_flight_number: Optional[str] = None
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = Field(None, max_length=5)


class GuestCreate(GuestFlightFields):
    booking_id: int
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    special_requests: Optional[str] = None
    is_lead_guest: bool = False


class GuestUpdate(GuestFlightFields):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    special_requests: Optional[str] = None
    is_lead_guest: Optional[bool] = None


class GuestResponse(GuestFlightFields):
    id: int
    booking_id: int
    first_name: str
    last_name: str
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    special_requests: Optional[str] = None
    is_lead_guest: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Multi-room booking application (Stage 2)
# ---------------------------------------------------------------------------
# One application ("заявка") = one trip for one fixed set of guests, which
# may span 1 or several rooms/hotels -- confirmed directly with the project
# owner: same guests throughout (a different guest set is a new, separate
# application), all rooms in the same destination/country (may be
# different hotels, e.g. Kandima Maldives -> Siyam World Maldives as one
# trip, never Maldives + UAE in one application). Each room is priced/
# allotment-checked independently via the exact same Contract Engine calls
# create_booking already uses -- a room with no availability is recorded
# as "Rejected" rather than aborting the whole application (partial
# fulfillment, per the project owner's explicit instruction).

# BookingRoom.status -- deliberately reuses Booking's own status
# vocabulary (see models.py's BookingRoom docstring), not a new enum.
BookingRoomStatus = Literal[
    "Pending", "Confirmed", "Rejected", "Cancellation Requested", "Cancelled",
]


class BookingApplicationGuestCreate(GuestFlightFields):
    """One real traveler on this application's trip -- entered once, then
    assigned to whichever room(s) they occupy via
    BookingApplicationRoomCreate.guest_indices.

    Decision 150: inherits the six optional per-guest flight fields. Left
    unset (the normal case) the guest simply travels on the application's
    own flight -- the application-level arrival_flight_* fields on
    BookingApplicationCreate are unchanged and still the default for
    everyone."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    special_requests: Optional[str] = None
    is_lead_guest: bool = False


class BookingApplicationRoomCreate(BaseModel):
    """One room/leg within the application -- own hotel, own dates, own
    transfer, same shape as BookingCreate's per-room fields, minus
    agent_id (that's the application's, not per-room)."""

    hotel_id: int
    room_type_id: int
    meal_plan: str = Field(..., min_length=2, max_length=20)
    arrival_date: date
    departure_date: date
    adults: int = Field(..., ge=1)
    children: int = Field(0, ge=0)
    infants: int = Field(0, ge=0)
    market_id: Optional[int] = None
    transfer_type: Optional[str] = None
    special_requests: Optional[str] = None
    # Indices into BookingApplicationCreate.guests -- which of the
    # application's guests occupy this specific room.
    guest_indices: list[int] = Field(default_factory=list)


class BookingApplicationCreate(BaseModel):
    agent_id: int
    rooms: list[BookingApplicationRoomCreate] = Field(..., min_length=1)
    guests: list[BookingApplicationGuestCreate] = Field(default_factory=list)
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = Field(None, max_length=5)
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = Field(None, max_length=5)
    created_by: Optional[int] = None


class BookingRoomApproveRequest(BaseModel):
    """Manager's explicit sign-off (system never auto-confirms) that a
    Pending room -- allotment already secured -- is approved. No reason
    needed; approval is the default expected path."""
    pass


class BookingRoomRejectRequest(BaseModel):
    """Manager declining a Pending room's approve request. Distinct from
    an automatic no-allotment rejection (rejected_by stays NULL for that
    case) -- a manager's own reject always requires a reason, same
    "never a bare reject with no explanation" principle as every other
    reason-required action in this project (e.g. BookingCancelRequest)."""
    reason: str = Field(..., min_length=2)


class BookingRoomUpdate(BaseModel):
    """Stage 4: editable fields on one room within an application --
    confirmation_number is the hotel's own per-room reference (Decision
    097's shape, now scoped to a room instead of a whole booking), the
    trigger Finance Engine's per-room Voucher generation orchestrates off
    of (frontend-only, no coupling here, same pattern as Booking's own
    confirmation_number)."""
    confirmation_number: Optional[str] = None
    special_requests: Optional[str] = None


class BookingRoomResponse(BaseModel):
    id: int
    booking_id: int
    sequence_number: int
    hotel_id: int
    contract_id: int
    rate_id: Optional[int] = None
    room_type_id: int
    meal_plan_id: Optional[int] = None
    market_id: Optional[int] = None
    applied_special_offer_id: Optional[int] = None
    arrival_date: date
    departure_date: date
    nights: int
    adults: int
    children: int
    infants: int
    status: str
    rejection_reason: Optional[str] = None
    rejected_by: Optional[int] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    currency: Optional[str] = None
    total_amount: Optional[float] = None
    agent_markup_amount: Optional[float] = None
    agent_exclusive_discount_amount: Optional[float] = None
    transfer_type: Optional[str] = None
    transfer_total: Optional[float] = None
    mandatory_tax_total: Optional[float] = None
    special_requests: Optional[str] = None
    confirmation_number: Optional[str] = None
    date_change_reason: Optional[str] = None
    dates_changed_at: Optional[datetime] = None
    # Decision 199: who changed this room's transfer, when, and why — so the
    # booking detail can show it, rather than the change being visible only
    # inside the finance audit trail.
    transfer_change_reason: Optional[str] = None
    transfer_changed_at: Optional[datetime] = None
    transfer_changed_by: Optional[int] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_fee: Optional[float] = None
    cancelled_by: Optional[int] = None
    cancellation_confirmation_number: Optional[str] = None
    cancellation_confirmed_at: Optional[datetime] = None
    cancellation_confirmed_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingApplicationResponse(BaseModel):
    """Booking (the application) plus its rooms and guests, assembled by
    service.py -- not a raw ORM passthrough like BookingResponse, since
    Booking itself has no relationship() to either (this project never
    uses SQLAlchemy relationships, per every other Engine's own
    precedent)."""

    id: int
    booking_number: str
    agent_id: int
    status: str
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = None
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = None
    claimed_by: Optional[int] = None
    claimed_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[int] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    rooms: list[BookingRoomResponse]
    guests: list[GuestResponse]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Booking Correspondence (Decision 049)
# ---------------------------------------------------------------------------
# created_by is never accepted from the client -- resolved from
# current_user.id in api.py, same reasoning every other identity field in
# this project follows (a client should never be able to claim an action
# was taken by someone else).


class BookingCorrespondenceSendRequest(BaseModel):
    subject: Optional[str] = Field(None, max_length=300)
    body: str = Field(..., min_length=1)
    # Decision 050: not required -- this is still record-only (no real
    # sending happens), so an empty "To" isn't a hard error, matching
    # Hotel.email currently being unpopulated for every real hotel.
    recipient_email: Optional[str] = Field(None, max_length=255)
    recipient_email_secondary: Optional[str] = Field(None, max_length=255)


class BookingCorrespondenceReplyRequest(BaseModel):
    subject: Optional[str] = Field(None, max_length=300)
    body: str = Field(..., min_length=1)


class BookingCorrespondenceResponse(BaseModel):
    id: int
    booking_id: int
    direction: str
    subject: Optional[str] = None
    body: str
    status: str
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    recipient_email: Optional[str] = None
    recipient_email_secondary: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    # Decision 154: True = SMTP accepted it, False = recorded only (no SMTP
    # configured, or the send failed), None = predates the column. Distinct
    # from `status`, which tracks the conversation, not delivery.
    delivered: Optional[bool] = None

    class Config:
        from_attributes = True
