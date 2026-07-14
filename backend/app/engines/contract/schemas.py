from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date


# 02_Logic_Rules.md #18 "Currency Rules" — the only documented supported set.
Currency = Literal["USD", "EUR", "GBP", "AED", "RUB", "KZT", "UZS", "TJS"]

# 03_Domain_Model.md #26 "Contract Status" (Draft/Waiting Approval/Active/
# Expired/Cancelled/Archived — a superset of 02_Logic_Rules.md #15, which
# omits Archived).
ContractStatus = Literal["Draft", "Waiting Approval", "Active", "Expired", "Cancelled", "Archived"]

# Simple Active/Inactive toggle used by the child entities below (seasons,
# rates, promotions, etc.) — none of these have a documented richer lifecycle
# the way Contract itself does.
ChildStatus = Literal["Active", "Inactive"]

# 02_Logic_Rules.md #20 "Meal Plans" — the only documented supported set.
MealCode = Literal["RO", "BB", "HB", "FB", "AI", "Premium AI", "Ultra AI"]

# Fixed 3-value set we defined for RateSupplement — not documented anywhere,
# this is our own schema design, so it's safe to enforce strictly.
CalculationBasis = Literal["per_person_per_night", "per_stay", "percentage_of_rate"]


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


class ContractCreate(BaseModel):
    hotel_id: int
    contract_name: str = Field(..., min_length=2, max_length=200)
    contract_code: Optional[str] = None
    currency: Currency
    start_date: date
    end_date: date
    payment_terms: Optional[str] = None
    release_days: Optional[int] = Field(None, ge=0)
    signed_date: Optional[date] = None
    minimum_markup_percent: Optional[float] = Field(None, ge=0, le=100)
    created_by: Optional[int] = None
    transfer_required: bool = False
    mandatory_tax_per_person_per_night: Optional[float] = Field(None, ge=0)
    mandatory_tax_label: Optional[str] = Field(None, max_length=50)


class ContractUpdate(BaseModel):
    contract_name: Optional[str] = Field(None, min_length=2, max_length=200)
    contract_code: Optional[str] = None
    currency: Optional[Currency] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_terms: Optional[str] = None
    release_days: Optional[int] = Field(None, ge=0)
    signed_date: Optional[date] = None
    minimum_markup_percent: Optional[float] = Field(None, ge=0, le=100)
    contract_status: Optional[ContractStatus] = None
    transfer_required: Optional[bool] = None
    mandatory_tax_per_person_per_night: Optional[float] = Field(None, ge=0)
    mandatory_tax_label: Optional[str] = Field(None, max_length=50)


class ContractResponse(BaseModel):
    id: int
    hotel_id: int
    contract_name: str
    contract_code: Optional[str] = None
    currency: str
    start_date: date
    end_date: date
    payment_terms: Optional[str] = None
    release_days: Optional[int] = None
    contract_status: str
    contract_version: int
    signed_date: Optional[date] = None
    minimum_markup_percent: Optional[float] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    transfer_required: bool
    mandatory_tax_per_person_per_night: Optional[float] = None
    mandatory_tax_label: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Contract Market
# ---------------------------------------------------------------------------


class ContractMarketCreate(BaseModel):
    contract_id: int
    market_name: str = Field(..., min_length=2, max_length=50)
    status: ChildStatus = "Active"


class ContractMarketResponse(BaseModel):
    id: int
    contract_id: int
    market_name: str
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Contract Season
# ---------------------------------------------------------------------------


class ContractSeasonCreate(BaseModel):
    contract_id: int
    season_name: str = Field(..., min_length=2, max_length=100)
    start_date: date
    end_date: date
    priority: int = 0


class ContractSeasonUpdate(BaseModel):
    season_name: Optional[str] = Field(None, min_length=2, max_length=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    priority: Optional[int] = None
    status: Optional[ChildStatus] = None


class ContractSeasonResponse(BaseModel):
    id: int
    contract_id: int
    season_name: str
    start_date: date
    end_date: date
    priority: int
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Contract Age Category
# ---------------------------------------------------------------------------


class ContractAgeCategoryCreate(BaseModel):
    contract_id: int
    category_name: str = Field(..., min_length=2, max_length=50)
    min_age: Optional[int] = Field(None, ge=0)
    max_age: Optional[int] = Field(None, ge=0)
    sort_order: int = 0


class ContractAgeCategoryResponse(BaseModel):
    id: int
    contract_id: int
    category_name: str
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    sort_order: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Contract Meal Plan
# ---------------------------------------------------------------------------


class ContractMealPlanCreate(BaseModel):
    contract_id: int
    meal_code: MealCode
    meal_name: Optional[str] = None
    description: Optional[str] = None


class ContractMealPlanResponse(BaseModel):
    id: int
    contract_id: int
    meal_code: str
    meal_name: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Contract Transfer Option
# ---------------------------------------------------------------------------


class ContractTransferOptionCreate(BaseModel):
    contract_id: int
    # Deliberately a plain str, not a Literal/enum — see models.py's
    # ContractTransferOption.transfer_type comment. A hotel-specific transfer
    # kind is new data, never a schema change.
    transfer_type: str = Field(..., min_length=1, max_length=50)
    transfer_name: Optional[str] = None
    price_adult: float = Field(..., ge=0)
    price_child: float = Field(..., ge=0)
    price_infant: Optional[float] = Field(None, ge=0)


class ContractTransferOptionResponse(BaseModel):
    id: int
    contract_id: int
    transfer_type: str
    transfer_name: Optional[str] = None
    price_adult: float
    price_child: float
    price_infant: Optional[float] = None
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Rate
# ---------------------------------------------------------------------------


class RateCreate(BaseModel):
    contract_id: int
    season_id: int
    room_type_id: int
    meal_plan_id: int
    market_id: Optional[int] = None
    currency: Currency
    base_price: float = Field(..., gt=0)
    base_occupancy: int = Field(2, ge=1)
    minimum_stay: Optional[int] = Field(None, ge=1)
    maximum_stay: Optional[int] = Field(None, ge=1)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: int = 0


class RateUpdate(BaseModel):
    market_id: Optional[int] = None
    currency: Optional[Currency] = None
    base_price: Optional[float] = Field(None, gt=0)
    base_occupancy: Optional[int] = Field(None, ge=1)
    minimum_stay: Optional[int] = Field(None, ge=1)
    maximum_stay: Optional[int] = Field(None, ge=1)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: Optional[int] = None
    status: Optional[ChildStatus] = None


class RateResponse(BaseModel):
    id: int
    contract_id: int
    season_id: int
    room_type_id: int
    meal_plan_id: int
    market_id: Optional[int] = None
    currency: str
    base_price: float
    base_occupancy: int
    minimum_stay: Optional[int] = None
    maximum_stay: Optional[int] = None
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: int
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Rate Supplement
# ---------------------------------------------------------------------------
# Note: cross-field validation (e.g. age_category_id required when
# adjustment_type == "age_category_price", meal_plan_id required when
# adjustment_type == "meal_plan_supplement") happens in validators.py, not
# here — same reasoning as Hotel Engine's RoomOccupancyOption schemas.


class RateSupplementCreate(BaseModel):
    rate_id: int
    adjustment_type: str = Field(..., min_length=2, max_length=50)
    age_category_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    calculation_basis: CalculationBasis
    amount: float


class RateSupplementUpdate(BaseModel):
    adjustment_type: Optional[str] = Field(None, min_length=2, max_length=50)
    age_category_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    calculation_basis: Optional[CalculationBasis] = None
    amount: Optional[float] = None
    status: Optional[ChildStatus] = None


class RateSupplementResponse(BaseModel):
    id: int
    rate_id: int
    adjustment_type: str
    age_category_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    calculation_basis: str
    amount: float
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Promotion
# ---------------------------------------------------------------------------
# discount_type is deliberately a plain string, not a Literal["percentage",
# "fixed"] — that split isn't documented anywhere (03_Domain_Model.md #30
# lists discount_type as a field but never enumerates its values), so we
# don't invent the enum here.


PromotionType = Literal[
    "Early Bird",
    "Last Minute",
    "Flash Sale",
    "Stay Pay",
    "Free Night",
    "Honeymoon",
    "Free Upgrade",
    "Free Transfer",
    "Kids Stay Free",
]


class PromotionCreate(BaseModel):
    contract_id: int
    promotion_name: str = Field(..., min_length=2, max_length=150)
    promotion_type: PromotionType
    discount_type: str = Field(..., min_length=2, max_length=20)
    discount_value: float = Field(..., gt=0)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: int = 0
    is_stackable: bool = False
    stacking_group: Optional[str] = None
    days_before_arrival: Optional[int] = Field(None, ge=0)


class PromotionUpdate(BaseModel):
    promotion_name: Optional[str] = Field(None, min_length=2, max_length=150)
    promotion_type: Optional[PromotionType] = None
    discount_type: Optional[str] = Field(None, min_length=2, max_length=20)
    discount_value: Optional[float] = Field(None, gt=0)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: Optional[int] = None
    is_stackable: Optional[bool] = None
    stacking_group: Optional[str] = None
    status: Optional[ChildStatus] = None
    days_before_arrival: Optional[int] = Field(None, ge=0)


class PromotionResponse(BaseModel):
    id: int
    contract_id: int
    promotion_name: str
    promotion_type: str
    discount_type: str
    discount_value: float
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    travel_start: Optional[date] = None
    travel_end: Optional[date] = None
    priority: int
    status: str
    is_stackable: bool
    stacking_group: Optional[str] = None
    days_before_arrival: Optional[int] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Special Offer (Decision 026)
# ---------------------------------------------------------------------------


class SpecialOfferCreate(BaseModel):
    contract_id: int
    offer_name: str = Field(..., min_length=2, max_length=100)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    market_id: Optional[int] = None
    combinable_with_other_offers: bool = False
    combinable_with_promotions: bool = False


class SpecialOfferUpdate(BaseModel):
    offer_name: Optional[str] = Field(None, min_length=2, max_length=100)
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    market_id: Optional[int] = None
    combinable_with_other_offers: Optional[bool] = None
    combinable_with_promotions: Optional[bool] = None
    status: Optional[ChildStatus] = None


class SpecialOfferResponse(BaseModel):
    id: int
    contract_id: int
    offer_name: str
    booking_start: Optional[date] = None
    booking_end: Optional[date] = None
    market_id: Optional[int] = None
    combinable_with_other_offers: bool
    combinable_with_promotions: bool
    status: str

    class Config:
        from_attributes = True


class SpecialOfferRoomDiscountCreate(BaseModel):
    offer_id: int
    # Decision 053: None = applies to every room type on this offer's
    # contract (a flat, non-room-type-varying discount).
    room_type_id: Optional[int] = None
    start_date: date
    end_date: date
    discount_percent: float = Field(..., gt=0, le=100)
    applies_to_extra_person: bool = False
    priority: int = 0


class SpecialOfferRoomDiscountResponse(BaseModel):
    id: int
    offer_id: int
    room_type_id: Optional[int] = None
    start_date: date
    end_date: date
    discount_percent: float
    applies_to_extra_person: bool
    priority: int
    status: str

    class Config:
        from_attributes = True


class SpecialOfferMealPlanDiscountCreate(BaseModel):
    offer_id: int
    meal_plan_id: Optional[int] = None
    start_date: date
    end_date: date
    discount_percent: float = Field(..., gt=0, le=100)


class SpecialOfferMealPlanDiscountResponse(BaseModel):
    id: int
    offer_id: int
    meal_plan_id: Optional[int] = None
    start_date: date
    end_date: date
    discount_percent: float
    status: str

    class Config:
        from_attributes = True


class SpecialOfferFamilyRuleCreate(BaseModel):
    offer_id: int
    start_date: date
    end_date: date
    min_adults: int = Field(..., ge=1)
    max_free_children_accommodation: int = Field(..., ge=0)
    max_free_child_age_accommodation: float = Field(..., ge=0)
    max_free_children_meals: Optional[int] = Field(None, ge=0)
    max_free_child_age_meals: Optional[float] = Field(None, ge=0)


class SpecialOfferFamilyRuleResponse(BaseModel):
    id: int
    offer_id: int
    start_date: date
    end_date: date
    min_adults: int
    max_free_children_accommodation: int
    max_free_child_age_accommodation: float
    max_free_children_meals: Optional[int] = None
    max_free_child_age_meals: Optional[float] = None
    status: str

    class Config:
        from_attributes = True


class SpecialOfferTransferDiscountCreate(BaseModel):
    offer_id: int
    transfer_type: str = Field(..., min_length=1, max_length=50)
    discount_percent: float = Field(..., gt=0, le=100)
    min_nights: int = Field(..., ge=1)
    start_date: date
    end_date: date


class SpecialOfferTransferDiscountResponse(BaseModel):
    id: int
    offer_id: int
    transfer_type: str
    discount_percent: float
    min_nights: int
    start_date: date
    end_date: date
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Blackout Date
# ---------------------------------------------------------------------------


class BlackoutDateCreate(BaseModel):
    contract_id: int
    # Decision 053: exactly one of promotion_id/special_offer_id must be
    # set (validated in service.create_blackout_date) -- whichever
    # mechanism this blackout restricts.
    promotion_id: Optional[int] = None
    special_offer_id: Optional[int] = None
    start_date: date
    end_date: date
    description: Optional[str] = None


class BlackoutDateResponse(BaseModel):
    id: int
    contract_id: int
    promotion_id: Optional[int] = None
    special_offer_id: Optional[int] = None
    start_date: date
    end_date: date
    description: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Allotment
# ---------------------------------------------------------------------------
# available_rooms is deliberately not settable directly on create/update —
# it's derived from allocated_rooms - sold_rooms in service.py, not supplied
# by the caller, to avoid it silently drifting out of sync.


class AllotmentCreate(BaseModel):
    contract_id: int
    room_type_id: int
    date: date
    allocated_rooms: int = Field(..., ge=0)
    sold_rooms: int = Field(0, ge=0)
    release_days: Optional[int] = Field(None, ge=0)


class AllotmentUpdate(BaseModel):
    allocated_rooms: Optional[int] = Field(None, ge=0)
    sold_rooms: Optional[int] = Field(None, ge=0)
    release_days: Optional[int] = Field(None, ge=0)
    status: Optional[ChildStatus] = None


class AllotmentResponse(BaseModel):
    id: int
    contract_id: int
    room_type_id: int
    date: date
    allocated_rooms: int
    sold_rooms: int
    available_rooms: Optional[int] = None
    release_days: Optional[int] = None
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Stop Sale
# ---------------------------------------------------------------------------


class StopSaleCreate(BaseModel):
    contract_id: int
    room_type_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    market_id: Optional[int] = None
    start_date: date
    end_date: date
    reason: Optional[str] = None


class StopSaleUpdate(BaseModel):
    end_date: Optional[date] = None
    reason: Optional[str] = None
    status: Optional[ChildStatus] = None


class StopSaleResponse(BaseModel):
    id: int
    contract_id: int
    room_type_id: Optional[int] = None
    meal_plan_id: Optional[int] = None
    market_id: Optional[int] = None
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Cancellation Policy
# ---------------------------------------------------------------------------
# penalty_type is a plain string for the same reason as Promotion.discount_type
# — 03_Domain_Model.md #34 never enumerates its possible values.


class CancellationPolicyCreate(BaseModel):
    contract_id: int
    days_before_arrival: int = Field(..., ge=0)
    penalty_type: str = Field(..., min_length=2, max_length=20)
    penalty_value: float = Field(..., ge=0)
    currency: Optional[Currency] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class CancellationPolicyResponse(BaseModel):
    id: int
    contract_id: int
    days_before_arrival: int
    penalty_type: str
    penalty_value: float
    currency: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Release Rule
# ---------------------------------------------------------------------------


class ReleaseRuleCreate(BaseModel):
    contract_id: int
    release_days: int = Field(..., ge=0)
    auto_confirmation: bool = False
    hotel_confirmation_required: bool = True


class ReleaseRuleResponse(BaseModel):
    id: int
    contract_id: int
    release_days: int
    auto_confirmation: bool
    hotel_confirmation_required: bool
    status: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Minimum Stay Rule
# ---------------------------------------------------------------------------


class MinimumStayRuleCreate(BaseModel):
    contract_id: int
    room_type_id: Optional[int] = None
    start_date: date
    end_date: date
    minimum_nights: int = Field(..., ge=1)
    description: Optional[str] = None


class MinimumStayRuleResponse(BaseModel):
    id: int
    contract_id: int
    room_type_id: Optional[int] = None
    start_date: date
    end_date: date
    minimum_nights: int
    description: Optional[str] = None

    class Config:
        from_attributes = True
