from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# Commission tiers / agent settings -------------------------------------------

class CommissionTierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    rate_percent: float
    is_default: bool = False


class CommissionTierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rate_percent: Optional[float] = None
    is_default: Optional[bool] = None
    active: Optional[bool] = None


class CommissionTierResponse(BaseModel):
    id: int
    name: str
    rate_percent: float
    is_default: bool
    active: bool

    class Config:
        from_attributes = True


class AgentSettingsUpdate(BaseModel):
    tier_id: Optional[int] = None
    # Sent as null = back to the rate for all agents; omitted = unchanged.
    rate_percent: Optional[float] = None
    one_way_flights_allowed: Optional[bool] = None


class DefaultCommission(BaseModel):
    rate_percent: float


class AgentSettingsResponse(BaseModel):
    user_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    tier_id: Optional[int] = None
    tier_name: Optional[str] = None
    rate_percent: float
    one_way_flights_allowed: bool
    # True when this agent has their own rate (not the rate for all agents).
    own_rate: bool = False


class MyPackageSettings(BaseModel):
    rate_percent: float
    one_way_flights_allowed: bool


# Add-ons ----------------------------------------------------------------------

class AddOnCreate(BaseModel):
    kind: str
    name: str = Field(..., min_length=1, max_length=200)
    supplier: Optional[str] = None
    description: Optional[str] = None
    destination_country: Optional[str] = None
    basis: str = "per_person"
    currency: str
    cost: float
    price: float
    active: bool = True
    reason: Optional[str] = None


class AddOnUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    supplier: Optional[str] = None
    description: Optional[str] = None
    destination_country: Optional[str] = None
    basis: Optional[str] = None
    currency: Optional[str] = None
    cost: Optional[float] = None
    price: Optional[float] = None
    active: Optional[bool] = None
    reason: Optional[str] = None


class AddOnStaffResponse(BaseModel):
    id: int
    kind: str
    name: str
    supplier: Optional[str] = None
    description: Optional[str] = None
    destination_country: Optional[str] = None
    basis: str
    currency: str
    cost: float
    price: float
    active: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AddOnAgentResponse(BaseModel):
    """What an agent sees of an add-on: its price to them, never our cost."""

    id: int
    kind: str
    name: str
    description: Optional[str] = None
    basis: str
    currency: str
    price: float

    class Config:
        from_attributes = True


class PriceChangeResponse(BaseModel):
    id: int
    old_cost: Optional[float] = None
    new_cost: Optional[float] = None
    old_price: Optional[float] = None
    new_price: Optional[float] = None
    reason: Optional[str] = None
    changed_by: int
    changed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Cancellation rules -------------------------------------------------------------

class CancellationRuleCreate(BaseModel):
    component_type: str
    days_before: int
    penalty_percent: float
    note: Optional[str] = None


class CancellationRuleUpdate(BaseModel):
    component_type: Optional[str] = None
    days_before: Optional[int] = None
    penalty_percent: Optional[float] = None
    note: Optional[str] = None


class CancellationRuleResponse(BaseModel):
    id: int
    component_type: str
    days_before: int
    penalty_percent: float
    note: Optional[str] = None

    class Config:
        from_attributes = True


# Quotes / booking -----------------------------------------------------------------

class QuoteRequest(BaseModel):
    hotel_id: int
    room_type_id: int
    meal_plan: str = Field(..., min_length=1, max_length=20)
    check_in: date
    check_out: date
    adults: int = Field(..., ge=1)
    children: int = Field(0, ge=0)
    infants: int = Field(0, ge=0)
    transfer_type: Optional[str] = None
    add_on_ids: list[int] = Field(default_factory=list)
    agent_id: Optional[int] = None  # staff only; an agent always quotes for themselves


class QuoteComponent(BaseModel):
    type: str
    label: str
    net: float
    gross: float
    quantity: Optional[float] = None
    cost: Optional[float] = None  # staff view only


class QuoteResponse(BaseModel):
    quote_id: int
    hotel_id: int
    currency: str
    check_in: date
    check_out: date
    party: dict
    gross_total: float
    net_total: float
    agent_profit: float
    commission_rate: float
    components: list[QuoteComponent]
    status: str
    expires_at: datetime
    cost_total: Optional[float] = None  # staff view only
    our_profit: Optional[float] = None  # staff view only


class BookPackageRequest(BaseModel):
    guests: list[dict] = Field(default_factory=list)
    special_requests: Optional[str] = None
    arrival_flight_number: Optional[str] = None
    departure_flight_number: Optional[str] = None
    arrival_flight_date: Optional[date] = None
    arrival_flight_time: Optional[str] = None
    departure_flight_date: Optional[date] = None
    departure_flight_time: Optional[str] = None


class BookPackageResponse(BaseModel):
    booking_id: int
    booking_number: str


class BookingPackageLineResponse(BaseModel):
    component_type: str
    description: str
    quantity: float
    net_total: float
    cost_total: Optional[float] = None


class BookingPackageResponse(BaseModel):
    booking_id: int
    currency: str
    gross_total: float
    net_total: float
    agent_profit: float
    commission_rate: float
    lines: list[BookingPackageLineResponse]
    cost_total: Optional[float] = None
