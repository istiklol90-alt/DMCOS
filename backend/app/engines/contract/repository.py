from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from database.db import SessionLocal
from app.engines.contract.models import (
    Contract,
    ContractMarket,
    ContractSeason,
    ContractAgeCategory,
    ContractMealPlan,
    ContractTransferOption,
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


def get_db():
    """Yield a DB session for a single request and always close it afterwards, even if the request raised."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


def create_contract(db: Session, **fields) -> Contract:
    """Insert a new contract row from already-validated fields. New contracts start with the model's default status ("Draft") unless contract_status is explicitly passed."""
    contract = Contract(**fields)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def get_contract(db: Session, contract_id: int) -> Optional[Contract]:
    """Fetch a single contract by its primary key, or None if it doesn't exist."""
    return db.query(Contract).filter(Contract.id == contract_id).first()


def list_contracts_by_hotel(db: Session, hotel_id: int) -> list[Contract]:
    """Return every contract for one hotel (any status). Callers needing only the currently-usable one (e.g. get_active_contract) filter status/date range on top of this in service.py."""
    return db.query(Contract).filter(Contract.hotel_id == hotel_id).order_by(Contract.id).all()


def list_contracts(db: Session, skip: int = 0, limit: int = 100) -> list[Contract]:
    """Return a page of contracts across all hotels, for listing screens."""
    return db.query(Contract).order_by(Contract.id).offset(skip).limit(limit).all()


def update_contract(db: Session, contract: Contract, **fields) -> Contract:
    """Apply the given field values to an existing contract row and persist them. Does not touch contract_status — use update_contract_status for that."""
    for key, value in fields.items():
        setattr(contract, key, value)
    contract.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(contract)
    return contract


def update_contract_status(db: Session, contract: Contract, contract_status: str) -> Contract:
    """Change only the contract's lifecycle status (e.g. Draft -> Active) without touching any other field. Caller is responsible for validating the status value and the transition itself."""
    contract.contract_status = contract_status
    db.commit()
    db.refresh(contract)
    return contract


# ---------------------------------------------------------------------------
# Contract Market
# ---------------------------------------------------------------------------


def create_contract_market(db: Session, **fields) -> ContractMarket:
    """Insert a new contract market row (must include contract_id and market_name) and return it with its generated id."""
    market = ContractMarket(**fields)
    db.add(market)
    db.commit()
    db.refresh(market)
    return market


def get_contract_market(db: Session, market_id: int) -> Optional[ContractMarket]:
    """Fetch a single contract market by its primary key, or None if it doesn't exist."""
    return db.query(ContractMarket).filter(ContractMarket.id == market_id).first()


def list_contract_markets(db: Session, contract_id: int) -> list[ContractMarket]:
    """Return every market assigned to one contract."""
    return db.query(ContractMarket).filter(ContractMarket.contract_id == contract_id).all()


def update_contract_market(db: Session, market: ContractMarket, **fields) -> ContractMarket:
    """Apply the given field values to an existing contract market row and persist them."""
    for key, value in fields.items():
        setattr(market, key, value)
    db.commit()
    db.refresh(market)
    return market


# ---------------------------------------------------------------------------
# Contract Season
# ---------------------------------------------------------------------------


def create_contract_season(db: Session, **fields) -> ContractSeason:
    """Insert a new contract season row (must include contract_id, season_name, start_date, end_date) and return it with its generated id."""
    season = ContractSeason(**fields)
    db.add(season)
    db.commit()
    db.refresh(season)
    return season


def get_contract_season(db: Session, season_id: int) -> Optional[ContractSeason]:
    """Fetch a single contract season by its primary key, or None if it doesn't exist."""
    return db.query(ContractSeason).filter(ContractSeason.id == season_id).first()


def list_contract_seasons(db: Session, contract_id: int) -> list[ContractSeason]:
    """Return every season defined for one contract, ordered by priority (highest first) then start_date."""
    return (
        db.query(ContractSeason)
        .filter(ContractSeason.contract_id == contract_id)
        .order_by(ContractSeason.priority.desc(), ContractSeason.start_date)
        .all()
    )


def get_contract_seasons_for_date(
    db: Session, contract_id: int, target_date: date
) -> list[ContractSeason]:
    """Return the season(s) whose start_date/end_date span target_date, ordered by priority (highest first) so the caller can pick the top match if more than one overlaps."""
    return (
        db.query(ContractSeason)
        .filter(
            ContractSeason.contract_id == contract_id,
            ContractSeason.start_date <= target_date,
            ContractSeason.end_date >= target_date,
        )
        .order_by(ContractSeason.priority.desc())
        .all()
    )


def update_contract_season(db: Session, season: ContractSeason, **fields) -> ContractSeason:
    """Apply the given field values (e.g. season_name, start_date, end_date, priority) to an existing season row and persist them. Does not touch status — use update_contract_season_status for that."""
    for key, value in fields.items():
        setattr(season, key, value)
    db.commit()
    db.refresh(season)
    return season


def update_contract_season_status(db: Session, season: ContractSeason, status: str) -> ContractSeason:
    """Change only the season's Active/Inactive status without touching any other field."""
    season.status = status
    db.commit()
    db.refresh(season)
    return season


# ---------------------------------------------------------------------------
# Contract Age Category
# ---------------------------------------------------------------------------


def create_contract_age_category(db: Session, **fields) -> ContractAgeCategory:
    """Insert a new age category row for a contract (e.g. Child, 2-11 years) and return it with its generated id."""
    category = ContractAgeCategory(**fields)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_contract_age_category(db: Session, category_id: int) -> Optional[ContractAgeCategory]:
    """Fetch a single age category by its primary key, or None if it doesn't exist."""
    return db.query(ContractAgeCategory).filter(ContractAgeCategory.id == category_id).first()


def list_contract_age_categories(db: Session, contract_id: int) -> list[ContractAgeCategory]:
    """Return every age category defined for one contract, in display order."""
    return (
        db.query(ContractAgeCategory)
        .filter(ContractAgeCategory.contract_id == contract_id)
        .order_by(ContractAgeCategory.sort_order)
        .all()
    )


def update_contract_age_category(
    db: Session, category: ContractAgeCategory, **fields
) -> ContractAgeCategory:
    """Apply the given field values to an existing age category row and persist them."""
    for key, value in fields.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


# ---------------------------------------------------------------------------
# Contract Meal Plan
# ---------------------------------------------------------------------------


def create_contract_meal_plan(db: Session, **fields) -> ContractMealPlan:
    """Insert a new meal plan row for a contract (must include contract_id and meal_code) and return it with its generated id."""
    meal_plan = ContractMealPlan(**fields)
    db.add(meal_plan)
    db.commit()
    db.refresh(meal_plan)
    return meal_plan


def get_contract_meal_plan(db: Session, meal_plan_id: int) -> Optional[ContractMealPlan]:
    """Fetch a single contract meal plan by its primary key, or None if it doesn't exist."""
    return db.query(ContractMealPlan).filter(ContractMealPlan.id == meal_plan_id).first()


def list_contract_meal_plans(db: Session, contract_id: int) -> list[ContractMealPlan]:
    """Return every meal plan defined for one contract."""
    return db.query(ContractMealPlan).filter(ContractMealPlan.contract_id == contract_id).all()


def update_contract_meal_plan(
    db: Session, meal_plan: ContractMealPlan, **fields
) -> ContractMealPlan:
    """Apply the given field values to an existing contract meal plan row and persist them."""
    for key, value in fields.items():
        setattr(meal_plan, key, value)
    db.commit()
    db.refresh(meal_plan)
    return meal_plan


# ---------------------------------------------------------------------------
# Contract Transfer Option
# ---------------------------------------------------------------------------


def create_contract_transfer_option(db: Session, **fields) -> ContractTransferOption:
    """Insert a new transfer option row for a contract (must include contract_id, transfer_type, price_adult, price_child) and return it with its generated id."""
    option = ContractTransferOption(**fields)
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


def list_contract_transfer_options(db: Session, contract_id: int) -> list[ContractTransferOption]:
    """Return every transfer option defined for one contract."""
    return (
        db.query(ContractTransferOption)
        .filter(ContractTransferOption.contract_id == contract_id)
        .all()
    )


# ---------------------------------------------------------------------------
# Rate
# ---------------------------------------------------------------------------


def create_rate(db: Session, **fields) -> Rate:
    """Insert a new rate row from already-validated fields. New rates start with the model's default status ("Active") unless status is explicitly passed."""
    rate = Rate(**fields)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


def get_rate(db: Session, rate_id: int) -> Optional[Rate]:
    """Fetch a single rate by its primary key, or None if it doesn't exist."""
    return db.query(Rate).filter(Rate.id == rate_id).first()


def list_rates(
    db: Session,
    contract_id: int,
    room_type_id: Optional[int] = None,
    season_id: Optional[int] = None,
    meal_plan_id: Optional[int] = None,
) -> list[Rate]:
    """Return rates for one contract, optionally narrowed by room_type_id/season_id/meal_plan_id. Used by pricing lookups to find candidate rates before applying priority/market rules in service.py."""
    query = db.query(Rate).filter(Rate.contract_id == contract_id)
    if room_type_id is not None:
        query = query.filter(Rate.room_type_id == room_type_id)
    if season_id is not None:
        query = query.filter(Rate.season_id == season_id)
    if meal_plan_id is not None:
        query = query.filter(Rate.meal_plan_id == meal_plan_id)
    return query.order_by(Rate.priority.desc()).all()


def update_rate(db: Session, rate: Rate, **fields) -> Rate:
    """Apply the given field values (e.g. base_price, minimum_stay, booking window) to an existing rate row and persist them. Does not touch status — use update_rate_status for that."""
    for key, value in fields.items():
        setattr(rate, key, value)
    db.commit()
    db.refresh(rate)
    return rate


def update_rate_status(db: Session, rate: Rate, status: str) -> Rate:
    """Change only the rate's Active/Inactive status without touching any other field."""
    rate.status = status
    db.commit()
    db.refresh(rate)
    return rate


# ---------------------------------------------------------------------------
# Rate Supplement
# ---------------------------------------------------------------------------


def create_rate_supplement(db: Session, **fields) -> RateSupplement:
    """Insert a new rate supplement row (age-category price, meal-plan supplement, extra bed, etc.) and return it with its generated id."""
    supplement = RateSupplement(**fields)
    db.add(supplement)
    db.commit()
    db.refresh(supplement)
    return supplement


def get_rate_supplement(db: Session, supplement_id: int) -> Optional[RateSupplement]:
    """Fetch a single rate supplement by its primary key, or None if it doesn't exist."""
    return db.query(RateSupplement).filter(RateSupplement.id == supplement_id).first()


def list_rate_supplements(
    db: Session, rate_id: int, adjustment_type: Optional[str] = None
) -> list[RateSupplement]:
    """Return every supplement/adjustment attached to one rate, optionally narrowed to a single adjustment_type (e.g. only "age_category_price" rows)."""
    query = db.query(RateSupplement).filter(RateSupplement.rate_id == rate_id)
    if adjustment_type is not None:
        query = query.filter(RateSupplement.adjustment_type == adjustment_type)
    return query.all()


def update_rate_supplement(db: Session, supplement: RateSupplement, **fields) -> RateSupplement:
    """Apply the given field values (e.g. amount, calculation_basis) to an existing rate supplement row and persist them. Does not touch status — use update_rate_supplement_status for that."""
    for key, value in fields.items():
        setattr(supplement, key, value)
    db.commit()
    db.refresh(supplement)
    return supplement


def update_rate_supplement_status(
    db: Session, supplement: RateSupplement, status: str
) -> RateSupplement:
    """Change only the rate supplement's Active/Inactive status without touching any other field."""
    supplement.status = status
    db.commit()
    db.refresh(supplement)
    return supplement


# ---------------------------------------------------------------------------
# Promotion
# ---------------------------------------------------------------------------


def create_promotion(db: Session, **fields) -> Promotion:
    """Insert a new promotion row from already-validated fields. New promotions start with the model's default status ("Active") unless status is explicitly passed."""
    promotion = Promotion(**fields)
    db.add(promotion)
    db.commit()
    db.refresh(promotion)
    return promotion


def get_promotion(db: Session, promotion_id: int) -> Optional[Promotion]:
    """Fetch a single promotion by its primary key, or None if it doesn't exist."""
    return db.query(Promotion).filter(Promotion.id == promotion_id).first()


def list_promotions(db: Session, contract_id: int) -> list[Promotion]:
    """Return every promotion defined for one contract, ordered by priority (highest first)."""
    return (
        db.query(Promotion)
        .filter(Promotion.contract_id == contract_id)
        .order_by(Promotion.priority.desc())
        .all()
    )


def update_promotion(db: Session, promotion: Promotion, **fields) -> Promotion:
    """Apply the given field values to an existing promotion row and persist them. Does not touch status — use update_promotion_status for that."""
    for key, value in fields.items():
        setattr(promotion, key, value)
    db.commit()
    db.refresh(promotion)
    return promotion


def update_promotion_status(db: Session, promotion: Promotion, status: str) -> Promotion:
    """Change only the promotion's Active/Inactive status without touching any other field."""
    promotion.status = status
    db.commit()
    db.refresh(promotion)
    return promotion


# ---------------------------------------------------------------------------
# Blackout Date
# ---------------------------------------------------------------------------


def create_blackout_date(db: Session, **fields) -> BlackoutDate:
    """Insert a new blackout date row (must include contract_id, promotion_id, start_date, end_date) and return it with its generated id."""
    blackout = BlackoutDate(**fields)
    db.add(blackout)
    db.commit()
    db.refresh(blackout)
    return blackout


def get_blackout_date(db: Session, blackout_id: int) -> Optional[BlackoutDate]:
    """Fetch a single blackout date by its primary key, or None if it doesn't exist."""
    return db.query(BlackoutDate).filter(BlackoutDate.id == blackout_id).first()


def list_blackout_dates(
    db: Session, contract_id: int, promotion_id: Optional[int] = None
) -> list[BlackoutDate]:
    """Return blackout dates for one contract, optionally narrowed to a single promotion."""
    query = db.query(BlackoutDate).filter(BlackoutDate.contract_id == contract_id)
    if promotion_id is not None:
        query = query.filter(BlackoutDate.promotion_id == promotion_id)
    return query.all()


def update_blackout_date(db: Session, blackout: BlackoutDate, **fields) -> BlackoutDate:
    """Apply the given field values to an existing blackout date row and persist them."""
    for key, value in fields.items():
        setattr(blackout, key, value)
    db.commit()
    db.refresh(blackout)
    return blackout


# ---------------------------------------------------------------------------
# Allotment
# ---------------------------------------------------------------------------


def create_allotment(db: Session, **fields) -> Allotment:
    """Insert one day's allotment for a room type (must include contract_id, room_type_id, date, allocated_rooms). Fails at the DB level if a row for that contract_id + room_type_id + date already exists, since the triple is unique."""
    allotment = Allotment(**fields)
    db.add(allotment)
    db.commit()
    db.refresh(allotment)
    return allotment


def get_allotment(db: Session, allotment_id: int) -> Optional[Allotment]:
    """Fetch a single allotment row by its primary key, or None if it doesn't exist."""
    return db.query(Allotment).filter(Allotment.id == allotment_id).first()


def get_allotment_by_date(
    db: Session, contract_id: int, room_type_id: int, target_date: date
) -> Optional[Allotment]:
    """Fetch the allotment row for one contract + room type on one specific calendar date, or None if that day has no row yet."""
    return (
        db.query(Allotment)
        .filter(
            Allotment.contract_id == contract_id,
            Allotment.room_type_id == room_type_id,
            Allotment.date == target_date,
        )
        .first()
    )


def list_allotments(
    db: Session,
    contract_id: int,
    room_type_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[Allotment]:
    """Return the day-by-day allotment calendar for one contract + room type, in chronological order. Pass start_date/end_date to narrow the range; this is what check_allotment (per the Interface Contract) queries against."""
    query = db.query(Allotment).filter(
        Allotment.contract_id == contract_id, Allotment.room_type_id == room_type_id
    )
    if start_date is not None:
        query = query.filter(Allotment.date >= start_date)
    if end_date is not None:
        query = query.filter(Allotment.date <= end_date)
    return query.order_by(Allotment.date).all()


def update_allotment(db: Session, allotment: Allotment, **fields) -> Allotment:
    """Apply the given field values (e.g. allocated_rooms, sold_rooms) to an existing allotment row and persist them. Does not touch status — use update_allotment_status for that. Does not recompute available_rooms — that's service.py's job."""
    for key, value in fields.items():
        setattr(allotment, key, value)
    db.commit()
    db.refresh(allotment)
    return allotment


def update_allotment_status(db: Session, allotment: Allotment, status: str) -> Allotment:
    """Change only the allotment's Active/Inactive status without touching any other field."""
    allotment.status = status
    db.commit()
    db.refresh(allotment)
    return allotment


# ---------------------------------------------------------------------------
# Stop Sale
# ---------------------------------------------------------------------------


def create_stop_sale(db: Session, **fields) -> StopSale:
    """Insert a new stop sale row (must include contract_id, start_date, end_date) and return it with its generated id."""
    stop_sale = StopSale(**fields)
    db.add(stop_sale)
    db.commit()
    db.refresh(stop_sale)
    return stop_sale


def get_stop_sale(db: Session, stop_sale_id: int) -> Optional[StopSale]:
    """Fetch a single stop sale by its primary key, or None if it doesn't exist."""
    return db.query(StopSale).filter(StopSale.id == stop_sale_id).first()


def list_stop_sales(db: Session, contract_id: int, room_type_id: Optional[int] = None) -> list[StopSale]:
    """Return stop sales for one contract, optionally narrowed to a single room type. Rows with room_type_id=None apply to the entire hotel and are always included."""
    query = db.query(StopSale).filter(StopSale.contract_id == contract_id)
    if room_type_id is not None:
        query = query.filter(
            (StopSale.room_type_id == room_type_id) | (StopSale.room_type_id.is_(None))
        )
    return query.all()


def update_stop_sale(db: Session, stop_sale: StopSale, **fields) -> StopSale:
    """Apply the given field values to an existing stop sale row and persist them. Does not touch status — use update_stop_sale_status for that."""
    for key, value in fields.items():
        setattr(stop_sale, key, value)
    db.commit()
    db.refresh(stop_sale)
    return stop_sale


def update_stop_sale_status(db: Session, stop_sale: StopSale, status: str) -> StopSale:
    """Change only the stop sale's Active/Inactive status without touching any other field."""
    stop_sale.status = status
    db.commit()
    db.refresh(stop_sale)
    return stop_sale


# ---------------------------------------------------------------------------
# Cancellation Policy
# ---------------------------------------------------------------------------


def create_cancellation_policy(db: Session, **fields) -> CancellationPolicy:
    """Insert a new cancellation policy tier (must include contract_id, days_before_arrival, penalty_type, penalty_value) and return it with its generated id."""
    policy = CancellationPolicy(**fields)
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def get_cancellation_policy(db: Session, policy_id: int) -> Optional[CancellationPolicy]:
    """Fetch a single cancellation policy by its primary key, or None if it doesn't exist."""
    return db.query(CancellationPolicy).filter(CancellationPolicy.id == policy_id).first()


def list_cancellation_policies(db: Session, contract_id: int) -> list[CancellationPolicy]:
    """Return every cancellation policy tier for one contract, ordered by days_before_arrival descending (the tier that applies furthest from arrival first)."""
    return (
        db.query(CancellationPolicy)
        .filter(CancellationPolicy.contract_id == contract_id)
        .order_by(CancellationPolicy.days_before_arrival.desc())
        .all()
    )


def update_cancellation_policy(
    db: Session, policy: CancellationPolicy, **fields
) -> CancellationPolicy:
    """Apply the given field values to an existing cancellation policy row and persist them."""
    for key, value in fields.items():
        setattr(policy, key, value)
    db.commit()
    db.refresh(policy)
    return policy


# ---------------------------------------------------------------------------
# Release Rule
# ---------------------------------------------------------------------------


def create_release_rule(db: Session, **fields) -> ReleaseRule:
    """Insert a new release rule row (must include contract_id and release_days) and return it with its generated id. Most contracts won't need one at all — Contract.release_days already covers the single-default case."""
    rule = ReleaseRule(**fields)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_release_rule(db: Session, rule_id: int) -> Optional[ReleaseRule]:
    """Fetch a single release rule by its primary key, or None if it doesn't exist."""
    return db.query(ReleaseRule).filter(ReleaseRule.id == rule_id).first()


def list_release_rules(db: Session, contract_id: int) -> list[ReleaseRule]:
    """Return every release rule override defined for one contract."""
    return db.query(ReleaseRule).filter(ReleaseRule.contract_id == contract_id).all()


def update_release_rule(db: Session, rule: ReleaseRule, **fields) -> ReleaseRule:
    """Apply the given field values to an existing release rule row and persist them."""
    for key, value in fields.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


# ---------------------------------------------------------------------------
# Minimum Stay Rule
# ---------------------------------------------------------------------------


def create_minimum_stay_rule(db: Session, **fields) -> MinimumStayRule:
    """Insert a new minimum-stay override row (must include contract_id, start_date, end_date, minimum_nights) and return it with its generated id."""
    rule = MinimumStayRule(**fields)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_minimum_stay_rule(db: Session, rule_id: int) -> Optional[MinimumStayRule]:
    """Fetch a single minimum-stay rule by its primary key, or None if it doesn't exist."""
    return db.query(MinimumStayRule).filter(MinimumStayRule.id == rule_id).first()


def list_minimum_stay_rules(
    db: Session, contract_id: int, room_type_id: Optional[int] = None
) -> list[MinimumStayRule]:
    """Return minimum-stay override rules for one contract, optionally narrowed to a single room type. Rows with room_type_id=None apply to all room types and are always included."""
    query = db.query(MinimumStayRule).filter(MinimumStayRule.contract_id == contract_id)
    if room_type_id is not None:
        query = query.filter(
            (MinimumStayRule.room_type_id == room_type_id)
            | (MinimumStayRule.room_type_id.is_(None))
        )
    return query.all()


def update_minimum_stay_rule(db: Session, rule: MinimumStayRule, **fields) -> MinimumStayRule:
    """Apply the given field values to an existing minimum-stay rule row and persist them."""
    for key, value in fields.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule
