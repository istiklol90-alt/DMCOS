"""
Business/orchestration layer for the Contract Engine.

Same layering as Hotel Engine (08_Coding_Standards.md: "Business logic
inside Services", "Database access through Repository Layer"): this
module calls validators.py before writing anything, and is the only
place that talks to Hotel Engine directly — via app.engines.hotel.service
— per docs/interface-contracts/contract-hotel-booking.md. repository.py
and models.py never import anything from Hotel Engine.

The eight functions Contract Engine owes Booking Engine per that Interface
Contract are implemented at the bottom of this file: get_active_contract,
get_room_price, check_allotment, get_cancellation_policy, get_meal_plans,
get_child_policy, reserve_allotment, release_allotment. Several are
deliberately simplified given today's signatures and data — each says so
in its own docstring rather than silently guessing.

reserve_allotment/release_allotment were added post-LOCK (Decision 011)
as a purely additive extension — no existing function signature changed —
once Booking Engine's TASK-002 identified that inventory decrement/
increment (02_Logic_Rules.md #51) had no way to happen otherwise.
"""

from datetime import date as date_type, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.contract import repository
from app.engines.contract.models import (
    Contract,
    ContractMarket,
    ContractSeason,
    ContractAgeCategory,
    ContractMealPlan,
    Rate,
    RateSupplement,
    Promotion,
    BlackoutDate,
    Allotment,
    StopSale,
    CancellationPolicy,
    ReleaseRule,
    MinimumStayRule,
)
from app.engines.contract.schemas import (
    ContractCreate,
    ContractUpdate,
    ContractMarketCreate,
    ContractSeasonCreate,
    ContractSeasonUpdate,
    ContractAgeCategoryCreate,
    ContractMealPlanCreate,
    RateCreate,
    RateUpdate,
    RateSupplementCreate,
    RateSupplementUpdate,
    PromotionCreate,
    PromotionUpdate,
    BlackoutDateCreate,
    AllotmentCreate,
    AllotmentUpdate,
    StopSaleCreate,
    StopSaleUpdate,
    CancellationPolicyCreate,
    ReleaseRuleCreate,
    MinimumStayRuleCreate,
)
from app.engines.contract.validators import (
    validate_contract_status,
    validate_child_status,
    validate_currency,
    validate_meal_code,
    validate_promotion_type,
    validate_calculation_basis,
    validate_date_range,
    validate_stay_range,
    validate_age_category_range,
    validate_rate_season_matches_contract,
    validate_allotment_capacity,
    validate_promotion_stacking,
    apply_sequential_discounts,
)

# Per docs/interface-contracts/contract-hotel-booking.md — the only point
# where Contract Engine reaches into another Engine. Everything else in
# this file talks only to its own repository.py.
from app.engines.hotel import service as hotel_service


# ---------------------------------------------------------------------------
# Internal existence guards
# ---------------------------------------------------------------------------


def _require_contract(db: Session, contract_id: int) -> Contract:
    contract = repository.get_contract(db, contract_id)
    if contract is None:
        raise ValueError(f"Contract {contract_id} not found")
    return contract


def _require_contract_season(db: Session, season_id: int) -> ContractSeason:
    season = repository.get_contract_season(db, season_id)
    if season is None:
        raise ValueError(f"Contract season {season_id} not found")
    return season


def _require_contract_market(db: Session, market_id: int) -> ContractMarket:
    market = repository.get_contract_market(db, market_id)
    if market is None:
        raise ValueError(f"Contract market {market_id} not found")
    return market


def _require_contract_age_category(db: Session, category_id: int) -> ContractAgeCategory:
    category = repository.get_contract_age_category(db, category_id)
    if category is None:
        raise ValueError(f"Contract age category {category_id} not found")
    return category


def _require_contract_meal_plan(db: Session, meal_plan_id: int) -> ContractMealPlan:
    meal_plan = repository.get_contract_meal_plan(db, meal_plan_id)
    if meal_plan is None:
        raise ValueError(f"Contract meal plan {meal_plan_id} not found")
    return meal_plan


def _require_rate(db: Session, rate_id: int) -> Rate:
    rate = repository.get_rate(db, rate_id)
    if rate is None:
        raise ValueError(f"Rate {rate_id} not found")
    return rate


def _require_promotion(db: Session, promotion_id: int) -> Promotion:
    promotion = repository.get_promotion(db, promotion_id)
    if promotion is None:
        raise ValueError(f"Promotion {promotion_id} not found")
    return promotion


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


def create_contract(db: Session, data: ContractCreate) -> Contract:
    """Create a new contract. Always starts in "Draft" status (the model's default) — ContractCreate has no status field. Raises ValueError if hotel_id doesn't exist in Hotel Engine."""
    hotel_service.get_hotel(db, data.hotel_id)
    validate_currency(data.currency)
    validate_date_range(data.start_date, data.end_date)
    return repository.create_contract(db, **data.model_dump())


def get_contract(db: Session, contract_id: int) -> Contract:
    """Fetch one contract by id, or raise ValueError if it doesn't exist."""
    return _require_contract(db, contract_id)


def list_contracts(db: Session, skip: int = 0, limit: int = 100) -> list[Contract]:
    """Return a page of contracts across all hotels."""
    return repository.list_contracts(db, skip=skip, limit=limit)


def list_contracts_by_hotel(db: Session, hotel_id: int) -> list[Contract]:
    """Return every contract for one hotel, any status."""
    return repository.list_contracts_by_hotel(db, hotel_id)


def update_contract(db: Session, contract_id: int, data: ContractUpdate) -> Contract:
    """Update a contract's profile fields and/or status from a single ContractUpdate payload. contract_status is split out and routed through update_contract_status, matching Hotel Engine's update_hotel pattern."""
    contract = _require_contract(db, contract_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("contract_status", None)

    if "currency" in update_data:
        validate_currency(update_data["currency"])
    if "start_date" in update_data or "end_date" in update_data:
        validate_date_range(
            update_data.get("start_date", contract.start_date),
            update_data.get("end_date", contract.end_date),
        )

    if update_data:
        contract = repository.update_contract(db, contract, **update_data)
    if new_status is not None:
        contract = update_contract_status(db, contract_id, new_status)

    return contract


def update_contract_status(db: Session, contract_id: int, contract_status: str) -> Contract:
    """Validate and apply a contract status change on its own, independent of profile edits."""
    contract = _require_contract(db, contract_id)
    validate_contract_status(contract_status)
    return repository.update_contract_status(db, contract, contract_status)


# ---------------------------------------------------------------------------
# Contract Market
# ---------------------------------------------------------------------------


def create_contract_market(db: Session, data: ContractMarketCreate) -> ContractMarket:
    """Add a market to a contract. Raises ValueError if the contract doesn't exist."""
    _require_contract(db, data.contract_id)
    validate_child_status(data.status)
    return repository.create_contract_market(db, **data.model_dump())


def get_contract_market(db: Session, market_id: int) -> ContractMarket:
    """Fetch one contract market by id, or raise ValueError if it doesn't exist."""
    return _require_contract_market(db, market_id)


def list_contract_markets(db: Session, contract_id: int) -> list[ContractMarket]:
    """Return every market assigned to one contract."""
    return repository.list_contract_markets(db, contract_id)


def update_contract_market(db: Session, market_id: int, **fields) -> ContractMarket:
    """Update an existing contract market's fields. Fields not passed are left untouched."""
    market = _require_contract_market(db, market_id)
    if "status" in fields:
        validate_child_status(fields["status"])
    return repository.update_contract_market(db, market, **fields)


# ---------------------------------------------------------------------------
# Contract Season
# ---------------------------------------------------------------------------


def create_contract_season(db: Session, data: ContractSeasonCreate) -> ContractSeason:
    """Add a season to a contract. Raises ValueError if the contract doesn't exist or start_date is after end_date."""
    _require_contract(db, data.contract_id)
    validate_date_range(data.start_date, data.end_date)
    return repository.create_contract_season(db, **data.model_dump())


def get_contract_season(db: Session, season_id: int) -> ContractSeason:
    """Fetch one contract season by id, or raise ValueError if it doesn't exist."""
    return _require_contract_season(db, season_id)


def list_contract_seasons(db: Session, contract_id: int) -> list[ContractSeason]:
    """Return every season defined for one contract."""
    return repository.list_contract_seasons(db, contract_id)


def update_contract_season(db: Session, season_id: int, data: ContractSeasonUpdate) -> ContractSeason:
    """Update a season's profile fields and/or status. status is split out and routed through update_contract_season_status."""
    season = _require_contract_season(db, season_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if "start_date" in update_data or "end_date" in update_data:
        validate_date_range(
            update_data.get("start_date", season.start_date),
            update_data.get("end_date", season.end_date),
        )

    if update_data:
        season = repository.update_contract_season(db, season, **update_data)
    if new_status is not None:
        season = update_contract_season_status(db, season_id, new_status)

    return season


def update_contract_season_status(db: Session, season_id: int, status: str) -> ContractSeason:
    """Validate and apply a season status change on its own, independent of profile edits."""
    season = _require_contract_season(db, season_id)
    validate_child_status(status)
    return repository.update_contract_season_status(db, season, status)


# ---------------------------------------------------------------------------
# Contract Age Category
# ---------------------------------------------------------------------------


def create_contract_age_category(db: Session, data: ContractAgeCategoryCreate) -> ContractAgeCategory:
    """Add an age category to a contract (e.g. Child, 2-11). Raises ValueError if the contract doesn't exist or min_age > max_age."""
    _require_contract(db, data.contract_id)
    validate_age_category_range(data.min_age, data.max_age)
    return repository.create_contract_age_category(db, **data.model_dump())


def get_contract_age_category(db: Session, category_id: int) -> ContractAgeCategory:
    """Fetch one age category by id, or raise ValueError if it doesn't exist."""
    return _require_contract_age_category(db, category_id)


def list_contract_age_categories(db: Session, contract_id: int) -> list[ContractAgeCategory]:
    """Return every age category defined for one contract."""
    return repository.list_contract_age_categories(db, contract_id)


def update_contract_age_category(db: Session, category_id: int, **fields) -> ContractAgeCategory:
    """Update an existing age category's fields, re-validating min_age/max_age if either is changing."""
    category = _require_contract_age_category(db, category_id)
    new_min = fields.get("min_age", category.min_age)
    new_max = fields.get("max_age", category.max_age)
    validate_age_category_range(new_min, new_max)
    return repository.update_contract_age_category(db, category, **fields)


# ---------------------------------------------------------------------------
# Contract Meal Plan
# ---------------------------------------------------------------------------


def create_contract_meal_plan(db: Session, data: ContractMealPlanCreate) -> ContractMealPlan:
    """Add a meal plan to a contract. Raises ValueError if the contract doesn't exist or meal_code isn't a documented value."""
    _require_contract(db, data.contract_id)
    validate_meal_code(data.meal_code)
    return repository.create_contract_meal_plan(db, **data.model_dump())


def get_contract_meal_plan(db: Session, meal_plan_id: int) -> ContractMealPlan:
    """Fetch one contract meal plan by id, or raise ValueError if it doesn't exist."""
    return _require_contract_meal_plan(db, meal_plan_id)


def list_contract_meal_plans(db: Session, contract_id: int) -> list[ContractMealPlan]:
    """Return every meal plan defined for one contract."""
    return repository.list_contract_meal_plans(db, contract_id)


def update_contract_meal_plan(db: Session, meal_plan_id: int, **fields) -> ContractMealPlan:
    """Update an existing contract meal plan's fields."""
    meal_plan = _require_contract_meal_plan(db, meal_plan_id)
    if "meal_code" in fields:
        validate_meal_code(fields["meal_code"])
    return repository.update_contract_meal_plan(db, meal_plan, **fields)


# ---------------------------------------------------------------------------
# Rate
# ---------------------------------------------------------------------------


def create_rate(db: Session, data: RateCreate) -> Rate:
    """
    Create a new rate. Raises ValueError if: the contract doesn't exist,
    room_type_id doesn't exist in Hotel Engine, season_id doesn't exist or
    belongs to a different contract, meal_plan_id/market_id don't exist,
    the currency isn't supported, or minimum_stay > maximum_stay /
    booking or travel date ranges are inverted.
    """
    _require_contract(db, data.contract_id)
    season = _require_contract_season(db, data.season_id)
    validate_rate_season_matches_contract(data.contract_id, season)
    hotel_service.get_room_type(db, data.room_type_id)
    _require_contract_meal_plan(db, data.meal_plan_id)
    if data.market_id is not None:
        _require_contract_market(db, data.market_id)
    validate_currency(data.currency)
    validate_stay_range(data.minimum_stay, data.maximum_stay)
    validate_date_range(data.booking_start, data.booking_end)
    validate_date_range(data.travel_start, data.travel_end)
    return repository.create_rate(db, **data.model_dump())


def get_rate(db: Session, rate_id: int) -> Rate:
    """Fetch one rate by id, or raise ValueError if it doesn't exist."""
    return _require_rate(db, rate_id)


def list_rates(
    db: Session,
    contract_id: int,
    room_type_id: Optional[int] = None,
    season_id: Optional[int] = None,
    meal_plan_id: Optional[int] = None,
) -> list[Rate]:
    """Return rates for one contract, optionally narrowed by room_type_id/season_id/meal_plan_id."""
    return repository.list_rates(db, contract_id, room_type_id, season_id, meal_plan_id)


def update_rate(db: Session, rate_id: int, data: RateUpdate) -> Rate:
    """Update a rate's profile fields and/or status. status is split out and routed through update_rate_status."""
    rate = _require_rate(db, rate_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if "market_id" in update_data and update_data["market_id"] is not None:
        _require_contract_market(db, update_data["market_id"])
    if "currency" in update_data:
        validate_currency(update_data["currency"])
    if "minimum_stay" in update_data or "maximum_stay" in update_data:
        validate_stay_range(
            update_data.get("minimum_stay", rate.minimum_stay),
            update_data.get("maximum_stay", rate.maximum_stay),
        )
    if "booking_start" in update_data or "booking_end" in update_data:
        validate_date_range(
            update_data.get("booking_start", rate.booking_start),
            update_data.get("booking_end", rate.booking_end),
        )
    if "travel_start" in update_data or "travel_end" in update_data:
        validate_date_range(
            update_data.get("travel_start", rate.travel_start),
            update_data.get("travel_end", rate.travel_end),
        )

    if update_data:
        rate = repository.update_rate(db, rate, **update_data)
    if new_status is not None:
        rate = update_rate_status(db, rate_id, new_status)

    return rate


def update_rate_status(db: Session, rate_id: int, status: str) -> Rate:
    """Validate and apply a rate status change on its own, independent of profile edits."""
    rate = _require_rate(db, rate_id)
    validate_child_status(status)
    return repository.update_rate_status(db, rate, status)


# ---------------------------------------------------------------------------
# Rate Supplement
# ---------------------------------------------------------------------------


def create_rate_supplement(db: Session, data: RateSupplementCreate) -> RateSupplement:
    """Add a supplement/adjustment to a rate. Raises ValueError if the rate, age_category, or meal_plan (whichever are given) don't exist."""
    _require_rate(db, data.rate_id)
    if data.age_category_id is not None:
        _require_contract_age_category(db, data.age_category_id)
    if data.meal_plan_id is not None:
        _require_contract_meal_plan(db, data.meal_plan_id)
    validate_calculation_basis(data.calculation_basis)
    return repository.create_rate_supplement(db, **data.model_dump())


def get_rate_supplement(db: Session, supplement_id: int) -> RateSupplement:
    """Fetch one rate supplement by id, or raise ValueError if it doesn't exist."""
    supplement = repository.get_rate_supplement(db, supplement_id)
    if supplement is None:
        raise ValueError(f"Rate supplement {supplement_id} not found")
    return supplement


def list_rate_supplements(
    db: Session, rate_id: int, adjustment_type: Optional[str] = None
) -> list[RateSupplement]:
    """Return every supplement/adjustment attached to one rate, optionally narrowed by adjustment_type."""
    return repository.list_rate_supplements(db, rate_id, adjustment_type)


def update_rate_supplement(db: Session, supplement_id: int, **fields) -> RateSupplement:
    """Update a rate supplement's fields (excluding status, which goes through update_rate_supplement_status)."""
    supplement = get_rate_supplement(db, supplement_id)
    if "calculation_basis" in fields:
        validate_calculation_basis(fields["calculation_basis"])
    return repository.update_rate_supplement(db, supplement, **fields)


def update_rate_supplement_status(db: Session, supplement_id: int, status: str) -> RateSupplement:
    """Validate and apply a rate supplement status change on its own."""
    supplement = get_rate_supplement(db, supplement_id)
    validate_child_status(status)
    return repository.update_rate_supplement_status(db, supplement, status)


# ---------------------------------------------------------------------------
# Promotion
# ---------------------------------------------------------------------------


def create_promotion(db: Session, data: PromotionCreate) -> Promotion:
    """Add a promotion to a contract. Raises ValueError if the contract doesn't exist, promotion_type isn't documented, or booking/travel date ranges are inverted."""
    _require_contract(db, data.contract_id)
    validate_promotion_type(data.promotion_type)
    validate_date_range(data.booking_start, data.booking_end)
    validate_date_range(data.travel_start, data.travel_end)
    return repository.create_promotion(db, **data.model_dump())


def get_promotion(db: Session, promotion_id: int) -> Promotion:
    """Fetch one promotion by id, or raise ValueError if it doesn't exist."""
    return _require_promotion(db, promotion_id)


def list_promotions(db: Session, contract_id: int) -> list[Promotion]:
    """Return every promotion defined for one contract."""
    return repository.list_promotions(db, contract_id)


def update_promotion(db: Session, promotion_id: int, data: PromotionUpdate) -> Promotion:
    """Update a promotion's profile fields and/or status. status is split out and routed through update_promotion_status."""
    promotion = _require_promotion(db, promotion_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if "promotion_type" in update_data:
        validate_promotion_type(update_data["promotion_type"])
    if "booking_start" in update_data or "booking_end" in update_data:
        validate_date_range(
            update_data.get("booking_start", promotion.booking_start),
            update_data.get("booking_end", promotion.booking_end),
        )
    if "travel_start" in update_data or "travel_end" in update_data:
        validate_date_range(
            update_data.get("travel_start", promotion.travel_start),
            update_data.get("travel_end", promotion.travel_end),
        )

    if update_data:
        promotion = repository.update_promotion(db, promotion, **update_data)
    if new_status is not None:
        promotion = update_promotion_status(db, promotion_id, new_status)

    return promotion


def update_promotion_status(db: Session, promotion_id: int, status: str) -> Promotion:
    """Validate and apply a promotion status change on its own, independent of profile edits."""
    promotion = _require_promotion(db, promotion_id)
    validate_child_status(status)
    return repository.update_promotion_status(db, promotion, status)


# ---------------------------------------------------------------------------
# Blackout Date
# ---------------------------------------------------------------------------


def create_blackout_date(db: Session, data: BlackoutDateCreate) -> BlackoutDate:
    """Add a blackout date to a promotion. Raises ValueError if the contract/promotion don't exist, the promotion belongs to a different contract, or the date range is inverted."""
    _require_contract(db, data.contract_id)
    promotion = _require_promotion(db, data.promotion_id)
    if promotion.contract_id != data.contract_id:
        raise ValueError(
            f"Promotion {promotion.id} belongs to contract {promotion.contract_id}, "
            f"not contract {data.contract_id}"
        )
    validate_date_range(data.start_date, data.end_date)
    return repository.create_blackout_date(db, **data.model_dump())


def get_blackout_date(db: Session, blackout_id: int) -> BlackoutDate:
    """Fetch one blackout date by id, or raise ValueError if it doesn't exist."""
    blackout = repository.get_blackout_date(db, blackout_id)
    if blackout is None:
        raise ValueError(f"Blackout date {blackout_id} not found")
    return blackout


def list_blackout_dates(
    db: Session, contract_id: int, promotion_id: Optional[int] = None
) -> list[BlackoutDate]:
    """Return blackout dates for one contract, optionally narrowed to a single promotion."""
    return repository.list_blackout_dates(db, contract_id, promotion_id)


def update_blackout_date(db: Session, blackout_id: int, **fields) -> BlackoutDate:
    """Update an existing blackout date's fields."""
    blackout = get_blackout_date(db, blackout_id)
    return repository.update_blackout_date(db, blackout, **fields)


# ---------------------------------------------------------------------------
# Allotment
# ---------------------------------------------------------------------------


def create_allotment(db: Session, data: AllotmentCreate) -> Allotment:
    """
    Create one day's allotment. Raises ValueError if the contract doesn't
    exist, room_type_id doesn't exist in Hotel Engine, sold_rooms exceeds
    allocated_rooms, or a row for that contract+room_type+date already
    exists (pre-checked here, same reasoning as Hotel Engine's
    create_room_availability, so callers get a clean ValueError instead of
    a DB-level IntegrityError from the unique constraint).

    available_rooms is computed here (allocated_rooms - sold_rooms), never
    taken from the caller.
    """
    _require_contract(db, data.contract_id)
    hotel_service.get_room_type(db, data.room_type_id)
    validate_allotment_capacity(data.allocated_rooms, data.sold_rooms)

    existing = repository.get_allotment_by_date(db, data.contract_id, data.room_type_id, data.date)
    if existing is not None:
        raise ValueError(
            f"Contract {data.contract_id} / room type {data.room_type_id} already has "
            f"an allotment row for {data.date}. Use update_allotment instead."
        )

    fields = data.model_dump()
    fields["available_rooms"] = data.allocated_rooms - data.sold_rooms
    return repository.create_allotment(db, **fields)


def get_allotment(db: Session, allotment_id: int) -> Allotment:
    """Fetch one allotment row by id, or raise ValueError if it doesn't exist."""
    allotment = repository.get_allotment(db, allotment_id)
    if allotment is None:
        raise ValueError(f"Allotment {allotment_id} not found")
    return allotment


def list_allotments(
    db: Session,
    contract_id: int,
    room_type_id: int,
    start_date: Optional[date_type] = None,
    end_date: Optional[date_type] = None,
) -> list[Allotment]:
    """Return the day-by-day allotment calendar for one contract + room type, optionally bounded to a date range."""
    validate_date_range(start_date, end_date)
    return repository.list_allotments(db, contract_id, room_type_id, start_date, end_date)


def update_allotment(db: Session, allotment_id: int, data: AllotmentUpdate) -> Allotment:
    """
    Update an allotment's allocated_rooms/sold_rooms and/or status.
    Re-validates sold_rooms <= allocated_rooms using whichever of the two is
    being changed combined with whichever is left as-is, and recomputes
    available_rooms whenever either changes — mirroring how Hotel Engine's
    update_room_occupancy_option re-validates a partial update against the
    parent's capacity.
    """
    allotment = get_allotment(db, allotment_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    new_allocated = update_data.get("allocated_rooms", allotment.allocated_rooms)
    new_sold = update_data.get("sold_rooms", allotment.sold_rooms)
    if "allocated_rooms" in update_data or "sold_rooms" in update_data:
        validate_allotment_capacity(new_allocated, new_sold)
        update_data["available_rooms"] = new_allocated - new_sold

    if update_data:
        allotment = repository.update_allotment(db, allotment, **update_data)
    if new_status is not None:
        allotment = update_allotment_status(db, allotment_id, new_status)

    return allotment


def update_allotment_status(db: Session, allotment_id: int, status: str) -> Allotment:
    """Validate and apply an allotment status change on its own, independent of the room counts."""
    allotment = get_allotment(db, allotment_id)
    validate_child_status(status)
    return repository.update_allotment_status(db, allotment, status)


# ---------------------------------------------------------------------------
# Stop Sale
# ---------------------------------------------------------------------------


def create_stop_sale(db: Session, data: StopSaleCreate) -> StopSale:
    """Create a stop sale. Raises ValueError if the contract doesn't exist, room_type_id/meal_plan_id/market_id (whichever given) don't exist, or the date range is inverted."""
    _require_contract(db, data.contract_id)
    if data.room_type_id is not None:
        hotel_service.get_room_type(db, data.room_type_id)
    if data.meal_plan_id is not None:
        _require_contract_meal_plan(db, data.meal_plan_id)
    if data.market_id is not None:
        _require_contract_market(db, data.market_id)
    validate_date_range(data.start_date, data.end_date)
    return repository.create_stop_sale(db, **data.model_dump())


def get_stop_sale(db: Session, stop_sale_id: int) -> StopSale:
    """Fetch one stop sale by id, or raise ValueError if it doesn't exist."""
    stop_sale = repository.get_stop_sale(db, stop_sale_id)
    if stop_sale is None:
        raise ValueError(f"Stop sale {stop_sale_id} not found")
    return stop_sale


def list_stop_sales(db: Session, contract_id: int, room_type_id: Optional[int] = None) -> list[StopSale]:
    """Return stop sales for one contract, optionally narrowed to a single room type (hotel-wide rows are always included)."""
    return repository.list_stop_sales(db, contract_id, room_type_id)


def update_stop_sale(db: Session, stop_sale_id: int, data: StopSaleUpdate) -> StopSale:
    """Update a stop sale's end_date/reason and/or status. status is split out and routed through update_stop_sale_status."""
    stop_sale = get_stop_sale(db, stop_sale_id)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.pop("status", None)

    if "end_date" in update_data:
        validate_date_range(stop_sale.start_date, update_data["end_date"])

    if update_data:
        stop_sale = repository.update_stop_sale(db, stop_sale, **update_data)
    if new_status is not None:
        stop_sale = update_stop_sale_status(db, stop_sale_id, new_status)

    return stop_sale


def update_stop_sale_status(db: Session, stop_sale_id: int, status: str) -> StopSale:
    """Validate and apply a stop sale status change on its own."""
    stop_sale = get_stop_sale(db, stop_sale_id)
    validate_child_status(status)
    return repository.update_stop_sale_status(db, stop_sale, status)


# ---------------------------------------------------------------------------
# Cancellation Policy
# ---------------------------------------------------------------------------


def create_cancellation_policy(db: Session, data: CancellationPolicyCreate) -> CancellationPolicy:
    """Add a cancellation policy tier to a contract. Raises ValueError if the contract doesn't exist, currency (if given) isn't supported, or the date range is inverted."""
    _require_contract(db, data.contract_id)
    if data.currency is not None:
        validate_currency(data.currency)
    validate_date_range(data.start_date, data.end_date)
    return repository.create_cancellation_policy(db, **data.model_dump())


def get_cancellation_policy_by_id(db: Session, policy_id: int) -> CancellationPolicy:
    """Fetch one cancellation policy by id, or raise ValueError if it doesn't exist."""
    policy = repository.get_cancellation_policy(db, policy_id)
    if policy is None:
        raise ValueError(f"Cancellation policy {policy_id} not found")
    return policy


def list_cancellation_policies(db: Session, contract_id: int) -> list[CancellationPolicy]:
    """Return every cancellation policy tier for one contract."""
    return repository.list_cancellation_policies(db, contract_id)


def update_cancellation_policy(db: Session, policy_id: int, **fields) -> CancellationPolicy:
    """Update an existing cancellation policy's fields."""
    policy = get_cancellation_policy_by_id(db, policy_id)
    if "currency" in fields and fields["currency"] is not None:
        validate_currency(fields["currency"])
    return repository.update_cancellation_policy(db, policy, **fields)


# ---------------------------------------------------------------------------
# Release Rule
# ---------------------------------------------------------------------------


def create_release_rule(db: Session, data: ReleaseRuleCreate) -> ReleaseRule:
    """Add a release rule override to a contract. Raises ValueError if the contract doesn't exist."""
    _require_contract(db, data.contract_id)
    return repository.create_release_rule(db, **data.model_dump())


def get_release_rule(db: Session, rule_id: int) -> ReleaseRule:
    """Fetch one release rule by id, or raise ValueError if it doesn't exist."""
    rule = repository.get_release_rule(db, rule_id)
    if rule is None:
        raise ValueError(f"Release rule {rule_id} not found")
    return rule


def list_release_rules(db: Session, contract_id: int) -> list[ReleaseRule]:
    """Return every release rule override defined for one contract."""
    return repository.list_release_rules(db, contract_id)


def update_release_rule(db: Session, rule_id: int, **fields) -> ReleaseRule:
    """Update an existing release rule's fields."""
    rule = get_release_rule(db, rule_id)
    return repository.update_release_rule(db, rule, **fields)


# ---------------------------------------------------------------------------
# Minimum Stay Rule
# ---------------------------------------------------------------------------


def create_minimum_stay_rule(db: Session, data: MinimumStayRuleCreate) -> MinimumStayRule:
    """Add a minimum-stay override to a contract. Raises ValueError if the contract doesn't exist, room_type_id (if given) doesn't exist in Hotel Engine, or the date range is inverted."""
    _require_contract(db, data.contract_id)
    if data.room_type_id is not None:
        hotel_service.get_room_type(db, data.room_type_id)
    validate_date_range(data.start_date, data.end_date)
    return repository.create_minimum_stay_rule(db, **data.model_dump())


def get_minimum_stay_rule(db: Session, rule_id: int) -> MinimumStayRule:
    """Fetch one minimum-stay rule by id, or raise ValueError if it doesn't exist."""
    rule = repository.get_minimum_stay_rule(db, rule_id)
    if rule is None:
        raise ValueError(f"Minimum stay rule {rule_id} not found")
    return rule


def list_minimum_stay_rules(
    db: Session, contract_id: int, room_type_id: Optional[int] = None
) -> list[MinimumStayRule]:
    """Return minimum-stay override rules for one contract, optionally narrowed to a single room type."""
    return repository.list_minimum_stay_rules(db, contract_id, room_type_id)


def update_minimum_stay_rule(db: Session, rule_id: int, **fields) -> MinimumStayRule:
    """Update an existing minimum-stay rule's fields."""
    rule = get_minimum_stay_rule(db, rule_id)
    return repository.update_minimum_stay_rule(db, rule, **fields)


# ---------------------------------------------------------------------------
# Interface Contract functions — what Contract Engine owes Booking Engine
# per docs/interface-contracts/contract-hotel-booking.md
# ---------------------------------------------------------------------------


def get_active_contract(db: Session, hotel_id: int) -> Optional[Contract]:
    """
    Return the contract that is usable right now for this hotel: status
    must be "Active" AND today must fall within [start_date, end_date] —
    both conditions required, per the explicit decision that administrative
    status alone isn't enough (a contract can be Active but for a past or
    future period).

    Known simplification: if more than one contract satisfies both
    conditions for the same hotel, this returns the first by id. Real
    multi-contract selection (02_Logic_Rules.md #24 "Contract Priority")
    also considers market and travel-date matching, which this function's
    signature (hotel_id only, no market/travel dates) doesn't have enough
    context to resolve — revisit if that scenario actually comes up.
    """
    today = date_type.today()
    candidates = [
        c
        for c in repository.list_contracts_by_hotel(db, hotel_id)
        if c.contract_status == "Active" and c.start_date <= today <= c.end_date
    ]
    return candidates[0] if candidates else None


def check_allotment(
    db: Session, contract_id: int, room_type_id: int, check_in: date_type, check_out: date_type
) -> bool:
    """
    Return True only if every night of [check_in, check_out) has an
    allotment row with available_rooms > 0 AND no Stop Sale blocks that
    night for this room type (or the whole hotel). Returns False if any
    single night fails either check, or if a night has no allotment row
    at all (no row = not confirmed available, not an error).
    """
    night_count = (check_out - check_in).days
    if night_count <= 0:
        raise ValueError(f"check_out ({check_out}) must be after check_in ({check_in})")
    nights = [check_in + timedelta(days=i) for i in range(night_count)]

    stop_sales = repository.list_stop_sales(db, contract_id, room_type_id)
    blocked_dates = set()
    for stop_sale in stop_sales:
        if stop_sale.status != "Active":
            continue
        d = stop_sale.start_date
        while d <= stop_sale.end_date:
            blocked_dates.add(d)
            d += timedelta(days=1)

    for night in nights:
        if night in blocked_dates:
            return False
        allotment = repository.get_allotment_by_date(db, contract_id, room_type_id, night)
        if allotment is None or allotment.status != "Active" or allotment.available_rooms is None:
            return False
        if allotment.available_rooms <= 0:
            return False

    return True


def reserve_allotment(
    db: Session, contract_id: int, room_type_id: int, check_in: date_type, check_out: date_type
) -> None:
    """
    Increment sold_rooms by 1 for every night in [check_in, check_out) for
    this contract + room type, decreasing available_rooms accordingly.
    This is what Booking Engine calls when a booking is confirmed, to
    actually consume inventory (02_Logic_Rules.md #51: "inventory
    decreases automatically").

    Validates every night has capacity (an active allotment row with
    available_rooms > 0, not blocked by an active Stop Sale) BEFORE
    writing any changes, so a failure partway through a multi-night stay
    never leaves some nights incremented and others not.

    Raises ValueError if any night lacks an allotment row, is stop-sold,
    or has no available_rooms — same failure conditions check_allotment
    checks for, but as a write instead of a read. Callers should normally
    call check_allotment first and only reserve if it returns True, but
    this function re-validates independently rather than trusting a
    caller's earlier check.
    """
    night_count = (check_out - check_in).days
    if night_count <= 0:
        raise ValueError(f"check_out ({check_out}) must be after check_in ({check_in})")
    nights = [check_in + timedelta(days=i) for i in range(night_count)]

    stop_sales = repository.list_stop_sales(db, contract_id, room_type_id)
    blocked_dates = set()
    for stop_sale in stop_sales:
        if stop_sale.status != "Active":
            continue
        d = stop_sale.start_date
        while d <= stop_sale.end_date:
            blocked_dates.add(d)
            d += timedelta(days=1)

    allotments_to_update = []
    for night in nights:
        if night in blocked_dates:
            raise ValueError(f"Room type {room_type_id} is stop-sold on {night}")
        allotment = repository.get_allotment_by_date(db, contract_id, room_type_id, night)
        if allotment is None or allotment.status != "Active":
            raise ValueError(f"No active allotment for room type {room_type_id} on {night}")
        if allotment.available_rooms is None or allotment.available_rooms <= 0:
            raise ValueError(f"No rooms available for room type {room_type_id} on {night}")
        allotments_to_update.append(allotment)

    for allotment in allotments_to_update:
        new_sold = allotment.sold_rooms + 1
        validate_allotment_capacity(allotment.allocated_rooms, new_sold)
        repository.update_allotment(
            db,
            allotment,
            sold_rooms=new_sold,
            available_rooms=allotment.allocated_rooms - new_sold,
        )


def release_allotment(
    db: Session, contract_id: int, room_type_id: int, check_in: date_type, check_out: date_type
) -> None:
    """
    Decrement sold_rooms by 1 for every night in [check_in, check_out) for
    this contract + room type, returning inventory (02_Logic_Rules.md #51:
    "when cancelled, inventory returns automatically"). This is what
    Booking Engine calls when a booking is cancelled.

    Unlike reserve_allotment, this never raises on a missing or stop-sold
    night — releasing inventory shouldn't be blocked by a Stop Sale, and a
    missing allotment row for a given night is simply skipped (nothing to
    release). sold_rooms is floored at 0 to guard against double-release.
    """
    night_count = (check_out - check_in).days
    if night_count <= 0:
        raise ValueError(f"check_out ({check_out}) must be after check_in ({check_in})")
    nights = [check_in + timedelta(days=i) for i in range(night_count)]

    for night in nights:
        allotment = repository.get_allotment_by_date(db, contract_id, room_type_id, night)
        if allotment is None:
            continue
        new_sold = max(allotment.sold_rooms - 1, 0)
        validate_allotment_capacity(allotment.allocated_rooms, new_sold)
        repository.update_allotment(
            db,
            allotment,
            sold_rooms=new_sold,
            available_rooms=allotment.allocated_rooms - new_sold,
        )


def get_cancellation_policy(
    db: Session, contract_id: int, check_in: date_type
) -> list[CancellationPolicy]:
    """
    Return the cancellation policy tier(s) applicable to a stay starting on
    check_in: contract-wide tiers (start_date/end_date both null) plus any
    tier whose date range contains check_in. Multiple tiers are expected
    (e.g. 30 days=10%, 14 days=50%, 7 days=100%) — the caller picks the
    right one based on the actual number of days before arrival at
    cancellation time, which this function has no way to know in advance.
    """
    all_policies = repository.list_cancellation_policies(db, contract_id)
    return [
        p
        for p in all_policies
        if (p.start_date is None and p.end_date is None)
        or (p.start_date is not None and p.end_date is not None and p.start_date <= check_in <= p.end_date)
    ]


def get_meal_plans(db: Session, contract_id: int, room_type_id: int) -> list[ContractMealPlan]:
    """Return the meal plans that actually have a priced Rate for this room type — not just every meal plan defined anywhere on the contract."""
    all_meal_plans = repository.list_contract_meal_plans(db, contract_id)
    priced_ids = {
        r.meal_plan_id for r in repository.list_rates(db, contract_id, room_type_id=room_type_id)
    }
    return [mp for mp in all_meal_plans if mp.id in priced_ids]


def get_child_policy(db: Session, contract_id: int, room_type_id: int) -> list[dict]:
    """
    Return this contract's age categories along with whatever per-person
    price applies to each for this room type, derived from RateSupplement
    rows (adjustment_type="age_category_price") attached to this room
    type's rates. Not a stored entity — a read-only computed view, since
    the underlying data (ContractAgeCategory + RateSupplement) is the
    actual source of truth.
    """
    categories = repository.list_contract_age_categories(db, contract_id)
    rates = repository.list_rates(db, contract_id, room_type_id=room_type_id)
    rate_ids = {r.id for r in rates}

    result = []
    for category in categories:
        prices = []
        for rate_id in rate_ids:
            for supplement in repository.list_rate_supplements(
                db, rate_id, adjustment_type="age_category_price"
            ):
                if supplement.age_category_id == category.id:
                    prices.append(
                        {
                            "rate_id": rate_id,
                            "amount": supplement.amount,
                            "calculation_basis": supplement.calculation_basis,
                        }
                    )
        result.append(
            {
                "category_name": category.category_name,
                "min_age": category.min_age,
                "max_age": category.max_age,
                "prices": prices,
            }
        )
    return result


def _match_age_category(categories: list[ContractAgeCategory], keyword: str):
    """Return the first ContractAgeCategory whose name contains keyword (case-insensitive), or None."""
    for category in categories:
        if keyword in category.category_name.lower():
            return category
    return None


def _resolve_age_categories(
    categories: list[ContractAgeCategory],
) -> dict:
    """
    Map the contract's arbitrary age categories onto the three buckets
    get_room_price's signature actually has (adults/children/infants).

    Known simplification: matches by category_name keyword ("adult"/
    "infant"), and treats the first category that's neither as "children".
    A contract with more than one non-adult/non-infant category (e.g. both
    "Teen" and "Child") can't be disambiguated by an adults/children/infants
    count alone — only the first such category found gets priced; this is
    a real limitation of the current 3-bucket signature, not a bug.
    """
    adult_category = _match_age_category(categories, "adult")
    infant_category = _match_age_category(categories, "infant")
    remaining = [c for c in categories if c is not adult_category and c is not infant_category]
    child_category = remaining[0] if remaining else None
    return {"adults": adult_category, "children": child_category, "infants": infant_category}


def _calc_supplement_total(
    supplement: RateSupplement, nights: int, base_price_per_night: float, unit_count: int
) -> float:
    """
    Compute one RateSupplement row's contribution. unit_count is the number
    of guests it applies to (the bucket's adults/children/infants count
    when the supplement is tied to an age_category_id; 1 when it's a flat,
    not-per-guest supplement, i.e. age_category_id is None).
    """
    if supplement.calculation_basis == "per_person_per_night":
        return supplement.amount * unit_count * nights
    if supplement.calculation_basis == "per_stay":
        return supplement.amount * unit_count
    if supplement.calculation_basis == "percentage_of_rate":
        return (supplement.amount / 100) * base_price_per_night * nights * unit_count
    return 0.0


def get_room_price(
    db: Session,
    contract_id: int,
    room_type_id: int,
    check_in: date_type,
    check_out: date_type,
    meal_plan: str,
    adults: int,
    children: int,
    infants: int = 0,
) -> dict:
    """
    Compute a stay's price: base per-night Rate x nights, plus age-category
    and meal-plan RateSupplement charges for the given occupancy, with any
    auto-applying, mutually-compatible Promotions applied sequentially
    (never additively, per validate_promotion_stacking /
    apply_sequential_discounts) to the base+supplements total.

    Supports both meal-plan representations the schema allows (per
    Contract Engine's TASK-002 schema decision):
      - a direct Rate row for the requested meal plan (one full price per
        meal plan), used as-is; or
      - if none exists, a base Rate for this room type/season (whichever
        meal plan it's under) plus "meal_plan_supplement" RateSupplement
        rows targeting the requested meal plan.

    Known simplifications:
      - Only the season covering check_in is used for the whole stay — a
        stay spanning two seasons is not prorated night-by-night.
      - adults/children/infants are mapped onto the contract's age
        categories by name-keyword matching (see _resolve_age_categories);
        a contract with more than one child-like category can't be fully
        disambiguated by this 3-bucket signature.

    Raises ValueError if adults < 1, if adults+children exceeds the room
    type's max_occupancy (via Hotel Engine's validate_capacity — Decision
    015; infants excluded from this check), if no season covers check_in,
    or if no Rate exists at all (direct or base) for the room type/season.
    """
    if adults < 1:
        raise ValueError(f"adults must be at least 1, got {adults}")

    hotel_service.validate_capacity(db, room_type_id, adults, children)

    meal_plans = [
        mp for mp in repository.list_contract_meal_plans(db, contract_id) if mp.meal_code == meal_plan
    ]
    if not meal_plans:
        raise ValueError(f"Contract {contract_id} has no meal plan with code '{meal_plan}'")
    target_meal_plan_id = meal_plans[0].id

    seasons = repository.get_contract_seasons_for_date(db, contract_id, check_in)
    if not seasons:
        raise ValueError(f"Contract {contract_id} has no season covering {check_in}")
    season = seasons[0]

    # Try a direct rate for this exact meal plan first (Option A).
    direct_rates = [
        r
        for r in repository.list_rates(
            db, contract_id, room_type_id=room_type_id, season_id=season.id, meal_plan_id=target_meal_plan_id
        )
        if r.status == "Active"
    ]
    needs_meal_plan_supplement = False
    if direct_rates:
        rate = direct_rates[0]
    else:
        # Fall back to a base rate under any meal plan (Option B) — the
        # meal-plan difference is expected to come from
        # "meal_plan_supplement" RateSupplement rows on that base rate.
        base_rates = [
            r
            for r in repository.list_rates(db, contract_id, room_type_id=room_type_id, season_id=season.id)
            if r.status == "Active"
        ]
        if not base_rates:
            raise ValueError(
                f"No active rate at all for contract {contract_id}, room type {room_type_id}, "
                f"season {season.id} (checked meal plan '{meal_plan}' directly and as a supplement)"
            )
        rate = base_rates[0]
        needs_meal_plan_supplement = True

    nights = (check_out - check_in).days
    base_total = rate.base_price * nights

    categories = repository.list_contract_age_categories(db, contract_id)
    bucket_categories = _resolve_age_categories(categories)
    buckets = {"adults": adults, "children": children, "infants": infants}

    supplements_total = 0.0
    for bucket_name, count in buckets.items():
        category = bucket_categories[bucket_name]
        if count <= 0 or category is None:
            continue
        for supplement in repository.list_rate_supplements(db, rate.id, adjustment_type="age_category_price"):
            if supplement.status == "Active" and supplement.age_category_id == category.id:
                supplements_total += _calc_supplement_total(supplement, nights, rate.base_price, count)
        if needs_meal_plan_supplement:
            for supplement in repository.list_rate_supplements(db, rate.id, adjustment_type="meal_plan_supplement"):
                if (
                    supplement.status == "Active"
                    and supplement.meal_plan_id == target_meal_plan_id
                    and supplement.age_category_id == category.id
                ):
                    supplements_total += _calc_supplement_total(supplement, nights, rate.base_price, count)

    if needs_meal_plan_supplement:
        for supplement in repository.list_rate_supplements(db, rate.id, adjustment_type="meal_plan_supplement"):
            if (
                supplement.status == "Active"
                and supplement.meal_plan_id == target_meal_plan_id
                and supplement.age_category_id is None
            ):
                supplements_total += _calc_supplement_total(supplement, nights, rate.base_price, 1)

    # Decision 017: adults beyond rate.base_occupancy ("based on 2" in a real
    # contract) are charged via an "extra_person" RateSupplement, separate
    # from age_category_price above — unlike that per-bucket-headcount
    # mechanism, extra_person only charges for the adults NOT already
    # included in base_price. Scoped to adults only, matching the real
    # contract this was modeled on (Kandima) — no equivalent "extra child"
    # rule has been confirmed, so this isn't extended to children/infants.
    extra_adults = max(0, adults - rate.base_occupancy)
    if extra_adults > 0:
        for supplement in repository.list_rate_supplements(db, rate.id, adjustment_type="extra_person"):
            if supplement.status == "Active":
                supplements_total += _calc_supplement_total(supplement, nights, rate.base_price, extra_adults)

    price_before_promotions = base_total + supplements_total

    today = date_type.today()
    eligible_promotions = [
        p
        for p in repository.list_promotions(db, contract_id)
        if p.status == "Active"
        and (p.booking_start is None or p.booking_start <= today)
        and (p.booking_end is None or today <= p.booking_end)
        and (p.travel_start is None or p.travel_start <= check_out)
        and (p.travel_end is None or check_in <= p.travel_end)
    ]
    validate_promotion_stacking(eligible_promotions)
    final_total = apply_sequential_discounts(price_before_promotions, eligible_promotions)

    return {
        "contract_id": contract_id,
        "room_type_id": room_type_id,
        "rate_id": rate.id,
        "season_id": season.id,
        "meal_plan_id": target_meal_plan_id,
        "used_meal_plan_supplement": needs_meal_plan_supplement,
        "currency": rate.currency,
        "nights": nights,
        "occupancy": {"adults": adults, "children": children, "infants": infants},
        "base_total": base_total,
        "supplements_total": supplements_total,
        "price_before_promotions": price_before_promotions,
        "applied_promotions": [p.id for p in eligible_promotions],
        "final_total": final_total,
    }
