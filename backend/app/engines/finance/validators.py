"""
Business-rule checks for the Finance Engine, plain ValueErrors, called
from service.py before any write -- same separation Hotel/Contract/
Booking Engine use (08_Coding_Standards.md). Pricing Engine (the
immediate precedent) kept this file empty and validated inline in
service.py instead, but Finance Engine's validation includes real
cross-entity checks (credit notes vs. an invoice's remaining balance,
overlapping statement periods) that don't fit as simple inline guard
clauses, so it's populated here instead.
"""

from datetime import date


def validate_invoice_issued(invoice) -> None:
    """A credit note can only be raised against an already-Issued
    invoice -- not Draft (nothing issued yet) or Void (already
    nullified)."""
    if invoice.status != "Issued":
        raise ValueError(
            f"Invoice {invoice.id} is not Issued (status={invoice.status}), cannot credit-note it"
        )


def validate_credit_note_amount(invoice, existing_credit_notes: list, amount: float) -> None:
    """
    A real gap found reviewing this Engine's own service.py, not a
    speculative rule: nothing previously stopped issuing credit notes
    that sum to more than the invoice they correct. already_credited
    only counts existing credit notes still in Issued status -- a Void
    credit note (one that was itself nullified/entered in error)
    shouldn't consume any of the invoice's creditable balance.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    already_credited = sum(cn.amount for cn in existing_credit_notes if cn.status == "Issued")
    remaining = invoice.total - already_credited
    if amount > remaining:
        raise ValueError(
            f"Credit note amount {amount} exceeds invoice {invoice.id}'s remaining "
            f"creditable balance {remaining} (total={invoice.total}, already credited={already_credited})"
        )


def validate_reason(reason: str) -> None:
    if not reason or not reason.strip():
        raise ValueError("reason is required")


def validate_invoice_not_void(invoice) -> None:
    if invoice.status == "Void":
        raise ValueError(f"Invoice {invoice.id} is already Void")


def validate_statement_not_finalized(statement) -> None:
    if statement.status == "Finalized":
        raise ValueError(f"Agent statement {statement.id} is already Finalized")


def validate_no_overlapping_statement(
    existing_statements: list, period_start: date, period_end: date
) -> None:
    """
    A real gap found reviewing generate_agent_statement, not a
    speculative rule: nothing previously stopped generating two
    statements for the same agent/currency whose periods overlap,
    which would silently double-count the same bookings across both.
    Caller passes existing_statements already filtered to the same
    agent_id + currency. Deliberately strict: blocks on ANY existing
    statement (Draft or Finalized) with an overlapping period, not
    just Finalized ones -- a Draft still represents a claimed period,
    and this Engine doesn't yet expose a "regenerate" flow to correct
    a wrong Draft (repository.delete_agent_statement exists for that,
    not wired into service.py -- out of scope until a real need shows
    up, same "build only once proven" precedent as everywhere else).
    Standard interval-overlap check: existing.start <= new.end AND
    new.start <= existing.end.
    """
    for stmt in existing_statements:
        if stmt.period_start <= period_end and period_start <= stmt.period_end:
            raise ValueError(
                f"Agent {stmt.agent_id} already has statement {stmt.statement_number} "
                f"({stmt.period_start} to {stmt.period_end}) overlapping the requested period "
                f"({period_start} to {period_end})"
            )


def validate_cashback_arrangement_fields(
    terms: str, rebate_percentage: float | None, start_date: date, end_date: date | None
) -> None:
    if not terms or not terms.strip():
        raise ValueError("terms is required")
    if rebate_percentage is not None and not (0 < rebate_percentage <= 100):
        raise ValueError("rebate_percentage must be between 0 and 100")
    if end_date is not None and start_date > end_date:
        raise ValueError("start_date must not be after end_date")


def validate_cashback_status(status: str) -> None:
    if status not in ("Active", "Fulfilled", "Expired"):
        raise ValueError(f"Invalid status: {status}")


def validate_fulfillment_amount(amount: float) -> None:
    if amount <= 0:
        raise ValueError("amount must be positive")
