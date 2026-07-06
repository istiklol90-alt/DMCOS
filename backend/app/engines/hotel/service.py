"""
Business/orchestration layer for the Hotel Engine.

Per 08_Coding_Standards.md ("Business logic inside Services", "Database
access through Repository Layer"), this module is the only place that:
  - calls validators.py before writing anything, and
  - decides which repository.py function to call for a given change.

Two schemas (HotelUpdate, RoomTypeUpdate) carry a `status` field alongside
ordinary profile fields, but repository.py deliberately splits status
changes into their own functions (update_hotel_status, etc.) so a status
transition is never silently bundled into an unrelated profile edit. The
update_hotel/update_room_type functions below are what perform that
split: they pull `status` out of an incoming update payload, validate it
separately, and route the two parts to their respective repository calls.
"""

from datetime import date as date_type
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.hotel import repository
from app.engines.hotel.models import (
    Hotel,
    HotelCategory,
    HotelImage,
    HotelFacility,
    RoomType,
    RoomImage,
    RoomOccupancyOption,
    RoomAvailability,
)
from app.engines.hotel.schemas import (
    HotelCategoryCreate,
    HotelCreate,
    HotelUpdate,
    HotelImageCreate,
    HotelFacilityCreate,
    RoomTypeCreate,
    RoomTypeUpdate,
    RoomImageCreate,
    RoomOccupancyOptionCreate,
    RoomAvailabilityCreate,
)
from app.engines.hotel.validators import (
    validate_hotel_status,
    validate_room_type_status,
    validate_room_availability_status,
    validate_star_rating,
    validate_occupancy_within_capacity,
    validate_date_range,
)


# ---------------------------------------------------------------------------
# Internal existence guards
# ---------------------------------------------------------------------------
# SQLite does not enforce the ForeignKey columns declared in models.py
# unless PRAGMA foreign_keys=ON is set (it isn't, in database/db.py), so
# these checks are what actually stop an orphaned child row from being
# created against a hotel/room type/category id that doesn't exist.


def _require_hotel(db: Session, hotel_id: int) -> Hotel:
    hotel = repository.get_hotel(db, hotel_id)
    if hotel is None:
        raise ValueError(f"Hotel {hotel_id} not found")
    return hotel


def _require_room_type(db: Session, room_type_id: int) -> RoomType:
    room_type = repository.get_room_type(db, room_type_id)
    if room_type is None:
        raise ValueError(f"Room type {room_type_id} not found")
    return room_type


def _require_hotel_category(db: Session, category_id: int) -> HotelCategory:
    category = repository.get_hotel_category(db, category_id)
    if category is None:
        raise ValueError(f"Hotel category {category_id} not found")
    return category


# ---------------------------------------------------------------------------
# Hotel Category
# ---------------------------------------------------------------------------


def create_hotel_category(db: Session, data: HotelCategoryCreate) -> HotelCategory:
    """Create a new hotel category (e.g. Luxury, Adults Only) for use as a lookup value on hotels."""
    return repository.create_hotel_category(db, **data.model_dump())


def get_hotel_category(db: Session, category_id: int) -> HotelCategory:
    """Fetch one hotel category by id, or raise ValueError if it doesn't exist."""
    return _require_hotel_category(db, category_id)


def list_hotel_categories(db: Session) -> list[HotelCategory]:
    """Return every hotel category, for populating dropdowns/lookups."""
    return repository.list_hotel_categories(db)


def update_hotel_category(db: Session, category_id: int, **fields) -> HotelCategory:
    """Update an existing hotel category's name/description. Fields not passed are left untouched."""
    category = _require_hotel_category(db, category_id)
    return repository.update_hotel_category(db, category, **fields)


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------


def create_hotel(db: Session, data: HotelCreate) -> Hotel:
    """Create a new hotel. It always starts in "Draft" status (the model's default) — HotelCreate has no status field, so a hotel can never be created directly into a live status."""
    validate_star_rating(data.star_rating)
    if data.category_id is not None:
        _require_hotel_category(db, data.category_id)
    return repository.create_hotel(db, **data.model_dump())


def get_hotel(db: Session, hotel_id: int) -> Hotel:
    """Fetch one hotel by id, or raise ValueError if it doesn't exist."""
    return _require_hotel(db, hotel_id)


def list_hotels(db: Session, skip: int = 0, limit: int = 100) -> list[Hotel]:
    """Return a page of hotels for listing screens."""
    return repository.list_hotels(db, skip=skip, limit=limit)


def update_hotel(db: Session, hotel_id: int, data: HotelUpdate) -> Hotel:
    """
    Update a hotel's profile fields and/or status from a single HotelUpdate payload.

    status is deliberately split out and routed through update_hotel_status
    (which validates it) rather than being written alongside the other
    fields, matching repository.update_hotel's contract.
    """
    hotel = _require_hotel(db, hotel_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if "star_rating" in update_data:
        validate_star_rating(update_data["star_rating"])
    if update_data.get("category_id") is not None:
        _require_hotel_category(db, update_data["category_id"])

    if update_data:
        hotel = repository.update_hotel(db, hotel, **update_data)
    if new_status is not None:
        hotel = update_hotel_status(db, hotel_id, new_status)

    return hotel


def update_hotel_status(db: Session, hotel_id: int, status: str) -> Hotel:
    """Validate and apply a hotel status change (e.g. Draft -> Active) on its own, independent of profile edits."""
    hotel = _require_hotel(db, hotel_id)
    validate_hotel_status(status)
    return repository.update_hotel_status(db, hotel, status)


# ---------------------------------------------------------------------------
# Hotel Image
# ---------------------------------------------------------------------------


def create_hotel_image(db: Session, data: HotelImageCreate) -> HotelImage:
    """Attach a new image to a hotel. Raises ValueError if the hotel doesn't exist."""
    _require_hotel(db, data.hotel_id)
    return repository.create_hotel_image(db, **data.model_dump())


def get_hotel_image(db: Session, image_id: int) -> HotelImage:
    """Fetch one hotel image by id, or raise ValueError if it doesn't exist."""
    image = repository.get_hotel_image(db, image_id)
    if image is None:
        raise ValueError(f"Hotel image {image_id} not found")
    return image


def list_hotel_images(db: Session, hotel_id: int) -> list[HotelImage]:
    """Return all images for one hotel, in gallery display order."""
    return repository.list_hotel_images(db, hotel_id)


def update_hotel_image(db: Session, image_id: int, **fields) -> HotelImage:
    """Update an existing hotel image's title/display_order/etc. Fields not passed are left untouched."""
    image = get_hotel_image(db, image_id)
    return repository.update_hotel_image(db, image, **fields)


# ---------------------------------------------------------------------------
# Hotel Facility
# ---------------------------------------------------------------------------


def create_hotel_facility(db: Session, data: HotelFacilityCreate) -> HotelFacility:
    """Attach a new facility/amenity to a hotel. Raises ValueError if the hotel doesn't exist."""
    _require_hotel(db, data.hotel_id)
    return repository.create_hotel_facility(db, **data.model_dump())


def get_hotel_facility(db: Session, facility_id: int) -> HotelFacility:
    """Fetch one hotel facility by id, or raise ValueError if it doesn't exist."""
    facility = repository.get_hotel_facility(db, facility_id)
    if facility is None:
        raise ValueError(f"Hotel facility {facility_id} not found")
    return facility


def list_hotel_facilities(db: Session, hotel_id: int) -> list[HotelFacility]:
    """Return all facilities/amenities for one hotel, in display order."""
    return repository.list_hotel_facilities(db, hotel_id)


def update_hotel_facility(db: Session, facility_id: int, **fields) -> HotelFacility:
    """Update an existing hotel facility's fields. Fields not passed are left untouched."""
    facility = get_hotel_facility(db, facility_id)
    return repository.update_hotel_facility(db, facility, **fields)


# ---------------------------------------------------------------------------
# Room Type
# ---------------------------------------------------------------------------


def create_room_type(db: Session, data: RoomTypeCreate) -> RoomType:
    """Create a new room/villa type for a hotel. Always starts in "Draft" status, matching the hotel's own manual-publish lifecycle. Raises ValueError if the hotel doesn't exist."""
    _require_hotel(db, data.hotel_id)
    return repository.create_room_type(db, **data.model_dump())


def get_room_type(db: Session, room_type_id: int) -> RoomType:
    """Fetch one room type by id, or raise ValueError if it doesn't exist."""
    return _require_room_type(db, room_type_id)


def list_room_types(db: Session, hotel_id: int) -> list[RoomType]:
    """Return all room/villa types for one hotel."""
    return repository.list_room_types(db, hotel_id)


def update_room_type(db: Session, room_type_id: int, data: RoomTypeUpdate) -> RoomType:
    """
    Update a room type's profile fields and/or status from a single RoomTypeUpdate payload.

    status is split out and routed through update_room_type_status (which
    validates it), same reasoning as update_hotel.
    """
    room_type = _require_room_type(db, room_type_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if update_data:
        room_type = repository.update_room_type(db, room_type, **update_data)
    if new_status is not None:
        room_type = update_room_type_status(db, room_type_id, new_status)

    return room_type


def update_room_type_status(db: Session, room_type_id: int, status: str) -> RoomType:
    """Validate and apply a room type status change (e.g. Draft -> Active) on its own, independent of profile edits."""
    room_type = _require_room_type(db, room_type_id)
    validate_room_type_status(status)
    return repository.update_room_type_status(db, room_type, status)


# ---------------------------------------------------------------------------
# Room Image
# ---------------------------------------------------------------------------


def create_room_image(db: Session, data: RoomImageCreate) -> RoomImage:
    """Attach a new image to a room type. Raises ValueError if the room type doesn't exist."""
    _require_room_type(db, data.room_type_id)
    return repository.create_room_image(db, **data.model_dump())


def get_room_image(db: Session, image_id: int) -> RoomImage:
    """Fetch one room image by id, or raise ValueError if it doesn't exist."""
    image = repository.get_room_image(db, image_id)
    if image is None:
        raise ValueError(f"Room image {image_id} not found")
    return image


def list_room_images(db: Session, room_type_id: int) -> list[RoomImage]:
    """Return all images for one room type, in gallery display order."""
    return repository.list_room_images(db, room_type_id)


def update_room_image(db: Session, image_id: int, **fields) -> RoomImage:
    """Update an existing room image's fields. Fields not passed are left untouched."""
    image = get_room_image(db, image_id)
    return repository.update_room_image(db, image, **fields)


# ---------------------------------------------------------------------------
# Room Occupancy Option
# ---------------------------------------------------------------------------


def create_room_occupancy_option(
    db: Session, data: RoomOccupancyOptionCreate
) -> RoomOccupancyOption:
    """Add a valid guest combination (adults/children/infants) to a room type. Raises ValueError if the room type doesn't exist or the combination exceeds its max_occupancy."""
    room_type = _require_room_type(db, data.room_type_id)
    validate_occupancy_within_capacity(room_type, data.adults, data.children)
    return repository.create_room_occupancy_option(db, **data.model_dump())


def get_room_occupancy_option(db: Session, option_id: int) -> RoomOccupancyOption:
    """Fetch one occupancy option by id, or raise ValueError if it doesn't exist."""
    option = repository.get_room_occupancy_option(db, option_id)
    if option is None:
        raise ValueError(f"Room occupancy option {option_id} not found")
    return option


def list_room_occupancy_options(
    db: Session, room_type_id: int, active_only: bool = False
) -> list[RoomOccupancyOption]:
    """Return the valid guest combinations for one room type."""
    return repository.list_room_occupancy_options(db, room_type_id, active_only=active_only)


def update_room_occupancy_option(db: Session, option_id: int, **fields) -> RoomOccupancyOption:
    """
    Update an occupancy option's adults/children/infants counts.

    Re-validates against the parent room type's max_occupancy using
    whichever of adults/children is being changed, combined with whichever
    is being left as-is — so a partial update can't sneak past the cap.
    """
    option = get_room_occupancy_option(db, option_id)
    room_type = _require_room_type(db, option.room_type_id)

    new_adults = fields.get("adults", option.adults)
    new_children = fields.get("children", option.children)
    validate_occupancy_within_capacity(room_type, new_adults, new_children)

    return repository.update_room_occupancy_option(db, option, **fields)


def set_room_occupancy_option_active(
    db: Session, option_id: int, is_active: bool
) -> RoomOccupancyOption:
    """Enable or disable an occupancy combination without deleting it, so booking history referencing it stays intact."""
    option = get_room_occupancy_option(db, option_id)
    return repository.set_room_occupancy_option_active(db, option, is_active)


# ---------------------------------------------------------------------------
# Room Availability
# ---------------------------------------------------------------------------


def create_room_availability(db: Session, data: RoomAvailabilityCreate) -> RoomAvailability:
    """
    Create one day's availability status for a room type.

    Raises ValueError if the room type doesn't exist, if the status isn't
    one of the three valid values, or if a row for that room_type_id +
    date already exists — this pre-check exists so callers get a clean
    ValueError instead of an unhandled DB-level IntegrityError from the
    table's unique constraint (flagged when repository.py was approved).
    """
    _require_room_type(db, data.room_type_id)
    validate_room_availability_status(data.status)

    existing = repository.get_room_availability_by_date(db, data.room_type_id, data.date)
    if existing is not None:
        raise ValueError(
            f"Room type {data.room_type_id} already has an availability row for {data.date}. "
            f"Use update_room_availability_status (or set_room_availability_status) instead."
        )

    return repository.create_room_availability(db, **data.model_dump())


def update_room_availability_status(
    db: Session, room_type_id: int, target_date: date_type, status: str
) -> RoomAvailability:
    """Change an existing day's status. Raises ValueError if no row exists yet for that room_type_id + date — use set_room_availability_status if you want it created automatically."""
    availability = repository.get_room_availability_by_date(db, room_type_id, target_date)
    if availability is None:
        raise ValueError(
            f"No availability row for room type {room_type_id} on {target_date}. "
            f"Use set_room_availability_status to create it."
        )
    validate_room_availability_status(status)
    return repository.update_room_availability_status(db, availability, status)


def set_room_availability_status(
    db: Session, room_type_id: int, target_date: date_type, status: str
) -> RoomAvailability:
    """
    Create-or-update a single day's status in one call.

    This is the function a day-by-day calendar UI should call when a
    manager clicks a date and sets its status — it doesn't require the
    caller to know in advance whether that day already has a row.
    """
    _require_room_type(db, room_type_id)
    validate_room_availability_status(status)

    existing = repository.get_room_availability_by_date(db, room_type_id, target_date)
    if existing is not None:
        return repository.update_room_availability_status(db, existing, status)
    return repository.create_room_availability(
        db, room_type_id=room_type_id, date=target_date, status=status
    )


def list_room_availability(
    db: Session,
    room_type_id: int,
    start_date: Optional[date_type] = None,
    end_date: Optional[date_type] = None,
) -> list[RoomAvailability]:
    """Return the day-by-day availability calendar for one room type, optionally bounded to a date range."""
    validate_date_range(start_date, end_date)
    return repository.list_room_availability(db, room_type_id, start_date, end_date)
