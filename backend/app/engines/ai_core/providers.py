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
        """Given raw contract text and the entity types to look for, return one ExtractionFieldResult per entity type actually found in the text."""
        ...


# Structured-output schema, as Pydantic models per the SDK's recommended
# client.messages.parse() path (automatic validation, typed access) rather
# than raw output_config.format + manual json.loads. `value` stays a plain
# string (not a nested arbitrary object) so every level satisfies
# structured outputs' additionalProperties:false requirement, while still
# letting field_data hold JSON-as-text for entities that need their own
# internal structure later.
class _ExtractedFieldSchema(BaseModel):
    entity_type: str
    value: str
    confidence_score: float
    original_text: Optional[str] = None
    ai_interpretation: Optional[str] = None
    low_confidence_reason: Optional[str] = None


class _ExtractionResponseSchema(BaseModel):
    fields: list[_ExtractedFieldSchema]


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
    """

    _CANNED_RESPONSES: dict[str, ExtractionFieldResult] = {
        "hotel_name": ExtractionFieldResult(
            entity_type="hotel_name",
            field_data=json.dumps("Kandima Maldives"),
            confidence_score=98,
        ),
    }

    def extract_contract_data(
        self, document_text: str, entity_types: list[str]
    ) -> list[ExtractionFieldResult]:
        return [
            self._CANNED_RESPONSES[entity_type]
            for entity_type in entity_types
            if entity_type in self._CANNED_RESPONSES
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
                field_data=json.dumps(f.value),
                confidence_score=f.confidence_score,
                original_text=f.original_text,
                ai_interpretation=f.ai_interpretation,
                low_confidence_reason=f.low_confidence_reason,
            )
            for f in parsed.fields
        ]
