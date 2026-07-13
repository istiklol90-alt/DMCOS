from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.ai_core import service
from app.engines.ai_core.repository import get_db
from app.engines.ai_core.schemas import (
    ContractIngestionJobCreate,
    ContractIngestionJobResponse,
    MarkExtractedRequest,
    MarkFailedRequest,
    ExtractedFieldCreate,
    ExtractedFieldEditRequest,
    ExtractedFieldResponse,
    HumanGateApproveRequest,
    HumanGateRejectRequest,
    HumanGateDecisionResponse,
    ModelProviderConfigCreate,
    ModelProviderConfigResponse,
)

router = APIRouter(prefix="/ai-core-engine", tags=["AI Core Engine"])

# See Decision 006 (11_Decisions.md): this duplicates the JWT-decode logic
# from Hotel/Contract/Booking Engine's api.py rather than importing a
# shared dependency, because Authentication Engine never exposed one and
# is LOCKED. Now the fourth Engine repeating the duplication Decision 006
# predicted.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def _run(operation):
    """
    Call a service.py function and translate its ValueError into an
    HTTP 400. Same known simplification as Hotel/Contract/Booking
    Engine's api.py: all service.py failures raise plain ValueError
    (not-found and invalid-transition alike), so everything maps to 400
    here rather than a 400/404 split.
    """
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Contract Ingestion Job
# ---------------------------------------------------------------------------


@router.post("/jobs", response_model=ContractIngestionJobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    data: ContractIngestionJobCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Workflow step 1. created_by is resolved from the authenticated user, never accepted from the client — see schemas.py's module note."""
    return _run(
        lambda: service.create_ingestion_job(
            db, file_reference=data.file_reference, hotel_id=data.hotel_id, created_by=current_user.id
        )
    )


@router.get("/jobs", response_model=list[ContractIngestionJobResponse])
def list_jobs(
    hotel_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_jobs(db, hotel_id=hotel_id, skip=skip, limit=limit))


@router.get("/jobs/{job_id}", response_model=ContractIngestionJobResponse)
def get_job(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.get_job(db, job_id))


@router.post("/jobs/{job_id}/start-processing", response_model=ContractIngestionJobResponse)
def start_processing(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Workflow step 2's status transition only (uploaded -> processing). No provider dispatch happens here — see service.start_processing's docstring."""
    return _run(lambda: service.start_processing(db, job_id))


@router.post("/jobs/{job_id}/mark-extracted", response_model=ContractIngestionJobResponse)
def mark_extracted(
    job_id: int,
    data: MarkExtractedRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Workflow steps 3-4's status transition (processing -> extracted). Populate the actual ExtractedField rows separately via POST /jobs/{id}/fields."""
    return _run(lambda: service.mark_extracted(db, job_id, provider=data.provider))


@router.post("/jobs/{job_id}/run-extraction", response_model=ContractIngestionJobResponse)
def run_extraction(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Runs the active provider (Decision 041's Model Router) end-to-end: uploaded/processing -> extracted, persisting one ExtractedField row per result. See service.run_extraction's docstring for the current entity_types/document_text limitations."""
    return _run(lambda: service.run_extraction(db, job_id))


@router.post("/jobs/{job_id}/submit-for-review", response_model=ContractIngestionJobResponse)
def submit_for_review(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Workflow steps 7-8: extracted -> under_review. Nothing is written to Contract Engine yet."""
    return _run(lambda: service.submit_for_review(db, job_id))


@router.post("/jobs/{job_id}/mark-failed", response_model=ContractIngestionJobResponse)
def mark_failed(
    job_id: int,
    data: MarkFailedRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.mark_failed(db, job_id, reason=data.reason))


# ---------------------------------------------------------------------------
# Human Gate
# ---------------------------------------------------------------------------


@router.post("/jobs/{job_id}/approve", response_model=ContractIngestionJobResponse)
def approve_job(
    job_id: int,
    data: HumanGateApproveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Level 2 Human Gate approval. reviewer_id is resolved from the authenticated user — see schemas.py's module note. Writes the approved fields into Contract Engine (currently just a Hotel row via Hotel Engine) per Decision 035's step 10-11 — see service.approve_job/contract_writer.py's docstrings. Job transitions to "failed" instead of "approved" if that write fails."""
    return _run(
        lambda: service.approve_job(db, job_id, reviewer_id=current_user.id, notes=data.notes)
    )


@router.post("/jobs/{job_id}/reject", response_model=ContractIngestionJobResponse)
def reject_job(
    job_id: int,
    data: HumanGateRejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Level 2 Human Gate rejection. notes is required by schemas.py at the type level (min_length=2), same "every rejection needs a reason" precedent as Booking Engine."""
    return _run(
        lambda: service.reject_job(db, job_id, reviewer_id=current_user.id, notes=data.notes)
    )


@router.get("/jobs/{job_id}/decisions", response_model=list[HumanGateDecisionResponse])
def list_human_gate_decisions(job_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.list_human_gate_decisions(db, job_id))


# ---------------------------------------------------------------------------
# Extracted Field
# ---------------------------------------------------------------------------


@router.post(
    "/jobs/{job_id}/fields", response_model=ExtractedFieldResponse, status_code=status.HTTP_201_CREATED
)
def record_extracted_field(
    job_id: int,
    data: ExtractedFieldCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Workflow steps 3-6. Raises 400 if confidence_score is below the low-confidence threshold without all three explanation fields — see service.record_extracted_field's docstring."""
    return _run(
        lambda: service.record_extracted_field(
            db,
            job_id,
            entity_type=data.entity_type,
            field_data=data.field_data,
            confidence_score=data.confidence_score,
            original_text=data.original_text,
            ai_interpretation=data.ai_interpretation,
            low_confidence_reason=data.low_confidence_reason,
        )
    )


@router.get("/jobs/{job_id}/fields", response_model=list[ExtractedFieldResponse])
def list_extracted_fields(
    job_id: int,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_extracted_fields(db, job_id, entity_type=entity_type))


@router.put("/fields/{field_id}", response_model=ExtractedFieldResponse)
def edit_extracted_field(
    field_id: int,
    data: ExtractedFieldEditRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Workflow step 9's edit half. reviewer_id is resolved from the authenticated user. Records a HumanGateDecision(action="edited") for the audit trail."""
    return _run(
        lambda: service.edit_extracted_field(
            db, field_id, reviewer_id=current_user.id, field_data=data.field_data, notes=data.notes
        )
    )


# ---------------------------------------------------------------------------
# Model Provider Config
# ---------------------------------------------------------------------------


@router.post(
    "/providers", response_model=ModelProviderConfigResponse, status_code=status.HTTP_201_CREATED
)
def create_provider_config(
    data: ModelProviderConfigCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Never accepts an actual API key — config_key is only a reference. See service.create_provider_config's docstring."""
    return _run(
        lambda: service.create_provider_config(
            db, provider_name=data.provider_name, config_key=data.config_key
        )
    )


@router.get("/providers/active", response_model=ModelProviderConfigResponse)
def get_active_provider(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    result = _run(lambda: service.get_active_provider(db))
    if result is None:
        raise HTTPException(status_code=404, detail="No provider is currently active")
    return result


@router.post("/providers/{provider_name}/activate", response_model=ModelProviderConfigResponse)
def set_active_provider(
    provider_name: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Activates one provider and deactivates every other — see service.set_active_provider's docstring. Makes switching providers a data change, not a code change, per Decision 035."""
    return _run(lambda: service.set_active_provider(db, provider_name))
