from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import secrets
import logging

from database.db import SessionLocal
from models.user import User
from models.agent import AgentRegistration

from schemas.user import UserCreate, UserResponse
from schemas.agent import (
    AgentRegistrationCreate,
    AgentRegistrationResponse
)

from auth.security import hash_password
from services.email_service import send_registration_email, send_approval_email, send_rejection_email

router = APIRouter()
logger = logging.getLogger(__name__)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================
# USERS
# ============================

@router.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.post("/users", response_model=UserResponse)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    existing_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists.",
        )

    new_user = User(
        name=user.name,
        email=user.email,
        password=hash_password(user.password),
        role=user.role,
        is_active=True,
        is_first_login=True,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# ============================
# AGENT REGISTRATION
# ============================

@router.post(
    "/agent-registration",
    response_model=AgentRegistrationResponse,
)
async def create_agent_registration(
    agent: AgentRegistrationCreate,
    db: Session = Depends(get_db),
):
    try:
        # Проверка на дубликаты
        existing = db.query(AgentRegistration).filter(
            (AgentRegistration.email == agent.email) |
            (AgentRegistration.phone == agent.phone)
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Agent with this email or phone already registered"
            )
        
        # Генерация Application ID
        application_id = f"APP-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
        
        # AI анализ (заглушка)
        ai_analysis = {
            "risk_score": 0,
            "recommendation": "approve",
            "observations": []
        }
        
        new_registration = AgentRegistration(
            application_id=application_id,
            full_name=agent.full_name,
            company_name=agent.company_name,
            legal_company_name=agent.legal_company_name,
            country=agent.country,
            city=agent.city,
            contact_person=agent.contact_person,
            email=agent.email,
            phone=agent.phone,
            whatsapp=agent.whatsapp,
            website=agent.website,
            preferred_currency=agent.preferred_currency,
            preferred_language=agent.preferred_language,
            market=agent.market,
            notes=agent.notes,
            address=agent.address,
            company_registration=agent.company_registration,
            tax_number=agent.tax_number,
            years_in_business=agent.years_in_business,
            number_of_employees=agent.number_of_employees,
            annual_revenue=agent.annual_revenue,
            main_markets=agent.main_markets,
            terms_accepted=agent.terms_accepted,
            status="pending",
            ai_risk_score=ai_analysis.get('risk_score', 0),
            ai_recommendation=ai_analysis.get('recommendation', 'review')
        )

        db.add(new_registration)
        db.commit()
        db.refresh(new_registration)
        
        # ✅ ОТПРАВКА EMAIL ПОДТВЕРЖДЕНИЯ
        await send_registration_email({
            "full_name": agent.full_name,
            "email": agent.email,
            "application_id": application_id,
            "company_name": agent.company_name,
            "phone": agent.phone,
            "country": agent.country,
            "city": agent.city,
            "status": "pending"
        })
        
        logger.info(f"✅ Новая регистрация: {application_id} - {agent.email}")

        return new_registration
        
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/agent-registrations",
    response_model=list[AgentRegistrationResponse],
)
def get_agent_registrations(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(AgentRegistration)
        
        if status:
            query = query.filter(AgentRegistration.status == status)
        
        registrations = query.order_by(
            AgentRegistration.created_at.desc()
        ).offset(skip).limit(limit).all()
        
        return registrations
    except Exception as e:
        logger.error(f"Error in get_agent_registrations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/agent-registrations/{registration_id}",
    response_model=AgentRegistrationResponse,
)
def get_agent_registration(
    registration_id: int,
    db: Session = Depends(get_db),
):
    try:
        registration = db.query(AgentRegistration).filter(
            AgentRegistration.id == registration_id
        ).first()
        
        if not registration:
            raise HTTPException(status_code=404, detail="Registration not found")
        
        return registration
    except Exception as e:
        logger.error(f"Error in get_agent_registration: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/agent-registrations/{registration_id}/approve")
async def approve_registration(
    registration_id: int,
    approve_data: dict,
    db: Session = Depends(get_db),
):
    try:
        registration = db.query(AgentRegistration).filter(
            AgentRegistration.id == registration_id
        ).first()
        
        if not registration:
            raise HTTPException(status_code=404, detail="Registration not found")
        
        if registration.status != "pending":
            raise HTTPException(
                status_code=400, 
                detail=f"Registration already {registration.status}"
            )
        
        # Обновляем статус заявки
        registration.status = "approved"
        registration.reviewed_at = datetime.utcnow()
        registration.review_comments = approve_data.get("comments", "")
        db.commit()
        db.refresh(registration)
        
        # Создаем аккаунт пользователя
        username = registration.email.split('@')[0]
        
        # ⬇️ ИСПРАВЛЕНО: проверяем по email, а не username
        existing = db.query(User).filter(User.email == registration.email).first()
        if existing:
            username = f"{username}{registration.id}"
        
        temp_password = secrets.token_urlsafe(10)
        
        new_user = User(
            name=username,
            email=registration.email,
            password=hash_password(temp_password),
            role="agent",
            is_active=True,
            is_first_login=True,
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # ✅ ОТПРАВКА EMAIL С ДАННЫМИ ДЛЯ ВХОДА
        await send_approval_email({
            "full_name": registration.full_name,
            "email": registration.email,
            "username": username,
            "password": temp_password,
            "application_id": registration.application_id,
            "comments": approve_data.get("comments", "")
        })
        
        logger.info(f"✅ Одобрена регистрация: {registration.application_id} - {registration.email}")
        
        return {
            "message": "Registration approved",
            "user_id": new_user.id,
            "username": username
        }
        
    except Exception as e:
        logger.error(f"Approval error: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/agent-registrations/{registration_id}/reject")
async def reject_registration(
    registration_id: int,
    comments: str,
    db: Session = Depends(get_db),
):
    try:
        registration = db.query(AgentRegistration).filter(
            AgentRegistration.id == registration_id
        ).first()
        
        if not registration:
            raise HTTPException(status_code=404, detail="Registration not found")
        
        if registration.status != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Registration already {registration.status}"
            )
        
        registration.status = "rejected"
        registration.reviewed_at = datetime.utcnow()
        registration.review_comments = comments
        
        db.commit()
        db.refresh(registration)
        
        # ✅ ОТПРАВКА EMAIL ОБ ОТКЛОНЕНИИ
        await send_rejection_email({
            "full_name": registration.full_name,
            "email": registration.email,
            "application_id": registration.application_id,
            "reason": comments
        })
        
        logger.info(f"❌ Отклонена регистрация: {registration.application_id} - {registration.email}")
        
        return {"message": "Registration rejected"}
        
    except Exception as e:
        logger.error(f"Rejection error: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-registrations/stats")
def get_registration_stats(
    db: Session = Depends(get_db),
):
    try:
        total = db.query(AgentRegistration).count()
        pending = db.query(AgentRegistration).filter(
            AgentRegistration.status == "pending"
        ).count()
        approved = db.query(AgentRegistration).filter(
            AgentRegistration.status == "approved"
        ).count()
        rejected = db.query(AgentRegistration).filter(
            AgentRegistration.status == "rejected"
        ).count()
        
        return {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "approval_rate": round((approved / total * 100) if total > 0 else 0, 1)
        }
    except Exception as e:
        logger.error(f"Stats error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))