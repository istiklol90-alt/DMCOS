from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_active_user_by_email

from app.engines.finance import service
from app.engines.finance.repository import get_db
# Decision 098: read-only, same cross-engine pattern service.py already
# uses -- needed here only to fetch a Booking for
# _require_admin_or_owning_agent's authorization check.
from app.engines.booking import service as booking_service
from app.engines.finance.schemas import (
    InvoiceResponse,
    ReturnInvoiceRequest,
    FlagForReviewRequest,
    UrgentBookingResponse,
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
    BookingCommercialLineResponse,
    BookingCommercialLineUpsert,
    HotelPriceConfirmationUpsert,
    BookingCommercialSummaryResponse,
    BookingPriceBreakdownResponse,
    BookingListFinancialsResponse,
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

    user = get_active_user_by_email(db, email)
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
    gate -- originally for exactly one endpoint (flag-for-review, so an
    agent could flag their own booking's invoice for review), extended
    by Decision 102 to the invoice-status check and the voucher/invoice
    download endpoints (an agent needs to know/fetch their OWN
    documents once accounting has confirmed them). Every OTHER Finance
    Engine action (seeing full invoice data, approving, voiding,
    acknowledging a flag) stays Admin-only via _require_admin,
    completely unchanged -- this is deliberately still a narrow,
    per-endpoint opt-in, not a general Finance Engine relaxation.

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
        raise HTTPException(status_code=403, detail="You do not have access to this booking's Finance Engine data")


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
def get_all_invoices(
    skip: int = 0,
    limit: int = 50,
    status: str | None = None,
    agent_id: int | None = None,
    booking_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 182: filtered/sorted/paginated server-side. All arguments
    optional; omitting them returns the newest page, which is what the
    unordered `.all()` this replaces never guaranteed."""
    _require_admin(current_user)
    return service.list_invoices(
        db, skip=skip, limit=limit, status=status, agent_id=agent_id,
        booking_id=booking_id, search=search, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir,
    )


@router.get("/invoices/count")
def get_invoices_count(
    status: str | None = None,
    agent_id: int | None = None,
    booking_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """MUST stay declared before /invoices/{invoice_id} -- that parameter is
    an int and FastAPI matches in declaration order, the same trap Decision
    087 documented for /invoices/urgent."""
    _require_admin(current_user)
    return {"total": service.count_invoices(
        db, status=status, agent_id=agent_id, booking_id=booking_id, search=search,
        date_from=date_from, date_to=date_to,
    )}


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


@router.get("/bookings/urgent", response_model=list[UrgentBookingResponse])
def get_urgent_bookings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 108: Бронирования's own "Требует внимания" panel --
    MUST stay declared before /bookings/{booking_id}/invoice below, same
    route-ordering class of bug Decision 087 already documented for
    /invoices/urgent vs /invoices/{invoice_id}. Admin-only, same gate as
    /invoices/urgent -- this is admin/financial-layer content per
    Decision 107's own classification."""
    _require_admin(current_user)
    return service.list_urgent_bookings(db)


@router.get("/bookings/financials", response_model=list[BookingListFinancialsResponse])
def get_bookings_list_financials(
    ids: str = Query(..., description="Comma-separated booking ids, e.g. '61,62,66'"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Bulk, list-level Net/Sale/Profit (commercial-line-aware where a
    manual correction exists) for the exact set of bookings a Bookings
    list page currently has visible. MUST stay declared before
    /bookings/{booking_id}/invoice below, same route-ordering discipline
    as /bookings/urgent above (Decision 087's class of bug) -- though
    "financials" as a literal 3rd-from-last segment never actually
    collides with any /bookings/{booking_id}/... route today, this keeps
    every literal-path GET grouped before the parametrized ones on sight."""
    _require_admin(current_user)
    booking_ids = [int(x) for x in ids.split(",") if x.strip()]
    result = service.compute_bookings_list_financials(db, booking_ids)
    return list(result.values())


@router.get(
    "/bookings/{booking_id}/commercial-summary",
    response_model=BookingCommercialSummaryResponse,
)
def get_booking_commercial_summary(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Whole-application cost/price per room and per category, plus the
    grand total the agent booked at. Read-only -- unlike the per-room
    /commercial-lines GET below, this never seeds rows (see the service
    function's own docstring)."""
    _require_admin(current_user)
    return _run(lambda: service.get_booking_commercial_summary(db, booking_id))


@router.get(
    "/bookings/{booking_id}/price-breakdown",
    response_model=BookingPriceBreakdownResponse,
)
def get_booking_price_breakdown(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Decision 181: the agent's own price, per room and per category.
    Admin OR the booking's own agent -- the same boundary Decision 102
    drew for the voucher/invoice downloads, and the reason this is a
    separate endpoint from /commercial-summary rather than a flag on it:
    that one carries our cost and margin, this one has no field for
    them."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    return _run(lambda: service.get_booking_price_breakdown(db, booking_id))


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


@router.post("/bookings/{booking_id}/flag-cancellation-requested")
def flag_cancellation_requested(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """
    Decision 104: same best-effort, 204-or-InvoiceResponse contract as
    flag-for-review above, called by the frontend right after
    POST /booking-engine/bookings/{id}/cancel (stage 1) succeeds. No
    request body -- the note is built entirely server-side from
    booking.cancellation_reason (see service.add_cancellation_requested_note).
    Same _require_admin_or_owning_agent gate as flag-for-review, since
    the request stage can be agent-initiated too.
    """
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    result = service.add_cancellation_requested_note(db, booking_id)
    if result is None:
        return Response(status_code=204)
    return InvoiceResponse.model_validate(result)


@router.post("/bookings/{booking_id}/flag-cancellation-confirmed")
def flag_cancellation_confirmed(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Decision 104: same shape as flag-cancellation-requested above, called after stage 2 (POST /confirm-cancellation) succeeds. Gated by _require_admin, not _require_admin_or_owning_agent -- confirming is itself Admin-only (Booking Engine's own /confirm-cancellation is _require_admin), so only an admin can ever be the caller here anyway."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin(current_user)
    result = service.add_cancellation_confirmed_note(db, booking_id)
    if result is None:
        return Response(status_code=204)
    return InvoiceResponse.model_validate(result)


@router.post("/bookings/{booking_id}/acknowledge-review")
def acknowledge_booking_review(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 108: Бронирования's own "Отметить как проверено" --
    the same underlying action as /invoices/{id}/acknowledge-flag below
    (both write to the same BookingReviewAcknowledgment row, unified
    per the project owner's explicit decision), just keyed by
    booking_id instead of invoice_id since a booking's review history
    doesn't require an invoice to exist. Admin-only, same gate as
    acknowledge-flag."""
    _require_admin(current_user)
    _run(lambda: service.acknowledge_booking_review(db, booking_id, acknowledged_by=current_user.id))
    return Response(status_code=204)


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceResponse)
def void_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.void_invoice(db, invoice_id, voided_by=current_user.id))


@router.post("/invoices/{invoice_id}/approve-and-send", response_model=InvoiceResponse)
def approve_and_send_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return _run(lambda: service.approve_and_send_invoice(db, invoice_id, approved_by=current_user.id))


@router.post("/bookings/{booking_id}/submit-for-posting", response_model=InvoiceResponse)
def submit_invoice_for_posting(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 202: the reservations manager confirms the amounts and hands
    the invoice to accounting. Creates the invoice if the booking has none,
    and refreshes it from the commercial breakdown. Admin-only for now --
    the owner plans separate manager/accountant roles later."""
    _require_admin(current_user)
    return _run(lambda: service.submit_invoice_for_posting(db, booking_id, submitted_by=current_user.id))


@router.post("/invoices/{invoice_id}/return", response_model=InvoiceResponse)
def return_invoice_to_reservations(
    invoice_id: int,
    payload: ReturnInvoiceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 202: accounting sends a Ready-for-posting invoice back to
    the reservations manager, with a note saying what to fix."""
    _require_admin(current_user)
    return _run(lambda: service.return_invoice_to_reservations(
        db, invoice_id, note=payload.note, returned_by=current_user.id
    ))


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


@router.get("/bookings/{booking_id}/voucher/download")
def download_voucher(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 102: admin OR the booking's own agent (unlike every
    other Voucher/Invoice endpoint in this router, which stays
    Admin-only) -- 404 if no voucher exists yet for this booking
    (frontend shows "В работе" in that case, never attempts this call
    speculatively since it already knows booking.confirmation_number).
    Plain-text .txt, same as the .xlsx export's real-file-download
    precedent (Decision 086) -- no PDF generation exists anywhere in
    this project."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    voucher = _run(lambda: service.get_latest_voucher(db, booking_id))
    content = service.build_voucher_download_text(voucher)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{voucher.voucher_number}.txt"'},
    )


# ---------------------------------------------------------------------------
# Voucher per room -- Stage 4 (multi-room booking applications)
# ---------------------------------------------------------------------------
# Mirrors the two endpoints above exactly, scoped to one BookingRoom
# instead of a whole (legacy, single-room) Booking. The original two
# endpoints stay completely untouched for bookings created via the
# original create_booking path.


@router.post("/rooms/{booking_room_id}/voucher", response_model=VoucherResponse, status_code=201)
def create_and_send_voucher_for_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Same trigger shape as create_and_send_voucher — called right after saving a room's own confirmation_number."""
    _require_admin(current_user)
    return _run(
        lambda: service.create_and_send_voucher_for_room(db, booking_room_id, created_by=current_user.id)
    )


@router.get("/rooms/{booking_room_id}/voucher/download")
def download_voucher_for_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Admin OR the application's own agent, same authorization shape as download_voucher."""
    room = _run(lambda: booking_service.get_booking_room(db, booking_room_id))
    booking = _run(lambda: booking_service.get_booking(db, room.booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    voucher = _run(lambda: service.get_latest_voucher_for_room(db, booking_room_id))
    content = service.build_voucher_download_text(voucher)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{voucher.voucher_number}.txt"'},
    )


@router.get("/bookings/{booking_id}/invoice/status")
def get_invoice_status_for_booking(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 102: admin OR the booking's own agent. Returns ONLY a
    status string (or null if no invoice exists at all) -- deliberately
    never the full InvoiceResponse, which carries subtotal/discount/
    commission/tax/total. This is the one call an agent's own view is
    allowed to make just to decide "В работе" vs a real download link,
    without ever putting financial figures on the wire for a role this
    project has decided must never see them."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    return {"status": service.get_invoice_status(db, booking_id)}


@router.get("/bookings/{booking_id}/invoice/download")
def download_invoice(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Decision 102: admin OR the booking's own agent -- but ONLY when
    the invoice's status is "Issued". A Draft invoice's content is
    never reachable through this endpoint for anyone but an admin (via
    the existing GET .../invoice), matching the Draft-invisibility
    principle Decision 079 established and this decision's own leak fix
    reinforces elsewhere on this page."""
    booking = _run(lambda: booking_service.get_booking(db, booking_id))
    _require_admin_or_owning_agent(current_user, booking)
    invoice = _run(lambda: service.get_invoice_by_booking(db, booking_id))
    role = (current_user.role or "").strip().lower()
    if role != "admin" and invoice.status != "Issued":
        raise HTTPException(status_code=404, detail="Invoice not yet issued")
    content = service.build_invoice_download_text(db, invoice)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{invoice.invoice_number}.txt"'},
    )


# ---------------------------------------------------------------------------
# BookingCommercialLine -- per-room, per-category cost/price ledger with a
# manual adjustment mechanism (see service.py's own section docstring).
# Admin-only, same boundary as the rest of this router's money endpoints.
# ---------------------------------------------------------------------------

@router.put("/bookings/{booking_id}/hotel-confirmation")
def put_hotel_confirmation(
    booking_id: int,
    data: HotelPriceConfirmationUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 191: record what the hotel says this BOOKING costs us -- one
    figure for the whole application, matching the single email the hotel
    sends whether it covers 1 room or 8. Admin-only: this is our cost side."""
    _require_admin(current_user)
    return _run(
        lambda: service.set_hotel_price_confirmation(
            db, booking_id, data.confirmed_amount,
            data.hotel_reference, data.note, current_user.id,
        )
    )


@router.get(
    "/booking-rooms/{booking_room_id}/commercial-lines",
    response_model=list[BookingCommercialLineResponse],
)
def get_commercial_lines(booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Auto-seeds room/transfer/tax on first call for this room (idempotent -- see service.get_or_seed_commercial_lines)."""
    _require_admin(current_user)
    return _run(lambda: service.get_or_seed_commercial_lines(db, booking_room_id))


@router.put(
    "/booking-rooms/{booking_room_id}/commercial-lines/{category}",
    response_model=BookingCommercialLineResponse,
)
def put_commercial_line(
    booking_room_id: int,
    category: str,
    data: BookingCommercialLineUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create-or-update one category's line. Body fields are all
    optional -- only what's provided changes (see
    service.upsert_commercial_line)."""
    _require_admin(current_user)
    return _run(
        lambda: service.upsert_commercial_line(
            db,
            booking_room_id,
            category,
            base_cost=data.base_cost,
            base_price=data.base_price,
            adjustment_cost=data.adjustment_cost,
            adjustment_price=data.adjustment_price,
            note=data.note,
            user_id=current_user.id,
        )
    )
