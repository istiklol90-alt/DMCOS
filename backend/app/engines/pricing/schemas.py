from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class PricingSettingsResponse(BaseModel):
    id: int
    standard_markup_amount_per_night: float
    currency: str
    updated_by: Optional[int] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PricingSettingsUpdate(BaseModel):
    standard_markup_amount_per_night: float
    # Decision 193: which currency's markup this sets. Defaults to USD so
    # the existing caller keeps working unchanged.
    currency: str = "USD"


class AgentSummary(BaseModel):
    """Real agent identity, joined from Authentication Engine's User
    table directly -- Pricing Engine has no user data of its own."""
    user_id: int
    name: str
    email: str


class ExclusiveAgentResponse(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    assigned_by: int
    assigned_at: datetime

    class Config:
        from_attributes = True


class ExclusiveAgentCreate(BaseModel):
    user_id: int


class ContractExclusiveDiscountResponse(BaseModel):
    id: int
    contract_id: int
    room_type_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    discount_percent: float
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContractExclusiveDiscountCreate(BaseModel):
    discount_percent: float
    room_type_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ContractExclusiveDiscountUpdate(BaseModel):
    discount_percent: float
    room_type_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class AgentPriceResponse(BaseModel):
    """
    Decision 070: the exact dict shape apply_agent_pricing already
    returns (see docs/interface-contracts/pricing-booking.md), exposed
    as-is for HotelSearch.tsx's price preview -- same calculation
    create_booking uses server-side, so the search screen can never
    diverge from what a real booking would actually charge.
    """
    room_net_total: float
    is_exclusive: bool
    contract_discount_percent: float
    discounted_nights: int
    standard_nights: int
    exclusive_discount_amount: float
    markup_amount_per_night: float
    markup_amount: float
    agent_room_total: float


class DateScanResultResponse(BaseModel):
    """
    Decision 149: one row per (hotel, candidate check-in date) scanned,
    carrying the cheapest bookable room-type/meal-plan combination for that
    stay. min_total is the agent-facing ROOM total only -- transfer and
    mandatory tax are excluded by design (see service.scan_dates).

    min_total/room_type_id/... are all None when nothing could be priced
    for that date; unavailable_reason then carries a machine-readable code
    ("no_active_contract" / "no_priceable_rooms") for the frontend to
    translate, never a ready-made sentence.
    """
    hotel_id: int
    hotel_name: str
    check_in: date
    check_out: date
    nights: int
    contract_id: Optional[int] = None
    currency: Optional[str] = None
    min_total: Optional[float] = None
    room_type_id: Optional[int] = None
    room_name: Optional[str] = None
    meal_code: Optional[str] = None
    meal_name: Optional[str] = None
    available: Optional[bool] = None
    combinations_priced: int
    unavailable_reason: Optional[str] = None


class NightlyPriceResponse(BaseModel):
    """
    Decision 074: one entry per calendar night, from
    build_nightly_breakdown -- the same per-night computation
    apply_agent_pricing sums to produce AgentPriceResponse's aggregate
    figures, so the two can never disagree.
    """
    date: date
    base_rate: float
    markup: float
    discount_applied: bool
    discount_percent: float
    discount_amount: float
    final_price: float


class AgentRoomQuoteResponse(BaseModel):
    """Security (2026-10-16): what an agent may see of a room price -- only
    the amount they pay. Deliberately no field for our net or markup."""

    contract_id: int
    room_type_id: int
    meal_plan_id: int
    currency: str
    nights: int
    agent_room_total: float
    applied_special_offer_ids: list[int] = []


class AgentNightlyQuoteResponse(BaseModel):
    date: date
    final_price: float
    discount_applied: bool
    discount_percent: float
