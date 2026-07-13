from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
)
from models.base import Base
from datetime import datetime


class ContractIngestionJob(Base):
    """
    One row per uploaded hotel contract PDF, tracking it through Decision
    035's 12-step Phase 1 workflow from upload through the Level 2 Human
    Gate to Contract Engine storage. status moves uploaded -> processing
    -> extracted -> under_review -> approved/rejected/failed.
    """

    __tablename__ = "contract_ingestion_jobs"

    id = Column(Integer, primary_key=True, index=True)
    # Plain Integer, not a ForeignKey into Hotel Engine's `hotels` table —
    # same cross-engine decoupling precedent Contract/Booking Engine use.
    # Nullable because a job can exist (uploaded, even mid-extraction)
    # before the hotel it belongs to is confirmed.
    hotel_id = Column(Integer, nullable=True)
    # No real file-storage layer exists in this project yet (05_Architecture.md's
    # S3-compatible storage is aspirational, per CLAUDE.md's reality-vs-docs
    # gap) — this is a path/reference to wherever the PDF actually landed,
    # not a blob column.
    file_reference = Column(String(500), nullable=False)
    # Which Model Router provider handled/is handling this job
    # ("claude"/"gpt"/"gemini"/"local") — nullable until step 2 dispatches it.
    provider = Column(String(50), nullable=True)
    status = Column(String(20), default="uploaded")
    # Plain Integer, not a ForeignKey into Contract Engine's `contracts`
    # table — same cross-engine decoupling precedent. Set only after step
    # 11 actually writes the approved contract into Contract Engine.
    contract_id = Column(Integer, nullable=True)
    # Plain Integer, not a ForeignKey — validated against models.user.User
    # directly, same pattern Booking.created_by uses.
    created_by = Column(Integer, nullable=True)
    # Populated only when status is "failed" (set by service.mark_failed).
    # Added in Decision 042 once the Contract Engine write-through gave
    # mark_failed a real, caller-facing reason worth persisting instead of
    # letting it evaporate after the request -- previously this string was
    # only ever passed as a function argument and never stored anywhere.
    failure_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ExtractedField(Base):
    """
    One row per data point the model extracted from a contract PDF (a
    season, a room type, a rate, a policy clause, etc.), scoped to one
    ContractIngestionJob. Populated at step 3-6 of the workflow, entirely
    before anything is written to Contract Engine.
    """

    __tablename__ = "extracted_fields"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("contract_ingestion_jobs.id"), nullable=False)
    # e.g. "hotel_info" / "season" / "room_type" / "meal_plan" / "rate" /
    # "occupancy" / "child_policy" / "cancellation_policy" / "transfer" /
    # "supplement" / "special_offer" / "blackout_date" / "minimum_stay" —
    # an open string, not a fixed enum column, same "flexible core" precedent
    # RateSupplement.adjustment_type set in Contract Engine: any future
    # contract entity type Decision 035's list doesn't yet name is just a
    # new value here, never a schema change.
    entity_type = Column(String(50), nullable=False)
    # JSON-serialized structured extraction result for this entity — no
    # native JSON column type is used anywhere else in this project, so
    # this stays a Text column holding a JSON string, same convention.
    field_data = Column(Text, nullable=False)
    # 0-100, matching this project's existing percent-based convention
    # (discount_percent, minimum_markup_percent) rather than a 0-1 float.
    confidence_score = Column(Float, nullable=False)
    # Only populated when confidence_score is low (step 6's three
    # requirements) — the source clause, the AI's reading of it, and why
    # confidence is low. NULL for high-confidence fields.
    original_text = Column(Text, nullable=True)
    ai_interpretation = Column(Text, nullable=True)
    low_confidence_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelProviderConfig(Base):
    """
    The concrete data behind the Model Router abstraction: which LLM
    provider is currently active. Actual credentials are never stored
    here — config_key is only a reference (e.g. an env var name), same
    "secrets live in env, never DB" precedent as Authentication Engine's
    SECRET_KEY / services/email_service.py's SMTP credentials.
    """

    __tablename__ = "model_provider_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String(50), nullable=False, unique=True)
    # Which provider is currently used by the Model Router. Exactly one
    # row should be active at a time — enforced in service.py, not a DB
    # constraint, same plain-ValueError-validation convention every other
    # Engine uses instead of DB-level constraints.
    is_active = Column(Boolean, default=False)
    config_key = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HumanGateDecision(Base):
    """
    One row per manager action on a ContractIngestionJob at the Level 2
    Human Gate (workflow steps 8-10) — the audit trail step 12 requires.
    A job can accumulate more than one row if a manager edits, then later
    approves.
    """

    __tablename__ = "human_gate_decisions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("contract_ingestion_jobs.id"), nullable=False)
    # Plain Integer, not a ForeignKey — validated against models.user.User
    # directly, same pattern Booking.created_by uses.
    reviewer_id = Column(Integer, nullable=True)
    # "approved" / "edited" / "rejected" — a small, closed set central to
    # the Human Gate mechanic itself (unlike entity_type above), but still
    # a plain String with no DB-level constraint, matching every other
    # status-shaped column in this project (e.g. Contract.contract_status).
    action = Column(String(20), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
