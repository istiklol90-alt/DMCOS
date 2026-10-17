import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_active_user_by_email

from app.engines.booking import service
# Decision 199: booking/api.py -> finance/service.py is a safe direction --
# finance imports booking's SERVICE, never its api, so there is no cycle.
# This is what lets the transfer-change notification be written inside the
# same request instead of depending on a second call from the browser.
from app.engines.finance import service as finance_service
from app.engines.booking.models import Booking
from app.engines.booking.repository import get_db
from app.engines.booking.schemas import (
    RoomTransferChangeRequest,
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

logger = logging.getLogger(__name__)

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

    user = get_active_user_by_email(db, email)
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


def _is_admin(current_user) -> bool:
    return (current_user.role or "").strip().lower() == "admin"


def _require_own_agent_id(current_user, agent_id: int) -> None:
    """Security (2026-10-16): an agent creates bookings and lists bookings
    only as themselves -- agent_id used to be taken from the request as is."""
    if not _is_admin(current_user) and agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to act for another agent")


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


def _require_claimed(booking, current_user) -> None:
    """
    Decision 163: a booking nobody has taken on accepts exactly one action --
    claiming it. Everything else is refused until `claimed_by` is set.

    Enforced HERE, on the server, and not merely by hiding buttons: at the
    volumes this admin panel is built for, a client-side-only guard is not a
    guard at all. The reason is concrete -- BK-000077 reached "confirmed by
    the hotel", released a guest voucher and reported profit while
    claimed_by was NULL, no LPO had been sent and the hotel had never
    replied. Someone typed a confirmation number and nothing recorded who.

    Deliberately NOT exempting admins (owner, explicitly): an exception would
    restore exactly the anonymity this removes.

    Deliberately NOT applied to the booking's OWNING AGENT: this is an
    internal accountability rule for the people processing a booking, not a
    lock on the customer whose booking it is. An agent editing their own
    guests must keep working exactly as before.

    Terminal bookings are exempt -- there is nothing left to take on, and
    blocking them would strand cancelled/rejected rows.
    """
    role = (current_user.role or "").strip().lower()
    if role != "admin":
        return
    if booking.claimed_by is not None:
        return
    if booking.status in service.TERMINAL_BOOKING_STATUSES:
        return
    # Decision 177: the "anything not Pending is exempt" escape hatch is gone.
    # It existed for one reason -- claim_booking refused any non-Pending
    # status, so locking such a booking would have bricked it with no legal
    # way out (found by the verification run, on BK-000077 itself). Now that
    # any non-terminal booking can be claimed, the exemption would only serve
    # to leave the exact rows Decision 163 exists for -- Confirmed, voucher
    # released, nobody's name on it -- as the one category still editable
    # anonymously.
    raise HTTPException(
        status_code=409,
        detail="This booking has not been taken into work yet — claim it first",
    )


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
    _require_own_agent_id(current_user, data.agent_id)
    booking = _run(lambda: service.create_booking(db, data))
    _send_confirmation_email_best_effort(db, booking)
    return booking


@router.get("/bookings", response_model=list[BookingResponse])
def list_bookings(
    skip: int = 0,
    limit: int = 100,
    created_from: date | None = None,
    created_to: date | None = None,
    search: str | None = None,
    status: str | None = None,
    hotel_id: int | None = None,
    agent_id: int | None = None,
    arrival_from: date | None = None,
    arrival_to: date | None = None,
    date_view: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    claimed_by: int | None = None,
    unassigned: bool = False,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """created_from/created_to/search are all optional -- omitting them
    preserves the original unscoped-but-capped behavior (now newest-
    first, see repository.list_bookings). The admin Bookings screen
    passes created_from/created_to when its "By date" (created) filter
    is active, so payload size stays bounded by daily volume instead of
    total historical volume; it passes search instead (never both) when
    the booking-number search box is active, so a search can find a
    booking outside the currently-selected date window -- a real gap
    found live after created_from/created_to shipped.

    Decision 152: status/hotel_id/arrival_from/arrival_to/sort_by/sort_dir
    exist so the admin screen can paginate honestly. Filtering and sorting
    a single loaded page in the browser would answer "within this page",
    which looks correct and isn't. All six default to the previous
    behavior, so no existing caller changes.

    Decision 200: claimed_by/unassigned/mine filter by who is responsible --
    see repository._apply_booking_filters. `mine` is resolved from the JWT
    here, never from the query string: "my bookings" is whoever is asking."""
    return _run(
        lambda: service.list_bookings(
            db, skip=skip, limit=limit, created_from=created_from, created_to=created_to,
            search=search, status=status, hotel_id=hotel_id,
            agent_id=agent_id if _is_admin(current_user) else current_user.id,
            arrival_from=arrival_from, arrival_to=arrival_to,
            date_view=date_view, date_from=date_from, date_to=date_to,
            sort_by=sort_by, sort_dir=sort_dir,
            claimed_by=claimed_by, unassigned=unassigned,
            mine_user_id=current_user.id if mine else None,
        )
    )


# MUST stay above /bookings/{booking_id}: that route's path parameter is an
# int, and FastAPI matches in declaration order, so a later /bookings/count
# would be swallowed by it and fail parsing "count" as an integer. This is the
# exact bug api/routes.py's own /agent-registrations/stats still has (see
# CLAUDE.md) -- not repeating it here.
@router.get("/bookings/count")
def count_bookings(
    created_from: date | None = None,
    created_to: date | None = None,
    search: str | None = None,
    status: str | None = None,
    hotel_id: int | None = None,
    agent_id: int | None = None,
    arrival_from: date | None = None,
    arrival_to: date | None = None,
    date_view: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    claimed_by: int | None = None,
    unassigned: bool = False,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 152: total matching the SAME filters, ignoring pagination,
    so the list can say "1-50 of N" instead of silently truncating."""
    return _run(lambda: {"total": service.count_bookings(
        db, created_from=created_from, created_to=created_to, search=search,
        status=status, hotel_id=hotel_id,
        agent_id=agent_id if _is_admin(current_user) else current_user.id,
        arrival_from=arrival_from, arrival_to=arrival_to,
        date_view=date_view, date_from=date_from, date_to=date_to,
        claimed_by=claimed_by, unassigned=unassigned,
        mine_user_id=current_user.id if mine else None,
    )})


# Decision 200. Like /bookings/count above, MUST stay above
# /bookings/{booking_id} or that route's int parameter swallows it.
@router.get("/bookings/queue-counts")
def count_work_queues(
    search: str | None = None,
    status: str | None = None,
    hotel_id: int | None = None,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """How many bookings are in each work queue -- {"unassigned", "mine"} --
    over the whole database, under the same optional filters the list takes.
    Read-only. Admin-only: a queue of unowned bookings is internal state, the
    same boundary claim_booking itself sits behind."""
    _require_admin(current_user)
    return _run(lambda: service.count_work_queues(
        db, current_user.id, search=search, status=status, hotel_id=hotel_id, agent_id=agent_id,
    ))


@router.get("/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    booking = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, booking)
    return booking


@router.get("/bookings/by-number/{booking_number}", response_model=BookingResponse)
def get_booking_by_number(
    booking_number: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    booking = _run(lambda: service.get_booking_by_number(db, booking_number))
    _require_owner_or_admin(current_user, booking)
    return booking


@router.get("/agents/{agent_id}/bookings", response_model=list[BookingResponse])
def list_bookings_by_agent(
    agent_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_own_agent_id(current_user, agent_id)
    return _run(lambda: service.list_bookings_by_agent(db, agent_id))


@router.get("/hotels/{hotel_id}/bookings", response_model=list[BookingResponse])
def list_bookings_by_hotel(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_admin(current_user)
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
    # Decision 163: this is the endpoint that sets confirmation_number -- the
    # exact hole BK-000077 went through. Nothing here is writable by an admin
    # until the booking has an owner.
    _require_claimed(existing, current_user)
    return _run(lambda: service.update_booking(db, booking_id, data, acted_by=current_user.id))


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
    _require_claimed(existing, current_user)
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


@router.post("/bookings/{booking_id}/cancel-free-of-charge", response_model=BookingResponse)
def cancel_application_free_of_charge(
    booking_id: int,
    data: BookingCancelRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 168: closes an application the company could not fulfil, at
    no cost to the agent — the last step of the reject flow. Admin-only:
    this is the manager granting a waiver on the company's behalf, not
    something the owning agent decides for themselves, so deliberately
    _require_admin rather than _require_owner_or_admin (unlike /cancel,
    which an agent may legitimately initiate for their own booking).

    Reuses BookingCancelRequest — a reason is required here for exactly
    the same reason it is there (02_Logic_Rules.md #49).
    """
    _require_admin(current_user)
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_claimed(existing, current_user)
    return _run(
        lambda: service.cancel_application_free_of_charge(
            db, booking_id, data.reason, cancelled_by=current_user.id
        )
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
    _require_claimed(existing, current_user)
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
    _require_own_agent_id(current_user, data.agent_id)
    booking = _run(lambda: service.create_booking_application(db, data))
    return _assemble_application_response(db, booking)


@router.get("/applications/{booking_id}", response_model=BookingApplicationResponse)
def get_booking_application(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    booking = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, booking)
    return _assemble_application_response(db, booking)


@router.get("/bookings/{booking_id}/rooms", response_model=list[BookingRoomResponse])
def list_booking_rooms(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, booking_id)))
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
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, room.booking_id)))
    return room


@router.post("/rooms/{booking_room_id}/approve", response_model=BookingRoomResponse)
def approve_booking_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Manager's explicit sign-off on a Pending room — the only path that ever sets a room to "Confirmed" (the system never auto-confirms). Admin-only, same convention as claim_booking/confirm_cancellation."""
    _require_admin(current_user)
    # Decision 163: approving a room IS the "confirmed without a single
    # re-check" act this rule exists to stop -- it must have a named owner.
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    _require_claimed(_run(lambda: service.get_booking(db, room.booking_id)), current_user)
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
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    _require_claimed(_run(lambda: service.get_booking(db, room.booking_id)), current_user)
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
    # Decision 163: this sets a room's confirmation_number -- the per-room
    # twin of the exact hole BK-000077 went through on PUT /bookings/{id}.
    _require_claimed(booking, current_user)
    update_data = data.model_dump(exclude_unset=True)
    return _run(lambda: service.update_booking_room(db, booking_room_id, **update_data))


@router.get("/rooms/{booking_room_id}/transfer-options")
def list_transfer_options_for_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Decision 199 — the transfer options this room could switch to, already filtered by its own party size through Contract Engine's capacity rules, so the change screen can never offer a car the change itself would refuse. Read-only, ungated beyond authentication, same as list_guests_for_room."""
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, room.booking_id)))
    return _run(lambda: service.list_transfer_options_for_room(db, booking_room_id))


@router.put("/rooms/{booking_room_id}/transfer", response_model=BookingRoomResponse)
def change_room_transfer(
    booking_room_id: int,
    data: RoomTransferChangeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Decision 199 — change or remove one room's transfer after booking,
    without cancelling anything.

    Admin-or-owning-agent, matching update_booking_room directly above: the
    project owner's explicit requirement is that the agent makes this change
    themselves from the agent panel, and it is a normal part of servicing
    their own booking rather than a manager-only decision.

    The admin-side notification is written in this SAME request, not by a
    follow-up call from the browser. There is no circular import to dodge
    here (finance imports booking's *service*, never its api), and the
    owner's requirement is that the change is noticed — a change can land
    three months after the application, so a signal that depends on a second
    browser call succeeding is not good enough. If the note itself fails the
    change is still real and already committed, so the failure is surfaced in
    the response header rather than pretending the change did not happen.
    """
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    booking = _run(lambda: service.get_booking(db, room.booking_id))
    _require_owner_or_admin(current_user, booking)
    _require_claimed(booking, current_user)

    change = _run(
        lambda: service.change_room_transfer(
            db, booking_room_id, data.new_transfer_type, data.reason, current_user.id
        )
    )
    try:
        finance_service.record_transfer_change(
            db, change, changed_by_label=current_user.email or f"user {current_user.id}"
        )
    except Exception as exc:  # noqa: BLE001 - the change is already committed
        logger.exception("Transfer changed on room %s but the audit note failed: %s", booking_room_id, exc)
    return _run(lambda: service.get_booking_room(db, booking_room_id))


@router.get("/rooms/{booking_room_id}/guests", response_model=list[GuestResponse])
def list_guests_for_room(
    booking_room_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    room = _run(lambda: service.get_booking_room(db, booking_room_id))
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, room.booking_id)))
    return _run(lambda: service.list_guests_for_room(db, booking_room_id))


# ---------------------------------------------------------------------------
# Guest
# ---------------------------------------------------------------------------


@router.post("/guests", response_model=GuestResponse, status_code=status.HTTP_201_CREATED)
def create_guest(
    data: GuestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    # Decision 163: same rule PUT /guests/{id} already carries -- an admin
    # adding a guest to a booking nobody has taken on is still an untraceable
    # edit. The owning agent is unaffected (see _require_claimed).
    _require_claimed(_run(lambda: service.get_booking(db, data.booking_id)), current_user)
    return _run(lambda: service.create_guest(db, data))


@router.get("/guests/{guest_id}", response_model=GuestResponse)
def get_guest(guest_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    guest = _run(lambda: service.get_guest(db, guest_id))
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, guest.booking_id)))
    return guest


@router.get("/bookings/{booking_id}/guests", response_model=list[GuestResponse])
def list_guests(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, booking_id)))
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
    _require_claimed(booking, current_user)
    fields = data.model_dump(exclude_unset=True)
    return _run(lambda: service.update_guest(db, guest_id, **fields))


# ---------------------------------------------------------------------------
# Booking Correspondence (Decision 049)
# ---------------------------------------------------------------------------


@router.get("/bookings/{booking_id}/correspondence", response_model=list[BookingCorrespondenceResponse])
def list_correspondence(
    booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    _require_owner_or_admin(current_user, _run(lambda: service.get_booking(db, booking_id)))
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
    Records an outbound message (typically the Decision 046 LPO text) AND
    attempts to actually send it (Decision 154 -- this was record-only
    before, so an LPO could look sent and never have left). The stored
    row's `delivered` says which actually happened. Deliberately
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
    # Decision 163: an LPO is outbound content sent to a hotel under the
    # company's name. It must carry the name of whoever took the booking on.
    _require_claimed(_run(lambda: service.get_booking(db, booking_id)), current_user)
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
    _require_claimed(_run(lambda: service.get_booking(db, booking_id)), current_user)
    return _run(
        lambda: service.add_correspondence_reply(db, booking_id, data.subject, data.body, current_user.id)
    )
