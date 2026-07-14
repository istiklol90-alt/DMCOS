from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM
from app.engines.authentication.repository import get_user_by_email

from app.engines.contract import service
from app.engines.contract.repository import get_db
from app.engines.contract.schemas import (
    ContractCreate,
    ContractUpdate,
    ContractResponse,
    ContractMarketCreate,
    ContractMarketResponse,
    ContractSeasonCreate,
    ContractSeasonUpdate,
    ContractSeasonResponse,
    ContractAgeCategoryCreate,
    ContractAgeCategoryResponse,
    ContractMealPlanCreate,
    ContractMealPlanResponse,
    ContractTransferOptionCreate,
    ContractTransferOptionResponse,
    RateCreate,
    RateUpdate,
    RateResponse,
    RateSupplementCreate,
    RateSupplementResponse,
    PromotionCreate,
    PromotionUpdate,
    PromotionResponse,
    SpecialOfferCreate,
    SpecialOfferUpdate,
    SpecialOfferResponse,
    SpecialOfferRoomDiscountCreate,
    SpecialOfferRoomDiscountResponse,
    SpecialOfferMealPlanDiscountCreate,
    SpecialOfferMealPlanDiscountResponse,
    SpecialOfferFamilyRuleCreate,
    SpecialOfferFamilyRuleResponse,
    ContractFamilyRuleCreate,
    ContractFamilyRuleResponse,
    SpecialOfferTransferDiscountCreate,
    SpecialOfferTransferDiscountResponse,
    BlackoutDateCreate,
    BlackoutDateResponse,
    AllotmentCreate,
    AllotmentUpdate,
    AllotmentResponse,
    StopSaleCreate,
    StopSaleUpdate,
    StopSaleResponse,
    CancellationPolicyCreate,
    CancellationPolicyResponse,
    ReleaseRuleCreate,
    ReleaseRuleResponse,
    MinimumStayRuleCreate,
    MinimumStayRuleResponse,
)

router = APIRouter(prefix="/contract-engine", tags=["Contract Engine"])

# See Decision 006 (11_Decisions.md): this duplicates the JWT-decode logic
# from authentication/api.py's change_password endpoint (and from Hotel
# Engine's api.py) rather than importing a shared dependency, because
# Authentication Engine never exposed one and is LOCKED. Accepted as known
# technical debt until a dedicated task extracts a shared, importable auth
# dependency — this is now the second Engine repeating the duplication
# Decision 006 predicted.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def _run(operation):
    """
    Call a service.py function and translate its ValueError into an
    HTTP 400. Same known simplification as Hotel Engine's api.py: all
    service.py/validators.py failures raise plain ValueError (not-found
    and invalid-input alike), so everything maps to 400 here rather than
    a 400/404 split.
    """
    try:
        return operation()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


@router.post("/contracts", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
def create_contract(
    data: ContractCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_contract(db, data))


@router.get("/contracts", response_model=list[ContractResponse])
def list_contracts(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_contracts(db, skip=skip, limit=limit))


@router.get("/contracts/{contract_id}", response_model=ContractResponse)
def get_contract(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_contract(db, contract_id))


@router.put("/contracts/{contract_id}", response_model=ContractResponse)
def update_contract(
    contract_id: int,
    data: ContractUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_contract(db, contract_id, data))


@router.get("/hotels/{hotel_id}/contracts", response_model=list[ContractResponse])
def list_contracts_by_hotel(
    hotel_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contracts_by_hotel(db, hotel_id))


@router.get("/hotels/{hotel_id}/active-contract", response_model=ContractResponse | None)
def get_active_contract(
    hotel_id: int,
    check_in: date_type,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function — returns null if no contract covers check_in for this hotel (see service.get_active_contract for the exact status+date-range rule; Decision 018)."""
    return _run(lambda: service.get_active_contract(db, hotel_id, check_in))


# ---------------------------------------------------------------------------
# Contract Market
# ---------------------------------------------------------------------------


@router.post(
    "/contract-markets", response_model=ContractMarketResponse, status_code=status.HTTP_201_CREATED
)
def create_contract_market(
    data: ContractMarketCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_market(db, data))


@router.get("/contracts/{contract_id}/markets", response_model=list[ContractMarketResponse])
def list_contract_markets(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contract_markets(db, contract_id))


# ---------------------------------------------------------------------------
# Contract Season
# ---------------------------------------------------------------------------


@router.post(
    "/contract-seasons", response_model=ContractSeasonResponse, status_code=status.HTTP_201_CREATED
)
def create_contract_season(
    data: ContractSeasonCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_season(db, data))


@router.get("/contracts/{contract_id}/seasons", response_model=list[ContractSeasonResponse])
def list_contract_seasons(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contract_seasons(db, contract_id))


@router.get("/contract-seasons/{season_id}", response_model=ContractSeasonResponse)
def get_contract_season(
    season_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_contract_season(db, season_id))


@router.put("/contract-seasons/{season_id}", response_model=ContractSeasonResponse)
def update_contract_season(
    season_id: int,
    data: ContractSeasonUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_contract_season(db, season_id, data))


# ---------------------------------------------------------------------------
# Contract Age Category
# ---------------------------------------------------------------------------


@router.post(
    "/contract-age-categories",
    response_model=ContractAgeCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_contract_age_category(
    data: ContractAgeCategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_age_category(db, data))


@router.get(
    "/contracts/{contract_id}/age-categories", response_model=list[ContractAgeCategoryResponse]
)
def list_contract_age_categories(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contract_age_categories(db, contract_id))


# ---------------------------------------------------------------------------
# Contract Meal Plan
# ---------------------------------------------------------------------------


@router.post(
    "/contract-meal-plans",
    response_model=ContractMealPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_contract_meal_plan(
    data: ContractMealPlanCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_meal_plan(db, data))


@router.get("/contracts/{contract_id}/meal-plans", response_model=list[ContractMealPlanResponse])
def list_contract_meal_plans(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contract_meal_plans(db, contract_id))


# ---------------------------------------------------------------------------
# Contract Transfer Option
# ---------------------------------------------------------------------------


@router.post(
    "/contract-transfer-options",
    response_model=ContractTransferOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_contract_transfer_option(
    data: ContractTransferOptionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_transfer_option(db, data))


@router.get(
    "/contracts/{contract_id}/transfer-options", response_model=list[ContractTransferOptionResponse]
)
def list_contract_transfer_options(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Every transfer option defined for this contract, any status — CRUD listing, matching list_contract_meal_plans."""
    return _run(lambda: service.list_contract_transfer_options(db, contract_id))


@router.get(
    "/contracts/{contract_id}/transfer-options/available",
    response_model=list[ContractTransferOptionResponse],
)
def get_transfer_options(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    """Interface Contract function — only Active transfer options, the set an agent can actually select for a booking (see /contracts/{contract_id}/transfer-options for the full CRUD list)."""
    return _run(lambda: service.get_transfer_options(db, contract_id))


@router.get("/contracts/{contract_id}/transfer-price")
def get_transfer_price(
    contract_id: int,
    transfer_type: str,
    check_in: date_type,
    check_out: date_type,
    adults: int,
    children: int,
    infants: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function. See service.get_transfer_price's docstring for the pricing formula (one-time round-trip, not per-night) and Decision 026's check_in/check_out addition for transfer-discount matching."""
    return _run(
        lambda: service.get_transfer_price(
            db, contract_id, transfer_type, check_in, check_out, adults, children, infants
        )
    )


@router.get("/contracts/{contract_id}/mandatory-tax")
def get_mandatory_tax(
    contract_id: int,
    nights: int,
    adults: int,
    children: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function. See service.get_mandatory_tax's docstring — a flat per-person-per-night government tax (e.g. Green Tax), added after the room price's discounts/promotions, never itself discountable."""
    return _run(lambda: service.get_mandatory_tax(db, contract_id, nights, adults, children))


# ---------------------------------------------------------------------------
# Rate
# ---------------------------------------------------------------------------


@router.post("/rates", response_model=RateResponse, status_code=status.HTTP_201_CREATED)
def create_rate(
    data: RateCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_rate(db, data))


@router.get("/contracts/{contract_id}/rates", response_model=list[RateResponse])
def list_rates(
    contract_id: int,
    room_type_id: int | None = None,
    season_id: int | None = None,
    meal_plan_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(
        lambda: service.list_rates(db, contract_id, room_type_id, season_id, meal_plan_id)
    )


@router.get("/rates/{rate_id}", response_model=RateResponse)
def get_rate(rate_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _run(lambda: service.get_rate(db, rate_id))


@router.put("/rates/{rate_id}", response_model=RateResponse)
def update_rate(
    rate_id: int,
    data: RateUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_rate(db, rate_id, data))


# ---------------------------------------------------------------------------
# Rate Supplement
# ---------------------------------------------------------------------------


@router.post(
    "/rate-supplements", response_model=RateSupplementResponse, status_code=status.HTTP_201_CREATED
)
def create_rate_supplement(
    data: RateSupplementCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_rate_supplement(db, data))


@router.get("/rates/{rate_id}/supplements", response_model=list[RateSupplementResponse])
def list_rate_supplements(
    rate_id: int,
    adjustment_type: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_rate_supplements(db, rate_id, adjustment_type))


# ---------------------------------------------------------------------------
# Promotion
# ---------------------------------------------------------------------------


@router.post("/promotions", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
def create_promotion(
    data: PromotionCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_promotion(db, data))


@router.get("/contracts/{contract_id}/promotions", response_model=list[PromotionResponse])
def list_promotions(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_promotions(db, contract_id))


@router.get("/promotions/{promotion_id}", response_model=PromotionResponse)
def get_promotion(
    promotion_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_promotion(db, promotion_id))


@router.put("/promotions/{promotion_id}", response_model=PromotionResponse)
def update_promotion(
    promotion_id: int,
    data: PromotionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_promotion(db, promotion_id, data))


# ---------------------------------------------------------------------------
# Special Offer (Decision 026)
# ---------------------------------------------------------------------------


@router.post("/special-offers", response_model=SpecialOfferResponse, status_code=status.HTTP_201_CREATED)
def create_special_offer(
    data: SpecialOfferCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_special_offer(db, data))


@router.get("/contracts/{contract_id}/special-offers", response_model=list[SpecialOfferResponse])
def list_special_offers(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_special_offers(db, contract_id))


@router.get("/special-offers/{offer_id}", response_model=SpecialOfferResponse)
def get_special_offer(
    offer_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.get_special_offer(db, offer_id))


@router.put("/special-offers/{offer_id}", response_model=SpecialOfferResponse)
def update_special_offer(
    offer_id: int,
    data: SpecialOfferUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_special_offer(db, offer_id, data))


@router.post(
    "/special-offer-room-discounts",
    response_model=SpecialOfferRoomDiscountResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_special_offer_room_discount(
    data: SpecialOfferRoomDiscountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_special_offer_room_discount(db, data))


@router.get(
    "/special-offers/{offer_id}/room-discounts",
    response_model=list[SpecialOfferRoomDiscountResponse],
)
def list_special_offer_room_discounts(
    offer_id: int,
    room_type_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_special_offer_room_discounts(db, offer_id, room_type_id))


@router.post(
    "/special-offer-meal-plan-discounts",
    response_model=SpecialOfferMealPlanDiscountResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_special_offer_meal_plan_discount(
    data: SpecialOfferMealPlanDiscountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_special_offer_meal_plan_discount(db, data))


@router.get(
    "/special-offers/{offer_id}/meal-plan-discounts",
    response_model=list[SpecialOfferMealPlanDiscountResponse],
)
def list_special_offer_meal_plan_discounts(
    offer_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_special_offer_meal_plan_discounts(db, offer_id))


@router.post(
    "/special-offer-family-rules",
    response_model=SpecialOfferFamilyRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_special_offer_family_rule(
    data: SpecialOfferFamilyRuleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_special_offer_family_rule(db, data))


@router.get(
    "/special-offers/{offer_id}/family-rules", response_model=list[SpecialOfferFamilyRuleResponse]
)
def list_special_offer_family_rules(
    offer_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_special_offer_family_rules(db, offer_id))


@router.post(
    "/contract-family-rules",
    response_model=ContractFamilyRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_contract_family_rule(
    data: ContractFamilyRuleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_contract_family_rule(db, data))


@router.get(
    "/contracts/{contract_id}/family-rules", response_model=list[ContractFamilyRuleResponse]
)
def list_contract_family_rules(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_contract_family_rules(db, contract_id))


@router.post(
    "/special-offer-transfer-discounts",
    response_model=SpecialOfferTransferDiscountResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_special_offer_transfer_discount(
    data: SpecialOfferTransferDiscountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_special_offer_transfer_discount(db, data))


@router.get(
    "/special-offers/{offer_id}/transfer-discounts",
    response_model=list[SpecialOfferTransferDiscountResponse],
)
def list_special_offer_transfer_discounts(
    offer_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_special_offer_transfer_discounts(db, offer_id))


# ---------------------------------------------------------------------------
# Blackout Date
# ---------------------------------------------------------------------------


@router.post(
    "/blackout-dates", response_model=BlackoutDateResponse, status_code=status.HTTP_201_CREATED
)
def create_blackout_date(
    data: BlackoutDateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_blackout_date(db, data))


@router.get("/contracts/{contract_id}/blackout-dates", response_model=list[BlackoutDateResponse])
def list_blackout_dates(
    contract_id: int,
    promotion_id: int | None = None,
    special_offer_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_blackout_dates(db, contract_id, promotion_id, special_offer_id))


# ---------------------------------------------------------------------------
# Allotment
# ---------------------------------------------------------------------------


@router.post("/allotments", response_model=AllotmentResponse, status_code=status.HTTP_201_CREATED)
def create_allotment(
    data: AllotmentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_allotment(db, data))


@router.put("/allotments/{allotment_id}", response_model=AllotmentResponse)
def update_allotment(
    allotment_id: int,
    data: AllotmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_allotment(db, allotment_id, data))


@router.get(
    "/contracts/{contract_id}/room-types/{room_type_id}/allotments",
    response_model=list[AllotmentResponse],
)
def list_allotments(
    contract_id: int,
    room_type_id: int,
    start_date: date_type | None = None,
    end_date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(
        lambda: service.list_allotments(db, contract_id, room_type_id, start_date, end_date)
    )


@router.get("/contracts/{contract_id}/room-types/{room_type_id}/check-allotment")
def check_allotment(
    contract_id: int,
    room_type_id: int,
    check_in: date_type,
    check_out: date_type,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function. Checks available_rooms > 0 for every night, not a specific requested room quantity — see service.check_allotment's docstring for why (no quantity param in the agreed signature; flagged as a revisit for Booking Engine if it ever needs multi-room checks)."""
    available = _run(
        lambda: service.check_allotment(db, contract_id, room_type_id, check_in, check_out)
    )
    return {"available": available}


@router.post("/contracts/{contract_id}/room-types/{room_type_id}/reserve-allotment")
def reserve_allotment(
    contract_id: int,
    room_type_id: int,
    check_in: date_type,
    check_out: date_type,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Added post-LOCK per Decision 011 — purely additive, no existing endpoint changed. Interface Contract function for Booking Engine: increments sold_rooms for every night in range. Raises 400 if any night lacks capacity or is stop-sold (validated all-or-nothing before any write)."""
    _run(lambda: service.reserve_allotment(db, contract_id, room_type_id, check_in, check_out))
    return {"reserved": True}


@router.post("/contracts/{contract_id}/room-types/{room_type_id}/release-allotment")
def release_allotment(
    contract_id: int,
    room_type_id: int,
    check_in: date_type,
    check_out: date_type,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Added post-LOCK per Decision 011 — purely additive, no existing endpoint changed. Interface Contract function for Booking Engine: decrements sold_rooms for every night in range (cancellation). Never fails on a missing/stop-sold night."""
    _run(lambda: service.release_allotment(db, contract_id, room_type_id, check_in, check_out))
    return {"released": True}


# ---------------------------------------------------------------------------
# Stop Sale
# ---------------------------------------------------------------------------


@router.post("/stop-sales", response_model=StopSaleResponse, status_code=status.HTTP_201_CREATED)
def create_stop_sale(
    data: StopSaleCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_stop_sale(db, data))


@router.get("/contracts/{contract_id}/stop-sales", response_model=list[StopSaleResponse])
def list_stop_sales(
    contract_id: int,
    room_type_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_stop_sales(db, contract_id, room_type_id))


@router.put("/stop-sales/{stop_sale_id}", response_model=StopSaleResponse)
def update_stop_sale(
    stop_sale_id: int,
    data: StopSaleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.update_stop_sale(db, stop_sale_id, data))


# ---------------------------------------------------------------------------
# Cancellation Policy
# ---------------------------------------------------------------------------


@router.post(
    "/cancellation-policies",
    response_model=CancellationPolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_cancellation_policy(
    data: CancellationPolicyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_cancellation_policy(db, data))


@router.get(
    "/contracts/{contract_id}/cancellation-policies",
    response_model=list[CancellationPolicyResponse],
)
def list_cancellation_policies(
    contract_id: int,
    check_in: date_type | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Without check_in: every policy tier on the contract (CRUD listing). With check_in: the Interface Contract's get_cancellation_policy — only the tier(s) applicable to a stay starting on that date."""
    if check_in is not None:
        return _run(lambda: service.get_cancellation_policy(db, contract_id, check_in))
    return _run(lambda: service.list_cancellation_policies(db, contract_id))


# ---------------------------------------------------------------------------
# Release Rule
# ---------------------------------------------------------------------------


@router.post(
    "/release-rules", response_model=ReleaseRuleResponse, status_code=status.HTTP_201_CREATED
)
def create_release_rule(
    data: ReleaseRuleCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.create_release_rule(db, data))


@router.get("/contracts/{contract_id}/release-rules", response_model=list[ReleaseRuleResponse])
def list_release_rules(
    contract_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    return _run(lambda: service.list_release_rules(db, contract_id))


# ---------------------------------------------------------------------------
# Minimum Stay Rule
# ---------------------------------------------------------------------------


@router.post(
    "/minimum-stay-rules",
    response_model=MinimumStayRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_minimum_stay_rule(
    data: MinimumStayRuleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.create_minimum_stay_rule(db, data))


@router.get(
    "/contracts/{contract_id}/minimum-stay-rules", response_model=list[MinimumStayRuleResponse]
)
def list_minimum_stay_rules(
    contract_id: int,
    room_type_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _run(lambda: service.list_minimum_stay_rules(db, contract_id, room_type_id))


# ---------------------------------------------------------------------------
# Interface Contract functions not already covered above
# (get_active_contract is under Contract; check_allotment is under
# Allotment; get_cancellation_policy is folded into the cancellation
# policies GET above)
# ---------------------------------------------------------------------------


@router.get("/contracts/{contract_id}/room-types/{room_type_id}/meal-plans", response_model=list[ContractMealPlanResponse])
def get_meal_plans(
    contract_id: int,
    room_type_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function — only meal plans with an actual priced Rate for this room type, not every meal plan defined on the contract (see /contracts/{contract_id}/meal-plans for the full CRUD list)."""
    return _run(lambda: service.get_meal_plans(db, contract_id, room_type_id))


@router.get("/contracts/{contract_id}/room-types/{room_type_id}/child-policy")
def get_child_policy(
    contract_id: int,
    room_type_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function. Returns a computed view (not a stored entity) — see service.get_child_policy's docstring."""
    return _run(lambda: service.get_child_policy(db, contract_id, room_type_id))


@router.get("/contracts/{contract_id}/room-types/{room_type_id}/price")
def get_room_price(
    contract_id: int,
    room_type_id: int,
    check_in: date_type,
    check_out: date_type,
    meal_plan: str,
    adults: int,
    children: int,
    infants: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Interface Contract function. See service.get_room_price's docstring for the full pricing logic and its documented simplifications (single-season assumption, 3-bucket age category matching)."""
    return _run(
        lambda: service.get_room_price(
            db, contract_id, room_type_id, check_in, check_out, meal_plan, adults, children, infants
        )
    )
