from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
)
from models.base import Base
from datetime import datetime


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    booking_number = Column(String(50), unique=True, nullable=False)
    # Plain Integer, not a ForeignKey — validated against models.user.User
    # directly (Users isn't wrapped behind an Engine boundary the way
    # Hotel/Contract are, so no cross-engine service call is needed here).
    agent_id = Column(Integer, nullable=False)
    # Plain Integer, not ForeignKeys into Hotel/Contract Engine's tables —
    # existence validated in service.py via their own service functions
    # (per docs/interface-contracts/contract-hotel-booking.md), same
    # cross-engine decoupling pattern Contract Engine used for Hotel Engine.
    hotel_id = Column(Integer, nullable=False)
    contract_id = Column(Integer, nullable=False)
    # rate_id/meal_plan_id/market_id are informational snapshots taken
    # from get_room_price's result at booking time, not independently
    # re-validated against Contract Engine (which doesn't expose standalone
    # lookups for these — only the composite pricing functions).
    rate_id = Column(Integer, nullable=False)
    room_type_id = Column(Integer, nullable=False)
    meal_plan_id = Column(Integer, nullable=False)
    market_id = Column(Integer, nullable=True)
    # Decision 048: which Contract Engine SpecialOffer (if any) was active
    # when this booking was priced -- plain Integer, not a ForeignKey, same
    # cross-engine decoupling as hotel_id/contract_id/rate_id/room_type_id/
    # meal_plan_id above (SpecialOffer lives in Contract Engine's own
    # tables). Set by create_booking from get_room_price's
    # applied_special_offer_ids ONLY when exactly one id was returned --
    # left NULL both when no offer applied and when the price genuinely
    # involved more than one offer's mechanisms (ambiguous, never guessed).
    applied_special_offer_id = Column(Integer, nullable=True)
    arrival_date = Column(Date, nullable=False)
    departure_date = Column(Date, nullable=False)
    nights = Column(Integer, nullable=False)
    adults = Column(Integer, nullable=False)
    children = Column(Integer, nullable=False, default=0)
    infants = Column(Integer, nullable=False, default=0)
    status = Column(String(20), default="Draft")
    currency = Column(String(3), nullable=False)
    # Frozen snapshot of get_room_price's final_total/currency at booking
    # time — never recomputed later even if the contract's seasons/rates/
    # promotions change afterward (same "original price never changes"
    # principle 02_Logic_Rules.md #18 applies to contracts, extended here).
    # As of Decision 069, this is Pricing Engine's agent_room_total, NOT
    # Contract Engine's raw final_total -- it already includes the global
    # markup and any exclusive-tier discount. The pre-markup net figure is
    # never lost: it's recoverable as
    # total_amount - agent_markup_amount + agent_exclusive_discount_amount.
    total_amount = Column(Float, nullable=False)
    # Decision 069 (Pricing Engine): itemized breakdown of what Pricing
    # Engine added/removed from Contract Engine's net room total to produce
    # total_amount above -- same "separate column so Finance Engine can
    # itemize later" precedent as transfer_total/mandatory_tax_total below.
    # Both NULL only for bookings created before Decision 069 shipped (no
    # backfill was done); zero for every real Pricing Engine calculation
    # (Standard agents, or Exclusive agents at a contract with no
    # ContractExclusiveDiscount) rather than NULL, so "0" and "not
    # computed yet" stay distinguishable.
    agent_markup_amount = Column(Float, nullable=True)
    agent_exclusive_discount_amount = Column(Float, nullable=True)
    # Decision 022's Booking Engine integration: the agent's selected
    # ContractTransferOption.transfer_type (None if the contract doesn't
    # require one and the agent didn't add one), and its own frozen
    # get_transfer_price snapshot — deliberately a separate column, NOT
    # folded into total_amount, so Finance Engine can itemize room vs.
    # transfer revenue later without unpacking a merged number.
    transfer_type = Column(String(50), nullable=True)
    transfer_total = Column(Float, nullable=True)
    # Frozen snapshot of Contract Engine's get_mandatory_tax at booking time
    # (e.g. Kandima's Green Tax) -- same separate-column precedent as
    # transfer_total, NOT folded into total_amount, so Finance Engine can
    # itemize room vs. transfer vs. tax revenue independently. NULL when the
    # contract has no mandatory_tax_per_person_per_night configured.
    mandatory_tax_total = Column(Float, nullable=True)
    # 02_Logic_Rules.md #50 fields not in 03_Domain_Model.md #37's flat list.
    special_requests = Column(Text, nullable=True)
    arrival_flight_number = Column(String(50), nullable=True)
    departure_flight_number = Column(String(50), nullable=True)
    # Decision 047: the guest's REAL flight date/time, deliberately
    # separate from arrival_date/departure_date (the room's check-in/
    # check-out) -- these can legitimately differ (e.g. a flight landing
    # the morning after check-in). arrival_flight_time/departure_flight_time
    # are "HH:MM" strings, same convention as Hotel.checkin_time/
    # checkout_time, not a SQL Time column.
    arrival_flight_date = Column(Date, nullable=True)
    arrival_flight_time = Column(String(5), nullable=True)
    departure_flight_date = Column(Date, nullable=True)
    departure_flight_time = Column(String(5), nullable=True)
    # Cancellation fields — the calculated penalty lives here (snapshot at
    # cancellation time via Contract Engine's get_cancellation_policy); the
    # actual refund transaction is Payment Engine's table, not this one.
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_fee = Column(Float, nullable=True)
    # Decision 084: who cancelled it -- same plain-Integer,
    # not-a-ForeignKey convention as claimed_by/created_by (validated
    # against models.user.User directly). A real, previously-open audit
    # gap: cancellation_reason/cancelled_at/cancellation_fee were always
    # captured, but WHO clicked cancel was never recorded anywhere.
    cancelled_by = Column(Integer, nullable=True)
    # Date-change audit fields (Decision 029/Stage 1) — mirror the
    # cancellation fields' shape exactly. Only the LATEST change's reason/
    # timestamp is retained (no history table) if dates are changed more
    # than once — same single-event simplification cancellation already
    # has, since a booking can only be cancelled once anyway.
    date_change_reason = Column(Text, nullable=True)
    dates_changed_at = Column(DateTime, nullable=True)
    # "Взято в работу" (Decision 045) -- tracks whether anyone has started
    # handling a new booking, independent of business `status`. Plain
    # Integer, not a ForeignKey, same cross-boundary-identity pattern as
    # agent_id/created_by above -- deliberately NOT a User-only construct:
    # per Decision 029's staged AI-autonomy roadmap, a future AI agent
    # (Stage 4/5) would claim bookings the identical way, through a
    # designated system User row, with zero schema change needed. No
    # claimed_by_type discriminator column -- speculative until a real
    # AI-agent identity actually exists to test against.
    claimed_by = Column(Integer, nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    # Decision 097: the hotel's own reference number, entered manually by
    # a manager once received (typically after sending the LPO and
    # getting a hotel reply) -- same nullable-String-on-Booking shape as
    # arrival_flight_number/departure_flight_number above, same
    # LOCKED-engine additive-extension precedent as Decisions 084/089/090.
    # Saving a real value here is the trigger Finance Engine's Voucher
    # generation orchestrates off of (frontend-only, no coupling here).
    confirmation_number = Column(String(100), nullable=True)
    # Decision 155: WHO entered that number, and when.
    #
    # This was the one milestone with no actor recorded at all — cancellation
    # has cancelled_by, a room approval has approved_by, but the single field
    # that makes a booking count as "confirmed by the hotel" (and triggers the
    # guest's voucher) was anonymous. Found live on BK-000077: status
    # "Confirmed", confirmation_number "123", claimed_by NULL, and zero
    # outbound LPO messages — nobody took it on, the hotel was never asked,
    # and the system still called it confirmed.
    #
    # Plain Integer, not a ForeignKey — same cross-boundary-identity
    # convention as claimed_by/cancelled_by/created_by above.
    confirmation_number_by = Column(Integer, nullable=True)
    confirmation_number_at = Column(DateTime, nullable=True)
    # Decision 104: two-stage cancellation confirmation, mirroring
    # confirmation_number's own shape/precedent exactly but for the
    # hotel's acknowledgment of a *cancellation* rather than the original
    # booking. Populated only once status reaches the final "Cancelled"
    # (set by confirm_cancellation) -- cancellation_reason/cancelled_at/
    # cancellation_fee/cancelled_by (above) are the request-stage fields,
    # frozen when status first becomes "Cancellation Requested", and are
    # never touched again by confirm_cancellation.
    cancellation_confirmation_number = Column(String(100), nullable=True)
    cancellation_confirmed_at = Column(DateTime, nullable=True)
    cancellation_confirmed_by = Column(Integer, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Guest(Base):
    __tablename__ = "guests"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    gender = Column(String(20), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    nationality = Column(String(100), nullable=True)
    # 03_Domain_Model.md #38 lists these as current fields; 02_Logic_Rules.md
    # #50 parenthetically calls passport "(future)" — following the Domain
    # Model as canonical, included now (nullable) rather than deferred.
    passport_number = Column(String(50), nullable=True)
    passport_expiry = Column(Date, nullable=True)
    special_requests = Column(Text, nullable=True)
    # Not in either doc — a simple flag standing in for "Lead Guest"
    # (02_Logic_Rules.md #50) instead of a nullable FK on Booking that
    # would need setting after a Guest row already exists.
    is_lead_guest = Column(Boolean, default=False)
    # Decision 150: this guest's OWN flight, when it differs from the rest
    # of the party's. Same six-field shape as Booking's own flight columns
    # (Decision 047), deliberately mirrored rather than reinvented.
    #
    # NULL is meaningful and is the normal case: it means "this guest is on
    # the application's flight" (Booking.arrival_flight_* etc.), not "no
    # flight known". That makes the whole feature purely additive — every
    # existing application, and every future one where the party travels
    # together, keeps exactly the behavior it had, with these columns left
    # NULL and nothing reading them.
    #
    # Deliberately NOT paired with a Booking-level "guests fly separately"
    # boolean: the real-world case isn't a binary mode but a mix (3 of 5
    # travellers on the group flight, 2 arriving a day later on their own),
    # and per-guest NULL-or-value already expresses that exactly. A flag
    # would be a second source of truth that could contradict the rows.
    arrival_flight_number = Column(String(50), nullable=True)
    arrival_flight_date = Column(Date, nullable=True)
    arrival_flight_time = Column(String(5), nullable=True)
    departure_flight_number = Column(String(50), nullable=True)
    departure_flight_date = Column(Date, nullable=True)
    departure_flight_time = Column(String(5), nullable=True)


class BookingRoom(Base):
    """
    Multi-room booking, Stage 1 (data model only -- additive, nothing in
    Booking/Guest changes or gets removed yet; no service/API code reads
    this table until a later stage wires it in).

    Booking becomes the "application" (agent_id, guest list via Guest.
    booking_id which already points here, whole-application cancel/claim/
    correspondence) -- one row per real reservation request, which may
    cover 1 or many rooms. BookingRoom is one row per actual room/leg
    within that application: its own hotel/contract/dates/pricing/status,
    independent of every other room in the same application. Confirmed
    directly with the project owner via a real example: one agent books
    Kandima Maldives 08.08-14.08 then Siyam World 14.08-16.08 for the
    same guests, same trip, same destination (Maldives) -- two
    BookingRoom rows under one Booking (application), each with its own
    dates/transfer/price, never one Booking row trying to hold both.

    Every cross-engine reference (hotel_id/contract_id/rate_id/room_type_id/
    meal_plan_id/market_id/applied_special_offer_id) is a plain Integer,
    same decoupling convention Booking itself already established -- no
    ForeignKey into Hotel/Contract Engine's own tables.
    """

    __tablename__ = "booking_rooms"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    # 1, 2, 3... display order within the application ("Room 2 of 3") --
    # not a room-type/rate identifier, purely a stable display sequence.
    sequence_number = Column(Integer, nullable=False)

    hotel_id = Column(Integer, nullable=False)
    # contract_id is required -- a room row is only ever created once an
    # active contract was actually found (no active contract at all is a
    # fatal, whole-application error, never a soft per-room rejection; see
    # service.py's create_booking_application). rate_id/meal_plan_id/
    # currency/total_amount below, by contrast, are only resolved by
    # get_room_price, which never runs if check_allotment already failed
    # -- nullable so a room rejected purely for lack of availability can
    # still be recorded (dates/occupancy/hotel known, price never
    # computed) instead of needing a fabricated placeholder value.
    contract_id = Column(Integer, nullable=False)
    rate_id = Column(Integer, nullable=True)
    room_type_id = Column(Integer, nullable=False)
    meal_plan_id = Column(Integer, nullable=True)
    market_id = Column(Integer, nullable=True)
    applied_special_offer_id = Column(Integer, nullable=True)

    arrival_date = Column(Date, nullable=False)
    departure_date = Column(Date, nullable=False)
    nights = Column(Integer, nullable=False)
    adults = Column(Integer, nullable=False)
    children = Column(Integer, nullable=False, default=0)
    infants = Column(Integer, nullable=False, default=0)

    # Pending (allotment reserved, awaiting manager approve per the
    # project owner's explicit "system never auto-confirms" instruction)
    # / Confirmed (manager approved) / Rejected (either no allotment was
    # available -- rejected_by stays NULL for this case -- or a manager
    # explicitly declined the approve request -- rejected_by set,
    # rejection_reason required) / Cancellation Requested / Cancelled.
    # Deliberately the same vocabulary Booking.status already uses, not a
    # new invented enum, since the terminal-status/allotment-release
    # meaning is identical, just scoped to one room instead of one
    # booking.
    status = Column(String(30), default="Pending")
    rejection_reason = Column(Text, nullable=True)
    # NULL = rejected automatically (no allotment); set = a manager
    # explicitly declined this room's approve request. Plain Integer,
    # same not-a-ForeignKey convention as every other actor-tracking
    # column in this file.
    rejected_by = Column(Integer, nullable=True)
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    currency = Column(String(3), nullable=True)
    total_amount = Column(Float, nullable=True)
    agent_markup_amount = Column(Float, nullable=True)
    agent_exclusive_discount_amount = Column(Float, nullable=True)
    transfer_type = Column(String(50), nullable=True)
    transfer_total = Column(Float, nullable=True)
    mandatory_tax_total = Column(Float, nullable=True)

    special_requests = Column(Text, nullable=True)

    # The hotel's own per-room reference number (each room in a
    # multi-room application gets its own hotel confirmation) -- same
    # shape/precedent as Booking.confirmation_number (Decision 097).
    confirmation_number = Column(String(100), nullable=True)

    date_change_reason = Column(Text, nullable=True)
    dates_changed_at = Column(DateTime, nullable=True)

    # Decision 199. A transfer choice is revisited long after booking --
    # the guests decide they want the Lexus rather than the sedan, three
    # months in -- and that must never mean cancelling and rebooking.
    # Same shape as the date-change trio directly above, deliberately:
    # this is the same kind of event (a real, priced change to an existing
    # booking, made by whoever made it, for a stated reason).
    transfer_change_reason = Column(Text, nullable=True)
    transfer_changed_at = Column(DateTime, nullable=True)
    transfer_changed_by = Column(Integer, nullable=True)

    # Room-level cancellation -- used by the admin-only per-room cancel
    # exception (the project owner's explicit instruction: an agent can
    # only cancel the whole application; a manager, via the admin panel,
    # can cancel/change one specific room without touching the rest).
    # Mirrors Booking's own cancellation fields' shape exactly.
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_fee = Column(Float, nullable=True)
    cancelled_by = Column(Integer, nullable=True)
    cancellation_confirmation_number = Column(String(100), nullable=True)
    cancellation_confirmed_at = Column(DateTime, nullable=True)
    cancellation_confirmed_by = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BookingRoomGuest(Base):
    """
    Which of the application's guests (Guest.booking_id already points at
    the application, entered once per trip per the project owner's
    explicit instruction: same guests throughout one application, a
    different guest set means a new, separate application) occupy which
    specific room. Pure many-to-many link, no extra fields -- needed
    because room occupancy (adults/children) can differ per room, so a
    flat "all guests belong to all rooms" assumption doesn't hold once
    there's more than one room.
    """

    __tablename__ = "booking_room_guests"

    id = Column(Integer, primary_key=True, index=True)
    booking_room_id = Column(Integer, ForeignKey("booking_rooms.id"), nullable=False)
    guest_id = Column(Integer, ForeignKey("guests.id"), nullable=False)


class BookingCorrespondence(Base):
    """
    Decision 049: the permanent, booking-linked hotel email thread.
    Deliberately built with NO real SMTP/IMAP integration -- "sent" means
    "recorded as sent" (the manager still emails the text through their
    own client, per Decision 046's original LPO design), and inbound rows
    are logged manually until a real business mailbox exists (Decision
    029 Stage 3+). Lives inside Booking Engine, not a new Engine, since
    this is a booking-scoped child entity with no independent lifecycle
    of its own -- same precedent as Guest above, not a fresh TASK-000.
    """

    __tablename__ = "booking_correspondence"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    # "outbound" (DMC -> hotel) / "inbound" (hotel -> DMC, logged manually).
    direction = Column(String(20), nullable=False)
    subject = Column(String(300), nullable=True)
    body = Column(Text, nullable=False)
    # "draft" (column exists, no writer yet -- no save-draft flow built) /
    # "sent" (outbound, written by send_correspondence) / "awaiting_reply"
    # (never stored -- a computed UI label: latest row is outbound with
    # status="sent" and no inbound row followed it) / "replied" (written
    # directly on inbound rows, and back-applied to the outbound row they
    # answer).
    status = Column(String(20), default="draft")
    sent_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    # Decision 050: captured per-send, not a permanent Hotel/Contract
    # field -- who a given outbound message was actually addressed to can
    # legitimately differ send to send (e.g. a general reservations inbox
    # the first time, a specific manager's personal email later). Defaults
    # to Hotel.email in the UI when populated (that field already existed
    # on LOCKED Hotel Engine; no schema change needed there), but stays
    # editable and is recorded as whatever the manager actually used.
    recipient_email = Column(String(255), nullable=True)
    recipient_email_secondary = Column(String(255), nullable=True)
    # Decision 154: did this message ACTUALLY leave the building?
    #   True  — SMTP accepted it
    #   False — recorded only (no SMTP configured, or the send failed)
    #   NULL  — the 23 rows predating this column, where it is unknowable
    # Kept separate from `status`, which tracks the CONVERSATION
    # (sent/replied), not delivery. Before this, pressing "Send" wrote a row
    # and never contacted a mail server at all, so a manager had no way to
    # tell a delivered LPO from one that only exists in this database.
    delivered = Column(Boolean, nullable=True)
    # Plain Integer, not a ForeignKey -- same cross-boundary-identity
    # pattern as Booking.created_by/claimed_by (validated against
    # models.user.User directly, not wrapped behind an Engine boundary).
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
