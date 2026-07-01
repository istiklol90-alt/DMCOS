from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float
from models.base import Base
from datetime import datetime


class AgentRegistration(Base):
    __tablename__ = "agent_registrations"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(50), unique=True, index=True, nullable=True)  # ⬅️ ДОБАВЛЕНО!
    
    # Личные данные
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    phone = Column(String(20), nullable=False)
    whatsapp = Column(String(20), nullable=True)
    
    # Компания
    company_name = Column(String(100), nullable=False)
    legal_company_name = Column(String(100), nullable=False)
    company_registration = Column(String(50), nullable=True)
    tax_number = Column(String(50), nullable=True)
    
    # Адрес
    country = Column(String(50), nullable=False)
    city = Column(String(50), nullable=False)
    address = Column(Text, nullable=False)
    
    # Бизнес информация
    years_in_business = Column(Integer, default=0)
    number_of_employees = Column(Integer, default=0)
    annual_revenue = Column(Float, default=0)
    main_markets = Column(Text, nullable=True)
    
    # Контактное лицо
    contact_person = Column(String(100), nullable=False)
    preferred_currency = Column(String(10), nullable=False)
    preferred_language = Column(String(20), nullable=False)
    market = Column(String(50), nullable=False)
    
    # Дополнительно
    website = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    terms_accepted = Column(Boolean, default=False)
    
    # Статус и AI
    status = Column(String(20), default="pending")
    ai_risk_score = Column(Float, default=0)
    ai_recommendation = Column(String(50), default="review")
    
    # Аудит
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    review_comments = Column(Text, nullable=True)
    reviewed_by = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<AgentRegistration {self.id} - {self.company_name}>"