"""
Business-rule validation for the Booking Engine.

Same layering rule as Hotel/Contract Engine: these functions cover checks
that Pydantic field constraints in schemas.py can't fully express on
their own (cross-field consistency, cross-entity coordination), plus
checks needed because repository.py's status setter
(update_booking_status) intentionally accepts a raw string and pushes
validation onto the caller. service.py should call these before writing
anything.

All functions raise ValueError on failure and return None on success.
"""

from datetime import date

# 03_Domain_Model.md #39 / 02_Logic_Rules.md #47 "Booking Status".
BOOKING_STATUSES = {
    "Draft",
    "Pending",
    "Waiting Hotel",
    "Confirmed",
    "Partially Confirmed",
    "Cancelled",
    "Rejected",
    "Completed",
}

# Cancelled and Rejected both trigger release_allotment (giving reserved
# inventory back — see service.py's cancel_booking). Once a booking is in
# either of these, it must never move to any other status: doing so would
# leave it in a non-terminal status (e.g. re-"Confirmed") with no actual
# reserved room, since re-reserving isn't supported. This is the one
# transition rule enforced here, scoped specifically to the allotment
# reserve/release coordination — no other transition (e.g. Pending ->
# Confirmed vs. Pending -> Rejected) is restricted, and "Completed" is
# deliberately not treated as terminal here since it doesn't trigger a
# release (the room was actually used, not given back).
TERMINAL_STATUSES = {"Cancelled", "Rejected"}


def validate_booking_status(status: str) -> None:
    """Raise ValueError unless status is one of the eight documented Booking Status values."""
    if status not in BOOKING_STATUSES:
        raise ValueError(
            f"Invalid booking status '{status}'. Must be one of: {sorted(BOOKING_STATUSES)}"
        )


def validate_status_transition(current_status: str, new_status: str) -> None:
    """
    Raise ValueError if current_status is Cancelled or Rejected and
    new_status is anything else. Both of those statuses release the
    booking's reserved allotment; allowing a further transition out of
    them would leave the booking with no corresponding reserved
    inventory. Every other transition is unrestricted — this does not
    validate a full status graph, only this one allotment-coordination
    boundary.
    """
    if current_status in TERMINAL_STATUSES and new_status != current_status:
        raise ValueError(
            f"Booking status '{current_status}' is terminal (allotment already released) — "
            f"cannot transition to '{new_status}'"
        )


def validate_stay_dates(arrival_date: date, departure_date: date) -> None:
    """
    Raise ValueError unless arrival_date is strictly before departure_date.

    Stricter than Hotel/Contract Engine's validate_date_range (which
    allows start == end for a season/policy applying to a single day) —
    a booking needs at least one night, so equal dates are invalid here.
    """
    if arrival_date >= departure_date:
        raise ValueError(
            f"arrival_date ({arrival_date}) must be before departure_date ({departure_date})"
        )


def validate_nights_consistency(nights: int, arrival_date: date, departure_date: date) -> None:
    """
    Raise ValueError if nights doesn't match (departure_date - arrival_date).days.

    service.py computes nights itself rather than trusting caller input
    (nights isn't even a field in BookingCreate), but this guards any code
    path that calls repository.py directly with a mismatched value —
    same defense-in-depth reasoning as Hotel Engine's validate_star_rating.
    """
    expected = (departure_date - arrival_date).days
    if nights != expected:
        raise ValueError(
            f"nights ({nights}) does not match arrival_date/departure_date "
            f"({arrival_date} to {departure_date} = {expected} nights)"
        )


def validate_occupancy(adults: int, children: int, infants: int) -> None:
    """
    Raise ValueError if adults < 1, or children/infants < 0.

    Already enforced by schemas.py's Field constraints (ge=1/ge=0) — this
    is defense-in-depth for any caller that reaches repository.py
    directly, bypassing the Pydantic layer entirely.
    """
    if adults < 1:
        raise ValueError(f"adults must be at least 1, got {adults}")
    if children < 0:
        raise ValueError(f"children cannot be negative, got {children}")
    if infants < 0:
        raise ValueError(f"infants cannot be negative, got {infants}")
