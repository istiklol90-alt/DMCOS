# Interface Contract: Hotel ↔ Contract ↔ Booking

## Hotel Engine provides (already built, LOCKED)

All functions live in `app.engines.hotel.service` and take a SQLAlchemy `Session` as their first argument (`db: Session`), verified against the real code as of Hotel Engine LOCK:

- `get_hotel(db, hotel_id)` — returns the `Hotel` row, or raises `ValueError` if it doesn't exist.
- `list_room_types(db, hotel_id)` — returns all `RoomType` rows for one hotel.
- `get_room_type(db, room_type_id)` — returns one `RoomType`, includes `max_occupancy`; raises `ValueError` if not found.
- `list_room_occupancy_options(db, room_type_id, active_only=False)` — valid adults/children/infants combinations for a room type (infants excluded from `max_occupancy`).
- `list_room_availability(db, room_type_id, start_date=None, end_date=None)` — day-by-day Free Sale / On Request / Closed status (`"free_sale"` / `"on_request"` / `"closed"`) for a room type. **Not** an allotment count — that's Contract Engine's responsibility.

All of the above raise plain `ValueError` on failure (not-found and invalid-input alike — a known simplification, see `11_Decisions.md` and `CLAUDE.md`'s Hotel Engine section), not a dedicated exception type.

## Contract Engine will provide (in progress — TASK-002)

All functions live in `app.engines.contract.service` and take `db: Session` as their first argument, matching Hotel Engine's own convention:

- `get_active_contract(db, hotel_id)`
- `get_room_price(db, contract_id, room_type_id, check_in, check_out, meal_plan, adults, children, infants=0)` — `adults`/`children`/`infants` match Hotel Engine's occupancy shape exactly (infants excluded from any capacity check, per the same reasoning as Hotel Engine's `RoomOccupancyOption`). Needed to price age-category-specific `RateSupplement` rows, which the original signature (without occupancy) had no way to resolve — corrected once this gap was found while wiring `get_room_price`'s real implementation, rather than left as a known limitation.
- `check_allotment(db, contract_id, room_type_id, check_in, check_out)`
- `get_cancellation_policy(db, contract_id, check_in)`
- `get_meal_plans(db, contract_id, room_type_id)`
- `get_child_policy(db, contract_id, room_type_id)`

(Signatures above are being verified against the real `service.py` as each function is written, the same way Hotel Engine's side of this document was verified rather than assumed.)

## Rules

1. Contract Engine references Hotel Engine's `hotel_id`/`room_type_id` — never duplicates hotel/room data.
2. Contract Engine owns all pricing/seasonal/discount/cancellation logic — Hotel Engine has none of this.
3. Booking Engine (future) queries Contract Engine for price at time of booking — never caches/stores its own copy.
4. Currency comes from the Contract, tied to the destination (per project convention: each destination has its own currency).
