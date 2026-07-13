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
    # Whether the agent must select one of this contract's
    # ContractTransferOption rows before a booking can be confirmed (true for
    # every Maldives hotel today; a future non-Maldives hotel may have no
    # transfer options at all, or optional ones). Deliberately NOT on
    # ContractTransferOption itself — a single contract-level flag means
    # "pick exactly one of these options," not "every option is
    # individually mandatory," which per-option placement would leave
    # ambiguous.
    transfer_required = Column(Boolean, nullable=False, default=False)
    # General, reusable mandatory-government-tax mechanism (e.g. Maldives
    # Green Tax) -- flat per-person-per-night amount, charged on
    # adults+children (infants exempt, same 3-bucket convention as
    # get_room_price/get_transfer_price), added AFTER final_total's
    # discounts/promotions via the separate get_mandatory_tax function --
    # never itself discountable, since it's a pass-through government
    # charge, not a hotel service. NULL/0 = no mandatory tax (Decision
    # 025's "absent means free" precedent, applied as a zero/null value
    # here since this is one flat rate per contract, not a variable-shaped
    # row like RateSupplement). mandatory_tax_label is purely a display
    # name (e.g. "Green Tax", "City Tax", "VAT") so a future non-Maldives
    # hotel's own government tax can reuse this without any code change.
    mandatory_tax_per_person_per_night = Column(Float, nullable=True)
    mandatory_tax_label = Column(String(50), nullable=True)


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


class ContractTransferOption(Base):
    __tablename__ = "contract_transfer_options"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # Free-form, not an enum — "seaplane", "domestic_comfort",
    # "domestic_sapphire", "speedboat", "yacht", etc. A hotel offering a new
    # transfer kind is a new row here, never a schema change — same
    # open-string precedent as RateSupplement.adjustment_type.
    transfer_type = Column(String(50), nullable=False)
    transfer_name = Column(String(200), nullable=True)
    # Per round-trip, NOT per-night — deliberately not a RateSupplement row:
    # calculation_basis has no "one-time round-trip" option, and forcing a
    # flat one-time charge through the per_person_per_night mechanism would
    # misrepresent it.
    price_adult = Column(Float, nullable=False)
    price_child = Column(Float, nullable=False)
    price_infant = Column(Float, nullable=True)
    status = Column(String(20), default="Active")


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
    # Decision 051 (Fix B): a rolling "book at least N days before
    # arrival" threshold (e.g. Siyam World's real 30-day/10% and
    # 60-day/15% Early Bird tiers) -- distinct from booking_start/
    # booking_end above, which are fixed calendar dates, not a threshold
    # relative to each booking's own check_in. NULL means this promotion
    # uses only the existing fixed-window filtering, unaffected by this
    # field's addition. Multiple tiers are multiple Promotion rows (same
    # "one row per tier" shape CancellationPolicy already uses); see
    # get_room_price's selection logic for which tier wins when more than
    # one is satisfied.
    days_before_arrival = Column(Integer, nullable=True)


class SpecialOffer(Base):
    """
    A named, bounded promotional package (e.g. Kandima's "KM26_03") that
    bundles several distinct discount mechanisms under one booking
    window/market/combinability rule (Decision 026). Deliberately separate
    from Promotion: Promotion is one flat discount applied to a room type's
    whole price_before_promotions total, from a fixed 9-value documented
    type list; a SpecialOffer's mechanisms each target specific price
    components (room rate, meal-plan supplement, per-child charges,
    transfer price) and vary by room type and period in ways Promotion was
    never built to express. combinable_with_other_offers governs only
    other SpecialOffer rows on this contract -- entirely independent of
    Promotion.is_stackable, a structurally separate system.
    """

    __tablename__ = "special_offers"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    offer_name = Column(String(100), nullable=False)
    booking_start = Column(Date, nullable=True)
    booking_end = Column(Date, nullable=True)
    # NULL = all markets, same nullable-means-unrestricted convention as
    # Rate.market_id.
    market_id = Column(Integer, ForeignKey("contract_markets.id"), nullable=True)
    combinable_with_other_offers = Column(Boolean, default=False)
    status = Column(String(20), default="Active")


class SpecialOfferRoomDiscount(Base):
    """
    Mechanism 1: a percentage discount on a specific room type's base room
    rate for a specific period, optionally also applied to that room
    type's extra_person charge (applies_to_extra_person) -- never to
    age_category_price, which is a separate mechanism (SpecialOfferFamilyRule)
    or untouched. One row per (room_type, period); a room type with 7
    differently-priced periods is 7 rows, not one row with a formula.
    """

    __tablename__ = "special_offer_room_discounts"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("special_offers.id"), nullable=False)
    # Plain Integer, not a real ForeignKey into Hotel Engine's `room_types`
    # table -- same cross-engine decoupling as Rate.room_type_id.
    room_type_id = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    discount_percent = Column(Float, nullable=False)
    applies_to_extra_person = Column(Boolean, default=False)
    priority = Column(Integer, default=0)
    status = Column(String(20), default="Active")


class SpecialOfferMealPlanDiscount(Base):
    """
    Mechanism 2: a percentage discount on the meal_plan_supplement amount
    for a specific period, independent of the room discount percentage.
    meal_plan_id NULL means it applies uniformly to every
    meal_plan_supplement-priced upgrade (HB+/FB+/PAI alike); set it to
    target one meal plan specifically if a future contract varies the
    discount by meal plan. A period with no row for this offer means "No"
    discount that period -- no sentinel value needed.
    """

    __tablename__ = "special_offer_meal_plan_discounts"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("special_offers.id"), nullable=False)
    meal_plan_id = Column(Integer, ForeignKey("contract_meal_plans.id"), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    discount_percent = Column(Float, nullable=False)
    status = Column(String(20), default="Active")


class SpecialOfferFamilyRule(Base):
    """
    Mechanism 3: waives age_category_price for up to
    max_free_children_accommodation children aged
    <= max_free_child_age_accommodation, conditional on min_adults being
    met, for a specific period. min_adults lets a "2+ adults" row and a
    separate "1 adult" row coexist for the same period with different
    terms (per the real KM26_03 offer's own "requires minimum 2 adults or
    a different offer applies for 1 adult" note).

    max_free_children_meals/max_free_child_age_meals capture the real
    contract's "up to 2 children 5.99 and under also get free meals"
    clause for documentation completeness, but are NOT read by
    get_room_price today: there is no existing per-child meal-plan charge
    to waive (Decision 022's meal_plan_supplement only ever targets the
    Adult age category), so this clause is already true by default with
    zero implementation needed. Revisit only if a future per-child
    meal-plan pricing mechanism is built.
    """

    __tablename__ = "special_offer_family_rules"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("special_offers.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    min_adults = Column(Integer, nullable=False)
    max_free_children_accommodation = Column(Integer, nullable=False)
    max_free_child_age_accommodation = Column(Float, nullable=False)
    # Documentation-only today -- see class docstring.
    max_free_children_meals = Column(Integer, nullable=True)
    max_free_child_age_meals = Column(Float, nullable=True)
    status = Column(String(20), default="Active")


class SpecialOfferTransferDiscount(Base):
    """
    Mechanism 4: a percentage discount on a specific transfer_type's
    get_transfer_price total, conditional on the stay being at least
    min_nights long, keyed by ARRIVAL date (not check_in/check_out both --
    per the real offer's own "determined by arrival date when stay spans
    multiple months" note, the same check_in-for-the-whole-stay
    simplification precedent get_room_price already uses for seasons).
    """

    __tablename__ = "special_offer_transfer_discounts"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey("special_offers.id"), nullable=False)
    # Matches ContractTransferOption.transfer_type -- free-form, not an enum.
    transfer_type = Column(String(50), nullable=False)
    discount_percent = Column(Float, nullable=False)
    min_nights = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(20), default="Active")


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
