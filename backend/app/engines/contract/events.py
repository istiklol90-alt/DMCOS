"""
Domain event name placeholders for the Contract Engine.

Per Decision 003 (11_Decisions.md), every Engine must emit domain events
for meaningful state changes, even though Audit & Log Engine (#21) doesn't
exist yet to subscribe to them. These constants are the forward-looking
contract: once Audit & Log Engine is built, it can subscribe to these
event names without requiring any change here.

Nothing in this Engine actually publishes these events yet — no
publish/subscribe mechanism exists in the codebase, same as Hotel Engine's
events.py. Wiring emission into service.py is follow-up work, not part of
this placeholder.

Per Decision 005: only Contract Engine's own events live in this file.
The three names below (contract_created, contract_published, price_changed)
were pre-named as examples back in Decision 003, when Hotel Engine's
events.py was being scoped — they're used here verbatim rather than
reinvented, now that Contract Engine's own lifecycle has actually reached
this point. rate_created is a new addition to keep the same "created +
significant change, per entity" pairing Hotel Engine's 4 events used
(Contract: created/published; Rate: created/price_changed) instead of
mixing in a third entity (e.g. Promotion) asymmetrically.
"""

# Payload: {contract_id, hotel_id, contract_name, created_by, created_at}
CONTRACT_CREATED = "contract_created"

# Payload: {contract_id, hotel_id, contract_name, previous_status, new_status, published_by, published_at}
# Fired specifically on the Draft -> Active transition, not every status change.
CONTRACT_PUBLISHED = "contract_published"

# Payload: {rate_id, contract_id, room_type_id, season_id, meal_plan_id, base_price, created_by, created_at}
RATE_CREATED = "rate_created"

# Payload: {rate_id, contract_id, room_type_id, previous_base_price, new_base_price, changed_by, changed_at}
# Fired when an existing Rate's base_price changes (or, in principle, a
# RateSupplement's amount) — not on every Rate field edit, only the price.
PRICE_CHANGED = "price_changed"
