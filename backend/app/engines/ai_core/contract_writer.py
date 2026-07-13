"""
Writes Human-Gate-approved ExtractedField data into Hotel Engine's and
Contract Engine's real tables -- Decision 035's workflow step 10-11,
expanded from Decision 042's Hotel-only version to the full 8-entity
Phase 1 taxonomy agreed before implementation (see ai/prompts.py for the
entity shape spec, and Decision 043 for what's deliberately NOT extracted
yet -- Promotion/SpecialOffer/BlackoutDate/CancellationPolicy).

The only module in AI Core Engine allowed to call another Engine's
create/write functions directly, same "one seam" precedent providers.py
established for LLM SDK calls. Reuses Hotel/Contract Engine's real
service.py functions unchanged -- no validation/business logic is
duplicated here; this module is purely: read ExtractedField rows -> group
by entity_type -> resolve ref -> real id cross-references -> call the
real create_* function in dependency order.

Atomicity (Decision 042's discipline, now explicitly re-confirmed for the
larger blast radius): there is still no cross-engine DB transaction in
this project. If a call partway through this sequence raises, everything
already created is LEFT IN PLACE, not rolled back -- Contract Engine
(LOCKED) has no delete_* functions for most of these entities, and adding
them would mean reopening a LOCKED engine, which the Engine Development
Rule doesn't permit outside a deliberate new engine task. The raised
ValueError's message lists every entity actually created (with real ids)
before the failure, so a partial write is never a silent mystery --
service.approve_job persists that full message into failure_reason
(Decision 042), visible to whoever reviews the failed job.
"""

import json
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.ai_core import repository
from app.engines.ai_core.models import ContractIngestionJob, ExtractedField
from app.engines.hotel import service as hotel_service
from app.engines.hotel.schemas import HotelCreate, RoomTypeCreate, RoomOccupancyOptionCreate
from app.engines.contract import service as contract_service
from app.engines.contract.schemas import (
    ContractCreate,
    ContractSeasonCreate,
    ContractAgeCategoryCreate,
    ContractMealPlanCreate,
    ContractTransferOptionCreate,
    RateCreate,
    RateSupplementCreate,
)

# entity_type -> HotelCreate field name. Only the fields required to
# satisfy HotelCreate's own validation (hotel_name/country/city) are
# mapped -- expand this table as the Mock/a real provider extracts more of
# HotelCreate's optional fields (star_rating, brand, etc.).
_HOTEL_FIELD_MAP = {
    "hotel_name": "hotel_name",
    "country": "country",
    "city": "city",
}

_REQUIRED_HOTEL_FIELDS = ("hotel_name", "country", "city")


def _field_value(field_data: str):
    """
    ExtractedField.field_data is JSON text (providers.py's
    ExtractionFieldResult/_normalize_field_data convention) -- one
    json.loads() undoes it uniformly whether the underlying value is a
    plain scalar (hotel_name -> str) or a structured entity (room_type ->
    dict), since field_data is always exactly one level of JSON encoding
    either way.
    """
    return json.loads(field_data)


def _group_by_entity_type(fields: list[ExtractedField]) -> dict[str, list]:
    """Group a job's ExtractedField rows by entity_type, parsing field_data eagerly so every downstream helper works with plain dicts/strings, never raw JSON text."""
    grouped: dict[str, list] = {}
    for f in fields:
        grouped.setdefault(f.entity_type, []).append(_field_value(f.field_data))
    return grouped


def _resolve_ref(
    ref_map: dict[str, int], ref: Optional[str], kind: str, *, required: bool
) -> Optional[int]:
    """
    Look up a "*_ref" string against an already-built ref->real-id map
    (built earlier in this same write-through, in dependency order).
    Raises ValueError if a required ref is missing entirely or doesn't
    resolve -- e.g. a "rate" pointing at a room_type_ref no room_type
    entity actually declared. Optional refs (e.g. rate_supplement's
    age_category_ref, which is only meaningful for adjustment_type ==
    "age_category_price") simply return None when absent.
    """
    if ref is None:
        if required:
            raise ValueError(f"Missing required {kind} ref")
        return None
    if ref not in ref_map:
        raise ValueError(f"{kind} ref '{ref}' does not match any created {kind} (known refs: {sorted(ref_map)})")
    return ref_map[ref]


def _strip(d: dict, *keys: str) -> dict:
    """Return a copy of d without the given keys -- used to drop ref-mechanism-only fields (ref, *_ref, occupancy_options) before unpacking the rest straight into a Contract/Hotel Engine *Create schema."""
    return {k: v for k, v in d.items() if k not in keys}


def _describe_created(created: list[tuple[str, Optional[str], int]]) -> str:
    """Render the (entity_type, ref_or_None, real_id) rows created so far into a human-readable list for a failure message -- e.g. 'room_type:sunrise_villa=12, contract=5'."""
    parts = []
    for entity_type, ref, real_id in created:
        label = f"{entity_type}:{ref}" if ref is not None else entity_type
        parts.append(f"{label}={real_id}")
    return ", ".join(parts) if parts else "(none)"


def _write_hotel(db: Session, job: ContractIngestionJob, by_type: dict[str, list]) -> int:
    """
    Decision 042's original hotel-only logic, unchanged in behavior. If
    the job already has a hotel_id (an existing hotel was picked at
    upload time), reuse it -- never create a duplicate Hotel. Otherwise
    requires hotel_name/country/city among the extracted fields.
    """
    if job.hotel_id is not None:
        return job.hotel_id

    values: dict[str, str] = {}
    for entity_type, target in _HOTEL_FIELD_MAP.items():
        occurrences = by_type.get(entity_type)
        if occurrences:
            values[target] = occurrences[0]

    missing = [name for name in _REQUIRED_HOTEL_FIELDS if name not in values]
    if missing:
        raise ValueError(f"Cannot create Hotel from job {job.id}: missing required extracted field(s) {missing}")

    hotel = hotel_service.create_hotel(db, HotelCreate(**values))
    return hotel.id


def write_approved_fields_to_contract_engine(
    db: Session, job: ContractIngestionJob
) -> tuple[Optional[int], Optional[int]]:
    """
    Human Gate approval's write-through. Always resolves/creates the
    Hotel first (Decision 042's logic, reused verbatim). If no "contract"
    entity was extracted for this job, stops there and returns
    (hotel_id, None) -- the exact Decision 042 behavior, preserved for
    jobs that only ever extract hotel_name/country/city.

    If a "contract" entity IS present, proceeds through the full
    dependency chain (see module docstring): room_type -> contract ->
    {age_category, meal_plan, season} -> transfer_option -> rate ->
    rate_supplement. Each step only runs for entity types actually
    present in this job's approved fields -- a contract with room types
    and seasons but no rates yet still writes what it has, rather than
    requiring every one of the 8 entity types to be present.

    Returns (hotel_id, contract_id). Raises ValueError on any failure,
    with a message listing every entity successfully created (real ids
    included) before the failure -- see module docstring on why nothing
    is rolled back.
    """
    hotel_id = _write_hotel(db, job, _group_by_entity_type(repository.list_extracted_fields(db, job.id)))

    by_type = _group_by_entity_type(repository.list_extracted_fields(db, job.id))
    if "contract" not in by_type:
        return hotel_id, None

    created: list[tuple[str, Optional[str], int]] = [("hotel", None, hotel_id)]
    try:
        room_type_refs = _write_room_types(db, hotel_id, by_type.get("room_type", []), created)
        contract_id = _write_contract(db, hotel_id, by_type["contract"][0], created)
        age_category_refs = _write_age_categories(db, contract_id, by_type.get("age_category", []), created)
        meal_plan_refs = _write_meal_plans(db, contract_id, by_type.get("meal_plan", []), created)
        season_refs = _write_seasons(db, contract_id, by_type.get("season", []), created)
        _write_transfer_options(db, contract_id, by_type.get("transfer_option", []), created)
        rate_refs = _write_rates(
            db, contract_id, room_type_refs, season_refs, meal_plan_refs, by_type.get("rate", []), created
        )
        _write_rate_supplements(
            db, rate_refs, age_category_refs, meal_plan_refs, by_type.get("rate_supplement", []), created
        )
    except ValueError as e:
        raise ValueError(
            f"{e} -- entities already created and left in place: {_describe_created(created)}"
        )

    return hotel_id, contract_id


def _write_room_types(
    db: Session, hotel_id: int, occurrences: list[dict], created: list
) -> dict[str, int]:
    refs: dict[str, int] = {}
    for occ in occurrences:
        ref = occ.get("ref")
        if not ref:
            raise ValueError("A room_type entity is missing its required 'ref'")
        data = _strip(occ, "ref", "occupancy_options")
        room_type = hotel_service.create_room_type(db, RoomTypeCreate(hotel_id=hotel_id, **data))
        refs[ref] = room_type.id
        created.append(("room_type", ref, room_type.id))
        for opt in occ.get("occupancy_options", []):
            hotel_service.create_room_occupancy_option(
                db, RoomOccupancyOptionCreate(room_type_id=room_type.id, **opt)
            )
    return refs


def _write_contract(db: Session, hotel_id: int, contract_dict: dict, created: list) -> int:
    contract = contract_service.create_contract(db, ContractCreate(hotel_id=hotel_id, **contract_dict))
    created.append(("contract", None, contract.id))
    return contract.id


def _write_age_categories(db: Session, contract_id: int, occurrences: list[dict], created: list) -> dict[str, int]:
    refs: dict[str, int] = {}
    for occ in occurrences:
        ref = occ.get("ref")
        if not ref:
            raise ValueError("An age_category entity is missing its required 'ref'")
        data = _strip(occ, "ref")
        row = contract_service.create_contract_age_category(
            db, ContractAgeCategoryCreate(contract_id=contract_id, **data)
        )
        refs[ref] = row.id
        created.append(("age_category", ref, row.id))
    return refs


def _write_meal_plans(db: Session, contract_id: int, occurrences: list[dict], created: list) -> dict[str, int]:
    refs: dict[str, int] = {}
    for occ in occurrences:
        ref = occ.get("ref")
        if not ref:
            raise ValueError("A meal_plan entity is missing its required 'ref'")
        data = _strip(occ, "ref")
        row = contract_service.create_contract_meal_plan(db, ContractMealPlanCreate(contract_id=contract_id, **data))
        refs[ref] = row.id
        created.append(("meal_plan", ref, row.id))
    return refs


def _write_seasons(db: Session, contract_id: int, occurrences: list[dict], created: list) -> dict[str, int]:
    refs: dict[str, int] = {}
    for occ in occurrences:
        ref = occ.get("ref")
        if not ref:
            raise ValueError("A season entity is missing its required 'ref'")
        data = _strip(occ, "ref")
        row = contract_service.create_contract_season(db, ContractSeasonCreate(contract_id=contract_id, **data))
        refs[ref] = row.id
        created.append(("season", ref, row.id))
    return refs


def _write_transfer_options(db: Session, contract_id: int, occurrences: list[dict], created: list) -> None:
    for occ in occurrences:
        row = contract_service.create_contract_transfer_option(
            db, ContractTransferOptionCreate(contract_id=contract_id, **occ)
        )
        created.append(("transfer_option", None, row.id))


def _write_rates(
    db: Session,
    contract_id: int,
    room_type_refs: dict[str, int],
    season_refs: dict[str, int],
    meal_plan_refs: dict[str, int],
    occurrences: list[dict],
    created: list,
) -> dict[str, int]:
    refs: dict[str, int] = {}
    for occ in occurrences:
        ref = occ.get("ref")
        if not ref:
            raise ValueError("A rate entity is missing its required 'ref'")
        room_type_id = _resolve_ref(room_type_refs, occ.get("room_type_ref"), "room_type", required=True)
        season_id = _resolve_ref(season_refs, occ.get("season_ref"), "season", required=True)
        meal_plan_id = _resolve_ref(meal_plan_refs, occ.get("meal_plan_ref"), "meal_plan", required=True)
        data = _strip(occ, "ref", "room_type_ref", "season_ref", "meal_plan_ref")
        row = contract_service.create_rate(
            db,
            RateCreate(
                contract_id=contract_id,
                room_type_id=room_type_id,
                season_id=season_id,
                meal_plan_id=meal_plan_id,
                **data,
            ),
        )
        refs[ref] = row.id
        created.append(("rate", ref, row.id))
    return refs


def _write_rate_supplements(
    db: Session,
    rate_refs: dict[str, int],
    age_category_refs: dict[str, int],
    meal_plan_refs: dict[str, int],
    occurrences: list[dict],
    created: list,
) -> None:
    for occ in occurrences:
        rate_id = _resolve_ref(rate_refs, occ.get("rate_ref"), "rate", required=True)
        age_category_id = _resolve_ref(age_category_refs, occ.get("age_category_ref"), "age_category", required=False)
        meal_plan_id = _resolve_ref(meal_plan_refs, occ.get("meal_plan_ref"), "meal_plan", required=False)
        data = _strip(occ, "rate_ref", "age_category_ref", "meal_plan_ref")
        row = contract_service.create_rate_supplement(
            db,
            RateSupplementCreate(
                rate_id=rate_id,
                age_category_id=age_category_id,
                meal_plan_id=meal_plan_id,
                **data,
            ),
        )
        created.append(("rate_supplement", None, row.id))
