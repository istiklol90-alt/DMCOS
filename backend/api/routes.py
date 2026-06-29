from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import SessionLocal
from models.user import User
from models.agent import Agent
from schemas.user import UserCreate, UserResponse
from schemas.agent import AgentCreate, AgentResponse

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


@router.get("/agents", response_model=list[AgentResponse])
def get_agents(db: Session = Depends(get_db)):
    return db.query(Agent).all()


@router.post("/agents", response_model=AgentResponse)
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    new_agent = Agent(
        company_name=agent.company_name,
        contact_name=agent.contact_name,
        email=agent.email,
        phone=agent.phone,
        country=agent.country
    )
    db.add(new_agent)
    db.commit()
    db.refresh(new_agent)
    return new_agent