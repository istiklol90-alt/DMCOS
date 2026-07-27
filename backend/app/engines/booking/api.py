from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.booking import service
from app.engines.booking.models import Booking
from app.engines.booking.repository import get_db
from app.engines.booking.schemas import (
    BookingCreate,
    BookingUpdate,
    BookingCancelRequest,
    ConfirmCancellationRequest,
    BookingDateChangeRequest,
    BookingResponse,
    GuestCreate,
    GuestUpdate,
    GuestResponse,
    BookingCorrespondenceSendRequest,
    BookingCorrespondenceReplyRequest,
    BookingCorrespondenceResponse,
    BookingApplicationCreate,
    BookingApplicationResponse,
    BookingRoomResponse,
    BookingRoomRejectRequest,
    BookingRoomUpdate,
)
from app.engines.hotel import service as hotel_service
from app.engines.contract import service as contract_service
from models.user import User
from services import email_service

router = APIRouter(prefix="/booking-engine", tags=["Booking Engine"])

# See Decision 006 (11_Decisions.md): this duplicates the JWT-decode logic
# from authentication/api.py's change_password endpoint (and from Hotel
# and Contract Engine's api.py) rather than importing a shared dependency,
# because Authentication Engine never exposed one and is LOCKED. Accepted
# as known technical debt until a dedicated task extracts a shared,
# importable auth dependency — this is now the third Engine repeating the
# duplication Decision 006 predicted.
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
    HTTP 400. Same known simplification as Hotel/Contract Engine's
    api.py: all service.py/validators.py failures raise plain ValueError
    (not-found and invalid-input alike), so everything maps to 400 here
    rather than a 400/404 split.
    """
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _require_owner_or_admin(current_user, booking) -> None:
    """
    Authorization check for the three agent-initiated edit paths
    (change-dates, guest edit, flight-number edit via update_booking):
    the requesting user must either be the booking's own agent, or hold
    the Admin role. Deliberately a real HTTP 403 here, not folded into
    _run's generic ValueError->400 convention — this is an authorization
    failure, not a business-rule validation failure, and the project
    owner asked for it to read as a distinct permission error.

    Only "Admin" is exempted (case-insensitive) — Manager isn't wired to
    any booking-editing surface yet, so exempting it now would be
    speculative; revisit if/when a Manager-facing booking UI exists.
    """
    role = (current_user.role or "").strip().lower()
    if role == "admin":
        return
    if current_user.id != booking.agent_id:
        raise HTTPException(status_code=403, detail="You can only modify bookings you own")


def _require_admin(current_user) -> None:
    """
    Decision 103: closes a real, previously-flagged gap on claim_booking/
    send_correspondence/add_correspondence_reply (see each endpoint's own
    docstring) -- these three are not an ownership question the way
    _require_owner_or_admin's endpoints are (an agent editing their OWN
    booking); they're a manager/admin acting on a booking on the
    company's behalf (taking review ownership, or communicating
    externally with a hotel), so no agent -- including the booking's own
    owning agent -- is exempted here. No distinct "Manager" role exists
    in Authentication Engine yet, same simplification Finance/Pricing
    Engine's own _require_admin already made for their admin-only
    surfaces.
    """
    role = (current_user.role or "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _send_confirmation_email_best_effort(db: Session, booking: Booking) -> None:
    """
    Decision 029 Stage 2 (see email_service.send_booking_confirmation_email's
    own docstring for the full reasoning): fires once, right after a
    booking is successfully created. Deliberately wrapped in its own
    try/except covering the WHOLE block -- send_real_email itself already
    can't raise, but every resolution step here (Hotel/Contract Engine
    lookups, a second real pricing call) genuinely could, and an email
    problem must never turn an already-successful booking creation into
    an error response. Failures are printed, not silently swallowed --
    same "never hide a real problem, just never let it block the caller"
    principle as send_real_email's own internal handling.
    """
    try:
        agent = db.query(User).filter(User.id == booking.agent_id).first()
        if agent is None:
            return

        hotel = hotel_service.get_hotel(db, booking.hotel_id)
        room_type = hotel_service.get_room_type(db, booking.room_type_id)
        meal_plan = contract_service.get_contract_meal_plan(db, booking.meal_plan_id)

        price = contract_service.get_room_price(
            db,
            booking.contract_id,
            booking.room_type_id,
            booking.arrival_date,
            booking.departure_date,
            meal_plan.meal_code,
            booking.adults,
            booking.children,
            booking.infants,
        )
        tax = contract_service.get_mandatory_tax(
            db, booking.contract_id, booking.nights, booking.adults, booking.children
        )

        transfer_name = None
        transfer_total = None
        if booking.transfer_type:
            options = contract_service.list_contract_transfer_options(db, booking.contract_id)
            matched = next((o for o in options if o.transfer_type == booking.transfer_type), None)
            transfer_name = matched.transfer_name if matched else booking.transfer_type
            transfer_total = booking.transfer_total

        offer_names = []
        for promo_id in price.get("applied_promotions", []):
            try:
                offer_names.append(contract_service.get_promotion(db, promo_id).promotion_name)
            except ValueError:
                pass
        for offer_id in price.get("applied_special_offer_ids", []):
            try:
                offer_names.append(contract_service.get_special_offer(db, offer_id).offer_name)
            except ValueError:
                pass

        # Real result, not assumed empty -- guest creation is always a
        # separate, later POST /booking-engine/guests call (confirmed
        # directly: BookingCreate has no guest fields at all), so this is
        # typically [] at this exact trigger point. Rendered honestly by
        # send_booking_confirmation_email when empty, never fabricated.
        guests = service.list_guests(db, booking.id)
        guest_names = ", ".join(f"{g.first_name} {g.last_name}" for g in guests)

        grand_total = price["final_total"] + tax["total"] + (transfer_total or 0)

        email_service.send_booking_confirmation_email(
            {
                "agent_email": agent.email,
                "agent_name": agent.name,
                "booking_number": booking.booking_number,
                "hotel_name": hotel.hotel_name,
                "room_type_name": room_type.room_name,
                "arrival_date": str(booking.arrival_date),
                "departure_date": str(booking.departure_date),
                "nights": booking.nights,
                "meal_plan_name": meal_plan.meal_name or meal_plan.meal_code,
                "adults": booking.adults,
                "children": booking.children,
                "infants": booking.infants,
                "guest_names": guest_names,
                "base_total": price["base_total"],
                "supplements_total": price["supplements_total"],
                "offer_names": ", ".join(offer_names),
                "room_total": price["final_total"],
                "tax_label": tax["label"] or "Обязательный сбор",
                "tax_total": tax["total"],
                "transfer_name": transfer_name,
                "transfer_total": transfer_total,
                "grand_total": grand_total,
            }
        )
    except Exception as e:
        print(f"Booking confirmation email failed (booking id={booking.id}): {e}")


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


@router.post("/bookings", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    data: BookingCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Full reserve-at-creation flow — see service.create_booking's docstring. Results in status="Pending", not "Draft". Also fires an automatic booking-confirmation email to the agent (Decision 029 Stage 2, best-effort — see _send_confirmation_email_best_effort)."""
    booking = _run(lambda: service.create_booking(db, data))
    _send_confirmation_email_best_effort(db, booking)
    return booking


@router.get("/bookings", response_model=list[BookingResponse])
def list_bookings(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_bookings(db, skip=skip, limit=limit))


@router.get("/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_booking(db, booking_id))


@router.get("/bookings/by-number/{booking_number}", response_model=BookingResponse)
def get_booking_by_number(
    booking_number: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_booking_by_number(db, booking_number))


@router.get("/agents/{agent_id}/bookings", response_model=list[BookingResponse])
def list_bookings_by_agent(
    agent_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_bookings_by_agent(db, agent_id))


@router.get("/hotels/{hotel_id}/bookings", response_model=list[BookingResponse])
def list_bookings_by_hotel(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_bookings_by_hotel(db, hotel_id))


@router.put("/bookings/{booking_id}", response_model=BookingResponse)
def update_booking(
    booking_id: int,
    data: BookingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """status cannot be set to "Cancelled" here at the type level (BookingUpdatableStatus excludes it) — use the dedicated /cancel endpoint."""
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, existing)
    return _run(lambda: service.update_booking(db, booking_id, data))


@router.post("/bookings/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int,
    data: BookingCancelRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 104: stage 1 of 2 of the cancellation workflow. Computes and
    freezes cancellation_fee via Contract Engine's get_cancellation_policy,
    records the request (status="Cancellation Requested", reason,
    timestamp, fee, who) atomically. Requires a reason (02_Logic_Rules.md
    #49). Deliberately does NOT release the allotment anymore — see
    /confirm-cancellation below for stage 2, which does.
    """
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, existing)
    return _run(lambda: service.cancel_booking(db, booking_id, data, cancelled_by=current_user.id))


@router.post("/bookings/{booking_id}/confirm-cancellation", response_model=BookingResponse)
def confirm_cancellation(
    booking_id: int,
    data: ConfirmCancellationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 104: stage 2 of 2. Finalizes a "Cancellation Requested"
    booking as "Cancelled" once the hotel's own cancellation
    acknowledgment reference is in hand — this is what actually releases
    the allotment. Admin-only (_require_admin, added in Decision 103):
    mirrors confirmation_number's existing precedent (only a
    manager/admin records what a hotel told them) — an agent can request
    a cancellation on their own booking, but does not confirm it.
    """
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_admin(current_user)
    return _run(
        lambda: service.confirm_cancellation(db, booking_id, data, confirmed_by=current_user.id)
    )


@router.post("/bookings/{booking_id}/claim", response_model=BookingResponse)
def claim_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    "Взято в работу" (Decision 045). claimed_by is resolved server-side
    from current_user.id, never accepted as client input -- same "never
    trust client input for identity" precedent as created_by/reviewer_id
    elsewhere in this project.

    Deliberately NOT wrapped in _require_owner_or_admin: that check
    verifies an AGENT owns the booking they're editing (change-dates,
    cancel, update), the opposite direction from claiming -- a manager
    taking ownership of reviewing someone else's booking. Gated by
    _require_admin instead (Decision 103, closing what was previously a
    known, flagged gap where any authenticated user could call this).
    """
    _require_admin(current_user)
    return _run(lambda: service.claim_booking(db, booking_id, claimed_by=current_user.id))


@router.post("/bookings/{booking_id}/change-dates", response_model=BookingResponse)
def change_booking_dates(
    booking_id: int,
    data: BookingDateChangeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dedicated date-change flow (Decision 029, Stage 1): re-validates availability and re-prices for the new dates, reserves the new dates before releasing the old ones, and records the change (reason + timestamp). Requires a reason, same audit precedent as cancellation."""
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, existing)
    return _run(lambda: service.change_booking_dates(db, booking_id, data))


# ---------------------------------------------------------------------------
# Multi-room booking application (Stage 2)
# ---------------------------------------------------------------------------


def _assemble_application_response(db: Session, booking: Booking) -> BookingApplicationResponse:
    """
    Booking has no ORM relationship() to BookingRoom/Guest (this project
    never uses SQLAlchemy relationships, per every other Engine's own
    precedent), so the full application view is assembled explicitly here
    rather than via response_model's automatic from_attributes pass-through.
    """
    rooms = service.list_booking_rooms(db, booking.id)
    guests = service.list_guests(db, booking.id)
    return BookingApplicationResponse(
        id=booking.id,
        booking_number=booking.booking_number,
        agent_id=booking.agent_id,
        status=booking.status,
        special_requests=booking.special_requests,
        arrival_flight_number=booking.arrival_flight_number,
        departure_flight_number=booking.departure_flight_number,
        arrival_flight_date=booking.arrival_flight_date,
        arrival_flight_time=booking.arrival_flight_time,
        departure_flight_date=booking.departure_flight_date,
        departure_flight_time=booking.departure_flight_time,
        claimed_by=booking.claimed_by,
        claimed_at=booking.claimed_at,
        cancellation_reason=booking.cancellation_reason,
        cancelled_at=booking.cancelled_at,
        cancelled_by=booking.cancelled_by,
        created_by=booking.created_by,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        rooms=[BookingRoomResponse.model_validate(r) for r in rooms],
        guests=[GuestResponse.model_validate(g) for g in guests],
    )


@router.post(
    "/applications", response_model=BookingApplicationResponse, status_code=status.HTTP_201_CREATED
)
def create_booking_application(
    data: BookingApplicationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """
    Create a multi-room (1 or more rooms) booking application — see
    service.create_booking_application's docstring for the full
    partial-fulfillment/destination-constraint/guest-assignment behavior.
    """
    booking = _run(lambda: service.create_booking_application(db, data))
    return _assemble_application_response(db, booking)


@router.get("/applications/{booking_id}", response_model=BookingApplicationResponse)
def get_booking_application(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    booking = _run(lambda: service.get_booking(db, booking_id))
    return _assemble_application_response(db, booking)


@router.get("/bookings/{booking_id}/rooms", response_model=list[BookingRoomResponse])
def list_booking_rooms(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_booking_rooms(db, booking_id))


@router.get("/rooms/pending-approval", response_model=list[BookingRoomResponse])
def list_pending_approval_rooms(
    db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """
    Stage 3's "needs urgent approve" list — every room whose allotment
    reserved successfully and is still awaiting a manager's approve/
    reject decision. Registered BEFORE /rooms/{booking_room_id} so
    FastAPI doesn't try to match "pending-approval" as an int path param
    (same route-ordering class of bug already documented elsewhere in
    this project for /agent-registrations/stats).
    """
    _require_admin(current_user)
    return _run(lambda: service.list_pending_approval_rooms(db))


@router.get("/rooms/{booking_room_id}", response_model=BookingRoomResponse)
def get_booking_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_booking_room(db, booking_room_id))


@router.post("/rooms/{booking_room_id}/approve", response_model=BookingRoomResponse)
def approve_booking_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Manager's explicit sign-off on a Pending room — the only path that ever sets a room to "Confirmed" (the system never auto-confirms). Admin-only, same convention as claim_booking/confirm_cancellation."""
    _require_admin(current_user)
    return _run(lambda: service.approve_booking_room(db, booking_room_id, approved_by=current_user.id))


@router.post("/rooms/{booking_room_id}/reject", response_model=BookingRoomResponse)
def reject_booking_room(
    booking_room_id: int,
    data: BookingRoomRejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manager declining a Pending room's approve request — always requires a reason. Releases the allotment this room was holding. Admin-only, same convention as approve."""
    _require_admin(current_user)
    return _run(lambda: service.reject_booking_room(db, booking_room_id, data, rejected_by=current_user.id))


@router.put("/rooms/{booking_room_id}", response_model=BookingRoomResponse)
def update_booking_room(
    booking_room_id: int,
    data: BookingRoomUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update one room's confirmation_number/special_requests — same admin-or-owning-agent shape as update_booking, since setting a room's confirmation number is a normal part of processing an agent's own booking, not a manager-only decision like approve/reject."""
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    booking = _run(lambda: service.get_booking(db, room.booking_id))
    _require_owner_or_admin(current_user, booking)
    update_data = data.model_dump(exclude_unset=True)
    return _run(lambda: service.update_booking_room(db, booking_room_id, **update_data))


@router.get("/rooms/{booking_room_id}/guests", response_model=list[GuestResponse])
def list_guests_for_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_guests_for_room(db, booking_room_id))


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


@router.post("/guests", response_model=GuestResponse, status_code=status.HTTP_201_CREATED)
def create_guest(
    data: GuestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_guest(db, data))


@router.get("/guests/{guest_id}", response_model=GuestResponse)
def get_guest(guest_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.get_guest(db, guest_id))


@router.get("/bookings/{booking_id}/guests", response_model=list[GuestResponse])
def list_guests(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_guests(db, booking_id))


@router.put("/guests/{guest_id}", response_model=GuestResponse)
def update_guest(
    guest_id: int,
    data: GuestUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    guest = _run(lambda: service.get_guest(db, guest_id))
    booking = _run(lambda: service.get_booking(db, guest.booking_id))
    _require_owner_or_admin(current_user, booking)
    fields = data.model_dump(exclude_unset=True)
    return _run(lambda: service.update_guest(db, guest_id, **fields))


# ---------------------------------------------------------------------------
# Booking Correspondence (Decision 049)
# ---------------------------------------------------------------------------


@router.get("/bookings/{booking_id}/correspondence", response_model=list[BookingCorrespondenceResponse])
def list_correspondence(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_correspondence(db, booking_id))


@router.post(
    "/bookings/{booking_id}/correspondence/send",
    response_model=BookingCorrespondenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_correspondence(
    booking_id: int,
    data: BookingCorrespondenceSendRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Records an outbound message (typically the Decision 046 LPO text) --
    no real email is sent (record-only, see service.py). Deliberately
    NOT wrapped in _require_owner_or_admin: same reasoning as Decision
    045's claim_booking -- this is a manager/admin communicating with a
    hotel on the company's behalf, not the owning agent editing their
    own booking, so that check's semantics don't fit. Gated by
    _require_admin instead (Decision 103, closing what was previously a
    known, flagged gap where any authenticated user could call this --
    a real risk for an outbound-communication action once real email
    sending is ever wired up, independent of today's record-only state).
    """
    _require_admin(current_user)
    return _run(
        lambda: service.send_correspondence(
            db,
            booking_id,
            data.subject,
            data.body,
            data.recipient_email,
            data.recipient_email_secondary,
            current_user.id,
        )
    )


@router.post(
    "/bookings/{booking_id}/correspondence/reply",
    response_model=BookingCorrespondenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_correspondence_reply(
    booking_id: int,
    data: BookingCorrespondenceReplyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manually log a hotel's reply -- no real IMAP integration yet (Decision 029 Stage 3+). Same authorization note as send_correspondence above; also gated by _require_admin (Decision 103)."""
    _require_admin(current_user)
    return _run(
        lambda: service.add_correspondence_reply(db, booking_id, data.subject, data.body, current_user.id)
    )
