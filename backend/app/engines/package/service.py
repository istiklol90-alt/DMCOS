"""Package Engine service (TASK-003).

Formula (docs/plans/package-pricing.md, owner-confirmed 2026-10-17):
  net   = sum of the components' agent net
  gross = net / (1 - k)       k = the agent's package commission rate
  agent commission = gross - net
  our profit = net - cost     (staff only; may be negative)

Hotel prices come from Contract + Pricing Engine exactly as Booking Engine
computes them; transfer and mandatory tax from Contract Engine (sold at
cost, as today); insurance / visa from admin-entered add-ons. Cost never
leaves this engine towards an agent: agent_view() strips it.
"""

from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.contract import service as contract_service
from app.engines.hotel import service as hotel_service
from app.engines.package import repository, validators
from app.engines.pricing import service as pricing_service

QUOTE_TTL_MINUTES = 60


# ---------------------------------------------------------------------------
# Commission
# ---------------------------------------------------------------------------

def agent_commission(db: Session, agent_id: int, channel_id: Optional[int] = None) -> dict:
    """The agent's package commission: their own tier, else the channel's
    default tier, else 0 %."""
    settings = repository.get_agent_settings(db, agent_id)
    tier = None
    if settings and settings.tier_id:
        tier = repository.get_tier(db, settings.tier_id)
        if tier and not tier.active:
            tier = None
    if tier is None:
        tier = repository.get_default_tier(db, channel_id)
    rate = (tier.rate_percent if tier else 0.0) / 100.0
    return {
        "tier_id": tier.id if tier else None,
        "tier_name": tier.name if tier else None,
        "rate_percent": tier.rate_percent if tier else 0.0,
        "rate": rate,
        "one_way_flights_allowed": bool(settings.one_way_flights_allowed) if settings else False,
    }


def gross_from_net(net: float, rate: float) -> float:
    """gross = net / (1 - rate), rounded to a whole unit (a client price with
    cents reads as a calculation). rate 0 -> gross equals net exactly."""
    if rate <= 0:
        return round(net, 2)
    return float(round(net / (1 - rate)))


def create_tier(db: Session, name: str, rate_percent: float, is_default: bool, by: int, channel_id: Optional[int] = None):
    validators.validate_commission_percent(rate_percent)
    if not (name or "").strip():
        raise ValueError("Tier name is required.")
    tier = repository.create_tier(db, name=name.strip(), rate_percent=round(rate_percent, 2), is_default=is_default,
                                  channel_id=channel_id, updated_by=by)
    if is_default:
        repository.clear_default_tier(db, channel_id, tier.id)
    return tier


def update_tier(db: Session, tier_id: int, fields: dict, by: int):
    tier = repository.get_tier(db, tier_id)
    if tier is None:
        raise ValueError(f"Commission tier {tier_id} not found.")
    if "rate_percent" in fields:
        validators.validate_commission_percent(fields["rate_percent"])
        fields["rate_percent"] = round(fields["rate_percent"], 2)
    if "name" in fields and not (fields["name"] or "").strip():
        raise ValueError("Tier name is required.")
    fields["updated_by"] = by
    tier = repository.update_tier(db, tier, fields)
    if fields.get("is_default"):
        repository.clear_default_tier(db, tier.channel_id, tier.id)
    return tier


def set_agent_settings(db: Session, user_id: int, fields: dict, by: int):
    if "tier_id" in fields and fields["tier_id"] is not None and repository.get_tier(db, fields["tier_id"]) is None:
        raise ValueError(f"Commission tier {fields['tier_id']} not found.")
    fields["updated_by"] = by
    return repository.upsert_agent_settings(db, user_id, fields)


# The admin screen speaks in "one % for all agents, a different % for
# selected agents" (owner, 2026-10-17); tiers stay the storage underneath so
# hundreds of agents at 10 % share one row and a future white-label channel
# can have its own set.

DEFAULT_TIER_NAME = "All agents"


def get_default_rate(db: Session, channel_id: Optional[int] = None) -> float:
    tier = repository.get_default_tier(db, channel_id)
    return tier.rate_percent if tier else 0.0


def set_default_rate(db: Session, rate_percent: float, by: int, channel_id: Optional[int] = None):
    validators.validate_commission_percent(rate_percent)
    tier = repository.get_default_tier(db, channel_id)
    if tier is None:
        return create_tier(db, DEFAULT_TIER_NAME, rate_percent, True, by, channel_id)
    return repository.update_tier(db, tier, {"rate_percent": round(rate_percent, 2), "updated_by": by})


def _tier_for_rate(db: Session, rate_percent: float, by: int, channel_id: Optional[int] = None):
    """An active non-default tier with exactly this rate, created if absent."""
    rate = round(rate_percent, 2)
    for t in repository.list_tiers(db, channel_id):
        if t.active and not t.is_default and round(t.rate_percent, 2) == rate:
            return t
    return create_tier(db, f"{rate:g}%", rate, False, by, channel_id)


def set_agent_rate(db: Session, user_id: int, rate_percent: Optional[float], by: int):
    """rate None = back to the rate for all agents."""
    if rate_percent is None:
        return repository.upsert_agent_settings(db, user_id, {"tier_id": None, "updated_by": by})
    validators.validate_commission_percent(rate_percent)
    tier = _tier_for_rate(db, rate_percent, by)
    return repository.upsert_agent_settings(db, user_id, {"tier_id": tier.id, "updated_by": by})


def reset_agent(db: Session, user_id: int) -> None:
    row = repository.get_agent_settings(db, user_id)
    if row is not None:
        db.delete(row)
        db.commit()


# ---------------------------------------------------------------------------
# Add-ons: insurance, visa
# ---------------------------------------------------------------------------

def create_add_on(db: Session, data: dict, by: int):
    validators.validate_add_on(data["kind"], data.get("basis", "per_person"), data["cost"], data["price"], data["currency"])
    validators.validate_price_change_reason(data["cost"], data["price"], data.get("reason"))
    reason = data.pop("reason", None)
    data["currency"] = data["currency"].strip().upper()
    add_on = repository.create_add_on(db, **data, created_by=by, updated_by=by)
    repository.add_price_change(db, add_on_id=add_on.id, old_cost=None, new_cost=add_on.cost, old_price=None,
                                new_price=add_on.price, reason=reason or "created", changed_by=by)
    return add_on


def update_add_on(db: Session, add_on_id: int, fields: dict, by: int):
    """Partial update. A cost or price change is written to the audit trail;
    a new price below cost needs a reason."""
    add_on = repository.get_add_on(db, add_on_id)
    if add_on is None:
        raise ValueError(f"Add-on {add_on_id} not found.")
    reason = fields.pop("reason", None)
    merged = {
        "kind": fields.get("kind", add_on.kind), "basis": fields.get("basis", add_on.basis),
        "cost": fields.get("cost", add_on.cost), "price": fields.get("price", add_on.price),
        "currency": fields.get("currency", add_on.currency),
    }
    validators.validate_add_on(**merged)
    money_changed = merged["cost"] != add_on.cost or merged["price"] != add_on.price
    if money_changed:
        validators.validate_price_change_reason(merged["cost"], merged["price"], reason)
    if "currency" in fields:
        fields["currency"] = fields["currency"].strip().upper()
    old_cost, old_price = add_on.cost, add_on.price
    add_on = repository.update_add_on(db, add_on, {**fields, "updated_by": by})
    if money_changed:
        repository.add_price_change(db, add_on_id=add_on.id, old_cost=old_cost, new_cost=add_on.cost,
                                    old_price=old_price, new_price=add_on.price, reason=reason, changed_by=by)
    return add_on


def price_add_on(add_on, persons: int, nights: int) -> dict:
    if add_on.basis == "per_booking":
        qty = 1
    elif add_on.basis == "per_person_per_day":
        qty = persons * (nights + 1)  # travel days = nights + 1
    else:
        qty = persons
    return {"quantity": qty, "cost_total": round(add_on.cost * qty, 2), "net_total": round(add_on.price * qty, 2)}


# ---------------------------------------------------------------------------
# Cancellation rules
# ---------------------------------------------------------------------------

def create_cancellation_rule(db: Session, data: dict, by: int):
    validators.validate_cancellation_rule(data["component_type"], data["days_before"], data["penalty_percent"])
    return repository.create_cancellation_rule(db, **data, updated_by=by)


def update_cancellation_rule(db: Session, rule_id: int, fields: dict, by: int):
    rule = repository.get_cancellation_rule(db, rule_id)
    if rule is None:
        raise ValueError(f"Cancellation rule {rule_id} not found.")
    merged = {k: fields.get(k, getattr(rule, k)) for k in ("component_type", "days_before", "penalty_percent")}
    validators.validate_cancellation_rule(**merged)
    return repository.update_cancellation_rule(db, rule, {**fields, "updated_by": by})


def delete_cancellation_rule(db: Session, rule_id: int) -> None:
    rule = repository.get_cancellation_rule(db, rule_id)
    if rule is None:
        raise ValueError(f"Cancellation rule {rule_id} not found.")
    repository.delete_cancellation_rule(db, rule)


# ---------------------------------------------------------------------------
# Quote: hotel + transfer + mandatory tax + optional insurance / visa
# ---------------------------------------------------------------------------

def quote_ground_package(
    db: Session,
    agent_id: int,
    hotel_id: int,
    room_type_id: int,
    meal_plan: str,
    check_in: date,
    check_out: date,
    adults: int,
    children: int = 0,
    infants: int = 0,
    transfer_type: Optional[str] = None,
    add_on_ids: Optional[list[int]] = None,
    channel_id: Optional[int] = None,
):
    validators.validate_party(adults, children, infants)
    if check_out <= check_in:
        raise ValueError("Check-out must be after check-in.")
    hotel = hotel_service.get_hotel(db, hotel_id)
    contract = contract_service.get_active_contract(db, hotel_id, check_in)
    if contract is None:
        raise ValueError("This hotel has no active contract for these dates.")

    # Hotel: the same two steps Booking Engine runs (net price, then agent pricing).
    room = contract_service.get_room_price(db, contract.id, room_type_id, check_in, check_out, meal_plan, adults, children, infants)
    agent_room = pricing_service.apply_agent_pricing(
        db, agent_id, contract.id, room["final_total"], room["nights"], room_type_id, room["meal_plan_id"], check_in, check_out,
    )
    currency = room["currency"]
    nights = room["nights"]
    components = [{
        "type": "hotel", "label": f"hotel:{room_type_id}:{meal_plan}", "room_type_id": room_type_id,
        "meal_plan": meal_plan, "meal_plan_id": room["meal_plan_id"], "contract_id": contract.id, "nights": nights,
        "applied_special_offer_ids": room.get("applied_special_offer_ids") or [],
        "cost": round(room["final_total"], 2), "net": round(agent_room["agent_room_total"], 2),
    }]

    if contract.transfer_required and not transfer_type:
        raise ValueError("This hotel's contract requires a transfer.")
    if transfer_type:
        tr = contract_service.get_transfer_price(db, contract.id, transfer_type, check_in, check_out, adults, children, infants)
        if tr.get("currency") and tr["currency"] != currency:
            raise ValueError("Transfer currency differs from the hotel's.")
        components.append({"type": "transfer", "label": transfer_type, "transfer_type": transfer_type,
                           "cost": round(tr["total"], 2), "net": round(tr["total"], 2)})

    tax = contract_service.get_mandatory_tax(db, contract.id, nights, adults, children)
    if tax.get("total"):
        components.append({"type": "tax", "label": tax.get("label") or "Mandatory tax",
                           "cost": round(tax["total"], 2), "net": round(tax["total"], 2)})

    persons = adults + children + infants
    for add_on_id in add_on_ids or []:
        add_on = repository.get_add_on(db, add_on_id)
        if add_on is None or not add_on.active:
            raise ValueError(f"Add-on {add_on_id} is not available.")
        if add_on.destination_country and add_on.destination_country != hotel.country:
            raise ValueError(f"{add_on.name} is not offered for {hotel.country}.")
        if add_on.currency != currency:
            raise ValueError(f"{add_on.name} is priced in {add_on.currency}; this destination sells in {currency}.")
        priced = price_add_on(add_on, persons, nights)
        components.append({"type": add_on.kind, "label": add_on.name, "add_on_id": add_on.id, "basis": add_on.basis,
                           "quantity": priced["quantity"], "cost": priced["cost_total"], "net": priced["net_total"]})

    commission = agent_commission(db, agent_id, channel_id)
    cost_total = round(sum(c["cost"] for c in components), 2)
    net_total = round(sum(c["net"] for c in components), 2)
    gross_total = gross_from_net(net_total, commission["rate"])
    return repository.create_quote(
        db,
        agent_id=agent_id, channel_id=channel_id, hotel_id=hotel_id, destination_country=hotel.country,
        check_in=check_in, check_out=check_out,
        party={"adults": adults, "children": children, "infants": infants},
        components=components, currency=currency, cost_total=cost_total, net_total=net_total,
        gross_total=gross_total, commission=round(gross_total - net_total, 2),
        commission_rate=commission["rate_percent"], status="quoted",
        expires_at=repository.now() + timedelta(minutes=QUOTE_TTL_MINUTES),
    )


def agent_view(quote) -> dict:
    """What an agent may see of a quote: gross first, then net and their
    profit. Each component carries its net and its share of the gross (so the
    client offer adds up); never a cost."""
    net, gross = quote.net_total, quote.gross_total
    shares, running = [], 0.0
    comps = quote.components or []
    for i, c in enumerate(comps):
        if i == len(comps) - 1:
            share = round(gross - running, 2)
        else:
            share = round(c["net"] / net * gross, 2) if net else 0.0
            running += share
        shares.append({k: v for k, v in c.items() if k != "cost"} | {"gross": share})
    return {
        "quote_id": quote.id, "hotel_id": quote.hotel_id, "currency": quote.currency,
        "check_in": quote.check_in, "check_out": quote.check_out, "party": quote.party,
        "gross_total": gross, "net_total": net, "agent_profit": quote.commission,
        "commission_rate": quote.commission_rate, "components": shares,
        "status": quote.status, "expires_at": quote.expires_at,
    }


def staff_view(quote) -> dict:
    view = agent_view(quote)
    view["cost_total"] = quote.cost_total
    view["our_profit"] = round(quote.net_total - quote.cost_total, 2)
    view["components"] = [dict(c, cost=src["cost"]) for c, src in zip(view["components"], quote.components or [])]
    return view


def get_quote_for(db: Session, quote_id: int, agent_id: int, is_admin: bool):
    quote = repository.get_quote(db, quote_id)
    if quote is None or (not is_admin and quote.agent_id != agent_id):
        raise ValueError("Quote not found.")
    return quote


# ---------------------------------------------------------------------------
# Booking a quoted package
# ---------------------------------------------------------------------------

def book_package(db: Session, quote_id: int, agent_id: int, is_admin: bool, application: dict):
    """Books a quote: the hotel application through Booking Engine (its own
    validation, allotment and price), then the frozen package snapshot and
    the add-on lines. If the snapshot cannot be written, the application is
    cancelled again (best effort, same honesty as Decision 012)."""
    from app.engines.booking import schemas as booking_schemas
    from app.engines.booking import service as booking_service

    quote = get_quote_for(db, quote_id, agent_id, is_admin)
    if quote.status != "quoted":
        raise ValueError("This quote has already been booked or has expired.")
    if quote.expires_at.replace(tzinfo=None) < repository.now():
        repository.mark_quote(db, quote, "expired")
        raise ValueError("This quote has expired — please search again.")

    hotel = next(c for c in quote.components if c["type"] == "hotel")
    transfer = next((c for c in quote.components if c["type"] == "transfer"), None)
    guests = application.get("guests") or []
    data = booking_schemas.BookingApplicationCreate(
        agent_id=quote.agent_id,
        rooms=[{
            "hotel_id": quote.hotel_id, "room_type_id": hotel["room_type_id"], "meal_plan": hotel["meal_plan"],
            "arrival_date": quote.check_in, "departure_date": quote.check_out,
            "adults": quote.party["adults"], "children": quote.party["children"], "infants": quote.party["infants"],
            "transfer_type": transfer["transfer_type"] if transfer else None,
            "guest_indices": list(range(len(guests))),
            "special_requests": application.get("special_requests"),
        }],
        guests=guests,
        special_requests=application.get("special_requests"),
        **{k: application.get(k) for k in (
            "arrival_flight_number", "departure_flight_number", "arrival_flight_date",
            "arrival_flight_time", "departure_flight_date", "departure_flight_time") if application.get(k)},
    )
    booking = booking_service.create_booking_application(db, data)

    try:
        lines = [{
            "booking_id": booking.id, "component_type": c["type"], "add_on_id": c.get("add_on_id"),
            "description": c["label"], "quantity": c.get("quantity", 1), "currency": quote.currency,
            "cost_total": c["cost"], "net_total": c["net"], "details": {"basis": c.get("basis")},
        } for c in quote.components if c["type"] in ("insurance", "visa")]
        repository.create_booking_package(db, {
            "booking_id": booking.id, "quote_id": quote.id, "currency": quote.currency,
            "cost_total": quote.cost_total, "net_total": quote.net_total, "gross_total": quote.gross_total,
            "commission": quote.commission, "commission_rate": quote.commission_rate,
        }, lines)
        repository.mark_quote(db, quote, "booked")
    except Exception:
        try:
            booking_service.cancel_booking(
                db, booking.id, booking_schemas.BookingCancelRequest(reason="Package could not be completed"), cancelled_by=agent_id,
            )
        except Exception:
            pass
        raise
    return booking


def get_booking_package(db: Session, booking_id: int) -> Optional[dict]:
    bp = repository.get_booking_package(db, booking_id)
    if bp is None:
        return None
    return {
        "booking_id": booking_id, "currency": bp.currency, "net_total": bp.net_total, "gross_total": bp.gross_total,
        "agent_profit": bp.commission, "commission_rate": bp.commission_rate, "cost_total": bp.cost_total,
        "lines": [{"component_type": l.component_type, "description": l.description, "quantity": l.quantity,
                   "net_total": l.net_total, "cost_total": l.cost_total} for l in repository.list_booking_package_lines(db, booking_id)],
    }
