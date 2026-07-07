from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from models.base import Base
from datetime import datetime


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    # Plain Integer, not a real ForeignKey into Hotel Engine's `hotels` table —
    # existence is validated in service.py via Hotel Engine's own service
    # functions (per docs/interface-contracts/contract-hotel-booking.md),
    # keeping the two engines decoupled at the model layer.
    hotel_id = Column(Integer, nullable=False)
    contract_name = Column(String(200), nullable=False)
    contract_code = Column(String(50), unique=True, nullable=True)
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    payment_terms = Column(Text, nullable=True)
    # Single default release period for the whole contract. ReleaseRule rows
    # below are only for sub-period/room-type overrides that differ from this.
    release_days = Column(Integer, nullable=True)
    contract_status = Column(String(20), default="Draft")
    contract_version = Column(Integer, default=1)
    signed_date = Column(Date, nullable=True)
    # Minimum resale markup required when an agent distributes this contract's
    # rates (17-23% observed across real contracts). Not in 03_Domain_Model.md.
    minimum_markup_percent = Column(Float, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContractMarket(Base):
    __tablename__ = "contract_markets"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    market_name = Column(String(50), nullable=False)
    status = Column(String(20), default="Active")


class ContractSeason(Base):
    __tablename__ = "contract_seasons"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    season_name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    priority = Column(Integer, default=0)
    status = Column(String(20), default="Active")


class ContractAgeCategory(Base):
    __tablename__ = "contract_age_categories"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # Per-contract, not a global enum — a hotel inventing "Youth 12-15" is a
    # new row here, never a schema change. Not in 03_Domain_Model.md.
    category_name = Column(String(50), nullable=False)
    min_age = Column(Integer, nullable=True)
    max_age = Column(Integer, nullable=True)
    sort_order = Column(Integer, default=0)


class ContractMealPlan(Base):
    __tablename__ = "contract_meal_plans"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # 03_Domain_Model.md #20 places "Meal Plan" under Hotel's fields
    # (hotel_id-scoped), but Hotel Engine (LOCKED) has no such table, and our
    # own Interface Contract commits get_meal_plans(contract_id, ...) to
    # Contract Engine. Scoped to contract_id here as the up-to-date source.
    meal_code = Column(String(20), nullable=False)
    meal_name = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)


class Rate(Base):
    __tablename__ = "rates"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    season_id = Column(Integer, ForeignKey("contract_seasons.id"), nullable=False)
    # Plain Integer, not a ForeignKey into Hotel Engine's `room_types` table —
    # same cross-engine decoupling rationale as Contract.hotel_id above.
    room_type_id = Column(Integer, nullable=False)
    meal_plan_id = Column(Integer, ForeignKey("contract_meal_plans.id"), nullable=False)
    market_id = Column(Integer, ForeignKey("contract_markets.id"), nullable=True)
    currency = Column(String(3), nullable=False)
    # Reference per-night price only. Age-category prices, meal-plan
    # supplements, extra-bed/single-occupancy adjustments all live in
    # RateSupplement below, not as fixed columns here — see Decision on
    # Contract Engine's flexible-core schema design.
    base_price = Column(Float, nullable=False)
    # How many adults base_price already includes (e.g. "based on 2" in a
    # real hotel contract) — distinct from Hotel Engine's RoomType.max_occupancy,
    # which is a physical capacity ceiling, not a pricing inclusion count.
    # Added per Decision 017 for the "extra_person" RateSupplement adjustment
    # type (Decision 016's gap): adults beyond this count are charged per
    # night via an extra_person RateSupplement, not folded into base_price.
    base_occupancy = Column(Integer, nullable=False, default=2)
    minimum_stay = Column(Integer, nullable=True)
    maximum_stay = Column(Integer, nullable=True)
    booking_start = Column(Date, nullable=True)
    booking_end = Column(Date, nullable=True)
    travel_start = Column(Date, nullable=True)
    travel_end = Column(Date, nullable=True)
    priority = Column(Integer, default=0)
    status = Column(String(20), default="Active")


class RateSupplement(Base):
    __tablename__ = "rate_supplements"

    id = Column(Integer, primary_key=True, index=True)
    rate_id = Column(Integer, ForeignKey("rates.id"), nullable=False)
    # e.g. "age_category_price" / "meal_plan_supplement" / "extra_bed" /
    # "single_occupancy" / "extra_person" — an open string, not a fixed enum
    # column per adjustment kind. This table is the flexible/extensible core:
    # every per-hotel pricing variation is a row here, never a new column.
    adjustment_type = Column(String(50), nullable=False)
    age_category_id = Column(Integer, ForeignKey("contract_age_categories.id"), nullable=True)
    # Only set when adjustment_type == "meal_plan_supplement": the surcharge
    # to upgrade this Rate's meal plan to this target meal plan.
    meal_plan_id = Column(Integer, ForeignKey("contract_meal_plans.id"), nullable=True)
    # "per_person_per_night" / "per_stay" / "percentage_of_rate"
    calculation_basis = Column(String(30), nullable=False)
    # Signed — negative values represent a discount rather than a surcharge.
    amount = Column(Float, nullable=False)
    status = Column(String(20), default="Active")


class Promotion(Base):
    __tablename__ = "promotions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    promotion_name = Column(String(150), nullable=False)
    promotion_type = Column(String(50), nullable=False)
    discount_type = Column(String(20), nullable=False)
    discount_value = Column(Float, nullable=False)
    booking_start = Column(Date, nullable=True)
    booking_end = Column(Date, nullable=True)
    travel_start = Column(Date, nullable=True)
    travel_end = Column(Date, nullable=True)
    priority = Column(Integer, default=0)
    status = Column(String(20), default="Active")
    # Not in 03_Domain_Model.md. Records which promotions are eligible to
    # combine with others; the actual multiplicative-stacking calculation
    # belongs in service.py/validators.py, not here.
    is_stackable = Column(Boolean, default=False)
    stacking_group = Column(String(50), nullable=True)


class BlackoutDate(Base):
    __tablename__ = "blackout_dates"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    promotion_id = Column(Integer, ForeignKey("promotions.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)


class Allotment(Base):
    __tablename__ = "allotments"
    __table_args__ = (
        UniqueConstraint("contract_id", "room_type_id", "date", name="uq_allotment_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    room_type_id = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    allocated_rooms = Column(Integer, nullable=False)
    sold_rooms = Column(Integer, default=0)
    available_rooms = Column(Integer, nullable=True)
    release_days = Column(Integer, nullable=True)
    status = Column(String(20), default="Active")


class StopSale(Base):
    __tablename__ = "stop_sales"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # Nullable room_type_id/meal_plan_id/market_id = applies to the entire
    # hotel/all meal plans/all markets, per 02_Logic_Rules.md #22.
    room_type_id = Column(Integer, nullable=True)
    meal_plan_id = Column(Integer, ForeignKey("contract_meal_plans.id"), nullable=True)
    market_id = Column(Integer, ForeignKey("contract_markets.id"), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(20), default="Active")


class CancellationPolicy(Base):
    __tablename__ = "cancellation_policies"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    days_before_arrival = Column(Integer, nullable=False)
    penalty_type = Column(String(20), nullable=False)
    penalty_value = Column(Float, nullable=False)
    currency = Column(String(3), nullable=True)
    description = Column(Text, nullable=True)
    # Nullable = applies contract-wide. Not always the same as a pricing
    # season, so this is its own independent date range, not an FK to
    # ContractSeason.
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)


class ReleaseRule(Base):
    __tablename__ = "release_rules"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    release_days = Column(Integer, nullable=False)
    auto_confirmation = Column(Boolean, default=False)
    hotel_confirmation_required = Column(Boolean, default=True)
    status = Column(String(20), default="Active")


class MinimumStayRule(Base):
    __tablename__ = "minimum_stay_rules"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # Nullable = applies to all room types.
    room_type_id = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    minimum_nights = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
