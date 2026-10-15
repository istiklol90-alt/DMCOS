from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.hotel.models import (
    HotelCategory,
    Hotel,
    HotelImage,
    HotelFacility,
    RoomType,
    RoomImage,
    RoomOccupancyOption,
    RoomAvailability,
)


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Hotel Category
# ---------------------------------------------------------------------------


def create_hotel_category(db: Session, **fields) -> HotelCategory:
    """Insert a new hotel category row (e.g. Luxury, Adults Only) from already-validated fields and return it with its generated id."""
    category = HotelCategory(**fields)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_hotel_category(db: Session, category_id: int) -> Optional[HotelCategory]:
    """Fetch one hotel category by its primary key, or None if it doesn't exist."""
    return db.query(HotelCategory).filter(HotelCategory.id == category_id).first()


def list_hotel_categories(db: Session) -> list[HotelCategory]:
    """Return every hotel category, ordered by name, for use in dropdowns/lookups."""
    return db.query(HotelCategory).order_by(HotelCategory.category_name).all()


def update_hotel_category(db: Session, category: HotelCategory, **fields) -> HotelCategory:
    """Apply the given field values to an existing hotel category row and persist them. Fields not passed are left untouched."""
    for key, value in fields.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------


def create_hotel(db: Session, **fields) -> Hotel:
    """Insert a new hotel row from already-validated fields (e.g. a HotelCreate schema's .model_dump()). New hotels start with the model's default status ("Draft") unless status is explicitly passed."""
    hotel = Hotel(**fields)
    db.add(hotel)
    db.commit()
    db.refresh(hotel)
    return hotel


def get_hotel(db: Session, hotel_id: int) -> Optional[Hotel]:
    """Fetch a single hotel by its primary key, or None if it doesn't exist."""
    return db.query(Hotel).filter(Hotel.id == hotel_id).first()


def list_hotels(db: Session, skip: int = 0, limit: int = 100) -> list[Hotel]:
    """Return a page of hotels ordered by id, for listing screens. Use skip/limit to paginate."""
    return db.query(Hotel).order_by(Hotel.id).offset(skip).limit(limit).all()


def update_hotel(db: Session, hotel: Hotel, **fields) -> Hotel:
    """Apply the given field values (e.g. name, address, star_rating) to an existing hotel row and persist them. Does not touch status — use update_hotel_status for that. Fields not passed are left untouched."""
    for key, value in fields.items():
        setattr(hotel, key, value)
    hotel.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(hotel)
    return hotel


def update_hotel_status(db: Session, hotel: Hotel, status: str) -> Hotel:
    """Change only the hotel's lifecycle status (e.g. Draft -> Active) without touching any other profile field. Caller is responsible for validating the status value and the transition itself."""
    hotel.status = status
    hotel.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(hotel)
    return hotel


# ---------------------------------------------------------------------------
# Hotel Image
# ---------------------------------------------------------------------------


def create_hotel_image(db: Session, **fields) -> HotelImage:
    """Insert a new hotel image row (must include hotel_id and image_path) and return it with its generated id."""
    image = HotelImage(**fields)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def get_hotel_image(db: Session, image_id: int) -> Optional[HotelImage]:
    """Fetch a single hotel image by its primary key, or None if it doesn't exist."""
    return db.query(HotelImage).filter(HotelImage.id == image_id).first()


def list_hotel_images(db: Session, hotel_id: int) -> list[HotelImage]:
    """Return all images belonging to one hotel, ordered for gallery display."""
    return (
        db.query(HotelImage)
        .filter(HotelImage.hotel_id == hotel_id)
        .order_by(HotelImage.display_order)
        .all()
    )


def update_hotel_image(db: Session, image: HotelImage, **fields) -> HotelImage:
    """Apply the given field values (e.g. title, display_order) to an existing hotel image row and persist them."""
    for key, value in fields.items():
        setattr(image, key, value)
    db.commit()
    db.refresh(image)
    return image


# ---------------------------------------------------------------------------
# Hotel Facility
# ---------------------------------------------------------------------------


def create_hotel_facility(db: Session, **fields) -> HotelFacility:
    """Insert a new hotel facility/amenity row (must include hotel_id and facility_name) and return it with its generated id."""
    facility = HotelFacility(**fields)
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility


def get_hotel_facility(db: Session, facility_id: int) -> Optional[HotelFacility]:
    """Fetch a single hotel facility by its primary key, or None if it doesn't exist."""
    return db.query(HotelFacility).filter(HotelFacility.id == facility_id).first()


def list_hotel_facilities(db: Session, hotel_id: int) -> list[HotelFacility]:
    """Return all facilities/amenities belonging to one hotel, in display order."""
    return (
        db.query(HotelFacility)
        .filter(HotelFacility.hotel_id == hotel_id)
        .order_by(HotelFacility.display_order)
        .all()
    )


def update_hotel_facility(db: Session, facility: HotelFacility, **fields) -> HotelFacility:
    """Apply the given field values to an existing hotel facility row and persist them."""
    for key, value in fields.items():
        setattr(facility, key, value)
    db.commit()
    db.refresh(facility)
    return facility


# ---------------------------------------------------------------------------
# Room Type
# ---------------------------------------------------------------------------


def create_room_type(db: Session, **fields) -> RoomType:
    """Insert a new room/villa type row for a hotel from already-validated fields. New room types start with the model's default status ("Draft") unless status is explicitly passed."""
    room_type = RoomType(**fields)
    db.add(room_type)
    db.commit()
    db.refresh(room_type)
    return room_type


def get_room_type(db: Session, room_type_id: int) -> Optional[RoomType]:
    """Fetch a single room type by its primary key, or None if it doesn't exist."""
    return db.query(RoomType).filter(RoomType.id == room_type_id).first()


def list_room_types(db: Session, hotel_id: int) -> list[RoomType]:
    """Return all room/villa types belonging to one hotel, ordered by id."""
    return (
        db.query(RoomType)
        .filter(RoomType.hotel_id == hotel_id)
        .order_by(RoomType.id)
        .all()
    )


def update_room_type(db: Session, room_type: RoomType, **fields) -> RoomType:
    """Apply the given field values (e.g. room_name, max_occupancy, bed_type) to an existing room type row and persist them. Does not touch status — use update_room_type_status for that."""
    for key, value in fields.items():
        setattr(room_type, key, value)
    db.commit()
    db.refresh(room_type)
    return room_type


def update_room_type_status(db: Session, room_type: RoomType, status: str) -> RoomType:
    """Change only the room type's lifecycle status (e.g. Draft -> Active) without touching any other field. Caller is responsible for validating the status value and the transition itself."""
    room_type.status = status
    db.commit()
    db.refresh(room_type)
    return room_type


# ---------------------------------------------------------------------------
# Room Image
# ---------------------------------------------------------------------------


def create_room_image(db: Session, **fields) -> RoomImage:
    """Insert a new room/villa image row (must include room_type_id and image_path) and return it with its generated id."""
    image = RoomImage(**fields)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def get_room_image(db: Session, image_id: int) -> Optional[RoomImage]:
    """Fetch a single room image by its primary key, or None if it doesn't exist."""
    return db.query(RoomImage).filter(RoomImage.id == image_id).first()


def list_room_images(db: Session, room_type_id: int) -> list[RoomImage]:
    """Return all images belonging to one room type, ordered for gallery display."""
    return (
        db.query(RoomImage)
        .filter(RoomImage.room_type_id == room_type_id)
        .order_by(RoomImage.display_order)
        .all()
    )


def update_room_image(db: Session, image: RoomImage, **fields) -> RoomImage:
    """Apply the given field values (e.g. title, display_order) to an existing room image row and persist them."""
    for key, value in fields.items():
        setattr(image, key, value)
    db.commit()
    db.refresh(image)
    return image


# ---------------------------------------------------------------------------
# Room Occupancy Option
# ---------------------------------------------------------------------------


def create_room_occupancy_option(db: Session, **fields) -> RoomOccupancyOption:
    """Insert one valid guest combination (adults/children/infants) for a room type and return it with its generated id."""
    option = RoomOccupancyOption(**fields)
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


def get_room_occupancy_option(db: Session, option_id: int) -> Optional[RoomOccupancyOption]:
    """Fetch a single occupancy option by its primary key, or None if it doesn't exist."""
    return db.query(RoomOccupancyOption).filter(RoomOccupancyOption.id == option_id).first()


def list_room_occupancy_options(
    db: Session, room_type_id: int, active_only: bool = False
) -> list[RoomOccupancyOption]:
    """Return the valid guest combinations for one room type. Set active_only=True to exclude combinations that have been soft-disabled."""
    query = db.query(RoomOccupancyOption).filter(
        RoomOccupancyOption.room_type_id == room_type_id
    )
    if active_only:
        query = query.filter(RoomOccupancyOption.is_active.is_(True))
    return query.order_by(RoomOccupancyOption.id).all()


def list_room_occupancy_options_for_hotel(
    db: Session, hotel_id: int, active_only: bool = False
) -> list[RoomOccupancyOption]:
    """Decision 211: every occupancy option of every room type of one hotel,
    in one query -- the search page needs them per hotel, never per row."""
    query = (
        db.query(RoomOccupancyOption)
        .join(RoomType, RoomType.id == RoomOccupancyOption.room_type_id)
        .filter(RoomType.hotel_id == hotel_id)
    )
    if active_only:
        query = query.filter(RoomOccupancyOption.is_active.is_(True))
    return query.order_by(RoomOccupancyOption.room_type_id, RoomOccupancyOption.id).all()


def update_room_occupancy_option(
    db: Session, option: RoomOccupancyOption, **fields
) -> RoomOccupancyOption:
    """Apply the given field values (e.g. adults, children, infants) to an existing occupancy option row and persist them. Does not touch is_active — use set_room_occupancy_option_active for that."""
    for key, value in fields.items():
        setattr(option, key, value)
    db.commit()
    db.refresh(option)
    return option


def set_room_occupancy_option_active(
    db: Session, option: RoomOccupancyOption, is_active: bool
) -> RoomOccupancyOption:
    """Enable or disable one occupancy combination without deleting it, so booking history referencing it stays intact."""
    option.is_active = is_active
    db.commit()
    db.refresh(option)
    return option


# ---------------------------------------------------------------------------
# Room Availability
# ---------------------------------------------------------------------------


def create_room_availability(db: Session, **fields) -> RoomAvailability:
    """Insert one day's availability status for a room type (must include room_type_id and date). Fails at the DB level if a row for that room_type_id + date already exists, since the pair is unique."""
    availability = RoomAvailability(**fields)
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


def get_room_availability(db: Session, availability_id: int) -> Optional[RoomAvailability]:
    """Fetch a single availability row by its primary key, or None if it doesn't exist."""
    return db.query(RoomAvailability).filter(RoomAvailability.id == availability_id).first()


def get_room_availability_by_date(
    db: Session, room_type_id: int, target_date: date
) -> Optional[RoomAvailability]:
    """Fetch the availability row for one room type on one specific calendar date, or None if that day has no row yet."""
    return (
        db.query(RoomAvailability)
        .filter(
            RoomAvailability.room_type_id == room_type_id,
            RoomAvailability.date == target_date,
        )
        .first()
    )


def list_room_availability(
    db: Session,
    room_type_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[RoomAvailability]:
    """Return the day-by-day availability calendar for one room type, in chronological order. Pass start_date/end_date to narrow the range; omit both to get every row on file."""
    query = db.query(RoomAvailability).filter(RoomAvailability.room_type_id == room_type_id)
    if start_date is not None:
        query = query.filter(RoomAvailability.date >= start_date)
    if end_date is not None:
        query = query.filter(RoomAvailability.date <= end_date)
    return query.order_by(RoomAvailability.date).all()


def update_room_availability_status(
    db: Session, availability: RoomAvailability, status: str
) -> RoomAvailability:
    """Change one day's status (free_sale / on_request / closed) for a room type. This is the room's own open/closed state — it is independent of any contract's allotment count."""
    availability.status = status
    availability.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(availability)
    return availability
