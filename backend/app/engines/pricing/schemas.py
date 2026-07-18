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
