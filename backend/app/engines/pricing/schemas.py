from datetime import datetime
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
    discount_percent: float
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContractExclusiveDiscountUpsert(BaseModel):
    discount_percent: float
