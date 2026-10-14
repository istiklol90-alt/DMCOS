"""
Business/orchestration layer for the Finance Engine.

Same layering as every other Engine (08_Coding_Standards.md: "Business
logic inside Services", "Database access through Repository Layer").
This is the second Engine (after Booking Engine) to read from another
Engine's service.py directly -- app.engines.booking.service, read-only,
to fetch Booking rows for financial computation. Finance Engine never
writes back into Booking Engine, and never touches LOCKED Booking
Engine's own code -- Invoice generation is a manual, Finance-side
action (this session's decision), not a hook fired from
create_booking, so no change to Booking Engine's service.py was
needed.

compute_booking_financials is the single source of truth for
Net/Sale/Profit math, replacing Reservations.tsx's stale inline
calculation (which still shows Net == Sale and a hardcoded Profit
placeholder, predating Decision 069's Pricing Engine integration --
flagged, not fixed, by this Engine). Every other function in this
module (Invoice/AgentStatement generation) builds on it rather than
recomputing its own version.
"""

from datetime import date, datetime
import io
import uuid

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session

from app.engines.finance import repository
from app.engines.finance import validators
from app.engines.finance.models import (
    Invoice,
    CreditNote,
    AgentStatement,
    HotelCashbackArrangement,
    HotelCashbackFulfillment,
    Voucher,
    BookingCommercialLine,
)
from app.engines.booking.models import Booking
from app.engines.booking import repository as booking_repository
from app.engines.hotel.models import Hotel
from models.user import User
from services import email_service

# Read-only cross-engine dependency, same pattern as Booking Engine's own
# imports of Hotel/Contract Engine's service.py.
from app.engines.booking import service as booking_service
# Decision 081: same read-only pattern -- only needed to resolve
# hotel_name for approve_and_send_invoice's email content.
from app.engines.hotel import service as hotel_service
# Decision 094: same read-only pattern -- add_invoice_review_note prices
# a booking's OLD dates itself (server-side, never client-supplied) via
# the exact same functions Booking Engine's own create_booking/
# change_booking_dates use internally.
from app.engines.contract import service as contract_service
from app.engines.pricing import service as pricing_service

# Booking Engine's validators.TERMINAL_STATUSES -- deliberately not
# imported (validators.py isn't the cross-engine contract surface,
# service.py is), duplicated here as a plain constant instead. Decision
# 104: also includes "Cancellation Requested" (not itself terminal in
# Booking Engine, but not a real, billable sale from Finance Engine's
# perspective either) -- both here (blocks new invoices, see
# create_invoice_for_booking below) and in generate_agent_statement's
# existing exclusion (a booking mid-cancellation shouldn't count toward
# a finalized agent rollup any more than an already-cancelled one does).
CANCELLED_BOOKING_STATUSES = {"Cancellation Requested", "Cancelled", "Rejected"}


# ---------------------------------------------------------------------------
# Core financial computation -- single source of truth for Net/Sale/Profit
# ---------------------------------------------------------------------------

def compute_booking_financials(booking: Booking) -> dict:
    """
    Derives Net/Sale/Profit from Booking's own columns -- no re-pricing,
    no calls into Contract/Pricing Engine, just arithmetic over the
    frozen snapshot Booking Engine already wrote at booking time.

    room_sale = booking.total_amount (Pricing Engine's agent_room_total,
    per Decision 069 -- already includes markup/exclusive-discount).
    room_net recovers the pre-Pricing-Engine figure exactly as
    Booking.total_amount's own docstring specifies:
        room_net = total_amount - agent_markup_amount + agent_exclusive_discount_amount

    transfer_total/mandatory_tax_total are pass-through at cost --
    Pricing Engine's LOCKED entry confirms it never touches either --
    so they add identically to both net_total and sale_total and
    contribute zero profit.

    agent_markup_amount/agent_exclusive_discount_amount are NULL
    together on any booking that predates Decision 069 (no backfill was
    done). markup_computed=False flags this case: profit is None (not
    computed), not 0 (a real zero-margin sale) -- the same NULL-vs-zero
    distinction the columns themselves already carry. subtotal/net_total/
    sale_total remain concrete numbers either way (a pre-069 booking's
    total_amount is itself the raw net, so the formulas collapse
    correctly with markup/discount treated as 0).

    total = subtotal - discount + commission + tax always reconciles to
    sale_total exactly -- verified by construction, and re-verified
    against real booking data before this function is considered done.
    """
    transfer = booking.transfer_total or 0.0
    tax = booking.mandatory_tax_total or 0.0
    markup_computed = booking.agent_markup_amount is not None
    markup = booking.agent_markup_amount or 0.0
    discount = booking.agent_exclusive_discount_amount or 0.0

    room_net = booking.total_amount - markup + discount
    subtotal = room_net + transfer
    net_total = room_net + transfer + tax
    sale_total = booking.total_amount + transfer + tax
    profit = (markup - discount) if markup_computed else None

    return {
        "booking_id": booking.id,
        "currency": booking.currency,
        "room_net": room_net,
        "room_sale": booking.total_amount,
        "transfer_amount": booking.transfer_total,
        "tax_amount": booking.mandatory_tax_total,
        "discount_amount": booking.agent_exclusive_discount_amount,
        "commission_amount": booking.agent_markup_amount,
        "markup_computed": markup_computed,
        "subtotal": subtotal,
        "net_total": net_total,
        "sale_total": sale_total,
        "profit": profit,
    }


# Rooms in these statuses were never actually delivered/charged -- a
# Rejected room's pricing fields are all NULL (never priced, see
# BookingRoom's own docstring), and a Cancelled/Cancellation-Requested
# room's allotment is being or has been given back. None of the three
# should ever contribute to an invoice.
_NON_BILLABLE_ROOM_STATUSES = {"Rejected", "Cancelled", "Cancellation Requested"}


def compute_application_financials(db: Session, booking: Booking, room_financials=None) -> dict:
    """
    Stage 4 (multi-room booking applications): aggregates Net/Sale/Profit
    across every currently-billable room (BookingRoom) in an application,
    plus the itemized per-room breakdown the project owner explicitly
    asked for (room 1: names + sum, room 2: names + sum, grand total).

    Reuses compute_booking_financials completely UNCHANGED, called once
    per billable room -- BookingRoom exposes the exact same
    total_amount/agent_markup_amount/agent_exclusive_discount_amount/
    transfer_total/mandatory_tax_total/currency/id attributes Booking
    itself does (duck-typing compatible, confirmed by inspection: both
    are the same columns, just living on two different tables since
    Stage 1), so there's no separate room-level formula to keep in sync
    with the booking-level one.

    Falls back to the OLD direct-on-Booking computation, wrapped in the
    same {"rooms": [...]} shape, for any booking with zero BookingRoom
    rows at all -- a booking created via the original single-room
    create_booking path (Stage 2 left that function completely
    untouched), which never gets a BookingRoom row. Every one of the 59
    bookings that predate this feature DOES have exactly one
    migrated BookingRoom (Stage 1), so this fallback is only ever
    exercised by bookings created through the old endpoint after Stage 2
    shipped alongside it, not by historical data.
    """
    rooms = booking_service.list_booking_rooms(db, booking.id)

    if not rooms:
        fin = compute_booking_financials(booking)
        return {**fin, "rooms": [{**fin, "booking_room_id": None, "sequence_number": 1, "guest_names": None}]}

    billable = [r for r in rooms if r.status not in _NON_BILLABLE_ROOM_STATUSES]

    if not billable:
        # Every room in the application was rejected/cancelled -- nothing
        # was actually delivered, so nothing is owed. 0.0/None follow the
        # exact same NULL-vs-zero convention compute_booking_financials
        # itself already uses (a real, computed zero, not "not computed").
        return {
            "booking_id": booking.id,
            "currency": booking.currency,
            "subtotal": 0.0,
            "net_total": 0.0,
            "sale_total": 0.0,
            "discount_amount": 0.0,
            "commission_amount": 0.0,
            "tax_amount": 0.0,
            "profit": 0.0,
            "rooms": [],
        }

    room_breakdowns = []
    # Decision 202: `room_financials` lets the hand-over to accounting price
    # each room from the commercial breakdown instead of the frozen booking
    # columns. Default is unchanged.
    price_room = room_financials or compute_booking_financials
    for room in billable:
        fin = price_room(room)
        guests = booking_service.list_guests_for_room(db, room.id)
        guest_names = ", ".join(f"{g.first_name} {g.last_name}" for g in guests) or None
        fin = {
            **fin,
            "booking_room_id": room.id,
            "sequence_number": room.sequence_number,
            "guest_names": guest_names,
        }
        del fin["booking_id"]
        room_breakdowns.append(fin)

    markup_computed_all = all(b["markup_computed"] for b in room_breakdowns)

    def _sum(key: str) -> float:
        return sum((b[key] or 0.0) for b in room_breakdowns)

    return {
        "booking_id": booking.id,
        "currency": room_breakdowns[0]["currency"],
        "subtotal": _sum("subtotal"),
        "net_total": _sum("net_total"),
        "sale_total": _sum("sale_total"),
        "discount_amount": _sum("discount_amount"),
        "commission_amount": _sum("commission_amount"),
        "tax_amount": _sum("tax_amount"),
        "profit": _sum("profit") if markup_computed_all else None,
        "rooms": room_breakdowns,
    }


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

def _generate_invoice_number() -> str:
    """No documented format exists anywhere in the docs, same as Booking Engine's own booking_number -- our own scheme."""
    return f"INV-{uuid.uuid4().hex[:12].upper()}"


def _attach_review_notes(db: Session, invoice: Invoice) -> Invoice:
    """Decision 093: no SQLAlchemy relationship() exists anywhere in
    this project (every intra-engine FK, e.g. CreditNote.invoice_id, is
    a plain Column, listed explicitly via its own repository function)
    -- kept consistent here rather than introducing the first one.
    review_notes is set as a plain ad-hoc attribute so InvoiceResponse's
    from_attributes validation picks it up like any other field; every
    service function that returns an Invoice (or list of them) must
    call this (or _attach_review_notes_bulk) before returning, since
    the attribute doesn't exist on the ORM object otherwise -- and
    db.refresh() wipes any previously-attached value, so this must run
    AFTER the last refresh, not before.

    Stage 4: also attaches room_breakdown here (single-invoice fetches
    only, NOT _attach_review_notes_bulk's list views -- a list table
    doesn't render per-room itemization). Reads the FROZEN
    InvoiceRoomLine rows created once by create_invoice_for_booking --
    deliberately NOT recomputed live from BookingRoom's current data. An
    earlier version of this did recompute live, and a real bug was
    caught during Stage 4's own verification: an existing invoice's
    frozen `total` silently disagreed with a live-recomputed breakdown
    once the underlying booking had moved on after invoicing. Invoice is
    a "frozen financial document" by its own docstring -- its breakdown
    must stay frozen too, or the two can drift and disagree. If a room's
    price genuinely changes after invoicing, InvoiceReviewNote is the
    existing, correct mechanism to surface that -- not something this
    breakdown should paper over by quietly showing different numbers."""
    invoice.review_notes = repository.list_review_notes_by_invoice(db, invoice.id)
    invoice.room_breakdown = repository.list_invoice_room_lines(db, invoice.id)
    return invoice


def _attach_review_notes_bulk(db: Session, invoices: list[Invoice]) -> list[Invoice]:
    notes_by_invoice = repository.list_review_notes_by_invoice_ids(db, [inv.id for inv in invoices])
    for inv in invoices:
        inv.review_notes = notes_by_invoice.get(inv.id, [])
    return invoices


def _attach_display_names_bulk(db: Session, invoices: list[Invoice]) -> list[Invoice]:
    """
    Decision 182: stamp each invoice with the booking number, hotel name
    and agent name it refers to.

    The list rendered raw ids -- "#29", "#2" -- which are meaningless to
    the person reading it; nobody knows hotel 2 by number. Resolved here,
    in **three bulk queries for the whole page** regardless of its size,
    rather than the obvious per-row lookup that would scale with rows
    instead of with catalog size (Decision 151's rule).

    Attributes, not columns: nothing is stored, so a hotel rename shows
    immediately and the frozen financial figures stay frozen.
    """
    if not invoices:
        return invoices
    booking_ids = {inv.booking_id for inv in invoices}
    hotel_ids = {inv.hotel_id for inv in invoices}
    agent_ids = {inv.agent_id for inv in invoices}

    # Queried directly rather than adding a bulk lookup to two LOCKED
    # engines for one display concern -- Finance already imports both
    # models, and these are plain reads with no business logic.
    numbers = {
        b.id: b.booking_number
        for b in db.query(Booking.id, Booking.booking_number).filter(Booking.id.in_(list(booking_ids))).all()
    }
    hotels = {
        h.id: h.hotel_name
        for h in db.query(Hotel.id, Hotel.hotel_name).filter(Hotel.id.in_(list(hotel_ids))).all()
    }
    agents = {
        u.id: (u.name or u.email)
        for u in db.query(User).filter(User.id.in_(list(agent_ids))).all()
    }

    # Decision 182: what the booking costs NOW, so a list row can tell a
    # money difference from a harmless one without opening the invoice.
    #
    # Not derivable from the review notes alone: INV-3A3B7074F568 is 75.45
    # short of its booking, and every one of its notes predates structured
    # price snapshots -- judged on the notes it looked identical to an
    # invoice whose amount never moved. One more bulk query, not one per row.
    rooms_by_booking: dict[int, list] = {}
    for room in booking_repository.list_booking_rooms_bulk(db, list(booking_ids)):
        rooms_by_booking.setdefault(room.booking_id, []).append(room)

    def _money(row) -> float:
        return (
            (row.total_amount or 0.0)
            + (row.transfer_total or 0.0)
            + (row.mandatory_tax_total or 0.0)
        )

    booking_rows = {b.id: b for b in db.query(Booking).filter(Booking.id.in_(list(booking_ids))).all()}
    totals_now: dict[int, float] = {}
    for bid, booking_row in booking_rows.items():
        rooms = rooms_by_booking.get(bid)
        if rooms is None:
            totals_now[bid] = _money(booking_row)
        else:
            totals_now[bid] = sum(
                _money(r) for r in rooms if r.status not in _NON_BILLABLE_ROOM_STATUSES
            )

    for inv in invoices:
        inv.booking_number = numbers.get(inv.booking_id)
        inv.hotel_name = hotels.get(inv.hotel_id)
        inv.agent_name = agents.get(inv.agent_id)
        inv.booking_total_now = totals_now.get(inv.booking_id)
        # Decision 182: a live invoice on a cancelled booking is a real
        # problem, but "Amount -1,609.05" is a misleading way to say it --
        # nothing is owed because the booking is gone, not because the price
        # dropped. Three such invoices exist today (BK-000021/24/25).
        row = booking_rows.get(inv.booking_id)
        inv.booking_status = row.status if row is not None else None
    return invoices


def create_invoice_for_booking(db: Session, booking_id: int, created_by: int) -> Invoice:
    """
    Manually-triggered Invoice generation. Raises if a booking's already
    been invoiced -- one Invoice per booking, no duplicates.

    Decision 079: status is now set to "Draft", not "Issued" -- Draft
    means "created, awaiting accounting review," deliberately NOT
    agent-visible and with no PDF/email side effects yet. Only a future
    approve_and_send_invoice action (not built yet) moves Draft ->
    Issued, atomically generating the PDF, emailing it to the agent,
    and making it agent-visible -- all three happen together, not as
    separate steps. This reverses this function's original behavior
    (previously wrote "Issued" immediately, treating Draft as
    unreachable); the docstring's old claim that Draft was "effectively
    unreachable" no longer holds.

    issue_date is still set to today's date at creation time, same as
    before -- Stage 4 (approve_and_send_invoice) hasn't been designed
    yet, so whether "issue_date" should instead mean the actual
    approval/send date (requiring issue_date to become nullable, or a
    separate approved_at/sent_at field) is an open question left for
    that stage, not decided here.
    """
    booking = booking_service.get_booking(db, booking_id)
    if booking.status in CANCELLED_BOOKING_STATUSES:
        raise ValueError(f"Cannot create an invoice for a booking with status '{booking.status}'")
    if repository.get_invoice_by_booking(db, booking_id) is not None:
        raise ValueError(f"Booking {booking_id} already has an invoice")

    # Stage 4 (multi-room booking applications): Invoice's own stored
    # columns are the grand-total aggregate across every billable room in
    # the application (compute_application_financials sums them) --
    # unchanged in shape from before, and byte-identical to the old
    # compute_booking_financials(booking) result for any booking with
    # exactly one room (every pre-Stage-4 booking, migrated or not).
    financials = compute_application_financials(db, booking)
    invoice = repository.create_invoice(
        db,
        invoice_number=_generate_invoice_number(),
        booking_id=booking.id,
        agent_id=booking.agent_id,
        hotel_id=booking.hotel_id,
        issue_date=date.today(),
        currency=financials["currency"],
        subtotal=financials["subtotal"],
        discount=financials["discount_amount"],
        commission=financials["commission_amount"],
        tax=financials["tax_amount"],
        total=financials["sale_total"],
        status="Draft",
        created_by=created_by,
    )

    # The itemized per-room breakdown is FROZEN here, once, into
    # InvoiceRoomLine -- never recomputed live on later reads (see that
    # model's own docstring for the real bug this fixed during Stage 4's
    # verification). financials["rooms"] is the exact same list just used
    # to compute the grand-total columns above, so the line items and the
    # total can never disagree with each other at least at this moment.
    _write_invoice_room_lines(db, invoice.id, financials)

    return _attach_review_notes(db, invoice)


def _write_invoice_room_lines(db: Session, invoice_id: int, financials: dict) -> None:
    for room_fin in financials["rooms"]:
        repository.create_invoice_room_line(
            db,
            invoice_id=invoice_id,
            booking_room_id=room_fin["booking_room_id"],
            sequence_number=room_fin["sequence_number"],
            guest_names=room_fin["guest_names"],
            currency=room_fin["currency"],
            room_net=room_fin["room_net"],
            room_sale=room_fin["room_sale"],
            transfer_amount=room_fin["transfer_amount"],
            tax_amount=room_fin["tax_amount"],
            discount_amount=room_fin["discount_amount"],
            commission_amount=room_fin["commission_amount"],
            subtotal=room_fin["subtotal"],
            net_total=room_fin["net_total"],
            sale_total=room_fin["sale_total"],
            profit=room_fin["profit"],
        )


def get_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = repository.get_invoice(db, invoice_id)
    if invoice is None:
        raise ValueError(f"Invoice {invoice_id} not found")
    return _attach_review_notes(db, invoice)


def get_invoice_by_booking(db: Session, booking_id: int) -> Invoice:
    """So a caller (Reservations.tsx's invoice button) can distinguish
    "not yet invoiced" from "already invoiced" without guessing --
    raises the same as get_invoice rather than returning None, matching
    this Engine's uniform ValueError-to-400 convention."""
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None:
        raise ValueError(f"Booking {booking_id} has no invoice")
    return _attach_review_notes(db, invoice)


def _price_stay(db: Session, booking: Booking, contract_id: int, meal_code: str, arrival: date, departure: date) -> dict:
    """Decision 094: the exact same pricing chain Booking Engine's own
    create_booking/change_booking_dates use internally, factored out
    here so both the old- and new-dates snapshot (when the new one
    isn't just read off the booking row) go through identical logic.
    Returns {"total": agent-facing grand total including transfer/tax,
    "offer_id": the single applied SpecialOffer id, or None}."""
    nights = (departure - arrival).days
    price = contract_service.get_room_price(
        db, contract_id, booking.room_type_id, arrival, departure, meal_code,
        booking.adults, booking.children, booking.infants,
    )
    transfer_total = 0.0
    if booking.transfer_type:
        transfer_total = contract_service.get_transfer_price(
            db, contract_id, booking.transfer_type, arrival, departure,
            booking.adults, booking.children, booking.infants,
        )["total"]
    tax_total = contract_service.get_mandatory_tax(db, contract_id, nights, booking.adults, booking.children)["total"]
    agent_pricing = pricing_service.apply_agent_pricing(
        db, booking.agent_id, contract_id, price["final_total"], nights,
        booking.room_type_id, price["meal_plan_id"], arrival, departure,
    )
    offer_id = price["applied_special_offer_ids"][0] if price["applied_special_offer_ids"] else None
    return {"total": agent_pricing["agent_room_total"] + transfer_total + tax_total, "offer_id": offer_id}


def add_invoice_review_note(
    db: Session, booking_id: int, old_arrival_date: date, old_departure_date: date
) -> Invoice | None:
    """
    Decision 083 (Requirement 2), restructured by Decision 093, extended
    by Decision 094: called via frontend orchestration from
    Reservations.tsx's date-change handler, best-effort, after
    change_booking_dates already succeeded -- mirrors Decision 080's
    claim-auto-invoice shape exactly, for the same reason (avoids a
    circular import: this module already imports booking_service, so
    Booking Engine calling back into Finance Engine at module level
    would break at import time).

    Decision 108: ALWAYS creates a booking-rooted note now, regardless
    of whether an invoice exists -- previously silently no-op'd
    whenever no invoice existed yet, which is the common case for a
    freshly-created booking, meaning no durable signal was created for
    a large fraction of real date changes at all. invoice_id is set
    only when one happens to exist right now (informational, never
    load-bearing for urgency). The RETURN VALUE keeps its exact
    original contract (None when no invoice exists or it's Void) --
    only the API caller's "should I surface an updated Invoice"
    decision, not whether a note gets written.

    Decision 094: captures the real price breakdown for both sides of
    the change, snapshotted server-side right now -- never
    client-supplied (a permanent financial audit record shouldn't trust
    a client's report of historical pricing) and never reconstructed
    later (season/offer availability can itself change over time, so a
    later recompute wouldn't necessarily match what was true at the
    actual moment of change).

    NEW snapshot is read directly off the booking's current row, never
    recomputed -- change_booking_dates has already computed and stored
    exactly this, moments before this call runs; recomputing separately
    would be redundant and could theoretically diverge from what's
    actually stored. OLD snapshot must be recomputed, since the
    pre-change values are gone from the booking row by this point:
    resolves whichever contract actually covered the OLD dates (may
    differ from the booking's current contract if the change crossed a
    contract boundary), resolves the booking's current meal_plan_id to
    its portable meal code first (meal codes, not ids, are portable
    across contracts -- the same assumption get_room_price's own
    signature already makes everywhere), then prices the old dates
    against the old contract using that code. Wrapped in a broad
    try/except: if the old dates genuinely can't be repriced (no
    contract covered them, no meal plan match, etc.), old_total/
    old_offer_name stay None and change_description alone carries the
    fallback description -- this best-effort note must never fail the
    caller's already-succeeded date change.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)

    booking = booking_service.get_booking(db, booking_id)

    new_total = booking.total_amount + (booking.transfer_total or 0.0) + (booking.mandatory_tax_total or 0.0)
    new_offer_name = None
    if booking.applied_special_offer_id is not None:
        new_offer_name = contract_service.get_special_offer(db, booking.applied_special_offer_id).offer_name

    old_total = None
    old_offer_name = None
    try:
        old_contract = contract_service.get_active_contract(db, booking.hotel_id, old_arrival_date)
        if old_contract is not None:
            current_meal_plans = contract_service.get_meal_plans(db, booking.contract_id, booking.room_type_id)
            meal_code = next((mp.meal_code for mp in current_meal_plans if mp.id == booking.meal_plan_id), None)
            if meal_code is not None:
                old_result = _price_stay(db, booking, old_contract.id, meal_code, old_arrival_date, old_departure_date)
                old_total = old_result["total"]
                if old_result["offer_id"] is not None:
                    old_offer_name = contract_service.get_special_offer(db, old_result["offer_id"]).offer_name
    except ValueError:
        pass

    existing_notes = repository.list_review_notes_by_booking(db, booking_id)
    next_sequence = len(existing_notes) + 1
    fallback_description = (
        f"Dates changed: {old_arrival_date.isoformat()} - {old_departure_date.isoformat()} "
        f"-> {booking.arrival_date.isoformat()} - {booking.departure_date.isoformat()}"
    )
    repository.create_review_note(
        db,
        booking_id=booking_id,
        invoice_id=invoice.id if invoice is not None else None,
        sequence_number=next_sequence,
        change_description=fallback_description,
        old_arrival_date=old_arrival_date,
        old_departure_date=old_departure_date,
        old_total=old_total,
        old_offer_name=old_offer_name,
        new_arrival_date=booking.arrival_date,
        new_departure_date=booking.departure_date,
        new_total=new_total,
        new_offer_name=new_offer_name,
    )
    if invoice is None or invoice.status == "Void":
        return None
    return _attach_review_notes(db, invoice)


def add_cancellation_requested_note(db: Session, booking_id: int) -> Invoice | None:
    """
    Decision 104: same frontend-orchestrated, best-effort pattern as
    add_invoice_review_note above, for the same reason (Finance Engine
    already imports booking_service at module level, so a reverse import
    would break at import time) -- called right after
    POST /booking-engine/bookings/{id}/cancel (stage 1) succeeds.

    Takes no reason parameter -- same Decision 094 principle
    (FlagForReviewRequest itself) applies: a permanent financial audit
    record shouldn't be built from client-supplied prose. Reads
    booking.cancellation_reason directly off the booking row (already
    frozen server-side by request_cancellation) instead.

    Unlike a date-change note, there's no price to compare (nothing has
    been repriced), so this only ever populates change_description and
    leaves all 8 price-snapshot columns NULL -- InvoiceReviewNote's own
    columns are already nullable for exactly this kind of event-only
    note; no schema change needed.

    Decision 108: ALWAYS creates the note now (booking-rooted), same
    reasoning as add_invoice_review_note's own Decision 108 update --
    previously silently no-op'd whenever no invoice existed yet, the
    common case. Return value keeps its original None-when-no-invoice
    contract; only note creation itself is now unconditional.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)

    booking = booking_service.get_booking(db, booking_id)
    next_sequence = len(repository.list_review_notes_by_booking(db, booking_id)) + 1
    repository.create_review_note(
        db,
        booking_id=booking_id,
        invoice_id=invoice.id if invoice is not None else None,
        sequence_number=next_sequence,
        change_description=f"Cancellation requested: {booking.cancellation_reason}",
    )
    if invoice is None or invoice.status == "Void":
        return None
    return _attach_review_notes(db, invoice)


def _format_transfer_side(name: str | None, total: float | None, currency: str) -> str:
    """The human-readable side of a transfer change, for an audit sentence a
    manager reads months later. Name, not the transfer_type code."""
    if name is None:
        return "no transfer"
    if total is None:
        return name
    return f"{name} ({currency} {total:,.2f})"


def record_transfer_change(db: Session, change: dict, changed_by_label: str) -> None:
    """
    Decision 199: the durable admin-side signal that a booking's transfer
    was changed after the fact, plus the ledger re-sync that keeps the
    money consistent with it.

    Called from Booking Engine's API layer inside the SAME request as the
    change itself — deliberately NOT the best-effort frontend-orchestrated
    pattern Decisions 080/083/094 use. That pattern exists to avoid a
    circular import, and here there is none to avoid: booking/api.py may
    import finance/service.py freely (finance imports booking's *service*,
    never its api). The owner's requirement is that the notification appear
    the moment the change is made, and a second call fired from a browser
    can silently fail in a way this cannot.

    Two effects:

    1. An append-only InvoiceReviewNote against the booking, which is what
       puts it into the admin panel's "Needs Attention" panel until someone
       acknowledges it (Decision 108's booking-rooted urgency mechanism,
       reused unchanged). All 8 price-snapshot columns stay NULL: those
       columns describe a DATE change, and financeShared.tsx's
       formatSingleNote picks its rendering tier from them, so populating
       old_total/new_total here without dates would render this note as a
       date change with an "Invalid Date" in it.
    2. The room's `transfer` commercial line is re-synced to the new fare —
       base_cost/base_price only. Once seeded, that line never re-reads the
       BookingRoom, so without this the Commercial breakdown and the invoice
       would keep quoting the old car's price. Any manual adjustment on the
       line is untouched: adjustment_cost/adjustment_price are a separate,
       never-merged correction by design, so a re-sync of the system figure
       cannot silently discard a manager's own entry.
    """
    booking_id = change["booking_id"]
    currency = change["currency"] or "USD"
    was = _format_transfer_side(change["old_transfer_name"], change["old_transfer_total"], currency)
    now = _format_transfer_side(change["new_transfer_name"], change["new_transfer_total"], currency)
    delta = (change["new_transfer_total"] or 0.0) - (change["old_transfer_total"] or 0.0)
    # Sign before the currency: "-EUR 500.00" reads as money owed back,
    # whereas "EUR -500.00" reads as a typo.
    delta_text = (
        "no change in price"
        if abs(delta) <= 0.01
        else f"{'+' if delta > 0 else '-'}{currency} {abs(delta):,.2f}"
    )

    invoice = repository.get_invoice_by_booking(db, booking_id)
    next_sequence = len(repository.list_review_notes_by_booking(db, booking_id)) + 1
    repository.create_review_note(
        db,
        booking_id=booking_id,
        invoice_id=invoice.id if invoice is not None else None,
        sequence_number=next_sequence,
        change_description=(
            f"Transfer changed on room {change['sequence_number']} by {changed_by_label}: "
            f"{was} → {now} ({delta_text})"
        ),
    )

    # Only re-sync a line that already exists. Seeding one here would create
    # a ledger row for a room nobody has opened, which get_booking_commercial_summary
    # deliberately avoids doing.
    for line in repository.list_commercial_lines(db, change["booking_room_id"]):
        if line.category != "transfer":
            continue
        repository.update_commercial_line(
            db,
            line,
            base_cost=change["new_transfer_total"],
            base_price=change["new_transfer_total"],
        )
        break


def add_cancellation_confirmed_note(db: Session, booking_id: int) -> Invoice | None:
    """Decision 104: same shape as add_cancellation_requested_note above (including reading cancellation_confirmation_number directly off the booking row, never from the client), called after stage 2 (POST /confirm-cancellation) succeeds -- gives accounting a second, distinct signal that the cancellation is now final, not just requested. Decision 108: always creates the note now (booking-rooted); see add_invoice_review_note's own Decision 108 note for the full reasoning."""
    invoice = repository.get_invoice_by_booking(db, booking_id)

    booking = booking_service.get_booking(db, booking_id)
    next_sequence = len(repository.list_review_notes_by_booking(db, booking_id)) + 1
    repository.create_review_note(
        db,
        booking_id=booking_id,
        invoice_id=invoice.id if invoice is not None else None,
        sequence_number=next_sequence,
        change_description=f"Cancellation confirmed by hotel (number: {booking.cancellation_confirmation_number})",
    )
    if invoice is None or invoice.status == "Void":
        return None
    return _attach_review_notes(db, invoice)


def acknowledge_booking_review(db: Session, booking_id: int, acknowledged_by: int) -> None:
    """
    Decision 108: the real acknowledge action -- booking-rooted, unified
    across Бронирования and Финансы→Счета per the project owner's
    explicit "same action, one shared acknowledgment" decision.
    Requires at least one existing review note for the booking: same
    "deliberate human action, not a silent no-op" precedent
    acknowledge_review_flag (below) originally established.

    Real finding made while implementing, not part of the original
    plan: financeShared.tsx's isUrgentFlag (used by Invoices.tsx's
    general/searched invoice table AND InvoiceDetailModal, not just the
    already-server-filtered urgent panel) recomputes urgency
    CLIENT-SIDE from Invoice.flag_acknowledged_at -- if this function
    left that field frozen (as originally planned), those already-
    LOCKED, already-verified frontend surfaces would silently show
    stale urgency after any booking-rooted acknowledgment. Mirrors the
    write into the booking's Invoice (if one exists) specifically to
    avoid touching that frontend code at all, matching the project
    owner's own "keep InvoiceReviewNote name, minimize touching locked
    Финансы→Счета code" preference for this whole decision.
    BookingReviewAcknowledgment remains the real, authoritative source
    of truth server-side (list_urgent_booking_ids never reads this
    mirrored field) -- this write exists purely for frontend
    backward-compatibility.
    """
    notes = repository.list_review_notes_by_booking(db, booking_id)
    if not notes:
        raise ValueError(f"Booking {booking_id} has no review notes to acknowledge")
    repository.upsert_booking_acknowledgment(db, booking_id, acknowledged_by)
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is not None:
        repository.update_invoice(
            db, invoice, flag_acknowledged_at=datetime.utcnow(), flag_acknowledged_by=acknowledged_by
        )


def acknowledge_review_flag(db: Session, invoice_id: int, acknowledged_by: int) -> Invoice:
    """
    Decision 089: "Отметить как проверено" -- lets accounting dismiss the
    current urgent state on an Issued invoice (where
    approve_and_send_invoice's own flag_acknowledged_at write doesn't
    apply, since that function is gated to Draft-only) without
    re-sending anything.

    Decision 108: now a thin wrapper over acknowledge_booking_review --
    resolves the invoice's booking_id and writes there instead of this
    Invoice's own flag_acknowledged_at/flag_acknowledged_by (those two
    columns stay in place physically, unmapped going forward, same
    precedent as Decision 093's own review_flag retirement). This
    endpoint and Бронирования's own acknowledge action are now the
    literal same operation on the same BookingReviewAcknowledgment row.
    """
    invoice = get_invoice(db, invoice_id)
    acknowledge_booking_review(db, invoice.booking_id, acknowledged_by)
    return _attach_review_notes(db, invoice)


def list_urgent_bookings(db: Session) -> list[dict]:
    """
    Decision 108: Бронирования's own "Требует внимания" panel -- the
    exact same underlying signal Финансы→Счета's own urgent-invoices
    panel now derives from (list_urgent_invoices above is a thin
    wrapper over the identical repository.list_urgent_booking_ids this
    calls too). Returns one summary dict per urgent booking (not a
    real ORM model -- this is a computed cross-engine join): booking_id,
    booking_number (resolved from Booking Engine), currency, and the
    full latest note object -- enough for the frontend to run the same
    formatSingleNote() display logic InvoiceDetailModal already uses,
    rather than a pre-flattened description string. Most-recently-
    changed first.

    Decision 112: previously returned only latest.change_description/
    latest.created_at (a flattened summary) -- UrgentBookingsPanel
    displayed that raw string directly, a second, inconsistent display
    path for the same InvoiceReviewNote data InvoiceDetailModal already
    renders correctly via formatSingleNote's price/date-snapshot-aware
    English reconstruction. Returning the full note object (plus
    currency, needed by formatSingleNote to format money) lets both
    panels share the exact same client-side formatting code.
    """
    # Decision 204: a second reason to be in the queue -- the invoice was
    # returned by accounting. Added here only, NOT to list_urgent_booking_ids,
    # which also drives Invoices' own urgency and the "Mark as reviewed"
    # acknowledgment; a return is cleared by re-sending, not by marking.
    review_ids = repository.list_urgent_booking_ids(db)
    review_set = set(review_ids)
    returned = {inv.booking_id: inv for inv in repository.list_returned_invoices(db)}
    booking_ids = review_ids + [bid for bid in returned if bid not in review_set]
    result = []
    for booking_id in booking_ids:
        try:
            booking = booking_service.get_booking(db, booking_id)
        except ValueError:
            continue
        pending = booking_id in review_set
        latest = None
        if pending:
            notes = repository.list_review_notes_by_booking(db, booking_id)
            latest = notes[-1] if notes else None
        inv = returned.get(booking_id)
        result.append({
            "booking_id": booking_id,
            "booking_number": booking.booking_number,
            "currency": booking.currency,
            "latest_note": latest,
            "review_pending": pending,
            "invoice_returned_note": inv.return_note if inv else None,
            "invoice_returned_at": inv.returned_at if inv else None,
            "claimed_by": booking.claimed_by,
        })

    def newest(r: dict) -> datetime:
        stamps = [r["latest_note"].created_at if r["latest_note"] else None, r["invoice_returned_at"]]
        return max((s.replace(tzinfo=None) for s in stamps if s), default=datetime.min)

    result.sort(key=newest, reverse=True)
    return result


def list_invoices(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
    agent_id: int | None = None,
    booking_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
) -> list[Invoice]:
    """Decision 182: the Finance tab's invoice table, filtered/sorted/
    paginated on the server. Every row also carries the booking number,
    hotel name and agent name it refers to, so the list stops showing
    raw ids."""
    invoices = repository.list_invoices(
        db, skip=skip, limit=limit, status=status, agent_id=agent_id,
        booking_id=booking_id, search=search, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    return _attach_display_names_bulk(db, _attach_review_notes_bulk(db, invoices))


def count_invoices(
    db: Session,
    status: str | None = None,
    agent_id: int | None = None,
    booking_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> int:
    """Decision 182: how many match the SAME filters, ignoring pagination."""
    return repository.count_invoices(
        db, status=status, agent_id=agent_id, booking_id=booking_id, search=search,
        date_from=date_from, date_to=date_to,
    )


def list_invoices_by_agent(db: Session, agent_id: int) -> list[Invoice]:
    return _attach_display_names_bulk(
        db, _attach_review_notes_bulk(db, repository.list_invoices_by_agent(db, agent_id))
    )


def list_invoices_by_agent_in_range(db: Session, agent_id: int, start_date: date, end_date: date) -> list[Invoice]:
    return _attach_review_notes_bulk(
        db, repository.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)
    )


def list_urgent_invoices(db: Session) -> list[Invoice]:
    return _attach_display_names_bulk(db, _attach_review_notes_bulk(db, repository.list_urgent_invoices(db)))


def build_agent_invoice_export(db: Session, agent_id: int, start_date: date, end_date: date) -> bytes:
    """
    Decision 086: a real, downloadable .xlsx statement of "here's what
    was invoiced" for one agent over one period -- deliberately a
    separate, simpler mechanism from AgentStatement (Decision 077/078),
    which aggregates bookings into net/sale/profit rollups as a formal
    lockable document and has never had any frontend built for it. This
    is a raw, unaggregated list of real Invoice rows (filtered by
    issue_date, not booking dates -- an accounting-period export, not a
    travel calendar), matching what a real business document handed to
    an agent would show.

    Deliberately excludes any paid/unpaid or running-balance-owed
    tracking -- that requires Payment Engine (not yet started) to have
    any real payment data to reference. This is a clean statement of
    invoiced amounts, not a payment reconciliation.
    """
    invoices = repository.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)

    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"
    headers = [
        "Booking №", "Отель", "Заезд", "Выезд", "№ счёта", "Дата выставления",
        "Сумма", "Прибыль", "Валюта", "Статус",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for invoice in invoices:
        booking = booking_service.get_booking(db, invoice.booking_id)
        hotel = hotel_service.get_hotel(db, invoice.hotel_id)
        # Decision 101: same commission - discount formula as everywhere
        # else this session added Profit -- empty cell (not 0) when
        # either side is None, same NULL-vs-zero distinction the rest of
        # this Engine already carries.
        profit = (
            invoice.commission - invoice.discount
            if invoice.commission is not None and invoice.discount is not None
            else ""
        )
        ws.append([
            booking.booking_number,
            hotel.hotel_name,
            booking.arrival_date.isoformat(),
            booking.departure_date.isoformat(),
            invoice.invoice_number,
            invoice.issue_date.isoformat(),
            invoice.total,
            profit,
            invoice.currency,
            invoice.status,
        ])

    for column_cells in ws.columns:
        max_length = max(len(str(cell.value)) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = max_length + 2

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def void_invoice(db: Session, invoice_id: int, voided_by: int) -> Invoice:
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_not_void(invoice)
    updated = repository.update_invoice(
        db, invoice, status="Void", voided_by=voided_by, voided_at=datetime.utcnow()
    )
    return _attach_review_notes(db, updated)


def _ledger_room_financials(db: Session, room) -> dict:
    """
    Decision 202: one room's figures as its commercial breakdown now states
    them -- cost AND price, manual corrections included -- in exactly the
    shape compute_booking_financials returns, so the invoice columns and the
    frozen room lines keep their meaning.

    The project owner reversed half of Decision 178 for this step: the
    manager may correct the agent's price too, but the agent only ever sees
    the new figure on an invoice accounting has posted. Until then every
    agent-facing surface keeps the price they booked at (the frozen
    BookingRoom columns are never touched here).

    A room whose breakdown says exactly what the frozen columns say returns
    compute_booking_financials(room) itself, byte for byte -- an untouched
    booking is invoiced exactly as before, including the "not computed"
    profit of pre-Decision-069 rooms.

    How the ledger maps onto the invoice's columns (all identities kept:
    total = subtotal - discount + commission + tax, subtotal = room_net +
    transfer, profit = sale - net):
      transfer / tax      -> their own price lines
      room_sale           -> every other price line (room, meal, CIP,
                             excursion -- the invoice has no extras column)
      discount            -> the room's frozen exclusive discount
      commission          -> what is left, so the identity holds
    """
    original = compute_booking_financials(room)
    lines = get_or_seed_commercial_lines(db, room.id)
    if not lines:
        return original
    cost = {l.category: (l.base_cost or 0.0) + (l.adjustment_cost or 0.0) for l in lines}
    price = {l.category: (l.base_price or 0.0) + (l.adjustment_price or 0.0) for l in lines}
    net_total = sum(cost.values())
    sale_total = sum(price.values())

    def cents(value: float) -> int:
        return round(value * 100)

    if cents(net_total) == cents(original["net_total"]) and cents(sale_total) == cents(original["sale_total"]):
        return original

    transfer_price = price.get("transfer")
    tax_price = price.get("tax")
    tax_cost = cost.get("tax")
    room_sale = sale_total - (transfer_price or 0.0) - (tax_price or 0.0)
    room_net = net_total - (tax_cost or 0.0) - (transfer_price or 0.0)
    profit = sale_total - net_total
    discount = room.agent_exclusive_discount_amount
    commission = profit - ((tax_price or 0.0) - (tax_cost or 0.0)) + (discount or 0.0)
    return {
        "booking_id": original["booking_id"],
        "currency": original["currency"],
        "room_net": room_net,
        "room_sale": room_sale,
        "transfer_amount": transfer_price,
        "tax_amount": tax_price,
        "discount_amount": discount,
        "commission_amount": commission,
        "markup_computed": True,
        "subtotal": room_net + (transfer_price or 0.0),
        "net_total": net_total,
        "sale_total": sale_total,
        "profit": profit,
    }


def submit_invoice_for_posting(db: Session, booking_id: int, submitted_by: int) -> Invoice:
    """
    Decision 202: the reservations manager has checked the amounts and
    hands the invoice to accounting.

    Creates the invoice if the booking has none yet (the claim-time draft
    is best-effort and can be missing). Then re-freezes it from the
    commercial breakdown as it stands now -- the draft was frozen when the
    booking was claimed, before any correction -- and moves it Draft ->
    "Ready for posting". A hotel confirmation number is deliberately NOT
    required: the owner sometimes invoices urgently before the hotel
    replies.

    Nothing reaches the agent here. The invoice stays invisible to them
    (they only ever see an Issued one) until accounting posts it.
    """
    booking = booking_service.get_booking(db, booking_id)
    if booking.status in CANCELLED_BOOKING_STATUSES:
        raise ValueError(f"Cannot send an invoice to accounting for a booking with status '{booking.status}'")
    invoice = repository.get_invoice_by_booking(db, booking_id)
    if invoice is None:
        invoice = create_invoice_for_booking(db, booking_id, created_by=submitted_by)
    if invoice.status == "Ready for posting":
        raise ValueError(f"Invoice {invoice.invoice_number} has already been sent to accounting")
    validators.validate_invoice_draft(invoice)

    financials = compute_application_financials(
        db, booking, room_financials=lambda room: _ledger_room_financials(db, room)
    )
    repository.delete_invoice_room_lines(db, invoice.id)
    _write_invoice_room_lines(db, invoice.id, financials)
    updated = repository.update_invoice(
        db, invoice,
        currency=financials["currency"],
        subtotal=financials["subtotal"],
        discount=financials["discount_amount"],
        commission=financials["commission_amount"],
        tax=financials["tax_amount"],
        total=financials["sale_total"],
        status="Ready for posting",
        submitted_for_posting_by=submitted_by,
        submitted_for_posting_at=datetime.utcnow(),
    )
    return _attach_review_notes(db, updated)


def return_invoice_to_reservations(db: Session, invoice_id: int, note: str, returned_by: int) -> Invoice:
    """Decision 202: accounting hands a Ready-for-posting invoice back to
    the reservations manager (Ready for posting -> Draft) with a note.
    The amounts stay as they were sent; the next hand-over re-freezes
    them."""
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_ready_for_posting(invoice)
    validators.validate_reason(note)
    updated = repository.update_invoice(
        db, invoice,
        status="Draft",
        returned_by=returned_by,
        returned_at=datetime.utcnow(),
        return_note=note.strip(),
    )
    return _attach_review_notes(db, updated)


def approve_and_send_invoice(db: Session, invoice_id: int, approved_by: int) -> Invoice:
    """
    Decision 081 (Stage B): "Одобрить и отправить" -- the single
    accounting action that flips Draft -> Issued and emails the agent
    a plain-text summary (real PDF is Stage C, not built yet). Only
    valid from Draft (validators.validate_invoice_draft).

    Requires the invoice's agent to resolve to a real User with a real
    email -- sending is meaningless without one, so this is a hard
    ValueError here, unlike every other Finance Engine function, which
    (per Decision 078's known limitation) trusts agent_id/hotel_id
    without validating existence at all.

    Status flips to Issued regardless of whether the email actually
    sent -- matching every other email call site in this project
    (send_booking_confirmation_email, registration emails), where
    email is always best-effort and never blocks the real action.
    email_sent_at is set only when send_real_email genuinely returns
    True; with no SMTP configured anywhere in this project today, that
    means it stays NULL for every real invoice until real credentials
    exist -- an honest, visible signal, not a silent failure.

    Decision 085: approved_by/approved_at are set unconditionally (who
    and when this action happened, regardless of email/note state).
    flag_acknowledged_at/flag_acknowledged_by are set only if at least
    one review note existed -- the narrower "a flagged invoice was
    reviewed and approved anyway" signal the frontend uses to stop
    treating it as urgent, distinct from the unconditional approval
    record. Decision 089 added flag_acknowledged_by alongside the
    already-existing flag_acknowledged_at, for the same actor+timestamp
    pairing every other Finance Engine action already has
    (approved_by/approved_at, voided_by/voided_at) -- and so this path
    and acknowledge_review_flag's leave an identically-shaped audit
    trail regardless of which one dismissed the current urgent state.
    Decision 093: had_flag now checks review_notes (the new child table)
    instead of the retired review_flag column -- same meaning, new
    source.
    """
    invoice = get_invoice(db, invoice_id)
    # Decision 202: was validate_invoice_draft. Accounting now posts only
    # an invoice the reservations manager has sent over.
    validators.validate_invoice_ready_for_posting(invoice)
    had_flag = len(invoice.review_notes) > 0

    agent = db.query(User).filter(User.id == invoice.agent_id).first()
    if agent is None or not agent.email:
        raise ValueError(f"Agent {invoice.agent_id} has no resolvable email -- cannot send invoice")

    booking = booking_service.get_booking(db, invoice.booking_id)
    hotel = hotel_service.get_hotel(db, invoice.hotel_id)

    sent = email_service.send_invoice_email({
        "invoice_number": invoice.invoice_number,
        "hotel_name": hotel.hotel_name,
        "booking_number": booking.booking_number,
        "issue_date": invoice.issue_date,
        # Decision 203: agent-facing charge lines only -- no net, no commission.
        "lines": agent_invoice_lines(db, invoice),
        "total": f"{invoice.total:.2f}",
        "currency": invoice.currency,
        "agent_name": agent.name,
        "agent_email": agent.email,
    })

    now = datetime.utcnow()
    updated = repository.update_invoice(
        db, invoice,
        status="Issued",
        email_sent_at=now if sent else None,
        approved_by=approved_by,
        approved_at=now,
        flag_acknowledged_at=now if had_flag else None,
        flag_acknowledged_by=approved_by if had_flag else None,
    )
    return _attach_review_notes(db, updated)


# ---------------------------------------------------------------------------
# CreditNote
# ---------------------------------------------------------------------------

def _generate_credit_note_number() -> str:
    return f"CN-{uuid.uuid4().hex[:12].upper()}"


def create_credit_note(
    db: Session, invoice_id: int, amount: float, reason: str, created_by: int
) -> CreditNote:
    """A credit note always corrects an already-Issued Invoice -- can't
    be raised against a Draft (nothing issued yet) or Void (already
    nullified) one, and can't push total credited past the invoice's
    own total (validators.validate_credit_note_amount). reason is
    required at the call site (not just the schema) since these are
    always a manual, negotiated adjustment."""
    invoice = get_invoice(db, invoice_id)
    validators.validate_invoice_issued(invoice)
    existing_credit_notes = repository.list_credit_notes_by_invoice(db, invoice_id)
    validators.validate_credit_note_amount(invoice, existing_credit_notes, amount)
    validators.validate_reason(reason)

    return repository.create_credit_note(
        db,
        credit_note_number=_generate_credit_note_number(),
        invoice_id=invoice_id,
        amount=amount,
        currency=invoice.currency,
        reason=reason,
        issue_date=date.today(),
        status="Issued",
        created_by=created_by,
    )


def list_credit_notes_by_invoice(db: Session, invoice_id: int) -> list[CreditNote]:
    return repository.list_credit_notes_by_invoice(db, invoice_id)


# ---------------------------------------------------------------------------
# AgentStatement -- aggregation over a period, single-currency
# ---------------------------------------------------------------------------

def _generate_statement_number() -> str:
    return f"STMT-{uuid.uuid4().hex[:12].upper()}"


def generate_agent_statement(
    db: Session,
    agent_id: int,
    period_start: date,
    period_end: date,
    currency: str,
    generated_by: int,
) -> AgentStatement:
    """
    Aggregates every one of the agent's bookings whose created_at falls
    inside [period_start, period_end] and whose currency matches --
    created_at (when the charge was incurred), not arrival_date (when
    the stay happens), since a statement is an account of charges, not
    a travel calendar. Cancelled/Rejected bookings are excluded (no
    revenue realized, same allotment-release boundary Booking Engine
    itself treats as terminal).

    Produces status="Draft" -- unlike Invoice, a statement gets an
    explicit finalize_agent_statement step, since reviewing an agent's
    whole-period total before it's considered final is a real,
    distinct business action (an Invoice is definitionally already
    final at generation; a statement is a rollup a manager may want to
    check first).

    Empty periods (no matching bookings) are not an error -- a
    statement with zero totals is a valid, honest answer, not an
    exceptional one.

    validators.validate_no_overlapping_statement blocks generating a
    second statement for the same agent/currency whose period overlaps
    an existing one, Draft or Finalized -- prevents the same bookings
    silently being double-counted across two statements.
    """
    same_currency_statements = [
        s for s in repository.list_agent_statements_by_agent(db, agent_id) if s.currency == currency
    ]
    validators.validate_no_overlapping_statement(same_currency_statements, period_start, period_end)

    all_bookings = booking_service.list_bookings_by_agent(db, agent_id)
    eligible = [
        b for b in all_bookings
        if b.currency == currency
        and b.status not in CANCELLED_BOOKING_STATUSES
        and period_start <= b.created_at.date() <= period_end
    ]

    statement = repository.create_agent_statement(
        db,
        statement_number=_generate_statement_number(),
        agent_id=agent_id,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        total_net=0,
        total_sale=0,
        total_profit=0,
        status="Draft",
        generated_by=generated_by,
    )

    total_net = 0.0
    total_sale = 0.0
    total_profit = 0.0
    for booking in eligible:
        financials = compute_booking_financials(booking)
        invoice = repository.get_invoice_by_booking(db, booking.id)
        repository.create_statement_line(
            db,
            statement_id=statement.id,
            booking_id=booking.id,
            invoice_id=invoice.id if invoice else None,
            net_amount=financials["net_total"],
            sale_amount=financials["sale_total"],
            profit_amount=financials["profit"],
        )
        total_net += financials["net_total"]
        total_sale += financials["sale_total"]
        # A pre-Decision-069 booking's real profit contribution is a
        # true $0 (no markup was ever layered on), not missing data --
        # unlike the per-line profit_amount above, the aggregate can
        # safely treat None as 0 here.
        total_profit += financials["profit"] or 0.0

    return repository.update_agent_statement(
        db, statement, total_net=total_net, total_sale=total_sale, total_profit=total_profit
    )


def get_agent_statement(db: Session, statement_id: int) -> AgentStatement:
    statement = repository.get_agent_statement(db, statement_id)
    if statement is None:
        raise ValueError(f"Agent statement {statement_id} not found")
    return statement


def list_statement_lines(db: Session, statement_id: int) -> list:
    return repository.list_statement_lines(db, statement_id)


def finalize_agent_statement(db: Session, statement_id: int) -> AgentStatement:
    statement = get_agent_statement(db, statement_id)
    validators.validate_statement_not_finalized(statement)
    return repository.update_agent_statement(db, statement, status="Finalized")


# ---------------------------------------------------------------------------
# HotelCashbackArrangement / HotelCashbackFulfillment -- Decision 009
# ---------------------------------------------------------------------------

def create_cashback_arrangement(
    db: Session,
    hotel_id: int,
    terms: str,
    currency: str,
    start_date_value: date,
    created_by: int,
    rebate_percentage: float | None = None,
    volume_threshold: float | None = None,
    end_date_value: date | None = None,
) -> HotelCashbackArrangement:
    """Deliberately not an automatic formula -- per Decision 009, these
    are negotiated per-hotel and recorded manually as agreed. terms
    (free text) is the actual source of truth; rebate_percentage/
    volume_threshold are a convenience for the common shape, not
    required."""
    validators.validate_cashback_arrangement_fields(
        terms, rebate_percentage, start_date_value, end_date_value
    )

    return repository.create_cashback_arrangement(
        db,
        hotel_id=hotel_id,
        terms=terms,
        rebate_percentage=rebate_percentage,
        volume_threshold=volume_threshold,
        currency=currency,
        start_date=start_date_value,
        end_date=end_date_value,
        status="Active",
        created_by=created_by,
    )


def list_cashback_arrangements_by_hotel(db: Session, hotel_id: int) -> list[HotelCashbackArrangement]:
    return repository.list_cashback_arrangements_by_hotel(db, hotel_id)


def update_cashback_arrangement_status(db: Session, arrangement_id: int, status: str) -> HotelCashbackArrangement:
    arrangement = repository.get_cashback_arrangement(db, arrangement_id)
    if arrangement is None:
        raise ValueError(f"Cashback arrangement {arrangement_id} not found")
    validators.validate_cashback_status(status)
    return repository.update_cashback_arrangement(db, arrangement, status=status)


def record_cashback_fulfillment(
    db: Session,
    arrangement_id: int,
    fulfillment_date: date,
    amount: float,
    recorded_by: int,
    cumulative_sales_volume_at_time: float | None = None,
    notes: str | None = None,
) -> HotelCashbackFulfillment:
    arrangement = repository.get_cashback_arrangement(db, arrangement_id)
    if arrangement is None:
        raise ValueError(f"Cashback arrangement {arrangement_id} not found")
    validators.validate_fulfillment_amount(amount)

    return repository.create_cashback_fulfillment(
        db,
        arrangement_id=arrangement_id,
        fulfillment_date=fulfillment_date,
        amount=amount,
        cumulative_sales_volume_at_time=cumulative_sales_volume_at_time,
        notes=notes,
        recorded_by=recorded_by,
    )


def list_cashback_fulfillments(db: Session, arrangement_id: int) -> list[HotelCashbackFulfillment]:
    return repository.list_cashback_fulfillments(db, arrangement_id)


# ---------------------------------------------------------------------------
# Voucher -- Decision 097
# ---------------------------------------------------------------------------

def create_and_send_voucher(db: Session, booking_id: int, created_by: int) -> Voucher:
    """
    Decision 097: called via frontend orchestration from Reservations.tsx's
    confirmation-number editor, immediately after PUT .../bookings/{id}
    saves a new non-empty confirmation_number -- same shape as Decision
    080's claim-auto-invoice and Decision 083's date-change-flag, for the
    same reason (avoids a circular import: this module already imports
    booking_service, so Booking Engine calling back into Finance Engine
    at module level would break at import time; also keeps LOCKED
    Booking Engine's own code completely untouched by this feature).

    Unlike those two best-effort orchestration calls, this one DOES
    raise on failure (mirrors approve_and_send_invoice's own hard-fail
    for an unresolvable agent email) -- a voucher silently failing to
    generate would leave a manager believing the guest has their
    confirmation document when they don't, a worse outcome than a
    visible error the frontend can surface.

    Requires booking.confirmation_number to already be set (raises
    otherwise) -- the confirmation number IS the voucher's whole reason
    to exist; generating one without it would be meaningless. Requires
    the agent to resolve to a real User with a real email, same
    "sending is meaningless without one" reasoning approve_and_send_
    invoice already established.

    Every field is resolved fresh from live Booking/Hotel/Contract
    Engine data (read-only cross-engine calls, same pattern as every
    other Finance Engine function) and frozen onto the Voucher row at
    creation -- deliberately no pricing/discount/commission fields
    anywhere in this payload or the model itself; this is the
    guest-facing document, Invoice is the financial one.

    email_sent_at is computed BEFORE the row is created (not created
    then updated) -- Voucher has no Draft-then-Issued staged lifecycle
    like Invoice does, so there's no reason to insert first and patch
    the send outcome in afterward. Same "email is always best-effort,
    never blocks the real action" contract as every other email call
    site in this project: send_real_email never raises, and with no
    SMTP configured anywhere in this project today, email_sent_at stays
    NULL for every real voucher, same honest signal Invoice's own
    field already gives.
    """
    booking = booking_service.get_booking(db, booking_id)
    if not booking.confirmation_number:
        raise ValueError(f"Booking {booking_id} has no confirmation_number -- nothing to generate a voucher for")

    agent = db.query(User).filter(User.id == booking.agent_id).first()
    if agent is None or not agent.email:
        raise ValueError(f"Agent {booking.agent_id} has no resolvable email -- cannot send voucher")

    hotel = hotel_service.get_hotel(db, booking.hotel_id)
    room_type = hotel_service.get_room_type(db, booking.room_type_id)
    meal_plan = contract_service.get_contract_meal_plan(db, booking.meal_plan_id)
    guests = booking_service.list_guests(db, booking_id)
    guest_names = ", ".join(f"{g.first_name} {g.last_name}" for g in guests) or None

    sent = email_service.send_voucher_email({
        "confirmation_number": booking.confirmation_number,
        "hotel_name": hotel.hotel_name,
        "booking_number": booking.booking_number,
        "arrival_date": booking.arrival_date,
        "departure_date": booking.departure_date,
        "room_type_name": room_type.room_name,
        "meal_plan_label": meal_plan.meal_name or meal_plan.meal_code,
        "guest_names": guest_names,
        "adults": booking.adults,
        "children": booking.children,
        "infants": booking.infants,
        "agent_name": agent.name,
        "agent_email": agent.email,
    })

    return repository.create_voucher(
        db,
        booking_id=booking.id,
        agent_id=booking.agent_id,
        hotel_id=booking.hotel_id,
        confirmation_number=booking.confirmation_number,
        hotel_name=hotel.hotel_name,
        arrival_date=booking.arrival_date,
        departure_date=booking.departure_date,
        room_type_name=room_type.room_name,
        meal_plan_label=meal_plan.meal_name or meal_plan.meal_code,
        guest_names=guest_names,
        adults=booking.adults,
        children=booking.children,
        infants=booking.infants,
        created_by=created_by,
        email_sent_at=datetime.utcnow() if sent else None,
    )


def create_and_send_voucher_for_room(db: Session, booking_room_id: int, created_by: int) -> Voucher:
    """
    Stage 4 (multi-room booking applications): the per-room counterpart
    to create_and_send_voucher above, which stays completely untouched
    for legacy single-room bookings. Confirmed directly with the project
    owner (2026-07-27): a voucher is issued separately per room, since
    different rooms in the same application can have entirely different
    guests, room types, meal plans -- resolved here from BookingRoom
    (own hotel_id/room_type_id/meal_plan_id/dates) and
    list_guests_for_room (only the guests actually assigned to THIS
    room, via BookingRoomGuest -- never the whole application's guest
    list). Same trigger shape as the original: requires
    BookingRoom.confirmation_number to already be set.
    """
    room = booking_service.get_booking_room(db, booking_room_id)
    # Decision 166: the confirmation number is no longer required. It was,
    # on the reasoning that it IS the voucher's whole reason to exist -- but
    # the project owner has decided a manager may also send the voucher at
    # the moment they approve a room, which is necessarily before the hotel
    # has replied. Nothing is faked in its place: the document says
    # "awaiting hotel confirmation" (see build_voucher_download_text), and
    # the manager is told this in the approve confirmation dialog before
    # anything is sent, so it is a decision taken knowingly rather than a
    # missing field discovered later by a guest at a check-in desk.
    booking = booking_service.get_booking(db, room.booking_id)
    agent = db.query(User).filter(User.id == booking.agent_id).first()
    if agent is None or not agent.email:
        raise ValueError(f"Agent {booking.agent_id} has no resolvable email -- cannot send voucher")

    hotel = hotel_service.get_hotel(db, room.hotel_id)
    room_type = hotel_service.get_room_type(db, room.room_type_id)
    meal_plan = contract_service.get_contract_meal_plan(db, room.meal_plan_id) if room.meal_plan_id else None
    guests = booking_service.list_guests_for_room(db, room.id)
    guest_names = ", ".join(f"{g.first_name} {g.last_name}" for g in guests) or None

    sent = email_service.send_voucher_email({
        "confirmation_number": room.confirmation_number,
        "hotel_name": hotel.hotel_name,
        "booking_number": booking.booking_number,
        "arrival_date": room.arrival_date,
        "departure_date": room.departure_date,
        "room_type_name": room_type.room_name,
        "meal_plan_label": (meal_plan.meal_name or meal_plan.meal_code) if meal_plan else None,
        "guest_names": guest_names,
        "adults": room.adults,
        "children": room.children,
        "infants": room.infants,
        "agent_name": agent.name,
        "agent_email": agent.email,
    })

    return repository.create_voucher(
        db,
        booking_id=booking.id,
        booking_room_id=room.id,
        agent_id=booking.agent_id,
        hotel_id=room.hotel_id,
        confirmation_number=room.confirmation_number,
        hotel_name=hotel.hotel_name,
        arrival_date=room.arrival_date,
        departure_date=room.departure_date,
        room_type_name=room_type.room_name,
        meal_plan_label=(meal_plan.meal_name or meal_plan.meal_code) if meal_plan else None,
        guest_names=guest_names,
        adults=room.adults,
        children=room.children,
        infants=room.infants,
        created_by=created_by,
        email_sent_at=datetime.utcnow() if sent else None,
    )


def get_latest_voucher_for_room(db: Session, booking_room_id: int) -> Voucher:
    """Stage 4: same append-only "most recent wins" resolution as get_latest_voucher, scoped to one room."""
    vouchers = repository.list_vouchers_by_room(db, booking_room_id)
    if not vouchers:
        raise ValueError(f"Booking room {booking_room_id} has no voucher yet")
    return vouchers[-1]


def get_invoice_status(db: Session, booking_id: int) -> str | None:
    """
    Decision 102: the ONLY invoice-related data an agent's own view is
    ever allowed to receive over the network for their own booking --
    literally just the status string, never subtotal/discount/
    commission/tax/total. Returning None (not raising) when no invoice
    exists at all is deliberate: the caller (BookingDetail's
    "В работе" vs download-link decision) treats "no invoice yet" and
    "Draft" identically anyway, so this stays a plain lookup, not
    another ValueError-to-400 case.
    """
    invoice = repository.get_invoice_by_booking(db, booking_id)
    return invoice.status if invoice is not None else None


def get_latest_voucher(db: Session, booking_id: int) -> Voucher:
    """
    Decision 102: Voucher is deliberately append-only (Decision 097 --
    not "one per booking"), so a booking's confirmation_number being
    corrected later produces a NEW row, not an update to the old one.
    "The voucher" for download purposes is always the most recent one.
    """
    vouchers = repository.list_vouchers_by_booking(db, booking_id)
    if not vouchers:
        raise ValueError(f"Booking {booking_id} has no voucher yet")
    return vouchers[-1]


def build_voucher_download_text(voucher: Voucher) -> str:
    """Decision 102: same guest-facing-only content shape as
    send_voucher_email's own table -- zero pricing/discount/commission
    fields, reused verbatim as a real downloadable .txt rather than
    only ever existing as an email body."""
    lines = [
        f"ВАУЧЕР {voucher.voucher_number}",
        "",
        f"Отель: {voucher.hotel_name}",
        # Decision 166: a voucher sent at approval time has no hotel
        # reference yet. Say so plainly rather than printing an empty field
        # a guest would read as a system error.
        f"Номер подтверждения отеля: {voucher.confirmation_number or 'ожидается подтверждение отеля'}",
        f"Заезд: {voucher.arrival_date.isoformat()}",
        f"Выезд: {voucher.departure_date.isoformat()}",
        f"Тип номера: {voucher.room_type_name}",
        f"План питания: {voucher.meal_plan_label or '—'}",
        f"Гости: {voucher.guest_names or '—'}",
        f"Взрослые / Дети / Младенцы: {voucher.adults} / {voucher.children} / {voucher.infants}",
        "",
        "Этот документ подтверждает бронирование для гостя.",
    ]
    return "\n".join(lines)


def _money(value: float, currency: str) -> str:
    return f"{value:.2f} {currency}"


def agent_invoice_lines(db: Session, invoice: Invoice) -> list[tuple[str, str]]:
    """
    Decision 203: the charge lines an agent may see on their own invoice --
    what they pay for, never what it costs us.

    The invoice's own subtotal/discount/commission columns are an internal
    decomposition: subtotal is our NET cost and commission is our MARGIN.
    Both used to be printed on the agent's download and email ("Сумма номера
    (нетто)", "Комиссия"), handing every agent our buying price and our
    mark-up. Owner, 2026-10-14: remove them. The exclusive-agent discount
    is not printed either -- it is already inside the room price, so a
    separate "Скидка" line beside it would read as a second reduction.

    Built from the invoice's frozen per-room lines (room price, transfer,
    tax -- they sum to the room's sale total by construction). An invoice
    that predates those lines falls back to total-minus-tax, which is the
    same agent-facing figure without the split. Every figure is the agent's
    price; the lines always add up to invoice.total.
    """
    currency = invoice.currency
    room_lines = repository.list_invoice_room_lines(db, invoice.id)
    rows: list[tuple[str, str]] = []
    if room_lines:
        many = len(room_lines) > 1
        for line in room_lines:
            prefix = f"Номер {line.sequence_number}" if many else ""
            label = (lambda name: f"{prefix} — {name}" if many else name)
            if many and line.guest_names:
                rows.append((prefix, line.guest_names))
            rows.append((label("Проживание"), _money(line.room_sale, currency)))
            if line.transfer_amount:
                rows.append((label("Трансфер"), _money(line.transfer_amount, currency)))
            if line.tax_amount:
                rows.append((label("Налог"), _money(line.tax_amount, currency)))
    else:
        tax = invoice.tax or 0.0
        rows.append(("Проживание и услуги", _money(invoice.total - tax, currency)))
        if tax:
            rows.append(("Налог", _money(tax, currency)))
    return rows


def build_invoice_download_text(db: Session, invoice: Invoice) -> str:
    """
    Decision 102: only ever reachable for a status=="Issued" invoice
    (the caller/endpoint enforces this, matching the existing Draft-
    invisibility principle -- Draft content is never exposed to an
    agent through any path). Decision 203: charge lines come from
    agent_invoice_lines -- no net cost, no commission.
    """
    booking = booking_service.get_booking(db, invoice.booking_id)
    hotel = hotel_service.get_hotel(db, invoice.hotel_id)
    lines = [
        f"СЧЁТ {invoice.invoice_number}",
        "",
        f"Отель: {hotel.hotel_name}",
        f"Бронирование: {booking.booking_number}",
        f"Дата выставления: {invoice.issue_date.isoformat()}",
        "",
    ]
    lines += [f"{label}: {value}" for label, value in agent_invoice_lines(db, invoice)]
    lines += ["", f"ИТОГО К ОПЛАТЕ: {_money(invoice.total, invoice.currency)}"]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# BookingCommercialLine -- per-room, per-category cost/price ledger with a
# manual adjustment mechanism (see the model's own docstring for the full
# rationale: only Room ever had a cost/price split before this; Transfer/
# Tax were pass-through; Meal/CIP/Excursion didn't exist at all).
# ---------------------------------------------------------------------------

# Fixed display/seed order. "room"/"transfer"/"tax" are auto-seeded from
# BookingRoom's own frozen columns; "meal"/"cip"/"excursion" have no
# system-computed source anywhere in this project, so they start absent
# (never seeded) until a manager enters one manually via upsert_commercial_line.
SEEDED_CATEGORIES = ("room", "transfer", "tax")
ALL_CATEGORIES = ("room", "transfer", "meal", "tax", "cip", "excursion")


def derive_seed_lines(room) -> list[tuple[str, float, float]]:
    """
    The (category, cost, price) triples room/transfer/tax would be seeded
    with, derived purely from BookingRoom's own frozen columns. Returns
    them; writes nothing.

    Extracted so there is exactly ONE definition of this arithmetic.
    get_or_seed_commercial_lines persists it; get_booking_commercial_summary
    reads it without persisting, for a room a manager has never opened. Two
    copies of the formula would let the summary quietly disagree with the
    breakdown table it is supposed to be explaining -- which is the whole
    point of the summary.

    A category whose source column is NULL is omitted entirely (not
    emitted as 0.0), keeping "no transfer on this booking" distinguishable
    from "a transfer that costs nothing".
    """
    triples: list[tuple[str, float, float]] = []
    if room.total_amount is not None:
        markup = room.agent_markup_amount or 0.0
        discount = room.agent_exclusive_discount_amount or 0.0
        triples.append(("room", room.total_amount - markup + discount, room.total_amount))
    if room.transfer_total is not None:
        triples.append(("transfer", room.transfer_total, room.transfer_total))
    if room.mandatory_tax_total is not None:
        triples.append(("tax", room.mandatory_tax_total, room.mandatory_tax_total))
    return triples


def get_booking_commercial_summary(db: Session, booking_id: int) -> dict:
    """
    Read-only, whole-application view of the same money the per-room
    Commercial breakdown table shows: every room, every category, plus the
    grand total the agent actually booked at.

    Exists because the Rooms block showed only BookingRoom.total_amount --
    the ROOM line alone, excluding transfer and mandatory tax. On a real
    two-room booking that read "1466.50" and "3927.00" while the agent had
    in fact booked at 6700.50, with no total anywhere on the screen.

    **Writes nothing, deliberately.** The per-room GET auto-seeds, which is
    correct when a manager opens one room's ledger, but a summary rendered
    for every room of every booking that gets opened must not leave seed
    rows behind for rooms nobody has looked at -- the same rule
    compute_bookings_list_financials already follows. Where a room has no
    persisted lines yet, its figures come from derive_seed_lines, so the
    number shown is exactly the number seeding would have produced.

    Rooms are all returned, including non-billable (Rejected/Cancelled)
    ones so a manager can still see what they cost, but only billable rooms
    count toward the totals -- same _NON_BILLABLE_ROOM_STATUSES convention
    compute_application_financials uses.
    """
    booking = booking_service.get_booking(db, booking_id)
    rooms = booking_service.list_booking_rooms(db, booking_id)
    lines_by_room: dict[int, list[BookingCommercialLine]] = {}
    for line in repository.list_commercial_lines_bulk(db, [r.id for r in rooms]):
        lines_by_room.setdefault(line.booking_room_id, []).append(line)

    # Decision 191: ONE hotel confirmation for the whole application -- the
    # hotel bills it once, in one email, whatever it contains.
    confirmation = repository.get_hotel_confirmation(db, booking_id)

    room_entries = []
    net_total = 0.0
    sale_total = 0.0
    ledger_sale_total = 0.0
    has_manual_adjustment = False

    for room in rooms:
        persisted = lines_by_room.get(room.id, [])
        # Decision 178: the PRICE side is always the frozen, agent-facing
        # figure -- what they saw at booking, transfer included -- never the
        # ledger's editable price. The ledger governs cost only. Without
        # this, a manual correction re-priced the agent: BK-000080 read
        # 6700.50 to the agent and 9273.50 here, and the "Booked by the
        # agent at" line was quoting the second number.
        seed_price = {category: price for category, _cost, price in derive_seed_lines(room)}
        if persisted:
            entries = [
                {
                    "category": line.category,
                    "cost": (line.base_cost or 0.0) + (line.adjustment_cost or 0.0),
                    # A category with no frozen source (meal/cip/excursion --
                    # entered by hand, never part of the quoted price) has no
                    # agent-facing price at all, which is a real 0.0, not a
                    # missing number.
                    "price": seed_price.get(line.category, 0.0),
                    "adjusted": line.adjusted_by is not None,
                }
                for line in persisted
            ]
            if any(entry["adjusted"] for entry in entries):
                has_manual_adjustment = True
        else:
            entries = [
                {"category": category, "cost": cost, "price": price, "adjusted": False}
                for category, cost, price in derive_seed_lines(room)
            ]

        # Fixed display order, so the tooltip and the breakdown table below
        # it never list the same categories in a different sequence.
        entries.sort(key=lambda e: ALL_CATEGORIES.index(e["category"]))
        room_net = sum(e["cost"] for e in entries)
        # Summed from the frozen columns directly rather than from the
        # entries, so a room whose ledger is missing a seeded category still
        # reports the full price the agent was quoted.
        room_sale = compute_booking_financials(room)["sale_total"]
        # Decision 202: the price the breakdown itself states, corrections
        # included -- what the invoice will carry once it is handed over.
        room_ledger_sale = (
            sum((line.base_price or 0.0) + (line.adjustment_price or 0.0) for line in persisted)
            if persisted
            else room_sale
        )
        billable = room.status not in _NON_BILLABLE_ROOM_STATUSES
        if billable:
            net_total += room_net
            sale_total += room_sale
            ledger_sale_total += room_ledger_sale

        room_entries.append(
            {
                "booking_room_id": room.id,
                "sequence_number": room.sequence_number,
                "room_type_id": room.room_type_id,
                "status": room.status,
                "billable": billable,
                "lines": entries,
                "net_total": room_net,
                "sale_total": room_sale,
            }
        )

    return {
        "booking_id": booking.id,
        "currency": booking.currency,
        "rooms": room_entries,
        "net_total": net_total,
        "sale_total": sale_total,
        "ledger_sale_total": ledger_sale_total,
        "has_manual_adjustment": has_manual_adjustment,
        # Decision 191: the hotel's single figure for the whole application,
        # and the gap against our own incoming total. Computed here so every
        # surface reading this endpoint gets the same number.
        "hotel_confirmed_amount": confirmation.confirmed_amount if confirmation else None,
        "hotel_reference": confirmation.hotel_reference if confirmation else None,
        "hotel_note": confirmation.note if confirmation else None,
        "hotel_confirmed_by": confirmation.confirmed_by if confirmation else None,
        "hotel_confirmed_at": confirmation.confirmed_at if confirmation else None,
        "hotel_difference": (confirmation.confirmed_amount - net_total) if confirmation else None,
        "billable_rooms": sum(1 for e in room_entries if e["billable"]),
    }


def get_booking_price_breakdown(db: Session, booking_id: int) -> dict:
    """
    Decision 181: the agent-facing counterpart of
    get_booking_commercial_summary -- the same per-room, per-category
    shape with **the cost side removed entirely**.

    Not a filtered view of the admin payload: it is built separately and
    returns fields that do not exist there (`price` only, no `cost`, no
    margin, no `adjusted` flag), so our cost, our margin and the fact
    that a manager corrected something never reach an agent's browser at
    all -- not even unrendered. Same principle as Decision 102's
    invoice-status endpoint, which returns only a status string.

    Every figure here is the frozen, agent-facing price -- what she saw
    when booking, transfer and mandatory tax included (Decision 178).
    Non-billable rooms are listed (she can see a room was declined) but
    contribute nothing to the total.
    """
    booking = booking_service.get_booking(db, booking_id)
    rooms = booking_service.list_booking_rooms(db, booking_id)
    # A legacy application with no BookingRoom rows at all (one such booking
    # exists in this database) is priced from its own frozen columns, exactly
    # as booking_service.attach_application_totals does. Without this the
    # loop below simply had nothing to iterate and reported 0.00 for a
    # booking the agent is billed 1545.00 for -- caught by the reconciliation
    # check, not by reading the code.
    if not rooms:
        rooms = [booking]

    room_entries = []
    total = 0.0
    for room in rooms:
        lines = [
            {"category": category, "price": price}
            for category, _cost, price in derive_seed_lines(room)
        ]
        lines.sort(key=lambda e: ALL_CATEGORIES.index(e["category"]))
        billable = room.status not in _NON_BILLABLE_ROOM_STATUSES
        room_total = compute_booking_financials(room)["sale_total"]
        if billable:
            total += room_total
        room_entries.append(
            {
                "booking_room_id": room.id,
                # A legacy booking standing in for its own single room has no
                # sequence_number of its own -- it IS room 1.
                "sequence_number": getattr(room, "sequence_number", 1),
                "room_type_id": room.room_type_id,
                "status": room.status,
                "billable": billable,
                "lines": lines,
                "total": room_total,
            }
        )

    return {
        "booking_id": booking.id,
        "currency": booking.currency,
        "rooms": room_entries,
        "total": total,
    }


def get_or_seed_commercial_lines(db: Session, booking_room_id: int) -> list[BookingCommercialLine]:
    """
    Idempotent: seeds room/transfer/tax exactly once per booking_room_id
    (checked by category, not by "any row exists" -- a room that already
    has a manually-added "meal" line but was never opened through this
    function before still gets its room/transfer/tax rows seeded, not
    skipped). After the first seed, edits are the source of truth for
    those 3 categories too -- this function never overwrites an existing
    row on a later call.

    Raises ValueError (via booking_service.get_booking_room) if the room
    doesn't exist -- same "let the caller's 400 mapping handle it" pattern
    every other Engine uses.
    """
    room = booking_service.get_booking_room(db, booking_room_id)
    existing = repository.list_commercial_lines(db, booking_room_id)
    existing_categories = {line.category for line in existing}

    # Same triples get_booking_commercial_summary reads without persisting --
    # one definition of the arithmetic, so the two can never disagree.
    for category, base_cost, base_price in derive_seed_lines(room):
        if category in existing_categories:
            continue
        existing.append(
            repository.create_commercial_line(
                db,
                booking_room_id=booking_room_id,
                category=category,
                base_cost=base_cost,
                base_price=base_price,
            )
        )

    return existing


def upsert_commercial_line(
    db: Session,
    booking_room_id: int,
    category: str,
    base_cost: float | None = None,
    base_price: float | None = None,
    adjustment_cost: float | None = None,
    adjustment_price: float | None = None,
    note: str | None = None,
    user_id: int | None = None,
) -> BookingCommercialLine:
    """
    Create-or-update, same upsert precedent as Hotel Engine's
    set_room_availability_status. Only the fields the caller actually
    provided are changed -- omitted (None) fields keep their prior
    value, so e.g. recording an adjustment doesn't require re-sending
    base_cost/base_price every time. adjusted_by/adjusted_at are
    stamped whenever ANY field on this call actually changes something,
    covering both "correcting a base figure" (meal/cip/excursion) and
    "recording an adjustment" (any category) under one audit trail.
    """
    if category not in ALL_CATEGORIES:
        raise ValueError(f"Unknown commercial line category: {category}")

    # Confirms the room exists -- same "let ValueError surface as 400"
    # pattern as get_or_seed_commercial_lines.
    booking_service.get_booking_room(db, booking_room_id)

    line = repository.get_commercial_line(db, booking_room_id, category)
    fields: dict = {}
    if base_cost is not None:
        fields["base_cost"] = base_cost
    if base_price is not None:
        fields["base_price"] = base_price
    if adjustment_cost is not None:
        fields["adjustment_cost"] = adjustment_cost
    if adjustment_price is not None:
        fields["adjustment_price"] = adjustment_price
    if note is not None:
        fields["adjustment_note"] = note

    if fields:
        fields["adjusted_by"] = user_id
        fields["adjusted_at"] = datetime.utcnow()

    if line is None:
        return repository.create_commercial_line(
            db, booking_room_id=booking_room_id, category=category, **fields
        )
    if fields:
        return repository.update_commercial_line(db, line, **fields)
    return line


def compute_booking_room_commercial_totals(lines: list[BookingCommercialLine], room=None) -> dict:
    """
    Decision 178: **cost comes from the commercial ledger, the sale price
    never does.**

    The sale price is what the agent saw and booked at, frozen on the
    BookingRoom's own columns. A manual correction in the admin panel is
    an internal fact about what something cost us -- it must not change
    what the agent is billed. Project owner, verbatim: *"мы скидку не
    даём агенту... если сумма вручную уменьшается в админ панели, это
    только для нас, агент получит invoice сумму, которую видел во время
    бронирования, с трансфером"*.

    This function used to sum (base_price + adjustment_price) across the
    lines, so editing a price silently re-priced the agent. Measured on
    real data: 3 of the 14 most recent bookings had drifted, BK-000077 by
    3442.00 -> 10546.00, and the Bookings list, the "Booked by the agent
    at" line and the invoice were showing three different numbers for the
    same booking.

    `room` is optional only so the one legacy caller with no room in hand
    keeps working; without it the frozen figure cannot be read and the
    ledger's own price side is used as before.
    """
    net_total = sum((line.base_cost or 0.0) + (line.adjustment_cost or 0.0) for line in lines)
    if room is not None:
        sale_total = compute_booking_financials(room)["sale_total"]
    else:
        sale_total = sum((line.base_price or 0.0) + (line.adjustment_price or 0.0) for line in lines)
    return {
        "net_total": net_total,
        "sale_total": sale_total,
        "profit": sale_total - net_total,
    }


def compute_bookings_list_financials(db: Session, booking_ids: list[int]) -> dict[int, dict]:
    """
    Bulk, read-only equivalent of what BookingDetail's own header already
    shows per room -- "live, commercial-line-aware if a manual correction
    exists there, otherwise the frozen Pricing-Engine snapshot"
    (compute_booking_room_commercial_totals's own docstring). Built
    because the Bookings LIST's Net/Profit column and its "Total profit"
    summary strip were both still calling compute_booking_financials
    directly and had no way to know a room's commercial-line ledger had
    ever been edited -- a real, reported bug: editing a room's cost in
    BookingDetail (BK-000066) showed correctly there, but the list kept
    showing the original, pre-edit profit, since upsert_commercial_line
    only ever writes BookingCommercialLine, never Booking/BookingRoom's
    own frozen total_amount columns.

    Exactly two bulk queries total regardless of list size (rooms, then
    their commercial lines) -- never one query per booking or per room.
    Deliberately reads existing commercial-line rows only
    (repository.list_commercial_lines_bulk), never
    get_or_seed_commercial_lines' auto-seeding GET -- rendering a list
    must never have the side effect of writing seed rows for rooms
    nobody has actually opened.

    Returns one entry per booking_id that has at least one BookingRoom
    row (true for every booking created since Stage 2's migration). A
    booking_id absent from the result has no BookingRoom rows at all;
    the caller falls back to its own already-loaded Booking object with
    compute_booking_financials, exactly the pre-existing behavior.
    """
    if not booking_ids:
        return {}

    rooms = booking_service.list_booking_rooms_bulk(db, booking_ids)
    rooms_by_booking: dict[int, list] = {}
    for room in rooms:
        rooms_by_booking.setdefault(room.booking_id, []).append(room)

    room_ids = [r.id for r in rooms]
    lines = repository.list_commercial_lines_bulk(db, room_ids)
    lines_by_room: dict[int, list[BookingCommercialLine]] = {}
    for line in lines:
        lines_by_room.setdefault(line.booking_room_id, []).append(line)

    result: dict[int, dict] = {}
    for booking_id, booking_rooms in rooms_by_booking.items():
        billable = [r for r in booking_rooms if r.status not in _NON_BILLABLE_ROOM_STATUSES]
        if not billable:
            # Every room was rejected/cancelled -- same "nothing owed"
            # convention compute_application_financials already uses.
            result[booking_id] = {
                "booking_id": booking_id,
                "currency": booking_rooms[0].currency,
                "net_total": 0.0,
                "sale_total": 0.0,
                "profit": 0.0,
                "has_manual_adjustment": False,
            }
            continue

        net_total = 0.0
        sale_total = 0.0
        profit_sum = 0.0
        profit_known = True
        has_manual_adjustment = False

        for room in billable:
            room_lines = lines_by_room.get(room.id, [])
            if room_lines:
                # Decision 178: `room` passed, so the sale side comes from
                # the frozen columns and only the cost side reads the ledger.
                totals = compute_booking_room_commercial_totals(room_lines, room)
                net_total += totals["net_total"]
                sale_total += totals["sale_total"]
                profit_sum += totals["profit"]
                # adjusted_by is the universal "this line was manually
                # touched" signal (upsert_commercial_line stamps it on ANY
                # field change, whether correcting base_cost/base_price
                # directly or recording an adjustment_cost/adjustment_price
                # delta on top) -- checking only the adjustment_* columns
                # would miss a direct base-figure correction like the one
                # that surfaced this whole bug on BK-000066.
                if any(line.adjusted_by is not None for line in room_lines):
                    has_manual_adjustment = True
            else:
                fin = compute_booking_financials(room)
                net_total += fin["net_total"]
                sale_total += fin["sale_total"]
                if fin["profit"] is None:
                    profit_known = False
                else:
                    profit_sum += fin["profit"]

        result[booking_id] = {
            "booking_id": booking_id,
            "currency": billable[0].currency,
            "net_total": net_total,
            "sale_total": sale_total,
            "profit": profit_sum if profit_known else None,
            "has_manual_adjustment": has_manual_adjustment,
        }

    return result


def set_hotel_price_confirmation(
    db: Session,
    booking_id: int,
    confirmed_amount: float,
    hotel_reference,
    note,
    user_id: int,
):
    """
    Decision 191: record what the hotel says this BOOKING costs us -- one
    figure for the whole application, matching the one email the hotel
    actually sends.

    Validates the booking exists (same "let ValueError surface as 400"
    pattern every other function here uses) and takes the currency from the
    booking itself rather than the caller -- a confirmation in a currency
    the booking was never priced in is not a fact, it is a typo, and
    accepting one would put two currencies in a single comparison.
    """
    booking = booking_service.get_booking(db, booking_id)
    if confirmed_amount < 0:
        raise ValueError("A hotel confirmation cannot be negative")
    return repository.upsert_hotel_confirmation(
        db,
        booking_id,
        confirmed_amount,
        booking.currency,
        hotel_reference,
        note,
        user_id,
    )
