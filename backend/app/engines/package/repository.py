"""Package Engine repository -- thin CRUD, no business rules (TASK-002)."""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.package.models import (
    AgentPackageSettings,
    BookingPackage,
    BookingPackageLine,
    CommissionTier,
    PackageAddOn,
    PackageAddOnPriceChange,
    PackageCancellationRule,
    PackageChannel,
    PackageQuote,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _save(db: Session, obj):
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def _update(db: Session, obj, fields: dict):
    for k, v in fields.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# Channels --------------------------------------------------------------------

def get_default_channel(db: Session) -> Optional[PackageChannel]:
    return db.query(PackageChannel).filter(PackageChannel.is_default.is_(True)).first()


def create_channel(db: Session, **fields) -> PackageChannel:
    return _save(db, PackageChannel(**fields))


# Commission tiers ------------------------------------------------------------

def list_tiers(db: Session, channel_id: Optional[int] = None) -> list[CommissionTier]:
    q = db.query(CommissionTier)
    q = q.filter(CommissionTier.channel_id.is_(None)) if channel_id is None else q.filter(CommissionTier.channel_id == channel_id)
    return q.order_by(CommissionTier.rate_percent).all()


def get_tier(db: Session, tier_id: int) -> Optional[CommissionTier]:
    return db.query(CommissionTier).filter(CommissionTier.id == tier_id).first()


def get_default_tier(db: Session, channel_id: Optional[int] = None) -> Optional[CommissionTier]:
    q = db.query(CommissionTier).filter(CommissionTier.is_default.is_(True), CommissionTier.active.is_(True))
    q = q.filter(CommissionTier.channel_id.is_(None)) if channel_id is None else q.filter(CommissionTier.channel_id == channel_id)
    return q.first()


def create_tier(db: Session, **fields) -> CommissionTier:
    return _save(db, CommissionTier(**fields))


def update_tier(db: Session, tier: CommissionTier, fields: dict) -> CommissionTier:
    return _update(db, tier, fields)


def clear_default_tier(db: Session, channel_id: Optional[int], except_id: int) -> None:
    q = db.query(CommissionTier).filter(CommissionTier.is_default.is_(True), CommissionTier.id != except_id)
    q = q.filter(CommissionTier.channel_id.is_(None)) if channel_id is None else q.filter(CommissionTier.channel_id == channel_id)
    for t in q.all():
        t.is_default = False
    db.commit()


# Agent settings --------------------------------------------------------------

def get_agent_settings(db: Session, user_id: int) -> Optional[AgentPackageSettings]:
    return db.query(AgentPackageSettings).filter(AgentPackageSettings.user_id == user_id).first()


def list_agent_settings(db: Session) -> list[AgentPackageSettings]:
    return db.query(AgentPackageSettings).all()


def upsert_agent_settings(db: Session, user_id: int, fields: dict) -> AgentPackageSettings:
    row = get_agent_settings(db, user_id)
    if row is None:
        return _save(db, AgentPackageSettings(user_id=user_id, **fields))
    return _update(db, row, fields)


# Add-ons (insurance, visa) ---------------------------------------------------

def list_add_ons(db: Session, kind: Optional[str] = None, active_only: bool = False) -> list[PackageAddOn]:
    q = db.query(PackageAddOn)
    if kind:
        q = q.filter(PackageAddOn.kind == kind)
    if active_only:
        q = q.filter(PackageAddOn.active.is_(True))
    return q.order_by(PackageAddOn.kind, PackageAddOn.name).all()


def get_add_on(db: Session, add_on_id: int) -> Optional[PackageAddOn]:
    return db.query(PackageAddOn).filter(PackageAddOn.id == add_on_id).first()


def create_add_on(db: Session, **fields) -> PackageAddOn:
    return _save(db, PackageAddOn(**fields))


def update_add_on(db: Session, add_on: PackageAddOn, fields: dict) -> PackageAddOn:
    return _update(db, add_on, fields)


def add_price_change(db: Session, **fields) -> PackageAddOnPriceChange:
    return _save(db, PackageAddOnPriceChange(**fields))


def list_price_changes(db: Session, add_on_id: int) -> list[PackageAddOnPriceChange]:
    return (
        db.query(PackageAddOnPriceChange)
        .filter(PackageAddOnPriceChange.add_on_id == add_on_id)
        .order_by(PackageAddOnPriceChange.changed_at.desc(), PackageAddOnPriceChange.id.desc())
        .all()
    )


# Cancellation rules ----------------------------------------------------------

def list_cancellation_rules(db: Session) -> list[PackageCancellationRule]:
    return db.query(PackageCancellationRule).order_by(PackageCancellationRule.component_type, PackageCancellationRule.days_before.desc()).all()


def get_cancellation_rule(db: Session, rule_id: int) -> Optional[PackageCancellationRule]:
    return db.query(PackageCancellationRule).filter(PackageCancellationRule.id == rule_id).first()


def create_cancellation_rule(db: Session, **fields) -> PackageCancellationRule:
    return _save(db, PackageCancellationRule(**fields))


def update_cancellation_rule(db: Session, rule: PackageCancellationRule, fields: dict) -> PackageCancellationRule:
    return _update(db, rule, fields)


def delete_cancellation_rule(db: Session, rule: PackageCancellationRule) -> None:
    db.delete(rule)
    db.commit()


# Quotes and booked packages --------------------------------------------------

def create_quote(db: Session, **fields) -> PackageQuote:
    return _save(db, PackageQuote(**fields))


def get_quote(db: Session, quote_id: int) -> Optional[PackageQuote]:
    return db.query(PackageQuote).filter(PackageQuote.id == quote_id).first()


def mark_quote(db: Session, quote: PackageQuote, status: str) -> PackageQuote:
    return _update(db, quote, {"status": status})


def create_booking_package(db: Session, package: dict, lines: list[dict]) -> BookingPackage:
    """Package snapshot and its lines in one commit."""
    bp = BookingPackage(**package)
    db.add(bp)
    for line in lines:
        db.add(BookingPackageLine(**line))
    db.commit()
    db.refresh(bp)
    return bp


def get_booking_package(db: Session, booking_id: int) -> Optional[BookingPackage]:
    return db.query(BookingPackage).filter(BookingPackage.booking_id == booking_id).first()


def list_booking_package_lines(db: Session, booking_id: int) -> list[BookingPackageLine]:
    return db.query(BookingPackageLine).filter(BookingPackageLine.booking_id == booking_id).order_by(BookingPackageLine.id).all()


def now() -> datetime:
    return datetime.utcnow()
