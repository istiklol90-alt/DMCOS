"""Package Engine business-rule checks -- plain ValueError, mapped to HTTP
400 by api.py (same convention as every engine)."""

ADD_ON_KINDS = {"insurance", "visa"}
ADD_ON_BASES = {"per_person", "per_person_per_day", "per_booking"}
CANCELLATION_COMPONENTS = {"transfer", "flight", "insurance", "visa"}
MAX_COMMISSION_PERCENT = 50.0  # gross = net / (1 - rate): a sanity bound, not a business rule


def validate_commission_percent(value: float) -> None:
    if value is None or value < 0 or value > MAX_COMMISSION_PERCENT:
        raise ValueError(f"Commission must be between 0 and {MAX_COMMISSION_PERCENT:g}%.")


def validate_add_on(kind: str, basis: str, cost: float, price: float, currency: str) -> None:
    if kind not in ADD_ON_KINDS:
        raise ValueError(f"Unknown add-on kind '{kind}' (allowed: {', '.join(sorted(ADD_ON_KINDS))}).")
    if basis not in ADD_ON_BASES:
        raise ValueError(f"Unknown basis '{basis}' (allowed: {', '.join(sorted(ADD_ON_BASES))}).")
    if cost is None or cost < 0 or price is None or price < 0:
        raise ValueError("Cost and price must be zero or more.")
    if not currency or not (2 <= len(currency.strip()) <= 10):
        raise ValueError("Currency is required.")


def validate_price_change_reason(new_cost: float, new_price: float, reason: str | None) -> None:
    """Owner, 2026-10-17: selling below cost is allowed, but it must be a
    decision -- a reason is required."""
    if new_price < new_cost and not (reason or "").strip():
        raise ValueError("Selling below cost needs a reason.")


def validate_cancellation_rule(component_type: str, days_before: int, penalty_percent: float) -> None:
    if component_type not in CANCELLATION_COMPONENTS:
        raise ValueError(f"Unknown component '{component_type}' (allowed: {', '.join(sorted(CANCELLATION_COMPONENTS))}).")
    if days_before is None or days_before < 0:
        raise ValueError("Days before arrival must be zero or more.")
    if penalty_percent is None or penalty_percent < 0 or penalty_percent > 100:
        raise ValueError("Penalty must be between 0 and 100%.")


def validate_party(adults: int, children: int, infants: int) -> None:
    if adults < 1 or children < 0 or infants < 0:
        raise ValueError("At least one adult; children and infants cannot be negative.")
