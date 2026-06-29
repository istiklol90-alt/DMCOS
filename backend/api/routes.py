from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import SessionLocal
from models.user import User
from models.agent import AgentRegistration
from schemas.user import UserCreate, UserResponse
from schemas.agent import AgentRegistrationCreate, AgentRegistrationResponse

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.post("/users", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    new_user = User(name=user.name, email=user.email)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/agent-registration", response_model=AgentRegistrationResponse)
def create_agent_registration(
    agent: AgentRegistrationCreate,
    db: Session = Depends(get_db)
):
    new_registration = AgentRegistration(
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
        status="pending",
    )

    db.add(new_registration)
    db.commit()
    db.refresh(new_registration)

    return new_registration


@router.get("/agent-registrations", response_model=list[AgentRegistrationResponse])
def get_agent_registrations(db: Session = Depends(get_db)):
    return db.query(AgentRegistration).all()