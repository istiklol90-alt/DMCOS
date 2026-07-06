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
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    created_by: Optional[int] = None


class BookingUpdate(BaseModel):
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    status: Optional[BookingUpdatableStatus] = None


class BookingCancelRequest(BaseModel):
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
    arrival_date: date
    departure_date: date
    nights: int
    adults: int
    children: int
    infants: int
    status: str
    currency: str
    total_amount: float
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_fee: Optional[float] = None
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
