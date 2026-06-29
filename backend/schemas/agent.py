from pydantic import BaseModel


class AgentCreate(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: str | None = None
    country: str | None = None


class AgentResponse(AgentCreate):
    id: int

    class Config:
        from_attributes = True