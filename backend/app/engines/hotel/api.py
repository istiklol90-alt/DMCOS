from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.hotel import service
from app.engines.hotel.repository import get_db
from app.engines.hotel.schemas import (
    HotelCategoryCreate,
    HotelCategoryResponse,
    HotelCreate,
    HotelUpdate,
    HotelResponse,
    HotelImageCreate,
    HotelImageResponse,
    HotelFacilityCreate,
    HotelFacilityResponse,
    RoomTypeCreate,
    RoomTypeUpdate,
    RoomTypeResponse,
    RoomImageCreate,
    RoomImageResponse,
    RoomOccupancyOptionCreate,
    RoomOccupancyOptionUpdate,
    RoomOccupancyOptionResponse,
    RoomAvailabilityCreate,
    RoomAvailabilityUpdate,
    RoomAvailabilityResponse,
)

router = APIRouter(prefix="/hotel-engine", tags=["Hotel Engine"])

# See Decision 006 (11_Decisions.md): this duplicates the JWT-decode logic
# from authentication/api.py's change_password endpoint rather than
# importing a shared dependency, because Authentication Engine never
# exposed one and is LOCKED. Accepted as known technical debt until a
# dedicated task extracts a shared, importable auth dependency.
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
    HTTP 400. All service.py/validators.py failures currently raise plain
    ValueError (not-found and validation errors alike, per the choice
    made when validators.py was approved), so everything maps to 400
    here rather than a mix of 400/404 — a known simplification, worth
    revisiting once exceptions.py grows real exception classes.
    """
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Hotel Category
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[HotelCategoryResponse])
def list_hotel_categories(
    db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_hotel_categories(db))


@router.post(
    "/categories", response_model=HotelCategoryResponse, status_code=status.HTTP_201_CREATED
)
def create_hotel_category(
    data: HotelCategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_hotel_category(db, data))


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------


@router.post("/hotels", response_model=HotelResponse, status_code=status.HTTP_201_CREATED)
def create_hotel(
    data: HotelCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_hotel(db, data))


@router.get("/hotels", response_model=list[HotelResponse])
def list_hotels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_hotels(db, skip=skip, limit=limit))


@router.get("/hotels/{hotel_id}", response_model=HotelResponse)
def get_hotel(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_hotel(db, hotel_id))


@router.put("/hotels/{hotel_id}", response_model=HotelResponse)
def update_hotel(
    hotel_id: int,
    data: HotelUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_hotel(db, hotel_id, data))


# ---------------------------------------------------------------------------
# Hotel Image
# ---------------------------------------------------------------------------


@router.post(
    "/hotel-images", response_model=HotelImageResponse, status_code=status.HTTP_201_CREATED
)
def create_hotel_image(
    data: HotelImageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_hotel_image(db, data))


@router.get("/hotels/{hotel_id}/images", response_model=list[HotelImageResponse])
def list_hotel_images(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_hotel_images(db, hotel_id))


# ---------------------------------------------------------------------------
# Hotel Facility
# ---------------------------------------------------------------------------


@router.post(
    "/hotel-facilities",
    response_model=HotelFacilityResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_hotel_facility(
    data: HotelFacilityCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_hotel_facility(db, data))


@router.get("/hotels/{hotel_id}/facilities", response_model=list[HotelFacilityResponse])
def list_hotel_facilities(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_hotel_facilities(db, hotel_id))


# ---------------------------------------------------------------------------
# Room Type
# ---------------------------------------------------------------------------


@router.post("/room-types", response_model=RoomTypeResponse, status_code=status.HTTP_201_CREATED)
def create_room_type(
    data: RoomTypeCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_room_type(db, data))


@router.get("/hotels/{hotel_id}/room-types", response_model=list[RoomTypeResponse])
def list_room_types(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_room_types(db, hotel_id))


@router.get("/room-types/{room_type_id}", response_model=RoomTypeResponse)
def get_room_type(
    room_type_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_room_type(db, room_type_id))


@router.put("/room-types/{room_type_id}", response_model=RoomTypeResponse)
def update_room_type(
    room_type_id: int,
    data: RoomTypeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_room_type(db, room_type_id, data))


# ---------------------------------------------------------------------------
# Room Image
# ---------------------------------------------------------------------------


@router.post(
    "/room-images", response_model=RoomImageResponse, status_code=status.HTTP_201_CREATED
)
def create_room_image(
    data: RoomImageCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_room_image(db, data))


@router.get("/room-types/{room_type_id}/images", response_model=list[RoomImageResponse])
def list_room_images(
    room_type_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_room_images(db, room_type_id))


# ---------------------------------------------------------------------------
# Room Occupancy Option
# ---------------------------------------------------------------------------


@router.post(
    "/room-occupancy-options",
    response_model=RoomOccupancyOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_room_occupancy_option(
    data: RoomOccupancyOptionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_room_occupancy_option(db, data))


@router.get(
    "/hotels/{hotel_id}/occupancy-options",
    response_model=list[RoomOccupancyOptionResponse],
)
def list_hotel_occupancy_options(
    hotel_id: int,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 206: every room type's occupancy options (with sleeping
    places) for one hotel in a single request -- what the search page and
    the booking card need, one call per hotel rather than per room."""
    return _run(lambda: service.list_room_occupancy_options_for_hotel(db, hotel_id, active_only=active_only))


@router.put(
    "/room-occupancy-options/{option_id}",
    response_model=RoomOccupancyOptionResponse,
)
def update_room_occupancy_option(
    option_id: int,
    data: RoomOccupancyOptionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Decision 206: edit an occupancy option -- counts, active flag,
    sleeping places, note. Admin only (the admin "Rooms & beds" screen)."""
    if (current_user.role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return _run(lambda: service.update_room_occupancy_option_details(db, option_id, data))


@router.get(
    "/room-types/{room_type_id}/occupancy-options",
    response_model=list[RoomOccupancyOptionResponse],
)
def list_room_occupancy_options(
    room_type_id: int,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(
        lambda: service.list_room_occupancy_options(db, room_type_id, active_only=active_only)
    )


# ---------------------------------------------------------------------------
# Room Availability
# ---------------------------------------------------------------------------


@router.post(
    "/room-availability",
    response_model=RoomAvailabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_room_availability(
    data: RoomAvailabilityCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Strict create — fails if a row for this room_type_id + date already exists. Use the PUT endpoint below for a calendar UI that shouldn't care whether the day already has a row."""
    return _run(lambda: service.create_room_availability(db, data))


@router.get(
    "/room-types/{room_type_id}/availability", response_model=list[RoomAvailabilityResponse]
)
def list_room_availability(
    room_type_id: int,
    start_date: date_type | None = None,
    end_date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(
        lambda: service.list_room_availability(db, room_type_id, start_date, end_date)
    )


@router.put(
    "/room-types/{room_type_id}/availability/{target_date}",
    response_model=RoomAvailabilityResponse,
)
def set_room_availability_status(
    room_type_id: int,
    target_date: date_type,
    data: RoomAvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Calendar-friendly upsert — creates the day's row if it doesn't exist yet, or updates it if it does. This is the endpoint a day-by-day availability calendar UI should call."""
    return _run(
        lambda: service.set_room_availability_status(
            db, room_type_id, target_date, data.status
        )
    )
