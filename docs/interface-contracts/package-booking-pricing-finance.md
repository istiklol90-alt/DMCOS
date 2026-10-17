# Interface Contract: Package ↔ Pricing / Contract ↔ Booking ↔ Finance

Status: **TASK-001 draft (2026-10-17)** — agreed before Package Engine's TASK-002, per CLAUDE.md's rule that an Interface Contract exists before an engine depending on another engine's data. Architecture: `docs/plans/package-engine-architecture.md`.

## Package Engine uses (read-only calls into existing engines)

- **Pricing Engine** `agent_room_quote(db, agent_id, contract_id, room_type_id, check_in, check_out, meal_plan, adults, children, infants)` → agent net for the hotel component (`agent_room_total`, `currency`, `nights`, `meal_plan_id`, `applied_special_offer_ids`). Package Engine never recomputes hotel prices and never sees the contract's raw rate rows.
- **Contract Engine** `get_transfer_options` / `get_transfer_price`, `get_mandatory_tax`, `get_active_contract` — transfer and tax components, exactly as Booking Engine uses them today.
- For **our cost** of the hotel component (staff reports only) Package Engine reads `get_room_price(...)["final_total"]`; it is stored on the staff-only side of the quote and never returned to an agent.

## Package Engine provides

- `quote_package(db, agent_id, channel_id, destination, check_in, check_out, party, choices) → PackageQuote` — components with `cost`/`net`, totals `net`, `gross`, `commission`, `rate`, `currency`, `expires_at`. Agent-facing serialisation drops every `cost`.
- `search_flights(db, destination, out_date, back_date, pax) → [FlightOffer]` — both directions, cabin (Economy / Business), flight numbers, times, net per person, seats available; empty list = "no flight on this date".
- `book_package(db, quote_id, agent_id, guests, ...) → booking_id` — calls Booking Engine to create the hotel application (unchanged flow, so allotment, validation and the hotel price stay Booking's), then writes `booking_packages` + `booking_package_lines` and confirms flight holds. If the package part fails after the application exists, the application is cancelled through Booking's own cancel path (compensation, same honest best-effort as Decision 012).
- `release_package_holds(db, booking_id)` — called when the booking is rejected / cancelled.
- `get_booking_package(db, booking_id) → {net, gross, commission, rate, currency, lines}` — frozen snapshot.

## Booking Engine

- No import of Package Engine (direction stays acyclic).
- Additive only: optional passport fields on `guests` (number, expiry, nationality) for flight packages. Existing bookings and flows unchanged.
- Booking Engine's reject / cancel endpoints notify Package Engine through the caller (frontend orchestration or the package endpoint), not by importing it.

## Finance Engine

- Reads `get_booking_package` to invoice a package booking at **net** (owner rule: invoice net only). Commission and gross are stored, reported to staff, and shown to the owning agent, never added to the invoice total.
- Hotel-only bookings: unchanged.

## Rules

1. Cross-engine ids (`booking_id`, `agent_id`, `contract_id`, `hotel_id`) are plain Integers, never SQL `ForeignKey` — project convention.
2. All amounts carry a currency; a package is priced in its destination's currency; mixed currencies are refused until exchange rates exist.
3. Every price a booking keeps is frozen at booking time.
4. Cost and our margin are staff-only; agent responses carry net / gross / commission only (`api/redaction.py`, `security_audit.py`).
5. Suppliers are reached only through the provider interfaces (`FlightSupplier`, `InsuranceSupplier`); no engine calls a GDS or insurer directly.
