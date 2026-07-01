from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class AgentRegistrationCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=10)
    whatsapp: Optional[str] = None
    company_name: str = Field(..., min_length=2, max_length=100)
    legal_company_name: str = Field(..., min_length=2, max_length=100)
    company_registration: Optional[str] = None
    tax_number: Optional[str] = None
    country: str = Field(..., min_length=2, max_length=50)
    city: str = Field(..., min_length=2, max_length=50)
    address: str = Field(..., min_length=5, max_length=500)
    years_in_business: int = 0
    number_of_employees: int = 0
    annual_revenue: float = 0
    main_markets: Optional[str] = None
    contact_person: str = Field(..., min_length=2, max_length=100)
    preferred_currency: str = "USD"
    preferred_language: str = "English"
    market: str = "Tourism"
    website: Optional[str] = None
    notes: Optional[str] = None
    terms_accepted: bool = False


class AgentRegistrationResponse(BaseModel):
    id: int
    application_id: str
    full_name: str
    email: str
    phone: str
    whatsapp: Optional[str] = None
    company_name: str
    legal_company_name: str
    company_registration: Optional[str] = None
    tax_number: Optional[str] = None
    country: str
    city: str
    address: str
    years_in_business: int = 0
    number_of_employees: int = 0
    annual_revenue: float = 0
    main_markets: Optional[str] = None
    contact_person: str
    preferred_currency: str
    preferred_language: str
    market: str
    website: Optional[str] = None
    notes: Optional[str] = None
    terms_accepted: bool = False
    status: str
    ai_risk_score: float = 0
    ai_recommendation: str = "review"
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    review_comments: Optional[str] = None
    reviewed_by: Optional[int] = None

    class Config:
        from_attributes = True


class AgentRegistrationUpdate(BaseModel):
    status: Optional[str] = None
    review_comments: Optional[str] = None


class AgentRegistrationApprove(BaseModel):
    comments: Optional[str] = None