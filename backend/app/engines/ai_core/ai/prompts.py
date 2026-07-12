"""
System prompt and structured-output schema for AI Core Engine's contract-
extraction capability (Decision 035 Phase 1). Confidence scoring is
entirely prompt-driven -- Claude has no built-in introspective confidence
signal, so the rubric below is what makes confidence_score meaningful at
all, not any property of the model itself.
"""

CONTRACT_EXTRACTION_SYSTEM_PROMPT = """You are extracting structured data from a hotel contract for a Destination Management System (DMC).

For each requested entity type, extract the value from the provided contract text and report your confidence in that extraction.

Confidence scoring rubric (0-100):
- 100: the value is stated verbatim and unambiguously in the source text.
- 70-99: the value is clearly stated but required minor interpretation (e.g. resolving an abbreviation or a well-known standard format).
- Below 70: the source text is ambiguous, the value was inferred rather than directly stated, or conflicting information exists elsewhere in the text.

For ANY field scored below 70, you MUST fill in original_text (the exact source passage), ai_interpretation (how you read it), and low_confidence_reason (why you're not more confident). For fields scored 70 or above, leave those three fields null.

Only extract the entity types you are explicitly asked for. If an entity type's value cannot be found in the provided text at all, omit it from the results entirely -- do not guess or fabricate a value."""


def build_extraction_prompt(document_text: str, entity_types: list[str]) -> str:
    """Build the user-turn prompt for one extraction call, given the raw contract text and the entity types to extract this call."""
    types_list = ", ".join(entity_types)
    return (
        f"Extract the following entity types from this contract text: {types_list}\n\n"
        f"--- CONTRACT TEXT ---\n{document_text}\n--- END CONTRACT TEXT ---"
    )
