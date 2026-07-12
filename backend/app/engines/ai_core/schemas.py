from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ---------------------------------------------------------------------------
# Contract Ingestion Job
# ---------------------------------------------------------------------------
# hotel_id/contract_id/created_by are handled the same way BookingCreate
# handles agent_id-vs-server-resolved fields case by case: hotel_id is a
# genuine client input (which hotel this contract belongs to, if known
# yet); created_by is never accepted from the client — resolved from
# current_user.id in api.py — same reasoning HumanGateApproveRequest/
# HumanGateRejectRequest below don't accept reviewer_id either, since
# spoofing who performed an audited action would defeat the Human Gate's
# whole purpose.


class ContractIngestionJobCreate(BaseModel):
    file_reference: str = Field(..., min_length=1, max_length=500)
    hotel_id: Optional[int] = None


class ContractIngestionJobResponse(BaseModel):
    id: int
    hotel_id: Optional[int] = None
    file_reference: str
    provider: Optional[str] = None
    status: str
    contract_id: Optional[int] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarkExtractedRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)


class MarkFailedRequest(BaseModel):
    reason: str = Field(..., min_length=2)


# ---------------------------------------------------------------------------
# Extracted Field
# ---------------------------------------------------------------------------
# entity_type is deliberately plain str, not a Literal — an open string
# per the project-owner-confirmed RateSupplement.adjustment_type
# precedent (11_Decisions.md Decision 038), not a fixed enum.


class ExtractedFieldCreate(BaseModel):
    entity_type: str = Field(..., min_length=1, max_length=50)
    field_data: str = Field(..., min_length=1)
    confidence_score: float = Field(..., ge=0, le=100)
    original_text: Optional[str] = None
    ai_interpretation: Optional[str] = None
    low_confidence_reason: Optional[str] = None


class ExtractedFieldEditRequest(BaseModel):
    field_data: str = Field(..., min_length=1)
    notes: Optional[str] = None


class ExtractedFieldResponse(BaseModel):
    id: int
    job_id: int
    entity_type: str
    field_data: str
    confidence_score: float
    original_text: Optional[str] = None
    ai_interpretation: Optional[str] = None
    low_confidence_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Human Gate
# ---------------------------------------------------------------------------


class HumanGateApproveRequest(BaseModel):
    notes: Optional[str] = None


class HumanGateRejectRequest(BaseModel):
    notes: str = Field(..., min_length=2)


class HumanGateDecisionResponse(BaseModel):
    id: int
    job_id: int
    reviewer_id: Optional[int] = None
    action: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Model Provider Config
# ---------------------------------------------------------------------------
# provider_name is deliberately plain str, not a Literal — the whole point
# of Decision 035's provider-abstraction principle is that adding a new
# provider is a data/config change, never a code change.


class ModelProviderConfigCreate(BaseModel):
    provider_name: str = Field(..., min_length=1, max_length=50)
    config_key: Optional[str] = Field(None, max_length=100)


class ModelProviderConfigResponse(BaseModel):
    id: int
    provider_name: str
    is_active: bool
    config_key: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
