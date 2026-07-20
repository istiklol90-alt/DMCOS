from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.finance import service
from app.engines.finance.repository import get_db
# Decision 098: read-only, same cross-engine pattern service.py already
# uses -- needed here only to fetch a Booking for
# _require_admin_or_owning_agent's authorization check.
from app.engines.booking import service as booking_service
from app.engines.finance.schemas import (
    InvoiceResponse,
    FlagForReviewRequest,
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
    VoucherResponse,
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


def _require_admin_or_owning_agent(current_user, booking) -> None:
    """
    Decision 098: a scoped exception to this router's usual Admin-only
    gate, for exactly one endpoint (flag-for-review) -- an agent may
    flag their OWN booking's invoice for review (the side effect of
    their own date-change action), but every other Finance Engine
    action (seeing, approving, voiding an invoice, acknowledging a
    flag) stays Admin-only via _require_admin, completely unchanged.

    Mirrors Booking Engine's own _require_owner_or_admin exactly (same
    role check, same booking.agent_id comparison) -- not imported
    directly, since that's a private, underscore-prefixed helper in a
    different Engine's api.py, and this project has no precedent for
    reaching across an Engine boundary for an authorization helper
    specifically (cross-engine imports are always for business-logic
    service functions).
    """
    role = (current_user.role or "").strip().lower()
    if role == "admin":
        return
    if current_user.id != booking.agent_id:
        raise HTTPException(status_code=403, detail="You can only flag your own bookings for review")


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


@router.get("/invoices", response_model=list[InvoiceResponse])
def get_all_invoices(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return service.list_invoices(db)


@router.get("/invoices/urgent", response_model=list[InvoiceResponse])
def get_urgent_invoices(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 087: MUST stay declared before /invoices/{invoice_id} --
    same route-ordering class of bug documented for
    /agent-registrations/stats in CLAUDE.md. If this were declared
    after the parameterized route, "urgent" would be parsed as an
    attempted invoice_id and fail instead of matching this endpoint."""
    _require_admin(current_user)
    return service.list_urgent_invoices(db)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.get_invoice(db, invoice_id))


@router.get("/bookings/{booking_id}/invoice", response_model=InvoiceResponse)
def get_booking_invoice(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.get_invoice_by_booking(db, booking_id))


@router.get("/agents/{agent_id}/invoices", response_model=list[InvoiceResponse])
def get_agent_invoices(
    agent_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 087: start_date/end_date are optional -- omitted (Счета's
    full per-agent history) falls back to the original unbounded
    behavior; both given (Баланс's period scope) reuses the same
    list_invoices_by_agent_in_range the .xlsx export already uses, so
    the two can never disagree about what "this agent, this period"
    means."""
    _require_admin(current_user)
    if start_date is not None and end_date is not None:
        return service.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)
    return service.list_invoices_by_agent(db, agent_id)


@router.get("/agents/{agent_id}/invoices/export")
def export_agent_invoices(
    agent_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 086: real .xlsx download, not JSON -- no fixed response_model,
    returns a Response with the real spreadsheet content-type and an
    attachment filename so the browser downloads it directly.
    """
    _require_admin(current_user)
    content = _run(lambda: service.build_agent_invoice_export(db, agent_id, start_date, end_date))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="agent_{agent_id}_invoices_{start_date}_{end_date}.xlsx"'
        },
    )


@router.post("/bookings/{booking_id}/flag-for-review")
def flag_invoice_for_review(
    booking_id: int, data: FlagForReviewRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """No fixed response_model -- deliberately returns either 204 (no
    invoice exists yet for this booking, or it's already Void, the
    common cases) or the updated InvoiceResponse, matching
    service.add_invoice_review_note's silent-no-op contract exactly.
    Decision 089: this now also notes an Issued invoice, not just
    Draft. Decision 093: appends a new numbered InvoiceReviewNote
    instead of overwriting a single review_flag field. Decision 094:
    request shape changed -- only old_arrival_date/old_departure_date
    are needed now (the new dates are already on the booking row by the
    time this runs); the service layer recomputes the real price
    breakdown for both sides itself, never trusting client-supplied
    numbers for a permanent audit record.

    Decision 098: the one endpoint in this router NOT gated by
    _require_admin -- a real, traced gap found an agent's own
    date-change on their own booking could never flag its invoice for
    review at all (both a frontend gate and this endpoint's own
    Admin-only check independently blocked it). Uses
    _require_admin_or_owning_agent instead: admin unconditionally, or
    the booking's own agent. Every other endpoint in this file is
    untouched -- an agent still cannot see, approve, void, or
    acknowledge-flag any invoice, their own or otherwise."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    result = service.add_invoice_review_note(db, booking_id, data.old_arrival_date, data.old_departure_date)
    if result is None:
        return Response(status_code=204)
    return InvoiceResponse.model_validate(result)


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceResponse)
def void_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.void_invoice(db, invoice_id, voided_by=current_user.id))


@router.post("/invoices/{invoice_id}/approve-and-send", response_model=InvoiceResponse)
def approve_and_send_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.approve_and_send_invoice(db, invoice_id, approved_by=current_user.id))


@router.post("/invoices/{invoice_id}/acknowledge-flag", response_model=InvoiceResponse)
def acknowledge_review_flag(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 089: dismisses an urgent flag on an Issued invoice
    without re-sending anything -- approve_and_send_invoice's own flag
    acknowledgment only fires for a Draft -> Issued transition."""
    _require_admin(current_user)
    return _run(lambda: service.acknowledge_review_flag(db, invoice_id, acknowledged_by=current_user.id))


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


# ---------------------------------------------------------------------------
# Voucher -- Decision 097
# ---------------------------------------------------------------------------

@router.post("/bookings/{booking_id}/voucher", response_model=VoucherResponse, status_code=201)
def create_and_send_voucher(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Called via frontend orchestration from Reservations.tsx, right
    after saving a booking's confirmation_number -- unlike
    flag-for-review's best-effort 204-or-response contract, this DOES
    raise (mapped to 400 by _run) if there's no confirmation_number yet
    or the agent has no resolvable email, matching
    approve_and_send_invoice's own hard-fail precedent."""
    _require_admin(current_user)
    return _run(lambda: service.create_and_send_voucher(db, booking_id, created_by=current_user.id))
