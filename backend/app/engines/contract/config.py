"""
Contract Engine's environment-driven configuration. First real content
here -- previously empty scaffolding with no precedent (per CLAUDE.md's
note on Contract Engine's still-empty config.py/utils.py/etc).
"""

import os


def is_allotment_strict_mode() -> bool:
    """
    Whether check_allotment/reserve_allotment treat a *missing* Allotment
    row (no row at all for that room type/date) as unavailable (strict,
    True) or available (permissive, False -- current default).

    Permissive by default because real per-day hotel inventory data
    (Free Sale/On Request/Stop Sale) doesn't exist yet for almost every
    room type in this project -- only 2 of 12 room types across every
    contract in the system have any Allotment rows at all today. Blocking
    real bookings on the *absence* of test/seed data isn't useful during
    this phase.

    This only fills the gap where no data exists at all -- it never
    overrides an explicit signal. A row that exists but is inactive, has
    zero available_rooms, or a night blocked by an active Stop Sale still
    blocks the booking unconditionally, strict mode or not.

    Set ALLOTMENT_STRICT_MODE=true in backend/.env once real inventory
    data starts flowing in (manual entry, AI Core Engine extraction, or a
    future direct hotel integration per Decision 019) to restore
    check_allotment/reserve_allotment's original LOCKED behavior with
    zero code changes.
    """
    return os.environ.get("ALLOTMENT_STRICT_MODE", "false").lower() == "true"
