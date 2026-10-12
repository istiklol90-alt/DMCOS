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
from typing import Optional

# 03_Domain_Model.md #39 / 02_Logic_Rules.md #47 "Booking Status".
# "Cancellation Requested" (Decision 104) is the intermediate stage of the
# two-step cancellation workflow -- deliberately NOT in TERMINAL_STATUSES
# below (it still needs to transition to "Cancelled"), but excluded from
# BookingUpdatableStatus in schemas.py so it can only be entered/exited via
# the dedicated cancel/confirm-cancellation endpoints, never a generic PUT.
BOOKING_STATUSES = {
    "Draft",
    "Pending",
    "Waiting Hotel",
    "Confirmed",
    "Partially Confirmed",
    "Cancellation Requested",
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


def validate_can_request_cancellation(current_status: str) -> None:
    """
    Decision 104: gates the request stage (service.cancel_booking, which
    now only requests cancellation — see its own docstring). A terminal
    booking has nothing left to cancel; a booking already in
    "Cancellation Requested" would silently re-freeze a different fee/
    reason if allowed to request again, so that's blocked explicitly too
    rather than just letting a second freeze quietly overwrite the first.
    """
    if current_status in TERMINAL_STATUSES:
        raise ValueError(f"Booking status '{current_status}' is terminal — cannot request cancellation")
    if current_status == "Cancellation Requested":
        raise ValueError("Cancellation has already been requested for this booking")


def validate_can_confirm_cancellation(current_status: str) -> None:
    """
    Decision 104: gates the confirm stage (service.confirm_cancellation).
    A booking can only be finalized as Cancelled once cancellation has
    actually been requested — this is the sole legitimate way to reach
    "Cancellation Requested" -> "Cancelled"; the generic status-update
    path (update_booking_status) is separately blocked from moving a
    booking out of "Cancellation Requested" at all (see its own
    docstring), so this transition has exactly one door.
    """
    if current_status != "Cancellation Requested":
        raise ValueError(
            f"Booking status '{current_status}' — cancellation must be requested "
            f"before it can be confirmed"
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


# Decision 153. A flight belonging to a stay cannot be a year away from it:
# there is no such thing as the transfer for a November 2027 stay running in
# December 2019. Deliberately generous — the point is to reject the
# impossible, not to police an unusual-but-real itinerary. Everything inside
# this bound is accepted by the API and merely *warned about* in the UI when
# it is more than a few days off (a night flight landing the day before
# check-in, or a departure flight the morning after check-out, are normal).
FLIGHT_DATE_MAX_DAYS_FROM_STAY = 365


def validate_flight_dates(
    arrival_date: date,
    departure_date: date,
    arrival_flight_date: Optional[date] = None,
    departure_flight_date: Optional[date] = None,
) -> None:
    """
    Raise ValueError for a flight date that cannot belong to this stay.

    Anchored to the STAY, never to today: bookings are edited long after
    their travel has happened (a completed August stay still gets its guest
    list corrected), and anchoring to the current date would make every
    historical booking un-editable. A stay in the past with flights in the
    past is perfectly valid; a stay in 2027 with a flight in 2019 is not,
    and both are judged by the same rule.

    Three impossible cases, all rejected:
      - the arrival flight more than a year from the arrival date
      - the departure flight more than a year from the departure date
      - the departure flight before the arrival flight (you cannot fly home
        before you have flown out)

    Anything less extreme is accepted here on purpose. Before this existed
    the API accepted a check-in of 2027-11-22 with an arrival flight of
    2020-12-20 — 2528 days earlier — silently, which is how nonsense dates
    reach a hotel's inbox in an LPO.
    """
    if arrival_flight_date is not None:
        gap = abs((arrival_flight_date - arrival_date).days)
        if gap > FLIGHT_DATE_MAX_DAYS_FROM_STAY:
            raise ValueError(
                f"Arrival flight date ({arrival_flight_date}) is {gap} days from the "
                f"check-in date ({arrival_date}) — a flight cannot be more than "
                f"{FLIGHT_DATE_MAX_DAYS_FROM_STAY} days away from the stay it belongs to"
            )

    if departure_flight_date is not None:
        gap = abs((departure_flight_date - departure_date).days)
        if gap > FLIGHT_DATE_MAX_DAYS_FROM_STAY:
            raise ValueError(
                f"Departure flight date ({departure_flight_date}) is {gap} days from the "
                f"check-out date ({departure_date}) — a flight cannot be more than "
                f"{FLIGHT_DATE_MAX_DAYS_FROM_STAY} days away from the stay it belongs to"
            )

    if arrival_flight_date is not None and departure_flight_date is not None:
        if departure_flight_date < arrival_flight_date:
            raise ValueError(
                f"Departure flight date ({departure_flight_date}) is before the arrival "
                f"flight date ({arrival_flight_date})"
            )


def validate_can_approve_or_reject_room(current_status: str) -> None:
    """
    Stage 3 (multi-room booking applications): only a room genuinely
    awaiting a manager's decision (status="Pending") can be approved or
    rejected. The system never auto-confirms a room (project owner's
    explicit instruction, 2026-07-27) — "Pending" always means "allotment
    reserved, awaiting manager approve" here, so an already-Confirmed/
    Rejected/Cancelled room has nothing left to decide.
    """
    if current_status != "Pending":
        raise ValueError(
            f"Room status '{current_status}' — only a Pending room (awaiting manager approve) "
            f"can be approved or rejected"
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
