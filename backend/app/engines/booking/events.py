"""
Domain event name placeholders for the Booking Engine.

Per Decision 003 (11_Decisions.md), every Engine must emit domain events
for meaningful state changes, even though Audit & Log Engine (#21) doesn't
exist yet to subscribe to them. These constants are the forward-looking
contract: once Audit & Log Engine is built, it can subscribe to these
event names without requiring any change here.

Nothing in this Engine actually publishes these events yet — no
publish/subscribe mechanism exists in the codebase, same as Hotel and
Contract Engine's events.py. Wiring emission into service.py is
follow-up work, not part of this placeholder.

Per Decision 005: only Booking Engine's own events live in this file.

Unlike Hotel Engine (2 entities x 2 events) and Contract Engine (2
entities x 2 events), Booking is "the central business object in DMC OS"
(02_Logic_Rules.md #45) with more than one consequential outcome per
booking, so these 4 events cover creation plus the three ways a booking
resolves (Confirmed / Cancelled / Rejected) rather than splitting across
Booking and Guest — Guest is a simple child entity, same as HotelImage/
ContractMarket not getting their own events either. booking_completed
(checkout) is deliberately left out of this initial set — it's a routine
lifecycle end rather than a decision point; add it later if Audit & Log
Engine's actual needs call for it.
"""

# Payload: {booking_id, booking_number, agent_id, hotel_id, contract_id, created_by, created_at}
BOOKING_CREATED = "booking_created"

# Payload: {booking_id, booking_number, hotel_id, previous_status, confirmed_at}
# Fired specifically on the transition into "Confirmed" (or "Partially
# Confirmed"), not every status change.
BOOKING_CONFIRMED = "booking_confirmed"

# Payload: {booking_id, booking_number, reason, cancellation_fee, cancelled_at}
BOOKING_CANCELLED = "booking_cancelled"

# Payload: {booking_id, booking_number, hotel_id, rejected_at}
BOOKING_REJECTED = "booking_rejected"
