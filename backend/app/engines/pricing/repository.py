from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.pricing.models import PricingSettings, ExclusiveAgent, ContractExclusiveDiscount


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# PricingSettings (single row, id=1)
# ---------------------------------------------------------------------------

def get_pricing_settings(db: Session) -> Optional[PricingSettings]:
    return db.query(PricingSettings).filter(PricingSettings.id == 1).first()


def create_pricing_settings(db: Session, **kwargs) -> PricingSettings:
    settings = PricingSettings(id=1, **kwargs)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_pricing_settings(db: Session, settings: PricingSettings, **kwargs) -> PricingSettings:
    for key, value in kwargs.items():
        if value is not None:
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


# ---------------------------------------------------------------------------
# ExclusiveAgent
# ---------------------------------------------------------------------------

def get_exclusive_agent(db: Session, user_id: int) -> Optional[ExclusiveAgent]:
    return db.query(ExclusiveAgent).filter(ExclusiveAgent.user_id == user_id).first()


def list_exclusive_agents(db: Session) -> list[ExclusiveAgent]:
    return db.query(ExclusiveAgent).all()


def create_exclusive_agent(db: Session, user_id: int, assigned_by: int) -> ExclusiveAgent:
    row = ExclusiveAgent(user_id=user_id, assigned_by=assigned_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_exclusive_agent(db: Session, row: ExclusiveAgent) -> None:
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# ContractExclusiveDiscount -- Decision 071: list-based, no longer one row
# per contract.
# ---------------------------------------------------------------------------

def list_contract_exclusive_discounts(db: Session, contract_id: int) -> list[ContractExclusiveDiscount]:
    return db.query(ContractExclusiveDiscount).filter(
        ContractExclusiveDiscount.contract_id == contract_id
    ).all()


def get_contract_exclusive_discount_by_id(db: Session, discount_id: int) -> Optional[ContractExclusiveDiscount]:
    return db.query(ContractExclusiveDiscount).filter(ContractExclusiveDiscount.id == discount_id).first()


def create_contract_exclusive_discount(db: Session, **fields) -> ContractExclusiveDiscount:
    row = ContractExclusiveDiscount(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_contract_exclusive_discount(
    db: Session, row: ContractExclusiveDiscount, **fields
) -> ContractExclusiveDiscount:
    for key, value in fields.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_contract_exclusive_discount(db: Session, row: ContractExclusiveDiscount) -> None:
    db.delete(row)
    db.commit()
