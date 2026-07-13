from typing import Optional

from sqlalchemy.orm import Session

from app.engines.ai_core import repository
from app.engines.ai_core import providers
from app.engines.ai_core import contract_writer
from app.engines.ai_core.models import ContractIngestionJob, ExtractedField, ModelProviderConfig
from app.engines.hotel import service as hotel_service

# Decision 035's 12-step Phase 1 workflow, as a strict forward-only state
# machine. "failed" is reachable from any non-terminal status (a provider
# error or unrecoverable extraction problem can happen at any stage) but
# is never entered by a Human Gate decision — see mark_failed's docstring.
# approved/rejected/failed are all terminal, same "no transition out of a
# terminal status" principle Booking Engine's validate_status_transition
# uses for Cancelled/Rejected.
VALID_TRANSITIONS = {
    "uploaded": {"processing", "failed"},
    "processing": {"extracted", "failed"},
    "extracted": {"under_review", "failed"},
    "under_review": {"approved", "rejected", "failed"},
    "approved": set(),
    "rejected": set(),
    "failed": set(),
}

TERMINAL_STATUSES = {"approved", "rejected", "failed"}

# Confidence scores below this (0-100 scale) are "low confidence" per
# workflow step 6 and must carry original_text/ai_interpretation/
# low_confidence_reason. Not sourced from any doc — this project's own
# threshold, analogous to how Contract Engine's 3-bucket age-category
# matching was this project's own design choice, not a documented rule.
LOW_CONFIDENCE_THRESHOLD = 70


def _require_job(db: Session, job_id: int) -> ContractIngestionJob:
    job = repository.get_contract_ingestion_job(db, job_id)
    if job is None:
        raise ValueError(f"Contract ingestion job {job_id} not found")
    return job


def _require_field(db: Session, field_id: int) -> ExtractedField:
    field = repository.get_extracted_field(db, field_id)
    if field is None:
        raise ValueError(f"Extracted field {field_id} not found")
    return field


def _validate_transition(current_status: str, new_status: str) -> None:
    """Raise ValueError unless new_status is a permitted next step from current_status, per VALID_TRANSITIONS. Deliberately the full pipeline sequence, not a narrow single boundary — unlike Booking Engine's status field, a job's status IS the workflow, so every step is enforced."""
    allowed = VALID_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        raise ValueError(
            f"Cannot transition job status '{current_status}' -> '{new_status}' "
            f"(allowed: {sorted(allowed) or 'none — terminal status'})"
        )


# ---------------------------------------------------------------------------
# Contract Ingestion Job — lifecycle
# ---------------------------------------------------------------------------


def create_ingestion_job(
    db: Session, file_reference: str, hotel_id: Optional[int] = None, created_by: Optional[int] = None
) -> ContractIngestionJob:
    """
    Workflow step 1: a manager uploads a hotel contract PDF. Creates the
    job in the model's default "uploaded" status. Validates hotel_id
    against Hotel Engine only if given — a job can legitimately exist
    before the hotel it belongs to is confirmed. Does NOT dispatch to any
    provider (workflow step 2) — that's a later task's responsibility
    once the Model Router is actually implemented, per Decision 035's
    deliverable #9/#10.
    """
    if hotel_id is not None:
        hotel_service.get_hotel(db, hotel_id)
    return repository.create_contract_ingestion_job(
        db, file_reference=file_reference, hotel_id=hotel_id, created_by=created_by
    )


def get_job(db: Session, job_id: int) -> ContractIngestionJob:
    """Fetch one job by id, or raise ValueError if it doesn't exist."""
    return _require_job(db, job_id)


def list_jobs(
    db: Session, hotel_id: Optional[int] = None, skip: int = 0, limit: int = 100
) -> list[ContractIngestionJob]:
    """Return a page of jobs, optionally narrowed to one hotel_id."""
    return repository.list_contract_ingestion_jobs(db, hotel_id=hotel_id, skip=skip, limit=limit)


def start_processing(db: Session, job_id: int) -> ContractIngestionJob:
    """Workflow step 2's status transition only (uploaded -> processing). The actual Model Router dispatch to a real provider is deferred to a later task."""
    job = _require_job(db, job_id)
    _validate_transition(job.status, "processing")
    return repository.update_contract_ingestion_job_status(db, job, "processing")


def mark_extracted(db: Session, job_id: int, provider: str) -> ContractIngestionJob:
    """Workflow steps 3-4's status transition (processing -> extracted), recording which provider handled it. Populating the job's ExtractedField rows is record_extracted_field's job, called separately per field — a real provider integration and this task's manual/test data both go through that same function."""
    job = _require_job(db, job_id)
    _validate_transition(job.status, "extracted")
    repository.update_contract_ingestion_job(db, job, provider=provider)
    return repository.update_contract_ingestion_job_status(db, job, "extracted")


# Decision 043's Phase 1 taxonomy (full shape spec lives in
# ai/prompts.py): the 3 simple hotel-identity fields plus the 8
# structured contract entities contract_writer.py knows how to write.
# Deliberately excludes Promotion/SpecialOffer/BlackoutDate/
# CancellationPolicy -- see Decision 043 for why those are a future
# Phase 2, not this list.
PHASE_1_ENTITY_TYPES = [
    "hotel_name",
    "country",
    "city",
    "contract",
    "room_type",
    "season",
    "age_category",
    "meal_plan",
    "transfer_option",
    "rate",
    "rate_supplement",
]


def run_extraction(db: Session, job_id: int) -> ContractIngestionJob:
    """
    Orchestrates workflow steps 2-4 in one call: transitions
    uploaded -> processing (if not already there), resolves the
    currently-active ModelProviderConfig, calls that provider's
    extract_contract_data via the Model Router (Decision 041's
    get_provider), persists one ExtractedField row per result via
    record_extracted_field, then transitions processing -> extracted.

    entity_types is PHASE_1_ENTITY_TYPES (Decision 043) -- every entity
    type contract_writer.write_approved_fields_to_contract_engine knows
    how to write. MockClaudeProvider currently returns results for all of
    them (a full Kandima-derived test contract); a real provider given
    real contract text would extract whatever subset it actually finds --
    see record_extracted_field/contract_writer for how a partial subset
    (e.g. no rates yet) is handled gracefully rather than requiring all 8.

    document_text is currently just the job's file_reference string --
    no real PDF-text extraction or file-storage layer exists yet
    (CLAUDE.md's reality-vs-docs gap), so this function is explicitly a
    stand-in pending that work, not a finished pipeline. MockClaudeProvider
    ignores document_text entirely; a real provider given this placeholder
    would not extract anything meaningful from it.
    """
    job = _require_job(db, job_id)
    if job.status == "uploaded":
        job = start_processing(db, job_id)

    active = get_active_provider(db)
    if active is None:
        raise ValueError("No AI provider is currently active -- configure one first")

    provider_instance = providers.get_provider(active.provider_name)
    results = provider_instance.extract_contract_data(
        document_text=job.file_reference,
        entity_types=PHASE_1_ENTITY_TYPES,
    )
    for r in results:
        record_extracted_field(
            db,
            job_id,
            entity_type=r.entity_type,
            field_data=r.field_data,
            confidence_score=r.confidence_score,
            original_text=r.original_text,
            ai_interpretation=r.ai_interpretation,
            low_confidence_reason=r.low_confidence_reason,
        )
    return mark_extracted(db, job_id, provider=active.provider_name)


def submit_for_review(db: Session, job_id: int) -> ContractIngestionJob:
    """Workflow steps 7-8: extracted -> under_review. Nothing has been written to Contract Engine at this point, and won't be until a manager acts at the Level 2 Human Gate."""
    job = _require_job(db, job_id)
    _validate_transition(job.status, "under_review")
    return repository.update_contract_ingestion_job_status(db, job, "under_review")


def mark_failed(db: Session, job_id: int, reason: str) -> ContractIngestionJob:
    """
    Transition to "failed" from any non-terminal status (a provider
    error, an unrecoverable extraction problem, or -- since Decision 042
    -- a Contract Engine write-through failure at approve_job). Deliberately
    NOT a Human Gate action — this is a system-detected failure, not a
    manager decision, so it records no HumanGateDecision row. reason is
    persisted to failure_reason (Decision 042) so the UI can show the
    caller what actually went wrong instead of nothing — full structured
    audit logging is still Audit & Log Engine's future job per events.py's
    forward-looking convention, Decision 003, but a human-readable reason
    is worth keeping on the row itself in the meantime.
    """
    if not reason or len(reason.strip()) < 2:
        raise ValueError("A failure reason is required")
    job = _require_job(db, job_id)
    _validate_transition(job.status, "failed")
    repository.update_contract_ingestion_job(db, job, failure_reason=reason)
    return repository.update_contract_ingestion_job_status(db, job, "failed")


# ---------------------------------------------------------------------------
# Extracted Field
# ---------------------------------------------------------------------------


def record_extracted_field(
    db: Session,
    job_id: int,
    entity_type: str,
    field_data: str,
    confidence_score: float,
    original_text: Optional[str] = None,
    ai_interpretation: Optional[str] = None,
    low_confidence_reason: Optional[str] = None,
) -> ExtractedField:
    """
    Persist one extracted data point for a job (workflow steps 3-6).
    Raises ValueError if confidence_score is below LOW_CONFIDENCE_THRESHOLD
    and any of original_text/ai_interpretation/low_confidence_reason is
    missing — step 6's three requirements are mandatory for low-confidence
    items, not optional metadata.
    """
    _require_job(db, job_id)
    if not 0 <= confidence_score <= 100:
        raise ValueError(f"confidence_score must be between 0 and 100, got {confidence_score}")
    if confidence_score < LOW_CONFIDENCE_THRESHOLD and not (
        original_text and ai_interpretation and low_confidence_reason
    ):
        raise ValueError(
            f"confidence_score {confidence_score} is below the low-confidence threshold "
            f"({LOW_CONFIDENCE_THRESHOLD}) — original_text, ai_interpretation, and "
            f"low_confidence_reason are all required"
        )
    return repository.create_extracted_field(
        db,
        job_id=job_id,
        entity_type=entity_type,
        field_data=field_data,
        confidence_score=confidence_score,
        original_text=original_text,
        ai_interpretation=ai_interpretation,
        low_confidence_reason=low_confidence_reason,
    )


def list_extracted_fields(
    db: Session, job_id: int, entity_type: Optional[str] = None
) -> list[ExtractedField]:
    """Return every extracted field for one job, optionally narrowed to a single entity_type."""
    _require_job(db, job_id)
    return repository.list_extracted_fields(db, job_id, entity_type=entity_type)


def edit_extracted_field(
    db: Session, field_id: int, reviewer_id: int, field_data: str, notes: Optional[str] = None
) -> ExtractedField:
    """Workflow step 9's edit half: a manager corrects an extracted value during review. Records a HumanGateDecision(action="edited") against the field's job for the audit trail (step 12)."""
    field = _require_field(db, field_id)
    updated = repository.update_extracted_field(db, field, field_data=field_data)
    repository.create_human_gate_decision(
        db, job_id=field.job_id, reviewer_id=reviewer_id, action="edited", notes=notes
    )
    return updated


# ---------------------------------------------------------------------------
# Human Gate
# ---------------------------------------------------------------------------


def approve_job(db: Session, job_id: int, reviewer_id: int, notes: Optional[str] = None) -> ContractIngestionJob:
    """
    Level 2 Human Gate approval (workflow step 9-10's approval half).
    Records the HumanGateDecision first -- a human's "approve" judgment
    happened regardless of what the system does next -- then attempts
    the actual write into Contract Engine (step 10-11) via
    contract_writer.write_approved_fields_to_contract_engine.

    If that write fails partway through (e.g. a ref that doesn't resolve,
    or a required field missing), the job transitions to "failed" instead
    of "approved" -- a reviewer's approval of incomplete/inconsistent data
    does not silently become a live contract. Per contract_writer's module
    docstring, anything already created before the failure is NOT rolled
    back (Contract Engine has no delete_* functions for most of these
    entities, and it's LOCKED); the ValueError's message -- which lists
    every entity actually created, with real ids -- is persisted verbatim
    into failure_reason (Decision 042) so a partial write is never a
    silent mystery.

    On success, contract_writer returns (hotel_id, contract_id) -- either
    can be None (contract_id stays None if the job never had a "contract"
    entity extracted, i.e. Decision 042's original hotel-only path).
    hotel_id/contract_id are only written onto the job if it didn't
    already carry that id (never overwrite a hotel_id picked manually at
    upload time).
    """
    job = _require_job(db, job_id)
    _validate_transition(job.status, "approved")
    repository.create_human_gate_decision(
        db, job_id=job_id, reviewer_id=reviewer_id, action="approved", notes=notes
    )
    try:
        hotel_id, contract_id = contract_writer.write_approved_fields_to_contract_engine(db, job)
    except ValueError as e:
        return mark_failed(db, job_id, reason=f"Contract Engine write failed: {e}")
    updates = {}
    if job.hotel_id is None and hotel_id is not None:
        updates["hotel_id"] = hotel_id
    if job.contract_id is None and contract_id is not None:
        updates["contract_id"] = contract_id
    if updates:
        job = repository.update_contract_ingestion_job(db, job, **updates)
    return repository.update_contract_ingestion_job_status(db, job, "approved")


def reject_job(db: Session, job_id: int, reviewer_id: int, notes: str) -> ContractIngestionJob:
    """Level 2 Human Gate rejection. Transitions under_review -> rejected and records the HumanGateDecision. notes is required, same "every rejection needs a reason" precedent as Booking Engine's cancellation reason."""
    if not notes or len(notes.strip()) < 2:
        raise ValueError("A rejection reason is required")
    job = _require_job(db, job_id)
    _validate_transition(job.status, "rejected")
    repository.create_human_gate_decision(
        db, job_id=job_id, reviewer_id=reviewer_id, action="rejected", notes=notes
    )
    return repository.update_contract_ingestion_job_status(db, job, "rejected")


def list_human_gate_decisions(db: Session, job_id: int) -> list:
    """Return every Human Gate decision recorded for one job, in chronological order — the audit trail workflow step 12 requires."""
    _require_job(db, job_id)
    return repository.list_human_gate_decisions(db, job_id)


# ---------------------------------------------------------------------------
# Model Provider Config
# ---------------------------------------------------------------------------


def create_provider_config(db: Session, provider_name: str, config_key: Optional[str] = None) -> ModelProviderConfig:
    """Register a new provider the Model Router can be pointed at. Never accepts or stores an actual API key — config_key is only a reference (e.g. an env var name)."""
    existing = repository.get_model_provider_config_by_name(db, provider_name)
    if existing is not None:
        raise ValueError(f"Provider '{provider_name}' is already configured")
    return repository.create_model_provider_config(db, provider_name=provider_name, config_key=config_key)


def get_active_provider(db: Session) -> Optional[ModelProviderConfig]:
    """Return the currently-active provider config, or None if none is set active yet — the Model Router's single source of truth for "which provider to use," once a later task actually builds the Router."""
    for config in repository.list_model_provider_configs(db):
        if config.is_active:
            return config
    return None


def set_active_provider(db: Session, provider_name: str) -> ModelProviderConfig:
    """
    Activate one provider and deactivate every other — enforcing "exactly
    one provider active at a time" here, since repository.py's
    update_model_provider_config_active deliberately only touches the one
    row it's given. This is what makes switching providers a
    configuration change, not a business-logic change, per Decision 035's
    provider-abstraction principle.
    """
    target = repository.get_model_provider_config_by_name(db, provider_name)
    if target is None:
        raise ValueError(f"Provider '{provider_name}' is not configured")
    for config in repository.list_model_provider_configs(db):
        if config.id != target.id and config.is_active:
            repository.update_model_provider_config_active(db, config, False)
    return repository.update_model_provider_config_active(db, target, True)
