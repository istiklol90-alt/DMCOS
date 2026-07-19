from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.finance import service
from app.engines.finance.repository import get_db
from app.engines.finance.schemas import (
    InvoiceResponse,
    CreditNoteResponse,
    CreditNoteCreate,
    AgentStatementResponse,
    AgentStatementCreate,
    AgentStatementLineResponse,
    HotelCashbackArrangementResponse,
    HotelCashbackArrangementCreate,
    HotelCashbackArrangementStatusUpdate,
    HotelCashbackFulfillmentResponse,
    HotelCashbackFulfillmentCreate,
)

router = APIRouter(prefix="/finance-engine", tags=["Finance Engine"])

# See Decision 006 (11_Decisions.md): duplicates JWT-decode logic locally
# rather than importing a shared dependency, same known technical debt as
# every other Engine's api.py -- now the 7th Engine repeating it.
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


def _require_admin(current_user) -> None:
    """Every endpoint in this router is Admin-only -- no distinct
    "Finance" role exists in Authentication Engine yet (only
    admin/agent are real today), same simplification Pricing Engine's
    _require_admin already made for its own admin-only surface."""
    role = (current_user.role or "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _run(operation):
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

@router.post("/bookings/{booking_id}/invoice", response_model=InvoiceResponse, status_code=201)
def create_invoice(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.create_invoice_for_booking(db, booking_id, created_by=current_user.id))


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.get_invoice(db, invoice_id))


@router.get("/agents/{agent_id}/invoices", response_model=list[InvoiceResponse])
def get_agent_invoices(agent_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_invoices_by_agent(db, agent_id)


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceResponse)
def void_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.void_invoice(db, invoice_id))


# ---------------------------------------------------------------------------
# CreditNote
# ---------------------------------------------------------------------------

@router.post("/invoices/{invoice_id}/credit-notes", response_model=CreditNoteResponse, status_code=201)
def create_credit_note(
    invoice_id: int, data: CreditNoteCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return _run(lambda: service.create_credit_note(
        db, invoice_id, data.amount, data.reason, created_by=current_user.id
    ))


@router.get("/invoices/{invoice_id}/credit-notes", response_model=list[CreditNoteResponse])
def get_invoice_credit_notes(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_credit_notes_by_invoice(db, invoice_id)


# ---------------------------------------------------------------------------
# AgentStatement
# ---------------------------------------------------------------------------

@router.post("/agent-statements", response_model=AgentStatementResponse, status_code=201)
def create_agent_statement(
    data: AgentStatementCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return _run(lambda: service.generate_agent_statement(
        db, data.agent_id, data.period_start, data.period_end, data.currency, generated_by=current_user.id
    ))


@router.get("/agent-statements/{statement_id}", response_model=AgentStatementResponse)
def get_agent_statement(statement_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.get_agent_statement(db, statement_id))


@router.get("/agent-statements/{statement_id}/lines", response_model=list[AgentStatementLineResponse])
def get_agent_statement_lines(
    statement_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return service.list_statement_lines(db, statement_id)


@router.post("/agent-statements/{statement_id}/finalize", response_model=AgentStatementResponse)
def finalize_agent_statement(
    statement_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return _run(lambda: service.finalize_agent_statement(db, statement_id))


# ---------------------------------------------------------------------------
# HotelCashbackArrangement / HotelCashbackFulfillment -- Decision 009
# ---------------------------------------------------------------------------

@router.post(
    "/hotels/{hotel_id}/cashback-arrangements", response_model=HotelCashbackArrangementResponse, status_code=201
)
def create_cashback_arrangement(
    hotel_id: int,
    data: HotelCashbackArrangementCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.create_cashback_arrangement(
        db, hotel_id, data.terms, data.currency, data.start_date, created_by=current_user.id,
        rebate_percentage=data.rebate_percentage, volume_threshold=data.volume_threshold,
        end_date_value=data.end_date,
    ))


@router.get("/hotels/{hotel_id}/cashback-arrangements", response_model=list[HotelCashbackArrangementResponse])
def get_cashback_arrangements(hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_cashback_arrangements_by_hotel(db, hotel_id)


@router.put("/cashback-arrangements/{arrangement_id}/status", response_model=HotelCashbackArrangementResponse)
def update_cashback_arrangement_status(
    arrangement_id: int,
    data: HotelCashbackArrangementStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.update_cashback_arrangement_status(db, arrangement_id, data.status))


@router.post(
    "/cashback-arrangements/{arrangement_id}/fulfillments",
    response_model=HotelCashbackFulfillmentResponse,
    status_code=201,
)
def record_cashback_fulfillment(
    arrangement_id: int,
    data: HotelCashbackFulfillmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    return _run(lambda: service.record_cashback_fulfillment(
        db, arrangement_id, data.fulfillment_date, data.amount, recorded_by=current_user.id,
        cumulative_sales_volume_at_time=data.cumulative_sales_volume_at_time, notes=data.notes,
    ))


@router.get("/cashback-arrangements/{arrangement_id}/fulfillments", response_model=list[HotelCashbackFulfillmentResponse])
def get_cashback_fulfillments(
    arrangement_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
    return service.list_cashback_fulfillments(db, arrangement_id)
