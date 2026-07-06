"""
Business-rule validation for the Hotel Engine.

These functions cover checks that Pydantic field constraints in schemas.py
cannot express on their own — either because they need data from another
row (e.g. a room type's max_occupancy) or because repository.py's status
setters (update_hotel_status, update_room_type_status,
update_room_availability_status) intentionally accept a raw string and push
validation responsibility onto the caller. service.py should call these
before writing anything.

All functions raise ValueError on failure and return None on success.
"""

from typing import Optional

from app.engines.hotel.models import RoomType

# Source: 02_Logic_Rules.md #12 "Hotel Status" — Draft/Active/Inactive/
# Suspended/Archived are the only defined values. No transition graph
# (e.g. whether Archived can go back to Active) is documented anywhere
# yet, so only set membership is validated here — do not add stricter
# transition rules without the project owner defining them first.
HOTEL_STATUSES = {"Draft", "Active", "Inactive", "Suspended", "Archived"}

# RoomType reuses the same status set as Hotel (see models.py / Decision
# on RoomType defaulting to "Draft" for lifecycle consistency with Hotel).
ROOM_TYPE_STATUSES = HOTEL_STATUSES

# Source: agreed Hotel Engine schema — the day-by-day availability
# calendar's own three states, independent of any contract's allotment.
ROOM_AVAILABILITY_STATUSES = {"free_sale", "on_request", "closed"}


def validate_hotel_status(status: str) -> None:
    """Raise ValueError unless status is one of the five documented Hotel Status values."""
    if status not in HOTEL_STATUSES:
        raise ValueError(
            f"Invalid hotel status '{status}'. Must be one of: {sorted(HOTEL_STATUSES)}"
        )


def validate_room_type_status(status: str) -> None:
    """Raise ValueError unless status is one of the five documented status values shared with Hotel."""
    if status not in ROOM_TYPE_STATUSES:
        raise ValueError(
            f"Invalid room type status '{status}'. Must be one of: {sorted(ROOM_TYPE_STATUSES)}"
        )


def validate_room_availability_status(status: str) -> None:
    """Raise ValueError unless status is one of free_sale / on_request / closed."""
    if status not in ROOM_AVAILABILITY_STATUSES:
        raise ValueError(
            f"Invalid room availability status '{status}'. "
            f"Must be one of: {sorted(ROOM_AVAILABILITY_STATUSES)}"
        )


def validate_star_rating(star_rating: Optional[int]) -> None:
    """Raise ValueError if star_rating is provided but outside the 1-5 range. None (not yet rated) is allowed."""
    if star_rating is not None and not (1 <= star_rating <= 5):
        raise ValueError(f"star_rating must be between 1 and 5, got {star_rating}")


def validate_occupancy_within_capacity(
    room_type: RoomType, adults: int, children: int
) -> None:
    """
    Raise ValueError if adults + children exceeds the parent room type's max_occupancy.

    Infants are deliberately excluded from this check — per the agreed schema,
    infants (0-1 years) don't count toward a room's occupancy cap.
    """
    total = adults + children
    if total > room_type.max_occupancy:
        raise ValueError(
            f"Occupancy combination ({adults} adults + {children} children = {total}) "
            f"exceeds room type '{room_type.room_name}' max_occupancy of {room_type.max_occupancy}"
        )


def validate_date_range(start_date, end_date) -> None:
    """Raise ValueError if both dates are given and start_date is after end_date."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise ValueError(
            f"start_date ({start_date}) cannot be after end_date ({end_date})"
        )
