"""
Model Router's provider abstraction (Decision 035). Any provider (Claude
now, GPT/Gemini/local later) implements ModelProvider. This is the ONLY
module in this Engine -- or any other Engine -- that may import a
provider's SDK directly, per Decision 035's design requirement that AI
Core Engine is the only component allowed to communicate with LLM
providers. New file, not anticipated by the original empty skeleton.
"""

import json
import os
from dataclasses import dataclass
from typing import Optional, Protocol

from pydantic import BaseModel

from app.engines.ai_core.ai.prompts import (
    CONTRACT_EXTRACTION_SYSTEM_PROMPT,
    build_extraction_prompt,
)


@dataclass
class ExtractionFieldResult:
    """One extracted data point, shaped to match service.record_extracted_field's parameters exactly -- no translation layer needed at the call site."""

    entity_type: str
    field_data: str
    confidence_score: float
    original_text: Optional[str] = None
    ai_interpretation: Optional[str] = None
    low_confidence_reason: Optional[str] = None


class ModelProvider(Protocol):
    def extract_contract_data(
        self, document_text: str, entity_types: list[str]
    ) -> list[ExtractionFieldResult]:
        """Given raw contract text and the entity types to look for, return one ExtractionFieldResult per occurrence actually found in the text -- simple entity types (hotel_name/country/city) yield at most one result each, structured/repeating entity types (room_type/season/rate/...) may yield many."""
        ...


# Structured-output schema, as Pydantic models per the SDK's recommended
# client.messages.parse() path (automatic validation, typed access) rather
# than raw output_config.format + manual json.loads. `value` stays a plain
# string (not a nested arbitrary object) so every level satisfies
# structured outputs' additionalProperties:false requirement. For simple
# entity types `value` is the plain scalar string itself (e.g. "Kandima
# Maldives"); for structured entity types (see ai/prompts.py's shape spec)
# `value` is a string whose *content* is valid JSON text representing that
# occurrence's object -- see _normalize_field_data below for how the two
# cases are told apart when converting to ExtractedField.field_data.
class _ExtractedFieldSchema(BaseModel):
    entity_type: str
    value: str
    confidence_score: float
    original_text: Optional[str] = None
    ai_interpretation: Optional[str] = None
    low_confidence_reason: Optional[str] = None


class _ExtractionResponseSchema(BaseModel):
    fields: list[_ExtractedFieldSchema]


def _normalize_field_data(value: str) -> str:
    """
    Convert Claude's structured-output `value` (always a flat string, per
    _ExtractedFieldSchema's additionalProperties:false constraint above)
    into the JSON text stored in ExtractedField.field_data.

    If `value`'s content already parses as a JSON object or array, it's a
    structured entity (room_type/rate/...) that Claude serialized as
    instructed -- store it as-is, since it's already valid JSON text. Only
    dict/list is treated as "already JSON": a plain scalar string that
    happens to look numeric/boolean/null (e.g. a hotel literally named
    "123") must NOT be mistaken for structured data, or it would silently
    unwrap to the wrong type downstream.

    Otherwise `value` is a plain scalar (e.g. a hotel_name string) and
    gets one level of json.dumps() to become valid JSON text, matching the
    existing scalar convention -- contract_writer._field_value's single
    json.loads() unwraps either case identically, with no caller-side
    branching needed.
    """
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return json.dumps(value)
    if isinstance(parsed, (dict, list)):
        return value
    return json.dumps(value)


class MockClaudeProvider:
    """
    Same ModelProvider contract as ClaudeProvider, zero API calls, zero
    cost -- for developing and verifying the pipeline before the project
    is live and the project owner is ready to pay for real usage.
    Returns a small canned-response table, filtered to whatever
    entity_types are actually requested; document_text is ignored
    entirely (there's nothing to parse -- this is a stand-in, not a
    parser). Output shape is identical to ClaudeProvider's, so nothing
    downstream can tell which provider produced a given result.

    _CANNED_RESPONSES maps entity_type -> a LIST of results (not a single
    result) since structured entity types repeat (multiple room types,
    seasons, rates, ...) -- hotel_name/country/city are simply
    single-item lists, unchanged in effect from before this expansion.

    The structured test data below is not invented: it mirrors Contract
    Engine's real, already-verified Kandima Maldives contract (contract_id
    2 in dmc.db) field-for-field -- 2 of its 11 real room types, 2 of its
    4 real seasons, its real age categories/meal plans, and real
    base_price/rate_supplement amounts -- so this mock exercises the full
    write-through pipeline against known-correct numbers, not arbitrary
    placeholders. One deliberate deviation: the real contract's meal_plan
    rows use "HB+"/"FB+"/"PAI" (created before ContractMealPlanCreate's
    MealCode Literal was locked down); this mock uses "HB", a currently
    schema-valid code, so contract_writer's real create_contract_meal_plan
    call doesn't fail Pydantic validation.
    """

    _CANNED_RESPONSES: dict[str, list[ExtractionFieldResult]] = {
        "hotel_name": [
            ExtractionFieldResult(
                entity_type="hotel_name",
                field_data=json.dumps("Kandima Maldives"),
                confidence_score=98,
            ),
        ],
        # Real facts about Kandima (same hotel already priced in Contract
        # Engine's test data), not invented placeholders -- added so
        # contract_writer's Hotel-creation path (requires hotel_name +
        # country + city) is actually reachable end-to-end via the Mock
        # provider, not just provable on the failure path.
        "country": [
            ExtractionFieldResult(
                entity_type="country",
                field_data=json.dumps("Maldives"),
                confidence_score=95,
            ),
        ],
        "city": [
            ExtractionFieldResult(
                entity_type="city",
                field_data=json.dumps("Dhaalu Atoll"),
                confidence_score=90,
            ),
        ],
        "contract": [
            ExtractionFieldResult(
                entity_type="contract",
                field_data=json.dumps(
                    {
                        "contract_name": "Kandima Maldives Contract 2027",
                        "contract_code": None,
                        "currency": "USD",
                        "start_date": "2027-01-11",
                        "end_date": "2028-01-07",
                        "payment_terms": None,
                        "release_days": None,
                        "transfer_required": True,
                        "mandatory_tax_per_person_per_night": 12.0,
                        "mandatory_tax_label": "Green Tax",
                    }
                ),
                confidence_score=97,
            ),
        ],
        "room_type": [
            ExtractionFieldResult(
                entity_type="room_type",
                field_data=json.dumps(
                    {
                        "ref": "sunrise_villa",
                        "room_name": "Sunrise Beach Pool Villa with Swirlpool",
                        "room_code": None,
                        "description": None,
                        "room_size": None,
                        "bed_type": None,
                        "max_occupancy": 4,
                        "occupancy_options": [
                            {"adults": 2, "children": 2, "infants": 0},
                            {"adults": 3, "children": 0, "infants": 0},
                        ],
                    }
                ),
                confidence_score=96,
            ),
            ExtractionFieldResult(
                entity_type="room_type",
                field_data=json.dumps(
                    {
                        "ref": "sky_studio",
                        "room_name": "Sky Studio",
                        "room_code": None,
                        "description": None,
                        "room_size": None,
                        "bed_type": None,
                        "max_occupancy": 4,
                        "occupancy_options": [
                            {"adults": 2, "children": 2, "infants": 0},
                            {"adults": 3, "children": 0, "infants": 0},
                        ],
                    }
                ),
                confidence_score=96,
            ),
        ],
        "season": [
            ExtractionFieldResult(
                entity_type="season",
                field_data=json.dumps(
                    {
                        "ref": "peak_2027",
                        "season_name": "Peak",
                        "start_date": "2027-01-11",
                        "end_date": "2027-04-04",
                        "priority": 0,
                    }
                ),
                confidence_score=95,
            ),
            ExtractionFieldResult(
                entity_type="season",
                field_data=json.dumps(
                    {
                        "ref": "low_2027",
                        "season_name": "Low",
                        "start_date": "2027-04-05",
                        "end_date": "2027-10-15",
                        "priority": 0,
                    }
                ),
                confidence_score=95,
            ),
        ],
        "age_category": [
            ExtractionFieldResult(
                entity_type="age_category",
                field_data=json.dumps(
                    {"ref": "child", "category_name": "Child", "min_age": 2, "max_age": 11, "sort_order": 0}
                ),
                confidence_score=94,
            ),
            ExtractionFieldResult(
                entity_type="age_category",
                field_data=json.dumps(
                    {"ref": "adult", "category_name": "Adult", "min_age": 12, "max_age": 120, "sort_order": 1}
                ),
                confidence_score=94,
            ),
        ],
        "meal_plan": [
            ExtractionFieldResult(
                entity_type="meal_plan",
                field_data=json.dumps(
                    {"ref": "bb", "meal_code": "BB", "meal_name": "Bed & Breakfast", "description": None}
                ),
                confidence_score=98,
            ),
            ExtractionFieldResult(
                entity_type="meal_plan",
                field_data=json.dumps(
                    {"ref": "hb", "meal_code": "HB", "meal_name": "Half Board", "description": None}
                ),
                confidence_score=98,
            ),
        ],
        "transfer_option": [
            ExtractionFieldResult(
                entity_type="transfer_option",
                field_data=json.dumps(
                    {
                        "transfer_type": "domestic_comfort",
                        "transfer_name": "Domestic Flight Comfort Class",
                        "price_adult": 414.0,
                        "price_child": 300.0,
                        "price_infant": None,
                    }
                ),
                confidence_score=93,
            ),
        ],
        # 2 room types x 2 seasons x the BB base meal plan = 4 rates, real
        # base_price values from Rate rows 2/3/12/15 on the real contract.
        # HB is priced via a meal_plan_supplement rate_supplement below,
        # layered on the BB base rate -- never its own Rate row, matching
        # get_room_price's actual documented pricing model.
        "rate": [
            ExtractionFieldResult(
                entity_type="rate",
                field_data=json.dumps(
                    {
                        "ref": "sunrise_peak",
                        "room_type_ref": "sunrise_villa",
                        "season_ref": "peak_2027",
                        "meal_plan_ref": "bb",
                        "currency": "USD",
                        "base_price": 1002.0,
                        "base_occupancy": 2,
                        "minimum_stay": None,
                        "maximum_stay": None,
                    }
                ),
                confidence_score=97,
            ),
            ExtractionFieldResult(
                entity_type="rate",
                field_data=json.dumps(
                    {
                        "ref": "sunrise_low",
                        "room_type_ref": "sunrise_villa",
                        "season_ref": "low_2027",
                        "meal_plan_ref": "bb",
                        "currency": "USD",
                        "base_price": 649.0,
                        "base_occupancy": 2,
                        "minimum_stay": None,
                        "maximum_stay": None,
                    }
                ),
                confidence_score=97,
            ),
            ExtractionFieldResult(
                entity_type="rate",
                field_data=json.dumps(
                    {
                        "ref": "sky_peak",
                        "room_type_ref": "sky_studio",
                        "season_ref": "peak_2027",
                        "meal_plan_ref": "bb",
                        "currency": "USD",
                        "base_price": 503.0,
                        "base_occupancy": 2,
                        "minimum_stay": None,
                        "maximum_stay": None,
                    }
                ),
                confidence_score=97,
            ),
            ExtractionFieldResult(
                entity_type="rate",
                field_data=json.dumps(
                    {
                        "ref": "sky_low",
                        "room_type_ref": "sky_studio",
                        "season_ref": "low_2027",
                        "meal_plan_ref": "bb",
                        "currency": "USD",
                        "base_price": 399.0,
                        "base_occupancy": 2,
                        "minimum_stay": None,
                        "maximum_stay": None,
                    }
                ),
                confidence_score=97,
            ),
        ],
        # extra_person + child (age_category_price) + HB meal-plan-upgrade
        # supplements on both Peak rates -- real amounts from
        # rate_supplements rows 2/12/22 (sunrise) and 3/13/25 (sky) on the
        # real contract.
        "rate_supplement": [
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sunrise_peak",
                        "adjustment_type": "extra_person",
                        "age_category_ref": None,
                        "meal_plan_ref": None,
                        "calculation_basis": "per_person_per_night",
                        "amount": 190.0,
                    }
                ),
                confidence_score=92,
            ),
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sunrise_peak",
                        "adjustment_type": "age_category_price",
                        "age_category_ref": "child",
                        "meal_plan_ref": None,
                        "calculation_basis": "per_person_per_night",
                        "amount": 60.0,
                    }
                ),
                confidence_score=92,
            ),
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sunrise_peak",
                        "adjustment_type": "meal_plan_supplement",
                        "age_category_ref": "adult",
                        "meal_plan_ref": "hb",
                        "calculation_basis": "per_person_per_night",
                        "amount": 90.0,
                    }
                ),
                confidence_score=90,
            ),
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sky_peak",
                        "adjustment_type": "extra_person",
                        "age_category_ref": None,
                        "meal_plan_ref": None,
                        "calculation_basis": "per_person_per_night",
                        "amount": 190.0,
                    }
                ),
                confidence_score=92,
            ),
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sky_peak",
                        "adjustment_type": "age_category_price",
                        "age_category_ref": "child",
                        "meal_plan_ref": None,
                        "calculation_basis": "per_person_per_night",
                        "amount": 60.0,
                    }
                ),
                confidence_score=92,
            ),
            ExtractionFieldResult(
                entity_type="rate_supplement",
                field_data=json.dumps(
                    {
                        "rate_ref": "sky_peak",
                        "adjustment_type": "meal_plan_supplement",
                        "age_category_ref": "adult",
                        "meal_plan_ref": "hb",
                        "calculation_basis": "per_person_per_night",
                        "amount": 90.0,
                    }
                ),
                confidence_score=90,
            ),
        ],
    }

    def extract_contract_data(
        self, document_text: str, entity_types: list[str]
    ) -> list[ExtractionFieldResult]:
        return [
            result
            for entity_type in entity_types
            for result in self._CANNED_RESPONSES.get(entity_type, [])
        ]


def get_provider(provider_name: str) -> ModelProvider:
    """
    The Model Router: resolves a provider_name (from the active
    ModelProviderConfig) to a concrete ModelProvider instance. This
    function is the single place provider selection happens -- switching
    from "mock" to "claude" is a set_active_provider data change
    (Decision 039), never a code change, per Decision 035's provider-
    abstraction principle.
    """
    if provider_name == "mock":
        return MockClaudeProvider()
    if provider_name == "claude":
        return ClaudeProvider()
    raise ValueError(f"Unknown provider '{provider_name}'")


class ClaudeProvider:
    """The only class in this project that imports the anthropic SDK."""

    def __init__(self, api_key_env_var: str = "ANTHROPIC_API_KEY"):
        import anthropic

        api_key = os.environ.get(api_key_env_var)
        if not api_key:
            raise ValueError(
                f"No API key found in environment variable '{api_key_env_var}' -- "
                f"set it in backend/.env before using ClaudeProvider"
            )
        self._client = anthropic.Anthropic(api_key=api_key)

    def extract_contract_data(
        self, document_text: str, entity_types: list[str]
    ) -> list[ExtractionFieldResult]:
        response = self._client.messages.parse(
            model="claude-opus-4-8",
            max_tokens=4096,
            system=CONTRACT_EXTRACTION_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": build_extraction_prompt(document_text, entity_types)}
            ],
            output_format=_ExtractionResponseSchema,
        )
        if response.stop_reason == "refusal":
            raise ValueError("Claude refused the extraction request")
        parsed = response.parsed_output
        return [
            ExtractionFieldResult(
                entity_type=f.entity_type,
                field_data=_normalize_field_data(f.value),
                confidence_score=f.confidence_score,
                original_text=f.original_text,
                ai_interpretation=f.ai_interpretation,
                low_confidence_reason=f.low_confidence_reason,
            )
            for f in parsed.fields
        ]
