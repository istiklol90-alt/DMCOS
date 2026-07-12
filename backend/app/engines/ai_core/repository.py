from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.ai_core.models import (
    ContractIngestionJob,
    ExtractedField,
    ModelProviderConfig,
    HumanGateDecision,
)


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Contract Ingestion Job
# ---------------------------------------------------------------------------


def create_contract_ingestion_job(db: Session, **fields) -> ContractIngestionJob:
    """Insert a new job row from already-validated fields. New jobs start with the model's default status ("uploaded") unless status is explicitly passed."""
    job = ContractIngestionJob(**fields)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_contract_ingestion_job(db: Session, job_id: int) -> Optional[ContractIngestionJob]:
    """Fetch a single job by its primary key, or None if it doesn't exist."""
    return db.query(ContractIngestionJob).filter(ContractIngestionJob.id == job_id).first()


def list_contract_ingestion_jobs(
    db: Session, hotel_id: Optional[int] = None, skip: int = 0, limit: int = 100
) -> list[ContractIngestionJob]:
    """Return a page of jobs, most recently created first, optionally narrowed to one hotel_id."""
    query = db.query(ContractIngestionJob)
    if hotel_id is not None:
        query = query.filter(ContractIngestionJob.hotel_id == hotel_id)
    return query.order_by(ContractIngestionJob.created_at.desc()).offset(skip).limit(limit).all()


def update_contract_ingestion_job(
    db: Session, job: ContractIngestionJob, **fields
) -> ContractIngestionJob:
    """Apply the given field values (e.g. hotel_id, provider, contract_id) to an existing job row and persist them. Does not touch status — use update_contract_ingestion_job_status for that."""
    for key, value in fields.items():
        setattr(job, key, value)
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def update_contract_ingestion_job_status(
    db: Session, job: ContractIngestionJob, status: str
) -> ContractIngestionJob:
    """Change only the job's lifecycle status (uploaded -> processing -> extracted -> under_review -> approved/rejected/failed) without touching any other field. Caller is responsible for validating the transition itself."""
    job.status = status
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


# ---------------------------------------------------------------------------
# Extracted Field
# ---------------------------------------------------------------------------


def create_extracted_field(db: Session, **fields) -> ExtractedField:
    """Insert a new extracted field row (must include job_id, entity_type, field_data, confidence_score) and return it with its generated id."""
    field = ExtractedField(**fields)
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


def get_extracted_field(db: Session, field_id: int) -> Optional[ExtractedField]:
    """Fetch a single extracted field by its primary key, or None if it doesn't exist."""
    return db.query(ExtractedField).filter(ExtractedField.id == field_id).first()


def list_extracted_fields(
    db: Session, job_id: int, entity_type: Optional[str] = None
) -> list[ExtractedField]:
    """Return every extracted field for one job, optionally narrowed to a single entity_type (e.g. only "rate" rows)."""
    query = db.query(ExtractedField).filter(ExtractedField.job_id == job_id)
    if entity_type is not None:
        query = query.filter(ExtractedField.entity_type == entity_type)
    return query.all()


def update_extracted_field(db: Session, field: ExtractedField, **fields) -> ExtractedField:
    """Apply the given field values to an existing extracted field row and persist them — used when a manager edits a value during review (workflow step 9), not by the extraction step itself."""
    for key, value in fields.items():
        setattr(field, key, value)
    db.commit()
    db.refresh(field)
    return field


# ---------------------------------------------------------------------------
# Model Provider Config
# ---------------------------------------------------------------------------


def create_model_provider_config(db: Session, **fields) -> ModelProviderConfig:
    """Insert a new provider config row (must include provider_name) and return it with its generated id. New rows start with the model's default is_active (False) unless explicitly passed."""
    config = ModelProviderConfig(**fields)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def get_model_provider_config(db: Session, config_id: int) -> Optional[ModelProviderConfig]:
    """Fetch a single provider config by its primary key, or None if it doesn't exist."""
    return db.query(ModelProviderConfig).filter(ModelProviderConfig.id == config_id).first()


def get_model_provider_config_by_name(
    db: Session, provider_name: str
) -> Optional[ModelProviderConfig]:
    """Fetch a single provider config by its unique provider_name, or None if it doesn't exist."""
    return (
        db.query(ModelProviderConfig)
        .filter(ModelProviderConfig.provider_name == provider_name)
        .first()
    )


def list_model_provider_configs(db: Session) -> list[ModelProviderConfig]:
    """Return every configured provider."""
    return db.query(ModelProviderConfig).all()


def update_model_provider_config(
    db: Session, config: ModelProviderConfig, **fields
) -> ModelProviderConfig:
    """Apply the given field values (e.g. config_key) to an existing provider config row and persist them. Does not touch is_active — use update_model_provider_config_active for that."""
    for key, value in fields.items():
        setattr(config, key, value)
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config


def update_model_provider_config_active(
    db: Session, config: ModelProviderConfig, is_active: bool
) -> ModelProviderConfig:
    """Change only this provider's is_active flag without touching any other field or any other row. Ensuring exactly one provider is active at a time (deactivating the others) is service.py's job, not this function's."""
    config.is_active = is_active
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config


# ---------------------------------------------------------------------------
# Human Gate Decision
# ---------------------------------------------------------------------------
# No update function — this is an append-only audit trail (workflow step
# 12): each manager action gets its own new row, never edited in place,
# same "never mutate history" principle Booking Engine's cancellation
# fields follow.


def create_human_gate_decision(db: Session, **fields) -> HumanGateDecision:
    """Insert a new Human Gate decision row (must include job_id and action) and return it with its generated id."""
    decision = HumanGateDecision(**fields)
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return decision


def get_human_gate_decision(db: Session, decision_id: int) -> Optional[HumanGateDecision]:
    """Fetch a single Human Gate decision by its primary key, or None if it doesn't exist."""
    return db.query(HumanGateDecision).filter(HumanGateDecision.id == decision_id).first()


def list_human_gate_decisions(db: Session, job_id: int) -> list[HumanGateDecision]:
    """Return every Human Gate decision recorded for one job, in chronological order."""
    return (
        db.query(HumanGateDecision)
        .filter(HumanGateDecision.job_id == job_id)
        .order_by(HumanGateDecision.created_at)
        .all()
    )
