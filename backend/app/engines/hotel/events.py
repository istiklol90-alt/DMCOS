"""
Domain event name placeholders for the Hotel Engine.

Per Decision 003 (11_Decisions.md), every Engine must emit domain events
for meaningful state changes, even though Audit & Log Engine (#21) doesn't
exist yet to subscribe to them. These constants are the forward-looking
contract: once Audit & Log Engine is built, it can subscribe to these
event names without requiring any change here.

Nothing in this Engine actually publishes these events yet — no
publish/subscribe mechanism exists in the codebase. Wiring emission into
service.py is follow-up work, not part of this placeholder.

Per Decision 005: only Hotel Engine's own events live in this file.
Contract Engine's events (contract_created, contract_published,
price_changed) belong in Contract Engine's own events.py, to be defined
when Contract Engine's lifecycle begins — not here.
"""

# Payload: {hotel_id, hotel_name, created_by, created_at}
HOTEL_CREATED = "hotel_created"

# Payload: {hotel_id, hotel_name, previous_status, new_status, published_by, published_at}
# Fired specifically on the Draft -> Active transition, not every status change.
HOTEL_PUBLISHED = "hotel_published"

# Payload: {room_type_id, hotel_id, room_name, created_by, created_at}
ROOM_TYPE_CREATED = "room_type_created"

# Payload: {room_type_id, hotel_id, room_name, previous_status, new_status, published_by, published_at}
# Fired specifically on the Draft -> Active transition, not every status change.
ROOM_TYPE_PUBLISHED = "room_type_published"
