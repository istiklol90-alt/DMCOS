"""
Business-rule validation for the Contract Engine.

Same layering rule as Hotel Engine: these functions cover checks that
Pydantic field constraints in schemas.py cannot express on their own —
either because they need data from another row (e.g. a promotion's
stacking compatibility with another promotion) or because repository.py's
status setters (update_contract_status, update_rate_status, etc.)
intentionally accept a raw string and push validation responsibility onto
the caller. service.py should call these before writing anything.

All functions raise ValueError on failure. Functions that return a value
(the discount-stacking calculation) document their return type; everything
else returns None on success.
"""

from typing import Optional
from datetime import date

from app.engines.contract.models import Promotion

# Source: 03_Domain_Model.md #26 "Contract Status" (superset of
# 02_Logic_Rules.md #15, which omits Archived).
CONTRACT_STATUSES = {"Draft", "Waiting Approval", "Active", "Expired", "Cancelled", "Archived"}

# Simple Active/Inactive toggle shared by every child entity below a
# Contract (seasons, rates, rate supplements, promotions, allotments,
# stop sales) — none of these have a documented richer lifecycle.
CHILD_STATUSES = {"Active", "Inactive"}

# Source: 02_Logic_Rules.md #18 "Currency Rules".
CURRENCIES = {"USD", "EUR", "GBP", "AED", "RUB", "KZT", "UZS", "TJS"}

# Source: 02_Logic_Rules.md #20 "Meal Plans".
MEAL_CODES = {"RO", "BB", "HB", "FB", "AI", "Premium AI", "Ultra AI"}

# Source: 03_Domain_Model.md #30 / 02_Logic_Rules.md #32.
PROMOTION_TYPES = {
    "Early Bird",
    "Last Minute",
    "Flash Sale",
    "Stay Pay",
    "Free Night",
    "Honeymoon",
    "Free Upgrade",
    "Free Transfer",
    "Kids Stay Free",
}

# Our own schema design for RateSupplement — not documented anywhere, so
# safe to enforce as a closed set (see schemas.py).
CALCULATION_BASES = {"per_person_per_night", "per_stay", "percentage_of_rate"}


def validate_contract_status(status: str) -> None:
    """Raise ValueError unless status is one of the six documented Contract Status values."""
    if status not in CONTRACT_STATUSES:
        raise ValueError(
            f"Invalid contract status '{status}'. Must be one of: {sorted(CONTRACT_STATUSES)}"
        )


def validate_child_status(status: str) -> None:
    """Raise ValueError unless status is Active or Inactive. Shared by every Contract child entity's status field."""
    if status not in CHILD_STATUSES:
        raise ValueError(
            f"Invalid status '{status}'. Must be one of: {sorted(CHILD_STATUSES)}"
        )


def validate_currency(currency: str) -> None:
    """Raise ValueError unless currency is one of the eight documented supported currencies."""
    if currency not in CURRENCIES:
        raise ValueError(f"Invalid currency '{currency}'. Must be one of: {sorted(CURRENCIES)}")


def validate_meal_code(meal_code: str) -> None:
    """Raise ValueError unless meal_code is one of the seven documented meal plan codes."""
    if meal_code not in MEAL_CODES:
        raise ValueError(f"Invalid meal_code '{meal_code}'. Must be one of: {sorted(MEAL_CODES)}")


def validate_promotion_type(promotion_type: str) -> None:
    """Raise ValueError unless promotion_type is one of the nine documented promotion types."""
    if promotion_type not in PROMOTION_TYPES:
        raise ValueError(
            f"Invalid promotion_type '{promotion_type}'. Must be one of: {sorted(PROMOTION_TYPES)}"
        )


def validate_calculation_basis(calculation_basis: str) -> None:
    """Raise ValueError unless calculation_basis is one of the three RateSupplement calculation bases."""
    if calculation_basis not in CALCULATION_BASES:
        raise ValueError(
            f"Invalid calculation_basis '{calculation_basis}'. "
            f"Must be one of: {sorted(CALCULATION_BASES)}"
        )


def validate_date_range(start_date: Optional[date], end_date: Optional[date]) -> None:
    """Raise ValueError if both dates are given and start_date is after end_date. Reused for ContractSeason, Rate booking/travel windows, Promotion booking/travel windows, BlackoutDate, StopSale, and MinimumStayRule."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise ValueError(f"start_date ({start_date}) cannot be after end_date ({end_date})")


def validate_stay_range(minimum_stay: Optional[int], maximum_stay: Optional[int]) -> None:
    """Raise ValueError if both are given and minimum_stay is greater than maximum_stay."""
    if minimum_stay is not None and maximum_stay is not None and minimum_stay > maximum_stay:
        raise ValueError(
            f"minimum_stay ({minimum_stay}) cannot be greater than maximum_stay ({maximum_stay})"
        )


def validate_age_category_range(min_age: Optional[int], max_age: Optional[int]) -> None:
    """Raise ValueError if both are given and min_age is greater than max_age."""
    if min_age is not None and max_age is not None and min_age > max_age:
        raise ValueError(f"min_age ({min_age}) cannot be greater than max_age ({max_age})")


def validate_rate_season_matches_contract(rate_contract_id: int, season) -> None:
    """Raise ValueError if a Rate's contract_id doesn't match the ContractSeason row it references — a Rate can't borrow a season that belongs to a different contract."""
    if season.contract_id != rate_contract_id:
        raise ValueError(
            f"Season {season.id} belongs to contract {season.contract_id}, "
            f"not contract {rate_contract_id}"
        )


def validate_allotment_capacity(allocated_rooms: int, sold_rooms: int) -> None:
    """Raise ValueError if sold_rooms exceeds allocated_rooms — an allotment can never sell more rooms than it was allocated."""
    if sold_rooms > allocated_rooms:
        raise ValueError(
            f"sold_rooms ({sold_rooms}) cannot exceed allocated_rooms ({allocated_rooms})"
        )


def validate_promotion_stacking(promotions: list[Promotion]) -> None:
    """
    Raise ValueError unless every promotion in the list is mutually stackable.

    Rule (as specified): two or more promotions can combine only if ALL of
    them have is_stackable=True AND they all share the same stacking_group
    value. This is a literal equality check, so stacking_group=None on every
    promotion in the list counts as "matching" (all-None is still one
    consistent group) — a single promotion (len <= 1) is always trivially
    valid regardless of its flags, since there's nothing to combine with.
    """
    if len(promotions) <= 1:
        return

    if not all(p.is_stackable for p in promotions):
        non_stackable = [p.id for p in promotions if not p.is_stackable]
        raise ValueError(
            f"Cannot combine promotions — not all are stackable (non-stackable ids: {non_stackable})"
        )

    groups = {p.stacking_group for p in promotions}
    if len(groups) > 1:
        raise ValueError(
            f"Cannot combine promotions from different stacking groups: {sorted(str(g) for g in groups)}"
        )


def apply_sequential_discounts(base_amount: float, promotions: list[Promotion]) -> float:
    """
    Apply a list of already stacking-validated promotions to base_amount in
    sequence — never additively. Call validate_promotion_stacking on the
    same list first; this function doesn't re-check stacking compatibility.

    Each promotion is applied to the running (already-discounted) amount,
    not to the original base_amount:
      - discount_type == "percentage": amount *= (1 - discount_value / 100)
      - anything else (treated as a fixed amount): amount -= discount_value

    This is what makes two 20% discounts yield 100 -> 80 -> 64 (multiplicative),
    never 100 -> 100 * (1 - 0.40) = 60 (additive) — matching the real contracts'
    stated terms. The running amount is floored at 0 (a discount can't make
    the price negative), a defensive safeguard rather than a documented rule.
    """
    amount = base_amount
    for promotion in promotions:
        if promotion.discount_type == "percentage":
            amount *= 1 - (promotion.discount_value / 100)
        else:
            amount -= promotion.discount_value
        amount = max(amount, 0.0)
    return amount


# ---------------------------------------------------------------------------
# Transfer pricing basis (Decision 196)
# ---------------------------------------------------------------------------

TRANSFER_PRICING_BASES = ("per_person", "per_vehicle")


def validate_transfer_pricing_basis(pricing_basis: str, price_per_vehicle: float | None) -> None:
    """
    A transfer option is priced either per person or per vehicle, and the row
    must carry the price that its own basis actually reads.

    Deliberately strict in both directions. A "per_vehicle" row with no
    price_per_vehicle would price the transfer at nothing — silently, since
    get_transfer_price would find zero. A "per_person" row carrying a
    price_per_vehicle would suggest a figure that is never read, which is how
    a contract ends up with a number nobody can explain later.
    """
    if pricing_basis not in TRANSFER_PRICING_BASES:
        raise ValueError(
            f"Invalid transfer pricing_basis '{pricing_basis}' — must be one of {list(TRANSFER_PRICING_BASES)}"
        )
    if pricing_basis == "per_vehicle" and price_per_vehicle is None:
        raise ValueError("A per_vehicle transfer option requires price_per_vehicle")
    if pricing_basis == "per_person" and price_per_vehicle is not None:
        raise ValueError(
            "price_per_vehicle is only read by a per_vehicle transfer option — leave it unset for per_person"
        )
