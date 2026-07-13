from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.booking import service
from app.engines.booking.repository import get_db
from app.engines.booking.schemas import (
    BookingCreate,
    BookingUpdate,
    BookingCancelRequest,
    BookingDateChangeRequest,
    BookingResponse,
    GuestCreate,
    GuestUpdate,
    GuestResponse,
    BookingCorrespondenceSendRequest,
    BookingCorrespondenceReplyRequest,
    BookingCorrespondenceResponse,
)

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


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


@router.post("/bookings", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    data: BookingCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Full reserve-at-creation flow — see service.create_booking's docstring. Results in status="Pending", not "Draft"."""
    return _run(lambda: service.create_booking(db, data))


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
    """Dedicated cancellation flow: computes cancellation_fee via Contract Engine's get_cancellation_policy, releases the reserved allotment, and records the cancellation atomically. Requires a reason (02_Logic_Rules.md #49)."""
    existing = _run(lambda: service.get_booking(db, booking_id))
    _require_owner_or_admin(current_user, existing)
    return _run(lambda: service.cancel_booking(db, booking_id, data))


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
    taking ownership of reviewing someone else's booking. Known, flagged
    gap (same precedent as Decision 032's Admin-only exemption): any
    authenticated user can currently call this, not just an Admin/Manager
    role -- Manager isn't wired to a distinct role check anywhere in
    Booking Engine yet, so adding one here would be speculative rather
    than addressing a concrete need.
    """
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
    no real email is sent. Deliberately NOT wrapped in
    _require_owner_or_admin: same reasoning as Decision 045's
    claim_booking -- this is a manager acting on a booking, not the
    owning agent editing their own, so that check's semantics don't fit.
    Known, flagged gap, same precedent as Decision 032/045: any
    authenticated user can currently call this.
    """
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
    """Manually log a hotel's reply -- no real IMAP integration yet (Decision 029 Stage 3+). Same authorization note as send_correspondence above."""
    return _run(
        lambda: service.add_correspondence_reply(db, booking_id, data.subject, data.body, current_user.id)
    )
