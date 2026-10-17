from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.engines.contract import service as contract_service
from app.engines.hotel import service as hotel_service
from app.engines.pricing import repository
from app.engines.pricing.models import PricingSettings, ExclusiveAgent, ContractExclusiveDiscount
from models.user import User

DEFAULT_MARKUP_AMOUNT_PER_NIGHT = 10.0


# ---------------------------------------------------------------------------
# PricingSettings
# ---------------------------------------------------------------------------

def get_pricing_settings(db: Session, currency: str = "USD") -> PricingSettings:
    """
    Get-or-create the markup row FOR ONE CURRENCY. Never raises for
    'settings missing' -- a currency asked about for the first time gets the
    default, so adding a contract in a new currency cannot fail at pricing
    time.

    Decision 193: the markup is an absolute amount per night, not a
    percentage, so it cannot be shared across currencies. One global row
    would have added 10 EUR to a EUR booking because 10 USD was configured
    -- a different amount, applied silently. Now the caller's currency picks
    the row.
    """
    settings = repository.get_pricing_settings(db, currency)
    if settings is None:
        settings = repository.create_pricing_settings(
            db,
            standard_markup_amount_per_night=DEFAULT_MARKUP_AMOUNT_PER_NIGHT,
            currency=currency,
        )
    return settings


def list_pricing_settings(db: Session) -> list[PricingSettings]:
    """Every configured currency, for the admin screen."""
    return repository.list_pricing_settings(db)


def update_pricing_settings(
    db: Session,
    standard_markup_amount_per_night: float,
    updated_by: int,
    currency: str = "USD",
) -> PricingSettings:
    if standard_markup_amount_per_night < 0:
        raise ValueError("standard_markup_amount_per_night cannot be negative")
    settings = get_pricing_settings(db, currency)
    return repository.update_pricing_settings(
        db, settings,
        standard_markup_amount_per_night=standard_markup_amount_per_night,
        updated_by=updated_by,
    )


# ---------------------------------------------------------------------------
# ExclusiveAgent
# ---------------------------------------------------------------------------

def _require_agent_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")
    if (user.role or "").strip().lower() != "agent":
        raise ValueError(f"User {user_id} is not an agent (role={user.role})")
    return user


def is_exclusive(db: Session, user_id: int) -> bool:
    return repository.get_exclusive_agent(db, user_id) is not None


def list_standard_agents(db: Session) -> list[dict]:
    exclusive_ids = {row.user_id for row in repository.list_exclusive_agents(db)}
    agents = db.query(User).filter(User.role == "agent").all()
    return [
        {"user_id": a.id, "name": a.name, "email": a.email}
        for a in agents
        if a.id not in exclusive_ids
    ]


def list_exclusive_agents(db: Session) -> list[dict]:
    rows = repository.list_exclusive_agents(db)
    result = []
    for row in rows:
        user = db.query(User).filter(User.id == row.user_id).first()
        result.append({
            "id": row.id,
            "user_id": row.user_id,
            "name": user.name if user else "(unknown)",
            "email": user.email if user else "(unknown)",
            "assigned_by": row.assigned_by,
            "assigned_at": row.assigned_at,
        })
    return result


def add_exclusive_agent(db: Session, user_id: int, assigned_by: int) -> ExclusiveAgent:
    _require_agent_user(db, user_id)
    if repository.get_exclusive_agent(db, user_id) is not None:
        raise ValueError(f"User {user_id} is already an Exclusive agent")
    return repository.create_exclusive_agent(db, user_id=user_id, assigned_by=assigned_by)


def remove_exclusive_agent(db: Session, user_id: int) -> None:
    row = repository.get_exclusive_agent(db, user_id)
    if row is None:
        raise ValueError(f"User {user_id} is not an Exclusive agent")
    repository.delete_exclusive_agent(db, row)


# ---------------------------------------------------------------------------
# ContractExclusiveDiscount -- Decision 071
# ---------------------------------------------------------------------------

def list_contract_exclusive_discounts(db: Session, contract_id: int) -> list[ContractExclusiveDiscount]:
    return repository.list_contract_exclusive_discounts(db, contract_id)


def _validate_discount_fields(discount_percent: float, start_date, end_date) -> None:
    if discount_percent <= 0 or discount_percent >= 100:
        raise ValueError("discount_percent must be between 0 and 100 (exclusive)")
    if start_date is not None and end_date is not None and start_date > end_date:
        raise ValueError("start_date must not be after end_date")


def create_contract_exclusive_discount(
    db: Session,
    contract_id: int,
    discount_percent: float,
    created_by: int,
    room_type_id: int | None = None,
    meal_plan_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ContractExclusiveDiscount:
    _validate_discount_fields(discount_percent, start_date, end_date)
    return repository.create_contract_exclusive_discount(
        db,
        contract_id=contract_id,
        room_type_id=room_type_id,
        meal_plan_id=meal_plan_id,
        start_date=start_date,
        end_date=end_date,
        discount_percent=discount_percent,
        created_by=created_by,
    )


def update_contract_exclusive_discount(
    db: Session,
    discount_id: int,
    discount_percent: float,
    room_type_id: int | None = None,
    meal_plan_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ContractExclusiveDiscount:
    row = repository.get_contract_exclusive_discount_by_id(db, discount_id)
    if row is None:
        raise ValueError(f"Exclusive discount {discount_id} not found")
    _validate_discount_fields(discount_percent, start_date, end_date)
    return repository.update_contract_exclusive_discount(
        db, row,
        room_type_id=room_type_id,
        meal_plan_id=meal_plan_id,
        start_date=start_date,
        end_date=end_date,
        discount_percent=discount_percent,
    )


def delete_contract_exclusive_discount(db: Session, discount_id: int) -> None:
    row = repository.get_contract_exclusive_discount_by_id(db, discount_id)
    if row is None:
        raise ValueError(f"Exclusive discount {discount_id} not found")
    repository.delete_contract_exclusive_discount(db, row)


def find_contract_exclusive_discount(
    db: Session, contract_id: int, room_type_id: int, meal_plan_id: int, check_in: date, check_out: date
) -> ContractExclusiveDiscount | None:
    """
    Most-specific-match-wins selection among a contract's
    ContractExclusiveDiscount rows (Decision 071, date logic corrected by
    072), mirroring Decisions 051/053's tier-selection precedent. A row
    is a candidate only if its room_type_id/meal_plan_id are either NULL
    (wildcard) or match exactly, AND the stay [check_in, check_out)
    OVERLAPS its start_date/end_date window at all (NULL on either side
    means unbounded on that side) -- not "check_in falls inside the
    window," which incorrectly excluded a stay that starts before the
    window but still spans nights inside it (e.g. a window of 10.02-30.03
    with a 08.02-15.02 stay: check_in itself is outside the window, but
    nights 10-14 Feb are inside it, so the discount must still apply to
    the whole booking, not be skipped or prorated). Standard interval-
    overlap check: check_out > start_date AND check_in < end_date. Among
    candidates, the one matching the most of {room_type_id, meal_plan_id}
    wins; ties (a config edge case, not expected in practice) prefer
    whichever candidate has an explicit date window over an always-active
    one, since setting a window is more deliberate manager intent than
    the default.
    """
    candidates = []
    for row in repository.list_contract_exclusive_discounts(db, contract_id):
        if row.room_type_id is not None and row.room_type_id != room_type_id:
            continue
        if row.meal_plan_id is not None and row.meal_plan_id != meal_plan_id:
            continue
        if row.start_date is not None and check_out <= row.start_date:
            continue
        if row.end_date is not None and check_in >= row.end_date:
            continue
        candidates.append(row)

    if not candidates:
        return None

    def specificity(row: ContractExclusiveDiscount) -> tuple[int, bool]:
        matched_fields = (row.room_type_id is not None) + (row.meal_plan_id is not None)
        has_date_window = row.start_date is not None or row.end_date is not None
        return (matched_fields, has_date_window)

    candidates.sort(key=specificity, reverse=True)
    return candidates[0]


# ---------------------------------------------------------------------------
# Core pricing calculation -- see docs/interface-contracts/pricing-booking.md
# ---------------------------------------------------------------------------

def _contract_currency(db: Session, contract_id: int) -> str:
    """
    Decision 193: which markup row applies is decided by the CONTRACT's own
    currency.

    Resolved here rather than added to build_nightly_breakdown/
    apply_agent_pricing's signatures: Booking Engine is LOCKED and calls
    apply_agent_pricing directly, so a new required argument would have
    meant editing it for something it has no opinion about. The contract id
    is already in hand and the contract already knows its currency.

    Falls back to USD if the contract cannot be read -- the markup must
    never be the reason a price fails to compute, and USD is what every
    contract in this database is today.
    """
    try:
        contract = contract_service.get_contract(db, contract_id)
        return contract.currency or "USD"
    except Exception:
        return "USD"


def build_nightly_breakdown(
    db: Session,
    agent_id: int,
    contract_id: int,
    room_net_total: float,
    nights: int,
    room_type_id: int,
    meal_plan_id: int,
    check_in: date,
    check_out: date,
) -> list[dict]:
    """
    Decision 074: one entry per calendar night in [check_in, check_out),
    each shaped {date, base_rate, markup, discount_applied,
    discount_percent, discount_amount, final_price}. This is the single
    source of truth for per-night pricing -- apply_agent_pricing sums
    this list rather than recomputing the same split separately, so the
    aggregate total and the nightly breakdown can never drift apart.

    base_rate is room_net_total split evenly across nights (Contract
    Engine itself prices the whole stay off one season's rate for
    check_in, with no per-night breakdown exposed -- see
    docs/interface-contracts/pricing-booking.md and
    contract/service.py's get_room_price docstring for this known,
    separate, pre-existing simplification, NOT fixed by this decision).
    If the stay also crosses a real season boundary, every night's
    base_rate shown here is still the stay's blended average, honestly
    reflecting what Contract Engine actually computed -- not a
    fabricated season-aware nightly rate that doesn't exist in the
    underlying data.
    """
    settings = get_pricing_settings(db, _contract_currency(db, contract_id))
    excl = is_exclusive(db, agent_id)
    contract_discount = find_contract_exclusive_discount(
        db, contract_id, room_type_id, meal_plan_id, check_in, check_out
    )
    applies = excl and contract_discount is not None
    pct = contract_discount.discount_percent if applies else 0.0
    per_night_net = room_net_total / nights
    markup = settings.standard_markup_amount_per_night

    breakdown = []
    night = check_in
    while night < check_out:
        discounted = applies and (
            (contract_discount.start_date is None or night >= contract_discount.start_date)
            and (contract_discount.end_date is None or night < contract_discount.end_date)
        )
        if discounted:
            night_discount_amount = per_night_net * (pct / 100)
            night_net = per_night_net - night_discount_amount
        else:
            night_discount_amount = 0.0
            night_net = per_night_net
        breakdown.append({
            "date": night,
            "base_rate": per_night_net,
            "markup": markup,
            "discount_applied": discounted,
            "discount_percent": pct if discounted else 0.0,
            "discount_amount": night_discount_amount,
            "final_price": night_net + markup,
        })
        night += timedelta(days=1)
    return breakdown


def apply_agent_pricing(
    db: Session,
    agent_id: int,
    contract_id: int,
    room_net_total: float,
    nights: int,
    room_type_id: int,
    meal_plan_id: int,
    check_in: date,
    check_out: date,
) -> dict:
    """
    Computes the agent-facing room price from Contract Engine's already-
    resolved net total (which already includes any tactical SpecialOffer/
    Promotion discount -- untouched here). Does NOT validate agent_id or
    contract_id exist -- trusts the caller (Booking Engine's create_booking
    already calls _require_agent and has a real contract.id by this point).

    Decision 074: derives its aggregate figures by summing
    build_nightly_breakdown's per-night entries -- the single source of
    truth for the per-night split first introduced in Decision 073
    (superseding Decision 072's "any overlap discounts the whole stay"
    rule). Order: discount first, then add the flat global per-night
    markup on top of the (possibly discounted) net -- owner-confirmed
    calculation order, unchanged since Decision 069.
    """
    nightly = build_nightly_breakdown(
        db, agent_id, contract_id, room_net_total, nights, room_type_id, meal_plan_id, check_in, check_out
    )
    settings = get_pricing_settings(db, _contract_currency(db, contract_id))
    excl = is_exclusive(db, agent_id)
    pct = next((n["discount_percent"] for n in nightly if n["discount_applied"]), 0.0)
    discounted_nights = sum(1 for n in nightly if n["discount_applied"])
    exclusive_discount_amount = sum(n["discount_amount"] for n in nightly)
    markup_amount = sum(n["markup"] for n in nightly)
    agent_room_total = sum(n["final_price"] for n in nightly)

    return {
        "room_net_total": room_net_total,
        "is_exclusive": excl,
        "contract_discount_percent": pct,
        "discounted_nights": discounted_nights,
        "standard_nights": nights - discounted_nights,
        "exclusive_discount_amount": exclusive_discount_amount,
        "markup_amount_per_night": settings.standard_markup_amount_per_night,
        "markup_amount": markup_amount,
        "agent_room_total": agent_room_total,
    }


# ---------------------------------------------------------------------------
# Flexible-date scan (Decision 149)
# ---------------------------------------------------------------------------

# One "unit" of scan work is one (hotel, check-in date) pair -- the thing
# that costs a full room-type x meal-plan price sweep. Deliberately
# expressed in units rather than "N hotels" or "N days" so it stays a real
# formula as the catalog grows, instead of a number tuned to today's two
# hotels. Measured on this project's real data: ~0.29s for a 15-room-type
# hotel with 1 meal plan (Siyam World), ~0.46s for a 10-room-type hotel
# with 4 meal plans (Kandima) -- so 40 units is roughly 12-18 seconds of
# worst-case server work, which is why HotelSearch.tsx sends its candidate
# dates in small chunks and fills the strip in progressively rather than
# blocking on one large request.
MAX_SCAN_UNITS = 40

# Machine-readable codes, never user-facing sentences -- the frontend owns
# the RU/EN wording (Decision 111's lesson: a string generated server-side
# bypasses i18next entirely and gets stuck in whichever language it was
# written in).
SCAN_NO_ACTIVE_CONTRACT = "no_active_contract"
SCAN_NO_PRICEABLE_ROOMS = "no_priceable_rooms"


def _net_ordering_is_faithful(
    db: Session, contract_id: int, agent_is_exclusive: bool, cache: dict[int, bool]
) -> bool:
    """
    True when "cheapest net price" and "cheapest agent-facing price" are
    guaranteed to pick the SAME room-type/meal-plan combination, letting
    the scan run apply_agent_pricing once for the winner instead of once
    per candidate (measured at ~26% of total scan time).

    That guarantee holds whenever no exclusive discount can apply, because
    the only remaining transformation is the flat per-night markup, which
    is identical for every candidate of the same stay length -- adding the
    same constant to every candidate cannot reorder them. It does NOT hold
    once an exclusive discount is in play, since ContractExclusiveDiscount
    rows are per-room-type/meal-plan and can reorder candidates outright;
    that case falls back to pricing every candidate properly.

    Note this is an optimization gate only -- it never changes any price,
    just how many times apply_agent_pricing (the single source of truth
    either way) has to be called.
    """
    if not agent_is_exclusive:
        return True
    if contract_id not in cache:
        cache[contract_id] = len(repository.list_contract_exclusive_discounts(db, contract_id)) == 0
    return cache[contract_id]


def _scan_one_stay(
    db: Session,
    agent_id: int,
    hotel_id: int,
    hotel_name: str,
    room_types: list,
    check_in: date,
    nights: int,
    adults: int,
    children: int,
    infants: int,
    agent_is_exclusive: bool,
    meal_plan_cache: dict,
    exclusive_gate_cache: dict[int, bool],
) -> dict:
    """
    Price one (hotel, check-in) unit and return the cheapest bookable
    room-type/meal-plan combination for it.

    Every price here comes from the same two functions the real booking
    flow uses -- Contract Engine's get_room_price and this engine's
    apply_agent_pricing -- so a date shown as cheapest in the strip cannot
    disagree with what booking that date would actually charge. Nothing is
    estimated, extrapolated between dates, or cached across dates.
    """
    check_out = check_in + timedelta(days=nights)
    row = {
        "hotel_id": hotel_id,
        "hotel_name": hotel_name,
        "check_in": check_in,
        "check_out": check_out,
        "nights": nights,
        "contract_id": None,
        "currency": None,
        "min_total": None,
        "room_type_id": None,
        "room_name": None,
        "meal_code": None,
        "meal_name": None,
        "available": None,
        "combinations_priced": 0,
        "unavailable_reason": None,
    }

    contract = contract_service.get_active_contract(db, hotel_id, check_in)
    if contract is None:
        row["unavailable_reason"] = SCAN_NO_ACTIVE_CONTRACT
        return row

    row["contract_id"] = contract.id
    row["currency"] = contract.currency
    net_ordering_faithful = _net_ordering_is_faithful(
        db, contract.id, agent_is_exclusive, exclusive_gate_cache
    )

    best = None  # (comparable_total, room_type, meal_plan, net_price_dict)
    priced = 0

    for room_type in room_types:
        cache_key = (contract.id, room_type.id)
        if cache_key not in meal_plan_cache:
            # Depends only on contract configuration, never on the dates
            # being scanned -- safe to resolve once and reuse across every
            # candidate date in this scan.
            try:
                meal_plan_cache[cache_key] = contract_service.get_meal_plans(db, contract.id, room_type.id)
            except ValueError:
                meal_plan_cache[cache_key] = []

        for meal_plan in meal_plan_cache[cache_key]:
            try:
                price = contract_service.get_room_price(
                    db, contract.id, room_type.id, check_in, check_out,
                    meal_plan.meal_code, adults, children, infants,
                )
            except ValueError:
                # Expected and common, not an error worth surfacing per
                # combination: a room type too small for this occupancy, or
                # one with no rate configured for the season this check-in
                # falls in. Only a unit where EVERY combination fails
                # reports anything (SCAN_NO_PRICEABLE_ROOMS below).
                continue

            priced += 1
            if net_ordering_faithful:
                comparable = price["final_total"]
            else:
                comparable = apply_agent_pricing(
                    db, agent_id, contract.id, price["final_total"], price["nights"],
                    room_type.id, price["meal_plan_id"], check_in, check_out,
                )["agent_room_total"]

            if best is None or comparable < best[0]:
                best = (comparable, room_type, meal_plan, price)

    row["combinations_priced"] = priced
    if best is None:
        row["unavailable_reason"] = SCAN_NO_PRICEABLE_ROOMS
        return row

    _, room_type, meal_plan, price = best
    if net_ordering_faithful:
        # Only the winner needs the real agent-facing calculation -- see
        # _net_ordering_is_faithful for why the winner is provably the same
        # either way.
        agent_total = apply_agent_pricing(
            db, agent_id, contract.id, price["final_total"], price["nights"],
            room_type.id, price["meal_plan_id"], check_in, check_out,
        )["agent_room_total"]
    else:
        agent_total = best[0]

    row["min_total"] = agent_total
    row["room_type_id"] = room_type.id
    row["room_name"] = room_type.room_name
    row["meal_code"] = meal_plan.meal_code
    row["meal_name"] = meal_plan.meal_name
    row["currency"] = price["currency"]
    try:
        row["available"] = contract_service.check_allotment(
            db, contract.id, room_type.id, check_in, check_out
        )
    except ValueError:
        row["available"] = None
    return row


def scan_dates(
    db: Session,
    agent_id: int,
    hotel_ids: list[int],
    check_ins: list[date],
    nights: int,
    adults: int,
    children: int,
    infants: int = 0,
) -> list[dict]:
    """
    Decision 149: price the same stay length across many candidate check-in
    dates, returning the cheapest bookable option per (hotel, date) so the
    agent can see which dates are actually worth booking before committing
    to any.

    Deliberately takes an explicit list of check-in dates rather than a
    "flexible mode" (+/-N days, whole month, ...): generating candidate
    dates is calendar arithmetic that belongs with the UI that offers those
    modes, and keeping this signature dumb lets the frontend send the dates
    in small chunks and fill its price strip in progressively instead of
    blocking on one long request.

    The returned min_total is the cheapest ROOM total only. Transfer and
    mandatory tax are deliberately excluded -- both depend on choices the
    agent has not made yet at this stage (which transfer, if any), and
    folding a guessed one into a headline "from" price would make the strip
    disagree with the real quote the agent sees after picking a date.

    Inherits Contract Engine's documented single-season simplification
    unchanged: get_room_price prices a whole stay off the season covering
    check_in, so a candidate date whose stay crosses a season boundary is
    priced entirely at the check-in season's rate. This scan surfaces that
    behavior honestly rather than working around it -- Contract Engine is
    LOCKED, and inventing a season-aware nightly rate here would produce
    numbers the actual booking would then contradict.
    """
    if nights < 1:
        raise ValueError(f"nights must be at least 1, got {nights}")
    if not hotel_ids:
        raise ValueError("At least one hotel_id is required")
    if not check_ins:
        raise ValueError("At least one check_in date is required")
    if adults < 1:
        raise ValueError(f"adults must be at least 1, got {adults}")

    units = len(hotel_ids) * len(check_ins)
    if units > MAX_SCAN_UNITS:
        raise ValueError(
            f"Scan too large: {len(hotel_ids)} hotels x {len(check_ins)} dates = {units} "
            f"units, maximum is {MAX_SCAN_UNITS}. Narrow the hotels or the date range."
        )

    agent_is_exclusive = is_exclusive(db, agent_id)
    meal_plan_cache: dict = {}
    exclusive_gate_cache: dict[int, bool] = {}

    results: list[dict] = []
    for hotel_id in hotel_ids:
        try:
            hotel = hotel_service.get_hotel(db, hotel_id)
        except ValueError:
            # A hotel id that doesn't exist shouldn't sink the whole scan --
            # every other picked hotel still has real dates to report.
            continue
        room_types = hotel_service.list_room_types(db, hotel_id)
        for check_in in check_ins:
            results.append(_scan_one_stay(
                db, agent_id, hotel_id, hotel.hotel_name, room_types, check_in, nights,
                adults, children, infants, agent_is_exclusive,
                meal_plan_cache, exclusive_gate_cache,
            ))
    return results


# ---------------------------------------------------------------------------
# Security (2026-10-16): the agent-facing quote. Search used to fetch Contract
# Engine's net room price into the agent's browser and send it back here to
# be marked up -- so our cost was readable in the network tab. These two
# functions do the whole computation server-side and return only what the
# agent pays: no net total, no markup, no base rate.
# ---------------------------------------------------------------------------


def agent_room_quote(
    db: Session,
    agent_id: int,
    contract_id: int,
    room_type_id: int,
    check_in: date,
    check_out: date,
    meal_plan: str,
    adults: int,
    children: int,
    infants: int = 0,
) -> dict:
    price = contract_service.get_room_price(
        db, contract_id, room_type_id, check_in, check_out, meal_plan, adults, children, infants
    )
    agent = apply_agent_pricing(
        db, agent_id, contract_id, price["final_total"], price["nights"], room_type_id,
        price["meal_plan_id"], check_in, check_out,
    )
    return {
        "contract_id": contract_id,
        "room_type_id": room_type_id,
        "meal_plan_id": price["meal_plan_id"],
        "currency": price["currency"],
        "nights": price["nights"],
        "agent_room_total": agent["agent_room_total"],
        "applied_special_offer_ids": price.get("applied_special_offer_ids") or [],
    }


def agent_nightly_quote(
    db: Session,
    agent_id: int,
    contract_id: int,
    room_type_id: int,
    check_in: date,
    check_out: date,
    meal_plan: str,
    adults: int,
    children: int,
    infants: int = 0,
) -> list[dict]:
    price = contract_service.get_room_price(
        db, contract_id, room_type_id, check_in, check_out, meal_plan, adults, children, infants
    )
    nights = build_nightly_breakdown(
        db, agent_id, contract_id, price["final_total"], price["nights"], room_type_id,
        price["meal_plan_id"], check_in, check_out,
    )
    return [
        {
            "date": n["date"],
            "final_price": n["final_price"],
            "discount_applied": n["discount_applied"],
            "discount_percent": n["discount_percent"],
        }
        for n in nights
    ]
