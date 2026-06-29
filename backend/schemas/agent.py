from pydantic import BaseModel


class AgentRegistrationCreate(BaseModel):
    company_name: str
    legal_company_name: str
    country: str
    city: str
    contact_person: str
    email: str
    phone: str
    whatsapp: str
    website: str | None = None
    preferred_currency: str
    preferred_language: str
    market: str
    notes: str | None = None


class AgentRegistrationResponse(AgentRegistrationCreate):
    id: int
    status: str

    class Config:
        from_attributes = True