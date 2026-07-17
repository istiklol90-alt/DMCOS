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
# full 8-value set, used for BookingResponse.
BookingStatus = Literal[
    "Draft", "Pending", "Waiting Hotel", "Confirmed", "Partially Confirmed",
    "Cancelled", "Rejected", "Completed",
]

# Same set minus "Cancelled" — used only in BookingUpdate, so a status
# change can never smuggle a cancellation past the dedicated
# BookingCancelRequest flow (which requires a reason and triggers
# release_allotment as a side effect a generic field edit shouldn't).
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


class BookingCancelRequest(BaseModel):
    reason: str = Field(..., min_length=2)


class BookingDateChangeRequest(BaseModel):
    new_arrival_date: date
    new_departure_date: date
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
    date_change_reason: Optional[str] = None
    dates_changed_at: Optional[datetime] = None
    claimed_by: Optional[int] = None
    claimed_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


class GuestCreate(BaseModel):
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


class GuestUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[date] = None
    special_requests: Optional[str] = None
    is_lead_guest: Optional[bool] = None


class GuestResponse(BaseModel):
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

    class Config:
        from_attributes = True
