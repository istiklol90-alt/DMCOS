from sqlalchemy import Column, Integer, String, Text
from models.base import Base


class AgentRegistration(Base):
    __tablename__ = "agent_registrations"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    legal_company_name = Column(String, nullable=False)
    country = Column(String, nullable=False)
    city = Column(String, nullable=False)
    contact_person = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String, nullable=False)
    whatsapp = Column(String, nullable=False)
    website = Column(String, nullable=True)
    preferred_currency = Column(String, nullable=False)
    preferred_language = Column(String, nullable=False)
    market = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, default="pending")