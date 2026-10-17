"""Flight Engine service.

Admin side: legs, a schedule generator (period + weekdays -> one departure per
date per cabin), fast price / cost / seat changes per departure or in bulk,
with an append-only history; a price below cost needs a reason.

Search side (used by the agent "With flight" search and Package Engine):
search_flights() returns, per cabin, the outbound departure on the check-in
date and the return departure on the check-out date to / from the hotel's
country, with net per person = outbound price + return price. Empty = "no
flight on this date". Cost never leaves towards an agent.
"""

import re
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.flight import repository

DIRECTIONS = {"outbound", "return"}
CABINS = {"economy", "business"}
MAX_SCHEDULE_DAYS = 400


def _time_ok(v: str) -> bool:
    try:
        h, m = v.split(":")
        return len(h) == 2 and len(m) == 2 and 0 <= int(h) <= 23 and 0 <= int(m) <= 59
    except (ValueError, AttributeError):
        return False


# Airline code (2 letters/digits) + 1-4 digits, optional letter: SZ105, EK652, 6E1234.
FLIGHT_NO = re.compile(r"^[A-Z0-9]{2}\d{1,4}[A-Z]?$")
LEG_FIELDS = ("direction", "airline", "flight_number", "origin", "destination", "destination_country",
              "departure_time", "arrival_time", "arrival_day_offset", "currency")


def _clean_leg(data: dict) -> dict:
    out = dict(data)
    for k in ("airline", "origin", "destination", "destination_country"):
        if out.get(k) is not None:
            out[k] = out[k].strip() or None
    if out.get("flight_number") is not None:
        out["flight_number"] = out["flight_number"].replace(" ", "").strip().upper()
    if out.get("currency") is not None:
        out["currency"] = out["currency"].strip().upper()
    return out


def destinations(db: Session) -> list[str]:
    """Our destinations = countries we have hotels in."""
    from app.engines.hotel.models import Hotel

    rows = db.query(Hotel.country).filter(Hotel.country.isnot(None)).distinct().all()
    return sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()})


def validate_leg(db: Session, leg: dict, leg_id: Optional[int] = None) -> None:
    """Every check a flight line must pass, for both adding and editing.
    `leg` is the complete resulting line."""
    if leg.get("direction") not in DIRECTIONS:
        raise ValueError("Choose arrival flight (to the destination) or departure flight (back home).")
    for key, label in (("flight_number", "Flight number"), ("origin", "From"), ("destination", "To"),
                       ("destination_country", "Destination"), ("currency", "Currency")):
        if not (leg.get(key) or "").strip():
            raise ValueError(f"{label} is required.")
    if not FLIGHT_NO.match(leg["flight_number"]):
        raise ValueError(f"Flight number {leg['flight_number']} does not look right: use the airline code and number, e.g. SZ105.")
    if not _time_ok(leg.get("departure_time") or "") or not _time_ok(leg.get("arrival_time") or ""):
        raise ValueError("Departure and arrival times must be HH:MM (24-hour), e.g. 08:45.")
    if leg["origin"].strip().lower() == leg["destination"].strip().lower():
        raise ValueError("From and To cannot be the same airport.")
    if int(leg.get("arrival_day_offset") or 0) not in (0, 1, 2):
        raise ValueError("Arrival day must be the same day, +1 or +2.")
    if leg["destination_country"] not in destinations(db):
        raise ValueError(f"{leg['destination_country']} is not one of our destinations.")
    for other in repository.list_legs(db):
        if other.id != leg_id and other.flight_number == leg["flight_number"] and other.direction == leg["direction"] \
                and (other.destination_country or "").strip().lower() == leg["destination_country"].strip().lower():
            raise ValueError(f"Flight {leg['flight_number']} already exists for {leg['destination_country']}: edit that line instead.")


def create_leg(db: Session, data: dict, by: int):
    leg = _clean_leg(data)
    leg.setdefault("arrival_day_offset", 0)
    validate_leg(db, leg)
    return repository.create_leg(db, **{k: leg.get(k) for k in LEG_FIELDS}, created_by=by)


def leg_sold_seats(db: Session, leg_id: int) -> int:
    return sum(d.seats_sold for d in repository.list_departures(db, leg_ids=[leg_id]))


def update_leg(db: Session, leg_id: int, fields: dict):
    leg = repository.get_leg(db, leg_id)
    if leg is None:
        raise ValueError(f"Flight {leg_id} not found.")
    fields = _clean_leg(fields)
    # Stored values cleaned too, so an old line typed with a stray space still passes.
    merged = _clean_leg({k: fields.get(k, getattr(leg, k)) for k in LEG_FIELDS})
    validate_leg(db, merged, leg_id=leg_id)
    sold = leg_sold_seats(db, leg_id)
    if sold and (merged["direction"] != leg.direction or merged["currency"] != leg.currency
                 or merged["destination_country"] != (leg.destination_country or "").strip()):
        raise ValueError(f"{sold} seats on this flight are already sold: direction, destination and currency can no longer change.")
    changes = dict(merged)
    if "active" in fields:
        changes["active"] = fields["active"]
    return repository.update_leg(db, leg, changes)


def _check_money(cost: float, price: float, reason: Optional[str]) -> None:
    if cost is None or price is None or cost < 0 or price < 0:
        raise ValueError("Cost and price must be zero or more.")
    if price < cost and not (reason or "").strip():
        raise ValueError("Selling below cost needs a reason.")


def generate_schedule(
    db: Session,
    leg_id: int,
    date_from: date,
    date_to: date,
    weekdays: list[int],
    cabins: list[dict],
    by: int,
) -> dict:
    """weekdays: 0 = Monday ... 6 = Sunday. cabins: [{cabin, seats, cost, price}].

    Owner, 2026-10-17: re-running a schedule over dates that already exist
    updates them -- seats, cost and the standard price follow the new plan
    (seats never below what is already sold). A date whose price was changed
    by hand keeps that price and is counted in `kept_manual_price`; dates
    still on the old standard price move to the new one. Every change is
    written to the history."""
    leg = repository.get_leg(db, leg_id)
    if leg is None:
        raise ValueError(f"Flight {leg_id} not found.")
    if date_to < date_from:
        raise ValueError("The period ends before it starts.")
    if (date_to - date_from).days > MAX_SCHEDULE_DAYS:
        raise ValueError(f"A schedule can cover at most {MAX_SCHEDULE_DAYS} days at a time.")
    days = sorted({int(w) for w in weekdays if 0 <= int(w) <= 6})
    if not days:
        raise ValueError("Pick at least one weekday.")
    if not cabins:
        raise ValueError("Add at least one cabin (economy or business).")
    for c in cabins:
        if c.get("cabin") not in CABINS:
            raise ValueError("Cabin must be economy or business.")
        if int(c.get("seats", 0)) <= 0:
            raise ValueError("Seats must be more than zero.")
        _check_money(c.get("cost"), c.get("price"), c.get("reason"))

    rows, updated, kept, too_few = [], 0, 0, []
    d = date_from
    while d <= date_to:
        if d.weekday() in days:
            for c in cabins:
                seats, cost, price = int(c["seats"]), float(c["cost"]), float(c["price"])
                dep = repository.find_departure(db, leg_id, d, c["cabin"])
                if dep is None:
                    rows.append({
                        "leg_id": leg_id, "date": d, "cabin": c["cabin"], "seats_total": seats, "seats_sold": 0,
                        "cost_per_seat": cost, "price_per_seat": price, "standard_price": price, "updated_by": by,
                    })
                    continue
                if seats < dep.seats_sold:
                    too_few.append(f"{d.isoformat()} {c['cabin']} ({dep.seats_sold} sold)")
                    seats = dep.seats_sold
                manual = dep.price_per_seat != dep.standard_price
                new_price = dep.price_per_seat if manual else price
                if manual:
                    kept += 1
                if (seats, cost, price, new_price) != (dep.seats_total, dep.cost_per_seat, dep.standard_price, dep.price_per_seat):
                    old = (dep.price_per_seat, dep.cost_per_seat, dep.seats_total)
                    repository.update_departure(db, dep, {"seats_total": seats, "cost_per_seat": cost, "standard_price": price,
                                                          "price_per_seat": new_price, "updated_by": by})
                    repository.add_price_change(db, departure_id=dep.id, old_price=old[0], new_price=new_price, old_cost=old[1],
                                                new_cost=cost, old_seats=old[2], new_seats=seats,
                                                reason=c.get("reason") or "schedule updated", changed_by=by)
                    updated += 1
        d += timedelta(days=1)
    created = repository.add_departures(db, rows)
    return {"created": created, "updated": updated, "kept_manual_price": kept, "seats_kept_at_sold": too_few}


def update_departure(db: Session, departure_id: int, fields: dict, by: int):
    dep = repository.get_departure(db, departure_id)
    if dep is None:
        raise ValueError(f"Departure {departure_id} not found.")
    reason = fields.pop("reason", None)
    new_price = fields.get("price_per_seat", dep.price_per_seat)
    new_cost = fields.get("cost_per_seat", dep.cost_per_seat)
    new_seats = fields.get("seats_total", dep.seats_total)
    if new_seats < dep.seats_sold:
        raise ValueError(f"{dep.seats_sold} seats are already sold — the total cannot be lower.")
    changed = new_price != dep.price_per_seat or new_cost != dep.cost_per_seat or new_seats != dep.seats_total
    if new_price != dep.price_per_seat or new_cost != dep.cost_per_seat:
        _check_money(new_cost, new_price, reason)
    old = (dep.price_per_seat, dep.cost_per_seat, dep.seats_total)
    dep = repository.update_departure(db, dep, {**fields, "updated_by": by})
    if changed:
        repository.add_price_change(db, departure_id=dep.id, old_price=old[0], new_price=dep.price_per_seat,
                                    old_cost=old[1], new_cost=dep.cost_per_seat, old_seats=old[2],
                                    new_seats=dep.seats_total, reason=reason, changed_by=by)
    return dep


def bulk_update_prices(db: Session, departure_ids: list[int], price: Optional[float], percent: Optional[float],
                       reason: Optional[str], by: int) -> int:
    """Set one price for many departures, or change them all by a percent
    (e.g. -20). Each change is validated and logged like a single edit."""
    if (price is None) == (percent is None):
        raise ValueError("Give either a new price or a percent change.")
    count = 0
    for dep_id in departure_ids:
        dep = repository.get_departure(db, dep_id)
        if dep is None:
            continue
        new_price = price if price is not None else round(dep.price_per_seat * (1 + percent / 100), 2)
        update_departure(db, dep_id, {"price_per_seat": new_price, "reason": reason}, by)
        count += 1
    return count


def grid(db: Session, date_from: date, date_to: date, destination_country: Optional[str] = None) -> list[dict]:
    target = (destination_country or "").strip().lower()
    legs = {l.id: l for l in repository.list_legs(db) if not target or (l.destination_country or "").strip().lower() == target}
    out = []
    for d in repository.list_departures(db, date_from, date_to, list(legs)):
        leg = legs[d.leg_id]
        out.append({
            "departure_id": d.id, "date": d.date, "cabin": d.cabin, "leg_id": leg.id, "direction": leg.direction,
            "flight_number": leg.flight_number, "route": f"{leg.origin} → {leg.destination}",
            "departure_time": leg.departure_time, "arrival_time": leg.arrival_time, "arrival_day_offset": leg.arrival_day_offset,
            "currency": leg.currency, "seats_total": d.seats_total, "seats_sold": d.seats_sold,
            "seats_free": d.seats_total - d.seats_sold, "cost_per_seat": d.cost_per_seat,
            "price_per_seat": d.price_per_seat, "standard_price": d.standard_price, "active": d.active,
            "below_cost": d.price_per_seat < d.cost_per_seat,
        })
    return out


def _leg_info(leg, dep) -> dict:
    return {
        "departure_id": dep.id, "date": dep.date, "flight_number": leg.flight_number, "airline": leg.airline,
        "origin": leg.origin, "destination": leg.destination, "departure_time": leg.departure_time,
        "arrival_time": leg.arrival_time, "arrival_day_offset": leg.arrival_day_offset,
        "price_per_seat": dep.price_per_seat, "cost_per_seat": dep.cost_per_seat,
        "seats_free": dep.seats_total - dep.seats_sold,
    }


def search_flights(db: Session, destination_country: str, out_date: date, back_date: Optional[date], pax: int,
                   one_way_allowed: bool = False) -> list[dict]:
    """Offers per cabin for these dates. Round trip by default; with
    one_way_allowed, single-direction offers are returned too."""
    # Compared trimmed: a country typed by hand ("Maldives ") must still match the hotel's.
    target = (destination_country or "").strip().lower()
    legs = [l for l in repository.list_legs(db) if l.active and (l.destination_country or "").strip().lower() == target]
    out_legs = [l for l in legs if l.direction == "outbound"]
    back_legs = [l for l in legs if l.direction == "return"]

    def available(leg_list, on):
        found = []
        for leg in leg_list:
            for cabin in CABINS:
                dep = repository.find_departure(db, leg.id, on, cabin) if on else None
                if dep and dep.active and dep.seats_total - dep.seats_sold >= pax:
                    found.append((cabin, leg, dep))
        return found

    outs = available(out_legs, out_date)
    backs = available(back_legs, back_date) if back_date else []
    offers = []
    for cabin in ("economy", "business"):
        o = [x for x in outs if x[0] == cabin]
        b = [x for x in backs if x[0] == cabin]
        if o and b:
            for _, ol, od in o:
                for _, bl, bd in b:
                    if ol.currency != bl.currency:
                        continue
                    per = od.price_per_seat + bd.price_per_seat
                    offers.append({"cabin": cabin, "trip": "round", "currency": ol.currency,
                                   "outbound": _leg_info(ol, od), "return": _leg_info(bl, bd),
                                   "price_per_person": round(per, 2), "net_total": round(per * pax, 2),
                                   "cost_total": round((od.cost_per_seat + bd.cost_per_seat) * pax, 2)})
        if one_way_allowed:
            for _, ol, od in o:
                offers.append({"cabin": cabin, "trip": "outbound_only", "currency": ol.currency, "outbound": _leg_info(ol, od),
                               "return": None, "price_per_person": od.price_per_seat,
                               "net_total": round(od.price_per_seat * pax, 2), "cost_total": round(od.cost_per_seat * pax, 2)})
            for _, bl, bd in b:
                offers.append({"cabin": cabin, "trip": "return_only", "currency": bl.currency, "outbound": None,
                               "return": _leg_info(bl, bd), "price_per_person": bd.price_per_seat,
                               "net_total": round(bd.price_per_seat * pax, 2), "cost_total": round(bd.cost_per_seat * pax, 2)})
    offers.sort(key=lambda x: (x["trip"] != "round", x["cabin"] != "economy", x["price_per_person"]))
    return offers
