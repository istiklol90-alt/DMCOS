# DMC Travel OS

# Project Decisions Log

## Purpose

This document stores all important architectural and business decisions.

No important decision should exist only in chat messages.

---

# Decision 001

Date: 2026-07-05

Decision: TASK-000 and TASK-001 for Hotel Engine completed. Confirmed via code search: the Hotel Engine skeleton exists but is empty (14 files + ai/ subfolder, 0-1 bytes each). No legacy hotel/room/villa logic exists anywhere else in the project (models/, api/, app/ — excluding the empty skeleton). No migration is required. Work is proceeding on branch feature/hotel-engine.

Reason: Verify a clean starting point before beginning schema/domain design (TASK-002), per the one-Engine-at-a-time rule in CLAUDE.md.

Approved By: Daler

Status: TASK-001 Status: READY FOR ANALYSIS

---

# Decision 002

Date: 2026-07-05

Decision: Hotel Contacts (domain doc #15) and Hotel Documents (domain doc #22) are deferred out of the initial Hotel Engine TASK-002 schema. They are not part of the current room/availability model but are logged here as a candidate for a later task so they are not forgotten when work moves to the next Engine.

Reason: TASK-002 schema scope was deliberately narrowed to physical hotel/room/availability data (per Decision 001 and the Contract Engine boundary). Contacts and Documents are legitimate hotel-profile data but were not requested for this pass.

Approved By: Daler

Status: DEFERRED — candidate for a future Hotel Engine task

---

# Decision 003

Date: 2026-07-05

Decision: Hotel Engine and Contract Engine (and all future business Engines) must emit domain events for every meaningful state change (e.g. hotel_created, hotel_published, room_type_created, contract_created, contract_published, price_changed) — even though Audit & Log Engine doesn't exist yet. This is a forward-looking convention, not something to build fully now: Hotel Engine's events.py file (already in the scaffold) should define these event names/payloads as placeholders now, so Audit & Log Engine can subscribe to them later without requiring changes to Hotel/Contract Engine at that time.

Reason: User requested ability to see change history (who changed what, when) on hotels and contracts. Rather than building audit logging into every engine separately, events.py in each engine is the designated place for this, matching the 22-engine architecture where Audit & Log Engine (#21) is responsible for aggregating history centrally.

Approved By: Daler

Status: Logged as forward-looking architecture decision — no code changes required yet beyond what's already scoped for TASK-002 (events.py placeholder).

---

# Decision 004

Date: 2026-07-05

Decision: AI implementation strategy — do not wait until all 22 Engines are complete before adding AI. Instead: (1) each Engine gets only AI scaffolding (empty ai/ folder, events.py placeholders) during its own build, no real AI code yet; (2) once Hotel, Contract, and Booking Engines are all complete and LOCKED, pause before starting the next Engine to build the first real AI feature — AI-assisted contract PDF parsing (Contract Engine, Level 2 autonomy per AI Autonomy Levels: AI extracts data, shows it next to the source PDF for manager review, manager approves before publish); (3) after that AI feature is proven working, continue with the remaining Engines one at a time, adding real AI features engine-by-engine as each one's business logic is ready to support it.

Reason: Waiting until all 22 Engines are done before testing any AI functionality would delay validating whether the Advisor/Gate/Autonomous pattern actually works in practice. Testing AI early on a real, contained use case (contract parsing) gives faster, more meaningful feedback than building 15+ more Engines blind.

Approved By: Daler

Status: Logged as project roadmap decision. Current focus remains Hotel Engine (one-engine-at-a-time rule unaffected) — this only defines WHEN to pause for AI work, not a change to current priorities.

---

# Decision 005

Date: 2026-07-06

Decision: Event constants must only be defined within their owning Engine's events.py, discovered when hotel/events.py was about to incorrectly include Contract Engine's contract_created/contract_published/price_changed events. Going forward: cross-engine event lists must be split by ownership before implementation, never defined speculatively in another Engine's file, even as placeholders.

Reason: Decision 003 named Hotel and Contract Engine events together as one architectural pattern (domain events for Audit & Log Engine to subscribe to later), which led to briefly scoping all 7 example event names into Hotel Engine's events.py. Caught before implementation — Contract Engine hasn't started its own lifecycle yet, and defining its events elsewhere would violate the one-Engine-at-a-time rule.

Approved By: Daler

Status: Logged as a standing convention for all future Engine events.py work.

---

# Decision 006

Date: 2026-07-06

Decision: Hotel Engine's api.py duplicates JWT-decode logic locally (get_current_user) rather than importing a shared dependency, because Authentication Engine's api.py never exposed one and Authentication Engine is LOCKED. This duplication will repeat in every future Engine's api.py until Authentication Engine is revisited via a deliberate follow-up task to extract a shared, importable auth dependency.

Reason: 06_API_Rules.md requires every API to be authenticated except Login, but no reusable get_current_user dependency exists anywhere in the codebase to import. Authentication Engine's own api.py only inlines JWT-decode logic inside its change-password endpoint, and per CLAUDE.md the engine is LOCKED and should not be modified without a deliberate new task.

Approved By: Daler

Status: Logged as known technical debt — accepted for now, to be resolved by a dedicated future task extracting a shared auth dependency.

---

# Decision 007

Date: 2026-07-06

Decision: Hotel Engine is backend-only for now. No frontend UI (add-hotel form, availability calendar, etc.) will be built before Hotel Engine is LOCKED. Frontend work is deferred to a later task, likely alongside Booking Engine, once it's clearer how an agent actually needs to interact with this data end-to-end.

Reason: Building UI now, before Booking Engine exists and before real usage patterns are known, risks designing screens around guesses rather than actual agent workflows. This is a deliberate scoping choice, not an oversight.

Approved By: Daler

Status: Logged so the absence of a Hotel Engine frontend isn't later mistaken for incomplete work.

---

# Decision 008

Date: 2026-07-06

Decision: Payment Engine (not yet started) must support real online card payment from day one of its own build — not just balance/bank-transfer tracking. This is a product requirement, not optional. Additionally, all APIs across every Engine should remain platform-agnostic (already true, since they're REST APIs) to support a future native mobile app as an additional consumer, without requiring backend changes when mobile is built.

Reason: User explicitly requires online payment capability at launch (not a later add-on) and mobile app support in the future roadmap. Logging now, while working on Contract Engine, so this requirement isn't lost or discovered late when Payment Engine's own TASK-000 begins.

Approved By: Daler

Status: Logged as a forward-looking product requirement — no code changes required now (Payment Engine hasn't started its lifecycle yet); to be enforced when Payment Engine's TASK-000 begins.

---

# Decision 009

Date: 2026-07-06

Decision: Two future requirements for Pricing Engine and Finance Engine (neither started yet), logged now while working on Contract Engine so they aren't lost:

1. Pricing Engine must support agent price tiers/categories (not per-individual-agent pricing, but category-based) — e.g. "Good" (trusted partners who don't leak our net rates to competitors, get the lowest markup) and "Standard" (regular agents, standard markup). Each agent is assigned to a category, and the price they see depends on their category's markup rules on top of Contract Engine's net rate.

2. Finance Engine must support recording deliberate below-cost sales with a linked hotel cash-back arrangement — e.g. a specific booking is sold to an agent below net cost as a business decision, but the hotel separately compensates the company with a rebate (e.g. 5% of total sales) once a cumulative volume threshold is reached (e.g. $1M in sales). This is NOT an automated formula — per the project owner, these arrangements are negotiated per-hotel and recorded manually as they're agreed, not calculated automatically by a fixed rule. Finance Engine needs a way to record and track these individual arrangements and their fulfillment, not a generic automatic cashback calculator.

Reason: User identified two real pricing/finance mechanisms used in the actual business that aren't yet reflected in any Engine's design: agent-tier-based pricing, and negotiated hotel cashback on cumulative volume (independent of per-booking margin). Logging now to ensure these aren't missed when Pricing Engine and Finance Engine begin their own TASK-000.

Approved By: Daler

Status: Logged as forward-looking product requirements. No code changes now — Contract Engine work continues uninterrupted.

---

# Decision 010

Date: 2026-07-06

Decision: Contract Engine's service.py directly imports and calls Hotel Engine's service.py functions (app.engines.hotel.service) to validate hotel_id/room_type_id existence. This creates a real dependency: if Hotel Engine's service.py signatures ever change, Contract Engine could break silently with no automated check catching it. Accepted as a known architectural risk for now, since there's no test suite anywhere in the project to catch this kind of regression either way — but flagged explicitly so a future Booking Engine (which will depend on both) doesn't introduce a third silent link in this chain without someone noticing the pattern.

Reason: Identified while reviewing Contract Engine's cross-engine wiring — this is the first Engine-to-Engine code dependency in the codebase (previously only documented via the Interface Contract convention, not yet exercised in real code). Worth recording explicitly as a pattern to watch, not just an implementation detail.

Approved By: Daler

Status: Logged as a known architectural risk. No code change now — revisit if Booking Engine's own dependency wiring reveals this needs a firmer contract (e.g. integration tests spanning Engine boundaries).

---

# Decision 011

Date: 2026-07-06

Decision: Contract Engine (LOCKED) is extended with two new functions, reserve_allotment(db, contract_id, room_type_id, check_in, check_out) and release_allotment(db, contract_id, room_type_id, check_in, check_out), added to service.py, api.py, and docs/interface-contracts/contract-hotel-booking.md. This is a purely additive change — no existing function signature, model, schema, or endpoint was modified. Existing Contract Engine functionality was re-verified after the addition (syntax check, real import check, and a functional test of the new functions against real allotment data) before returning to Booking Engine's own TASK-002.

Reason: Booking Engine's TASK-002 domain model design identified that 02_Logic_Rules.md #51 ("inventory decreases automatically" on booking, "returns automatically" on cancellation) had no corresponding function anywhere — Contract Engine's original 6 Interface Contract functions were all reads. This is exactly the scenario Decision 010 anticipated: a future Engine's cross-engine wiring revealing a gap in an already-LOCKED Engine's contract. Extending a LOCKED engine additively (not modifying its existing surface) is treated as distinct from violating the LOCK — the LOCK protects against silent/unreviewed changes to existing behavior, not against deliberate, reviewed, additive extensions driven by a real downstream need.

Approved By: Daler

Status: Implemented. reserve_allotment/release_allotment are live in Contract Engine's service.py and api.py; Interface Contract doc updated to document them. Booking Engine's models.py can now reference real, existing functions rather than planned ones.

---

# Decision 012

Date: 2026-07-06

Decision: Booking Engine's create_booking wraps the repository.create_booking insert in a try/except. If it raises for any reason, the except clause calls Contract Engine's release_allotment (compensating for the reserve_allotment call that already succeeded moments earlier) before re-raising the original exception. This is a best-effort compensating action, not a true distributed transaction.

Reason: create_booking's own docstring already documented that reserve_allotment (a Contract Engine write) happens before the Booking row insert (a Booking Engine write), and that a failure in between would orphan the reservation with no booking to match it. Rather than defer this entirely, a minimal compensating-action safeguard was added to close the most likely failure mode (e.g. a DB constraint violation on insert) without requiring new infrastructure. This does not fully solve the problem: if release_allotment itself fails during the compensation, the reservation remains orphaned. A complete fix would require actual DB-level transaction coordination spanning Hotel/Contract/Booking Engines, which this project has no mechanism for (no distributed transaction manager, no saga orchestration).

Approved By: Daler

Status: Implemented in service.py's create_booking. Logged as a known partial mitigation, not a claim that the underlying cross-engine transaction gap (Decision 011's reasoning) is fully closed.

---

# Decision 013

Date: 2026-07-07

Decision: Frontend work is no longer deferred. Decision 007 deferred Hotel Engine's frontend "likely alongside Booking Engine, once it's clearer how an agent needs to interact with this data end-to-end" — that condition is now met: Booking Engine (TASK-002) is complete and end-to-end verified across Hotel, Contract, and Booking Engines together. Real frontend work begins now, starting with the agent-facing hotel search + room selection + booking flow, backed by the real Hotel/Contract/Booking Engine APIs instead of AgentDashboard_v2's demo data. This becomes the next major workstream after Booking Engine's LOCK.

Reason: Decision 007's deferral was conditional, not indefinite — it was waiting specifically for enough of the booking flow to exist that real agent usage patterns could inform the UI design, rather than guessing. That condition is satisfied now.

Approved By: Daler

Status: Logged as superseding Decision 007's deferral for Hotel, Contract, and Booking Engine frontends alike. Next workstream, not yet started.

---

# Decision 014

Date: 2026-07-07

Decision: Port 8000 has an orphaned/phantom socket listener (PID 15248) with no identifiable owning process, unkillable via standard Windows tools, serving stale pre-Hotel/Contract/Booking-Engine code. Port 8001 is adopted as the standard dev backend port going forward. A reboot might clear the phantom socket, but rather than pause work for that, we're standardizing on 8001.

Reason: Confirmed via netstat/Get-NetTCPConnection that PID 15248 has held port 8000 LISTENING since 2026-07-04, answering HTTP 200 with an OpenAPI schema missing the hotel-engine/contract-engine/booking-engine routers — yet tasklist, Get-Process, and wmic all report no such process exists. This blocks frontend work (HotelSearch.tsx) from reliably using port 8000. Port 8001 was confirmed live and serving the current backend (booking-engine routes present in its OpenAPI schema).

Approved By: Daler

Status: Implemented. config.ts, CLAUDE.md's documented dev commands, and AgentRegistration.tsx's hardcoded API host (which bypassed config.ts entirely) were all updated to use port 8001.

---

# Decision 015

Date: 2026-07-07

Decision: Contract Engine's get_room_price (LOCKED) and, transitively, Booking
Engine's create_booking (LOCKED) never validated adults+children against Hotel
Engine's RoomType.max_occupancy — confirmed by tracing the full call chain
during Booking Engine frontend testing (adults=2 + children=2 = 4 was priced
and would have been bookable against a room type with max_occupancy=3, no
error). Fixed by adding a new validate_capacity(db, room_type_id, adults,
children) function to Hotel Engine's service.py — a thin wrapper around the
already-existing validate_occupancy_within_capacity validator, exposed
through Hotel Engine's service boundary — and calling it from Contract
Engine's get_room_price right after the existing adults<1 guard. Because
Booking Engine's create_booking already calls get_room_price internally
before reserve_allotment, this single insertion point closes the gap for
both the standalone price-check endpoint and actual booking creation, with
no changes needed in booking/service.py itself. Infants remain excluded from
the check, consistent with validate_occupancy_within_capacity's existing
documented rule.

Reason: Discovered via live frontend testing of HotelSearch.tsx (Decision
013's frontend workstream) — increasing guest count beyond a room's
max_occupancy was silently priced with no error, which would let an agent
create an invalid overbooked reservation. This is the same category of gap
Decision 010 anticipated (a downstream Engine's real usage revealing a hole
in an already-LOCKED Engine's contract) and the same additive-extension
pattern as Decision 011 (reserve_allotment/release_allotment): a purely
additive fix to a LOCKED engine's service surface, consumed by another
LOCKED engine, re-verified for regressions before considered done.

Approved By: Daler

Status: Implemented and re-verified. Direct get_room_price calls: baseline
(2 adults, 0 children, 6 nights) still returns exactly 540.0 (no
regression); at-capacity boundary (2 adults + 1 child = 3, max_occupancy=3)
still succeeds (648.0, no false rejection); over-capacity (adults=10)
correctly raises ValueError ("Occupancy combination (10 adults + 0 children
= 10) exceeds room type 'Beach Villa' max_occupancy of 3"). Also verified
via a real create_booking call with adults=10 against an available night
(check_allotment would otherwise pass) — raises the same ValueError with
zero DB side effects (no allotment reserved, no Booking row inserted,
confirmed by rollback + row-count check).

---

# Decision 016

Date: 2026-07-07

Decision: get_room_price only implements "age_category_price" and
"meal_plan_supplement" RateSupplement adjustment types. "extra_bed",
"single_occupancy", and "extra_person" exist only as a code comment
(models.py:126-128) and in the governing docs (02_Logic_Rules.md #738-741,
03_Domain_Model.md #919-925) but have zero implementation — any contract
configured with these adjustment types would have them silently ignored.
This requires project-owner business rule decisions before implementation
(e.g., does single_occupancy apply whenever adults=1 regardless of room
type, or only specific room types? Is extra_bed a fixed per-stay charge or
per-night? Does extra_person differ from age_category_price for adults, or
supersede it?) — not something to invent now. Flagging as a real, documented
gap, separate from the capacity-check bug.

Reason: Discovered while investigating why adults=10 and adults=1 returned
identical prices during Booking Engine frontend testing. Traced to two
separate causes: (1) this test contract has no "Adult" ContractAgeCategory
or matching RateSupplement row, a test-data gap, not a code bug, since
get_room_price's existing age_category_price bucket logic is generic and
would charge per adult if that data existed (same mechanism already
correctly charging per child); and (2) get_room_price never queries
"extra_bed"/"single_occupancy"/"extra_person" adjustment types at all, which
is the real code gap logged here.

Approved By: Daler

Status: Logged as known unimplemented pricing dimension, to be scoped in a
dedicated future task.

---

# Decision 017

Date: 2026-07-07

Decision: Added Rate.base_occupancy (Integer, nullable=False, default=2) to
Contract Engine's Rate model — how many adults base_price already includes
(e.g. "based on 2" in a real hotel contract), distinct from Hotel Engine's
RoomType.max_occupancy, which is a physical capacity ceiling, not a pricing
inclusion count. Implemented the "extra_person" RateSupplement adjustment
type in get_room_price (one of Decision 016's three unimplemented types):
adults beyond rate.base_occupancy are charged per the extra_person
supplement's calculation_basis, added to supplements_total alongside (not
replacing) the existing age_category_price mechanism. Scoped to adults only
— no equivalent "extra child" rule has been confirmed against a real
contract, so this is not extended to children/infants. "extra_bed" and
"single_occupancy" remain unimplemented; Decision 016's gap for those two
stays open pending project-owner business rules.

Reason: Modeled directly on the real Kandima Maldives contract (Sunrise
Beach Pool Villa with Swirlpool: base_price $1,002/night at
base_occupancy=2, extra_person supplement $190/night per adult beyond that)
— a concrete real-world case that needed base_occupancy-aware pricing,
giving a bounded, verifiable slice of Decision 016's gap to implement now
rather than waiting on all three adjustment types' business rules at once.

Approved By: Daler

Status: Implemented and verified end-to-end via real HTTP calls against
contract-engine's /contracts/{id}/room-types/{id}/price endpoint, using
persistent Kandima Maldives / Sunrise Beach Pool Villa with Swirlpool test
data (hotel, room type, contract, Peak season, rate, extra_person
RateSupplement — created via direct SQLite writes in a prior session; no
migration file or seed script exists for it, consistent with this project
having no migration tooling and dmc.db being gitignored). adults=3,
children=0, infants=0, 1 night, meal_plan=BB -> final_total=1192.0 exactly
(1002 base + 190 extra_person for the 1 adult over base_occupancy).
Regression-checked against the pre-existing Test Beach Resort contract (2
adults, 6 nights, Early Bird 10%) -> still returns exactly 540.0, confirming
the base_occupancy migration and new extra_person code path introduced no
regression to existing pricing paths.

Correction (logged 2026-07-07, same day): the room name and Peak rate
originally recorded here ("Sunrise Beach Villa," $2,390 base / $2,580
final_total) were wrong. That room name isn't a real Kandima room type at
all — the persistent test data was mislabeled with a placeholder price that
didn't match the real Kandima PDF. Corrected here to the actual room name
and rate ("Sunrise Beach Pool Villa with Swirlpool," $1,002/night) once the
real contract data was verified against the source PDF. The extra_person
mechanism itself was re-verified against the corrected numbers with the
identical math (base + 190 extra_person), so the code fix this decision
describes remains valid and unaffected — only the test data and the figures
quoted here were wrong, not the pricing logic.

---

# Decision 018

Date: 2026-07-07

Decision: Changed get_active_contract's date-matching rule from "today's
real-world date" to "the requested check-in date." Signature is now
get_active_contract(db, hotel_id, check_in_date=None), checking
contract_status == "Active" AND start_date <= check_in_date <= end_date.
check_in_date defaults to today only for backward compatibility with any
caller that omits it; every real call site now passes the actual check-in
date being searched or booked, not the default. This is a behavior change to
an existing LOCKED function's comparison basis, not a purely additive
extension like Decisions 011/015/017 — full blast radius (3 call sites) was
reviewed and the exact diff approved before implementation:
- Contract Engine's api.py: GET /hotels/{hotel_id}/active-contract now takes
  a required check_in query parameter.
- Booking Engine's create_booking: passes data.arrival_date (already
  validated in scope one line earlier) instead of relying on the default.
- HotelSearch.tsx: passes its checkIn form state (already used identically
  for the /price call later in the same function) as a check_in query
  param.
docs/interface-contracts/contract-hotel-booking.md's get_active_contract
entry updated to match.

Reason: An agent searching for a future stay should see pricing from any
contract whose date range covers that future check-in date, regardless of
whether the contract has technically "started" as of today's real-world
date. Discovered as a real gap via the Kandima Maldives contract (starts
2027-01-11): get_active_contract(hotel_id=2) returned None as of today
(2026-07-07) even though the contract, season, and rate are all fully
configured and correct for a stay in that future window — the only
verification workaround available was bypassing get_active_contract
entirely and calling get_room_price directly by contract_id, which isn't
how a real agent search would reach it.

Approved By: Daler

Status: Implemented and verified. Regression: get_active_contract(hotel_id=1,
check_in=2026-07-10) still resolves to Test Contract 2026 (id=1), unchanged
from before -- Test Contract 2026's 2026-01-01..2026-12-31 window contains
both today and every check-in date used in prior tests, so the old and new
comparison bases coincide for this contract. New behavior:
get_active_contract(hotel_id=2, check_in=2027-02-01), a date inside
Kandima's real Peak season, now resolves directly to Kandima Maldives
Contract 2027 (id=2) with no bypass needed. Sanity check:
get_active_contract(hotel_id=2, check_in=2026-07-07 i.e. today) still
correctly returns null, confirming the fix is scoped to the requested
check-in date, not "always active" once a contract exists.

---

# Decision 019

Date: 2026-07-07

Decision: Real-world discount calculation is more nuanced than currently
implemented: discount % is calculated against the NET room price (before
taxes), then subtracted from the GROSS price (after taxes), BEFORE
meal-plan-upgrade and extra-service supplements are added. Example from
project owner: net BB rate $200, gross (with taxes) $290, 10% discount = $20
off the $200 net base, resulting in $290-$20=$270, THEN meal upgrade/extra-bed
supplements are added on top. This requires: (1) modeling taxes (Green Tax,
service charge, VAT/GST — currently not modeled at all in Contract Engine,
only a single base_price exists), and (2) reordering the discount calculation
to work against net-before-tax rather than base+supplements combined (current
implementation). This is a significant, separate task — not a tweak to
current work — and should not be implemented until scoped properly with the
project owner, since it changes already-tested Contract Engine behavior.

Approved By: Daler

Status: Logged as a significant future task requiring careful scoping —
current discount behavior remains unchanged for now.

---

# Decision 020

Date: 2026-07-07

Decision: Contract Engine's pricing rules (room-type-and-period discount
matrices, meal-plan-specific discounts, occupancy-conditional rules like
"different offer if 1 adult vs 2+ adults", transfer discounts by arrival
date, extra-person supplements, age-category meal pricing) should be
architected as a library of reusable, parameterized "pricing rule formulas"
— not one-off code per hotel. When a new hotel/contract is added, the
manager should be able to SELECT which formulas apply (from an existing
catalog) and fill in the specific numbers/dates/thresholds for that
contract, rather than any new code being written per hotel. Kandima's real
KM26_03 special offer (discovered this session) is the first real-world
case complex enough to require this — it needs at minimum: a
room-type×date-range discount matrix formula, a meal-plan-discount-by-period
formula, an adult-count-conditional family-offer formula, and a
transfer-discount-by-arrival-date formula, and a real hotel WILL reuse a
subset of these same formulas with different numbers.

Reason: Project owner identified that pricing mechanisms (discount
matrices, meal plan rules, occupancy-conditional offers) repeat across
hotels with different specific values but the same underlying shape/logic.
Building each as a reusable formula (vs. hotel-specific code) means every
future hotel with similar contract structures can be onboarded by filling
in data, not writing code — directly serving the AI-first, scalable
architecture goal established early in this project.

Approved By: Daler

Status: Logged as a major future architecture direction for Contract
Engine's pricing rule system. Not to be designed/implemented today — this
is a significant redesign requiring careful scoping (which formulas are
truly common across real contracts vs. hotel-specific edge cases) before
implementation. Immediate next step remains: add Kandima's 9 missing room
types using the existing, already-working pattern.

---

TODO (not a numbered decision — quick note, log properly if/when scoped):
Kandima's real room inventory counts (Sky Studio 56, Beach Studio 72, Beach
Villa with Swirlpool 18, Sunrise Beach Pool Villa with Swirlpool 14, Sunset
Beach Pool Villa with Swirlpool 23, Aqua Villa 30, Aqua Villa with Swirlpool
29, Ocean Pool Villa 18, 2-bedroom Family Sky Suite 8, Sunset Aqua Pool
Suite 2 — from the real PDF) are not modeled anywhere yet. These map to
Contract Engine's `allotments` table, which is day-by-day per room type and
would need explicit rows across the whole contract period
(2027-01-11..2028-01-07) to be real — a separate, larger task from just
adding the room types/rates themselves. Don't forget these real unit counts
exist when that task is eventually scoped.

---

# Decision 021

Date: 2026-07-07

Decision: Contract Engine's get_meal_plans (LOCKED) only returned meal
plans that have a direct Rate row for the requested room type — it never
checked for meal plans reachable only via an active "meal_plan_supplement"
RateSupplement on that room type's base rate, even though get_room_price
has always supported pricing a meal plan that way (a base Rate plus
meal_plan_supplement rows, not just a direct per-meal-plan Rate). Fixed by
adding a second pass in get_meal_plans that collects meal_plan_id from
every active meal_plan_supplement RateSupplement on the room type's rate(s),
unioned with the existing direct-Rate meal_plan_ids. Purely additive — the
direct-Rate half of the logic is unchanged, no existing signature, model,
schema, or endpoint changed. docs/interface-contracts/contract-hotel-
booking.md's get_meal_plans entry updated to match. No caller changes
needed: HotelSearch.tsx's only caller already iterates the returned array
generically, and the response shape (list[ContractMealPlan]) didn't change,
only its contents can now be longer.

Reason: Discovered when Kandima's HB+/FB+/PAI meal plan supplements (added
this session, modeled as meal_plan_supplement RateSupplement rows on top of
the BB direct rate, per the real Kandima PDF) priced correctly via direct
get_room_price calls but never appeared in HotelSearch.tsx's meal-plan rate
table — traced to get_meal_plans silently filtering them out, since it only
implemented the direct-Rate half of the same two-path pricing model
get_room_price already supports. Same category of gap as Decisions
011/015/018: a downstream real usage (the meal-plan rate table UI) revealing
a hole in an already-LOCKED Engine's function that a purely code-level read
never would have caught.

Approved By: Daler

Status: Implemented and verified. get_meal_plans(contract_id=2,
room_type_id=2) via real HTTP call now returns all 4 of Kandima's meal
plans (BB, HB+, FB+, PAI) for Sunrise Beach Pool Villa with Swirlpool,
where it previously returned only BB. Full regression suite re-run and
unchanged: Test Beach Resort (2 adults, 6 nights, Early Bird 10%) ->
540.0; Kandima Sunrise Beach Pool Villa BB (3 adults) -> 1192.0, BB (2
adults + 1 child) -> 1062.0, BB (2 adults) -> 1002.0, HB+ -> 1182.0, FB+
-> 1282.0, PAI -> 1392.0; Sunset Aqua Pool Suite BB -> 1927.0, HB+ ->
2107.0, FB+ -> 2207.0, PAI -> 2317.0 — all exact matches, no regressions
from this fix.

---

# Decision 022

Date: 2026-07-08

Decision: Added a reusable Transfer module to Contract Engine (LOCKED),
designed as a formula/library any Maldives (or future non-Maldives) hotel
contract can use, not hardcoded to Kandima. New model
ContractTransferOption (contract_transfer_options table): transfer_type
(free-form string, not an enum -- "seaplane", "domestic_comfort",
"domestic_sapphire", etc. -- new transfer kind is new data, never a schema
change, same open-string precedent as RateSupplement.adjustment_type),
transfer_name, price_adult, price_child, price_infant (nullable -- no
infant price exists in the real Kandima data), status. Deliberately not a
RateSupplement row: transfers are a one-time round-trip charge per person,
not RateSupplement's per_person_per_night pattern, so calculation_basis
has no matching option and forcing it in would misrepresent a one-time
charge as recurring. New Contract.transfer_required boolean (single
column on the contract itself, not per-option): refined from an original
per-option is_mandatory proposal after the project owner identified that
was ambiguous (does each option need to be mandatory, or is it "pick one
of the mandatory-flagged ones"?) -- transfer_required=true simply means
"the agent must select exactly one of this contract's available transfer
options," keeping the semantics unambiguous and still correctly handling
a future hotel with a mix of mandatory-baseline and optional-upgrade
transfer options (which a single option-level boolean couldn't express
either way, but a contract-level flag sidesteps entirely by only gating
"is a selection required," not "is this specific option mandatory").

Two new Interface Contract functions, mirroring the get_meal_plans/
get_room_price listing-vs-pricing split: get_transfer_options(db,
contract_id) returns Active options only; get_transfer_price(db,
contract_id, transfer_type, adults, children, infants=0) computes
price_adult * adults + price_child * children + (price_infant or 0) *
infants -- explicitly NOT multiplied by nights. Deliberately kept separate
from get_room_price rather than bundled into its final_total: transfer
price has no relationship to room_type_id, dates, or meal plan, so tying
it to room-type-scoped pricing would be a category error. Migration: this
is a new table (contract_transfer_options), created via
Base.metadata.create_all (additive, no existing table touched) after
adding the model to both init_db.py copies; Contract.transfer_required is
a new column on the already-existing contracts table, which create_all
does NOT retrofit onto a live table (same situation as Decision 017's
base_occupancy), so it required an explicit
`ALTER TABLE contracts ADD COLUMN transfer_required BOOLEAN NOT NULL
DEFAULT 0` against dmc.db directly.

Reason: Real-world requirement -- every Maldives island requires a hotel
transfer, and this needed modeling as a genuinely separate pricing shape
(one-time per-person round-trip, not per-night) rather than forced into
the existing RateSupplement mechanism, plus a reusable, non-hardcoded
schema so any future Maldives (or non-Maldives) hotel contract can define
its own transfer options without a code change.

Approved By: Daler

Status: Implemented and verified end-to-end via real HTTP calls against
the live contract-engine API (not direct function calls) using the real
Kandima contract data from the original PDF's "HOTEL TRANSFER" section:
Domestic Flight Comfort Class ($414/adult, $300/child), Domestic Flight
Sapphire Class ($610/adult, $480/child), Shared Seaplane Transfer
($725/adult, $375/child), transfer_required=true. All 3 created via the
real POST /contract-transfer-options endpoint (not raw SQL). Verified:
GET /contracts/2/transfer-options/available returns all 3; GET
/contracts/2/transfer-price for seaplane (2 adults, 1 child) ->
725*2+375*1=1825.0 exact; for domestic_comfort (2 adults) -> 414*2=828.0
exact; PUT /contracts/2 with {"transfer_required": true} correctly
persists and returns in the ContractResponse. Full regression suite
re-run unchanged: Test Beach Resort 540.0, Kandima BB 1002.0, HB+
1182.0, get_meal_plans still returns all 4 plans, get_active_contract
still resolves correctly with check_in -- no regressions from adding
this module.

Originally deferred, since implemented (2026-07-08, same Decision 022):
Booking Engine integration -- how create_booking consumes
transfer_required/get_transfer_price -- was first proposed and logged
here without implementation (matching the Decision 011 precedent of
adding Contract Engine interface functions before Booking Engine's own
task consumes them), then implemented the same day once approved.

Booking Engine integration: BookingCreate gains transfer_type:
Optional[str] = None. Booking model gains two new nullable columns,
transfer_type and transfer_total -- transfer_total is its own separate
frozen-snapshot column, NOT merged into total_amount, so Finance Engine
can itemize room vs. transfer revenue separately later; total_amount
stays room-only, consistent with how pricing snapshots are already kept
separate elsewhere. create_booking validates contract.transfer_required
against data.transfer_type right after the existing get_active_contract
call (raising ValueError if a selection is required but missing), then
calls get_transfer_price to compute transfer_total when a transfer_type
is given (required or optional), before reserve_allotment -- so an
invalid transfer_type still fails with zero inventory side effects.
Same new-column-on-existing-table situation as Contract.transfer_required:
Booking.transfer_type/transfer_total needed an explicit ALTER TABLE
against the already-existing bookings table, not just
Base.metadata.create_all. Approved by Daler: keep transfer_total
separate from total_amount.

Verified via real HTTP calls against the live booking-engine API:
Kandima (transfer_required=true) booking attempt WITHOUT transfer_type
correctly rejected with "Hotel 2's contract requires selecting a
transfer option," zero side effects. Kandima booking WITH
transfer_type="seaplane" (2 adults) succeeded: total_amount=1002.0
(room-only, unchanged) and transfer_total=1450.0 (725*2) stored as
separate columns, exactly as designed. Test Beach Resort
(transfer_required=false) booking WITHOUT any transfer_type still
succeeds normally (transfer_type/transfer_total both null,
total_amount=90.0 unaffected) -- confirming the optional path is
unchanged for hotels that don't require a transfer. One minimal test
Allotment row was created for Kandima room_type_id=2 (2027-02-01) purely
to unblock this end-to-end verification, since Kandima's real full
inventory counts still aren't modeled (separate, already-logged TODO,
not addressed here).

---

TODO (not a numbered decision -- quick note, log properly if/when
scoped): HotelSearch.tsx's search form collects adults/children/infants
as bucket COUNTS, not individual guest ages, even though real-world
pricing depends on exact age (2-11.99 = child rate, 0-1.99 = infant,
12+ = adult rate). This isn't a new gap introduced by the booking
submission UI (2026-07-08) -- it's the same pre-existing "3-bucket
signature" limitation already documented in
docs/interface-contracts/contract-hotel-booking.md since Contract
Engine's original LOCK: get_room_price/get_transfer_price and every
RateSupplement mechanism (age_category_price, extra_person) all take
adults/children/infants as counts, never per-guest ages, anywhere in
the backend. Confirmed by project owner: keep the search form as-is
(count only) for now rather than scope-creep into redesigning it as
part of the booking flow; the agent is trusted to enter counts
matching the correct age brackets. Revisit only if a dedicated task to
collect exact per-guest ages (e.g. for full multi-guest Guest record
collection, not just the lead guest) is scoped.

---

# Decision 023

Date: 2026-07-08

Decision: HotelSearch.tsx's frontend age-to-bucket mapping (12+ = adult,
2-11.99 = child, 0-1.99 = infant, per Decision 023's own predecessor TODO)
uses ONE hardcoded set of age boundaries, applied uniformly to room/meal
pricing AND transfer pricing for a given search. This is a deliberate
simplification, not an assumption that real contracts always work this
way: real-world hotel contracts can price the same guest differently
per service -- e.g. a hotel could treat a 14-year-old as a "child" for
room/meal purposes but as an "adult" for transfer purposes, using
different age cutoffs per service, not one universal cutoff per
contract. Kandima's real data happens to use 12+ = adult for both, but
that coincidence isn't a rule to bake in as if it always holds.

A fully correct implementation would fetch each service's own age
boundaries from contract data rather than hardcode them in the
frontend. Checked what's actually possible today: Contract Engine's
get_child_policy(contract_id, room_type_id) already exposes
ContractAgeCategory's real min_age/max_age boundaries for room/meal
pricing, so dynamic fetching is technically feasible there alone. But
ContractTransferOption (Decision 022) has NO age-boundary columns at
all -- only flat price_adult/price_child/price_infant, no min_age/
max_age anywhere. This means a fully dynamic, per-service age-bucketing
system is not achievable today without a Contract Engine schema change
(new age-boundary columns on ContractTransferOption, re-entering that
data for every contract), regardless of frontend complexity. The
choice to keep one hardcoded boundary set isn't just "simpler for now"
-- it's the only implementable option without that backend work.

Reason: Project owner surfaced this nuance mid-implementation of the
child-age-input search form redesign, specifically flagging that
different services within the same hotel contract could use different
age cutoffs. Rather than silently baking in a possibly-wrong universal
assumption, checked the actual schema first and found the transfer
side has no age-boundary data to fetch dynamically even if desired --
confirming the simple approach isn't a shortcut being taken over a
better available option, but the only option available today.

Approved By: Daler

Status: Logged as a known simplification, not implemented as
per-service dynamic bucketing. Revisit only as a dedicated task that
also adds age-boundary columns to ContractTransferOption (or an
equivalent), scoped separately -- not a frontend-only fix.

---

# Decision 024

Date: 2026-07-08

Decision: Hotel Engine's validate_capacity (LOCKED, Decision 015) only
checked the coarse sum ceiling (adults + children <= max_occupancy),
which let combinations through that don't match any of a room type's
actual configured RoomOccupancyOption rows -- concretely, Sky Studio's
max_occupancy=4 let "4 adults + 0 children" price and book
successfully, even though the room's only two real configurations are
"2 adults + 2 children" or "3 adults" (not 4). Fixed by adding a second
check: the requested (adults, children) must be dominated by at least
one Active RoomOccupancyOption row for that room type -- adults <=
row.adults AND children <= row.children -- not merely under the sum
ceiling.

Domination, not exact match, is the deliberate semantic: a room
type's configured rows describe maximum configurations ("2A2C or 3A"),
not an exhaustive enumeration of every bookable subset. 2 adults alone,
or 2 adults + 1 child, are legitimate lesser occupancies within the
"2A2C" ceiling and don't need their own row -- exact-match would have
rejected nearly every regression test run all session (every "2 adults"
baseline price check used throughout Decisions 017/021/022 is a subset
of a configured row, never an exact equality to one), which would have
made the fix strictly worse than doing nothing. Room types with zero
configured RoomOccupancyOption rows skip this check entirely and fall
back to the coarse sum-only check -- a room type that hasn't had exact
combinations entered yet shouldn't have every booking rejected,
matching Decision 015's original permissive intent.

A related, separate data correction: Sky Studio's real configured
combinations were mismodeled since Decision 020 -- entered as "2A2C or
4A" (matching a mistranscription in the original room-list table) when
the real Kandima PDF says "2A2C or 3A". This turned out to apply to
all 9 "2A2C or 4A"-pattern room types, not just Sky Studio (Sunrise
Beach Pool Villa with Swirlpool, Sky Studio, Beach Studio, Beach Villa
with Swirlpool, Sunset Beach Pool Villa with Swirlpool, Aqua Villa,
Aqua Villa with Swirlpool, Ocean Pool Villa, Sunset Aqua Pool Suite) --
confirmed by the project owner as a uniform correction, not specific to
Sky Studio. The 10th room type, 2-bedroom Family Sky Suite ("4A4C or
8A"), was already correctly modeled and is unaffected. Each affected
room type's (4 adults, 0 children) RoomOccupancyOption row was updated
to (3 adults, 0 children); the (2 adults, 2 children) row is unchanged.

Reason: Project owner identified the Sky Studio overbooking gap during
manual review, connecting it to the same known limitation flagged
earlier (Sirru Fen Fushi review): RoomOccupancyOption stores real valid
combinations, but validate_capacity never actually checked them,
relying solely on the coarse sum ceiling from Decision 015. Same
category of gap as Decisions 011/015/018/021: a downstream real-data
review revealing a hole in an already-LOCKED Engine's function that a
purely code-level read wouldn't catch alone.

Approved By: Daler

Status: Implemented and verified end-to-end via real HTTP calls.
Bug-fix confirmation: 4 adults + 0 children now correctly rejected for
both Sky Studio and Sunrise Beach Pool Villa with Swirlpool ("exceeds
every configured combination... configured combinations (as ceilings):
2 adults + 2 children, 3 adults + 0 children"). Full regression suite
re-run unchanged: Test Beach Resort 540.0; Kandima BB/HB+/FB+/PAI at
2 adults (1002.0/1182.0/1282.0/1392.0) and BB at 2 adults + 1 child
(1062.0); Sunset Aqua Pool Suite BB/HB+/FB+/PAI (1927.0/2107.0/2207.0/
2317.0); Sunrise Beach Pool Villa at 3 adults still 1192.0 (correctly
dominated by the corrected (3,0) row). Transfer/booking flow re-run
unchanged: Kandima booking without transfer_type still rejected,
with transfer_type=seaplane still succeeds (total_amount=1002.0,
transfer_total=1450.0); Test Beach Resort booking without transfer_type
still succeeds (2 adults + 0 children correctly recognized as a subset
of its configured (2 adults, 1 child) row, not rejected).

---

# Decision 025

Date: 2026-07-08

Decision: Extra-bed pricing (part of Decision 016's original
unimplemented-adjustment-types gap) will be modeled as new
RateSupplement rows with adjustment_type="extra_bed" -- NOT a new
entity, and NOT an additive column on Hotel Engine's
RoomOccupancyOption. RoomOccupancyOption is deliberately scoped to
physical capacity data only (Decision 007's Hotel Engine/Contract
Engine boundary, maintained through every subsequent Contract Engine
addition); extra-bed pricing is a commercial/contract term and
belongs in Contract Engine, same as every other RateSupplement
adjustment_type. RateSupplement already anticipated this exact
adjustment_type (documented but unimplemented since Decision 016) and
its existing calculation_basis field ("per_stay" / "per_person_per_night"
/ "percentage_of_rate") already covers both a flat one-time bed fee
and a nightly one without any new column. Default: amount=0 (or the
row simply absent) means free, matching the real-world Maldives norm
that the bed itself is typically free while the guest occupying it
still gets charged via the existing age_category_price mechanism;
a contract that actually charges for the bed just gets a nonzero row.
Zero schema changes required -- purely new data once implemented,
matching the project's established "every per-hotel pricing variation
is a row here, never a new column" philosophy.

The standard hotel-industry accommodation-type label (SGL/DBL/TPL/
DBL+CB/DBL+Infant) will be purely computed/derived at display time
from adults/children/infants (and, for distinguishing CB from Infant,
the frontend's already-available per-child ages before bucketing) --
never stored anywhere, backend or frontend. Same precedent as
get_child_policy's "not a stored entity, an ad-hoc computed view."
get_room_price's pricing math doesn't need this label at all; it's a
pure display convenience.

Reason: Project owner requested a reusable extra-bed pricing formula,
separate from the existing age_category_price mechanism (which already
charges for WHO occupies a bed, not the bed itself). Considered and
rejected creating a new entity (e.g. ContractBedOption or
AccommodationTypeSupplement) after confirming RateSupplement's
existing flexible-core design already covers this pricing shape with
no gaps -- unlike Decision 022's ContractTransferOption, which
genuinely needed a new table because transfer pricing (flat
round-trip, untied to any rate) doesn't fit RateSupplement's
rate_id-scoped shape at all.

Approved By: Daler

Status: Logged as a confirmed design plan, NOT implemented -- deferred
until after the current Kandima full-contract-with-offer (KM26_03)
task is finished, per project owner's explicit priority call. Still
open before implementation: the exact trigger condition for when an
extra_bed charge applies (same trigger as extra_person -- fires
whenever adults + children > rate.base_occupancy -- or a narrower
condition specific to a child needing a bed, as opposed to an extra
adult) is unresolved and was deliberately not decided here, matching
Decision 016's own original list of unresolved business-rule questions
for this adjustment_type.

---

# Decision 026

Date: 2026-07-08

Decision: Implemented a general, reusable "special offer / promotional
package" system for Contract Engine, modeling Kandima's real KM26_03
offer as configurable data rather than hotel-specific code. New parent
entity SpecialOffer (contract_id, offer_name, booking_start/booking_end,
market_id nullable = ALL markets, combinable_with_other_offers) groups
four child mechanisms, each its own table:

1. SpecialOfferRoomDiscount -- percentage off a specific room type's
   base rate for a specific period, optionally also off extra_person
   (applies_to_extra_person), never age_category_price. One row per
   (room_type, period).
2. SpecialOfferMealPlanDiscount -- percentage off the
   meal_plan_supplement contribution for a period, independent of the
   room discount. meal_plan_id nullable = applies to every
   meal_plan_supplement-priced upgrade uniformly; no row for a period
   means "No" discount that period, no sentinel needed.
3. SpecialOfferFamilyRule -- waives age_category_price for up to N
   qualifying children, conditional on min_adults being met, for a
   period. Deliberately contract-wide, not room-type-scoped, matching
   the real offer's own structure -- multiple rows with different
   min_adults can coexist for the same period (e.g. a "2+ adults" rule
   and a distinct "1 adult" rule), resolved by picking the row with the
   highest min_adults the actual booking's adult count still satisfies.
   max_free_children_meals/max_free_child_age_meals capture the real
   contract's "children also get free meals" clause for documentation
   only -- not read by get_room_price, since there is no existing
   per-child meal-plan charge to waive (Decision 022's
   meal_plan_supplement only ever targets the Adult age category), so
   this clause is already true by default with zero implementation
   needed.
4. SpecialOfferTransferDiscount -- percentage off get_transfer_price's
   total for a specific transfer_type, conditional on min_nights, keyed
   by arrival date (check_in) only.

Deliberately NOT built on the existing Promotion table: Promotion is
one flat discount on a room type's whole price_before_promotions total
from a fixed 9-value documented type list; a SpecialOffer's mechanisms
each target specific, isolated price components and vary by room type
in ways Promotion was never built to express.
combinable_with_other_offers governs only other SpecialOffer rows on a
contract -- entirely independent of Promotion.is_stackable, a
structurally separate system (confirmed by project owner).

get_transfer_price's signature gained required check_in/check_out
parameters (previously took no dates at all, per Decision 022 -- a
transfer was modeled as fully date-independent) since mechanism 4's
min_nights and period-matching genuinely can't be evaluated without
them. Its one caller, Booking Engine's create_booking, updated to pass
data.arrival_date/data.departure_date.

All three get_room_price mechanisms are implemented as reductions to
already-isolated price components (chargeable_children count before
age_category_price is computed; base_total and optionally
extra_person_total after they're computed; meal_plan_supplement_total
separately) rather than a blanket discount on the whole total, so they
compose correctly with each other and with Promotion's own sequential
step, which still runs on top of whatever price_before_promotions they
produce. Both the special-offer period matching and the pre-existing
season matching use the same check_in-for-the-whole-stay
simplification (no per-night proration across a period boundary).

Reason: Project owner requested KM26_03 be modeled as reusable
formulas any hotel could use, not Kandima-specific code, continuing
this session's established principle (Contract Engine's flexible-core
schema design, RateSupplement's adjustment_type, ContractTransferOption).
A significant design discussion preceded implementation, resolving:
period-spanning stays use check_in for the whole stay (matching
existing precedent); the family rule's "free meals" clause needs no
new pricing mechanism since none exists to waive; offer combinability
is scoped only to other offers, independent of Promotion; the four
mechanisms within one offer are meant to stack with each other
(only "other offers" are non-combinable).

Approved By: Daler

Status: Implemented and verified end-to-end via real HTTP calls,
using the real KM26_03 numbers for Sky Studio (the one room type with
a complete 7-period table given): 55%/55%/40%/50%/55%/45%/40% across
now-31 Oct 2026 through 26 Dec 2027-10 Jan 2028, all
applies_to_extra_person=true; a family rule for Jan 2027-Jan 2028
(min_adults=2, up to 2 children under 11.99 free); transfer discounts
of 50% (domestic_comfort) and 25% (seaplane), both min_nights=4.

Primary verification (hand-calculated before running): Sky Studio,
2 adults + 2 children, HB+, 2027-02-01 (Peak period, 50% room
discount) -- expected base_total=251.5 (503*0.50), age_category_price
fully waived by the family rule (2 children <= max_free 2),
meal_plan_supplement=108 (90*2 adults*0.60 after 40% meal discount),
extra_person=0 (2 adults = base_occupancy) -> price_before_promotions
= final_total = 359.5 (no Promotion exists on Kandima's contract).
Real HTTP call matched exactly: base_total=251.5, supplements_total=
108.0, final_total=359.5.

Transfer discount verified independently: domestic_comfort at 4 nights
(meets min_nights) -> 414.0 (828*0.50); domestic_comfort at 2 nights
(below min_nights) -> 828.0, correctly undiscounted; seaplane at 4
nights -> 1087.5 (1450*0.75). Verified through the actual booking flow
too: a 4-night Kandima booking with transfer_type=seaplane correctly
stored transfer_total=1087.5 and total_amount=4008.0 (room-only,
unaffected).

Full regression suite re-run: Test Beach Resort 540.0 (different
contract, no special offers, fully unaffected); Sunrise Beach Pool
Villa's own base_total unaffected (1002.0 at 2 adults) since no
SpecialOfferRoomDiscount row exists for that room type; Sunrise Beach
Pool Villa at 3 adults still 1192.0 (Decision 024's capacity fix
unaffected); Sky Studio at 4 adults still correctly rejected (Decision
024 unaffected).

One real, notable (not a bug) behavior change surfaced by this
regression pass: Sunrise Beach Pool Villa at 2 adults + 1 child now
returns 1002.0 instead of the pre-KM26_03 1062.0 -- because
SpecialOfferFamilyRule is deliberately contract-wide, not
room-type-scoped, matching the real offer's structure, it correctly
waives the child charge for every room type under Kandima's contract
during Jan 2027-Jan 2028, not just Sky Studio. This is the feature
working as designed, not a regression -- any booking within the
offer's real scope legitimately reprices once a live special offer
exists for that period.

Update (same day, 2026-07-08): the project owner subsequently provided
the complete real room-discount table for all 10 room types across all
7 periods. All 63 remaining rows (9 room types x 7 periods) created via
the real API, matching this table exactly: Sky Studio/Beach Studio at
55/55/40/50/55/45/40; Beach Villa with Swirlpool, Sunrise/Sunset Beach
Pool Villa with Swirlpool, Aqua Villa, Aqua Villa with Swirlpool, Ocean
Pool Villa, and 2-bedroom Family Sky Suite all at 50/50/40/50/50/50/40;
Sunset Aqua Pool Suite at 30/30/40/25/30/25/40. Verified against 3
additional room types beyond Sky Studio: Sunrise Beach Pool Villa with
Swirlpool (1002*0.50=501.0), Sunset Aqua Pool Suite (1927*0.75=
1445.25, its own distinct 25% for this period), Beach Villa with
Swirlpool (849*0.50=424.5) -- all exact. Full regression suite
(Test Beach Resort 540.0, Sky Studio's 359.5 combined scenario, Sky
Studio's 4-adult rejection) re-confirmed unchanged after completing
the table.

Update (same day, 2026-07-08): the project owner subsequently provided
the complete real meal-plan-discount and transfer-discount period
tables, closing the gap noted above. Meal plan discount (40% off HB+/
FB+/PAI, meal_plan_id NULL = applies uniformly): now-31 Oct 2026,
1 Nov-25 Dec 2026, 11 Jan-4 Apr 2027 (already existed), and 16 Oct-25
Dec 2027 all at 40%; no rows for 26 Dec 2026-10 Jan 2027, 5 Apr-15 Oct
2027, or 26 Dec 2027-10 Jan 2028, correctly meaning "No" discount those
periods via row-absence, no sentinel needed. Transfer discount
(domestic_comfort 50%, seaplane 25%, both min_nights=4): same four
"CONTRACTED OFFER" periods (now-31 Oct 2026, 1 Nov-25 Dec 2026, 11
Jan-4 Apr 2027, 5 Apr-15 Oct 2027) get rows; the three "CONTRACT RATES,
NO DISCOUNTS" festive/high-demand periods (26 Dec 2026-10 Jan 2027, 16
Oct-25 Dec 2027, 26 Dec 2027-10 Jan 2028) correctly have none.

Verified: the "No discount" transfer periods confirmed undiscounted
(domestic_comfort, 26 Dec 2026-10 Jan 2027 window, 4 nights -> still
828.0, full price) -- the equivalent meal-plan "No discount" check
can't be directly exercised via get_room_price since Kandima's only
modeled ContractSeason (Peak) doesn't cover any of those periods (a
pre-existing single-season data limitation, not a gap in this
mechanism), but shares the identical "no matching row -> no discount"
lookup already proven by the transfer-discount test.

Combined all-four-mechanisms hand-calculated verification (the only
period where room, meal, family, and transfer discounts are all
simultaneously active, since the family rule only starts Jan 2027):
Sky Studio, 2 adults + 2 children, HB+, 4 nights (2027-02-01 to
2027-02-05, satisfying transfer's min_nights=4) + seaplane transfer.
Expected: base_total=1006.0 (503*4*0.50), age_category_price fully
waived by the family rule, meal_plan_supplement=432.0 (90*2*4*0.60),
room+meal+family final_total=1438.0; transfer total=1087.5
(725*2*0.75); combined grand total=2525.5. Real HTTP calls matched
every figure exactly. Full regression suite re-confirmed unchanged
across all previously-verified scenarios after completing both
tables.

---

# Decision 027

Date: 2026-07-08

Decision: Corrected Kandima's contract (contract_id=2) to have its
real 4 rate seasons instead of only 1. Confirmed from the original
Kandima PDF's rate table headers that the base contract defines
exactly 4 seasons across its 2027-01-11 to 2028-01-07 term -- Peak
(2027-01-11 to 2027-04-04, already modeled since TASK-002) plus three
that were never entered: Low (2027-04-05 to 2027-10-15), Shoulder
(2027-10-16 to 2027-12-25), and a second Peak (2027-12-26 to
2028-01-07). Added the 3 missing ContractSeason rows and 30 Rate rows
(10 room types x 3 seasons), same base_occupancy/meal_plan (BB)
pattern as the existing Peak rows, using the real base_price figures
from the PDF's Low/Shoulder/Peak-27-28 columns.

This is explicitly separate from the KM26_03 special offer's own
7-period table (Decision 026): the offer's promotional periods are a
wider, differently-sliced date range that was designed independently
of the base contract's 4 rate seasons and was never meant to align
with them 1:1 -- confirmed this isn't 2 conflicting season models,
just 2 independently-varying dimensions (base rate season vs.
promotional discount period) that both key off check_in date
independently, exactly as get_room_price already computes them (base
rate resolved from ContractSeason, special-offer discount resolved
from SpecialOfferRoomDiscount, applied multiplicatively on top).

Verified with spot-checks on 3 room types/seasons (Sky Studio/Low,
Beach Villa with Swirlpool/Shoulder, Sunset Aqua Pool Suite/Peak
27-28), each matching base_price x nights x (1 - active KM26_03 room
discount for that period) exactly -- confirming the new Rate rows are
correctly picked up by season lookup AND that the pre-existing
KM26_03 discount table (whose periods were built to span this same
wider range from the start) applies correctly on top without any
code changes needed. Regression suite re-run: Kandima's original Peak
season pricing (Sky Studio, Sunrise Beach Pool Villa, Sunset Aqua Pool
Suite, all at check_in=2027-02-01) unchanged; occupancy rejection
unchanged; domestic_comfort transfer pricing unchanged. Zero
regressions.

Confirmed Contract.start_date=2027-01-11 is correct and intentional --
a search against 2026 dates (e.g. 18-25 June 2026) correctly finds no
active contract for Kandima, since the contract genuinely has no
validity before 2027-01-11. Not a bug.

---

# Decision 028

Date: 2026-07-08

Decision: Fixed a real bug in HotelSearch.tsx found via live browser
testing while creating a fresh Reservations-module test booking: any
hotel with zero ContractTransferOption rows configured could never be
booked at all. RoomTypeCard's grandTotal required
selectedTransferTotal != null before showing any total (and therefore
the "Забронировать" button), and handleBookingSubmit's guard
unconditionally required selectedTransferType -- but a hotel with no
transfer options has no radio button to ever select one, so
selectedTransferType can never become non-null, and both the total
and the booking button silently never appeared. Confirmed live: Test
Beach Resort (Contract.transfer_required=false, zero
ContractTransferOption rows) was completely unbookable through the UI
before this fix.

Fix: grandTotal now treats a missing transfer as a 0 contribution
(selectedMeal.price.final_total + (selectedTransferTotal ?? 0))
instead of blocking on it. handleBookingSubmit's guard now only
requires selectedTransferType when transferOptions.length > 0 AND
Contract.transfer_required is true (Kandima's real case -- unchanged
behavior, still blocks submission until an option is picked).
Deliberately does NOT silently allow submission for the edge case of
transfer_required=true with zero configured options (a contract
data-integrity problem, not a normal booking state) -- that combination
now surfaces an explicit error ("Контракт требует трансфер, но ни один
вариант трансфера не настроен...") instead of proceeding, per project
owner's explicit requirement that this case not be silently allowed.

Verified via the actual browser flow (Playwright-driven, real
localStorage-injected JWT against the running backend, not a direct
API call): Test Beach Resort search -> Beach Villa -> BB meal plan ->
guest details -> booking created (BK-8D6B9B5CA2DA), confirmed in the
database with the correct transfer_type=None and guest row attached.
No changes to the payload construction itself -- selectedTransferType
was already sent as-is (null when unset).

---

# Decision 029

Date: 2026-07-07

Decision: Full autonomous booking-modification workflow is a confirmed
future goal, to be built incrementally in stages, not all at once. The
complete target workflow: (1) agent changes booking dates through
their own login; (2) change reflects in Admin Panel immediately; (3)
automatic email confirmation sent to agent; (4) AI automatically
emails the hotel requesting confirmation of the new dates (Level 3
autonomous -- matches the established pattern for outbound
information-gathering emails, low risk, easily reversible); (5) AI
reads the hotel's email reply and determines whether to auto-confirm
or escalate; (6) if confirmed, AI updates the booking's confirmation
status; (7) AI notifies the agent of the final outcome via email and
in-app.

Build order (staged, not all at once):
Stage 1: Manual date-change capability in Reservations/Booking Engine
(agent or manager can change dates, system re-validates
availability/re-prices, releases old allotment + reserves new) -- pure
functionality, no AI yet.
Stage 2: Automatic email notifications (agent confirmation email, no
AI decision-making, just templated notifications) -- Level 3,
straightforward.
Stage 3: AI-Core Engine build-out (shared email-reading/sending
infrastructure, since this doesn't exist yet in any Engine).
Stage 4: AI auto-emails hotel requesting confirmation (Level 3,
outbound only).
Stage 5: AI reads hotel reply and prepares a recommendation, but a
human (manager) must approve before the booking's confirmation status
actually changes (Level 2 Gate) -- matching the original
reservation-workflow example from early in this project.

Reason: Per the AI Autonomy Levels framework: steps 1-4, 6
(notification), and 7 are Level 3 (autonomous, low-risk, informational
or easily-reversible). Step 5 (AI unilaterally deciding to confirm a
date change based on reading an email) is Level 2 -- requires a human
Gate before finalizing, since date changes affect pricing/season and
are a financial commitment with an external party (the hotel),
matching the established criteria for when Gates are mandatory.

Approved By: Daler

Status: Logged as staged roadmap. Starting now with Stage 1 (manual
date-change capability) as the first concrete implementation step.

---

# Decision 030

Date: 2026-07-08

Decision: Implemented Stage 1 of Decision 029's staged
autonomous-booking-modification roadmap: manual date-change capability
for Booking Engine, added post-LOCK (same additive-only precedent as
Decisions 011/015/022/026). New service.change_booking_dates(db,
booking_id, data: BookingDateChangeRequest) mirrors create_booking's
rigor rather than treating this as a simple field edit: rejects
terminal bookings (Cancelled/Rejected); re-resolves the active contract
for the NEW arrival_date via get_active_contract (may differ from the
booking's current contract_id if the new dates cross into a different
contract/season window); re-checks availability via check_allotment;
re-prices via get_room_price (meal_plan code resolved from the
existing meal_plan_id via get_contract_meal_plan) and, if a transfer
was selected, re-prices via get_transfer_price for the new dates too.
All of the above are read-only validation -- nothing is written if any
step fails.

Atomicity ordering: reserve_allotment on the NEW dates happens BEFORE
release_allotment on the OLD dates. If the new reservation fails,
nothing has changed and the old dates stay safely held -- a clean,
zero-side-effect rejection. Only after the new reservation succeeds
does this release the old dates and write the updated booking row
(new arrival_date/departure_date/nights/contract_id/rate_id/
total_amount/transfer_total plus date_change_reason/dates_changed_at).
If the booking-row write itself fails after the new reservation
succeeded and the old one was released, a compensating action releases
the new reservation and attempts to re-reserve the old dates -- if
that re-reservation also fails (a second, independent failure), the
booking ends up holding NEITHER old nor new inventory. This residual
risk is accepted for the same reason Decision 012 accepted the
analogous risk in create_booking: a real fix needs actual DB-level
transaction coordination across Hotel/Contract/Booking, which this
project doesn't have.

Per project-owner instruction, a date change requires a reason (same
audit precedent as cancellation's "every cancellation must have a
reason", 02_Logic_Rules.md #49): two new nullable columns on Booking,
date_change_reason and dates_changed_at, mirroring
cancellation_reason/cancelled_at's exact shape rather than a general
audit-note/edit-history field -- a full edit-history system belongs to
the future Audit & Log Engine, not scoped here. Same known
simplification as cancellation: only the LATEST date change's reason/
timestamp is retained, no history of prior changes.

New dedicated endpoint POST /booking-engine/bookings/{id}/change-dates
(BookingDateChangeRequest -> BookingResponse), separate from the
generic PUT /bookings/{id}, matching cancellation's own dedicated-
endpoint precedent rather than folding this into the generic update
path.

Verified via real HTTP calls against the live server using a real
Kandima booking (contract_id=2, room_type_id=2 "Sunrise Beach Pool
Villa with Swirlpool"): (1) changed dates from Peak season
(2027-02-01, base_price=1002, KM26_03 50% off -> total_amount=501)
to Low season (2027-05-01 to 2027-05-03, base_price=649, 50% off ->
total_amount=649) -- rate_id updated, total matched the hand-calc
exactly, old allotment (2027-02-01) released to sold=0, new allotment
(2027-05-01/02) correctly reserved to sold=1, checkout-exclusive
2027-05-03 untouched; (2) attempted a change into a date range with
zero allotment coverage (2027-06-01 to 2027-06-03) -- cleanly rejected
(ValueError/HTTP 400), confirmed byte-for-byte zero state change
(booking's updated_at untouched, allotment on the current dates
untouched, no allotment rows spuriously created for the rejected
range); (3) re-ran the full existing regression suite (9 checks
spanning Test Beach Resort, Kandima's original Peak pricing, occupancy
rejection, all 3 newer seasons from Decision 027, transfer pricing) --
zero regressions. Required adding 3 minimal test-support Allotment
rows for room_type_id=2 covering 2027-05-01/02/03 (same
minimal-test-data precedent as earlier sessions), left in place as
legitimate Low-season inventory data. The verification-only test
booking itself was cancelled and deleted afterward so the Reservations
table stays honest, real-data-only (per the project's standing
"no demo/placeholder data" rule) -- only the one real
browser-created booking (BK-8D6B9B5CA2DA) remains.

Approved By: Daler

Status: Stage 1 complete and verified. Next: Stage 2 (automatic email
notifications) per Decision 029's build order, or wiring this new
change-dates capability into the Reservations.tsx frontend so a
manager/agent can actually trigger it through the UI (not yet done --
this task only built and verified the backend capability itself).

---

# Decision 031

Date: 2026-07-08

Decision: Addendum to Decision 030 -- date changes are the FIRST of
several distinct booking-modification types the real business needs,
not the only one. Full list of editable fields, ranked by
implementation complexity:

1. Dates -- DONE (Decision 030). Requires re-pricing + allotment
   release/reserve on the date dimension.
2. Guest details (name/passport/flight info) -- low complexity. A
   simple field update with no pricing or inventory impact at all --
   closer to the existing special_requests/flight-number edit path
   than to a date change.
3. Meal plan -- medium complexity. Requires re-pricing (reuses the
   get_room_price re-pricing logic already built for dates) but does
   NOT touch allotment, since meal plan has no inventory dimension of
   its own.
4. Room type -- high complexity. Needs the same
   release-old-allotment/reserve-new-allotment discipline as dates,
   but for the room_type_id dimension instead of the date dimension --
   structurally the closest analogue to Decision 030's own design.
5. Hotel -- very high complexity. Not a true "edit" at all -- changing
   a booking's hotel is effectively cancel + rebook against a
   different Contract Engine hotel/contract entirely, and should be
   treated as such rather than forced into this edit-capability
   pattern.

Per Decision 029's staged, one-thing-at-a-time approach, each of these
gets its own explicit plan/implementation/verification pass -- never
bundled together. Recommended build order, by complexity ascending:
(1) guest details next -- simplest, zero pricing impact, highest
immediate value; (2) meal plan -- reuses date-change's re-pricing
logic directly; (3) room type -- reuses date-change's allotment
release/reserve logic, applied to a different dimension; (4) hotel --
deliberately deferred and reframed as cancel+rebook rather than
implemented as a fifth "edit" variant.

Reason: Confirms Decision 030's date-change work is a template for a
family of related capabilities, not a one-off -- future work in this
area should reuse its patterns (re-pricing before write, allotment
reserve-new-before-release-old, required reason field) rather than
re-deriving them from scratch each time.

On AI involvement: per Decision 029, the AI-driven pieces (AI deciding
when to initiate a change, AI emailing the hotel for confirmation)
remain Stages 3-5 and are not started. All booking-modification types
listed here (dates, guest details, meal plan, room type) are
human-initiated mechanisms only -- Stage 1's pattern repeated per
field -- which the later AI stages will eventually call into once
built, not something these additions need to anticipate now.

Approved By: Daler

Status: Logged as roadmap addendum to Decision 029/030. Proceeding
next with guest-details editing (item 2, simplest/highest-value).

---

# Decision 032

Date: 2026-07-08

Decision: Two tightly-related fixes to the Reservations/booking-edit
surface, logged together because the second is only trustworthy once
the first is true: (1) closed a real authorization gap where
change_booking_dates, cancel_booking, update_booking, and update_guest
never checked that the requesting user actually owned the booking
being modified -- any authenticated agent could edit or cancel any
other agent's booking via a direct API call, even though the UI only
ever showed/linked to an agent's own bookings; (2) added an active
"recently changed by an agent" notification to the admin Reservations
view, addressing a real scaling concern the project owner raised: at
volume (500 bookings/day, 100 agent-initiated changes/day), a manager
cannot manually re-open every booking to notice a change, so a passive
"discover it if you happen to click in" model doesn't scale.

Part 1 -- authorization: added _require_owner_or_admin(current_user,
booking) in booking/api.py, called after fetching the booking/guest
and before invoking the actual mutating service call, in all four
edit/cancel endpoints. Deliberately a real HTTP 403, not folded into
_run's generic ValueError->400 convention -- this is an authorization
failure, not a business-rule validation failure. Only the Admin role
is exempted (case-insensitive); Manager isn't wired to any
booking-editing surface yet, so exempting it now would be speculative.
Verified via direct API calls with real minted JWTs for 3 different
users: the booking's own agent succeeds (200), a different agent is
rejected (403 "You can only modify bookings you own"), and an admin
succeeds regardless of ownership (200) -- checked against both
update_booking and update_guest (the latter needed for its extra
guest-id -> booking-id indirection). Known related gap, NOT fixed here
since it wasn't part of what was asked: the read side (GET
/agents/{agent_id}/bookings) has the same missing check -- any agent
could still enumerate another agent's booking list by ID, though no
UI does this today.

Part 2 -- notification: reused the existing AI-insight-strip mechanism
(Decision-era rule-based, NOT an LLM call) rather than inventing a new
one. New computeRecentlyChangedFlags rule (admin view only, gated on
scope.type === "all" -- an agent doesn't need to be told about their
own edit) flags bookings whose dates_changed_at is within the last 24
hours, reusing the strip's existing "first flag + и ещё N" aggregation
for a natural count-style summary. A parallel "Изменено" badge was
added directly in the bookings table next to the booking number, so a
manager scanning the list (not just reading the strip) notices without
opening each row. This is explicitly NOT an approval queue -- the
agent's change is already applied and already holds/released the real
allotment; this is Level 3 autonomous action + notification (per the
AI Autonomy Levels framework), not a Level 2 human gate blocking the
agent.

Bug found and fixed during live verification of Part 2: the backend
serializes datetime.utcnow() as a naive ISO string with no "Z"/offset
suffix (e.g. "2026-07-08T13:18:14.668797"). new Date(...) on such a
string is parsed by JavaScript as LOCAL time, not UTC -- for any
viewer whose browser timezone isn't UTC+0, every elapsed-time
computation derived from it was silently wrong by exactly the local
offset. Caught live: a change made ~2 minutes earlier displayed as
"5 ч. назад" on this UTC+5 dev machine. Fixed with a parseUtcTimestamp
helper (appends "Z" before parsing, unless an offset is already
present) used by both computeRecentlyChangedFlags and the table
badge's isRecentlyChanged check. Display-only date formatting
(formatDate, used for arrival/departure/created_at everywhere else)
is unaffected and correctly local -- the bug was specific to
elapsed-time arithmetic on datetime fields, not date-only fields
(which JS parses as UTC by spec) or display formatting (where local
time is the correct, intended behavior).

Verified end-to-end live in the browser (not just via API): logged in
as the real test agent (istiklol90), changed BK-8D6B9B5CA2DA's dates
through the actual UI; the admin Reservations view immediately showed
both the "Изменено" badge on the row and the AI strip entry
"BK-8D6B9B5CA2DA (Test Beach Resort) -- даты изменены агентом
istiklol90 только что" (correct, post-timezone-fix) -- alongside the
pre-existing "В ожидании"/заезд-through-N-дн. flag for the same
booking, confirming the strip's multi-flag aggregation still works
correctly with 3 rule types active simultaneously.

Approved By: Daler

Status: Both fixes implemented and verified live (API-level for
authorization, full browser flow for the notification feature).
Known deferred gap: the read-side agent-scoped list endpoint has no
equivalent ownership check -- not fixed now, flagged for a future
decision if it becomes a real concern.

---

# Decision 033

Date: 2026-07-08

Decision: Addendum to Decision 029's staged autonomous-booking-
modification roadmap -- cancellation follows the identical staged
philosophy already established for date changes (manual now,
notification next, AI-driven hotel communication later), not a
separate plan of its own:

- NOW (Stage 1, done): cancellation is immediate/direct -- already
  implemented (Decision 032's authorization fix plus the frontend
  cancel-booking UI), with cancellation_fee computed per the
  contract's cancellation-policy tiers at the moment of cancellation
  (service._resolve_cancellation_fee).
- NEXT (small addition, this decision's implementation step): a
  "recently cancelled by agent" signal added to the existing AI
  insight strip, exact same pattern as Decision 032's "recently
  changed dates" signal -- so a manager notices a cancellation without
  manually opening every booking.
- FUTURE (Stage 4-5 of Decision 029's numbering, not started): when a
  cancellation carries NO penalty (inside the free-cancellation
  window), the system already allows it immediately today -- but nothing
  yet confirms the hotel has actually released the room on their end.
  This becomes an AI-driven follow-up task: AI emails the hotel
  confirming the cancellation, tracks whether the hotel acknowledges
  it, and reports the outcome to the manager. Per the AI Autonomy
  Levels framework (same reasoning as Decision 029's Stage 4 for date
  changes): the outbound email + tracking is Level 3 autonomous, since
  a free cancellation carries no new financial risk to auto-send --
  but any hotel non-response or dispute would need to escalate to a
  human via a Level 2 Gate rather than being silently resolved by AI.

Reason: Decision 031 already established that Decision 030's
date-change work is a template for a family of related
booking-modification capabilities, not a one-off. This extends that
same conclusion explicitly to cancellation, which was already built
(Decision 032) but never had its own place in the staged roadmap
Decision 029 laid out for dates. Keeping both under one staged
philosophy avoids re-deriving the AI-autonomy reasoning from scratch
for every future booking-modification type.

Approved By: Daler

Status: Logged as roadmap addendum to Decision 029/032. Implementing
the NEXT step now: a "recently cancelled by agent" AI-insight-strip
flag and a table badge, mirroring computeRecentlyChangedFlags/
isRecentlyChanged/the "Изменено" badge exactly (new
computeRecentlyCancelledFlags/isRecentlyCancelled off Booking's
existing cancelled_at field, admin-view-only, same 24h window). FUTURE
stage (AI-hotel-confirmation-email for free cancellations) remains
unstarted, same as Decision 029's Stages 3-5 for dates.

---

# Decision 034

Date: 2026-07-08

Decision: Three related outcomes from one investigation, logged together
since each step's finding drove the next: (1) implemented Green Tax as a
general, reusable Contract Engine mechanism, not Kandima-specific; (2)
found and fixed a real frontend bug where HotelSearch.tsx quoted transfer
prices that didn't match what Booking Engine actually charges; (3)
concluded the underlying KM26_03 transfer-discount test data itself
should be left as-is, since it correctly exercises a mechanism that's
now proven generically correct, even though its specific date-period
values are unverified against a clean source.

Part 1 -- Green Tax: added Contract.mandatory_tax_per_person_per_night
(Float, nullable) and Contract.mandatory_tax_label (String, e.g. "Green
Tax") -- general fields, not hardcoded to Kandima or Maldives, so any
future hotel's own government tax (VAT, City Tax, GST) reuses the same
mechanism with its own label. New service.get_mandatory_tax(db,
contract_id, nights, adults, children), deliberately its own function
rather than a step inside get_room_price -- same reasoning as
get_transfer_price being separate: a flat per-person-per-night charge
on adults+children (infants exempt, same 3-bucket convention
get_room_price/get_transfer_price already use), added AFTER
final_total's discounts/promotions, never itself discountable, since
it's a pass-through government charge, not a hotel service. New GET
/contracts/{id}/mandatory-tax endpoint. Booking gains its own
mandatory_tax_total column (Float, nullable), same separate-column
precedent as transfer_total -- never folded into total_amount, so
Finance Engine can itemize room vs. transfer vs. tax revenue
independently later. Wired into both create_booking and
change_booking_dates (recomputed for the new nights count on a date
change, same pattern transfer_total already follows). Migration: new
columns needed explicit ALTER TABLE against the live dmc.db (same
situation as every prior new-column-on-existing-table addition -- 022,
017 -- since Base.metadata.create_all doesn't retrofit live tables).
Kandima's contract set to 12.0 / "Green Tax" via the real
update_contract service call. Verified in isolation:
get_mandatory_tax(contract_id=2, nights=7, adults=2, children=1) ->
3 chargeable guests x $12 x 7 nights = $252.00 exactly.

Part 2 -- transfer-quote bug: investigating a project-owner-supplied
real quote ($3,140.50 for Sky Studio/BB, 2 adults + 1 child age 8,
18-25 March 2027, Domestic Comfort transfer) against the live system
surfaced a real inconsistency, not a data problem. HotelSearch.tsx's
RoomTypeCard computed the transfer total shown to the agent (both the
per-option line and the grand total) client-side via naive
price_adult*adults+price_child*children+... multiplication, sourced
from GET /transfer-options/available -- a raw catalog endpoint that
takes no check_in/nights parameters at all, so it structurally cannot
reflect any date-scoped SpecialOfferTransferDiscount. Meanwhile
create_booking (and the room-price side of the same search UI) both
correctly call the discount-aware get_transfer_price/get_room_price.
Net effect: the search UI quoted $1,128.00 (full price) for Domestic
Comfort while an actual booking would have silently charged $564.00
(50% KM26_03 discount) -- a one-directional quote-vs-charge mismatch
(always overstates, never understates), invisible except when a
transfer discount happens to be active. Fixed by making RoomTypeCard
fetch each transfer option's real price from GET /transfer-price
(mirroring the exact Promise.all pattern already used for meal-plan
pricing) instead of computing it client-side; the naive multiplication
is now used only for the still-accurate per-person base-rate line
items, never for any total actually displayed. Verified: transfer-price
for domestic_comfort (2 adults, 1 child, 2027-03-18 to 2027-03-25) ->
$564.00; combined with Sky Studio/BB's room total ($1,760.50) ->
$2,324.50 pre-tax, matching hand-calculation exactly. Test Beach
Resort's contract has zero transfer options and no special offers
configured at all, so its search card renders no Transfer section at
all, both before and after this fix -- confirmed structurally
unaffected, nothing to regress.

Part 3 -- test-data validity, DECIDED, no code change: re-checking the
original KM26_03 document's exact "SPECIAL TRANSFER RATES" clause
("50% discount on Domestic transfers (Comfort Class ONLY!) and 25%
discount on Seaplane transfer. Subject to minimum 4 nights stay ...
DETERMINED BASED ON THE GUEST'S ARRIVAL DATE...") confirmed it's
genuinely contract-wide (no room-type restriction, sits in a
contract-wide rates table alongside undifferentiated MEAL PLAN
DISCOUNT/ROOM UPGRADE rows) -- so SpecialOfferTransferDiscount's
schema (no room_type_id column) is structurally correct, not a gap.
18-25 March 2027 (7 nights) does fall inside one of the 4 stored
"CONTRACTED OFFER" transfer-discount windows (2027-01-11 to
2027-04-04) and clears the 4-night minimum, so per the clause AND per
our stored data, the 50% discount legitimately applies -- meaning the
system's $564.00 is correct given this data, and the project owner's
$3,140.50 real-quote figure (implying a full-price, undiscounted
transfer) must come from a different source/scenario than an
KM26_03-eligible booking, not from a flaw in how the discount period
was modeled. Since the exact real-world period boundaries were
originally entered from an unverified PDF-text-extraction inference
(not a confirmed clean source) rather than because the mechanism
itself is wrong, the decision is to leave the existing test data
active and unchanged: it correctly exercises period gating (inside
vs. outside the window), minimum-nights gating (4-night threshold),
and transfer-type scoping (comfort discounted, sapphire not,
independently), all already verified in Decision 026's own
verification pass and re-confirmed here. If/when the real KM26_03
period boundaries are confirmed from a clean source, only the stored
SpecialOfferTransferDiscount row values need correcting -- zero code
changes, since the mechanism (percentage off a transfer_type, gated by
period + min_nights, contract-wide) is proven generically correct and
reusable for any future real transfer-discount offer, not just
Kandima's.

Reason: Separates two genuinely different classes of problem that
surfaced in the same investigation -- a real code bug (frontend
computing prices outside the single source of truth, Part 2, fixed
immediately) vs. unverified test data exercising a correctly-built
mechanism (Part 3, deliberately left alone, since correcting
unconfirmed period boundaries now would just replace one unverified
guess with another). Matches the project's standing principle of not
changing business logic/data without owner confirmation.

Approved By: Daler

Status: Parts 1 and 2 implemented and verified (Green Tax feature
complete end-to-end; HotelSearch.tsx transfer-quote fix compiles clean
and matches direct backend verification). Part 3 is an explicit
no-code-change decision -- special_offer_transfer_discounts rows left
active and unchanged. Known follow-up, not yet scoped: if Kandima's
real transfer-discount period boundaries are ever confirmed from a
clean source (not PDF-text-extraction inference), only data needs
updating, per Part 3's reasoning.

---

# Decision 035

Date: 2026-07-07

Decision: AI Core Engine Foundation architecture is formally adopted, as
specified below. This becomes the binding specification for AI Core
Engine (#3 in the 22 Core Engines list), superseding informal AI
discussion from earlier decisions (004, 029, 033) with this detailed,
authoritative design.

TASK -- AI Engine Foundation (Phase 1: Contract Ingestion)

Goal:
Design and implement the foundation of the AI Engine that will become
the central intelligence layer of DMC OS. The first business capability
is automatic hotel contract ingestion. AI must read hotel contracts
(PDF), extract structured data, present the results for human
verification, and only after approval save the contract into Contract
Engine.

Important architectural principle:
The AI Engine must NEVER depend on a specific AI provider. Claude, GPT,
Gemini or future local models are interchangeable providers. The AI
Engine owns the business workflow; external LLMs are only inference
providers.

Architecture requirements:

AI Engine responsibilities:
- Model Router (provider abstraction)
- Prompt Manager
- Contract Parser
- Validation layer
- Confidence Scoring
- Human Gate
- AI Memory (future)
- OCR integration (future)
- Logging and audit trail

External model responsibilities:
- Read text
- Extract structured information
- Explain uncertain clauses
- Return structured JSON only

Contract Engine responsibilities:
- Store approved contract data only
- Never parse PDFs
- Never communicate directly with Claude/GPT

Workflow:

1. User uploads a hotel contract PDF.
2. AI Engine sends the document through the Model Router to the
   configured provider (Claude/GPT).
3. The model extracts:
   - Hotel information
   - Seasons
   - Room types
   - Meal plans
   - Rates
   - Occupancy
   - Child policy
   - Cancellation policy
   - Transfers
   - Supplements
   - Special offers
   - Blackout dates
   - Minimum stay
   - Other supported contract entities.
4. AI Engine validates the returned structure.
5. Every extracted field receives a confidence score.
6. Low-confidence items must include:
   - original contract text,
   - AI interpretation,
   - explanation of why confidence is low.
7. Nothing is written into Contract Engine yet.
8. Manager reviews every extracted section inside DMC OS.
9. Manager approves or edits the extracted data.
10. Only after explicit approval (Level 2 Human Gate) does AI Engine
    send the final structured data into Contract Engine.
11. Contract Engine stores the approved contract.
12. Every step must be logged for audit.

Autonomy Levels:
- Parsing and extraction: Level 3 (Autonomous)
- Validation and confidence scoring: Level 3
- Saving into Contract Engine: Level 2 (Human Gate required)
- No automatic publication of rates without approval.

Provider abstraction:

Create an interface so the rest of the system never knows whether the
active provider is:
- Claude
- GPT
- Gemini
- Local LLM

Changing providers must require changing configuration only, never
business logic.

Design requirements:
- No duplicated AI logic inside other Engines.
- Every Engine will call AI Engine when intelligence is required.
- AI Engine is the only component allowed to communicate with LLM
  providers.
- Business rules remain inside their respective Engines.
- AI Engine supplies intelligence, not business logic.

Deliverables:
1. Design the AI Engine architecture.
2. Define module structure.
3. Define provider abstraction interfaces.
4. Define contract parsing pipeline.
5. Define confidence scoring model.
6. Define Human Gate workflow.
7. Define communication contract between AI Engine and Contract Engine.
8. Update architecture documentation.
9. Do not implement OCR or provider-specific code yet unless required
   by the architecture.
10. Stop after the architecture and foundation are complete, present
    the design for review before implementing production logic.

Objective:
Build an AI Engine that can grow into the central intelligence platform
for the entire DMC OS, where hotel contract ingestion is only the first
capability. Future capabilities (email understanding, booking
verification, document analysis, pricing recommendations, autonomous
workflows, etc.) must reuse the same AI infrastructure without
architectural changes.

Reason: This formalizes the AI-first architecture goal established at
project inception into a concrete, implementable specification. Key
principles: (1) AI Core Engine owns ALL LLM communication -- no other
Engine may call Claude/GPT/Gemini directly, preventing duplicated AI
logic across Engines; (2) provider-agnostic design via a Model Router
abstraction; (3) mandatory confidence scoring with human-readable
explanations for low-confidence extractions -- directly addressing the
real transcription-ambiguity problem encountered today with KM26_03's
transfer-discount periods; (4) Level 2 Human Gate strictly on the
"save to Contract Engine" step; (5) this architecture must generalize
to ALL future AI capabilities without requiring rework.

Approved By: Daler

Status: Logged as binding architectural specification. Implementation
begins with TASK-000 for AI Core Engine, following the established
one-Engine-at-a-time discipline.

---

# Decision 036

Date: 2026-07-07

Decision: "AI Core Evolution Rule" -- every new AI component (beyond
the initial minimal MVP) must answer three questions before being
implemented (not just scaffolded):

1. What business problem does it solve?
2. What existing AI capability already proved this component is
   necessary?
3. Can we temporarily do without it?

This applies specifically to AI Core Engine's advanced components
(Knowledge Base, Context Manager, full Skills-as-plugins system,
Learning, Metrics) -- their structural skeleton is created now (per the
full AI Core Foundation vision, Decision 035), but their real
implementation is gated by this rule: build only once a real, working
AI capability has demonstrated the need, not speculatively in advance.

Reason: Prevents over-engineering AI Core with untested abstractions
before we have even one proven AI capability (contract parsing) working
end-to-end. Matches the project's established discipline of building on
proven foundations (same principle applied to every other Engine:
scaffold first, implement incrementally, verify before expanding) --
but explicitly formalized for AI Core given its unusually large and
ambitious full vision.

Approved By: Daler

Status: Logged as a binding development rule specifically for AI Core
Engine's growth, alongside the one-Engine-at-a-time rule already
governing the whole project.

---

# Decision 037

Date: 2026-07-12

Decision: TASK-000 for AI Core Engine completed. Confirmed via code
search: the AI Core Engine skeleton exists but is empty (14 top-level
files + ai/ subfolder with 7 files, all 0 bytes; docs/, integrations/,
tests/ are empty directories) -- same shape Decision 001 confirmed for
Hotel Engine. One piece of pre-existing AI-labeled code exists
elsewhere in the project: backend/services/ai_service.py, a rule-based
(no LLM call, no OpenAI/Anthropic dependency) heuristic used by the
agent-registration approval flow to compute a risk_score/recommendation
from basic field checks (email format, phone length, company name
length) -- already documented as a stand-in in CLAUDE.md. This is a
different business domain than Phase 1's contract ingestion and touches
no LLM provider at all, so per Decision 036's evolution rule, migrating
or rewriting it now would be speculative ahead of proven need -- left
in place, unmigrated, flagged here rather than silently ignored.

Reason: Verify a clean starting point before beginning schema/domain
design (TASK-001/TASK-002), per the one-Engine-at-a-time rule in
CLAUDE.md and the exact verification precedent Decision 001 set for
Hotel Engine.

Approved By: Daler

Status: TASK-000 complete. TASK-001 Status: READY FOR ANALYSIS.

---

# Decision 038

Date: 2026-07-12

Decision: TASK-001/TASK-002 for AI Core Engine completed -- domain
model designed and implemented. Four tables in
backend/app/engines/ai_core/models.py, scoped strictly to Decision
035's Phase 1 (Contract Ingestion) 12-step workflow, with Decision
036's advanced components (Knowledge Base, Context Manager,
Skills-as-plugins, Learning, Metrics) deliberately left as empty ai/
skeleton files, not modeled:

1. ContractIngestionJob -- one row per uploaded PDF, status moves
   uploaded -> processing -> extracted -> under_review ->
   approved/rejected/failed. hotel_id and contract_id are plain
   Integers, not ForeignKeys, matching Contract/Booking Engine's
   established cross-engine decoupling precedent -- contract_id stays
   NULL until step 11 actually writes to Contract Engine.
2. ExtractedField -- one row per extracted data point, scoped to a
   job via a real intra-engine ForeignKey. entity_type is a plain
   String, not a fixed enum column -- same "flexible core" precedent
   RateSupplement.adjustment_type set in Contract Engine, confirmed
   with the project owner before implementing: any future contract
   entity type Decision 035's list doesn't yet name is just a new
   string value here, never a schema change. field_data is a Text
   column holding JSON-serialized content, since no native JSON
   column type is used anywhere else in this project.
   confidence_score is 0-100 (matching discount_percent's existing
   percent convention, not a 0-1 float). original_text/
   ai_interpretation/low_confidence_reason are nullable, populated
   only for low-confidence fields per workflow step 6.
3. ModelProviderConfig -- the concrete data behind the Model Router
   abstraction (provider_name, is_active, config_key). Never stores
   actual credentials -- config_key is only a reference (e.g. an env
   var name), same "secrets live in env, never DB" precedent as
   Authentication Engine's SECRET_KEY.
4. HumanGateDecision -- one row per manager action (approve/edit/
   reject) at the Level 2 Human Gate, satisfying workflow step 12's
   audit-trail requirement.

Migration: four new tables, additive-only via Base.metadata.create_all
(no existing table touched) -- unlike several prior Contract/Booking
Engine columns, this needed no ALTER TABLE since these are brand-new
tables, not new columns on already-existing ones. Registered in both
init_db.py copies (backend/init_db.py and backend/database/init_db.py),
matching the established dual-file precedent. Verified via direct
sqlite3 inspection: all 4 tables created with the exact columns/types
designed, and the full 36-table list confirmed nothing else was
touched.

Reason: Turns Decision 035's workflow specification into the minimal
concrete schema needed to implement it, without modeling any of
Decision 036's gated advanced components speculatively ahead of proven
need.

Approved By: Daler

Status: TASK-002 complete. Proceeding to TASK-003 (repository/service
layer) next, following the same lifecycle every prior Engine went
through.

---

# Decision 039

Date: 2026-07-12

Decision: TASK-003 for AI Core Engine completed -- repository.py (thin
CRUD per entity, same get_db/create/get/list/update pattern every other
Engine uses, status changes kept separate from field updates) and
service.py (workflow orchestration only, zero real provider calls).

repository.py: create/get/list/update per entity across all four
tables, plus update_contract_ingestion_job_status and
update_model_provider_config_active as separate status-only functions
(matching Contract/Booking Engine's update_X_status precedent).
HumanGateDecision deliberately gets no update function -- an
append-only audit trail, same "never mutate history" principle as
Booking Engine's cancellation fields.

service.py: implements Decision 035's 12-step workflow as an explicit
forward-only state machine (VALID_TRANSITIONS: uploaded -> processing
-> extracted -> under_review -> approved/rejected, with "failed"
reachable from any non-terminal status for provider/extraction errors).
Unlike Booking Engine's validate_status_transition (one narrow
allotment-release boundary), this enforces the full sequence, since a
job's status IS the workflow here, not an incidental field. Key
functions: create_ingestion_job (step 1, validates hotel_id against
Hotel Engine only if given), start_processing/mark_extracted/
submit_for_review (steps 2-8's pure status transitions),
record_extracted_field (steps 3-6, raises ValueError if
confidence_score < LOW_CONFIDENCE_THRESHOLD=70 without all three of
original_text/ai_interpretation/low_confidence_reason),
approve_job/reject_job (the Level 2 Human Gate, steps 9-10's decision
half -- both record a HumanGateDecision row; reject_job requires a
non-empty reason, same precedent as Booking Engine's cancellation
reason), and set_active_provider (enforces exactly one active provider
at a time, making a provider switch a config change per Decision 035's
abstraction principle, since repository's update_model_provider_config_active
deliberately only touches the one row it's given).

Exactly as scoped: approve_job's docstring explicitly marks where the
real Contract Engine write (steps 10-11) will go once a later task
adds it -- not implemented now, per Decision 035 deliverable #9/#10 and
the project owner's explicit instruction this session. No Model Router
dispatch, no OCR, no provider-specific code anywhere in this file.

Verified via 19 live assertions against the real dmc.db (not a test
DB): full happy path uploaded->approved with both a high-confidence and
a low-confidence (with required explanation) field; low-confidence
field rejected when explanation fields are missing; reject path with
empty-reason rejection then a valid rejection; out-of-order transition
(uploaded -> under_review) blocked; mark_failed from mid-pipeline;
terminal-status transition blocked after approval; provider config
creation, exactly-one-active enforcement across a switch, and duplicate
provider_name rejection. All 4 new tables' test rows deleted afterward
to keep the database real-data-only, same precedent as Decision 030.

Approved By: Daler

Status: TASK-003 complete. Next: architecture/foundation review before
any production logic (Model Router, real provider calls, Contract
Engine write) is implemented, per Decision 035's deliverable #10.

---

# Decision 040

Date: 2026-07-12

Decision: TASK-004 for AI Core Engine completed -- schemas.py and
api.py, exposing the reviewed TASK-003 workflow as 16 authenticated
REST endpoints under /ai-core-engine, following after the foundation
review (state machine, low-confidence explanation requirement,
append-only Human Gate audit trail, zero provider/Contract Engine
calls) was approved as-is.

schemas.py: request/response models per entity. entity_type and
provider_name stay plain str, never Literal -- a Literal would
contradict Decision 035's provider-abstraction principle (adding a
provider must be a config/data change, never a code change) and
Decision 038's confirmed open-string precedent for entity_type.
created_by/reviewer_id are absent from every request schema by
design -- resolved from the authenticated user in api.py, never
client-supplied, since spoofing who performed an audited Human Gate
action would defeat its whole purpose (a stricter rule than
BookingCreate's agent_id, which IS client-supplied since an admin can
book on behalf of an agent -- no equivalent "on behalf of" case exists
here).

api.py: same JWT-duplication pattern as Hotel/Contract/Booking Engine
(Decision 006, accepted as-is -- now the fourth Engine repeating it)
and the same ValueError->400 _run helper. 16 endpoints across jobs
(create/list/get + 4 status-transition actions), Human Gate
(approve/reject/list-decisions), extracted fields
(create/list/edit), and provider config (create/get-active/activate).
No file-upload handling (multipart) -- file_reference is a plain
string reference in the request body, since no real storage layer
exists yet (05_Architecture.md's S3-compatible storage remains
aspirational, per CLAUDE.md's reality-vs-docs gap); real upload
handling is deferred alongside the Model Router/OCR work. Router
mounted in main.py alongside Hotel/Contract/Booking Engine's.

Verified via 19 real HTTP calls against the live server (not direct
function calls) -- same rigor as Booking Engine's original
verification, per the project owner's explicit request. Logged in as
admin@dmcos.com (password reset to the documented CLAUDE.md value
first, since the stored hash didn't match it -- a local dev-DB fix,
not a business change). Full happy path uploaded -> processing ->
extracted -> under_review -> approved via POST calls, confirming
created_by/reviewer_id correctly resolved server-side from the JWT
(not client input) at every step. Confidence-score validation
confirmed at the HTTP layer: a low-confidence field without
explanation fields returned 400 with the exact service.py message; the
same field with all three explanation fields returned 201. Reject path
confirmed: an empty-notes rejection was blocked at 422 by Pydantic's
min_length before ever reaching service.py, a valid rejection
succeeded and transitioned the job to "rejected". Out-of-order
transition (uploaded -> under_review directly) blocked at 400 with the
exact allowed-transitions message. Terminal-status transition
(approved -> processing) blocked at 400. Provider config: created two
providers, confirmed GET /providers/active correctly 404s with none
active, activating one flips is_active and GET /providers/active
reflects it. Unauthenticated request to GET /jobs correctly returned
401. All 4 tables' test rows deleted afterward, database confirmed
real-data-only.

Approved By: Daler

Status: TASK-004 complete and verified end-to-end via live HTTP. AI
Core Engine's REST surface for the reviewed workflow is done. Next:
Model Router / real provider integration and the Contract Engine write
step are separate, not-yet-started tasks, per Decision 035's
deliverable #9/#10 -- LOCK is not yet appropriate until those exist and
are themselves reviewed.

---

# Decision 041

Date: 2026-07-12

Decision: Model Router built (Decision 035's provider-abstraction
piece) as backend/app/engines/ai_core/providers.py, plus a
MockClaudeProvider standing in for the real Claude integration until
the project owner is ready to pay for live API usage -- deliberately
NOT making any real, billed Anthropic API call this session.

providers.py is the only module in this Engine, or any other Engine,
that imports a provider SDK -- ModelProvider is a Protocol (plain
Python types only: str/list/dataclass, no SDK types leak into the
interface) with one method, extract_contract_data(document_text,
entity_types) -> list[ExtractionFieldResult]. ExtractionFieldResult's
fields are shaped to match service.record_extracted_field's parameters
exactly, so callers never need a translation layer.

ClaudeProvider (built, not yet run for real): uses
client.messages.parse() with a Pydantic output_format schema (the
SDK's recommended structured-outputs path) against model
"claude-opus-4-8", guaranteeing valid JSON instead of freeform-text
parsing. The confidence-scoring rubric (100 = stated verbatim; 70-99 =
clear but requires minor interpretation; below 70 = ambiguous/inferred,
mandatorily paired with original_text/ai_interpretation/
low_confidence_reason) lives entirely in the system prompt
(ai/prompts.py) -- Claude has no built-in introspective confidence
signal; this rubric is what makes confidence_score meaningful at all,
a limitation surfaced to the project owner before building anything,
not discovered after. Reads its API key from os.environ[config_key]
(never hardcoded, never stored in the DB), matching the SECRET_KEY/SMTP
"secrets live in env, never DB" precedent -- backend/.env still doesn't
exist in this project, so this class has never actually been
instantiated with a real key.

MockClaudeProvider: same ModelProvider contract, zero API calls, zero
cost. Returns a small canned-response table (currently just
"hotel_name" -> "Kandima Maldives" at confidence 98) filtered to
whatever entity_types are requested; document_text is accepted but
ignored, since there's nothing to parse. get_provider(provider_name) is
the Model Router itself -- the single place provider_name resolves to
a concrete instance -- making a provider switch a set_active_provider
data change (Decision 039), never a code change, exactly matching
Decision 035's abstraction principle.

Two real ModelProviderConfig rows persisted (not cleaned up --
genuine system configuration, not test data): "mock" (active,
config_key=NULL) and "claude" (inactive, config_key=
"ANTHROPIC_API_KEY", ready to flip on via set_active_provider once a
real key is added to backend/.env and the project owner chooses to
start paying for usage).

Verified via a live end-to-end run against the real dmc.db (not a
mock DB) exercising every already-built TASK-003 service function with
the mock provider standing in for the real one: create_ingestion_job
-> start_processing -> get_active_provider resolves "mock" ->
get_provider("mock") returns a MockClaudeProvider ->
extract_contract_data returns the canned hotel_name result ->
mark_extracted -> record_extracted_field persists it correctly
(entity_type/field_data/confidence_score all verified by direct
assertion) -> list_extracted_fields confirms it -> submit_for_review
-> approve_job -> list_human_gate_decisions confirms the audit row.
Job/field/decision rows deleted afterward (test artifacts from a
fabricated document_text, not a real ingestion event); the two
provider config rows were kept.

Reason: Proves the entire pipeline built across TASK-000-004 actually
works end-to-end with a real (if mocked) provider plugged in, without
spending real money before the project is live -- and proves the
provider-abstraction design itself works, since the exact same
service.py call sequence would work unchanged with ClaudeProvider once
a key exists. This was a deliberate scope change from the original
plan (a real Claude API test call) after the project owner flagged
that no API key should be provisioned yet.

Approved By: Daler

Status: Model Router and both providers implemented and verified.
ClaudeProvider is built but has never made a real API call -- that
remains gated behind backend/.env getting a real ANTHROPIC_API_KEY and
an explicit decision to start paying for usage. No Contract Engine
write step yet, per Decision 035's deliverable #10 -- still not
appropriate to LOCK.

---

# Decision 042

Date: 2026-07-12

Decision: Implemented Decision 035's workflow step 10-11 -- AI Core
Engine's first real write into another Engine's data. New module
backend/app/engines/ai_core/contract_writer.py holds
write_approved_fields_to_contract_engine(db, job), called from
service.approve_job after the HumanGateDecision("approved") row is
recorded but before the job's status is set. It reads a job's approved
ExtractedField rows, maps hotel_name/country/city to Hotel Engine's
real HotelCreate schema, and calls Hotel Engine's own service.create_hotel
unchanged -- no validation or business logic duplicated inside AI Core
Engine. If job.hotel_id was already set (an existing hotel picked at
upload time), no new Hotel is created; the existing id is reused as-is.

Scope deliberately stays at "one Hotel row," not a full Contract with
seasons/rates -- MockClaudeProvider still only produces 3 entity types.
job.contract_id stays NULL; only job.hotel_id gets set. If
write_approved_fields_to_contract_engine raises ValueError (required
fields missing), service.approve_job routes the job to mark_failed
instead of "approved" -- verified live: approving a job with only
hotel_name (no country/city) correctly ends in status "failed" with zero
Hotel rows created, while the HumanGateDecision("approved") audit row
still persists, matching the "the human's approval happened regardless
of system outcome" framing. A single create_hotel call is one INSERT, so
this is naturally atomic today; a future version writing a full
multi-entity Contract will need Decision 012's compensating-action
discipline -- not needed yet for one row.

MockClaudeProvider's canned-response table expanded from just
"hotel_name" to also return "country" -> "Maldives" and "city" ->
"Dhaalu Atoll" (real Kandima facts, not invented placeholders) so the
success path is actually reachable through the Mock provider, not just
provable on the failure path. run_extraction's hardcoded entity_types
list grew from ["hotel_name"] to ["hotel_name", "country", "city"] to
match. ContractsAI.tsx's ENTITY_TYPE_LABELS gained "country" -> "Страна"
and "city" -> "Город".

Reason: Direct user request, scoped deliberately to what MockClaudeProvider
can actually produce today rather than attempting a full contract write
the current pipeline has no data for.

Verified live end-to-end: created a fresh job, ran it through
run-extraction (now returning all 3 fields) -> submit-for-review ->
approve. Confirmed via Hotel Engine's own /hotel-engine/hotels/{id}
endpoint that a real Hotel row was created (hotel_name="Kandima
Maldives", country="Maldives", city="Dhaalu Atoll", status="Draft" --
create_hotel's own default, never settable by the caller), and that
job.hotel_id was set to that hotel's real id while job.contract_id
stayed null. Confirmed the new hotel appears in
GET /hotel-engine/hotels (the same unfiltered endpoint HotelSearch.tsx
calls -- neither Hotel Engine's list_hotels nor HotelSearch.tsx filter
by status, so Draft-status AI-created hotels are searchable immediately,
just with no room types/prices yet since none were extracted) and that
its /room-types endpoint returns a clean empty list rather than an
error, which HotelSearch.tsx's existing "no active contract" fallback
already handles gracefully.

Also verified the failure path against 3 pre-existing under_review jobs
that only had hotel_name extracted (from before this session's mock
expansion) -- approving one correctly produced status "failed" with no
Hotel row created and no change to the hotel count.

Unrelated infrastructure finding surfaced during verification, corrected
within this same session: port 8001 initially appeared to have
independently developed Decision 014's exact "orphaned/phantom socket,
unkillable via taskkill/Get-Process" symptom -- a literal socket bind
failed with WinError 10048 despite no process visibly owning the port.
Frontend/CLAUDE.md were briefly (and, it turned out, incorrectly) moved
to port 8002 to work around this. Root-caused before finalizing: on
Windows, `taskkill /PID <n> /F` (no `/T`) only kills the named process,
not its children -- and uvicorn --reload spawns its actual worker via
Python's `multiprocessing` (`spawn_main`), a separate child process
whose ParentProcessId is the reloader PID. Killing only the reloader
leaves this child alive, still bound to the listening socket, invisible
under the PID anyone would think to kill -- looking exactly like an
unkillable phantom. Confirmed via `Get-CimInstance Win32_Process |
Where-Object {$_.CommandLine -match "multiprocessing"}`: ports 8000,
8001, and briefly 8002 each had exactly one such orphaned child (from
this session's own earlier taskkills, including the original Decision
014 incident's PID). Killing all three orphaned children freed all
three ports immediately -- no phantom, no reboot needed. Reverted
frontend/src/config.ts and CLAUDE.md back to port 8001, matching
Decision 014's existing standard; CLAUDE.md's Commands section now
documents the correct kill procedure (`Get-CimInstance` to find the
orphaned multiprocessing child, or `taskkill /PID <n> /F /T` up front)
so this doesn't get misdiagnosed as a phantom again.

Approved By: Daler

Status: Implemented. contract_writer.py, service.py's approve_job,
providers.py's MockClaudeProvider, and ContractsAI.tsx's
ENTITY_TYPE_LABELS all updated. Live-verified both the success path
(real Hotel row created, hotel_id set, searchable) and the failure path
(job correctly marked "failed", zero partial writes). CLAUDE.md's
Booking Engine/AI Core section should be updated to reflect this new
capability in a follow-up pass.

---

# Decision 043

Date: 2026-07-13

Decision: Scoped AI Core Engine's full-contract extraction (the
expansion beyond the single-Hotel write-through of Decision 042) to
Phase 1 = the "standard" contract structure only: room_type (with
occupancy options), season, age_category, meal_plan, transfer_option,
rate, rate_supplement (covering extra_person/age_category_price/
meal_plan_supplement), plus contract-level mandatory_tax_*. Explicitly
deferred to a future Phase 2, not built now: Promotion, SpecialOffer
(and its 4 sub-mechanism tables: room discounts, meal-plan discounts,
family rules, transfer discounts), BlackoutDate, CancellationPolicy.

Reason: Not because these are unimportant -- Contract Engine's own
SpecialOffer design (Decision 026, the real KM26_03 offer) needed 4
independent mechanism tables to represent one real promotional package,
each with its own eligibility rules (min_adults, min_nights,
combinability, stacking groups). Extracting that reliably from
unstructured contract text is a materially different, harder problem
than extracting a rate grid, and deserves its own dedicated design pass
-- prompt schema, ref-resolution strategy, and human-review UI --
rather than being bolted onto Phase 1's entity taxonomy under time
pressure. Matches Decision 036's "build only once a proven need exists"
discipline: Phase 1's 8-entity taxonomy already fully exercises the
ref-resolution/write-through mechanism end-to-end; adding 4 more
complex, interdependent entity types now would validate the same
mechanism twice while multiplying design risk.

Consequence: A contract with promotions/special offers/blackout
dates/cancellation policies will have those clauses silently
un-extracted in Phase 1 -- the human reviewer sees and approves only
the standard-structure fields Phase 1 asks for. This is consistent with
the existing "only extract entity types explicitly requested" prompt
instruction, not a new gap it introduces.

Approved By: Daler

Status: Scope decision, no code change.

---

# Decision 044

Date: 2026-07-13

Decision: Contract Engine's LOCKED check_allotment/reserve_allotment now
treat a *missing* Allotment row (no row at all for a given room
type/date, as opposed to a row that exists but is inactive or has zero
available_rooms) as permissive ("assume available") by default, instead
of the original blocking ("assume unavailable") behavior. Governed by a
new config.is_allotment_strict_mode() (backend/app/engines/contract/
config.py, previously empty scaffolding) reading ALLOTMENT_STRICT_MODE
from the environment, defaulting to false (permissive) since
backend/.env doesn't currently set it. release_allotment needed no
change -- it already treats a missing row as "nothing to release,"
unconditionally, by original design.

This ONLY changes the missing-row case. An Allotment row that exists but
is inactive or has available_rooms <= 0, or an active Stop Sale blocking
a night, still returns False / raises unconditionally in both functions,
strict mode or not -- permissive mode fills the "no data exists" gap, it
never overrides a real "no" signal.

Reason: A live booking against room_type_id=3 (Sky Studio, contract 2)
was rejected with "Room type 3 is not available for 2027-05-20 to
2027-05-27." Traced directly (not assumed): zero Allotment rows exist
for room_type_id=3 for any date, ever -- confirmed via direct DB query.
Across the entire project, only 2 of 12 room types across every contract
have any Allotment data at all. This is a project-maturity gap (no real
per-day hotel inventory feed exists yet, per Decision 019's long-term
vision being unbuilt), not a per-contract data-quality difference, so a
global env-driven flag was chosen over a per-contract schema addition --
matches the existing SECRET_KEY/EMAIL_*/ANTHROPIC_API_KEY env-var
precedent already established in this project, requires no migration,
and needs zero code changes to reverse.

Revert path: set ALLOTMENT_STRICT_MODE=true in backend/.env to restore
the original LOCKED behavior byte-for-byte -- verified live (see
Status). No code change needed to flip back once real per-day inventory
data starts flowing in (manual entry, AI Core Engine extraction, or a
future direct hotel integration).

Approved By: Daler

Status: Implemented and verified live in all 3 planned scenarios: (1)
the room_type_id=3 booking that failed now succeeds with the flag
unset/false: (2) temporarily setting ALLOTMENT_STRICT_MODE=true
reproduces the exact original failure message, proving strict mode is a
byte-for-byte restore, not a different code path; (3) room_type_id=2
(which has real Allotment data) is unaffected either way -- its explicit
capacity signals still enforce correctly regardless of the flag. Exact
verification transcript recorded in this session's tool output.

---

# Decision 045

Date: 2026-07-13

Decision: Added a "Взято в работу" (claimed/in-progress) tracking layer
to LOCKED Booking Engine, orthogonal to the existing business `status`
field. Two new nullable Booking columns, additive-only (same precedent
as date_change_reason/cancellation_reason etc. added post-LOCK):
claimed_by (plain Integer, no ForeignKey) and claimed_at (DateTime). New
service.claim_booking(db, booking_id, claimed_by), restricted to
status == "Pending" (raises otherwise) and to a not-yet-claimed booking
(raises if claimed_by is already set, rather than silently overwriting
who claimed it). New POST /booking-engine/bookings/{id}/claim, no
request body -- claimed_by resolved server-side from current_user.id,
same "never trust client input for identity" precedent as created_by/
reviewer_id elsewhere.

Design note on claimed_by's type: deliberately kept a plain Integer with
no discriminator column, matching every other cross-boundary identity
reference in this project (agent_id, created_by, reviewer_id). Per
Decision 029's staged AI-autonomy roadmap, once AI Core Engine reaches
Stage 4/5 (AI proposing/handling actions on a booking after manager
approval), the identical claimed_by mechanism would represent "AI took
this into its own queue," with the AI acting through a designated system
User row -- zero schema change needed then. A claimed_by_type
enum/discriminator was considered and deliberately NOT added now: no
real AI-agent identity exists yet to test it against, and building it
speculatively would repeat the exact mistake Decision 036 already warned
against elsewhere in this project.

Known, flagged authorization gap (explicitly documented, not silently
skipped, same precedent as Decision 032's Admin-only exemption): the
claim endpoint is deliberately NOT wrapped in _require_owner_or_admin --
that check verifies an AGENT owns the booking they're editing, the
opposite direction from claiming (a manager taking ownership of
reviewing someone else's booking). Any authenticated user can currently
call POST .../claim, not just an Admin/Manager role -- Manager isn't
wired to a distinct role check anywhere in Booking Engine yet, so adding
one here would be speculative rather than addressing a concrete need.
Frontend exposure is restricted via a new Permissions.canClaim flag
(true in AdminPanel.tsx, false in AgentDashboard_v2.tsx), but this is a
UI-level restriction only, not a backend guarantee.

Frontend (Reservations.tsx): the table row overlay is scoped to
status === "Pending" only (a Cancelled/old booking doesn't need an "has
anyone looked at this" signal) -- unclaimed Pending gets a red left
border + tint; claimed Pending gets no overlay at all, reverting to the
row's normal appearance (not a literal black background, which would
read as an error/disabled state in this palette). BookingDetail gains a
"Взять в работу" button (visible when canClaim && status === "Pending"
&& claimed_by === null) and a "В работе: <name> с <date>" info panel
once claimed, reusing the existing agentNames user-id-to-name map
(already built from the full /users list in the admin scope) rather
than adding a second lookup.

Reason: Direct project-owner request -- managers need a scannable "has
anyone started handling this new booking yet" signal, independent of
business status, before Decision 029's later AI-autonomy stages can
build on the same mechanism.

Approved By: Daler

Status: Implemented. Verified live: claiming a Pending booking switches
its row from red to normal, claimed_by/claimed_at are correctly recorded
and displayed with the claiming user's real name, and attempting to
claim a non-Pending booking is cleanly rejected server-side with a
descriptive ValueError (not a silent no-op or a generic 500).

---

# Decision 046

Date: 2026-07-13

Decision: Auto-generate an LPO (hotel booking-confirmation-request)
email template, displayed in-app with a clipboard-copy button (not a
mailto: link), whenever a Pending booking is claimed. Level 3 per the AI
Autonomy Levels framework -- pure template fill from already-stored/
already-fetched data, no model inference involved.

Deliberately NO backend code, no new module: new frontend-only
buildLpoEmailText(...) in Reservations.tsx, fed entirely by the exact
same roomBreakdown/transferBreakdown/mandatoryTaxBreakdown objects
BookingDetail's existing cost-breakdown useEffect already fetches (plus
the already-fetched guests list). This was the only way to guarantee the
LPO's numbers can never drift from what the manager already sees
on-screen -- a second, backend-side re-derivation of the same pricing
math was explicitly rejected per the project owner's own instruction.
One new small conditional fetch: if get_room_price's applied_promotions
is non-empty, resolves those Promotion ids to real promotion_name via
the existing GET /promotions/{id} endpoint, for the LPO's optional
"Special Offer Code" line.

Confirmed live against a real booking (id=2, Kandima/Sky Studio) before
implementing, not assumed: room-price/transfer-price/mandatory-tax
breakdowns all reproduce booking.total_amount/transfer_total/
mandatory_tax_total exactly (a first attempt using a guessed meal-plan
code produced a wrong number -- corrected by looking up the booking's
real meal_plan_id against the contract's actual meal plan list, "FB+"
not "BB").

Known, documented limitation on "Special Offer Code": get_room_price's
applied_promotions only ever contains generic Promotion ids -- Contract
Engine's richer SpecialOffer mechanism (the KM26_03-style, 4-sub-table
kind) applies as a silent reduction to base_total/supplements_total with
NO record anywhere of which offer produced it. There is no reliable way
to attribute a SpecialOffer to a specific booking after the fact from
currently-stored data -- the LPO line is correctly omitted rather than
guessed at when this is the case, which it is for the verified test
booking.

"Total Amount" in the LPO is NOT literally booking.total_amount --
it's total_amount + mandatory_tax_total (room rate + supplements + tax
owed to the hotel), with Transfer kept as its own separate line, per the
project owner's explicit "only what's owed to the hotel, not our
markup" framing; the parenthetical breakdown lists base_total,
supplements_total (only if > 0), and the tax using its real
mandatory_tax_label, all read from the same already-on-screen numbers.

The block is shown whenever status === "Pending" && claimed_by !== null
(not a one-shot toast) -- so a manager can reopen an already-claimed
booking later and re-copy the same email text, not just catch it once
right after clicking the claim button.

Approved By: Daler

Status: Implemented and typecheck-clean. Live-verified the underlying
data (room/transfer/mandatory-tax breakdowns, guest list, flight-number
fallback to "to follow") against real booking 2 before wiring the UI.

---

# Decision 047

Date: 2026-07-13

Decision: Added separate flight date/time fields to LOCKED Booking
Engine, distinct from arrival_date/departure_date (the room's
check-in/check-out): arrival_flight_date, arrival_flight_time,
departure_flight_date, departure_flight_time -- all nullable, additive
columns. Time stored as an "HH:MM" String(5), same convention as
Hotel.checkin_time/checkout_time, not a SQL Time column. Editable
through the existing generic BookingUpdate/PUT /bookings/{id} path
(fields added to both BookingUpdate and BookingResponse) -- no new
service function or endpoint needed, since these are plain field edits
with no pricing/inventory impact, same category as the existing flight
NUMBER fields they sit alongside.

Reason: A room's check-in date and a guest's actual flight arrival date
can legitimately differ (e.g. a flight landing the morning after
check-in) -- previously only a flight NUMBER was stored, with no
date/time at all, so this distinction had no way to be recorded or
communicated to the hotel.

Frontend: FlightNumbersEdit ("Изменить рейсы") gained date+time inputs
alongside the existing number inputs, with an explicit on-screen note
that these can differ from the room dates.

Second, coupled change: restructured the Decision 046 LPO email from
prose paragraphs into a plain-text Markdown-style table
(renderTextTable) -- chosen over manually-padded fixed-width columns
because LPO values vary too much in length (a one-word meal-plan code
next to a full price-breakdown sentence) for uniform padding to look
right, and a pipe table stays unambiguous as raw plain text even
wherever it isn't rendered as an actual table (the LPO is pasted into a
plain-text email compose box, not an HTML surface, per Decision 046's
own design). "Room Check-in — Check-out" and "Flight Arrival"/"Flight
Departure" are always separate, explicitly-labeled rows -- the entire
point of this decision -- so a hotel reading the table can never
conflate "when the room is booked" with "when the guest's plane
actually lands". formatFlightDetail is honest about partial data: a
flight number on file with no date (the state of every booking created
before these columns existed) is surfaced as "to follow (flight number
on file: X)", not silently dropped.

Approved By: Daler

Status: Implemented, typecheck-clean, DB migrated. Live-verified end to
end against real booking 2: set arrival_flight_date one day after the
room's arrival_date (2027-03-16 vs. room check-in 2027-03-15,
08:45, flight AB123) via the same PUT endpoint the edit form uses,
regenerated the LPO table, and confirmed both dates render as two
distinct, correctly-labeled rows -- byte-for-byte confirmed via direct
UTF-8 file read (a Windows console display artifact made the em-dash
look corrupted when printed to this terminal directly; the underlying
data was always correct).

---

# Decision 048

Date: 2026-07-13

Decision: Close a real gap the project owner confirmed: a booking priced
under a Contract Engine SpecialOffer (e.g. KM26_03) had no way to record
which offer applied, unlike Promotion (already tracked via
get_room_price's applied_promotions). New Booking.applied_special_offer_id
(plain Integer, deliberately NOT a SQLAlchemy ForeignKey -- same
cross-engine decoupling as hotel_id/contract_id/rate_id/room_type_id/
meal_plan_id, all of which are plain Integers into Contract/Hotel
Engine's own tables for the identical reason).

Zero new matching logic: get_room_price (LOCKED Contract Engine)
already computes exactly which SpecialOffer mechanism rows apply, via
three existing matcher functions
(_find_active_special_offer_room_discount/_meal_plan_discount/
_family_rule), each returning a row carrying a real offer_id -- these
were previously used only to apply the discount and then discarded. Now
collected into a new response field, applied_special_offer_ids: a LIST
(mirroring applied_promotions' own list shape), not a single value --
honestly represents "zero, one, or more offers touched this price"
rather than guessing when more than one legitimately did.
create_booking (LOCKED Booking Engine) reads this list and only writes
Booking.applied_special_offer_id when it contains exactly one id; both
"no offer applied" and "more than one offer's mechanisms applied" stay
NULL rather than picking one arbitrarily.

Frontend: BookingDetail resolves applied_special_offer_id to the real
SpecialOffer.offer_name and combines it with any generic Promotion
names for the LPO's "Special Offer Code" row -- both sources can appear
together if a booking legitimately used both mechanisms.

Backfill for booking 2 (the real KM26_03 booking the gap was found
against): determined with certainty, not guessed -- re-ran the exact
same three matcher functions against booking 2's real original
parameters (contract 2, room type 3, check-in 2027-03-15, 2 adults).
This is safe because the matchers filter by "today" against each
offer's booking_start/booking_end (a booking-window check, not tied to
the stay dates), today's date hasn't materially changed since booking 2
was created earlier this same session, and KM26_03's booking_end
(2026-07-31) is still open -- confirmed by also re-checking
final_total still matched booking.total_amount exactly (2936.5),
proving the re-run used identical state. Result: exactly one offer
(id=1, "KM26_03") -- backfilled directly.

Approved By: Daler

Status: Implemented, typecheck-clean, DB migrated, backfilled. Verified
three ways: (1) booking 2's API response now returns
applied_special_offer_id=1, resolving to offer_name "KM26_03"; (2) a
brand-new test booking created through the real POST /bookings endpoint
(not a backfill) automatically got applied_special_offer_id=1 set by
create_booking itself, proving the mechanism works going forward, not
just for the one backfilled row -- that test booking was immediately
cancelled through the real cancel flow (releasing its allotment
reservation) since it was scaffolding, not real data; (3) regenerated
booking 2's LPO table and confirmed the row reads exactly
"| Special Offer Code | KM26_03 |".

---

# Decision 049

Date: 2026-07-13

Decision: Built the technical foundation for hotel email correspondence,
tied to each booking, with deliberately NO real SMTP/IMAP integration --
that's a separate future task (Decision 029 Stage 3+), once a real
business mailbox exists. New BookingCorrespondence entity: booking_id,
direction ("outbound"/"inbound"), subject, body, status
("draft"/"sent"/"awaiting_reply"/"replied"), sent_at, received_at,
created_by, created_at.

Lives inside Booking Engine (LOCKED), not a new Engine -- same
child-entity precedent as Guest: booking-scoped, no independent
lifecycle, added as an additive extension the same way every other
Decision this session has extended a LOCKED engine. 01_Modules_List.md's
separate "Notifications"/"CRM" modules are the eventual home for real
email infrastructure later, not this booking-linked thread record now.

Status semantics: "sent" and "replied" are the only values actually
written by code. "awaiting_reply" is deliberately never stored -- it's a
computed UI label (latest row is outbound with status="sent" and no
inbound row has followed it), since nothing real happens between "sent"
and "awaiting a reply" that deserves its own write. "draft" exists as a
valid column value with no writer yet -- no save-draft flow was
requested, so none was built ahead of need.

Three endpoints, same file organization as Guest's: GET
/bookings/{id}/correspondence (the thread, oldest first), POST
.../correspondence/send (records an outbound message -- typically the
Decision 046 LPO's subject/body directly, no re-parsing of the rendered
text needed since buildLpoEmailText's return type changed from a flat
string to {subject, body}), POST .../correspondence/reply (manually
logs a hotel's reply, and back-resolves the most recent unanswered
outbound row to "replied" so stored data reflects the exchange being
answered, not just the new inbound row). Same flagged-not-fixed
authorization gap as Decision 045's claim_booking: not wrapped in
_require_owner_or_admin (a manager acting on a booking, not the owning
agent), same precedent, same reasoning.

Frontend: a "Переписка с отелем" section in BookingDetail, chat-style
(outbound right-aligned/coral-tinted, inbound left-aligned/ink-tinted),
fetched independently of booking status/claim state so history stays
visible even after a booking moves past Pending. "Отправить" button
sits next to the existing "Копировать" button on the LPO block.
"Добавить ответ отеля вручную" opens a subject+body form for logging a
hotel's reply.

Approved By: Daler

Status: Implemented, typecheck-clean, new table created. Verified live
against the real Kandima booking: generated the LPO, sent it (outbound
row created with status="sent"), manually logged a hotel reply (inbound
row created with status="replied", AND the earlier outbound row flipped
from "sent" to "replied" automatically), and confirmed both messages
render in correct chronological order in the thread.

---

# Decision 050

Date: 2026-07-13

Decision: Two refinements to Decision 049's correspondence feature,
checked against real data before implementing rather than assumed: (1)
recipient email fields on send, (2) an editable LPO body before
sending.

Checked directly: Hotel.email already exists on LOCKED Hotel Engine (no
schema change needed there) -- but every hotel row in the live DB,
including the real Kandima hotel, has email=NULL. This is a data gap,
not a schema gap: no plausible-looking email was fabricated to fill it;
the "To" field simply defaults to empty until a real one is entered via
Hotel Engine's existing update endpoint. Contract has no contact-email
field at all, and doesn't need one -- Hotel.email already serves that
purpose.

Recipient addresses are captured per-send on BookingCorrespondence
itself (recipient_email, recipient_email_secondary), not as a new
permanent Hotel/Contract field -- who an outbound message was actually
addressed to can legitimately differ send to send (a general
reservations inbox once, a specific manager's personal email another
time), so this is send-time data, not a hotel attribute. Defaults from
Hotel.email in the UI when populated, always editable, recorded as
whatever the manager actually used regardless of the default.

The LPO's body, previously a read-only <pre>, is now an editable
<textarea> seeded once from buildLpoEmailText's generated text and held
in its own state -- never silently reverting to the auto-generated
original if the manager edits it. Both "Копировать" and "Отправить" use
the current edited text, not the original.

Approved By: Daler

Status: Implemented, typecheck-clean, table migrated (preserving the 5
real correspondence rows already in the table, including 3 the project
owner sent live between sessions). Live-verified: confirmed Kandima's
hotel_id=2 has no stored email (empty "To" by design, not a fabricated
default), added a second recipient email, edited the LPO body text,
sent, and confirmed the resulting row captured both recipient emails
and the edited body text exactly as entered.

---

# Decision 051

Date: 2026-07-13

Decision: Fix A of preparing to onboard a real second hotel contract
(Siyam World Maldives) -- wired up `"single_occupancy"` in LOCKED
Contract Engine's `get_room_price`, which previously never queried that
`RateSupplement.adjustment_type` at all (confirmed via grep before
touching anything: the string appeared exactly once in the whole
engine, in a comment; zero rows of this type had ever existed anywhere,
real or test). This was NOT a sign-handling bug -- `RateSupplement.amount`
already fully supported negative values at every layer (model comment,
schema, validators) -- the type simply had no calculation branch at all,
unlike `"extra_person"` (Decision 017) which already does.

New branch, gated on `adults == 1` (matching `extra_person`'s own
adults-only, base-occupancy-relative precedent), folded into
`supplements_total` via the same `_calc_supplement_total` path every
other supplement type uses. A negative `amount` (the real case: Siyam
World's -$100/villa/night) naturally subtracts once added -- no special-
casing for the sign, exactly as proposed. Mutually exclusive with
`extra_person` by construction (adults == 1 can never also satisfy
adults > base_occupancy).

Corrected CLAUDE.md's Decision 016 note, which had gone stale twice
over: it still claimed `"extra_person"` was unimplemented, even though
Decision 017 already closed that gap; now accurately states
`extra_person` (Decision 017) and `single_occupancy` (this decision) are
both implemented, only `"extra_bed"` remains open (no real contract has
needed it yet).

Reason: Onboarding Siyam World Maldives as a second real hotel contract
is also a deliberate generalization test -- proving the pricing
formulas work for more than one hotel, not just Kandima. Checking Fix
A's premise before implementing surfaced that this was a materially
different problem (missing logic, not a missing minus sign) and a
second, separate gap in `Promotion` (no "days before arrival" concept
at all -- Fix B).

Fix B: added `Promotion.days_before_arrival` (nullable Integer) -- a
rolling "book at least N days before arrival" threshold, distinct from
`booking_start`/`booking_end`'s fixed calendar dates, which cannot
express Siyam World's real 30-day/10% and 60-day/15% Early Bird tiers.
Multiple tiers are multiple `Promotion` rows, same "one row per tier"
shape `CancellationPolicy` already uses. Selection in `get_room_price`:
among tiers whose threshold is actually met
(`(check_in - today).days >= days_before_arrival`), the one with the
LARGEST `days_before_arrival` wins -- more advance notice deserves the
better discount. Explicitly documented in code as the INVERSE of
Booking Engine's `_resolve_cancellation_fee` (smallest threshold
breached wins there, because cancellation penalties escalate as arrival
nears -- the opposite direction from early-bird rewards). Every
`Promotion` row without `days_before_arrival` set is completely
unaffected -- flows through the exact same filtering as before this
change. Known, documented simplification: tier selection is global
across every `days_before_arrival` row on the contract, not grouped by
promotion family -- correct for a single early-bird ladder (the only
real case so far), would need real grouping only if a contract ever
needs two independent day-based promotion families simultaneously.

Approved By: Daler

Status: Implemented. Both fixes verified in isolation with throwaway
synthetic data (dedicated test hotels/contracts, not real business
data), then regression-checked against the real Kandima booking to
confirm zero behavior change for existing data.

Fix A: adults=1 against a $500/night base rate with a -$100/night
single_occupancy supplement produced final_total=1200.0 exactly
(1500 - 300 over 3 nights); adults=2 against the identical rate produced
final_total=1500.0 -- the deduction correctly did not apply.

Fix B: a $1000/night rate with 30-day/10% and 60-day/15% tiers tested
at 29/30/59/60/69/70 days before arrival. 29 days: no discount (neither
tier met). 30-59 days: 10% (only the 30-day tier met). 60/69/70 days:
15% (60-day tier met, correctly WINS over the still-satisfied 30-day
tier rather than either double-applying or defaulting to the first
match) -- the 69/70-day cases were the specific scenarios asked for to
prove the "largest satisfied tier wins" selection, not just "a tier
gets picked."

Both fixes' test data deleted afterward. Kandima's real booking
(adults=2, no days_before_arrival promotions involved) priced
identically before and after both fixes: final_total=2936.5, unchanged.

---

# Decision 052

Date: 2026-07-13

Decision: Entered Siyam World Maldives as the second real hotel
contract in LOCKED Hotel/Contract Engines, via the 8-step plan already
confirmed (Hotel -> room types -> contract -> seasons -> meal plan ->
rates -> supplements -> Early Bird promotions), using only the existing
service-layer functions (no direct SQL, matching Kandima's own original
entry process). Doubles as the generalization test Decision 051's fixes
were built for -- proving the pricing engine correctly handles a second
hotel with a genuinely different rate/supplement/promotion shape, not
just Kandima's.

Entered: hotel_id=13 (Siyam World, Noonu Atoll, Maldives); 15 room
types (ids 21-35); contract_id=8 ("Siyam World Maldives Contract
2026-27", USD, 2026-11-01 to 2027-10-31, mandatory_tax_per_person_per_
night=12.00, mandatory_tax_label="Green Tax"); 5 season rows (Low
appears twice, non-contiguous, same pattern Kandima's own "Peak"
already used -- ids 15/19); 1 meal plan ("Premium AI" / "Premium
All-Inclusive", meal_plan_id=15) using Option A of get_room_price's
existing bifurcation (a direct Rate per meal plan, confirmed already
fully supported, no code change needed); 75 Rate rows (15 room types x
5 season rows); 150 RateSupplement rows (75 extra_person at $360/night
using the existing Decision 017 mechanism, 75 single_occupancy at
-$100/night using Decision 051 Fix A); 2 Promotion rows (Early Bird 30
at 10%, Early Bird 60 at 15%, using Decision 051 Fix B's
days_before_arrival mechanism -- the first real-contract use of either
Promotion or days_before_arrival, previously only synthetic test data
existed).

Two assumptions made during entry, NOT sourced from the real contract
text, flagged explicitly rather than silently treated as fact:
1. `max_occupancy` per room type -- the source data gave only room
   names and pricing, no occupancy figures. Derived from each name's
   explicit bedroom count (no "Bedroom" mentioned = 4, "Two Bedroom" =
   6, "Three Bedroom" = 8, "Four Bedroom" = 10), scaled from Kandima's
   own real precedent (1BR rooms = 4, its 2BR Family Sky Suite = 8).
   Needs the project owner's confirmation against the actual contract
   before this is relied on for a real booking.
2. No transfer data was provided, so `Contract.transfer_required`
   stayed False and zero ContractTransferOption rows were created --
   not fabricated. Same "known gap, not invented data" treatment as
   assumption 1.

Bug discovered and fixed during verification, not anticipated in the
original plan: the initial data-entry script created only two
RoomOccupancyOption rows per room type -- (1 adult, 0 children) and (2
adults, 0 children) -- modeled loosely on "give it a couple of rows"
rather than on Kandima's actual real convention. Decision 024's
dominance check (`o.adults >= adults and o.children >= children`, only
applied when Active rows exist) then silently rejected every
occupancy of 3+ adults as "not a configured combination" -- which
meant the very `extra_person` supplement this contract explicitly
defines ($360/night for adults beyond base_occupancy=2) could never
actually be triggered by any booking, regardless of how correctly it
was priced once reached. Caught by the verification step itself
(adults=3 unexpectedly 400'd) rather than being assumed to work.

Checked Kandima's real rows before fixing rather than guessing a
replacement: Kandima's actual convention is two rows per room type
representing real configured combinations, not an arbitrary 1-adult/
2-adult pair -- e.g. Sky Studio (max_occupancy=4): "2 adults + 2
children" and "3 adults, 0 children"; the 2-bedroom Family Sky Suite
(max_occupancy=8): "4 adults + 4 children" and "8 adults, 0 children".
Since Siyam World's source data included no children pricing or age
categories at all (unlike Kandima), the fix adds one row per room type
at (max_occupancy adults, 0 children) -- e.g. Water Villa (max_occ=4):
adds "4 adults, 0 children", which by the dominance check alone now
also correctly covers 1-4 adults with 0 children, making the original
two rows redundant but harmless. No children combination was invented
for Siyam World since none exists in the source data.

Approved By: Daler

Status: Implemented and verified. All 5 season rows checked with one
real `get_room_price` call per season (Water Villa, room_type_id=21,
adults=2, 1 night), each hand-calculated against the exact per-night
rate the project owner provided and the 15% Early Bird discount (every
test date is 2026-07-13 + well over 60 days out, so the 60-day/15%
tier applies automatically in every case -- confirmed as expected
behavior, not a surprise): Low 1122 -> 953.70, Festive 1546 -> 1314.10,
Peak 1227 -> 1042.95, Shoulder 935 -> 794.75, Low (second window) 1122
-> 953.70 -- all five matched exactly (float noise only, e.g.
953.6999999999999).

Supplement and boundary checks (Peak season, Water Villa, 1 night):
adults=1 (single_occupancy) -> base 1227, supplement -100, final
957.95, correct. adults=3 (extra_person, after the occupancy-option
fix) -> base 1227, supplement +360, final 1348.95, correct. adults=4
(at Water Villa's max_occupancy) -> supplement +720 (2 persons beyond
base_occupancy), final 1654.95, correct. adults=5 (exceeds
max_occupancy=4) -> correctly still rejected by the coarse
max_occupancy check, independent of the occupancy-option fix,
confirming that boundary wasn't accidentally loosened.

---

# Decision 053

Date: 2026-07-14

Decision: Three generic, reusable extensions to LOCKED Contract Engine
(plus one to LOCKED Hotel Engine) to support Siyam World's real SWJ26
special offer, which introduced two mechanisms no real contract had
exercised before: blackout dates carved out of an otherwise-discounted
period, and a tiered free-vs-discounted transfer outcome. Each piece
was explicitly confirmed generic -- not Siyam-specific -- with the
project owner before implementation, isolation-tested with throwaway
data, and regression-checked against Kandima's real KM26_03 before any
real SWJ26 data was entered.

1. `BlackoutDate` generalized from Promotion-only to Promotion-or-
   SpecialOffer: `promotion_id` made nullable, `special_offer_id` added
   (nullable FK to `special_offers.id`), exactly one of the two
   enforced in `service.create_blackout_date`. Zero regression risk --
   this table had zero real rows anywhere before this decision (fully
   unused since its original creation, confirmed by grep before
   touching it). New helper `_is_blacked_out(db, contract_id,
   special_offer_id, check_in)`, checked per-offer (not per-contract)
   inside `_find_active_special_offer_room_discount` and
   `_find_active_special_offer_transfer_discount` -- scoped to the
   specific offer so one offer's blackout never silently suppresses an
   unrelated offer's mechanism just because their dates happen to
   overlap (SWJ26 itself has exactly this trap: Offer 3's room-discount
   blackout and Offer 4's transfer blackout both include 27 Dec-4 Jan,
   but are otherwise-independent periods). A blacked-out check_in
   simply produces zero candidates for that offer, falling back to
   whatever get_room_price/get_transfer_price would already compute
   without it -- the same "no candidates found" behavior that already
   existed for a check_in outside every row's period.

2. `SpecialOfferRoomDiscount.room_type_id` made nullable -- NULL means
   the discount applies to every room type on the offer's contract,
   the same nullable-means-unrestricted convention `Rate.market_id`
   already uses. Needed because SWJ26's offers are flat, non-room-type-
   varying discounts (unlike Kandima's KM26_03 matrix, which still
   works unchanged via explicit room_type_id rows) -- without this,
   Siyam World's 15 room types would have needed 15 duplicate rows per
   offer for a discount that never actually varies by room.
   `repository.list_special_offer_room_discounts` updated to match
   rows with an exact room_type_id OR room_type_id IS NULL.

3. Fix C: `_find_active_special_offer_transfer_discount` changed from
   "first matching row wins" to "largest satisfied min_nights wins" --
   the same tier-selection bug class Decision 051 Fix B already fixed
   for `Promotion.days_before_arrival`. Previously, a contract with two
   min_nights tiers on the same transfer_type (e.g. SWJ26 Offer 4: 50%
   at 4+ nights, 100%/free at 7+ nights) could silently return the
   worse tier depending on row insertion order, even when the guest
   qualified for the better one. No model change needed for "free" --
   `discount_percent` was already an unbounded 0-100 float; 100.0 flows
   through the existing `total *= 1 - (discount_percent/100)` math and
   produces 0 with zero special-casing.

4. Hotel Engine: new nullable `bedroom_count` on `RoomType` (LOCKED
   engine, deliberate additive extension, explicitly flagged and
   approved separately from the Contract Engine changes). Originally
   scoped to support a "2 guests per bedroom" cap on SWJ26's free/
   discounted transfer entitlement -- but implementing that cap for
   real requires `get_transfer_price` to know which room type a
   transfer is for, and that function has no room_type_id parameter at
   all today; it's already called twice by LOCKED Booking Engine
   (`service.py:203,470`), so adding one is a 3-engine change. Given a
   choice between (a) wiring room_type_id through Contract + Hotel +
   Booking Engine, (b) wiring it through Contract Engine only and
   leaving Booking Engine's real bookings uncapped for now, or (c) not
   enforcing the cap at all, the project owner explicitly chose (c):
   `bedroom_count` is entered as informational data only, not consulted
   by any pricing check. SWJ26's free/discounted transfer tiers apply
   based on nights alone, uncapped by party size, until a future task
   deliberately revisits this.

Real data entered for Siyam World (contract_id=8), modeled as 4
separate `SpecialOffer` rows sharing the "SWJ26" name prefix and the
same booking window (2026-06-16 to 2026-08-15) rather than one bundled
offer -- chosen specifically so each offer's blackout dates stay
correctly scoped (see point 1 above), since Offer 4 spans almost the
whole contract period independently of Offers 1-3's disjoint travel
windows:
  - Offer 1 "SWJ26 - Value Season": 30% off all room types, 3 disjoint
    travel windows (16-30 Jun 2026, 25 Aug-23 Oct 2026, 15 Apr-20 Oct
    2027) -> 3 SpecialOfferRoomDiscount rows, room_type_id=NULL.
  - Offer 2 "SWJ26 - Peak Summer": 20% off, 1 Jul-24 Aug 2026 -> 1 row.
  - Offer 3 "SWJ26 - Winter/Spring": 25% off, 24 Oct 2026-14 Apr 2027
    and 21-31 Oct 2027 -> 2 rows, plus 2 BlackoutDate rows (27 Dec
    2026-4 Jan 2027, 1-28 Feb 2027) attached via special_offer_id.
  - Offer 4 "SWJ26 - Seaplane Transfer": entered structurally (the
    SpecialOffer row, both SpecialOfferTransferDiscount tiers --
    100%/7+ nights, 50%/4+ nights -- and its own blackout, 27 Dec 2026-
    4 Jan 2027) but NOT runtime-functional: Siyam World's contract has
    zero ContractTransferOption rows, and the source data for this
    offer never included a base seaplane price (price_adult/
    price_child) to discount against -- only the discount tiers. Not
    fabricated; flagged as a known gap, same "enter what's given, flag
    what's missing" discipline as Decision 052's max_occupancy/transfer
    flags. get_transfer_price will raise "no Active transfer option"
    for transfer_type='Seaplane' on this contract until a real base
    price is provided.

Real gap discovered during verification, unrelated to any of the above
mechanisms: Offer 1's first travel window (16-30 Jun 2026) and all of
Offer 2's window (1 Jul-24 Aug 2026) fall entirely before Siyam World's
own contract seasons begin (earliest season "Low" starts 1 Nov 2026,
per the original contract data Decision 052 entered) -- there is no
Rate/season coverage at all for Jun-Oct 2026, so get_room_price
correctly raises "no season covering" for those dates. This is a real,
pre-existing gap in the base contract's rate coverage, not a defect in
Decision 053's mechanisms -- flagged for the project owner, not
silently worked around by inventing off-season rates.

DB migration: `blackout_dates.promotion_id` and
`special_offer_room_discounts.room_type_id` were originally NOT NULL
at the SQLite level (not just in the SQLAlchemy model) -- SQLite has no
ALTER COLUMN, so both tables were rebuilt (create replacement table,
copy data, drop original, rename). `dmc.db` backed up first
(`dmc.db.bak-decision053`, deleted after migration was confirmed
correct). `special_offer_room_discounts` held Kandima's real 70-row
KM26_03 data; verified byte-for-byte identical (`before_rows ==
after_rows`) after the rebuild before proceeding. `blackout_dates` was
empty (zero real rows anywhere), rebuilt trivially.

Approved By: Daler

Status: Implemented and verified. Isolated tests (throwaway synthetic
hotel/contract/offers, deleted afterward) confirmed all 3 mechanisms
before any real data was touched: wildcard room_type_id discount
applied correctly (20% off); blackout correctly suppressed the
discount inside its window and the discount correctly resumed outside
it; `create_blackout_date` correctly rejected both "neither set" and
(by construction) "both set"; Fix C correctly selected the 100% tier
over the 50% tier at 10 nights (deliberately creating the smaller-
tier row first, to prove selection isn't "first row wins"), the 50%
tier at 5 nights, and no discount at 3 nights.

Regression-checked against Kandima's real KM26_03 booking (room_type_id
3, Peak season) twice -- once right after the schema migration, and
again after discovering and fixing a stale `uvicorn --reload` worker
that was silently serving pre-Decision-053 code (see below) -- both
times: base_total=251.5 (503 x 0.5, KM26_03's real 50% row), unchanged.

Real SWJ26 verification, Water Villa (room_type_id=21): Offer 1 window
3 (2027-05-01, Shoulder rate 935) -> base_total=654.5 (935 x 0.70,
30% off), applied_special_offer_ids=[2], correct. Offer 3 window 1
(2027-03-01, Peak rate 1227, NOT in either blackout) -> base_total=
920.25 (1227 x 0.75, 25% off), applied_special_offer_ids=[4], correct.
Offer 3 window 2 (2027-10-25, Low2 rate 1122) -> base_total=841.5
(1122 x 0.75), correct. Both blackout windows verified directly:
2026-12-30 (inside 27 Dec-4 Jan) -> base_total=1546.0, the FULL
Festive rate with zero discount and applied_special_offer_ids=[];
2027-02-15 (inside 1-28 Feb) -> base_total=1227.0, the FULL Peak rate,
same zero-discount result -- confirming the discount is suppressed
specifically inside blackout, not merely reduced or coincidentally
absent.

Caught and fixed during verification, unrelated to the mechanisms
themselves: the first round of HTTP verification calls returned stale,
pre-Decision-053 results (e.g. Offer 1's wildcard discount not applying
at all) despite the underlying code and data both being correct --
confirmed by calling the same service functions directly in a fresh
Python process, which returned the correct result immediately. Root
cause: `uvicorn --reload`'s orphaned multiprocessing worker child
(same Windows quirk as Decision 042) was still serving the pre-edit
process. Fixed with `taskkill /PID <reloader> /F /T` to kill the whole
process tree, then a clean restart -- all subsequent HTTP checks
(including a third Kandima regression check on the fresh process)
confirmed correct.

---

# Decision 054

Date: 2026-07-14

Decision: Fixed a real bug in Siyam World's bookability, and hard-deleted
five test/leftover data artifacts from the database so only Kandima and
Siyam World remain as production contracts -- both actions taken to
avoid leaving undocumented, silent database state behind after an
extended session of real data entry and isolated testing.

**Bug fix:** searching Siyam World for 19-26 Mar 2027 returned "Нет
активного контракта" despite that date falling squarely inside the
Peak season (11 Jan-14 Apr 2027) entered in Decision 052. Root cause
traced directly, not guessed: `get_active_contract` requires BOTH
`contract_status == "Active"` AND the date range to cover check_in --
Siyam World's date range (2026-11-01 to 2027-10-31) was always correct,
but `contract_status` had defaulted to `"Draft"` on creation (the
`Contract` model's column default) and Decision 052's data-entry script
never explicitly activated it, unlike Kandima's real contract, which is
`"Active"`. Confirmed by reproducing `get_active_contract(db, 13,
date(2027,3,19))` returning `None` before the fix, then `contract_id=8`
immediately after calling the existing `service.update_contract_status(db,
8, "Active")` -- zero other changes involved. Nothing else was wrong;
the date-range and season/rate data were correct all along.

**Cleanup, in 4 parts, each executed only after an explicit inventory
and (for destructive steps) a shown plan:**

1. Activated Siyam World's contract (the bug fix above).
2. Deleted contract_id=9 + its orphaned `contract_seasons` row (id=20)
   -- confirmed as this session's own incomplete cleanup: the first
   (failed) isolated test run for Decision 053 created a throwaway
   hotel/contract/season before crashing on an unrelated Pydantic
   validation error; the hotel and room type were deleted at the time,
   but the contract and season rows were missed. Zero real data
   involved (0 rates, 0 bookings).
3. Deleted contracts 3/5/6/7 (three duplicate "Kandima Maldives" test
   hotels, ids 9/11/12) and contract 4 ("Broken Ref Test Hotel", id
   10) -- confirmed by the project owner as artifacts from earlier
   "AI Core Engine atomicity testing," predating this conversation's
   visible history. All Draft status, zero bookings. Full footprint
   removed: rate_supplements, rates, contract_meal_plans,
   contract_age_categories, contract_transfer_options, contract_seasons,
   contracts, room_occupancy_options, room_types, and the hotels
   themselves (9/10/11/12) -- not just the contract rows, since leaving
   orphaned hotel/room_type shells behind would have defeated the
   stated goal of a clean "only Kandima and Siyam World" state.
4. Deleted contract_id=1 ("Test Beach Resort", hotel_id=1) and its one
   dependent `Booking` row (`BK-8D6B9B5CA2DA`, already status=Cancelled)
   plus that booking's 1 `Guest` row -- confirmed by the project owner
   as the original placeholder hotel from early Hotel/Contract Engine
   TASK-005 manual verification, not a real partner. Full dependency
   map traced before any delete: `guests` (1), `booking_correspondence`
   (0, checked and empty), `allotments` (3, contract-level not
   booking-linked), `rate_supplements` (1), `rates` (1),
   `contract_seasons`/`contract_meal_plans`/`contract_age_categories`
   (1/1/1), `contract_transfer_options` (0), `room_occupancy_options`
   (1), `room_types` (1). No safe deletion path exists anywhere in
   Contract/Booking Engine for this -- confirmed by grep, zero
   `delete_*` functions in any of the three engines' `service.py`
   files; `cancel_booking` (already applied to this booking previously)
   is a soft status change, not a hard delete. Raw SQL was the only
   option, flagged explicitly to the project owner before executing,
   exactly per this session's standing rule that any hard delete
   touching booking-shaped data needs an explicit shown plan first.

Approved By: Daler

Status: Implemented and verified. `dmc.db` backed up before each
destructive step (parts 2-4 shared one backup; part 4 got its own,
since it was approved and executed separately) and deleted only after
each step's verification passed -- same discipline as Decision 053's
schema migration.

Row-count verification: every DELETE's `cur.rowcount` matched the
pre-delete inventory count exactly for all ~13 affected tables across
parts 2-4 (guests, bookings, allotments, rate_supplements, rates,
contract_seasons, contract_meal_plans, contract_age_categories,
contract_transfer_options, contracts, room_occupancy_options,
room_types, hotels). Global post-cleanup totals confirmed against
expected (before minus deleted) for all 7 tracked tables: contracts=2,
hotels=8, room_types=25, bookings=2, guests=1, rates=115,
contract_seasons=9 -- all exact matches.

Regression-checked after every destructive step: Kandima's real
KM26_03 booking (room_type_id=3, Peak season) priced identically
throughout -- base_total=251.5 (503 x 0.5) -- confirmed unchanged
after parts 2/3's cleanup AND again after part 4's cleanup. Siyam
World's SWJ26 mechanisms re-verified post-cleanup and found fully
consistent with Decision 053's original checks, now additionally
showing the complete real picture with SWJ26 live across the whole
calendar (previously only Peak/Shoulder had been checked before SWJ26
existed): Low1 (15 Nov 2026) and Festive (25 Dec 2026) both fall under
Offer 3's 25% (841.5, 1159.5), Peak (1 Feb 2027) correctly still
blacked out to the full rate (1227, zero special-offer discount),
Shoulder (1 Jun 2027) and Low2 (15 Oct 2027) both fall under Offer 1's
30% (654.5, 785.4) -- each then further reduced by the 60-day Early
Bird tier, all figures self-consistent with the underlying rate table.
The originally-reported March 2027 bug scenario re-verified identical
to its first post-fix check: final_total=5475.4875 for the 7-night
Peak-season stay.

Final state confirmed via the exact API call the Contracts admin view
itself makes (`GET /contract-engine/contracts?skip=0&limit=100`, not a
separate direct-DB check): returns exactly 2 rows -- Kandima
(contract_id=2, Active) and Siyam World (contract_id=8, Active).
Nothing else. No code files were changed by this decision -- only
`service.update_contract_status` (an existing, already-tested function)
was called, plus the raw-SQL deletes described above; `11_Decisions.md`
is the only file this decision commits.

---

# Decision 055

Date: 2026-07-14

Decision: A general UI rule for $0 special-offer prices, Siyam World's
real seaplane transfer data, and a second round of stale-hotel-data
cleanup surfaced while verifying it -- all one connected workstream, one
commit.

**General UI rule, applied to `HotelSearch.tsx`:** a transfer whose
final calculated price reaches exactly $0 (a 100% special-offer
discount, e.g. Siyam World's SWJ26 free-seaplane tier) must always be
shown explicitly as included/free -- never hidden, never silently
omitted, and never visually indistinguishable from "no transfer option
configured." Audited every layer of the existing code before changing
anything: `PricedTransferOption.price` is typed as `TransferPrice |
undefined` (an object, not a bare number), so `!opt.price` and
`opt.price ?` truthiness checks were already correct -- a `{total: 0}`
object doesn't collapse to falsy the way a raw `0` would. Downstream
totals (`selectedTransferTotal`, `grandTotal`) already used `??`, not
`||`, so `0` was never silently replaced by a fallback either. The one
real gap: a free transfer rendered as a bare "USD 0", which is
technically correct but easy to misread as a display glitch rather
than a deliberate benefit. Fixed by rendering an explicit "Включено
бесплатно" badge instead, specifically when `total === 0` -- reusing
the existing coral accent-badge style (`bg-coral/10`/`text-coral`,
same as the "Обязательный выбор" badge) rather than inventing a new
color, since no green/success color exists anywhere in this project's
palette (`--color-ink`/`--color-coral`/`--color-slate` are the only
three defined). This is a general rule, not Siyam-specific -- it fires
on any contract's transfer option whenever its computed total is
exactly 0, regardless of hotel.

**Siyam World real transfer data:** `ContractTransferOption`
(transfer_type="seaplane", transfer_name="Seaplane Transfer (Round
Trip)", price_adult=515, price_child=310, price_infant=0) plus
`Contract.transfer_required=true`, entered via the existing service
layer. Caught a real bug while entering this: Decision 053's two
`SpecialOfferTransferDiscount` tier rows (the free-at-7-nights/50%-at-
4-nights mechanism) were stored with `transfer_type="Seaplane"`
(capitalized), but this task specified lowercase `"seaplane"` for the
new option -- since that field is matched by exact string equality
throughout Contract Engine (`get_transfer_price`,
`_find_active_special_offer_transfer_discount`), the mismatch would
have silently prevented the discount tiers from ever being found for
this option. Fixed by updating both existing rows to `"seaplane"`
rather than silently picking one side of the mismatch, flagged
explicitly rather than left quiet. All three tiers verified via
`GET .../transfer-price`: 3 nights -> 1030.0 (full price, 515 x 2),
5 nights -> 515.0 (50% off), 8 nights -> 0.0 (free).

**Second stale-data cleanup round, surfaced while investigating why
Kandima might display oddly in search (not assumed -- queried
directly):** found 7 hotel rows named "Kandima Maldives" (ids 2-8),
all `status="Draft"`, but only hotel_id=2 had any contract or room
type attached (10 room types, 1 real Active contract). Hotels 3-8 were
completely empty shells (0 room_types, 0 contracts, 0 of anything) --
the same leftover duplicates flagged but explicitly left out of scope
during Decision 054's cleanup, which only covered hotels 9/10/11/12
(the ones with contracts attached) and hotel 1. Confirmed this was a
real data problem, not a `HotelSearch.tsx` display bug: the page's
hotel-list fetch (`GET /hotel-engine/hotels`) has no status or
room-type filtering anywhere in the code, so every one of the 7 rows
would render its own card, each empty one showing "Нет активного
контракта" and "Нет доступных типов номеров" -- confusing, though
inert (unbookable).

Also found, separately: both real hotels (2 and 13) still had
`Hotel.status="Draft"` -- distinct from `Contract.contract_status`,
which Decision 054 already fixed. `HotelSearch.tsx` doesn't filter on
this field, so it wasn't blocking anything, but it's the same class of
Draft/Active inconsistency Decision 054 caught for contracts, now
found on the Hotel Engine side too.

Approved By: Daler

Status: Implemented and verified. `dmc.db` backed up before the hotel
deletion (deleted after verification passed, same discipline as
Decisions 053/054). Full dependency check run before deleting hotels
3-8: `hotel_images`, `hotel_facilities`, `room_types`, `contracts`,
`bookings` all zero across all six ids -- confirmed via direct query,
not assumed. Deletion matched the expected count exactly (6 rows).
`hotel_service.update_hotel_status` (existing, already-tested function)
applied to hotel_id 2 and 13.

Verified via the exact API calls the frontend itself makes, not just
direct DB queries: `GET /hotel-engine/hotels?skip=0&limit=100` now
returns exactly 2 rows (Kandima id=2, Siyam World id=13, both
`status="Active"`). Kandima's KM26_03 regression check unchanged
(base_total=251.5). Siyam World's March 2027 booking scenario from
Decision 054 unchanged (final_total=5475.4875). Final combined state:
2 hotels, both Active; 2 contracts, both Active; nothing else in
either table.

**Known limitation, disclosed rather than silently claimed otherwise:**
no browser-automation tool (Playwright or similar) was available in
this session, so the $0-transfer badge and the hotel-list deduplication
were verified at the API layer (exact endpoint/query match to what the
frontend calls) and via `tsc` typecheck, not by driving an actual
browser. Visual confirmation in a real browser session was handed back
to the project owner.

---

# Decision 056

Date: 2026-07-14

Decision: `SpecialOffer.combinable_with_promotions` (new field, Boolean,
`default=False`) makes tactical-offer-vs-Early-Bird combinability a
real, per-offer, data-driven setting rather than a hardcoded rule --
correcting a genuine bug where `get_room_price` applied Promotion
(Early Bird) discounts completely unconditionally, regardless of
whether a SpecialOffer room discount had already reduced the same
booking's price.

Investigated before proposing anything: `SpecialOffer` already had
`combinable_with_other_offers`, but its own docstring explicitly scopes
it to "other SpecialOffer rows on this contract -- entirely independent
of `Promotion.is_stackable`, a structurally separate system." Neither
existing field (`combinable_with_other_offers` for SpecialOffer-vs-
SpecialOffer, `Promotion.is_stackable`/`stacking_group` for Promotion-
vs-Promotion) governs the third relationship this decision needed
(SpecialOffer-vs-Promotion) -- confirmed by reading both fields'
documented intent, not assumed from naming alone. Reusing
`combinable_with_other_offers` was explicitly rejected: current real
data shows Kandima's KM26_03 at `False` (coincidentally matching what
EBO-blocking would want) but all 4 of Siyam World's SWJ26 offers at
`True` (set in Decision 053 to mean "these offers compose with each
other," a fact totally independent of whether they also block Early
Bird) -- proving these are two independently-sourced real contract
facts, not one, and that a single field would either force them to
match or silently misrepresent one of them.

Fix wired into `get_room_price`: when an active `SpecialOffer` room
discount is found, its parent offer's `combinable_with_promotions` is
checked -- `False` (the default) skips Promotion entirely for that
booking (`eligible_promotions = []`, computed before any of the
existing `days_before_arrival` tier-selection logic even runs); `True`
lets Promotion apply exactly as before. Scoped to `room_discount`
specifically (not `meal_discount`/`family_rule` alone), matching the
real contracts' "cannot combine with EBO" language, which is about the
room-rate discount. A booking with no SpecialOffer room discount at all
is completely unaffected -- Promotion selection runs exactly as it did
before this decision.

Real data set to the confirmed values (both via the new column's
`DEFAULT 0`, applied automatically to all 5 existing rows on migration,
so no separate per-row write was needed): Kandima's KM26_03
(offer_id=1) and all 4 of Siyam World's SWJ26 offers (offer_id 2-5) ->
`combinable_with_promotions=False`, matching both hotels' real contract
terms confirmed by the project owner.

Approved By: Daler

Status: Implemented and verified. `dmc.db` backed up before the
migration (a plain additive `ALTER TABLE ... ADD COLUMN
combinable_with_promotions BOOLEAN DEFAULT 0`, no table rebuild needed
since the new column starts nullable/defaulted -- unlike Decision 053's
two NOT NULL columns), deleted after verification passed.

Isolated test (throwaway synthetic hotel/contract/offer/promotion,
deleted afterward) proved the mechanism is genuinely data-driven, not
hardcoded, via three scenarios on the identical setup: (A)
`combinable_with_promotions=False` -> SpecialOffer's 30% applied,
Early Bird correctly skipped entirely (`applied_promotions=[]`,
final_total=700.0 exactly, not 595.0). (B) the SAME offer flipped to
`combinable_with_promotions=True` -> both now apply sequentially
(final_total=595.0 = 700 x 0.85, `applied_promotions=[promo.id]`) --
proving the code branches on the data, not a fixed rule. (C) a
check_in outside the SpecialOffer's window entirely -> Early Bird
applies completely normally on its own (final_total=850.0), confirming
zero regression to the base case where no SpecialOffer is involved at
all.

Regression-checked against real data with a concrete before/after:
Kandima's KM26_03 unchanged (base_total=251.5, this scenario has no
Promotion active regardless). Siyam World Peak season during Offer 3's
blackout (2027-02-15, no SpecialOffer applies since blacked out) --
Early Bird still applies normally, final_total=1042.95, unchanged,
confirming the fix doesn't touch bookings with no active SpecialOffer.
Siyam World Shoulder season (2027-06-01, SWJ26's 30% active) -- THE
concrete proof: `applied_promotions` is now `[]` and final_total stops
at 654.5, where before this decision Early Bird would have also
applied on top, producing 556.325 instead.

Exact scenario verification (Water Villa, room_type_id=21, 14-21 May
2027, 2 adults, Premium AI): room 935/night x 7 nights x 0.7 (SWJ26
30%, Early Bird correctly blocked) = 4581.5, `applied_promotions=[]`
confirmed; Green Tax (12/person/night x 2 x 7) = 168.0; seaplane
transfer at 7 nights (the free tier) = 0.0. Total: 4581.5 + 168.0 + 0.0
= 4749.5 -- exact match to the project owner's expected $4,749.50.

---

# Decision 057

Date: 2026-07-14

Decision: Closed two related, real gaps in Siyam World's children
handling, both stemming from the same root cause -- the original
source data given for Decision 052's contract entry never included
children pricing or occupancy information, so none was invented at the
time. Real data from the source PDF's Section 1.2 ("Villa Occupancy &
Water Villas Restriction on Children") now closes both.

Traced before proposing anything, per standing discipline: (1)
confirmed via direct query that Siyam World's contract had zero
`ContractAgeCategory` rows at all (Kandima has real `Child`/`Adult`
rows; Siyam World had none). (2) confirmed via direct query that every
one of the 15 room types' `RoomOccupancyOption` rows had `children=0`
across the board (the Decision 052/054 inferred 1A/2A/max-occ-adults-
only rows), so Decision 024's dominance check correctly but
unhelpfully rejected any request with children. (3) confirmed via code
trace that `hotel_service.validate_capacity` runs at the very top of
`get_room_price`, before any age-category logic -- so the capacity
check (cause #2) was the actual, immediate failure for "2 adults + 1
child," not the missing age category (cause #1), which is real but
downstream and never reached.

New mechanism: `ContractFamilyRule` (contract-scoped, mirrors
`SpecialOfferFamilyRule`'s waiver shape but keyed to `contract_id`, not
`offer_id`). Deliberately NOT built by reusing `SpecialOfferFamilyRule`
via a fake "permanent" `SpecialOffer` row -- that would misrepresent a
standing base contract term (free for life of the contract, not a
bounded promotional window) as a limited-time tactical offer, and would
pollute `applied_special_offer_ids` with a citation to an offer that
doesn't correspond to any real offer code (the same class of concern
that ruled out reusing `combinable_with_other_offers` in Decision 056).
`start_date`/`end_date` nullable (unlike the offer-scoped table's
required pair) -- NULL spans the contract's entire validity, avoiding a
redundant date range that would just have to track the contract's own
dates. `get_room_price` composes `ContractFamilyRule` with
`SpecialOfferFamilyRule` via `max()` of their `max_free_children_
accommodation`, never additively -- inert overlap today (Kandima only
ever has the offer-scoped rule via KM26_03, Siyam World only the
contract-scoped one), but correctly composable if a future hotel needs
both. Only the offer-scoped rule ever contributes to
`applied_special_offer_ids`.

Real data entered for Siyam World (contract_id=8): "Child"
`ContractAgeCategory` (2-11); a `$260/night` `age_category_price`
`RateSupplement` for Child on all 75 real `Rate` rows (the real
"extra child beyond the complimentary 2" charge); one
`ContractFamilyRule` row (`min_adults=1, max_free_children_
accommodation=2, max_free_child_age_accommodation=11.99`, no date
bound). All 45 old inferred `RoomOccupancyOption` rows deleted and
replaced with 29 real rows matching the source PDF's exact "X+Y / Z"
Max. Occupancy notation per room type (14 room types got the pair;
Two Storey Pool Beach Residence got only its single real "2A+1C"
combo -- no "/3A" alternative was given for it, and none was invented).

Cross-checking the real occupancy data against Decision 052's inferred
`max_occupancy` values surfaced 7 room types where the placeholder was
wrong in both directions -- some too permissive (Water Villa 4->3, Two
Storey Pool Beach Residence 4->3), several too restrictive and would
have silently blocked real max-occupancy bookings (Water Pavilion
4->5, Beach Suite 4->5, Three Bedroom Lagoon Villa 8->9, Three Bedroom
Pool Beach Villa 8->9, Four Bedroom Beach Residence 10->12). All 7
corrected to the real values. Separately, `RoomType.bedroom_count` was
found to be NULL for all 15 room types despite Decision 053's
documentation claiming it had been backfilled -- it was only ever
added as a column, never populated. Backfilled now using the same
bedroom-count-in-name inference Decision 052 used for the (now
corrected) `max_occupancy`, and the stale claim corrected in both
`11_Decisions.md` and `CLAUDE.md`.

Approved By: Daler

Status: Implemented and verified. Isolated test (throwaway synthetic
hotel/contract/family-rule setup, deleted afterward) proved 4
scenarios: no family rule at all -- every child charged $260/night; a
`ContractFamilyRule` alone waiving 2 -- only the 3rd child charged,
`applied_special_offer_ids=[]` confirmed uncorrupted; 1 child within
the free cap -- fully free; a `ContractFamilyRule` (waives 2) and a
less-generous `SpecialOfferFamilyRule` (waives 1) both active
simultaneously -- `max(2,1)=2` waived, NOT additive (would have been 3
free if additive), proving the composition rule.

Caught and fixed a real ordering bug in the data-entry script itself
(not the underlying mechanism): the first attempt tried to insert
Water Pavilion's real "2A+3C" occupancy row before raising its
`max_occupancy` from the stale inferred 4 to the real 5, so
`validate_occupancy_within_capacity` correctly rejected 5 people
against the still-stale ceiling of 4. Fixed by reordering the script
(update `max_occupancy` first, then insert occupancy rows per room
type) and resumed cleanly for the 12 remaining room types without
duplicating the 3 that had already completed successfully.

Regression-checked against both real hotels' existing verified numbers
(Kandima's KM26_03, Siyam World's Decision 056 combinability fix) --
both unchanged. Real scenario checks: Water Villa, 2 adults + 1 child
(Peak season) -> `supplements_total=0.0`, the child fully free,
resolving the originally-reported "no price returned" bug entirely.
Water Pavilion, 2 adults + 3 children (Peak season) -> `supplements_
total=260.0`, exactly the 3rd child charged at $260/night, the first 2
correctly free.

---

# Decision 058

Date: 2026-07-14

Decision: Fixed a real, confirmed frontend display bug in
`HotelSearch.tsx`'s transfer breakdown -- distinct from Decision 057
(a backend/data gap), found via live testing on the same booking flow
in the same session, logged separately since they're two unrelated
fixes.

Investigated before proposing anything: traced `get_transfer_price`'s
exact logic and confirmed it computes one blended total across
adults/children/infants FIRST, then applies a SpecialOfferTransferDiscount's
`discount_percent` to that single combined number -- a structural
property of the schema (`discount_percent` is one flat value per row),
not merely a data-configuration choice. Re-read SWJ26 Offer 4's exact
original source text and found it genuinely silent on whether children
receive the same free/discounted transfer treatment as adults -- "2
guests per bedroom" uses the generic term "guests," not "adults," and
nothing else in the given text distinguishes child transfer pricing
from the separate ($260/night) child ROOM pricing rule. The project
owner confirmed: treat "guests" as covering any age for this offer --
the current uniform-blended-discount mechanism is correct behavior for
SWJ26, not a bug, and no backend/schema change was made for this.

The real, confirmed bug was found separately while tracing the above:
`HotelSearch.tsx`'s per-guest-bucket breakdown lines ("2 x $515 =
$1,030", "1 x $310 = $310") were computed from the RAW, undiscounted
catalog `price_adult`/`price_child` -- while the total shown alongside
them (a dollar figure, or the Decision 055 "Включено бесплатно" badge)
reflects the real DISCOUNTED total from the API. A 7+-night free
transfer would show "Включено бесплатно" as the total while the lines
directly below it still displayed the full undiscounted per-person
math as if that's what guests were being charged -- a directly
contradictory, misleading breakdown, and exactly the "must show
adult/child pricing distinctly and accurately" principle the project
owner had asked for, just violated in the opposite direction (a false
breakdown, not a hidden distinction).

Fix: since the backend's discount is a single uniform percentage
applied to the whole blended total (confirmed correct for this offer
per the above), each bucket's true discounted amount can be
reconstructed exactly, client-side, with no backend change --
`factor = api_total / raw_blended_total`, then `bucket_raw * factor`
per adults/children/infants. This is not an approximation: because the
backend's discount is genuinely uniform, `bucket_raw * factor` is
mathematically identical to what a bucket-scoped backend calculation
would have produced. New `renderTransferBucketLine` helper: when a
bucket's discounted total is exactly $0, renders "{count} {label}:
Включено бесплатно" (matching the project owner's requested phrasing
and the existing total badge's wording) instead of a "2 x $0 = $0"
line that reads as a glitch; otherwise renders the same "count x
discounted-per-unit = discounted-subtotal" format as before, just with
real numbers.

Approved By: Daler

Status: Implemented and verified. `tsc -b` typecheck clean for
`HotelSearch.tsx` (all other reported errors are pre-existing,
unrelated files). No browser-automation tool (Playwright or similar)
is available in this session, so verification was a precise
reconstruction against real API responses using the exact arithmetic
the component now runs, not a screenshot -- disclosed explicitly
rather than claimed as a full visual confirmation; the project owner
will do the manual browser check.

8-night transfer, 2 adults + 1 child (free tier): API total=0.0.
Reconstructed: adultRaw=1030, childRaw=310, rawTotal=1340, factor=0 ->
both buckets discount to exactly $0 -> both lines read "Включено
бесплатно," consistent with the top badge, no undiscounted figure
anywhere.

5-night transfer, 2 adults + 1 child (50% tier): API total=670.0.
Reconstructed: factor=670/1340=0.5 -> adults 1030*0.5=515 ("2 Adults x
$257.50 = $515"), child 310*0.5=155 ("1 Child x $155 = $155"). Sum
515+155=670 matches the top total exactly, correctly reflecting the
real 50% discount rather than the raw $515/$310 catalog rates.

---

# Decision 059

Date: 2026-07-14

Decision: `SpecialOfferTransferDiscount.applies_to_children` (new
field, Boolean, `default=False`) makes whether a transfer discount
extends to children/infants a genuine, per-row, data-driven fact
instead of a hardcoded assumption in either direction -- found via
live testing on Siyam World's transfer flow immediately after Decision
058, and directly reverses that decision's assumption that "guests"
applies uniformly to all ages for every hotel.

Before implementing, checked whether this should be Siyam-World-
specific data or a universal code change (the two options the project
owner posed) and found neither was correct: a direct DB query surfaced
8 real, live `SpecialOfferTransferDiscount` rows already belonging to
Kandima's KM26_03 (`domestic_comfort` 50%, `seaplane` 25%, both
previously untouched by this session's Siyam World work). Cross-
checking against `11_Decisions.md`'s own Decision 034 (logged earlier
in this project) found that decision had already investigated and
verified, against a real project-owner-supplied quote, that Kandima's
50% Domestic Comfort discount correctly includes a child's portion --
$564.00 for 2 adults + 1 child, re-confirmed still live and unchanged
before touching anything. This directly contradicts the project
owner's new instruction that children should NEVER get the transfer
discount treatment -- if applied as a universal code rule, it would
have silently broken Kandima's already-verified-correct real figure;
if left as Siyam-World-only special-cased data with no calculation
change, there was no way to express it at all, since both hotels'
real rows run through the exact same shared calculation function.
Resolved by adding a new per-row field, the same pattern as Decision
056's `combinable_with_promotions` -- both real, contradictory facts
about two real hotels are correct simultaneously because they're
different data on different rows, not a hardcoded rule either
direction.

Calculation fix in `get_transfer_price`: `adult_total`/`child_total`/
`infant_total` computed as separate subtotals; the discount factor
always reduces `adult_total`, and only reduces `child_total`/
`infant_total` when the matched `SpecialOfferTransferDiscount` row's
`applies_to_children` is True. `total` is their sum, unchanged in
shape. The three real per-bucket subtotals are now also returned
directly in the response (`adult_total`/`child_total`/`infant_total`),
not just the blended `total`.

Real data: Kandima's 8 KM26_03 transfer-discount rows set to
`applies_to_children=True` (preserving the real $564.00 figure).
Siyam World's 2 SWJ26 rows left at the default `False` (matching the
project owner's explicit confirmation that Siyam World's real terms
charge children separately/normally for the transfer, never extending
the free/discounted tiers to them) -- set explicitly rather than left
implicit, for the same audit-trail reasons as every other real-data
change this session.

Cascading consequence, flagged and fixed in the same decision:
Decision 058's frontend fix (committed one turn earlier) reconstructed
each guest bucket's discounted amount by deriving ONE factor from
`api_total / raw_blended_total` and applying it uniformly -- which
only worked because the discount WAS uniform across every bucket at
the time. Once `applies_to_children` can make the discount apply to
adults only, that reconstruction produces a wrong, misleading blended
percentage (e.g. would show both an adult and a child line partially
discounted by ~23%, when the real breakdown is "adults 100% off,
child 0% off"). Fixed at the root instead of patching the fragile
reconstruction further: `get_transfer_price`'s response now carries
the real, final per-bucket subtotals directly, and
`HotelSearch.tsx`'s breakdown lines consume `opt.price.adult_total`/
`child_total`/`infant_total` directly -- the factor-reconstruction
code from Decision 058 is fully removed, not layered on top of.

Approved By: Daler

Status: Implemented and verified. `dmc.db` backed up before the
migration (plain additive `ALTER TABLE ... ADD COLUMN
applies_to_children BOOLEAN DEFAULT 0`, all existing rows defaulted to
False automatically), deleted after verification passed.

Isolated test (throwaway synthetic hotel/contract/two transfer
options, deleted afterward) proved both branches on otherwise-
identical 100%-off/7-night setups: `applies_to_children=False` ->
`adult_total=0.0`, `child_total=300.0` (full price, excluded),
`total=300.0`. `applies_to_children=True` -> `adult_total=0.0`,
`child_total=0.0`, `total=0.0`. Confirms the field genuinely branches
the calculation, not a cosmetic flag.

Critical regression check, the figure that motivated this entire
decision: Kandima's real domestic_comfort scenario (2 adults + 1
child, 2027-03-18 to 2027-03-25) re-verified via live API call BEFORE
and AFTER the change -- `total=564.0` unchanged both times, now also
showing the correct itemized `adult_total=414.0`/`child_total=150.0`
(sum 564, matching the previously-blended figure exactly, since
Kandima's real terms always included the child).

Siyam World's real new-correct behavior verified: 8-night, 2 adults +
1 child (the free-tier window) -> `adult_total=0.0`, `child_total=310.0`
(full catalog price, no longer discounted), `total=310.0` -- a genuine
behavior change from what Decision 058 showed one turn earlier (which
had assumed the whole $0), now correctly reflecting that only the
adult portion is free.

Frontend reconstructed against the real API responses (no browser-
automation tool available in this session, disclosed explicitly, same
limitation as Decisions 055/058): Kandima's breakdown now shows "2
Взрослых x $207 = $414" / "1 Ребёнок x $150 = $150", summing to the
unchanged $564 total badge. Siyam World's 8-night booking now shows
the top badge itself changing to "USD 310" (correctly NOT "Включено
бесплатно," since the transfer as a whole is no longer free) with "2
Взрослых: Включено бесплатно" / "1 Ребёнок x $310 = $310" beneath it --
internally consistent throughout, no contradictory figures anywhere.

---

# Decision 060

Date: 2026-07-14

Decision: Two new filtering features for the Admin Panel's Reservations
screen (`BookingsList` in `Reservations.tsx`) -- a booking-number
search field, and an opt-in "by date" view with three distinct,
confirmed semantics. Both client-side over the already-fetched
bookings list, extending the existing `filteredSorted` useMemo rather
than introducing a new table component.

Two structural ambiguities resolved with the project owner before
implementing, rather than guessed:

1. Whether the date filter should be always-active by default (table
   opens every time already restricted to today's stays) or an opt-in
   toggle (unchanged full-list default, switches into date mode only
   when asked). Confirmed: opt-in toggle -- the screen's existing
   default behavior for anyone already using it stays completely
   unaffected; a "По дате" button reveals the date picker (defaulting
   to today) and a "Заезды/Отмены" sub-view control only once enabled.

2. What "cancellations tied to a date" should mean: `cancelled_at`
   falling on the selected date (when the cancellation was processed --
   an audit/activity question) vs. `arrival_date` matching the selected
   date AND status Cancelled (who was supposed to check in that day but
   won't -- an operational, front-desk question). Confirmed the latter,
   matching the project owner's own instinct and the stated operational
   purpose of the whole feature.

A third mode was added in the same session after the project owner
caught that the initial "Заезды" filter (stay dates) doesn't cover a
genuinely different, separately useful question: "which reservations
were CREATED on this date," independent of whenever the actual stay
happens to be. Added as a third mutually-exclusive sub-view rather
than conflating it with "Заезды" -- a booking made today for a March
2027 stay belongs in "Созданы," not "Заезды."

Implementation: `searchQuery` filters `booking_number` via
case-insensitive substring match (e.g. "3EAD" finds
"BK-3EAD4138D496"). `dateModeEnabled`/`dateModeView`/`selectedDate`
add three mutually-exclusive filters under the opt-in toggle: "Заезды"
(`selectedDate` within `[arrival_date, departure_date)`, excluding
`Cancelled`/`Rejected` -- genuinely staying, not merely date-range-
overlapping, since a cancelled booking never actually occupied the
room), "Созданы" (the first 10 characters of `created_at` -- a full
ISO datetime, e.g. "2026-07-14T12:26:08.987733" -- equal `selectedDate`,
entirely independent of the booking's actual stay dates), and "Отмены"
(`arrival_date === selectedDate AND status === "Cancelled"`). Date
strings compared lexicographically as ISO "YYYY-MM-DD" -- the same
convention already used elsewhere in this file, no `Date` object
parsing needed. All new filters compose with the existing
status/hotel/agent filters and fold into the existing "Сбросить
фильтры" reset.

Approved By: Daler

Status: Implemented and verified. `tsc -b` clean for `Reservations.tsx`
(all other reported errors are pre-existing, unrelated files). No
browser-automation tool available in this session (same disclosed
limitation as Decisions 055/058/059), so verification was hand-tracing
the exact filter logic against the real, live `/booking-engine/bookings`
API response (3 real bookings, confirmed identical to the direct DB
query): search for "3EAD" correctly matches `BK-3EAD4138D496`; "Заезды"
for a date inside booking id=2's stay (Pending) correctly includes it
and correctly excludes booking id=3 (Cancelled, even where its old stay
window would otherwise overlap); "Отмены" correctly finds booking id=3
only on its exact original `arrival_date` (2027-03-16), not on other
dates that fell within its now-void stay window (e.g. 2027-03-18) --
confirming the arrival-date-specific semantics, not a date-range
overlap check.

"Созданы" verified with a concrete contrast proving it's a genuinely
different filter, not a redundant rename: for `selectedDate=2026-07-14`
(the real creation date of booking id=4), "Созданы" correctly returns
only that booking, while "Заезды" for the same date returns zero
results -- all 3 real bookings' stay windows are in March 2027, nowhere
near July 2026, so "Заезды" can never accidentally produce the same
result "Созданы" does. For `selectedDate=2026-07-13` (the shared real
creation date of bookings id=2 and id=3), "Созданы" correctly returns
both.

---

# Decision 061

Date: 2026-07-14

Decision: The SpecialOffer extraction module (AI Core Engine Phase 2,
explicitly deferred by Decision 043) must be designed and built as a
continuously-evolving system, not a one-time build -- Decision 036's
"AI Core Evolution Rule" applied iteratively as real-world offers
reveal new patterns over time, not only at initial build.

Reason: With only 2 real hotels contracted so far (Kandima's KM26_03,
Siyam World's SWJ26), and those two alone already needing genuinely
different fields on the same mechanisms this session (Decision 056's
`combinable_with_promotions`, Decision 059's `applies_to_children`,
Decision 057's contract-scoped vs. offer-scoped family rule) -- the
current 5-table SpecialOffer shape (SpecialOffer + room discount, meal
plan discount, family rule, transfer discount) is demonstrably not a
closed, final taxonomy. Future hotels will introduce offer structures
none of these 5 tables can express yet (e.g. a quantity-based "book 3
rooms, 4th free" mechanic has no analog in any of them today). Building
speculative extra flexibility into the schema now, before a single real
offer has proven the need, would repeat exactly what Decision 036
already warned against for AI Core's advanced components -- so this
rule extends that same discipline to the extraction schema/prompt
itself, on an ongoing basis, not just at TASK-002's initial design.

Concrete workflow this establishes: when the extraction model encounters
an offer-shaped clause it cannot confidently map to one of the current
mechanism shapes, it must flag this clearly as a **first-class,
expected outcome** -- never guess a best-fit mechanism, never silently
drop the clause. The manager handles that specific clause manually for
now (same Level 2 Human Gate every other low-confidence field already
goes through). An accumulation of these flagged, unmapped clauses over
time becomes the evidence base for a future, deliberate schema
extension -- a new sub-mechanism table, a new field on an existing one,
or (rarely) a genuinely new top-level entity -- decided only once a
real pattern has actually recurred, never speculatively in advance.

Design consequence: the extraction prompt/schema must be built for
low-friction extensibility from the start -- new mechanism types
addable as new entity_type values without restructuring any existing
ones (the same flat entity_type + JSON-text field_data shape Phase 1
already established, no schema change needed to add a 6th mechanism
type later), and a dedicated "I don't recognize this clause" entity
type must exist as designed-for functionality, not an implicit edge
case that falls out of missing prompt coverage.

Approved By: Daler

Status: Logged as a binding development rule specifically for
SpecialOffer/Phase 2 extraction, alongside Decision 036's original AI
Core Evolution Rule (which this directly extends) and the one-Engine-
at-a-time rule governing the whole project.

Implemented and verified in the same session, after the design proposal
below was confirmed:

`ai/prompts.py`: added 6 new entity type shape blocks (special_offer,
special_offer_room_discount, special_offer_meal_plan_discount,
special_offer_family_rule, special_offer_transfer_discount,
unmapped_offer_clause) to CONTRACT_EXTRACTION_SYSTEM_PROMPT, following
the exact ref/*_ref cross-referencing convention Phase 1 already
established -- zero restructuring of the existing 8 entity types.
unmapped_offer_clause's instructions explicitly require confidence < 70
and all three low-confidence explanation fields, always, by design.

`service.py`: new PHASE_2_ENTITY_TYPES constant (the 6 types above),
requested alongside PHASE_1_ENTITY_TYPES in run_extraction -- Phase 2 is
now live, not just designed.

`contract_writer.py`: 5 new writer functions
(_write_special_offers/_write_special_offer_room_discounts/
_write_special_offer_meal_plan_discounts/_write_special_offer_family_rules/
_write_special_offer_transfer_discounts), wired into
write_approved_fields_to_contract_engine's dependency chain after
rate_supplement. room_type_ref/meal_plan_ref resolved via the existing
_resolve_ref(..., required=False) with zero new resolver logic --
confirming the "extensible without restructuring" design goal held up
in practice, not just in theory. unmapped_offer_clause has no writer
function at all, by design -- confirmed in the verification below that
this produces exactly zero real Contract Engine rows, not a silent
partial write.

`providers.py`'s MockClaudeProvider: extended with real, already-
verified SWJ26 numbers (2 of its real 4 offers -- Value Season's 30%
room discount across 3 real travel windows, Seaplane Transfer's real
100%/50% tiers with applies_to_children=False) as template data on this
mock's own synthetic Kandima-themed contract, plus one deliberately-
fabricated unmapped_offer_clause (a "book 3 villas, 4th free"
quantity-based clause, honestly flagged in-code as the one entry in the
whole table that isn't sourced from a real contract) specifically to
prove the low-confidence flagging mechanism fires end-to-end, not just
the happy path. special_offer_meal_plan_discount and
special_offer_family_rule deliberately absent from this scenario --
SWJ26 genuinely doesn't use either mechanism, so nothing was fabricated
to complete the set artificially.

Verified end-to-end against the real, live dmc.db (not a test DB), same
methodology as Decisions 041/042: created a job, ran the full mock
pipeline (uploaded -> processing -> extracted -> under_review ->
approved), confirmed all 8 Phase 2 ExtractedField rows persisted
correctly (2 special_offer, 3 special_offer_room_discount, 2
special_offer_transfer_discount, 1 unmapped_offer_clause with
confidence=35 and all three low-confidence fields populated), and
confirmed approve_job's real Contract Engine write-through produced
exactly 2 real SpecialOffer rows with the exact expected
combinable_with_other_offers=True/combinable_with_promotions=False
values, 3 real SpecialOfferRoomDiscount rows with room_type_id=None
(flat, all room types) and discount_percent=30.0, and 2 real
SpecialOfferTransferDiscount rows with the exact {7: 100.0, 4: 50.0}
tier structure and applies_to_children=False. Directly confirmed
special_offer_meal_plan_discount and special_offer_family_rule produced
zero rows (nothing extracted this run, nothing fabricated), and --
critically -- confirmed exactly 2 SpecialOffer rows exist total, not 3:
the unmapped_offer_clause was correctly never written anywhere in
Contract Engine, proving the "flag, don't guess, don't write" behavior
holds under a real write-through, not just in the prompt's own
instructions. All job/field/audit/hotel/contract test rows deleted
afterward (throwaway verification data, not real business data, same
precedent as every prior AI Core Engine verification run). Regression-
checked Kandima's real KM26_03 pricing afterward (base_total=251.5,
unchanged) and confirmed via the live Contracts endpoint that only the
2 real contracts (Kandima, Siyam World) remain -- Contract Engine's own
code was never touched by this decision, only AI Core Engine's.

Two unrelated documentation gaps surfaced while grounding this decision
in the real current state, flagged here rather than silently fixed
mid-task (out of scope for this decision, noted for a future pass):
(1) commit `5e7a1e6` ("Close pre-paid-API gap: real PDF text
extraction, not a filename," introducing `pdf_extraction.py` and
`ContractIngestionJob.document_text`) was never logged as its own
numbered Decision entry, despite being a real, shipped capability
change. (2) `CLAUDE.md` has zero mentions of AI Core Engine anywhere,
despite roughly 20 decisions' worth of real, working code already
built (models, repository, service, schemas, api, providers,
contract_writer, pdf_extraction) -- the backend architecture section
is missing an entire Engine's documentation.

---

# Decision 062

Date: 2026-07-13 (logged retroactively on 2026-07-14 -- this decision
was implemented and shipped a day before this entry was written; see
Decision 061's Status section for how the gap was found)

Decision: Real PDF-to-text extraction, closing a gap discovered before
any real (billed) Claude API call was ever made: `ContractIngestionJob`'s
document handed to a provider was just the uploaded filename
(`selectedFile.name`), never the file's actual content.
`MockClaudeProvider` never surfaced this, since it ignores
`document_text` entirely by design -- but `ClaudeProvider` would have
silently sent a filename string as "the contract" on its first real,
paid call.

New `pdf_extraction.py` (`pdfplumber`) extracts text in-memory from the
uploaded bytes -- verified beforehand against a real 13-page DMC
contract PDF (41,989 characters, real rate/tax terminology intact
end-to-end) before being wired into the pipeline, entirely free. New
`ContractIngestionJob.document_text` column, deliberately separate from
`file_reference` (which stays the human-readable filename shown in the
UI). New `POST /jobs/upload-pdf` (multipart) extracts text synchronously
at upload time; the older JSON `POST /jobs` is untouched, still valid
for `hotel_id`-only or manual/test job creation. `run_extraction` now
reads `job.document_text` instead of `job.file_reference`. No raw PDF
bytes are ever persisted anywhere -- only the extracted text, since no
file-storage layer exists in this project (`CLAUDE.md`'s reality-vs-docs
gap).

`requirements.txt` gained `pdfplumber` and `python-multipart` -- the
latter wasn't installed at all; FastAPI silently requires it for any
`UploadFile`/`Form` endpoint, caught here before it became a runtime
failure rather than after.

Reason: A real, paid Claude API call must never be made against a
filename string mislabeled as contract text -- this needed to be fixed
before `backend/.env` ever gets a real `ANTHROPIC_API_KEY`, not
discovered on the first billed call.

Approved By: Daler

Status: Implemented and verified at the time (commit `5e7a1e6`, "Close
pre-paid-API gap: real PDF text extraction, not a filename"). Verified
live via the real multipart endpoint, not just a standalone script:
`document_text` length in the DB matched the standalone
`pdfplumber` test byte-for-byte; backward compatibility with the older
JSON `POST /jobs` path and the non-PDF error path (a clean 400, not a
crash) were both confirmed. This entry itself is a retroactive log
correction, not new work -- flagged and closed per the project owner's
explicit instruction after Decision 061 surfaced that it had shipped
without ever being logged.

---

# Decision 063

Date: 2026-07-14

Decision: New standalone "Расчёт цены" (Price Calculator) tool in Admin
Panel -- a read-only internal verification screen that calls the exact
same real Contract Engine endpoints (`get_room_price`, `get_transfer_price`,
`get_mandatory_tax`) `HotelSearch.tsx` and `Reservations.tsx`'s
`BookingDetail` cost breakdown already use, with zero new pricing logic
and zero database writes of any kind -- every call in the new file is a
GET.

New `frontend/src/pages/PriceCalculator.tsx`, mounted as a 5th
`AdminPanel.tsx` tab alongside Пользователи/Бронирования/Контракты/
Контракты — ИИ, same tab-switching pattern. Form: Hotel -> Room Type
(cascading dropdowns, real Hotel Engine data) -> check-in/check-out
(reused `DateRangePicker`, already exported from `HotelSearch.tsx`) ->
Adults + child ages, reusing `deriveOccupancy` verbatim (newly exported
from `HotelSearch.tsx` for this reuse) rather than inventing a third,
inconsistent guest-input pattern -- no separate raw "infants" field, since
`HotelSearch.tsx`'s own real pattern derives all three buckets
(adults/children/infants) from each child's age, not from separate raw
counts. Meal Plan (the priced-only `GET .../room-types/{id}/meal-plans`
Interface Contract endpoint, not the full unfiltered CRUD list) and
Transfer (optional, `GET .../transfer-options/available`) dropdowns both
scoped to the hotel's real active contract, resolved via the same
`GET /hotels/{id}/active-contract?check_in=...` call `HotelSearch.tsx`
already makes. Breakdown display resolves season name
(`GET /contract-seasons/{id}`), Promotion names, and SpecialOffer names
the same way `Reservations.tsx`'s LPO already does. "Копировать" reuses
the same plain Markdown-pipe-table convention and `navigator.clipboard`
pattern as the LPO, headed "Расчёт для проверки" instead of a hotel
greeting.

Reason: Direct project-owner request for a fast, zero-risk way to
manually verify what the pricing engine actually produces for any real
hotel/room/date/occupancy combination, without going through a full
search-and-book flow and without any risk of the verification itself
creating real data.

Approved By: Daler

Status: Implemented. `tsc -b` clean for all three touched files
(`PriceCalculator.tsx` new, `AdminPanel.tsx`, `HotelSearch.tsx`'s
`deriveOccupancy` export) -- other reported errors are pre-existing,
unrelated files.

A real discrepancy was caught and resolved before this decision was
logged, not silently written down: the project owner's initial
verification target, $1,192.00 (Kandima Sunrise Beach Pool Villa, 3
adults, BB), was traced live and found to no longer be reproducible by
the current system -- confirmed to be Decision 017's original raw
base_price ($1,002) + extra_person supplement ($190) figure, predating
KM26_03's real 50% room-discount data entry for this exact room type
(`applies_to_extra_person=True`, active across virtually the entire
contract's validity, 2026-07-08 through 2028-01-10). The project owner
confirmed $1,192 was the outdated pre-KM26_03 reference point, not an
expectation the calculator should have matched -- $596.00 (base $501.00
+ supplements $95.00, both exactly half of the raw figures, KM26_03
applied automatically) is the correct, current, live-verified answer,
and matching it (not $1,192) is what proves the calculator is using the
real pricing engine correctly.

Verified by tracing every call `PriceCalculator.tsx` makes, in the exact
sequence and with the exact parameters the component produces for this
scenario, directly against the live server: active-contract resolution
-> contract_id=2; meal-plans list includes BB; `get_room_price`
(contract=2, room_type=2, BB, 3 adults, 2027-02-01) ->
base_total=501.0, supplements_total=95.0, applied_special_offer_ids=[1],
final_total=596.0; `get_mandatory_tax` (nights=1, adults=3) -> Green
Tax, 36.0; season_id=2 resolves to "Peak"; special_offer id=1 resolves
to "KM26_03". Grand total (no transfer selected): 596.00 + 36.00 =
632.00 -- the exact figure the component's own arithmetic (summing
three already-computed real totals, no client-side pricing logic)
produces.

No browser-automation tool is available in this session (same disclosed
limitation as every prior UI feature this session -- Decisions
055/058/059/060), so this was the strongest verification available:
confirming every underlying real API call matches exactly, not a
screenshot of the rendered form.

---

# Decision 064

Date: 2026-07-14

Decision: Formalizing integration-readiness principles for future
dynamic/API-driven hotel connectivity.

Correction before this decision's own content: the project owner's
request framed this as "extending Decision 019's original long-term
integration vision." Checked directly rather than assumed: Decision 019
is genuinely about net-vs-gross discount/tax calculation ordering,
unrelated to integration. The actual source of the "Decision 019's
long-term vision" phrase is a loose, informal parenthetical already
sitting in Decision 044 ("no real per-day hotel inventory feed exists
yet, per Decision 019's long-term vision being unbuilt") -- itself a
pre-existing mislabel from before this session, not a real prior
articulation of this vision. `05_Architecture.md` doesn't substantively
cover it either -- module #19 ("Integration") is a bare one-line list
entry, never expanded. This decision is therefore the first substantive
articulation of the integration-readiness vision, not an extension of
an existing one; flagged here rather than silently perpetuating an
inaccurate lineage into a second decision.

Core principle (already true by construction, now formalized as a
permanent constraint): Contract Engine and Hotel Engine must remain the
single, stable "source of truth" that ANY input method writes into --
manual entry (built), AI-assisted PDF parsing (built, Phase 1+2), and
future real-time hotel/aggregator integration (not built) must all be
interchangeable data sources feeding the same tables, with zero changes
required to Booking Engine, `HotelSearch.tsx`, pricing calculations, or
any other downstream consumer.

Real-world addition: not all hotels offer direct API integration --
many require going through third-party aggregators/channel managers
(e.g. Derbysoft, HotelBeds, SiteMinder-style platforms), each with its
own distinct data format/API/field structure. This means future
integration isn't a single adapter -- it's potentially a FAMILY of
aggregator-specific adapters, each translating that aggregator's
particular format into the same Contract/Hotel Engine tables via the
same `create_hotel`/`create_contract`/`create_rate` functions already
used by manual entry and AI parsing today. Each adapter is built only
when a real partnership with that specific channel is confirmed -- same
"build only once a proven need exists" discipline as Decisions 036/061
-- not built speculatively in advance.

Concrete readiness gaps flagged for future work (documentation only,
not building now):
1. A "last synced" timestamp on Contract/Rate rows, distinct from
   `created_at`, to detect staleness once real-time feeds exist.
2. Future integrations will likely need to UPDATE existing rates, not
   just create new ones -- check whether `update_rate`/
   `update_contract_season` already have the right granularity, or need
   future extension.
3. Allotment (Decision 044's permissive-mode gap) becomes far more
   important once real-time -- a live inventory feed would need strict
   mode re-enabled per-contract once real data flows in, not the
   current global flag.
4. AI Core Engine's Human Gate pattern (manual approval before publish)
   likely won't scale to real-time updates arriving many times a day --
   a future high-confidence/high-trust auto-publish path may eventually
   be needed for integrated/aggregator-fed hotels specifically, while
   newly-onboarded or manually-entered hotels keep the current Gate.
   This Level 3 vs Level 2 distinction needs real thought later, not
   decided now.

Reason: Project owner's real-world experience confirms most current
hotel relationships are contract-based (static documents), but the
strategic direction is toward dynamic, API/aggregator-driven
connectivity. Documenting this now, while the architecture is still
small (2 real hotels), ensures future integration work builds on an
already-compatible foundation rather than requiring rework -- the same
reasoning already applied to AI Core's provider abstraction, now
extended to the data-source layer itself.

Approved By: Daler

Status: Logged as long-term architectural vision and readiness
checklist. No implementation now -- current focus remains manual entry
and AI-assisted parsing (both already working). This decision ensures
today's architecture doesn't need rework when real-time/aggregator
integrations become relevant later.

---

# Decision 065

Date: 2026-07-15

Decision: "No AI subsystem may receive a production implementation
until at least one real business workflow successfully uses the
existing AI infrastructure end-to-end. Architecture may exist. Skeleton
may exist. Production implementation must follow proven business
value." This is a strengthening of Decision 036's three-question
discipline into a hard, binding rule: it's not enough to answer "what
problem does this solve" -- a component may not move from
architecture/skeleton into real, working code until an existing AI
capability has been demonstrated working in a real, end-to-end scenario
(not just isolated tests, but genuine use).

Precision note on the retroactive framing below: Model Router,
confidence scoring, and the Human Gate were not built after a separate
prior capability proved the need for them -- they ARE Phase 1's own
foundational core, built and proven together (Decisions 038-041: domain
model, workflow state machine, REST surface, then the mock end-to-end
pipeline run). They are the first real AI capability this project ever
shipped, not an instance of this rule already being followed in
sequence. What the retroactive application below correctly captures is
that everything since Phase 1 -- starting with Phase 2 -- has in fact
waited for that already-proven core before being built, and that is the
precedent this rule now makes binding going forward.

Applied retroactively to confirm this project's actual practice: AI
Core Engine's Knowledge Base, Context Manager, Skills-as-plugins,
Learning, and Metrics remain architecture-and-skeleton-only (per
Decision 035's full vision, gated by Decision 036) -- confirmed still
true by direct inspection: `ai/assistant.py`, `automation.py`,
`checker.py`, `learning.py`, `memory.py`, and `rules.py` are all still
zero-byte, only `ai/prompts.py` has real content. Correctly not
implemented, because no proven business workflow has yet demonstrated
their necessity. Model Router, confidence scoring, and the Human Gate
DID receive production implementation as Phase 1's proven core; Phase 2
(SpecialOffer extraction) then correctly extended that same
already-proven pipeline rather than front-loading a new one, verified
against real hotel data (Kandima, Siyam World) before being called
complete.

Applied forward: any future AI capability (e.g. AI-driven hotel email
correspondence, autonomous booking-modification proposals, Pricing
Engine's markup suggestions) must wait until it can point to a real,
working precedent using the existing AI Core infrastructure -- not be
built speculatively alongside architecture, and not be justified by
"the architecture already supports it."

Reason: Prevents building AI production code ahead of proven need,
even when the underlying architecture would technically permit it --
architecture and skeleton are cheap and can be laid out in advance (as
this project already does for all 22 Engines), but production
implementation carries real cost (development time, maintenance
burden, and for AI specifically, real API cost once connected) and
should only be spent where business value is already demonstrated, not
anticipated.

Approved By: Daler

Status: Logged as a binding, stricter successor to Decision 036 --
governs all future AI Core Engine (and any other Engine's AI-related)
production work.

---

# Decision 066

Date: 2026-07-15

Decision: Booking Engine now sends an automatic, one-way booking-
confirmation email to the agent's registered address immediately on
booking creation (Decision 029 Stage 2: "automatic email
notifications... no AI decision-making, just templated notifications").
The email contains a Markdown-pipe-table (same convention as
Reservations.tsx's LPO and PriceCalculator.tsx, replicated in Python
for the first time as `email_service._render_text_table`) of hotel,
room type, dates, meal plan, occupancy, guest names, base rate,
supplements, offer/promo, room total, mandatory tax (real label),
transfer (only when one was actually selected), and grand total -- all
values pre-resolved server-side by `booking/api.py` via the same real
Hotel/Contract Engine functions (`get_room_price`, `get_transfer_price`,
`get_mandatory_tax`, `get_contract_meal_plan`) already used by
Reservations.tsx's cost breakdown and the LPO generator. No new pricing
or calculation logic was introduced.

Corrected premise: this was initially assumed to need the same staged,
content-only approach as `BookingCorrespondence` (Decision 049), which
deliberately deferred real sending pending a business mailbox. That
gap is specifically about TWO-WAY correspondence (reading replies via
IMAP); this feature is one-way outbound only, and real, working SMTP
infrastructure already exists (`services/email_service.py`'s
`send_real_email`, already live-wired into the agent-registration
flow) -- so both content generation and real send wiring were built
together in this same task, not staged.

Guest-data-timing constraint: `BookingCreate` has no guest fields --
guests are always added via a separate, later, non-transactional call
-- so guest names frequently don't exist yet at the moment a booking is
created. Resolved (owner's explicit choice): fire the email immediately
on booking creation regardless, showing the real state of guests at
that moment (an honest "Гости будут добавлены отдельно" fallback when
empty, never fabricated placeholder names) -- guaranteed, immediate
delivery of the confirmation was judged more valuable than delaying for
complete-but-possibly-never-sent content.

Implementation: `email_service.send_booking_confirmation_email(data)`
(new) builds the table and calls `send_real_email`, inheriting its
existing graceful console-log fallback when SMTP isn't configured and
its "never raises" safety. `booking/api.py` adds
`_send_confirmation_email_best_effort(db, booking)`, called from
`create_booking` right after a successful insert, wrapped in its own
try/except covering the entire resolution block -- an email failure of
any kind can never turn a successful booking creation into an HTTP
error for the agent.

Reason: Closes a real gap (agents previously received no confirmation
of a booking they just created) using infrastructure that already
exists, at the lowest-risk point in the flow (best-effort, non-
blocking), consistent with Decision 029's own Stage 2 scope and
Decision 065's gate (this extends an already-proven, already-wired
capability -- real SMTP sending -- rather than building new production
AI/infra ahead of need; no AI decision-making is involved at all).

Approved By: Daler

Status: Implemented and verified live. `email_service.py`:
`_render_text_table` + `send_booking_confirmation_email` added.
`booking/api.py`: imports added (`Booking`, `hotel_service`,
`contract_service`, `User`, `email_service`);
`_send_confirmation_email_best_effort` added;
`create_booking` calls it after a successful insert. Verified against a
real test booking (`BK-D36D87C5C49D`, Siyam World, Water Villa with
Pool + Slide, 2027-06-01 to 2027-06-08, seaplane transfer,
`agent_id=5`, a dedicated test agent, not a real person's account):
empty guest list correctly rendered the fallback text; the real
mandatory-tax label ("Green Tax") displayed correctly; the transfer
line appeared (Seaplane Transfer, Round Trip) since this booking had
one; grand total was $4749.5, an exact match to Decision 056's
independently-verified figure for this same hotel/room/date
combination. The transfer-line-ABSENT case could not be verified via a
real end-to-end booking, since both real hotels in the system
(Kandima, Siyam World) have `transfer_required=true` -- verified
instead via an isolated call to `_render_text_table`/the row-building
logic with `transfer_name=None`, confirming the line is correctly
omitted. Test booking was cancelled (releasing its real allotment) and
then hard-deleted (`guests`, `booking_correspondence`, `bookings` rows
for that id) after verification, leaving no test data behind.

---

# Decision 067

Date: 2026-07-15

Decision: Retroactively logging `frontend/src/pages/HotelSearch.tsx`'s
Marriott.com-referenced layout redesign (commit `09e84c2`, built and
confirmed working live in-browser earlier this session, but committed
without a Decision entry at the time -- a deviation from this session's
otherwise consistent practice, flagged then and now corrected). Used as
a visual STRUCTURE reference only (layout, prominence, calendar UX) --
not a literal Marriott-branded copy -- keeping the project's existing
ink/coral/teal/sand palette and Fraunces/Inter fonts throughout. Four
changes: (1) agent navigation moved into a horizontal top bar (logo
left; "Поиск"/"Мои бронирования" center-right, the latter reusing the
existing `onBack`/agent-dashboard navigation with no new route; agent
name + initials avatar far right), replacing the prior plain-header
pattern; (2) the search form enlarged into a prominent, centered card
(`-mt-10`/`-mt-12` overlapping a new gradient hero band, `shadow-xl`,
larger padding/text/columns/button) instead of the previous small
compact form, with zero changes to its underlying fields, state, or
handlers; (3) the date field's popover now renders two real calendar
months side by side via a new `MonthGrid` sub-component (pure
rendering, shared selection logic), both advancing together off one
shared prev/next control -- previously only a single month rendered;
(4) a gradient hero band (`from-ink via-ink to-coral/40`) substitutes
for a photo, since no photo-asset pipeline exists in this project yet
(flagged explicitly in-code as a placeholder choice, not a finished
design decision).

Reason: Improves the agent-facing hotel search experience's visual
prominence and calendar usability to match a well-established reference
pattern, while deliberately changing only presentation -- no search
logic, occupancy derivation, or API calls were touched (`deriveOccupancy`
was exported for the new component split but its behavior is
unchanged). Logged now, retroactively, so the Decision log accurately
reflects a real, already-shipped, already-verified change -- consistent
with this session's practice of recording every deliberate change to
Engine-adjacent frontend code, even backend-locked Engines' consuming
UI.

Approved By: Daler

Status: Implemented, committed (`09e84c2`, 144 insertions / 75
deletions), and confirmed working live in-browser by the project owner
at the time of the change (two-month calendar opens correctly on
click, top nav navigation works, search form submits unchanged). `tsc
-b` was clean for this file at commit time. No backend changes
involved.

---

# Decision 068

Date: 2026-07-17

Decision: AI Core Engine (`app/engines/ai_core/`) is now 🔒 LOCKED,
closing its TASK-005/006 review. This is a deliberate exception to
strict "one Engine at a time" sequencing (`CLAUDE.md`'s own escape
hatch: "unless explicitly told otherwise by the project owner") --
raised because a new Pricing Engine feature request arrived while AI
Core Engine still showed `🚧 In progress, not LOCKED`, and rather than
either block Pricing Engine indefinitely or silently start it out of
sequence, the choice was surfaced explicitly. Owner's explicit choice:
lock AI Core Engine now, treating the Mock-provider boundary as the
locked implementation and a real Anthropic API connection as a future
additive extension to an already-LOCKED engine -- the same pattern
already used for every other post-lock extension in this project
(Decisions 053/057/059 on Hotel/Contract Engine, etc.), not a lock
blocker.

TASK-005 review (re-verifying, not re-testing from scratch -- citing
what earlier decisions already proved): Phase 1's full 8-entity
taxonomy (`room_type → contract → {age_category, meal_plan, season} →
transfer_option → rate → rate_supplement`) and Phase 2's SpecialOffer +
4 sub-mechanism tables were each verified end-to-end against the real,
live `dmc.db` (Decisions 041/042/043/061/062) -- not a test database --
running the complete pipeline (`create_ingestion_job → run_extraction →
record_extracted_field → submit_for_review → approve_job →
contract_writer`'s real write-through) with `MockClaudeProvider`
standing in for the real LLM call. Decision 061's verification is the
strongest evidence: it confirmed real Contract Engine rows were created
with exact expected values (2 `SpecialOffer` rows with the right
`combinable_with_promotions` values, 3 `SpecialOfferRoomDiscount` rows
with the right `discount_percent`, 2 `SpecialOfferTransferDiscount` rows
with the right tier structure), confirmed the deliberately-fabricated
`unmapped_offer_clause` produced *zero* Contract Engine rows (proving
the "flag, don't guess, don't write" Human Gate boundary holds under a
real write-through, not just in the prompt's own instructions), and
regression-checked Kandima's real KM26_03 pricing was unaffected
afterward. The Model Router abstraction (`providers.py`) was proven
functionally complete: swapping `mock` for `claude` is already a
`set_active_provider` **data** change today, not a code change --
`ClaudeProvider` is fully built against the same `ModelProvider`
Protocol, just never yet given a real API key. `pdf_extraction.py`
(Decision 062) confirmed `document_text` is real extracted PDF text, not
a placeholder filename. All verification runs' test artifacts (jobs,
fields, audit rows, throwaway hotel/contract rows) were deleted
afterward each time; the project's real data (Kandima, Siyam World, and
the 2 real `ModelProviderConfig` rows) was left untouched throughout.

Explicitly NOT covered by this lock, staying exactly as-built (empty
scaffolding, gated by Decision 036's "AI Core Evolution Rule" as
extended by Decision 061): `workflow.py`, `permissions.py`,
`exceptions.py`, `constants.py`, `config.py`, `utils.py`, `events.py`,
and the `ai/` subfolder's `assistant.py`/`automation.py`/`checker.py`/
`learning.py`/`memory.py`/`rules.py` (Knowledge Base, Context Manager,
Skills-as-plugins, Learning, Metrics). Locking the engine does not
unlock these -- they remain governed by Decision 065's stricter gate
("no production implementation until a real business workflow proves
the need") exactly as before. Also explicitly NOT covered: `Promotion`,
`BlackoutDate`, `CancellationPolicy`, `ContractFamilyRule` extraction
(Phase 3, undesigned, same "build only once proven" discipline that
deferred Phase 2 until Decision 061).

Reason: The engine's core, shippable capability (upload a real contract
PDF → extract structured data with confidence scoring → Human Gate
review → real write-through into Hotel/Contract Engine) has been built
and independently re-proven correct across 5+ separate verification
runs spanning both real hotels in the system, meeting the same bar
Hotel/Contract/Booking Engine were locked against (real end-to-end
verification, no pytest suite, consistent with this project's
established practice everywhere). Decision 065's proven-business-value
gate is about *new* AI subsystems beyond this core (Knowledge Base,
Learning, etc.), not a reason to leave an already-proven core
perpetually unlocked -- conflating "provider is mocked" with
"capability is unproven" would misread Decision 065's own intent, which
targeted production AI code built *ahead* of proof, not a proof that
happens to run through a deliberately-substituted mock provider by
design.

Approved By: Daler

Status: AI Core Engine status changed to 🔒 LOCKED in `CLAUDE.md`.
`ClaudeProvider`/real Anthropic API integration remains an open,
explicitly future additive extension (needs `ANTHROPIC_API_KEY` in
`backend/.env` and an explicit decision to start paying for usage) --
not a blocker to this lock, and not scheduled by this decision. This
lock clears the way for Pricing Engine (module #6/#7 depending on
numbering) to begin its own TASK-000 baseline check next, per the
Engine Development Rule's normal one-at-a-time sequencing.

---

# Decision 069

Date: 2026-07-17

Decision: Pricing Engine (`app/engines/pricing/`) built -- domain model,
service, and API (TASK-001/002), plus an additive extension to LOCKED
Booking Engine so real bookings actually reflect agent-facing pricing,
not raw Contract Engine net cost. This is the project's first real
implementation of `01_Modules_List.md` #6's Markup concept, scoped down
from the Data Dictionary's original per-agent/per-rate vision to what
the project owner explicitly specified: one global flat per-night
markup, plus a per-contract (not global, not per-agent) exclusive-tier
room-rate discount.

Domain model: `PricingSettings` (single row, id=1, get-or-created --
`standard_markup_amount_per_night`, default $10.00/night, no
exclusive-discount field). `ExclusiveAgent` (one row per agent in the
Exclusive tier; absence = Standard, so new agent registrations default
to Standard with zero changes to the registration-approval code path).
`ContractExclusiveDiscount` (one row per contract that actually offers
an exclusive-agent arrangement -- most contracts will have none, by
design; `discount_percent` varies per contract, manager-set, no global
default). All three cross-engine references (`user_id`, `contract_id`,
`assigned_by`, `created_by`) are plain Integers, no SQL ForeignKey, same
decoupling convention as every other Engine.

Design correction mid-session: the exclusive discount was originally
specified as one global percentage applying everywhere ("regardless of
which hotel/contract"). The owner corrected this before any code was
written: only a handful of real hotels will ever offer this
arrangement, the percentage varies per hotel, and it must be
explicitly configured per contract with no row meaning no arrangement
-- not defaulting to some global number. `ContractExclusiveDiscount`
replaced what would have been a second field on `PricingSettings`.

`service.apply_agent_pricing(db, agent_id, contract_id, room_net_total,
nights)` -- documented in full in
`docs/interface-contracts/pricing-booking.md` (new Interface Contract,
per `CLAUDE.md`'s cross-Engine-dependency rule). Both conditions must
hold for any discount: agent in `ExclusiveAgent` AND `contract_id` has a
`ContractExclusiveDiscount` row -- an Exclusive-tier agent at a hotel
with no such row pays net + markup only, identical to a Standard agent.
Calculation order (owner-confirmed): discount the net total first (on
the tactical-offer-already-discounted net Contract Engine returns),
then add the flat per-night markup on top of that. Only the room total
is touched -- transfer and mandatory tax are never modified by Pricing
Engine, deliberately, since a transfer is a one-time charge with no
"per night" concept and tax is a hotel-mandated pass-through. Pricing
Engine never imports Contract Engine's `service.py` -- it operates on
plain numbers the caller already resolved, a deliberately looser
coupling than Booking/AI Core Engine's direct-import pattern.

Booking Engine extension (LOCKED, additive): `create_booking` now calls
`apply_agent_pricing` after `get_room_price` and before the `Booking`
insert, using `agent_room_total` as `total_amount` (previously
`price["final_total"]`, i.e. raw net -- meaning every booking in this
project before this decision was invoiced at pure net cost with zero
markup anywhere, a real gap this closes). Two new nullable columns,
`agent_markup_amount`/`agent_exclusive_discount_amount`, itemize the
breakdown -- same "separate column so Finance Engine can itemize later"
precedent as `transfer_total`/`mandatory_tax_total` (Decisions 022/033).
Both are NULL (not 0) on the 3 real bookings that predate this decision,
keeping "not computed" distinguishable from "computed, zero."

Verified: 3 isolated `apply_agent_pricing` cases (Standard; Exclusive
with a configured contract discount; Exclusive at a contract with none,
proving both conditions are genuinely required together, not agent tier
alone) -- all passed. Regression against real bookings through the full
`create_booking` flow: Kandima (Standard, net $1298.00 -> total
$1338.00, exactly net + $40 markup for 4 nights), Kandima (same agent
made Exclusive, contract given an 8% discount, net $1298.00 -> $1234.16,
exactly 8% off net + $40 markup), Siyam World (same still-Exclusive
agent, no `ContractExclusiveDiscount` row for this contract, net
$4581.50 -> $4651.50, net + markup only -- confirming the discount
doesn't leak across hotels for an Exclusive-tier agent). Siyam World's
$4581.50 net matches Decision 056's independently-verified figure,
confirming no regression. All 3 test bookings cancelled (releasing real
allotment) and hard-deleted afterward; `ExclusiveAgent`/
`ContractExclusiveDiscount` test rows removed; the 3 pre-existing real
production bookings confirmed untouched.

Reason: Closes a real, previously-undiscovered gap -- every booking ever
created in this project was invoiced at raw Contract Engine net cost,
with no markup mechanism anywhere, meaning the company had no
systematic way to charge agents more than hotel net cost. Also
implements the real, confirmed business need for a differentiated
pricing tier for a small set of strategic/exclusive agent
relationships, without touching Contract Engine's own SpecialOffer/
Promotion mechanisms (which remain purely hotel-tactical, unaware of
agent identity) or reusing them via a fake per-contract entry, the same
anti-pattern Decision 057 already rejected for a different mechanism.

Approved By: Daler

Status: Backend implemented and verified (models, schemas, repository,
service, api, Interface Contract doc, Booking Engine extension, DB
migration -- 3 new tables plus 2 new nullable `bookings` columns).
Frontend (Admin Panel "Контрагенты" tab, `Contracts.tsx`'s
exclusive-discount field) not yet built -- **Pricing Engine is
deliberately NOT marked LOCKED yet**, unlike Hotel/Contract/Booking's
backend-only-by-explicit-decision precedent (Decision 007): frontend
here isn't deferred by a deliberate scope decision, it's the immediate
next task in this same session, so TASK-006 LOCK review will follow
once it ships and the full surface has been exercised end-to-end from
the UI, not before.

---

# Decision 070

Date: 2026-07-17

Decision: Pricing Engine's frontend shipped -- the Admin Panel
"Контрагенты" tab (`frontend/src/pages/Counteragents.tsx`, new file),
`Contracts.tsx`'s exclusive-discount field, and (found and fixed in the
same session, before this could be called complete) a critical
price-consistency bug: `HotelSearch.tsx`'s search-results screen was
still calling Contract Engine's `get_room_price` directly and
displaying its raw `final_total` -- meaning agents searching saw the
hotel's Net cost, not their real Sale price, while `create_booking`
(Decision 069) already charged the correct marked-up/discounted total.
Before Decision 069 this gap was invisible (no markup existed anywhere,
so the two numbers were identical); after it, search and the real
charge silently diverged -- a real trust-breaking bug, found by directly
tracing which endpoint the search screen calls rather than assuming
Decision 069's backend work was sufficient on its own.

`Counteragents.tsx`: global markup setting (editable, `PUT
/pricing-engine/settings`), Standard/Exclusive sub-tabs (`GET
/pricing-engine/agents/standard` and `/exclusive`), an "Добавить" modal
(search over the Standard list, `POST /pricing-engine/agents/exclusive`)
and a "Вернуть в стандартные" button per Exclusive row (`DELETE
/pricing-engine/agents/exclusive/{user_id}`) -- the removal path wasn't
in the original spec but was added deliberately: an add-without-undo
flow would be a real usability gap for a genuine business scenario
(wrong agent added by mistake, or an arrangement ending), matching the
project's standing principle that management happens through the UI,
not direct database access. Wired into `AdminPanel.tsx` as a 6th tab.

`Contracts.tsx`: a read-only "Скидка (Excl.)" column in the list view
(per-contract fetch, same accepted pattern the list already uses for
`coverage`), and an editable discount section in the detail view
(input + Сохранить/Убрать, `PUT`/`DELETE
/pricing-engine/contracts/{id}/exclusive-discount`) -- kept in the
existing Contracts screen rather than a separate admin surface, per the
explicit prior agreement to keep all of a contract's terms (rates,
seasons, transfer, and now this) in one place. `fetchJson` extended
with an optional `options` parameter (method/body) to support
PUT/DELETE, matching `Counteragents.tsx`'s own copy of the same helper.

The price-consistency fix: rejected the originally-sketched approach (a
new Pricing Engine endpoint that internally calls Contract Engine's
`get_room_price`) because it would re-couple Pricing Engine to Contract
Engine's signatures -- exactly what Decision 069's
`docs/interface-contracts/pricing-booking.md` Rule 1 deliberately
avoided. Instead: a new, thin `GET /pricing-engine/agent-price`
endpoint (query params `agent_id`, `contract_id`, `room_net_total`,
`nights`) that does nothing but call the exact existing
`apply_agent_pricing` function -- zero new business logic, not
admin-gated (agents call it directly from search, same trust level
`create_booking` already extends to a client-supplied `agent_id`).
`HotelSearch.tsx`'s meal-plan price loop now makes this as a second
call immediately after Contract Engine's price call, inside the same
try block, so a raw net price can never display without the real agent
price also having succeeded -- a failure in either call now falls
through to the existing `priceError` path. `cheapestOption`,
`cheapestOptionPrice`, the room-type card's `grandTotal`, and the
per-meal-plan-option render all switched from `opt.price.final_total`
to `opt.agentPrice.agent_room_total`; the raw `price` field is kept
(not overwritten) alongside the new `agentPrice` field, so the two
stay honestly distinguishable rather than silently merged.

Reason: Frontend closes the loop on Decision 069's backend work --
managers can now actually configure the markup/exclusive-discount
system through the UI instead of direct database access, matching this
session's standing principle. The price-consistency fix was treated as
urgent, not deferred, because showing one price at search and charging
a different one at actual booking creation is a correctness bug with
real business trust implications, not a missing nice-to-have --
confirmed as the highest-priority item the moment it was identified.

Approved By: Daler

Status: Implemented and verified. `tsc -b` clean across all touched
files (`Counteragents.tsx`, `AdminPanel.tsx`, `Contracts.tsx`,
`HotelSearch.tsx`), confirmed by fresh full-project type-check runs
after every edit, not just the individual files. Live-verified end to
end (no browser automation available, so verified via the exact same
sequence of real HTTP calls the UI makes): added a test agent to
Exclusive via the real API path the "Добавить" button calls, confirmed
correct list placement; set Kandima's contract to an 8% discount via
the same endpoint `Contracts.tsx` calls, confirmed a real booking
through the full `create_booking` flow matched exactly ($1234.16,
identical to Decision 069's own regression figure). For the search-fix
specifically: Kandima's Sky Studio (2027-06-01 to 2027-06-05, 4 nights)
showed $758.20 for a Standard agent (net $718.20 + $40 markup) and
$700.74 for the same agent made Exclusive with the contract's 8%
discount applied; a real booking created with identical parameters
charged exactly $700.74 -- **byte-for-byte identical to the search
preview**, confirming zero discrepancy between what agents see and what
they're actually charged. All test bookings cancelled and hard-deleted,
all test `ExclusiveAgent`/`ContractExclusiveDiscount` rows removed
afterward (one exception, not part of this decision's test data: the
project owner's own live UI testing left `user_id=2` in the Exclusive
tier, left in place at their explicit request pending a separate
decision). Pricing Engine remains **not yet LOCKED** -- the full
surface has now been exercised end-to-end from the UI as Decision 069
required before that review, so a TASK-006 LOCK decision is the natural
next step, not yet taken by this decision.

---

# Decision 071

Date: 2026-07-17

Decision: Two real business extensions to `ContractExclusiveDiscount`
(Decision 069): (1) date-scoped discounts -- nullable `start_date`/
`end_date`, NULL on both meaning always active, so a discount can be
configured to apply only within a specific booking window (e.g.
Kandima's 10% only 10 Jan - 15 May); (2) room-type/meal-plan-specific
discounts -- nullable `room_type_id`/`meal_plan_id`, NULL meaning
"applies to all," the same wildcard convention Contract Engine's own
`SpecialOfferRoomDiscount.room_type_id` already established, so a
manager can choose a flat contract-wide % (both NULL), or granular
per-room-type/meal-plan %s, or both coexisting on the same contract at
different specificity. The `unique` constraint on `contract_id` was
dropped -- a contract can now have zero, one, or many
`ContractExclusiveDiscount` rows.

Selection logic: new `find_contract_exclusive_discount(db, contract_id,
room_type_id, meal_plan_id, check_in)` replaces the old single-row
lookup. A row is a candidate only if its non-NULL `room_type_id`/
`meal_plan_id` match exactly and `check_in` falls inside its date
window (if any). Among candidates, most-specific-wins: the row matching
the most of `{room_type_id, meal_plan_id}` is selected; ties (a config
edge case, not expected in practice) prefer a row with an explicit date
window over an always-active one. Same tier-selection discipline as
Decisions 051/053.

`apply_agent_pricing`'s signature gained `room_type_id`, `meal_plan_id`,
`check_in` -- all three already sat in scope at both existing call
sites (`create_booking` and `HotelSearch.tsx`'s `agent-price` request),
so no new lookups were needed anywhere to wire this through.

API reshaped from a single-resource-per-contract pattern to a
collection: `GET`/`POST /pricing-engine/contracts/{id}/exclusive-
discounts` (plural) and `PUT`/`DELETE /pricing-engine/exclusive-
discounts/{discount_id}` (by row id, not contract id). `Contracts.tsx`'s
detail view was rebuilt from a single input+Сохранить/Убрать into a
list of existing discount rows (room type / meal plan / date window /
% / Изменить / Удалить) plus an add/edit form with dropdowns sourced
from the contract's own already-loaded room types and meal plans; the
list view's column now shows a count (`N скидки`) when a contract has
more than one row, or the single percentage when it has exactly one.

Migration: the table already held one real, live row (the project
owner's own manual test via `Contracts.tsx`: Kandima, 10%, no
restrictions) -- preserved during the rebuild as a contract-wide,
always-active row under the new schema, not discarded.

Bug found and fixed during this session's own verification, before any
of this could be called done: the first table rebuild's raw DDL (SQLite
requires a full rebuild to drop a `UNIQUE` constraint, no `ALTER
COLUMN`) omitted `DEFAULT CURRENT_TIMESTAMP` on `created_at`/
`updated_at`, so a fresh `POST` inserted a row with `NULL` timestamps
and crashed FastAPI's response serialization with a 500 --
`ResponseValidationError: Input should be a valid datetime`. Caught
immediately by this decision's own live-API verification pass (not a
theoretical review), fixed with a second rebuild carrying the correct
`DEFAULT (CURRENT_TIMESTAMP)` clause, and the affected row's timestamps
backfilled rather than left `NULL`.

Reason: Both extensions reflect real, confirmed hotel contract terms --
tactical discounts are commonly windowed to specific booking periods,
and a hotel may want to reward Exclusive agents differently by room
category or meal plan rather than a single blanket percentage. Building
this as a flexible, nullable-wildcard schema (rather than two separate
mechanisms, or forcing every row to specify every field) follows the
exact same "flexible core" precedent Contract Engine's own
`SpecialOfferRoomDiscount` already established, avoiding a second,
inconsistent modeling convention for what is fundamentally the same
kind of scoping problem.

Approved By: Daler

Status: Implemented and verified. Isolated: 6 tests covering the
regression baseline (contract-wide, no dates, reproducing the exact
$700.74 figure), date-window in/out of range, exact room+meal match
beating a coexisting wildcard, a different room type falling back to
the wildcard, and a room-only wildcard matching any meal plan -- all
passed. Real end-to-end via actual HTTP API against the live Kandima
contract (carrying the project owner's own real 10% wildcard row): a
Sky Studio+BB-specific 20% override was added alongside it, and a real
booking through the full `create_booking` flow confirmed the specific
row wins ($614.56, exactly $718.20 × 0.80 + $40 markup) while a
different room type correctly fell back to the wildcard ($686.38,
exactly $718.20 × 0.90 + $40). All test rows/bookings removed
afterward; the project owner's original 10% wildcard row and their
`user_id=2` Exclusive-tier status were both confirmed untouched.
`tsc -b` clean across `Contracts.tsx`/`HotelSearch.tsx`. Pricing Engine
remains not yet LOCKED, unchanged from Decision 070's status.

---

# Decision 072

Date: 2026-07-18

Decision: Fixed a real bug in `find_contract_exclusive_discount`'s date
matching (Decision 071): it checked whether the stay's `check_in` date
fell inside the discount's `[start_date, end_date]` window. The correct
rule, confirmed by the project owner with a concrete example (a
10.02-30.03 window, a 08.02-15.02 stay), is whether the stay's date
range **overlaps** the window at all -- a stay that starts before the
window but still spans nights inside it must still get the discount
applied, not be skipped because `check_in` itself falls outside the
window. Changed to a standard half-open interval overlap check:
`check_out > start_date AND check_in < end_date` (NULL on either side
of the window is unbounded on that side). `find_contract_exclusive_discount`
and `apply_agent_pricing` both gained a `check_out` parameter (both
call sites -- `create_booking` and `HotelSearch.tsx`'s `agent-price`
request -- already had it in scope, so no new lookups were needed).

Reason: The previous "check_in only" rule silently denied a real,
configured discount to any booking that merely started before the
window opened, even if most of the stay was inside it -- a direct
under-delivery of a confirmed contract term.

Approved By: Daler

Status: Implemented and verified. 5 isolated cases (the exact reported
overlap case; a stay entirely before the window; entirely after;
entirely within, as a regression; and a stay starting inside and ending
after) all passed. Regression against Decisions 069/071's
$700.74/$614.56/$686.38 figures confirmed unaffected (none of those
scenarios used a date window). **Immediately superseded by Decision
073** below, in the same session, once a further owner-provided example
showed this "whole stay if any overlap" rule was itself still
incomplete -- logged here regardless, as the real, tested, intermediate
state this project actually went through, not silently skipped from the
record.

---

# Decision 073

Date: 2026-07-18

Decision: Corrects Decision 072 -- **supersedes its "any overlap
discounts the whole stay" rule.** The real requirement, confirmed by
the project owner with a precise example (a 10-night stay from
05.02-15.02, discount window starting 13.02: nights 05-12 Feb, 8
nights, must price at the standard rate; nights 13-14 Feb, 2 nights,
must get the exclusive discount; the two segments summed into one
total), is genuine per-night proration, not a whole-stay binary
decision gated by any overlap.

Verified first against Contract Engine's real code (not just the
interface-contract doc's paraphrase): `get_room_price` picks
`season = seasons[0]` (covering `check_in` only) and computes
`base_total = rate.base_price * nights` -- one rate for the whole
stay, no per-night breakdown exposed anywhere in its response. Given
this, `room_net_total / nights` is the most faithful per-night
proration available without new Contract Engine capability -- Pricing
Engine cannot re-derive true nightly rates that Contract Engine itself
doesn't compute, so this is a proration of the one blended total, not a
re-pricing.

New `_count_discounted_nights` (later folded into Decision 074's
`build_nightly_breakdown`) counts how many of the stay's individual
calendar nights fall inside the matched row's window.
`apply_agent_pricing` splits `room_net_total` into a standard segment
and a discounted segment by night-count, applies `discount_percent`
only to the discounted segment, then sums both before adding the
global per-night markup. A row with no date window still covers every
night, so a whole-stay discount remains correct and unchanged for that
case -- this is a behavior change only when a stay partially overlaps a
*dated* window.

Reason: Decision 072's fix, while correcting the direction of the
original bug (under-delivering the discount), still over-delivered it
in the opposite way for any partial-overlap stay -- discounting nights
that were never actually inside the configured window. Per-night
proration is the only rule that matches real hotel-contract billing
practice for a rate that changes mid-stay.

Approved By: Daler

Status: Implemented and verified. Isolated: the exact reported example
(8 standard + 2 discounted nights -> $1080.00 on a $1000/10-night test
stay, hand-verified) and a mirror end-boundary case (5+5 nights ->
$1050.00) both passed. Regression against $700.74/$614.56/$686.38
confirmed unaffected (`discounted_nights == total nights` in all three,
since none had a date window). **Deployment gap found and fixed during
this same session's live-data verification, not a logic bug:** after
implementing this fix, the running backend process was never restarted,
so a real user-reported discrepancy ($236/night shown instead of an
expected figure) traced back entirely to the *old*, pre-073 process
still serving requests -- confirmed by the API response missing the
new `discounted_nights`/`standard_nights` fields entirely. Restarted
and re-traced the exact real scenario (Kandima Sky Studio, real
20.02-20.03 discount window, agent `istiklol90`): a 4-night stay
17.02-21.02 correctly split 3 standard nights + 1 discounted night
(20.02) -> $1020.85, not the $945.40 the stale whole-stay-era code had
produced.

---

# Decision 074

Date: 2026-07-18

Decision: Added a per-night price breakdown, on demand, for
`HotelSearch.tsx`'s search results -- so an agent can see exactly why a
stay's total is what it is when it spans an exclusive-discount date
boundary, rather than only a blended average. New
`build_nightly_breakdown(db, agent_id, contract_id, room_net_total,
nights, room_type_id, meal_plan_id, check_in, check_out)` returns one
entry per calendar night (`date`, `base_rate`, `markup`,
`discount_applied`, `discount_percent`, `discount_amount`,
`final_price`) and is now the **single source of truth** for per-night
pricing -- `apply_agent_pricing` was refactored to derive its aggregate
figures (`discounted_nights`, `exclusive_discount_amount`,
`agent_room_total`, etc.) by summing this same list, rather than
computing the split twice in parallel, so the aggregate total and the
nightly detail can never drift apart.

Verified first whether Contract Engine's existing "one season for the
whole stay" simplification meant a stay spanning a real season boundary
already prices incorrectly, separately from the exclusive-discount
case -- confirmed yes, directly in `get_room_price`'s real code (see
Decision 073). Deliberately scoped this feature to the exclusive-
discount split only: `base_rate` shown per night is the stay's blended
average (honest to what Contract Engine actually computed), not a
fabricated season-aware nightly rate that doesn't exist in the
underlying data. The season-boundary gap remains flagged, separate, and
unfixed -- not silently addressed as a side effect of this feature.

New endpoint `GET /pricing-engine/agent-price/nightly`, deliberately
**separate** from the existing `/agent-price` endpoint rather than
embedding the array in every response -- `HotelSearch.tsx` already
makes one `/agent-price` call per meal-plan-option per room-type per
hotel (an already N+1-heavy search flow), and most agents will never
expand the breakdown, so lazy-loading on demand avoids bloating the
default search payload. `HotelSearch.tsx` gained a "Показать цены по
ночам" toggle under each meal-plan option (only rendered when
`nights > 1`), lazy-fetching this endpoint on first expand, with local
per-option state (`nightlyOpen`/`nightlyData`/`nightlyLoading`/
`nightlyError`, keyed by `mealCode`) scoped inside `RoomTypeCard`,
matching this file's existing per-option state conventions.

Reason: Closes a real transparency gap -- once a stay could legitimately
span a discount boundary (Decision 073), an agent seeing only one
blended average had no way to understand or verify why a search total
came out the way it did.

Approved By: Daler

Status: Implemented and verified. Refactor consistency confirmed by
construction: sum of `build_nightly_breakdown`'s `final_price` entries
for the Decision 073 split example reproduced `apply_agent_pricing`'s
own aggregate exactly ($1080.00 both ways). Live-verified via real HTTP
calls against the real Kandima Sky Studio scenario: the 4-night stay
(17.02-21.02) correctly showed 3 nights at $261.50 and 1 night (20.02)
at $236.35, summing to $1020.85 exactly matching the aggregate; the
3-night stay (17.02-20.02, entirely before the window) correctly showed
all 3 nights undiscounted at $261.50. `tsc -b` clean. No leftover test
data -- only the project owner's own real discount row and Exclusive
status remain in the live database.

---

# Decision 075

Date: 2026-07-18

Decision: Pricing Engine (`app/engines/pricing/`) is now 🔒 LOCKED,
closing its TASK-005/006 review -- same discipline as every other
Engine in this project (Authentication, Hotel, Contract, Booking, AI
Core). Frontend shipped and exercised end-to-end from the UI (Decision
070's stated precondition for this review), and the mechanism has since
been extended and hardened through real, owner-reported issues rather
than only synthetic tests (Decisions 071-074).

TASK-005 review, verified end-to-end today across the full mechanism:

- **Global standard markup** (`PricingSettings`, editable via the
  Контрагенты tab) -- applied per night to every booking's room total,
  confirmed via multiple real bookings (`create_booking`) and the live
  search preview (`HotelSearch.tsx`).
- **Agent categories** (`ExclusiveAgent`, Standard/Exclusive) -- absence
  means Standard by construction; adding/removing via the real
  "Добавить"/"Вернуть в стандартные" UI flow verified live, including
  against the project owner's own real account (`user_id=2`).
- **Per-contract exclusive discounts**, both flat (contract-wide,
  `room_type_id`/`meal_plan_id` NULL) and granular (specific
  room-type/meal-plan combinations) -- verified a specific row
  correctly outranks a coexisting wildcard, and a non-matching room
  type correctly falls back to the wildcard, both via real bookings
  against the live Kandima contract.
- **Date-windowed discounts with correct per-night proration**
  (Decisions 071-074) -- verified a stay partially overlapping a
  window splits into standard and discounted night-segments exactly as
  a real hotel contract would bill it, confirmed against the project
  owner's own live-configured window (20.02-20.03) and a real booking
  spanning it.
- **Discount base confirmed clean**: `apply_agent_pricing`/
  `build_nightly_breakdown` only ever operate on `room_net_total` --
  `transfer_total` and `mandatory_tax_total` (e.g. Kandima's Green Tax)
  are never touched by Pricing Engine at any point, per
  `docs/interface-contracts/pricing-booking.md` Rule 3, unchanged since
  Decision 069 and re-confirmed by inspection of every code path added
  since.

Explicitly NOT covered by this lock, staying exactly as-built (empty
scaffolding): `validators.py`, `workflow.py`, `permissions.py`,
`exceptions.py`, `constants.py`, `config.py`, `utils.py`, `events.py`,
`ai/` -- same reasoning as every other Engine's unbuilt advanced
components, build only once a real, proven need exists.

Known, explicitly accepted limitations carried forward, not fixed by
this lock: (1) the season-boundary gap in Contract Engine's own
`get_room_price` (Decision 073/074) -- a real, separate, pre-existing
issue in a different, already-LOCKED Engine, deliberately out of scope
here; (2) `apply_agent_pricing`/`find_contract_exclusive_discount`
still don't validate `agent_id`/`contract_id` existence, trusting the
caller, same accepted simplification as Decision 069; (3) every
endpoint duplicates JWT-decode logic locally, per Decision 006 -- the
7th Engine repeating this.

Approved By: Daler

Status: `CLAUDE.md`'s Pricing Engine section updated to 🔒 LOCKED.
Future work (e.g. real Anthropic-style provider integration is
irrelevant here, but a genuinely new pricing mechanism, a new agent
tier, or Finance Engine consuming the itemized `agent_markup_amount`/
`agent_exclusive_discount_amount` columns) is a future additive
extension to this now-LOCKED engine, same pattern as every other
LOCKED engine's post-lock extensions in this project -- not a reason
this lock was premature.

---

# Decision 076

Date: 2026-07-18

Decision: Finance Engine's TASK-000/002 scope, confirmed against `01_Modules_List.md` §11 rather than assumed: Invoice, Credit Notes, Agent Statements, plus Decision 009's manually-recorded hotel cashback tracking. Two deliberate exclusions from this build: (1) Payment Engine (Decision 008's online-payment requirement) stays a fully separate, not-yet-started Engine -- the docs themselves list Payments (module 10) and Finance (module 11) as distinct modules, and Payment Engine's real online-payment-processor integration is a significantly larger, separate undertaking deserving its own dedicated design pass, not folded in. (2) Voucher and Supplier Payments (2 of §11's 5 listed items) are deferred, not built -- the project owner's explicit scoping for this build named only Invoice/Credit Notes/Agent Statements, same "build only once proven" precedent as every other Engine's unbuilt pieces.

Reason: `01_Modules_List.md` lists 5 items under Finance; the project owner's TASK-002 scoping instruction named 3 of them plus Decision 009's cashback mechanism. Logging the gap explicitly (rather than silently either including or excluding Voucher/Supplier Payments) so a future session doesn't mistake the omission for an oversight.

Approved By: Daler

Status: TASK-002 domain model built on this scope -- see Decision 077.

---

# Decision 077

Date: 2026-07-18

Decision: Finance Engine's domain model is 6 tables: `Invoice`, `CreditNote`, `AgentStatement`, `AgentStatementLine`, `HotelCashbackArrangement`, `HotelCashbackFulfillment`. `Invoice`'s field set combines `03_Domain_Model.md` #40's list (subtotal/tax/discount/total) with `02_Logic_Rules.md` #53's list (Agent/Hotel/Commission) -- the two docs don't fully overlap, neither is treated as more authoritative than the other. `CreditNote`/`AgentStatement`/`AgentStatementLine` are not documented in either doc at all (module-list names only) and were designed fresh from standard DMC/travel-finance conventions. Invoice generation is a manual, Finance-side action (`create_invoice_for_booking`) rather than automatic on a Booking status change, specifically so LOCKED Booking Engine's `service.py` never needs modification for this Engine to exist.

`service.compute_booking_financials` is the single source of truth for Net/Sale/Profit, derived purely from `Booking`'s own frozen columns (`total_amount`, `agent_markup_amount`, `agent_exclusive_discount_amount`, `transfer_total`, `mandatory_tax_total`) -- no re-pricing, no calls into Contract/Pricing Engine. `total = subtotal - discount + commission + tax` reconciles exactly to `Booking.total_amount + transfer_total + mandatory_tax_total` by construction, verified against a real Kandima booking created through the actual `booking_service.create_booking` flow (not hand-set fields): agent `istiklol90@gmail.com` (real Exclusive-tier agent), a real 10%-off `ContractExclusiveDiscount` window, producing `total=1609.05` end to end, matching exactly. `agent_markup_amount`/`agent_exclusive_discount_amount` being `NULL` together (any booking predating Decision 069) is carried through as `profit=None` ("not computed"), never silently defaulted to `0` ("a real zero-margin sale") -- verified against a real pre-069 booking.

Real, not hypothetical, finding surfaced while building this: `Reservations.tsx`'s existing inline Net/Sale/Profit display (`frontend/src/pages/Reservations.tsx` ~line 1626) still shows `Net == Sale` and a hardcoded Profit placeholder with a stale Decision-009 tooltip -- it predates Decision 069's Pricing Engine integration and was never updated. Flagged, not fixed, by this Engine (explicitly out of scope per the project owner) -- `compute_booking_financials` is the correct replacement whenever that frontend fix happens.

Also real, not a bug: a booking's `profit` can be genuinely negative when an Exclusive-tier discount exceeds the flat per-night markup (verified on the same real test booking: -$45.45, discount $75.45 > markup $30). Finance Engine surfaces this accurately rather than hiding it.

Reason: Grounding the model in what the docs actually specify (where they specify anything) rather than inventing fields, and building the one genuinely new calculation this Engine needs on top of already-verified Pricing Engine output rather than re-deriving pricing logic.

Approved By: Daler

Status: TASK-002/003 (models, repository, service, schemas, api) built and verified via real HTTP calls against a real Kandima booking -- see Decision 078 for the LOCK.

---

# Decision 078

Date: 2026-07-19

Decision: Finance Engine LOCKED. `models.py` (6 tables), `repository.py` (thin CRUD), `service.py` (`compute_booking_financials` plus Invoice/CreditNote/AgentStatement/HotelCashbackArrangement/HotelCashbackFulfillment orchestration), `schemas.py`, and `api.py` (15 authenticated REST endpoints under `/finance-engine`, admin-gated -- no distinct "Finance" role exists in Authentication Engine yet) are built and verified end-to-end via real HTTP calls against a real Kandima booking created through the actual Booking Engine flow, including invoice generation, credit note creation, agent statement generation/finalization, and cashback arrangement/fulfillment recording. `validators.py` was populated (unlike Pricing Engine's, which stayed empty) because reviewing this Engine's own `service.py` surfaced two real, not speculative, correctness gaps: `create_credit_note` had no check against an invoice's remaining creditable balance (multiple credit notes could sum past the invoice total), and `generate_agent_statement` had no check for an existing statement with an overlapping period for the same agent/currency (silent double-counting of the same bookings across two statements). Both fixed and verified against real data before lock. `workflow.py` stays empty scaffolding -- no Engine in this project has ever populated it, including AI Core Engine's genuine 12-step ingestion state machine, which lives in its own `service.py` instead.

Test artifacts from verification (bookings 5 and 6, both Kandima/Sky Studio/exclusive-agent) were properly cancelled through the real `booking_service.cancel_booking`/`POST /booking-engine/bookings/{id}/cancel` path, not deleted directly -- confirmed via a real allotments-table before/after query that room type 3 (Sky Studio) has no per-day allotment rows configured for March 2027 at all, so under Decision 044's permissive mode neither booking ever held tracked inventory to begin with. Their generated Invoice/CreditNote/AgentStatement rows were confirmed to hold no live resource of their own (no allotment/inventory calls anywhere in this Engine) and were deliberately left in place as real reference examples, per the project owner's explicit choice.

Known, explicitly accepted limitations carried forward, not fixed by this lock: (1) Voucher and Supplier Payments (`01_Modules_List.md` §11) remain unbuilt, per Decision 076's explicit scoping; (2) Payment Engine (Decision 008) remains fully separate and not started; (3) `Reservations.tsx`'s stale Net/Sale/Profit calculation (Decision 077) is flagged, not fixed, by this Engine; (4) every endpoint duplicates JWT-decode logic locally, per Decision 006 -- the 8th Engine repeating this; (5) `create_invoice_for_booking`/`create_cashback_arrangement`/etc. don't validate that the calling admin has any particular relationship to the hotel/agent/booking beyond being an admin -- no finer-grained permission model exists yet, same simplification every other Engine's admin-gated surface already makes.

Approved By: Daler

Status: `CLAUDE.md`'s Finance Engine section added, status 🔒 LOCKED. Future work (Voucher, Supplier Payments, a real Finance role distinct from Admin, or consuming these itemized figures from a future Reporting/Dashboard surface) is a future additive extension to this now-LOCKED engine, same pattern as every other LOCKED engine's post-lock extensions in this project -- not a reason this lock was premature.

---

# Decision 079

Date: 2026-07-20

Decision: `Invoice.status`'s meaning changed, post-lock, on already-LOCKED Finance Engine (Decision 078). Project owner defined a 4-stage plan for a real accounting-review workflow: (1) the existing manual "Создать счёт" button now creates an invoice in `"Draft"` status instead of `"Issued"` -- no automatic trigger, no change to LOCKED Booking Engine, per the owner's explicit choice to keep this a fast mechanical button-click rather than risk modifying a locked financial engine's core booking-creation path; (2) PDF generation (deferred -- owner still needs to supply real company bank details and a logo before this can use real data, not placeholder values); (3) agent-side invoice visibility in `AgentDashboard_v2.tsx`, gated on `Issued` status only; (4) a new `approve_and_send_invoice` action ("Одобрить и отправить") that atomically generates the PDF, emails it to the agent, and flips `Draft -> Issued` (making it agent-visible) -- all three together, never as separate steps. Only stage 1 is implemented by this decision; stages 2-4 are designed but not built.

No schema change was needed -- `Draft`/`Issued`/`Void` already existed as the column's intended value set (Decision 077/078's own docstrings), just with `Draft` previously treated as "effectively unreachable" since `create_invoice_for_booking` always wrote `Issued` directly. `Draft` now means "created, awaiting accounting review, not agent-visible, no PDF/email side effects"; `Issued` now means "reviewed, approved, PDF'd, emailed, agent-visible" (set only by the not-yet-built stage 4 action). `create_credit_note`'s existing requirement that a credit note's target invoice be `Issued` (`validators.validate_invoice_issued`) needed no change -- under the new semantics this is more correct than before, since it's now impossible to credit-note an invoice the agent hasn't even seen yet. `void_invoice` also needed no change -- it was already unrestricted by source status (only blocks re-voiding an already-`Void` invoice), so `Draft -> Void` already worked, letting accounting kill a wrongly-created draft before it's ever reviewed.

Two real gaps found by grepping every `"Issued"` check in the codebase before making this change, both fixed as part of this same decision, not scope creep: (1) `Reservations.tsx`'s `BookingDetail` component -- where this session's own earlier UI work added the invoice button/badge -- is rendered inside **both** `AdminPanel.tsx` and `AgentDashboard_v2.tsx` (agent-facing), and the button/badge had no permission gate at all. As shipped (uncommitted at the time this was caught), an agent viewing their own booking would already see the "Создать счёт" button and any invoice badge, regardless of Draft/Issued -- a direct violation of "must not be visible to the agent" that predated this decision's status-semantics change but was only surfaced by reviewing this change's blast radius. Fixed with a new `Permissions.canManageInvoices` flag (`true` in `AdminPanel.tsx`, `false` in `AgentDashboard_v2.tsx`), gating both the fetch-on-mount `useEffect` and the rendered button/badge -- an agent's view now fires zero invoice-related requests and renders nothing invoice-related, not even a disabled control. (2) `Finance.tsx`'s admin invoice table gated its Void button on `status === "Issued"`, so a Draft invoice -- now a real, common state -- would show no Void action at all, contradicting the backend's own allowed transition. Widened to `status !== "Void"`.

Reason: Real accounting review must happen before an agent sees a charge or the company sends a PDF/email, per the project owner's explicit workflow requirement -- an auto-created-and-immediately-issued invoice (the pre-Decision-079 behavior) skipped this entirely.

Approved By: Daler

Status: Stage 1 implemented and verified (models.py/service.py docstrings updated to reflect the new status semantics; `Reservations.tsx`/`AdminPanel.tsx`/`AgentDashboard_v2.tsx`/`Finance.tsx` updated). Stages 2-4 (PDF generation, agent-side visibility, `approve_and_send_invoice`) remain future work, blocked on the project owner supplying real bank/logo assets for stage 2.

---

# Decision 080

Date: 2026-07-20

Decision: Claiming a booking ("Взять в работу") now auto-creates its Draft invoice as part of the same click, via **frontend orchestration only** -- `Reservations.tsx`'s `handleClaimSubmit` calls the existing `POST /booking-engine/bookings/{id}/claim` first (unchanged), and on success immediately fires a second, best-effort request to the existing `POST /finance-engine/bookings/{id}/invoice` (unchanged, still produces `Draft` per Decision 079). Neither backend endpoint was modified -- this is a pure client-side change to what one click triggers, deliberately preserving Decision 079's reasoning for keeping invoice creation off LOCKED Booking Engine's own code path.

If the second call fails (most likely because an invoice already exists via the standalone fallback button), the claim itself is never affected -- it already succeeded by that point. The failure surfaces as a non-blocking error via the existing `invoiceError` state/banner, explicitly pointing at the fallback button as the recovery action. The standalone "Создать счёт" button is deliberately **kept**, not removed (a real, close-together contradiction in the project owner's own instructions during this session -- first "keep as fallback," then "remove entirely" in the next message -- resolved by re-confirming with the owner rather than silently picking one): removing it would leave the non-blocking error message with no actual recovery action to point to, a dead end. No logic change was needed to keep it working as a fallback -- its existing gate (`!invoice`) already naturally hides it the instant either path (claim-triggered or manual) sets `invoice`.

Reason: Project owner wants one click on "Взять в работу" to produce both outcomes (claim + Draft invoice) with no separate manual step, while explicitly wanting to avoid the risk of modifying a LOCKED financial engine's core booking-claim path.

Approved By: Daler

Status: Implemented and verified live -- claiming a fresh booking produces a Draft invoice with zero additional clicks, confirmed via real HTTP end-to-end and visible in the Финансы tab's invoice list.

---

# Decision 081

Date: 2026-07-20

Decision: Stage B -- a single "Одобрить и отправить" action/button that atomically flips a Draft invoice to Issued and emails the agent a plain-text summary (`POST /finance-engine/invoices/{invoice_id}/approve-and-send`). New `service.approve_and_send_invoice`: validates the invoice is `Draft` (new `validators.validate_invoice_draft`), resolves the agent's real `User`/email (hard `ValueError` if missing -- the one function in this Engine that validates agent existence, since sending is meaningless without a real destination, unlike every other function here which trusts `agent_id` per Decision 078's accepted simplification), resolves `booking_number`/`hotel_name` for the email body (new read-only `app.engines.hotel.service` import, same cross-engine pattern as `app.engines.booking.service`), calls new `email_service.send_invoice_email` (plain-text, reuses `send_booking_confirmation_email`'s exact `_render_text_table` pattern, deliberately mentions no bank details or PDF attachment -- both are Stage C, not built yet, and this email must never imply something that doesn't exist), then flips `status="Issued"`.

New nullable `Invoice.email_sent_at` column (added to the existing SQLite table via a plain `ALTER TABLE ... ADD COLUMN`, no rebuild needed since it's nullable) records when `send_real_email` genuinely returned `True`. The status flip happens **regardless** of the email result, matching every other email call site already in this project (`send_booking_confirmation_email`, registration emails) where email is always best-effort and never blocks the real action -- `email_sent_at` stays `NULL` whenever it falls back to console-log-only, which is every real invoice today, since no SMTP is configured anywhere in this project (`backend/.env` doesn't exist). This NULL is a real, visible, honest signal, not a silent failure: `Finance.tsx`'s invoice table now shows a dedicated "Email" column, "не отправлено" in muted gray when `email_sent_at` is null, the real timestamp otherwise -- verified live.

Reason: Accounting needs one explicit, combined action to approve and notify, per the project owner's workflow requirement -- and the email's honesty about today's real SMTP-less state (both in what it says and in what the UI shows) matters more than looking superficially "done."

Approved By: Daler

Status: Implemented and verified live end-to-end -- approved a real Draft invoice, confirmed `status: "Issued"`, confirmed `email_sent_at: null` (matching this project's actual current SMTP-less state, not a bug), confirmed the console received the plain-text email content via `send_real_email`'s existing fallback, and confirmed the Финансы table renders "не отправлено" for that row.

---

# Decision 082

Date: 2026-07-20

Decision: Fixed a real, separate, pre-existing bug found while planning Finance Engine's Requirement 2 (stale-invoice flagging): `change_booking_dates` (LOCKED Booking Engine, Decision 029) wrote Contract Engine's raw net price (`price["final_total"]`) directly into `total_amount`, never calling Pricing Engine's `apply_agent_pricing` at all. This predates Decision 069 (Pricing Engine didn't exist when `change_booking_dates` was built) and was never updated when Decision 069 added markup to `create_booking` -- meaning every date change on every booking with agent markup/exclusive-discount silently stripped both, reverting `total_amount` to pure net cost, while `agent_markup_amount`/`agent_exclusive_discount_amount` stayed frozen at their original (now-orphaned, inconsistent) values. A real, active financial-accuracy bug, independent of anything Finance Engine is building -- `total_amount` is what the agent is actually charged.

Fix: after Contract Engine's re-price (`get_room_price`) and `new_nights` are computed, `change_booking_dates` now also calls `pricing_service.apply_agent_pricing(db, booking.agent_id, new_contract.id, price["final_total"], new_nights, booking.room_type_id, price["meal_plan_id"], data.new_arrival_date, data.new_departure_date)` -- same call shape `create_booking` already uses, deliberately against `new_contract.id` (not the old one), since a date change can land in a different contract/season and `ContractExclusiveDiscount` rows are contract-specific. `total_amount`/`agent_markup_amount`/`agent_exclusive_discount_amount` are now all written from this call's result, not from Contract Engine's raw output. `pricing_service` was already imported at the top of `booking/service.py` (Decision 069) -- no new import needed. Same additive-extension pattern as every other LOCKED-engine follow-on in this project; no Pricing Engine code changed.

Reason: `Booking.total_amount` is the actual agent-facing charge, not an internal accounting figure -- silently dropping markup/discount on any date change is a direct, active correctness bug the project owner chose to fix immediately rather than defer, independent of today's Finance Engine work.

Approved By: Daler

Status: Implemented and verified with 3 isolated tests plus full regression against every previously-verified Pricing Engine figure, all real HTTP against real data, all test artifacts cleaned up afterward (confirmed byte-identical `contract_exclusive_discounts`/`exclusive_agents`/`pricing_settings` rows before and after):

- **Isolated 1 (baseline):** Kandima Sky Studio, 2027-03-01 to 2027-03-04, real Exclusive agent + real 10% window discount -> `total_amount: 709.05`, `agent_markup_amount: 30.0`, `agent_exclusive_discount_amount: 75.45`.
- **Isolated 2 (date change, still inside window):** same booking, dates changed to 2027-03-10 to 2027-03-13 (same season/rate) -> identical `709.05`/`30.0`/`75.45`, freshly recalculated for the new dates, not a stale carry-over (same underlying rate for both ranges, confirmed by inspection).
- **Isolated 3 (date change, moved outside window):** same booking, dates changed to 2027-04-01 to 2027-04-04 -> `total_amount: 784.5` (net $754.5 + markup $30, no discount), `agent_markup_amount: 30.0`, `agent_exclusive_discount_amount: 0.0` -- proves genuine date-sensitivity, discount correctly disappears while markup persists.
- **Regression, per-night proration (Decisions 073/074, using the real, untouched persisting discount row):** 2027-02-17 to 2027-02-21 (4 nights, 3 standard + 1 discounted) -> `total_amount: 1020.85`, exact match; nightly breakdown confirmed 3 nights at `$261.50` and the discounted night (2027-02-20) at `$236.35`, byte-identical to Decision 074's documented result. 2027-02-17 to 2027-02-20 (3 nights, entirely before the window) -> `total_amount: 784.5` = `$261.50 x 3`, `agent_exclusive_discount_amount: 0.0`, matching the documented "all undiscounted" case.
- **Regression, Decision 070's $700.74 (temporary 8% flat discount, June window, no real row touched):** Kandima Sky Studio, 2027-06-01 to 2027-06-05, raw Contract Engine net confirmed `$718.20` first -> `total_amount: 700.744`, exact match.
- **Regression, Decision 071's $614.56/$686.38 (temporary 10% wildcard + 20% Sky-Studio-specific override, June window):** specific row matching Sky Studio+BB -> `total_amount: 614.56`, exact match; same booking after retargeting the specific row to a different room type (falls back to the 10% wildcard) -> `total_amount: 686.38`, exact match.

All temporary discount rows and test bookings removed after use; the two real, permanent `ContractExclusiveDiscount` rows (Kandima's Sky-Studio/BB Feb-Mar window, and a second hotel's contract-8 row) and `user_id=2`'s real Exclusive-tier status confirmed byte-identical before and after (same row ids, same timestamps).

---

# Decision 083

Date: 2026-07-20

Decision: Requirements 1 and 2 from live project-owner review, built on top of Decision 082's now-correct `change_booking_dates`.

**Requirement 1 -- invoice detail modal.** New "Подробнее" button per invoice row in `Finance.tsx`, opening `InvoiceDetailModal` (frontend-only, no new backend calculation): fetches the booking (`GET /booking-engine/bookings/{id}`), room type name (`GET /hotel-engine/room-types/{id}`), meal plan label (`GET /contract-engine/contracts/{id}/meal-plans`, filtered), and the exact same three Contract Engine breakdown calls `Reservations.tsx`'s `BookingDetail` already makes (`get_room_price`/`get_transfer_price`/`get_mandatory_tax`) for the booking's *current* fields. Shows two panels: "Зафиксировано в счёте" (the invoice's own frozen `subtotal`/`discount`/`commission`/`tax`/`total`) and "Текущее состояние брони" (the live breakdown).

**Real bug caught during this same session's own verification, fixed before being shown as done:** the live-total comparison initially used `roomBreakdown.final_total` (Contract Engine's raw net, pre-Pricing-Engine) against `invoice.total` (the agent-facing, post-markup/discount price) -- these can never match for any invoice with real markup/discount, which would have shown a false "stale" warning on essentially every invoice, all the time, defeating the entire point of the indicator. Fixed to use `booking.total_amount` (already the current agent-facing price, kept fresh by Decision 082) for the comparison instead -- verified both directions: a freshly-invoiced, unchanged booking now correctly shows **no** mismatch (`709.05 + 828 + 72 = 1609.05`, exact match), and the same booking after a real date change correctly **does** show one (`784.5 + 828 + 72 = 1684.5` vs. the invoice's frozen `1609.05`, a real $75.45 gap -- exactly the lost discount). `roomBreakdown.base_total`/`supplements_total` are still shown as informational line items (labeled "нетто"), alongside the booking's current `agent_markup_amount`/`agent_exclusive_discount_amount`, so the current-state panel is a fair line-by-line match against the invoice panel, not just a lone total.

**Requirement 2 -- staleness review flag.** New nullable `Invoice.review_flag` (String(500)) -- NULL means clean, non-NULL carries both the "needs review" signal and the human-readable reason in one field, added to the existing SQLite table via a plain `ALTER TABLE ADD COLUMN`. New `service.flag_invoice_for_review(db, booking_id, reason)`, silently no-op (`None`) if no invoice exists for the booking or it's not `Draft` (an already-`Issued` invoice's staleness is a Credit Note's job, not this flag's) -- new endpoint `POST /finance-engine/bookings/{booking_id}/flag-for-review`, deliberately no fixed `response_model` since it returns either `204` (no-op) or the flagged `InvoiceResponse`.

**Trigger is frontend orchestration, same shape as Decision 080's claim-auto-invoice, for the same reason:** `Reservations.tsx`'s `handleChangeDatesSubmit` fires a best-effort second call to this endpoint after `change-dates` already succeeded, capturing the old dates before they're overwritten by `onBookingUpdated`. Calling Booking Engine's `change_booking_dates` into Finance Engine directly at the backend would create a genuine circular import (Finance already imports `booking_service` at module level) -- not just a style preference this time, an actual blocking technical constraint.

**At approval:** `approve_and_send_invoice` stays unblocked server-side by design (a flag accounting already reviewed and confirmed fine shouldn't get stuck with no recovery path) -- verified directly: approving a flagged Draft succeeded, and `review_flag` persists unchanged afterward (never auto-cleared, consistent with "the invoice's history is its own record"). `Finance.tsx`'s "Одобрить и отправить" click now shows an explicit extra confirmation with the flag's exact reason when one is set, forcing acknowledgment at the decision point without a hard backend gate. The invoice table also shows a ⚠ icon (hover for the reason) next to a flagged row's number.

Reason: Accounting had no way to verify an invoice's numbers before approving beyond the bare total (Requirement 1), and no warning at all if a booking changed after its Draft invoice was created (Requirement 2) -- both real, project-owner-identified gaps found through actual live use, not speculative hardening.

Approved By: Daler

Status: Implemented and verified end-to-end via real HTTP (all endpoints, real UTF-8 payload confirmed byte-correct after an initial curl/bash encoding artifact was ruled out as a false alarm, not a real bug) plus `tsc -b` clean and Vite live-transform confirmed for all touched files. No-op cases verified for both "no invoice exists" and "invoice already Issued." All test bookings/invoices cancelled/left as real examples per this session's established cleanup discipline.

---

# Decision 084

Date: 2026-07-20

Decision: `Booking.cancelled_by` -- an additive extension to LOCKED Booking Engine, same discipline as Decision 082. Traced the full audit trail via live project-owner review (not from memory): `cancellation_reason`/`cancelled_at`/`cancellation_fee` were always captured, but WHO clicked cancel was never recorded anywhere, confirmed by reading `repository.cancel_booking` directly. New nullable `Integer` column (plain, no ForeignKey, same convention as `claimed_by`/`created_by`), added via a plain SQLite `ALTER TABLE ADD COLUMN`. `service.cancel_booking`/`repository.cancel_booking` both gained a `cancelled_by` parameter; `api.py`'s cancel endpoint passes `current_user.id` through, mirroring how `claim_booking` already resolves the acting user.

Also fixed, same investigation: `Reservations.tsx`'s "В работе: X" (who claimed it) display was gated on `booking.status === "Pending"`, hiding it from view (though never from the database) the moment a booking left Pending -- e.g. got cancelled. The fact "X claimed this at time Y" is permanently true regardless of what happened after, so the gate was dropped for that specific display block. A second, similarly-gated block (the LPO hotel-correspondence panel) was deliberately left untouched -- that one is a genuinely Pending-only *active workflow tool*, not a passive historical fact, and conflating the two would have been wrong.

Reason: Real business disputes/reviews need to trace "who cancelled this and when" even after a booking is long closed -- a genuine, previously-unrecorded audit gap, not a hypothetical one.

Approved By: Daler

Status: Implemented, migration applied, `tsc -b` clean. Verified as part of Decision 085's combined full-lifecycle trace below.

---

# Decision 085

Date: 2026-07-20

Decision: Finance Engine audit-trail completeness plus two refinements to the live "Требует внимания" urgent-styling mechanism (Decision 083), found via the same live project-owner review as Decision 084.

**Audit trail:** `Invoice` gained `approved_by`/`approved_at` (set unconditionally by `approve_and_send_invoice`, regardless of flag/email state) and `voided_by`/`voided_at` (set unconditionally by `void_invoice`) -- previously only `created_by`/`created_at` existed; who took the approve or void action was never captured at all. Both API endpoints now pass `current_user.id` through. `InvoiceDetailModal` gained a "Создано/Одобрено/Аннулировано" block showing each actor and timestamp, resolved via a `userNames` lookup (the existing agent-name map, renamed from `agentNames` to `userNames` since it's genuinely a full `/users` directory, now used for admin ids too, not just agents).

**"Требует внимания" acknowledgment fix:** a real, live-reported bug -- two already-cancelled/voided test bookings kept showing the badge, red row, and sort-to-top treatment indefinitely, since neither `void_invoice` nor `approve_and_send_invoice` had ever touched `review_flag` or its urgency, and voiding wasn't excluded from the "urgent" condition at all. New nullable `Invoice.flag_acknowledged_at`, set only by `approve_and_send_invoice` when `review_flag` was already populated -- the "this was reviewed and approved anyway" signal, deliberately distinct from `approved_at` (unconditional) and from `review_flag`'s own text (never touched, permanent history regardless of status). New shared frontend helper `isUrgentFlag(inv) = review_flag && !flag_acknowledged_at && status !== "Void"`, used identically for sorting, row styling, and the badge -- combining both exit conditions (Void, acknowledged-via-approval) in one place instead of two patches that could drift apart. `InvoiceDetailModal` never hides `review_flag`'s text regardless of urgency -- only the styling switches, from an urgent coral banner to a calm historical note (with the acknowledgment date, when one exists).

**"Void" vs. "Cancelled" terminology:** kept as distinct technical terms, not unified -- an invoice can be voided for reasons unrelated to the booking (e.g. correcting a data-entry mistake on an otherwise-valid booking), so merging the words would misrepresent that common case. Instead, the displayed label for Invoice's `Void` status specifically (leaving `Draft`/`Issued`/the Cashback statuses untouched) now reads "Аннулирован" in the list, and in the detail modal (where the booking is already fetched at zero extra cost) gains a contextual qualifier -- "Аннулирован (бронь отменена)" / "(бронь отклонена отелем)" -- only when the linked booking is genuinely terminal too.

Reason: A flagged-but-dead-or-resolved invoice permanently squatting at the top of the list defeats the entire purpose of the triage feature Decision 083 built; and real business review needs to know who took every action, not just what happened and when the booking-side actor was concerned -- both real, live-discovered gaps, not speculative hardening.

Approved By: Daler

Status: Implemented, `tsc -b` clean, all migrations applied. Verified via a full real lifecycle trace (create -> claim -> invoice -> flag -> cancel) confirming every actor/timestamp stays visible in the detail views -- see the verification results in this session's own record for the exact real data confirmed.

---

# Decision 086

Date: 2026-07-20

Decision: Real, downloadable `.xlsx` export of one agent's invoices over one date range -- "give me agent X's full 2025 balance." Checked before picking a library: nothing generates any document format anywhere in this project (`requirements.txt`, `package.json`, and a full-repo grep for `xlsx`/`openpyxl`/`exceljs`/`SheetJS` all came back empty; `pdfplumber` only *reads* PDFs for AI Core Engine's contract ingestion). Chose `openpyxl` (pure Python, MIT-licensed, no compiled dependency), generated backend-side rather than as a new frontend library, since the date-range+agent query needed to exist server-side regardless (today's `list_invoices_by_agent` had no date filter at all).

New `repository.list_invoices_by_agent_in_range(db, agent_id, start_date, end_date)` filters on `issue_date` (an accounting-period export, not a travel calendar -- deliberately not `arrival_date`). New `service.build_agent_invoice_export` resolves each invoice's `booking_number`/hotel name/dates via the already-imported `booking_service`/`hotel_service` (same read-only cross-engine pattern this Engine already uses), builds a real workbook (bold header row, auto-sized columns), returns raw bytes. New endpoint `GET /finance-engine/agents/{agent_id}/invoices/export?start_date=...&end_date=...`, no fixed `response_model`, returns a `Response` with the real spreadsheet MIME type and a `Content-Disposition: attachment` header. Frontend: an agent-picker + date-range panel in `Finance.tsx`'s Invoices subtab (agent list reuses the already-fetched `/users` data, filtered to `role === "agent"`), with a raw `fetch().blob()` download handler -- deliberately not `fetchJson`, which assumes a JSON response.

**Deliberately NOT the same mechanism as `AgentStatement`** (Decision 077/078), which already does "agent + date range" but aggregates bookings into locked net/sale/profit rollups and has never had any frontend built for it. This export's requested columns (booking number, hotel, dates, invoice number, issue date, amount, currency, status) are invoice-shaped, not that rollup shape -- flagged explicitly so two similarly-scoped "agent + period" mechanisms existing in this Engine isn't mistaken for an oversight later.

**Explicit deferral, logged so it isn't forgotten:** no paid/unpaid status or running-balance-owed tracking in this export. This is a clean statement of "here's what was invoiced in this period," not a payment reconciliation -- genuinely blocked on Payment Engine (not yet started, per Decision 008), which doesn't exist to have any real payment data to reference. Revisit only once Payment Engine exists.

Reason: Real accounting/audit use needs a document that leaves the app, not just an on-screen list -- and a specific agent-and-period cut, not just "whatever's currently visible" (the CSV export's scope).

Approved By: Daler

Status: Implemented, `openpyxl==3.1.5` added to `requirements.txt` and installed in the committed `.venv`, `tsc -b` clean. Verified live: downloaded a real export for `istiklol90` covering `2026-07-18`-`2026-07-19`, confirmed the file opens as a genuinely valid `.xlsx` (`openpyxl.load_workbook`, 17 rows including header, bold header row, auto-sized columns), and cross-checked the first row byte-for-byte against direct API lookups of both the invoice and its booking -- exact match.

---

# Decision 087

Date: 2026-07-20

Decision: Major navigation/scale restructure of the Финансы feature, based on realistic future volume (100 agents x 100 bookings = 10,000+ rows) -- the flat "Финансы" tab with everything crammed into subtabs (built through Decisions 078-086) doesn't hold up at that scale. Replaced with three separate top-level `AdminPanel` tabs -- "Счета" (`Invoices.tsx`), "Баланс" (`Balance.tsx`), "Кэшбэк" (`Cashback.tsx`, promoted to its own tab for consistency even though hotel count doesn't have the same scale problem agent count does, per explicit project-owner confirmation) -- with room left for future items (Входящие/Исходящие платежи, once Payment Engine exists).

**Real gaps found in already-shipped code while planning this, not just future risk:** `GET /users` returned every user unconditionally, no search/filter/limit at all -- both the just-built `.xlsx`-export agent dropdown and every `userNames`-based name resolution (list columns, `InvoiceDetailModal`'s audit lines) already depended on fetching everyone. No single-user-lookup endpoint existed either, so even resolving 1-3 specific actor names in the detail modal went through the same full-list fetch. Both fixed as part of this restructure, not left as-is:
- `GET /users` gained optional `search` (case-insensitive partial name match), `role` (case-insensitive exact match), and `limit` params -- all additive, omitting them preserves the original full-list behavior every existing caller (AdminPanel's own user-management table, `Reservations.tsx`'s agent-name resolution) already relies on.
- New `GET /users/{user_id}` -- single lookup, for `InvoiceDetailModal`'s at-most-3 actor-name resolutions, replacing its old `userNames` prop entirely.
- `GET /finance-engine/agents/{agent_id}/invoices` gained optional `start_date`/`end_date` -- omitted falls back to the original unbounded per-agent list ("Счета"); both given reuses the already-built `list_invoices_by_agent_in_range` ("Баланс"), so the on-screen summary and the `.xlsx` export can never disagree about what "this agent, this period" means.
- New `GET /finance-engine/invoices/urgent` (declared before `/invoices/{invoice_id}` in `api.py` -- same route-ordering class of bug as the documented `/agent-registrations/stats` issue) -- the one "list many invoices unscoped by agent" query kept safe at real scale, by construction: `review_flag IS NOT NULL AND flag_acknowledged_at IS NULL AND status != 'Void'` should be a small set, not proportional to total invoice count. This resolves the real tension between "never load everyone" and "triage needs to see what's urgent without already knowing which agent to search for" -- a small, always-visible panel at the top of "Счета", populated by this bounded query, shown before any agent search.

**New shared frontend module `financeShared.tsx`** (a deliberate departure from this codebase's usual per-page-self-contained convention, justified because `Invoices.tsx`/`Balance.tsx`/`Cashback.tsx` are facets of one restructured feature built together, not unrelated pages) holds `InvoiceDetailModal`, `isUrgentFlag`, `voidLabel`, `StatusBadge`, the `Invoice`/`AgentOption` types, and the new `AgentSearchSelect` component -- a debounced (300ms, minimum 2 characters) autocomplete against the new `/users` search params, never loading the full agent list, used identically by both "Счета" and "Баланс". Old `Finance.tsx` fully deleted (not left as unreferenced dead code) once nothing imported it anymore.

Reason: A flat list that loads or requires loading "everyone" (agents, invoices) is a correctness and performance trap at any real scale beyond this project's current 1-2 real hotels/agents -- catching and fixing it now, while the fix is small, is cheaper than after real volume makes it a production incident.

Approved By: Daler

Status: Implemented, `tsc -b` clean project-wide (only the same 9 pre-existing, unrelated errors in `App.tsx`/`Header.tsx`/`AgentDashboard.tsx`/`router.tsx` remain, confirmed via `git status` untouched by this work). Verified live via real HTTP: the urgent endpoint returns exactly the one genuinely-flagged test invoice and nothing else; agent search for "ist" returns exactly `istiklol90`; the new scoped per-agent endpoint's result count (17) matches a manual filter of the full invoice list by `agent_id` (17) exactly, confirming the restructure doesn't silently change what data is shown, only how it's fetched.

---

# Decision 088

Date: 2026-07-20

Decision: AdminPanel's navigation was restructured twice in direct succession based on live feedback. First attempt: a two-level left sidebar (parent groups with expandable children), matching the project owner's initial framing of "won't scale past a flat 9-item bar toward 20-30+ features." Immediately corrected after live review: a permanent left sidebar reduces usable working width, which the project owner considers a worse tradeoff than the scale problem it solves. Final shape: navigation stays a single horizontal top bar; grouped items ("Контракты"/"Контракты — ИИ" under one "Контракты" parent, "Счета"/"Баланс"/"Кэшбэк" under one "Финансы" parent) open a click-triggered dropdown panel instead of a permanent submenu, closing on outside click or on selection. The underlying data structure survived the correction unchanged -- `NAV_STRUCTURE: NavItem[]` (`{key, label, children?}[]`) in the new `frontend/src/pages/AdminNav.tsx`, the single source of truth adding a future group (e.g. Payment Engine) is a data change, not new JSX in `AdminPanel.tsx`. Parent items are pure triggers, never content; only leaf keys are valid `AdminTab` values.

Separately, the same review found the page's top chrome had real dead weight for a screen used for daily work, not first-time orientation: the global `Header` component (from `App.tsx`, shared across every page) contributes a "DMC OS" logo + "Home" link that add nothing once inside Admin Panel, plus `AdminPanel`'s own `<h1>Admin Panel</h1>` / "Управление системой" subtitle -- none of it functional. `App.tsx` now conditionally skips rendering `Header` specifically when `page === "admin-panel"` (every other page keeps it unchanged). `AdminPanel.tsx` drops the title block entirely and gets a compact "Выход" (log out) button inline in the same row as the nav bar, right-aligned, sharing one border-bottom divider -- closing a real, separate gap found in the process: there was no logout mechanism anywhere in the admin context before this (only `ManagerDashboard.tsx`/`AgentDashboard_v2.tsx` had their own ad hoc `localStorage.clear()` + redirect; the new button reuses that exact pattern). Container height changed from `min-h-[calc(100vh-78px)]` (offsetting the now-gone 78px header) to `min-h-screen`.

Reason: A flat tab bar was already documented as not scaling toward this project's stated 20-30+ feature horizon; a permanent sidebar solves that but at a real, ongoing cost to working area that the project owner judged not worth paying, especially once combined with also reclaiming the header's dead vertical space -- the dropdown-bar approach gets both the scale fix and the maximized content area.

Approved By: Daler

Status: Implemented. `tsc -b` clean (same 9 pre-existing unrelated errors as every prior entry, confirmed unchanged). Structure verified by reading the final JSX directly (sidebar wrapper fully removed, single-row flex layout with `AdminNav` + `Выход` button sharing one `border-b`).

---

# Decision 089

Date: 2026-07-20

Decision: Fixed a real, DB-traced financial-integrity gap in Decision 083's booking-date-change review-flag mechanism. Traced precisely before any fix: found via `bookings.dates_changed_at`/`date_change_reason` (real user-entered reasons, not test strings) cross-referenced against `invoices` that 4 real bookings (#2, #7, #10, #12) had their dates changed after their invoices were already approved to `Issued`, and none of them ever got flagged -- live totals had drifted from their frozen invoice totals by $2,008 to $20,462. Root cause: `flag_invoice_for_review` (Decision 083) deliberately no-op'd for any invoice whose `status != "Draft"`, treating "an already-Issued invoice's staleness" as explicitly out of scope ("a Credit Note's job, not this flag's") -- but no Credit-Note-triggering workflow was ever built off this event, so in practice the carve-out produced zero signal anywhere for a real, common case. The frontend orchestration call itself fires correctly and unconditionally after a successful date change; this was a backend scope gap, not a broken call site.

`flag_invoice_for_review`'s guard loosened from `status != "Draft"` to `status == "Void"` -- Issued invoices are now flaggable too, immediately visible via the existing `/invoices/urgent` panel (whose own query already only ever excluded Void). Since `approve_and_send_invoice`'s flag-acknowledgment only applies to a Draft -> Issued transition, a new, separate action was added for the Issued case: `acknowledge_review_flag` (`POST /finance-engine/invoices/{id}/acknowledge-flag`) sets `flag_acknowledged_at` without touching `status`, email, or anything else -- a deliberate accounting decision ("Отметить как проверено" in `Invoices.tsx`'s row actions and `InvoiceDetailModal`), not a best-effort no-op, so it raises if there's no `review_flag` to acknowledge. New `Invoice.flag_acknowledged_by` column (migrated via raw `ALTER TABLE`, same as Decision 084's `cancelled_by`) gives this path the same actor+timestamp audit pairing every other Finance Engine action already has; `approve_and_send_invoice` was extended to set it too (alongside its existing `flag_acknowledged_at` write), so both acknowledgment paths leave an identically-shaped audit trail.

Reason: An Issued invoice silently drifting by tens of thousands of dollars with zero proactive signal is a real financial-integrity risk, not a cosmetic gap -- it must be visible to accounting, not silently accepted as a known limitation.

Approved By: Daler

Status: Implemented and verified live via real HTTP against a fresh booking/invoice pair (create -> Draft invoice -> approve-and-send -> Issued -> change dates -> flag-for-review): confirmed the Issued invoice's `review_flag` now gets set (previously silently no-op'd), appears in `/invoices/urgent`, and `acknowledge-flag` correctly dismisses it (sets `flag_acknowledged_at`/`flag_acknowledged_by`, drops out of the urgent list, status stays `Issued`). Full regression confirmed unchanged: Draft-invoice flagging still works exactly as before; `approve_and_send_invoice` on a flagged Draft invoice still flips to Issued and now also sets `flag_acknowledged_by`; Void invoices remain correctly excluded from flagging (204 no-op); `acknowledge_review_flag` correctly rejects (400) an invoice with no flag. All test bookings/invoices cleaned up via real cancel/void endpoints, confirmed the urgent list returned to its exact pre-test baseline.

---

# Decision 090

Date: 2026-07-20

Decision: Simplified `booking_number` from a UUID-based scheme (`BK-{uuid4().hex[:12]}`) to a simple sequential one, `BK-{id:06d}`, keyed directly to the booking row's own real autoincrement `id` -- no separate counter table, no race risk beyond what the id column's own uniqueness already guarantees. Since the id doesn't exist until the row is actually inserted, `repository.create_booking` now writes a throwaway unique placeholder to satisfy the column's `NOT NULL`/`UNIQUE` constraints through `db.flush()`, then immediately overwrites it with the real sequential number before `commit()` -- the placeholder is never visible to any caller. The old `_generate_booking_number()` helper (and its now-unused `uuid` import) was removed from `booking/service.py` entirely rather than left as dead code.

**Retroactive rename of all pre-existing bookings, not just new ones going forward.** Before doing this, checked concretely whether any real, already-sent-out reference to an old-format number could go stale: `backend/.env` doesn't exist (confirmed, no file), so `send_real_email`'s `SMTP_USER`/`SMTP_PASSWORD` are always unset and it unconditionally returns `False` + console-logs instead of sending -- confirmed against the live DB that all 11 `Issued` invoices have `email_sent_at = NULL`, meaning zero real emails have ever left this system for anything, ever. Also grepped every reference to `booking_number` in the backend: `Invoice`/`CreditNote`/`AgentStatementLine` all reference `booking_id` as a plain integer and resolve `booking_number` live via lookup only when needed (the `.xlsx` export, an invoice email body) -- nothing persists it as a frozen text snapshot anywhere. Given that, all 28 pre-existing bookings with old UUID-format numbers were renamed in place to the same `BK-{id:06d}` scheme (2 bookings created during this session's own verification already had the new format and were left untouched) -- one uniform, fully sequential numbering scheme project-wide rather than a permanent two-tier split. The only accepted residual risk: a CSV/`.xlsx` export downloaded locally before this rename would reference old numbers -- narrower than "sent to an agent/hotel" and not mitigated further, per explicit project-owner sign-off.

Reason: Sequential booking numbers are meaningfully easier to search, reference in conversation, and cross-check against invoices than opaque UUID fragments -- the same simplification rationale the project owner raised for invoice numbers (though, corrected during this conversation: invoice numbers were never actually changed to sequential in any prior session -- they remain UUID-based, `INV-{uuid4().hex[:12]}`, unchanged by this decision).

Approved By: Daler

Status: Implemented and verified live: two real test bookings received `BK-000030`/`BK-000031` in strict id order; direct DB query confirmed zero leftover placeholder rows and no format/uniqueness violations. Retroactive rename executed directly against `dmc.db` (28 rows updated, 2 already-correct skipped), verified after: zero mismatches between `booking_number` and `BK-{id:06d}` across all 30 rows, zero duplicates, and the existing `GET /booking-engine/bookings/by-number/{booking_number}` endpoint correctly resolves a renamed booking by its new number. All test bookings cancelled via the real cancel endpoint afterward.

---

# Decision 091

Date: 2026-07-20

Decision: Added booking-number search to "Счета" (`Invoices.tsx`), as a second, explicit search mode alongside the existing agent-name search -- a toggle ("По агенту" / "По номеру брони"), not one smart auto-detecting field, since the two are genuinely different interaction shapes: agent search is select-from-autocomplete-suggestions (`AgentSearchSelect`), booking-number search is type-and-submit-to-jump-directly-to-one-item. Mixing both into a single field would mean the same input silently changes behavior based on content with no clear signal to the user, and nothing structurally prevents an edge case like an agent name starting with "BK". Booking-number mode: plain text input + "Найти" button (Enter submits too), normalizes the query to uppercase (booking numbers are always uppercase) before calling the existing `GET /booking-engine/bookings/by-number/{booking_number}`, then `GET /finance-engine/bookings/{id}/invoice` -- no new backend endpoints needed, both already existed. Three outcomes, each with a distinct message: booking not found; booking found but no invoice yet (a real, valid state -- not every booking has one); found -> opens the same `InvoiceDetailModal` used everywhere else on this page directly, matching "jump to it," not just filter a list down to it.

Checked `Reservations.tsx` first, per the request to only add this "if it doesn't already have one at this level of directness": it already has a substring, case-insensitive search over `booking_number` against the full loaded list (`searchQuery`, `placeholder="Поиск по № брони..."`). Since `booking_number` is globally unique, typing a full or partial number already narrows the table to exactly one row in practice -- no changes made there.

Reason: Booking numbers (now sequential per Decision 090) are the natural cross-reference between a booking and its invoice, but "Счета" had no way to search by one directly -- an admin holding a booking number (e.g. from a conversation with an agent) previously had to already know which agent it belonged to just to look up its invoice.

Approved By: Daler

Status: Implemented. `tsc -b` clean (same 9 pre-existing unrelated errors as every prior entry). Verified end-to-end via the exact same two-call sequence the frontend makes, real HTTP, no browser available: `BK-000030` (a real booking with no invoice) correctly resolves the booking then correctly fails the invoice lookup with `"Booking 30 has no invoice"` (400) -- the "found but no invoice yet" path; `BK-000002` (a real booking with an Issued invoice) correctly resolves both calls in sequence, returning `INV-A0CF4326B724` -- the "jump directly to the invoice" happy path; `BK-999999` (nonexistent) correctly fails the first call with `"Booking 'BK-999999' not found"` (400) -- the "not found" path. All three match the frontend's branch conditions exactly. No test data created (read-only verification).

---

# Decision 092

Date: 2026-07-20

Decision: Three fixes to Decision 091's booking-number search, all found via the project owner's own live testing.

(1) **Flexible input.** `normalizeBookingNumber` now accepts a bare number ("21") in addition to the full `BK-000021` form -- strips an optional `BK-`/`bk-` prefix, keeps only digits, zero-pads to 6, re-adds `BK-`. Applied per comma-separated token, not just once to the whole field.

(2) **Real bug, traced precisely before any fix.** The previous implementation had no persistent results state at all for booking-number mode -- a successful search's *only* effect was `setDetailInvoice(invoice)`, opening the shared modal directly; nothing was ever written to a state that renders a row. So when the modal closed, there was nothing left to show -- not because a row vanished, but because no row had ever existed outside the transient modal. Root cause: booking-number mode had no equivalent of agent mode's `agentInvoices` list state.

(3) **Multi-number search**, which also fixes (2) structurally rather than patching around it. New `bookingSearchResults: Invoice[]` state, populated by splitting the input on commas and resolving each token independently (partial success shows what was found plus which tokens failed and why, e.g. `BK-000099: не найдено; BK-000030: счёта пока нет`). Rendered via the same `InvoiceTable` component agent mode already uses -- identical row rendering, identical actions (Подробнее/Одобрить и отправить/Отметить как проверено/Аннулировать). `Подробнее` opens the shared `InvoiceDetailModal` *on top of* the still-visible table via the same `detailInvoice` state every other table on this page already uses -- closing it now correctly reveals the table underneath, since the two states are independent. `refreshBoth()` (already called after every void/approve/acknowledge action) extended with a new `refreshBookingSearchResults()` that re-fetches whatever's currently shown via `GET /finance-engine/invoices/{id}` (one call per row, already existed, no new endpoint) -- so actions taken from this table stay in sync exactly like the urgent panel and agent-mode table already do.

Reason: The original single-jump design didn't survive real usage -- multiple known booking numbers is a real workflow (e.g. reconciling a batch from an agent conversation), and a persistent, actionable results table is what both the multi-number requirement and the disappearing-row bug actually needed, not two separate patches.

Approved By: Daler

Status: Implemented. `tsc -b` clean (same 9 pre-existing unrelated errors as every prior entry). Verified via the exact same call sequence the frontend makes for "21,22": both normalize correctly (`BK-000021`, `BK-000022`), both resolve to real bookings with real invoices (`INV-69CC69FCFA36`/Draft and `INV-761FF17A732A`/Void -- a deliberately mixed-status pair, exercising different available row actions), and the refresh-by-id endpoint (`GET /finance-engine/invoices/{id}`) used to keep the table in sync after actions was independently confirmed working for both. Modal/table independence verified by code inspection: `InvoiceDetailModal`'s `onClose` only clears `detailInvoice`, never touches `bookingSearchResults` -- the table cannot disappear on modal close by construction, not just by observation.

---

# Decision 093

Date: 2026-07-20

Decision: `Invoice.review_flag`, a single overwritable text field, replaced with `InvoiceReviewNote` -- an append-only, numbered child table (`invoice_id`, `sequence_number`, `change_description`, `created_at`), same "never mutate history" principle as AI Core Engine's `HumanGateDecision` and this Engine's own `AgentStatementLine`. Traced a real bug first, precisely, before any fix (see the reproduction below): `flag_invoice_for_review` always overwrote `review_flag`'s text on a new flag (not a set-once guard, as first suspected) but never touched `flag_acknowledged_at` -- so once an invoice had been acknowledged, any later flag updated the text but the invoice never re-appeared as urgent, since `isUrgentFlag` only checked `!flag_acknowledged_at`. Reproduced live: flag -> acknowledge -> flag again -> invoice #22 in that run stayed absent from `/invoices/urgent` despite a genuinely new, unacknowledged change.

**The fix is structural, not a patch.** `flag_acknowledged_at`/`flag_acknowledged_by` on `Invoice` are unchanged in shape but now mean "all `InvoiceReviewNote`s as of this timestamp were reviewed." `list_urgent_invoices`' query changed to: `status != Void AND` at least one note exists `AND (flag_acknowledged_at IS NULL OR latest_note.created_at > flag_acknowledged_at)`. This eliminates the bug class entirely -- there is no field that must be remembered and reset on a new note; urgency falls out of comparing two timestamps that are each written exactly once, by exactly one action. Same logic duplicated (deliberately, to stay a pure client-side function like before) in the frontend's `isUrgentFlag`.

`flag_invoice_for_review` -> `add_invoice_review_note`: same best-effort, no-op-for-missing/Void-invoice contract as before, but now appends a new numbered row (`sequence_number = existing count + 1`) instead of overwriting. `acknowledge_review_flag` unchanged in name and shape, but its guard now checks "at least one review note exists" instead of `review_flag is not None`, and it only ever needs to write the two invoice-level timestamp/actor columns -- never touches any individual note. No SQLAlchemy `relationship()` was introduced (none exists anywhere in this project, even for existing intra-engine FKs like `CreditNote.invoice_id` -- kept consistent): every service function that returns an `Invoice` explicitly attaches `.review_notes` as a plain ad-hoc list attribute via a new `_attach_review_notes`/`_attach_review_notes_bulk` pair (the bulk variant does one `WHERE invoice_id IN (...)` query for list endpoints, not N+1) before `InvoiceResponse.model_validate` runs.

**Migration:** the physical `review_flag` SQLite column stays in place, unmapped (dropping it is unnecessary DDL risk for zero benefit) -- 8 existing non-null values were backfilled into seed `InvoiceReviewNote` rows (`sequence_number=1`) first, using the linked booking's own `dates_changed_at` as a best-effort original timestamp where available (most of these were test data from earlier today, not real business history, but backfilled anyway on principle -- no history silently dropped).

**Frontend:** `Invoice.review_flag: string | null` -> `review_notes: InvoiceReviewNote[]`. `InvoiceDetailModal` now renders the full numbered list ("Изменено 1: ...", "Изменено 2: ...") instead of one line, styled urgent or acknowledged-history exactly as before. New shared `formatReviewNotes()` joins the list for the three places that need one string (CSV export's "Флаг" column, the urgent-badge tooltip, both confirm() dialogs) -- so the full history, not just the latest note, is visible everywhere a flag was previously shown as one line.

Reason: A single-value field that must be paired with a second field manually reset on every write is a bug waiting to happen -- this session already found one instance of it. An append-only history, with urgency derived from a timestamp comparison instead of remembered state, removes the entire bug class and, as a real side benefit, gives accounting the full change history instead of only ever the most recent one.

Approved By: Daler

Status: Implemented and thoroughly verified live, real HTTP, no browser available. **Bug-fix reproduction (the exact previously-broken scenario):** fresh booking -> Issued invoice -> change #1 -> flag #1 (`review_notes: [(1, "NOTE ONE")]`, correctly urgent) -> acknowledge (correctly exits urgent) -> change #2 -> flag #2 -> `review_notes: [(1, "NOTE ONE"), (2, "NOTE TWO")]`, `flag_acknowledged_at` correctly **unchanged/stale** from the first acknowledgment, and the invoice **correctly reappears** in `/invoices/urgent` -- the exact case that failed before this fix. Acknowledged again -> correctly exits urgent a second time, confirming the cycle repeats indefinitely, not just once. **Full regression:** Draft-invoice flag/ack cycle still works, and `approve_and_send_invoice`'s auto-acknowledgment now also sets `flag_acknowledged_by` correctly; Void invoices remain excluded from flagging (204 no-op, unchanged); `acknowledge_review_flag` correctly rejects (400) an invoice with zero notes; a list endpoint (`GET /agents/2/invoices`, 26 rows) correctly bulk-attaches `review_notes` per invoice, including the migrated historical ones and the new multi-note test invoice (2 notes). All test bookings/invoices from this verification cancelled/voided via real endpoints afterward; urgent list confirmed back to its exact pre-test baseline.

---

# Decision 094

Date: 2026-07-20

Decision: `InvoiceReviewNote` gained 8 nullable structured columns (`old_arrival_date`/`old_departure_date`/`old_total`/`old_offer_name`, and the same four `new_*`) alongside the existing free-text `change_description` -- a note describing a booking date change now carries the real price breakdown for both sides, not just a sentence. `old_offer_name`/`new_offer_name` are NULL when no SpecialOffer applied (displayed as "только контракт"), never an empty string. `change_description` itself became nullable (a real SQLite table rebuild, cheap since the table only had 14 test rows at the time, all preserved and re-inserted unchanged) -- a structured note doesn't need a redundant sentence; the 14 legacy notes keep using it as their only content, since they predate this decision and have no structured snapshot.

**Capture is backend-driven, never client-supplied** -- a permanent financial audit record shouldn't trust a client's report of historical pricing. `FlagForReviewRequest` dropped its free-text `reason` entirely, replaced by `old_arrival_date`/`old_departure_date` only (the new dates are already on the booking row by the time this call runs, read directly from there, not resent by the caller). `add_invoice_review_note`: the NEW snapshot is read directly off the booking's current row (`total_amount + transfer_total + mandatory_tax_total`, `applied_special_offer_id` resolved to a name) -- `change_booking_dates` already computed and stored exactly this moments earlier; recomputing separately would be redundant and could theoretically diverge from what's actually stored. The OLD snapshot must be recomputed, since the pre-change values are gone from the booking row by this point: resolves whichever contract actually covered the OLD dates (may differ from the current one if the change crossed a contract boundary), resolves the booking's meal_plan_id to its portable meal code first, then prices the old dates via the same `get_room_price`/`get_transfer_price`/`get_mandatory_tax`/`apply_agent_pricing` chain Booking Engine's own `create_booking`/`change_booking_dates` use internally (new read-only cross-engine imports into Finance Engine: `contract_service`, `pricing_service`, same pattern already used for `booking_service`/`hotel_service`). Wrapped in a broad `except ValueError`: if the old dates genuinely can't be repriced, `old_total`/`old_offer_name` stay `None` and `change_description` alone carries a backend-generated fallback sentence -- this best-effort note must never fail the caller's already-succeeded date change.

Display: `InvoiceDetailModal` and the new shared `formatSingleNote`/`formatReviewNotes` render the exact format specified -- `Изменено N (created_at): Было [даты], [offer или "только контракт"], итого $A → Стало [даты], [offer2 или "только контракт"], итого $B (разница: ±$C)` -- when a note has a structured snapshot (`hasPriceSnapshot`), falling back to plain `change_description` for the 14 legacy notes.

**Deferred, logged only, not built now:** a per-note hotel-confirmation status/comment (e.g. "Отправлено отелю, ожидаем подтверждения" / "Отель подтвердил по этой цене") -- ties into Decision 029's future AI-hotel-correspondence work.

Reason: A note that only says dates changed doesn't tell accounting whether the price actually moved, by how much, or why -- capturing the real before/after breakdown at the moment of change (not reconstructible later, since season/offer availability can itself change over time) closes that gap while keeping the audit record itself tamper-proof against a client-supplied number.

Approved By: Daler

Status: Implemented. While building the live verification, found and fixed a real, previously-undiscovered bug in `change_booking_dates` blocking correct verification -- see Decision 095. Fully verified afterward on Siyam World's real SWJ26 offer data (contract 8): a booking changed from the "Value Season" window (2027-04-20–23, offer 2) back to the "Winter/Spring" window (2027-03-01–04, offer 4) produced a note with `old_offer_name: "SWJ26 - Value Season"`, `new_offer_name: "SWJ26 - Winter/Spring"`, `old_total: 2899.15`, `new_total: 3892.75` -- both totals independently reconstructed byte-identical via direct `get_room_price`/`get_transfer_price`/`get_mandatory_tax`/`pricing-engine/agent-price` calls for each date range separately ($1797.15+$1030+$72=$2899.15; $2790.75+$1030+$72=$3892.75). Frontend's `formatSingleNote` logic run directly in Node against this exact real data produced the exact specified format, including a separately-checked null-offer case rendering "только контракт" correctly. Invoice confirmed correctly urgent throughout. All test data voided/cancelled afterward, urgent list confirmed back to baseline.

---

# Decision 095

Date: 2026-07-20

Decision: Fixed a real, previously-undiscovered bug in LOCKED Booking Engine's `change_booking_dates`, found while building Decision 094's verification (not while looking for it): its `repository.update_booking(...)` call never included `applied_special_offer_id` in the fields it writes, so that column stayed frozen at whatever `create_booking` originally computed -- silently wrong on every date change that crossed a SpecialOffer's date-scoped discount window, ever since Decision 048 introduced the column. Same bug *shape* as Decision 082 (`agent_markup_amount`/`agent_exclusive_discount_amount` going stale on date change), but a different field that Decision 082's fix never covered.

Traced precisely before fixing: a fresh booking's date change from a "Winter/Spring"-window stay into a "Value Season"-window stay showed `applied_special_offer_id` still reading 4 (Winter/Spring) afterward, while a direct `get_room_price` call for the identical new dates correctly returned `applied_special_offer_ids: [2]` (Value Season) -- `change_booking_dates` computes the right answer via `get_room_price` (line 485) but simply never writes it anywhere.

Fix: added `applied_special_offer_id=(price["applied_special_offer_ids"][0] if len(price["applied_special_offer_ids"]) == 1 else None)` to the existing `update_booking(...)` call -- one line, same shape as Decision 082's own fix, same LOCKED-engine additive-extension precedent already established twice this session.

Reason: this directly compromised Decision 094's own design, which deliberately reads the booking's `applied_special_offer_id` for the "new" snapshot rather than recomputing it (to avoid redundancy and guarantee it matches what's actually stored) -- but what was "actually stored" was wrong. Fixing it at the source, per the project owner's explicit direction, mirrors the exact lesson from Decision 093 earlier today: patching around a known defect instead of fixing it at its root just relocates the risk to wherever else touches this same data.

Approved By: Daler

Status: Implemented and verified. **Isolated test:** fresh Siyam World booking, date change from Winter/Spring into Value Season window -- `applied_special_offer_id` now correctly reads 2 (was stuck at 4 before the fix), matching a fresh independent `get_room_price` call exactly. **Regression against Decision 082's own territory:** a fresh Kandima booking + date change still correctly computes and stores `agent_markup_amount` ($10/night × new nights, unchanged formula) and `agent_exclusive_discount_amount` -- confirming this fix touched nothing about Decision 082's already-verified markup/discount computation, only added the one missing field write. All test bookings cancelled/invoices voided afterward via real endpoints.

---

# Decision 096

Date: 2026-07-20

Decision: `InvoiceDetailModal`'s "Текущее состояние брони" block now shows a highlighted, human-readable "what specifically changed" line at its top, rather than leaving the accountant to manually diff two separate frozen-vs-current blocks. Designed generic from the start, not hardcoded to dates: a new `ChangeHighlight {label, oldValue, newValue, delta}` shape, produced by `deriveChangeHighlights(latestNote, currentArrival, currentDeparture)` -- today this function contains exactly one check (dates), each future field-change type (room type, meal plan, etc., whenever a note type captures one) gets its own small `if (...) highlights.push(buildXHighlight(...))` block added to this same function, all producing the identical shape, so the rendering code (`changeHighlights.map(...)`) never has to change.

For dates specifically: compares the **latest** review note's `old_arrival_date`/`old_departure_date` (the single most recent change, not cumulative drift across the whole history) against the **live-fetched booking's current** `arrival_date`/`departure_date` -- not the note's own `new_*` fields, since the modal already fetches `booking` separately for exactly this "what's actually true right now" purpose, more robust than trusting a snapshot. Delta text: night-count change shows `"+1 ночь"`/`"+2 ночи"`/`"+5 ночей"` (real Russian pluralization, 1/2-4/5+ with the 11-14 exception); a same-length shift shows `"смещено на +7 дн."`. Skipped entirely (empty array, nothing rendered) when the latest note has no structured snapshot at all -- covers the 14 pre-Decision-094 legacy text-only notes gracefully, no special-casing needed in the render path itself.

Reason: two side-by-side blocks force the reader to manually notice and compute what changed between them -- a single highlighted line stating the specific delta up front is faster and less error-prone for the exact use case (an accountant deciding whether to approve a flagged invoice) this whole review-note mechanism exists for.

Approved By: Daler

Status: Implemented. `tsc -b` clean (same 9 pre-existing unrelated errors as every prior entry). Verified against a real +1-night date change (booking created 20.02.2027–27.02.2027, invoice Issued, then changed to 20.02.2027–28.02.2027): ran the actual derivation logic in Node against the real API response, producing exactly `{newValue: "20.02.2027 – 28.02.2027", oldValue: "20.02.2027 – 27.02.2027", delta: "+1 ночь"}` -- matches the requested example precisely. Confirmed empty (no highlight) for a legacy note with no `old_arrival_date`. Additionally spot-checked the same-length-shift path (`"смещено на +7 дн."`) and the plural-night path (`"+2 ночи"`), both correct. Test booking/invoice voided/cancelled afterward.

---

# Decision 097

Date: 2026-07-20

Decision: Built `01_Modules_List.md` §11's originally-deferred "Voucher" item (Decision 076 explicitly excluded it from Finance Engine's initial scope) -- the guest-facing proof-of-booking document, distinct from Invoice (the agent-facing financial one): hotel name, dates, room type, guest names, meal plan, confirmation number, deliberately zero pricing/discount/commission figures anywhere.

**Two connected pieces.** (1) `Booking.confirmation_number` (nullable String, LOCKED Booking Engine additive extension, same shape and migration technique as `arrival_flight_number`/`departure_flight_number`/Decisions 084/089/090) -- the hotel's own reference number, entered manually by a manager once received. Editable via the *already-existing* `PUT /booking-engine/bookings/{id}` (`BookingUpdate` gained one field, no new endpoint), through a new `ConfirmationNumberEdit` component in `Reservations.tsx`'s booking detail panel, same edit-button/inline-input pattern as the existing flight-number editor. (2) A new `Voucher` entity in Finance Engine, deliberately NOT Booking Engine -- `01_Modules_List.md §11` and Decision 076 already name Voucher as Finance Engine scope, and every piece of infrastructure this needs (generate-a-document/resolve-agent-email/send-via-`email_service` pattern, read-only `booking_service`/`hotel_service`/`contract_service` cross-engine imports, Decision 090's sequential-number scheme) already lives there; Booking Engine has never had a whole new entity added to it, only single-field extensions (Decisions 082/084/089/090/095). `voucher_number` is sequential (`VCH-000001`), same flush-before-commit technique as `booking_number`, not another UUID scheme. Deliberately NOT "one per booking" like Invoice -- mirrors `CreditNote`'s append-only relationship to `Invoice` instead, since a hotel correcting its confirmation number later should produce a new voucher, not hit a one-per-booking block. No Draft/Issued review workflow -- generation IS the send action, since a guest-facing document needs no internal accounting approval gate the way an agent's bill does.

**Auto-trigger:** frontend orchestration, identical shape to Decision 080's claim-auto-invoice and Decision 083's date-change-flag -- `ConfirmationNumberEdit`'s save handler, after the `PUT` succeeds, best-effort fires `POST /finance-engine/bookings/{id}/voucher` *only* when the saved value is non-empty AND actually changed from the previous one (not on every resave of the same value, which would otherwise spam a fresh voucher email on an unrelated edit). No LOCKED-engine modification, no circular import.

**Deliberately deferred, logged as a follow-up, not built now (per explicit direction):** a Voucher list/view/resend UI. This session's plan only covers entering the number and the auto-send firing; a speculative `GET /bookings/{id}/vouchers` endpoint was drafted then removed before commit, since nothing would consume it yet -- same "build only once proven" discipline as every other Engine's unbuilt pieces.

Reason: Voucher was one of two items (`01_Modules_List.md §11`, alongside Supplier Payments) explicitly deferred out of Finance Engine's original scope in Decision 076 -- this closes that real, already-logged deferral, additively, on an already-LOCKED Engine, the same pattern every other post-lock Finance Engine extension this session has followed.

Approved By: Daler

Status: Implemented and verified live, real HTTP, no browser available. Created a real booking (Kandima, 2 guests: John Smith, Jane Smith), saved `confirmation_number: "HTL-KAND-2027-9981"` via the real `PUT` endpoint, then fired the voucher endpoint: response contained `voucher_number: "VCH-000001"`, correctly resolved `hotel_name: "Kandima Maldives"`, `room_type_name: "Sky Studio"`, `meal_plan_label: "BB"`, `guest_names: "John Smith, Jane Smith"`, correct dates/occupancy -- **and confirmed zero pricing/discount/commission fields anywhere in the response**, matching the model's own design. Checked the actual console-logged email body (no SMTP configured, same as every other email in this project): confirmed it also contains zero financial figures, only the guest-facing table (hotel, confirmation number, booking number, dates, room type, meal plan, guests, occupancy) plus a plain confirmation sentence -- exactly the Invoice/Voucher content separation this decision is built around. Test booking cancelled afterward via the real endpoint (the Voucher row itself has no delete mechanism by design -- append-only, same as every other document-generation row in this Engine -- left in place as an accurate historical record).

---

# Decision 098

Date: 2026-07-20

Decision: Fixed a real, two-layer gap where an agent changing their own booking's dates via `AgentDashboard_v2.tsx` never triggered Decision 083/094's review-note mechanism, silently different from the identical change made via `AdminPanel.tsx` -- confirmed both `BookingsList` and `handleChangeDatesSubmit` are the exact same shared component/function (`AgentDashboard_v2.tsx` imports `BookingsList` from `./Reservations`, not a duplicate), so the divergence was purely in each caller's `permissions` prop and the backend's own authorization.

**Layer 1 (frontend), traced via direct code inspection:** `Reservations.tsx`'s flag-for-review orchestration call was wrapped in `if (permissions.canManageInvoices)`. `AdminPanel.tsx` passes `canManageInvoices: true`; `AgentDashboard_v2.tsx` passes `false` -- so for an agent the call was never even attempted. **Layer 2 (backend), verified live with a real, validly-signed agent JWT** (generated by temporarily swapping the real agent's password hash, logging in through the actual running server so the token matched that process's own `SECRET_KEY` -- a plain standalone-script-generated token failed with a signature mismatch first, since every process independently generates its own random `SECRET_KEY` per this project's known limitation; password restored immediately after, confirmed byte-identical): `POST /finance-engine/bookings/{id}/flag-for-review` with the agent's own real token returned `403 "Admin access required"` -- every Finance Engine endpoint is hardcoded `_require_admin`, no owning-agent carve-out existed anywhere. Confirmed the real end-to-end consequence too: agent-owned booking, Issued invoice, agent-context date change succeeds, `review_notes` stays `[]` despite the price genuinely changing.

**Root cause:** `canManageInvoices` (Decision 079) was designed to answer one question -- can this user see Draft invoice data at all -- and Decision 083 later piggybacked the flag-for-review *trigger* onto that same flag. Two different concerns sharing one boolean, not a deliberate exclusion of agents from this specific mechanism.

**Fix, both layers, narrower than "open up Finance Engine to agents":**
- Frontend: removed the `canManageInvoices` gate from this one call entirely -- it now fires for any successful date change, agent or admin. `canManageInvoices` is untouched everywhere else it's actually used (invoice button/badge visibility, etc.).
- Backend: new `_require_admin_or_owning_agent(current_user, booking)` in `finance/api.py`, used ONLY by `flag-for-review` -- admin unconditionally, or `current_user.id == booking.agent_id`. Mirrors Booking Engine's own `_require_owner_or_admin` (`booking/api.py:72`) exactly, same role check and comparison, not imported directly (a private, underscore-prefixed cross-Engine authorization import has no precedent anywhere in this project; cross-engine imports are always for business-logic service functions). Every other Finance Engine endpoint -- `void`, `approve-and-send`, `acknowledge-flag`, every `GET /invoices/*` -- stays exactly `_require_admin`, completely untouched: an agent still cannot see, approve, void, or acknowledge-flag any invoice, their own or otherwise.

Reason: an agent's own date change silently producing a different (worse) audit outcome than the identical admin-initiated change is a real correctness gap in a mechanism this session already invested heavily in getting right (Decisions 083/093/094) -- fixed at both layers that caused it, not patched around either one.

Approved By: Daler

Status: Implemented and verified against all 5 planned checks, real HTTP, no browser available. **(1) Isolated test:** using the same real-agent-JWT technique as the trace, agent 2 changed their own booking's dates and successfully called `flag-for-review` (`200`) -- created a real `InvoiceReviewNote` with the correct structured price snapshot (`old_total: 1468.65` → `new_total: 1268.20`, `old_offer_name`/`new_offer_name` both `"KM26_03"`), the first time an agent has ever been able to reach this mechanism. **(2) Regression, admin path:** a fresh admin-initiated date change + flag-for-review still succeeds identically (`200`). **(3) Regression, cross-agent boundary:** a second real agent (id 5) attempting to flag agent 2's booking still correctly gets `403 "You can only flag your own bookings for review"`. **(4) Regression, every other admin-only action:** the same agent-2 token against `void`, `approve-and-send`, `acknowledge-flag`, `GET /invoices/{id}`, and `GET /invoices/urgent` -- all still `403 "Admin access required"`, even on the agent's own invoice. **(5)** `tsc -b` clean (same 9 pre-existing unrelated errors), backend boots clean. Both agents' real password hashes restored exactly (byte-identical, verified) immediately after testing; all test bookings/invoices cancelled/voided via real endpoints afterward.

---

# Decision 099

Date: 2026-07-20

Decision: A flagged invoice was previously only visible in Финансы→Счета -- a manager looking directly at a booking in Бронирования had no indication a pending financial review existed for it. `Reservations.tsx`'s `BookingDetail` now shows a small coral badge ("⚠ Требуется проверка счёта") inline with `StatusBadge`, whenever the booking's invoice is currently urgent.

**No new fetch, no new backend endpoint.** `BookingDetail` already fetches the booking's invoice (`GET /finance-engine/bookings/{id}/invoice`, gated on `permissions.canManageInvoices` -- admin-only, the same boundary Decision 098 deliberately preserved: an agent can trigger a review flag on their own booking now, but still cannot see any invoice data, their own included). `InvoiceInfo` extended with `review_notes`/`flag_acknowledged_at`, reusing the shared `InvoiceReviewNote` type from `financeShared.tsx` rather than redefining it. Urgency reuses the exact shared `isUrgentFlag()` function, not a third reimplementation -- required loosening its parameter type from the full `Invoice` interface to a new minimal `UrgentFlaggable` shape (`status`/`review_notes`/`flag_acknowledged_at`, the only 3 fields it actually reads), since `InvoiceInfo` is deliberately much smaller than `Invoice` and doesn't have (and shouldn't need) the rest. `Invoice` itself still satisfies `UrgentFlaggable` automatically, so no existing call site in `financeShared.tsx`/`Invoices.tsx` changed behavior.

**Freshness fix, without which the badge would only ever appear after closing and reopening the booking:** the flag-for-review orchestration call (Decision 083/094/098) previously discarded its response entirely. It now feeds the returned invoice into `setInvoice(...)` -- but only when `permissions.canManageInvoices` is true. This guard matters: Decision 098 means this call now fires for agents too, and an agent's local `invoice` state must stay exactly as untouched (`null`) as it always was -- populating it from this response would leak invoice visibility to a role that's still supposed to be fully blocked from seeing it, undermining Decision 098's own explicitly-preserved boundary.

**Deliberately informational only, not clickable** -- confirmed with the project owner given the already-documented `App.tsx`/`router.tsx` navigation mismatch (CLAUDE.md's Known Issues): real click-through to the specific invoice in Финансы would need new cross-tab plumbing, scoped as a separate future task, not bundled here. The badge's tooltip shows the latest review note's full content (via the existing `formatSingleNote`), so a manager sees *what* needs review without leaving the page even without a link.

Reason: the whole point of Decisions 083/093/094/098 was making sure a booking change always produces a real, accurate review signal -- but that signal was only surfaced in one of the two places a manager would naturally look. Closing that gap directly serves the same "manager should never have to already know to go looking" principle Decision 087's own urgent panel was built around.

Approved By: Daler

Status: Implemented and verified live, real HTTP, no browser available (ran the actual `isUrgentFlag`/`formatSingleNote` frontend logic in Node against real API responses to confirm rendering). **Admin scenario:** created a booking + Issued invoice, confirmed no badge before any flag (empty `review_notes`); admin changed dates, captured the exact `flag-for-review` response now fed to `setInvoice(...)` -- `isUrgentFlag` returned `true` against it and the tooltip rendered exactly `"Изменено 1 (20.07.2026): Было [01.05.2027 – 04.05.2027], KM26_03, итого 1 468,65 $ → Стало [01.06.2027 – 05.06.2027], KM26_03, итого 1 268,20 $ (разница: -200,45 $)"` -- confirming the badge appears immediately without reopening the view. **Agent scenario:** using the same real-agent-JWT technique as Decision 098, agent 2 changed their own booking's dates and triggered the flag; confirmed the badge (informational, admin-only by design -- the agent never sees it themselves) correctly renders on the very first admin fetch of that booking afterward, with zero special refresh step needed beyond a normal view -- the full agent-triggers/admin-sees loop, matching the just-confirmed scope (no click-through). Agent's real password hash restored exactly (byte-verified) immediately after testing; all test bookings/invoices cancelled/voided via real endpoints afterward.

---

# Decision 100

Date: 2026-07-20

Decision: Traced a real, separate gap first, precisely, before any fix: `BookingsList`'s main table (`Reservations.tsx`) fetches only `/booking-engine/bookings`, `/hotel-engine/hotels`, `/users`, room-types, meal-plans, and cancellation-policies -- zero calls to `/finance-engine/*` anywhere in the list-loading path. Confirmed the `Статус` column renders only `<StatusBadge status={b.status}/>` (the booking's own lifecycle status), and confirmed the existing `AIInsightStrip`/`aiFlags` list-level mechanism doesn't already cover this either -- `computeRecentlyChangedFlags` is purely `dates_changed_at` time-windowed, with no invoice-awareness at all, so it both over-reports (flags a booking with no invoice) and under-reports (stops flagging after its time window even if the invoice's flag is still genuinely unacknowledged) relative to real review-flag state. So Decision 099's detail-view badge only ever helped a manager who'd already opened that specific booking -- a manager scanning the list itself had no signal at all.

**No new backend endpoint.** `GET /finance-engine/invoices/urgent` (Decision 087) already returns exactly the globally-urgent invoice set, already server-bounded by construction ("should be rare, not proportional to total invoice count," per its own docstring) -- reused directly rather than building a second bulk-lookup mechanism, which guarantees the list badge can never drift from what Финансы→Счета's own urgent panel shows, since it's the literal same query, not a parallel reimplementation. `BookingsList`'s existing `load()` effect fetches this once (not per-row -- the exact N-individual-requests trap this reuse avoids), gated on `permissions.canManageInvoices` (same boundary Decision 099 established: an agent never sees invoice data, their own bookings included), and builds a `Record<number, InvoiceInfo>` keyed by `booking_id` (a new optional field on `InvoiceInfo`, populated only by this list-level fetch -- `BookingDetail`'s own single-booking invoice fetch already knows which booking it's for from the URL and never needs it). The `Статус` cell renders the same coral badge/tooltip pattern Decision 099 introduced (compact "⚠ Счёт" label given table-cell width constraints, full detail in the tooltip via the same `formatSingleNote`) whenever a row's `booking_id` has a matching entry in that map.

Reason: the review-flag mechanism (Decisions 083/093/094/098/099) is only useful if a manager actually encounters the signal during their normal workflow -- and normal workflow is scanning the list, not opening every booking individually to check. Reusing the already-proven, already-scale-safe `/invoices/urgent` query was the correct fix, not a new endpoint duplicating logic that already exists and is already trusted.

Approved By: Daler

Status: Implemented and verified live, real HTTP, no browser available. Created three real bookings with Issued invoices in three distinct states -- (A) flagged, unacknowledged; (B) flagged then acknowledged; (C) never flagged -- and confirmed `GET /invoices/urgent` returned exactly booking A's `booking_id` among the three (B and C correctly absent). Ran the actual list-mapping and badge/tooltip logic in Node against this real response: `booking 48 (A) -> badge shown: true`, `booking 49 (B) -> badge shown: false`, `booking 50 (C) -> badge shown: false`, with the tooltip rendering byte-identical to Финансы's own detail-view content for the same invoice. Confirmed the fetch itself never fires for a non-`canManageInvoices` view (same `if` guard, same structural pattern already proven reliable in Decision 099 -- no separate live agent-token test needed for this specific mechanism). All test bookings/invoices cancelled/voided via real endpoints afterward.

---

# Decision 101

Date: 2026-07-20

Decision: Traced precisely first, per the project owner's request: `Booking.agent_markup_amount`/`Invoice.commission` were confirmed genuinely stored with real values (a direct query found real $30/$40 markup figures on real bookings) -- the data was never the problem. The problem was visibility: `compute_booking_financials` already returned `profit` as its own clean field (verified directly -- **no backend change was needed there**, said so rather than making a needless edit); Финансы→Счета's `InvoiceDetailModal` already showed the real commission as its own line; but Reservations.tsx -- the screen a manager actually looks at first -- showed a hardcoded `"—"` Profit with a tooltip claiming *"Наценка агента ещё не реализована — Pricing Engine (Decision 009)"*, false for months (Pricing Engine has been live since Decision 069), and its "Net cost"/"Sale price" both rendered the exact same formula, always identical, in both the detail modal and the main list table. Финансы→Баланс and the `.xlsx` export had no profit figure anywhere either.

**Single shared source of truth, so this can't drift into six implementations again.** New `computeBookingFinancials()` in `financeShared.tsx` -- a direct TypeScript mirror of the backend's `compute_booking_financials` math (`roomNet`, `roomSale`, `netTotal`, `saleTotal`, `profit`), operating on booking fields already fetched client-side, no new API calls or endpoints. Plus `invoiceProfit()` (`commission − discount`, NULL-aware) for the Invoice-shaped call sites where a live Booking isn't in scope. A real, separate gap found while wiring this up: `Reservations.tsx`'s own `Booking` interface didn't have `agent_markup_amount`/`agent_exclusive_discount_amount` at all, despite the backend returning them since Decision 069 -- added both fields.

**Net/Sale scope, an explicit judgment call the project owner made:** Net/Sale include transfer+tax (`netTotal`/`saleTotal`, matching Decision 069's own `net_total`/`sale_total`), not the room-only figures -- preserves today's "Sale price" magnitude exactly (no regression) and only fixes what was actually broken (Net no longer equals Sale; Profit is real). Profit itself is identical either way, since transfer/tax are pass-through by design and never touch it.

**All five surfaces, one formula each:**
1. Reservations.tsx detail modal -- `computeBookingFinancials(booking)`, real tooltip only when `profit === null` (genuinely pre-069), not the false "not implemented" claim.
2. Reservations.tsx list table -- same helper per row; `netOf()` (used for the "net" column's sort comparator too) now returns the real net total instead of accidentally being identical to sale price.
3. `financeShared.tsx` `InvoiceDetailModal` -- new "Прибыль" line in both existing blocks: frozen side via `invoiceProfit(invoice)`, live side via the same `computeBookingFinancials(booking)` Reservations.tsx uses (one formula, two call sites). `liveTotal`'s own hand-written duplicate of the sale-total formula was also replaced with `computeBookingFinancials(booking).saleTotal` while touching this code, removing a second parallel copy of the same arithmetic that predated this decision.
4. Финансы→Баланс -- new "Прибыль" summary card, `invoices.reduce` over `invoiceProfit()`, not-computed invoices contributing `0` to the aggregate (same precedent `generate_agent_statement`'s own `total_profit` already uses on the backend -- distinct from a single invoice's own `null` display).
5. `.xlsx` agent export (`build_agent_invoice_export`, backend) -- new "Прибыль" column, same `commission − discount` formula, empty cell (not `0`) when either side is `None`.

Reason: data that's correct but invisible everywhere a manager would naturally look is functionally the same as data that doesn't exist -- and an actively false "not implemented" claim sitting on a real, working feature for months is worse than simply missing, since it actively tells a manager not to expect something that's already there.

Approved By: Daler

Status: Implemented and verified against real data, including two genuinely distinct real historical cases found while verifying (not fabricated). **Known-good case:** a fresh real booking (real $10/night × 3-night = $30 markup, $0 discount) -- ran the actual shared logic in Node against the real API responses: Reservations.tsx (`netTotal=$1438.65`, `saleTotal=$1468.65` -- byte-identical to `invoice.total`, confirming construction correctness -- `profit=$30`), `financeShared.tsx`'s live block (`profit=$30`), its frozen block (`invoiceProfit=$30`), and Баланс's aggregate (`$30`) -- **all five surfaces agreed exactly.** **Genuine pre-069 case** (a real existing booking, id 4, `agent_markup_amount` still `null` today, never touched since creation): both live and frozen profit correctly render `null` (`"—"`), not a fabricated `0`, on every surface. **A third, distinct real case found during verification, not a bug:** booking 2's invoice (id 4) froze `commission=null` at its own creation time, before that booking's markup was ever computed -- but booking 2's *current* `agent_markup_amount` is now a real `310` (updated later). Confirmed this is correct, not a regression: the live side (Reservations.tsx, `InvoiceDetailModal`'s live block) correctly shows the real current `$310`, while the frozen side (the invoice itself, the `.xlsx` export) correctly shows `null`/`"—"`, honestly preserving what that invoice's own snapshot actually recorded -- exactly the live-vs-frozen divergence the existing `mismatch` banner already exists to catch. `.xlsx` export spot-checked directly (`openpyxl.load_workbook`): real historical negative-profit invoices rendered correctly (e.g. `-$45.45`, matching a real, previously-documented finding from earlier in this project where an Exclusive-tier discount exceeded the flat markup), `None` cells rendered as empty, not `0`. `tsc -b` clean (same 9 pre-existing unrelated errors), backend boots clean. All newly-created test data voided/cancelled via real endpoints afterward; the real historical bookings (2, 3, 4) used for verification were read-only, never touched.

---

# Decision 102

Date: 2026-07-20

Decision: Two-part, urgent fix reported directly by the project owner, minutes after Decision 101 shipped.

**Part 1 — the leak (fixed first, as priority).** Decision 101's new Net/Sale/Profit display landed in `Reservations.tsx`'s shared `BookingDetail`/`BookingsList` components with zero permission gating -- both render in `AdminPanel.tsx` *and* `AgentDashboard_v2.tsx` (which passes `canManageInvoices: false`), so real Cost/Profit figures were reaching the agent's own dashboard. This block existed unconditionally before Decision 101 too (harmless `"—"` placeholder), but today's fix put real commercial data into an already-unprotected block -- confirmed as my own oversight, not a pre-existing gap Decision 101 merely inherited. Fixed by gating both surfaces behind `permissions.canManageInvoices`, the exact boundary Decisions 099/100 already established for invoice visibility generally: the detail modal now shows only an "Итого"/`saleTotal` line for a non-admin view (Net cost/Sale price/Profit grid otherwise); the list table's "Net cost"/"Profit" `<th>`/`<td>` cells are conditionally rendered, "Sale price" stays unconditional; the empty-state row's `colSpan` was corrected to account for the now-variable column count.

**Part 2 — real, conditional document access, added separately.** Agents previously had zero way to obtain their own Voucher/Invoice -- both are Finance-side artifacts, invisible to `canManageInvoices: false` entirely. New capability, gated independently per document per the project owner's explicit rule: **Voucher** downloadable only once `booking.confirmation_number` is set (the hotel has confirmed -- the same signal Decision 097's own auto-voucher-generation already keys off); **Invoice** downloadable only once its status is `"Issued"` (approved and sent by accounting) -- a `"Draft"` invoice's content is never exposed to a non-admin, matching the Draft-invisibility principle already established for invoice *visibility* generally, now extended to invoice *content*. Both show "В работе" otherwise.

**No PDF infrastructure exists anywhere in this project** ("Stage C, not built yet," repeated in every prior Invoice/Voucher decision) -- reused the exact `Content-Disposition: attachment` plain-text pattern Decision 086's `.xlsx` export already established, rather than inventing new infrastructure for this. Three new backend functions in `finance/service.py` (`get_invoice_status`, `get_latest_voucher`, `build_voucher_download_text`, `build_invoice_download_text`) and three new endpoints in `finance/api.py`: `GET /bookings/{id}/voucher/download`, `GET /bookings/{id}/invoice/status`, `GET /bookings/{id}/invoice/download`. `_require_admin_or_owning_agent` (built for Decision 098's flag-for-review, narrow and per-endpoint opt-in) was generalized to gate all three -- same role/`agent_id` check, no broader Finance Engine relaxation. The status endpoint deliberately returns only `{"status": str | null}` -- no financial figures at all -- so nothing sensitive reaches the agent's browser even unrendered, a stricter bar than the rendering-level fix in Part 1 alone would have required. Invoice download content legitimately includes commission/discount line items for an Issued invoice -- **not** a re-leak: `send_invoice_email` has already been emailing these exact line items to the agent's own inbox since Decision 081 (an invoice showing its own bill breakdown to the person being billed is standard/expected), distinct from the internal "Profit" framing on Reservations.tsx that Part 1 actually fixed. Only a non-admin is blocked from downloading a Draft invoice; admin can (already has full Draft access via the existing `GET /invoices/{id}` endpoint).

Frontend: new `DocumentsSection` component in `Reservations.tsx`'s `BookingDetail`, rendered unconditionally for both admin and the owning agent (document access/ownership, not the Cost/Profit confidentiality boundary Part 1 drew) -- "Ваучер"/"Счёт" rows, real download link (fetches the endpoint, reads the filename from `Content-Disposition`, triggers a browser download) when ready, "В работе" text otherwise.

Reason: Part 1 -- internal cost/margin data must never reach the party being charged, a hard business-confidentiality rule, not a judgment call. Part 2 -- agents legitimately need their own booking documents once the operational/financial gates that already exist (hotel confirmation, accounting sign-off) have actually been cleared; withholding a ready document serves no purpose, and exposing an unready one violates the same Draft-invisibility principle already governing invoice visibility elsewhere.

Approved By: Daler

Status: Implemented and verified. **Part 1:** confirmed via full code trace -- `InvoiceDetailModal` (the component holding the two "Прибыль" lines) is unreachable from `AgentDashboard_v2.tsx` at all (only opened from `Финансы→Счета`, admin-only route); confirmed both Reservations.tsx leak points are now correctly wrapped in `permissions.canManageInvoices` checks. **Part 2:** verified live, real HTTP, real agent JWT (same password-hash-swap-and-restore technique as Decisions 098/099, byte-verified restoration afterward). Three real, pre-existing bookings covering all three states, no synthetic data created: booking 11 (no `confirmation_number`, Draft invoice) -- `invoice/status` returned `{"status":"Draft"}`, `voucher/download` returned 400 ("no voucher yet"), `invoice/download` returned 404 ("Invoice not yet issued"); booking 40 (`confirmation_number="123"`, Issued invoice, voucher already exists) -- `invoice/status` returned `{"status":"Issued"}`, `voucher/download` returned 200 with real voucher text (hotel, confirmation number, dates, room type, guests), `invoice/download` returned 200 with real invoice text including commission/discount/tax breakdown reconciling to the invoice's real total ($2236.45). Cross-agent access reuses the identical, already-verified `_require_admin_or_owning_agent` pattern from Decision 098 (no separate live test -- same code path, same prior verification). `tsc -b` clean (same 9 pre-existing unrelated errors). **No browser automation tool was available this session** -- frontend verified via full code-level trace of the permission gates (Part 1) and the new `DocumentsSection` component's wiring (Part 2), plus a clean typecheck, but not by literally driving a browser; stated here explicitly rather than implying a browser test occurred. All bookings/invoices used for verification were pre-existing and read-only (no cancel/void cleanup needed).

---

# Decision 103

Date: 2026-07-20

Decision: Closed a real, previously-flagged authorization gap on LOCKED Booking Engine's `claim_booking`, `send_correspondence`, and `add_correspondence_reply` -- all three were explicitly documented in their own docstrings as "Known, flagged gap, same precedent as Decision 032/045: any authenticated user can currently call this." This surfaced while discussing the Decision 102 leak's architectural root cause: the LPO email panel (`Reservations.tsx`, Decision 046) sits in the exact same shared `BookingsList`/`BookingDetail` component tree as the profit display Decision 102 just fixed, but under a completely different, unrelated gate (`booking.status === "Pending" && booking.claimed_by !== null`, nothing permission-based) -- so an agent could see and use the full LPO compose/send panel in `AgentDashboard_v2.tsx`, and the backend never actually stopped them either.

**Why this is a different, more serious category than Decision 102's leak:** that was passive exposure of internal data. This is an agent's ability to compose and dispatch outbound content to a business partner (a hotel) under the company's own authority, via a fully editable textarea (`editableLpoBody`) -- an operational/reputational exposure, not just a confidentiality one. Real-world impact today is bounded only by an unrelated infrastructure gap (`send_correspondence` is record-only, no SMTP integration exists, `backend/.env` has no email credentials anywhere in this project) -- not by any access control, and that infra gap disappears the instant real sending is ever wired up, which the UI's own "Отправить" button already implies is the intended end state.

**Backend fix:** new `_require_admin(current_user)` helper in `booking/api.py` (Booking Engine's first, mirroring Finance/Pricing Engine's own `_require_admin`) -- deliberately not `_require_owner_or_admin`, since this isn't an ownership question (the booking's own agent is not exempted): claiming a booking for review and communicating externally with a hotel are both manager/admin actions on the company's behalf, full stop. Applied to `claim_booking`, `send_correspondence`, `add_correspondence_reply`; `list_correspondence` (read) deliberately left ungated -- an agent reading their own booking's hotel-correspondence history is a reasonable capability, distinct from initiating/claiming/replying to it.

**Frontend fix:** the LPO panel (`Reservations.tsx`) is now gated behind `permissions.canManageInvoices` -- reusing the existing flag rather than adding a new one, since the project owner confirmed this is the same "admin/manager financial-and-external-communication" category as invoice management. **Consistency addition caught before implementation, not after:** the adjacent "Добавить ответ отеля вручную" (manually log a hotel's reply) button calls the now-admin-gated `add_correspondence_reply` -- left ungated, an agent would see a button that now 403s. Gated it too, alongside the LPO panel; the correspondence *thread display* itself (read-only) stays visible to everyone, matching the backend's read/write split.

Reason: an LPO is the company's own outbound word to a business partner, sent under the DMC's authority -- allowing any agent to compose and send one unilaterally is a real operational/legal exposure, not a hypothetical one, and this gap had been explicitly known and accepted twice already (Decisions 032/045) under the reasoning that "Manager isn't wired to a distinct role check anywhere yet" -- true, but that reasoning was about *speculative* role-modeling, not about the gap remaining safe indefinitely. Discovering it sat behind the exact same shared-component risk Decision 102 had just been fixed for made it worth closing now rather than re-deferring a third time.

Approved By: Daler

Status: Implemented and verified live, real HTTP, real agent + admin JWTs (same password-hash-swap-and-restore technique as Decisions 098/099/102, byte-verified restoration). **Isolated 403 tests** (agent JWT, fresh unclaimed booking created for this purpose): `POST .../claim` → 403 "Admin access required"; `POST .../correspondence/send` → 403; `POST .../correspondence/reply` → 403; `GET .../correspondence` (read) → 200, confirming the deliberate read/write split. **Full regression** (admin JWT, same booking): claim → 200, `claimed_by` resolved server-side to the admin's own id (never client-supplied, Decision 045's own precedent untouched); send → 201, `status="sent"`; reply → 201, resolves the prior outbound row to `"replied"` and creates the inbound row, both exactly matching Decision 049's original behavior; re-claiming an already-claimed booking as admin correctly still raises the pre-existing business-rule error (400, not 403), confirming `_require_admin` sits cleanly in front of unchanged `service.py` logic rather than replacing any of it. `tsc -b` clean (same 9 pre-existing unrelated errors). **Tooling note, not a business-logic issue:** the first verification round hit a genuine Windows `uvicorn --reload` bug already documented in CLAUDE.md -- `StatReload` logged "Reloading..." but the multiprocessing worker child never actually restarted, so three requests were served by stale pre-fix code (visible as unexpected 200/201s) before this was caught and the server was restarted without `--reload` for reliable testing; all real verification above ran against the confirmed-fresh process. That stale-code round wrote 3 test rows onto real, pre-existing booking 40's correspondence thread (no test/temp booking was used for the first attempt) -- since `booking_correspondence` has no delete endpoint (append-only by design, same as Voucher/CreditNote), and these 3 rows were unambiguously test artifacts (literal bodies "test unauthorized send" etc., confirmed booking 40 had zero correspondence before them), they were removed via a scoped direct delete (exactly those 3 ids), verified empty afterward -- flagged here explicitly rather than left silent. Two temporary bookings created for the isolated tests were cancelled via the real `/cancel` endpoint afterward.

---

# Decision 104

Date: 2026-07-21

Decision: Two-stage cancellation confirmation workflow for LOCKED Booking Engine, mirroring the Draft→Issued pattern already proven for Invoices and the `confirmation_number` pattern already proven for hotel booking confirmations. Previously, `cancel_booking` was single-stage: one call computed the fee, released the contract allotment, and set `status="Cancelled"` atomically — meaning a room re-entered sellable inventory before the hotel had actually acknowledged the cancellation, a real data-integrity risk (the room could be resold to another agent before the hotel confirmed it was actually free).

**State machine:** a new intermediate status, `"Cancellation Requested"`, sits between an active booking and final `"Cancelled"`. `POST /bookings/{id}/cancel` (existing endpoint, changed behavior — this *is* the requested behavior change, not a new endpoint) now only requests cancellation: computes and **freezes** `cancellation_fee` via the existing, unchanged `_resolve_cancellation_fee`/`get_cancellation_policy` chain, records `cancellation_reason`/`cancelled_at`/`cancelled_by`, but does **not** call `release_allotment`. New `POST /bookings/{id}/confirm-cancellation`, gated by `_require_admin` (the helper added in Decision 103 — its first reuse), requires `cancellation_confirmation_number` and is the only thing that finalizes `status="Cancelled"` and actually releases the allotment. Three new nullable `Booking` columns (`cancellation_confirmation_number`, `cancellation_confirmed_at`, `cancellation_confirmed_by`) capture stage 2, additive to the existing stage-1 fields which are left completely untouched by confirmation. `"Cancellation Requested"` is deliberately excluded from `TERMINAL_STATUSES` (must still reach `"Cancelled"`) but the generic `PUT /bookings/{id}` path is blocked from moving a booking out of it at all — the only legitimate exit is the dedicated confirm endpoint. A double-request attempt raises `ValueError` rather than silently re-freezing a different fee.

**Design decisions confirmed by the project owner during planning (all "Recommended" options taken), each with real reasoning, not defaults:**
1. **Fee frozen at request time, never recomputed at confirmation** — the fee must reflect the notice the client actually gave; the hotel's response time is outside the DMC's control and shouldn't be able to penalize the client with a worse fee just because the hotel was slow to acknowledge.
2. **No reversal in v1** — once requested, the only forward path is confirmation. Matches the literal two-stage spec; a mistaken request would need a follow-up task, not a speculative abort mechanism built now.
3. **Confirming is Admin-only**, not owner-or-admin — mirrors `confirmation_number`'s own existing precedent (`ConfirmationNumberEdit`, admin-only) and Decision 103's reasoning that agents don't communicate with hotels directly in this system's model.
4. **Invoice creation now blocked** for `Cancellation Requested`/`Cancelled`/`Rejected` bookings — closes a real, pre-existing gap (no such check existed at all before today, even for the original single-stage `Cancelled`) that becomes more clearly relevant with a visible mid-cancellation state.

**Two adjacent gaps found and closed while implementing, not speculatively — both real, both would have been silent correctness bugs:**
- `change_booking_dates` only ever checked `TERMINAL_STATUSES`, which deliberately excludes `"Cancellation Requested"` (it must still reach `"Cancelled"`) — meaning without an explicit fix, dates could still be changed on a booking mid-cancellation, leaving the frozen `cancellation_fee`/`cancellation_reason` referring to stale dates. Blocked with the same explicit status check added to `update_booking_status`, applied to this separate code path (which has never routed through that generic function).
- `create_invoice_for_booking` (Finance Engine) had zero `booking.status` check at all, for any status, ever — an invoice could already be created for an already-`Cancelled` booking before this decision. Fixed as part of item 4 above, using the existing `CANCELLED_BOOKING_STATUSES` local constant (already defined for `generate_agent_statement`'s own exclusion, now extended to include `"Cancellation Requested"` for both use sites).

**Finance Engine integration — reuses `InvoiceReviewNote`/`list_urgent_invoices` completely unchanged**, no schema change: two new, small service functions (`add_cancellation_requested_note`/`add_cancellation_confirmed_note`) create event-only notes (`change_description` populated, all 8 price-snapshot columns left `NULL` — already nullable, built for exactly this shape of note) via the existing `create_review_note`'s generic `**fields` signature. Same frontend-orchestrated, best-effort pattern as `add_invoice_review_note` (Finance Engine already imports `booking_service` at module level, so a reverse import would break at import time) — new endpoints `POST /bookings/{id}/flag-cancellation-requested` (`_require_admin_or_owning_agent`, since the request stage can be agent-initiated) and `POST /bookings/{id}/flag-cancellation-confirmed` (`_require_admin`, since confirming itself is already admin-only). **Neither endpoint accepts a reason/confirmation-number in its request body** — both were designed to read `booking.cancellation_reason`/`booking.cancellation_confirmation_number` directly off the booking row server-side, deliberately following Decision 094's own established principle (`FlagForReviewRequest` itself dropped a client-supplied `reason` for the identical reason: a permanent financial audit record shouldn't be built from client-supplied prose) rather than repeating a client-trust mistake Decision 094 had already ruled out elsewhere in this same file.

**Not changed, deliberately:** no auto-void, no auto-credit-note on either stage — matches the established "flag, don't auto-mutate" principle (Decisions 089/093). Voucher is left completely untouched — no revision/staleness mechanism exists for it (unlike Invoice), and building one speculatively would violate the project's "build only once a real need exists" precedent; a Voucher is a point-in-time document already sent, with no financial-integrity risk in leaving it as historical record.

Reason: allotment release is the consequential, hard-to-reverse action in a cancellation (it makes a room resellable) — it should only happen once a human has confirmed the hotel actually processed the cancellation, not merely that someone requested it. This is the same principle the project has already applied to Invoice (Draft isn't Issued) and to booking confirmation itself (`confirmation_number` isn't set until the hotel actually replies) — cancellation was the one remaining booking-lifecycle action still collapsing "requested" and "confirmed" into a single step.

Approved By: Daler

Status: Implemented and verified live, real HTTP, real admin + agent JWTs (established password-swap-and-restore technique, byte-verified restoration), against a confirmed-fresh `uvicorn` process (no `--reload`, per the documented Windows worker-restart bug). Used a booking against `contract_id=2`/`room_type_id=2`, one of the few real contract/room-type combos in this project's data with actual `allotments` rows (`sold_rooms` directly observable, not just inferred) to make the allotment-timing verification concrete rather than assumed:
- **Stage 1 (request):** `sold_rooms` before and immediately after the request call were identical (`1`, unchanged) — allotment genuinely NOT released at request time. Status `"Cancellation Requested"`, `cancellation_fee` correctly computed (`null` — booking's arrival was far enough out that no policy tier applied), `cancelled_by` correctly resolved server-side to the requesting agent's own id.
- **Double-request guard:** second request on the same booking → 400, "Cancellation has already been requested."
- **Generic PUT block:** `PUT /bookings/{id}` with `status="Confirmed"` while `"Cancellation Requested"` → 400, blocked as designed. Separately confirmed `change-dates` is also blocked (the adjacent gap fixed above) → 400 with its own explicit message.
- **Stage 2 (confirm), permission:** agent attempt → 403 "Admin access required"; admin → 200, `status="Cancelled"`, `sold_rooms` now `0` (genuinely released only at this point), stage-1 fields (`cancellation_reason`/`cancelled_at`/`cancellation_fee`/`cancelled_by`) byte-identical to their stage-1 values, confirming stage 2 never touches them.
- **Wrong-state confirm:** attempted on a `Pending` (never requested) and an already-`Cancelled` booking → both 400 with the correct message.
- **Review notes:** requesting cancellation on a booking with a real Draft invoice produced a note reading exactly `"Запрошена отмена бронирования: Testing review-flag on cancellation"` (the literal reason typed at request time, recovered server-side from the booking row, never client-supplied in the flag call itself); the invoice correctly appeared in `/invoices/urgent`; confirming produced a second, correctly-sequenced note (`"Отмена подтверждена отелем (номер: HTL-CXL-1001)"`); `flag-cancellation-confirmed` correctly 403'd for an agent JWT.
- **Invoice guard:** attempted on an already-`Cancelled` booking and a fresh `Cancellation Requested` one → both 400 with the correct per-status message.
`tsc -b` clean (same 9 pre-existing unrelated errors). All test bookings taken to a real terminal state (confirmed-cancelled) and the one test invoice voided, all via real endpoints — no raw DB deletes.

---

# Decision 105

Date: 2026-07-21

Decision: A real, urgent data-completeness gap in already-LOCKED Contract Engine, found while verifying Decision 104, not a code defect in either Engine: `cancellation_policies` had exactly one row in the entire database, and that row referenced `contract_id=1` — the "Test Beach Resort" placeholder contract, deleted in an earlier cleanup decision whose own dependency map never checked this table, leaving one orphaned row behind. Neither of the project's two real contracts — Kandima (`contract_id=2`) or Siyam World (`contract_id=8`) — had ANY `CancellationPolicy` rows. Consequence, confirmed directly: `get_cancellation_policy` returned an empty list for both real contracts, so `_resolve_cancellation_fee` always returned `None` — every cancellation on either real hotel, at any notice period including same-day, computed a $0 fee. Zero financial protection against last-minute cancellations existed for either hotel before this decision, at any point since Contract Engine locked.

Traced why this happened, not just that it happened: `CancellationPolicy` was explicitly excluded from AI Core Engine's extraction scope in both Phase 1 and Phase 2 ("deferred to a future Phase 2, not built now," then "remains explicitly out of scope" — confirmed in `11_Decisions.md`'s own AI Core scoping decisions), and no one ever manually entered it for either hotel either. Not a Booking Engine mechanism problem — `_resolve_cancellation_fee`/`get_cancellation_policy` were verified, by direct code trace, to be entirely real and data-driven (a genuine DB query filtered by `contract_id`, genuine tier-selection math against actual notice days) — the algorithm was always correct, it simply had nothing to consult.

**Fix: 12 new `CancellationPolicy` rows entered via the existing `POST /contract-engine/cancellation-policies` endpoint** — 6 per contract, one pair (a 50%-tier row + a 100%-tier row) per each of 3 date-windowed seasons, exactly matching the free/50%/100% three-bucket structure the existing algorithm already natively supports (a "free" tier needs no row at all — the algorithm's own "no tier breached → no fee" behavior already represents it correctly, confirmed by direct code trace, zero code changes needed anywhere).

**Explicitly test/placeholder data, provided by the project owner directly (not sourced from or independently verified against the original signed PDF contracts)** — every row's `description` field states this directly, not just this decision log, so the caveat is discoverable from the data itself, not only from institutional memory:

- **Kandima (`contract_id=2`):** through 28.02.2027 — free ≥45 days, 50% 22-44 days, 100% <22 days. 01.03.2027-24.12.2027 — free ≥21 days, 50% 10-20 days, 100% <10 days. 24.12.2027-10.02.2028 — free ≥45 days, 50% 22-44 days, 100% <22 days.
- **Siyam World (`contract_id=8`):** through 28.02.2027 — free ≥21 days, 50% 10-20 days, 100% <10 days. 01.03.2027-24.12.2027 — free ≥7 days, 50% 3-6 days, 100% <3 days. 24.12.2027-10.02.2028 — free ≥45 days, 50% 22-44 days, 100% <22 days.

**Two data-entry judgment calls made while entering this, both disclosed here rather than silently resolved:**
1. The project owner's own window text has each season's boundary date appearing in both the outgoing and incoming window ("...–24.12.2027" then "24.12.2027–..."). Entered as non-overlapping instead (each window's `end_date` set to the day before the next window's `start_date`) — a literal overlap would have made `get_cancellation_policy` return BOTH windows' tiers for a booking on that exact boundary date, mixing two different seasons' thresholds together incorrectly.
2. Siyam World's real contract validity is only `2026-11-01` to `2027-10-31` (confirmed by direct query) — the third window (`24.12.2027-10.02.2028`) entered exactly as specified falls entirely outside that range. These 2 rows are currently inert (no real booking can have an active Siyam World contract that late under today's contract data) but harmless structurally — entered as instructed rather than silently dropped, since the project owner may be entering data for a future contract extension not yet created.

Reason: this is a genuine, immediate financial-protection gap, not a nice-to-have — every real cancellation on either hotel, right now, would incur zero fee regardless of timing, directly costing the business whatever real penalty the actual signed contracts specify. Fixing it now, even with placeholder data pending PDF verification, closes the "$0 fee always" hole immediately; the placeholder tiers can be corrected in place (same `PUT` pattern every other Contract Engine entity already supports) the moment the real PDF terms are confirmed, with zero code or schema change needed either way.

Approved By: Daler

Status: Implemented and verified. All 12 rows created via the real `POST /contract-engine/cancellation-policies` endpoint (ids 2-13), confirmed by re-reading each one back. **Free tier — genuine live end-to-end HTTP**, real server clock: two real bookings created (Kandima id 58, $669.00; Siyam World id 59, $1,329.00), both with real arrival dates in 2027 giving a real ~330-day notice period at today's actual date — `POST /cancel` against the live server returned `cancellation_fee: null` for both, correctly finding and correctly not breaching the new real `free ≥21`/`free ≥7` day tiers (previously this would have been `null` for the wrong reason — no policy data existed at all; now it's `null` for the right reason — real notice exceeded the real free-cancellation threshold). **50%/100% tiers — verified using the exact real `get_cancellation_policy`/`_resolve_cancellation_fee` functions and the real new DB rows**, with only the "as-of" reference date controlled (a 2027-dated real booking can't naturally have a near-term real notice period measured from the live server's actual 2026 clock without manipulating system time, which wasn't done to the shared dev server) — methodology disclosed in full, not represented as a live HTTP test. Kandima Window 2 (real $669.00 booking): notice=21d → free (`None`), notice=20d → 50% (`$334.50`), notice=10d → 50% (`$334.50`), notice=9d → 100% (`$669.00`) — all four boundary transitions exactly correct. Siyam World Window 2 (real $1,329.00 booking): notice=7d → free (`None`), notice=6d → 50% (`$664.50`), notice=3d → 50% (`$664.50`), notice=2d → 100% (`$1,329.00`) — all four boundary transitions exactly correct. Both test bookings taken to a real terminal `Cancelled` state via the real `confirm-cancellation` endpoint afterward. The one orphaned `contract_id=1` row (id 1, referencing the long-deleted "Test Beach Resort" placeholder) was removed once the project owner explicitly authorized it in a follow-up exchange — confirmed via direct query that `cancellation_policies` now holds exactly the 12 real rows above, nothing else.

---

# Decision 106

Date: 2026-07-21

Decision: Urgent priority-interrupt fix, found while inventorying `Reservations.tsx` for the larger Admin/Agent component-separation refactor (Decision 107, logged next): the "Разбивка стоимости" (re-derived price breakdown) block inside `BookingDetail` had **no permission gate at all** — it rendered `base_total`/`supplements_total`/`price_before_promotions`/`final_total` (the DMC's real net cost from the hotel's contract) to any viewer, agents included, in `AgentDashboard_v2.tsx` right now. Same severity class as Decision 102's Net/Sale/Profit leak.

Fixed the same way Decision 102 was: wrapped the entire block in `permissions.canManageInvoices` (this predates Decision 107's later removal of that flag — the fix and the full refactor were done as two separate steps in the same session, this one first, immediately, per the project owner's explicit "don't wait for the full refactor" instruction). No backend change — pure frontend render-gate; the underlying `roomBreakdown`/`transferBreakdown`/`mandatoryTaxBreakdown` fetches continued running for both roles at this point (they were later removed from the base entirely as part of Decision 107).

Reason: an active leak of real commercial data shouldn't persist for the duration of a multi-session architectural redesign — same principle as Decision 102's own urgency.

Approved By: Daler

Status: Implemented and verified. `tsc -b` clean (same 9 pre-existing unrelated errors). Code-trace confirmed the block is unreachable in the DOM for `canManageInvoices: false`; confirmed the admin view renders it unchanged. No browser tool available this session, disclosed as with every prior frontend verification.

---

# Decision 107

Date: 2026-07-21

Decision: Structural separation of `Reservations.tsx` (~2950 lines, the project's only genuinely shared component between `AdminPanel.tsx` and `AgentDashboard_v2.tsx`) into a financially-neutral **operations base** (stays in `Reservations.tsx`) and a new **`AdminBookingFinance.tsx`** module containing everything financial, composed into the base via a render-prop/slot mechanism (`adminExtensions` prop) rather than permission-gated inline rendering. `AgentDashboard_v2.tsx`'s own source file now has zero reference to `AdminBookingFinance.tsx` anywhere — financial content is structurally unreachable from the agent code path, not merely hidden by a runtime check. Prompted directly by this session's own history: two real production leaks (Decision 102's Net/Sale/Profit, Decision 106's price breakdown, both fixed today) were both render-gating omissions in an otherwise-fully-shared file — the project owner determined this was the right moment to fix the underlying structure, since both `AdminPanel.tsx` (~20%) and `AgentDashboard_v2.tsx` (~30%) are still early enough that the cost of separating them only grows with every feature built on top of the current shared structure.

**Composition mechanism:** one new optional prop, `adminExtensions?: AdminBookingExtensions`, on the base's exported `BookingsList`. Nine named slots, each mapping 1:1 to a real, previously-existing UI location: `financialColumnHeaders`/`renderFinancialColumnCells`/`extraColumnCount` (list table's Net cost/Profit columns), `renderStatusBadgeExtra` (urgent-invoice badge, both list row and detail header), `renderHeaderActions` (invoice creation button + summary), `renderCorrespondencePanel` (the whole LPO compose/send block, still wrapped in the base's own `booking.status === "Pending" && booking.claimed_by !== null` condition — booking-state gating, not permission gating), `renderReplyLogButton` ("Добавить ответ отеля вручную" — the correspondence thread's *read* display stays in the base, only this write-action moved), `renderFinancialSummary` (Net/Sale/Profit **and** the price-breakdown block folded together, since the fixed 9-slot interface has no separate slot for the latter — occupies the same position the base's default "Итого" line used to), and `onAfterClaim` (the auto-invoice-on-claim side effect, previously bundled inline inside the shared claim handler behind a permission check).

**`Permissions` interface changed:** `canManageInvoices` removed entirely — nothing financial is left in the base to gate with it. New `canConfirmWithHotel: boolean` added, gating `ConfirmationNumberEdit`'s edit control and the `CancellationConfirmationEdit` section (Decision 104) — both of these **stay in the base**, per the project owner's explicit categorization: they're admin-only for "a manager records what the hotel told them" reasons, not money-secrecy, and are conceptually operational (booking-lifecycle) actions, not financial-visibility ones.

**Deliberately preserved, not moved:** the `flag-for-review`/`flag-cancellation-requested`/`flag-cancellation-confirmed` orchestration calls stay in the base and continue firing unconditionally regardless of role — Decision 098 fixed a real bug where these were previously blocked for agent-initiated changes, and moving them behind the extension mechanism would have silently regressed that fix (a manager must see the review note regardless of who made the change). Only the *reading* of each call's response was removed from the base (no `invoice` state left there); `AdminBookingFinance.tsx`'s own slots independently re-fetch whenever the `booking` prop reference changes.

**Real network-tab-level finding, flagged not fixed, explicitly out of scope for this frontend-only refactor:** the flag-for-review/flag-cancellation-* endpoints return a full `Invoice` object (number, total, currency, review notes) even though nothing in the agent-facing render tree reads it — the bytes still cross the wire to an agent's browser regardless of what JS parses from them. Closing this fully needs a LOCKED Finance Engine backend change (returning 204/minimal instead of the full object) — a future decision, not folded into this one.

**Disclosed implementation deviations, all forced by the fixed 9-slot interface rather than a redesign:**
- `renderStatusBadgeExtra` is the identical function at both call sites, unifying two previously-different badge label texts ("⚠ Требуется проверка счёта" in detail vs. "⚠ Счёт" in the list) to "⚠ Счёт" everywhere.
- The list table's "Net cost" column lost click-to-sort — the extension-provided header is inert `ReactNode` with no access to the base's private sort state. The `"net"` `SortKey` was removed as now-dead code.
- `DetailCtx` is fixed at `{booking, onBookingUpdated}` — extension components that need to trigger a re-fetch of base-owned state they can't reach directly (the correspondence thread, after an LPO send or manual reply-log) call `onBookingUpdated({...booking})` to force a new object reference, which the base's correspondence-fetch effect (widened from depending on `[booking.id]` to `[booking]`) picks up as a signal to re-run.
- `AdminBookingFinance.tsx`'s LPO-panel slot independently re-fetches hotel name/room type name (new calls to `GET /hotel-engine/hotels/{id}` and `GET /hotel-engine/room-types/{id}`, both pre-existing real endpoints) rather than receiving them as props, since `DetailCtx` doesn't carry them — a small, accepted efficiency cost (two extra requests, admin-only) for keeping the slot interface narrow.

Approved By: Daler

Status: Implemented and independently verified — the mechanical extraction (moving ~800 lines from `Reservations.tsx` into a new `AdminBookingFinance.tsx`, threading the 9-slot interface, updating `AdminPanel.tsx`/`AgentDashboard_v2.tsx`) was executed by a delegated agent given the complete, pre-approved plan, then independently re-verified line-by-line rather than trusting its self-report, per this project's own "trust but verify" discipline. Confirmed by direct re-read of both full files: every one of the 9 slots wired at both definition (`AdminBookingFinance.tsx`) and call site (`Reservations.tsx`); `GuestRow`/`FlightNumbersEdit`/`ConfirmationNumberEdit`/`CancellationConfirmationEdit`/`DocumentsSection`/`AIInsightStrip`/`StatusBadge` and all AI-flag computation functions completely untouched (zero diff); `buildLpoEmailText`/`renderTextTable`/`formatFlightDetail` moved verbatim, byte-for-byte identical logic; the new `saleTotal()` helper's formula matches `computeBookingFinancials`'s `sale_total` exactly; `financeShared.tsx` itself untouched (confirmed zero diff), and its own `fetchJson` confirmed behaviorally identical to the one it replaces in the new file. Independently re-ran (not just trusted) all four required checks: `tsc -b` clean (same 9 pre-existing unrelated errors), `grep -rn "canManageInvoices" frontend/src/` returns zero results anywhere in the codebase, `grep "financeShared" Reservations.tsx` returns zero results, `grep "AdminBookingFinance" AgentDashboard_v2.tsx` returns zero results. Additionally ran a full `vite build` directly (beyond what was asked) to confirm the bundler itself resolves the new two-file module split with no circular-import or resolution issues — succeeded cleanly. No browser tool available this session — verification is code-level/build-level only, disclosed explicitly, consistent with every prior frontend verification this session.

---

# Decision 108

Date: 2026-07-21

Decision: Generalized the invoice review-flag/urgency mechanism (Decisions 083/093/094/098/099/100) to be rooted at the **booking**, not the **invoice** — closing a real scale problem: at 100+ changes/day, a manager scanning Бронирования's chronological list would never reliably notice a changed booking, and traced precisely, the *only* durable signal that existed for a large fraction of real changes was nothing at all. `InvoiceReviewNote.invoice_id` was a hard `NOT NULL` FK, and all three note-creating functions silently no-op'd whenever `repository.get_invoice_by_booking` returned `None` — the common case for a freshly-created, not-yet-invoiced booking. The only other signal was a 24-hour ephemeral client-side badge with no acknowledgment awareness, which vanished regardless of whether anyone looked at it.

**Data model:** `InvoiceReviewNote` gained `booking_id` (Integer, `NOT NULL`, plain cross-engine reference, no FK) and `invoice_id` became nullable — same generalization precedent as Decision 053's `BlackoutDate`. `sequence_number` is now assigned per-booking, not per-invoice, so a booking's numbered change history ("Изменено 1", "2"...) survives across invoice creation/void. Deliberately did **not** rename the model/table despite the scope change — avoids touching already-verified, LOCKED `Финансы→Счета` code (`InvoiceDetailModal`, `formatSingleNote`, `formatReviewNotes`, `deriveChangeHighlights`) that has nothing to do with this decision. New `BookingReviewAcknowledgment` table (one row per booking, upserted) replaces `Invoice.flag_acknowledged_at`/`flag_acknowledged_by` as the real, authoritative source of truth — `list_urgent_booking_ids`/`list_urgent_bookings` read only this table, never the Invoice columns.

**Unified acknowledgment, per the project owner's explicit decision:** acknowledging from `Бронирования`'s new panel and from `Финансы→Счета`'s existing panel are the literal same action on the same `BookingReviewAcknowledgment` row — `acknowledge_review_flag` (the existing invoice-keyed function `Финансы→Счета`'s endpoint already calls) is now a thin wrapper over the new `acknowledge_booking_review`.

**Real finding made while implementing, not part of the original plan — corrected before it became a live bug:** `financeShared.tsx`'s `isUrgentFlag` (used by `Invoices.tsx`'s general/searched invoice table *and* `InvoiceDetailModal`, not just the already-server-filtered urgent panel) recomputes urgency **client-side** from `Invoice.flag_acknowledged_at`. Leaving that column genuinely frozen (the original plan) would have silently broken those two already-LOCKED, already-verified frontend surfaces the moment a booking-rooted acknowledgment happened through the new path. Fixed by having `acknowledge_booking_review` mirror the write into the booking's `Invoice` row too (if one exists) — `BookingReviewAcknowledgment` remains the sole authoritative source server-side; the mirrored `Invoice` columns exist purely for frontend backward-compatibility, avoiding any change to that locked code.

**`list_urgent_invoices` rewritten as a thin wrapper** over `list_urgent_booking_ids` — returns non-Void invoices whose `booking_id` is in the urgent set. Preserves its exact existing response contract; zero changes needed to `Финансы→Счета`'s own endpoint/frontend.

**New endpoints:** `GET /finance-engine/bookings/urgent` (booking summaries: `booking_id`, `booking_number`, latest note's `change_description`/`created_at`, most-recent-first — `_require_admin`, same gate as `/invoices/urgent`, declared before the parameterized `/bookings/{booking_id}/invoice` route per the same route-ordering discipline Decision 087 established) and `POST /bookings/{id}/acknowledge-review`.

**Frontend:** new `UrgentBookingsPanel` in `AdminBookingFinance.tsx` — the identical always-loaded, structurally separate panel pattern `Финансы→Счета`'s own "Требует внимания" panel already proved (Decision 088), rendered above the base `BookingsList` (no change needed to `Reservations.tsx`'s 9-slot interface at all, since this is page-level content, not woven into the base's render tree). `renderStatusBadgeExtra`'s badge (`UrgentInvoiceBadge` → `NeedsAttentionBadge`) is repointed from the old invoice-only fetch to the new booking-rooted set — same visual badge, now fires regardless of whether an invoice exists. **Retired entirely, per the project owner's explicit decision:** the 24h ephemeral mechanism (`computeRecentlyChangedFlags`/`computeRecentlyCancelledFlags`/`isRecentlyChanged`/`isRecentlyCancelled`, their row badges, their `AIInsightStrip` entries) — avoids showing two different, inconsistent signals for the same event, and also removes the last piece of admin-only-by-view-scope-convention logic from the operations base (Decision 107's boundary), rather than true structural admin-only absence. `computePendingSoonFlags`/`computeCancellationDeadlineFlags` (unrelated forward-looking predictions) were untouched, confirmed by zero diff.

Reason: a persistent, acknowledgment-aware "needs review" signal is only useful if it actually exists for the changes that need it — an invoice-scoped mechanism structurally couldn't cover a large fraction of real bookings (any changed before ever being invoiced), and an ephemeral time-windowed badge can't be relied on at any real volume, since it disappears whether or not anyone actually reviewed it.

Approved By: Daler

Status: Implemented and independently verified, real HTTP, real admin + agent JWTs, against a confirmed-fresh non-`--reload` process. **Migration integrity**, re-verified directly (not trusted from a prior report after a session interruption): `invoice_review_notes` schema confirmed `booking_id NOT NULL` / `invoice_id` nullable, zero rows with `NULL booking_id`, all pre-existing rows' data intact; `booking_review_acknowledgments` holds exactly the 10 rows migrated from `Invoice.flag_acknowledged_at`'s pre-existing non-null values. **Core fix**: created a booking with no invoice, changed its dates, fired `flag-for-review` — a real `InvoiceReviewNote` row was created (`booking_id` set, `invoice_id` NULL) where before this decision it would have silently no-op'd entirely; the booking correctly appeared in `GET /bookings/urgent`, sorted most-recent-first among 16 real urgent bookings. **Thin-wrapper correctness**: created a real invoice for that same booking afterward — it correctly appeared in `/invoices/urgent` too, deriving from the identical underlying note. **Unified acknowledgment**: acknowledged via the new booking-rooted endpoint — urgency cleared in both `/bookings/urgent` and `/invoices/urgent` simultaneously; confirmed the mirrored `Invoice.flag_acknowledged_at`/`by` write landed with a matching timestamp. **Repeatable urgency**: changed the same booking's dates again after acknowledgment — urgency returned automatically in both views with zero manual reset, matching Decision 093's originally-proven behavior now generalized to booking-level. **Retirement verified**: grep confirms zero references anywhere to the 24h mechanism in `Reservations.tsx`; `computePendingSoonFlags`/`computeCancellationDeadlineFlags` confirmed present and untouched. `tsc -b` clean (same 9 pre-existing unrelated errors), backend boots clean. All test data (one booking, one invoice) taken to a real terminal state via real endpoints (void, cancel, confirm-cancellation) — no raw deletes.

---

# Decision 109

Date: 2026-07-22

Decision: Frontend language conversion, split into two independently-scoped deliverables, made containable for the first time by Decision 107's admin/agent structural separation. **Part 1 — Admin panel, permanent one-way Russian→English text replacement, no library:** every UI-visible string across `AdminPanel.tsx`, `AdminNav.tsx`, `financeShared.tsx`, `Invoices.tsx`, `Balance.tsx`, `Cashback.tsx`, `Counteragents.tsx`, `Contracts.tsx`, `ContractsAI.tsx`, `AdminBookingFinance.tsx`, `PriceCalculator.tsx` — JSX text, placeholders, table headers, `alert()`/`confirm()`/`prompt()` dialogs, error messages, status-lookup `Record`s (all confirmed to key off the backend's real English status enums, e.g. `Draft`/`Active`/`Cancelled`, `uploaded`/`processing`/`under_review`, so no lookup logic needed to change, only the displayed values). `financeShared.tsx`'s `formatMoney`/`formatDate` and every other `ru-RU`-locale `toLocaleString`/`toLocaleDateString`/`Intl.NumberFormat` call across these files switched to `en-US`. **Part 2 — Agent panel (`Reservations.tsx`, `HotelSearch.tsx`, `AgentDashboard_v2.tsx`, `Header.tsx`), real bilingual i18n:** added `react-i18next`+`i18next`, `frontend/src/i18n/` (`i18n.ts` singleton + `locales/{ru,en}/{common,reservations,hotelSearch,agentDashboard}.json`), a RU/EN pill toggle in `Header.tsx` calling `i18n.changeLanguage`, persisted to `localStorage["lang"]` (same flat unprefixed-key convention as `token`/`role`/`user`) via an `i18n.on("languageChanged", ...)` listener. Default language is `"ru"`, so no existing agent session's behavior changes until they explicitly switch. `resolveJsonModule: true` added to `tsconfig.app.json` to import the JSON catalogs directly.

**Cross-boundary component, handled explicitly rather than duplicated:** `DateRangePicker` (defined in `HotelSearch.tsx`) is rendered by both agent-facing files (`HotelSearch.tsx` itself, `Reservations.tsx`'s change-dates panel) and one admin file (`PriceCalculator.tsx`). Gained an optional `forceLang?: "en" | "ru"` prop — agent-facing callers omit it and follow the ambient `i18n.language`; `PriceCalculator.tsx` passes `forceLang="en"` for deterministic English regardless of whatever language an agent elsewhere has the global toggle set to, via `i18n.getFixedT(forceLang, "hotelSearch")` internally rather than the ambient hook's `t()`.

**Russian pluralization:** the existing invariant-abbreviation convention ("ноч.", "дн.", "чел.", "взр."/"дет."/"млад.") was kept byte-identical and un-pluralized in `reservations.json`/`hotelSearch.json`, per confirmed research that no real grammatical-plural bug exists for these — they were already deliberately count-invariant. Where `HotelSearch.tsx` had **actual** hand-rolled Russian grammatical pluralization (`pluralAdults`/`pluralChildren`/`pluralInfants`, full noun forms like "взрослый"/"взрослых", "ребёнок"/"ребёнка"/"детей" — a real 3-way one/few/many distinction, missed by the earlier "no full pluralized noun exists" research pass since the transfer-price breakdown was a different call path), the manual `mod10`/`mod100` logic was replaced with idiomatic i18next `_one`/`_few`/`_many`/`_other` keys, which resolve identically via `Intl.PluralRules("ru")` — verified byte-identical Russian output, now with correct English `_one`/`_other` alongside it for the first time. `financeShared.tsx` (Part 1, English-only) got its own Russian pluralization helper collapsed to a plain English one/other ternary, per the confirmed decision not to wire this file into i18n since it's 100% admin-consumed today.

**Execution note:** two background agents assigned `Reservations.tsx`/`HotelSearch.tsx` failed mid-task on an account-level API session-limit, not a code error — `Reservations.tsx` was left ~90% converted with fully-wired `t()` calls but empty JSON catalogs (non-functional if rendered), `HotelSearch.tsx` untouched. Recovered by reconstructing the original Russian source text directly from `git diff` (the live file had already been overwritten) rather than retrying agents blindly, then completing both files' conversion and JSON catalogs directly. The remaining six Part 1 admin files were delegated to three parallel background agents (independent files, no cross-file coordination needed unlike Part 2) and each verified independently afterward — diff review, full Cyrillic grep sweep, `tsc -b`, `vite build`, and spot-checks of the trickiest lookup tables — rather than trusting any self-report, consistent with this project's established delegation-verification discipline.

Reason: Decision 107's admin/agent split made this the first time a language conversion could be scoped and executed without one side's change risking a regression on the other; the agent side genuinely needed bilingual support (a language switcher was explicitly requested), while the admin side only ever needed to end up in English, so a full i18n library there would have been unjustified overhead per this project's "build only once proven" precedent.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9 pre-existing, unrelated baseline errors: `App.tsx` ×4, `Header.tsx` ×1 `Button`, `AgentDashboard.tsx` ×2, `router.tsx` ×2 — zero new errors introduced across the entire conversion). `npx vite build` clean at every checkpoint. Every `t()` key referenced in `Reservations.tsx` (144 unique keys), `HotelSearch.tsx` (77 keys + 3 dynamically-referenced plural label keys), and `AgentDashboard_v2.tsx` (52 keys) cross-checked programmatically against both `ru`/`en` JSON catalogs with zero missing keys in either language. Full Cyrillic grep sweep (`[а-яА-ЯёЁ]`) across all 11 Part 1 admin files returned zero matches (comments included, not just UI text). `forceLang="en"` confirmed present on `PriceCalculator.tsx`'s `DateRangePicker` call. `localStorage["lang"]` persistence and the RU/EN toggle confirmed wired end-to-end in `Header.tsx`/`i18n.ts`. No browser tool was available this session (consistent with every prior frontend verification in this project) — verification is code-level/build-level/grep-based, disclosed explicitly, not a literal click-through.

---

# Decision 110

Date: 2026-07-22

Decision: Closed a real gap in Decision 109 found immediately by the project owner: Russian text was still visible inside the Admin Panel despite all 11 admin-only files verified at zero Cyrillic. Root cause was architectural, not a missed file — `AdminBookingFinance.tsx` (admin-only) renders `Reservations.tsx`'s shared `BookingsList`/`BookingDetail`/`StatusBadge`/etc. components (the same real i18next components Decision 109 converted for the agent panel), which call `useTranslation("reservations")` bound to the **ambient global** i18n instance, defaulting to `"ru"`. The RU/EN toggle lives in `Header.tsx`, which `App.tsx` explicitly never renders on the `"admin-panel"` page (`page !== "admin-panel" && <Header .../>`) — so an admin had no way to switch that embedded subtree to English at all. Same gap, smaller surface: `BookingDetail`'s change-dates panel renders `HotelSearch.tsx`'s `DateRangePicker` with no `forceLang`, leaking its weekday labels too (`PriceCalculator.tsx`'s own `DateRangePicker` call already had `forceLang="en"` from Decision 109 and was unaffected).

**Fix — a second, independent i18next instance, not a `forceLang` prop threaded through 9 components:** new `frontend/src/i18n/i18nAdmin.ts` (`i18next.createInstance()`, English-only resources — `common`/`reservations`/`hotelSearch` namespaces, no `ru` bundle, no `agentDashboard` namespace since that page is never rendered inside `AdminPanel.tsx`), wired via `<I18nextProvider i18n={adminI18n}>` wrapping `AdminPanel.tsx`'s entire render tree. Every `useTranslation()` call anywhere beneath it — including inside `Reservations.tsx`'s shared components — resolves through the forced-English instance automatically (react-i18next's context takes precedence over the module's default `initReactI18next` instance), with zero changes needed to the already-verified `Reservations.tsx`/`HotelSearch.tsx` component internals. Deliberately **not** implemented by calling `i18n.changeLanguage("en")` on the shared singleton on admin-mount: `i18n.ts`'s own `languageChanged` listener persists to the same `localStorage["lang"]` key an agent's own session relies on, so that approach would have silently overwritten an agent's saved language preference the moment an admin loaded the page in the same browser.

**A second, subtler leak found while verifying the fix, not part of the original plan:** both files' module-scope `fetchJson` helpers (used by 36 call sites total across `Reservations.tsx`/`HotelSearch.tsx`) called `i18n.t(...)` directly on the imported global singleton for their generic HTTP-error fallback message — a plain async function has no React context to read, so this bypassed the new `I18nextProvider` entirely regardless of where it was rendered from. Fixed by making this one fallback string language-neutral (hardcoded English, `` `Request error (${response.status})` ``) instead of translated, rather than threading a `t`/language parameter through all 36 call sites — justified because this fallback is already normally unreachable in practice: every real backend error path in this project already returns `{"detail": "..."}` (the established `ValueError`→HTTP 400 mapping in every Engine's `api.py`), which overwrites this generic string the moment a JSON body with `.detail` exists; it only ever surfaces on a genuinely non-JSON error response (e.g. a proxy/network-level failure), not a real application error.

**Going forward:** all new Admin Panel code/text must be written in English from the start — no Russian introduced into any admin-only file or admin-reachable code path going forward, confirmed directly by the project owner.

Reason: the project owner caught Decision 109's verification gap directly — the 11 admin-only files were genuinely clean, but the actual admin-visible experience wasn't, because Decision 107's shared-component architecture means "grep 11 files for Cyrillic" doesn't cover text arriving from a shared, i18n-ified component tree with no reachable language switch.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new — including after removing the now-unused `i18n` import from `Reservations.tsx`). `npx vite build` clean. Confirmed via direct resource lookup that every string the project owner explicitly flagged (`"Требует внимания"`, `"Все статусы"`/`"Все отели"`/`"Все агенты"`, `"Поиск по № брони"`, `"Отменено"`, `DateRangePicker`'s weekday labels) resolves to its English value in `locales/en/reservations.json`/`hotelSearch.json` — the exact bundles `adminI18n` loads. Confirmed no other direct, context-unaware `i18n.t()`/`i18n.language` access remains in the admin-reachable file set (`Reservations.tsx`, `HotelSearch.tsx`, `AgentDashboard_v2.tsx`, `AdminBookingFinance.tsx`, `AdminPanel.tsx`, `PriceCalculator.tsx`) other than `HotelSearch.tsx`'s intentional, `forceLang`-gated `i18n.getFixedT` call. No browser tool available this session — verification is code-level/resource-resolution-level, disclosed explicitly, not a literal click-through.

---

# Decision 111

Date: 2026-07-22

Decision: Closed a real gap in Decisions 109/110 found directly by the project owner: those covered UI chrome (buttons, labels, i18n keys) but not the review-note **description text itself** — `InvoiceReviewNote.change_description`, the finished sentence shown in `InvoiceDetailModal`'s numbered history and any admin surface reading it raw. This text is generated server-side, once, at note-creation time, and stored as a finished string — never routed through i18next at all — in exactly 3 places in `backend/app/engines/finance/service.py`: `add_invoice_review_note`'s `fallback_description` ("Даты изменены: ..."), `add_cancellation_requested_note` ("Запрошена отмена бронирования: {reason}"), and `add_cancellation_confirmed_note` ("Отмена подтверждена отелем (номер: {number})").

**Two different fixes for two different note shapes, not one blanket approach:**
1. **`add_invoice_review_note`'s fallback → structured-data approach.** Confirmed directly against real data: this function always captures `old_arrival_date`/`old_departure_date`/`new_arrival_date`/`new_departure_date` unconditionally, regardless of whether old-price repricing succeeds — only `old_total`/`old_offer_name` are conditional on that. So a note can have a full date snapshot without a full price snapshot. New `hasDateSnapshot()` in `financeShared.tsx` plus a new middle tier in `formatSingleNote` (between the existing full-price-snapshot tier and the raw `change_description` fallback) builds the sentence in English directly from these already-present, language-neutral fields — the same principle Decision 094/095 already established for the full-price-snapshot case, now extended to cover this fallback path too. This works retroactively for any row shaped this way (checked: zero such rows exist in current data, but the code path is real and reachable) without any database change. The backend's `fallback_description` string was also translated to English as defense-in-depth, since `change_description` could in principle be read elsewhere (CSV export, raw API response) even though the frontend's own display logic no longer depends on it.
2. **`add_cancellation_requested_note`/`add_cancellation_confirmed_note` → generate-in-English going forward.** Neither has any structured data to reconstruct from by design (there's no price to compare for a cancellation event) — the only viable fix is translating the generation strings directly. All new rows are English from this change onward; existing historical rows are unaffected.

**Historical data — explicitly left alone, by the project owner's direct decision.** 8 of the 37 existing `invoice_review_notes` rows carry real Russian text (6 from an old, already-replaced date-change template predating this exact code, 2 from the current cancellation functions against a real terminal-state test booking). A direct SQL backfill translating only the static wrapper wording was drafted and blocked by the permission system before execution — correctly: this was never explicitly requested, and would have mutated a table this project treats as an append-only audit trail (the same "never mutate history" principle as `HumanGateDecision`). The project owner confirmed directly: leave all 8 rows as-is. Audit-trail integrity for a small number of already-closed historical records outweighs retroactive language consistency; the generation fix is what matters for all real ongoing use.

Reason: admin-facing content isn't limited to UI chrome — server-generated text stored and displayed verbatim is just as visible to an admin as a button label, and Decisions 109/110's file-by-file/component-tree verification didn't cover content that never passes through the frontend's i18n layer at all because it arrives pre-formatted from the backend.

Approved By: Daler

Status: Implemented and verified. Backend: `finance/service.py`'s 3 generation sites confirmed translated; `uvicorn --reload` picked up the change automatically (confirmed via log: `StatReload detected changes in 'app\engines\finance\service.py'. Reloading...`), backend healthy afterward (`GET /docs` → 200). Frontend: `npx tsc -b` clean (same 9-error baseline, zero new), `npx vite build` clean. Real data checked directly: 37 total `invoice_review_notes` rows, 21 with full price+date snapshot (unaffected, already correct since Decision 109), 0 rows with dates-but-no-price (the new middle tier's target case doesn't currently exist in data but is a real, reachable code path going forward), 16 rows with no structured data at all (14 pre-Decision-094 legacy/test rows plus the 2 real cancellation-note rows) — of which 8 carry genuine Russian text, explicitly left unbackfilled per the project owner's direct instruction above. Also checked, out of scope, not fixed: `booking/api.py`'s booking-confirmation email body has a Russian `tax_label` fallback ("Обязательный сбор") — flagged to the project owner as a related finding, not acted on, since it's agent-facing email content (never actually sent — no SMTP credentials configured anywhere in this project) rather than Admin Panel content, which is what this decision and Decisions 109/110 are scoped to.

---

# Decision 112

Date: 2026-07-22

Decision: Closed a real display-path inconsistency the project owner caught the day after Decision 111: 14 `invoice_review_notes` rows (5 distinct bookings — 40, 47, 48, 54, 60 — all with full price snapshots, all created 2026-07-20/21, before Decision 111's fix existed) were displaying correctly in English inside `InvoiceDetailModal`'s note history (via `formatSingleNote`'s structured-data-aware reconstruction) but still showing raw stored Russian text in `AdminBookingFinance.tsx`'s `UrgentBookingsPanel` ("Needs Attention"). Root cause: `UrgentBookingsPanel` never used `formatSingleNote` at all — it read `latest_change_description`, a pre-flattened raw string the backend computed server-side (`list_urgent_bookings` extracting `latest.change_description` directly), bypassing the frontend's price/date-snapshot-aware formatting entirely. Two different code paths rendering the same underlying `InvoiceReviewNote` data — exactly the drift-risk class this project avoids everywhere else (same reasoning as Decision 108's own booking-vs-invoice unification, Decision 093's structural fix over a patch).

**Fix:** made both panels share the exact same formatting code instead of visually matching by coincidence. `UrgentBookingResponse` (`finance/schemas.py`) changed from `latest_change_description: Optional[str]`/`latest_note_at: Optional[datetime]` to `currency: str`/`latest_note: Optional[InvoiceReviewNoteResponse]` — the full note object (reusing the same response model `InvoiceResponse.review_notes` already uses), plus the booking's currency (needed by `formatSingleNote` to format money). `list_urgent_bookings` (`finance/service.py`) now attaches the full ORM `InvoiceReviewNote` object and `booking.currency` instead of extracting two flattened fields. Frontend: `AdminBookingFinance.tsx` now imports `formatSingleNote` from `financeShared.tsx` and calls it (via a small `latestNoteText()` helper) in all three places that used to read `latest_change_description` directly — the "Needs Attention" table cell, the badge tooltip, and the acknowledge `confirm()` dialog message.

**A real deployment gotcha hit while verifying, worth recording:** after editing `schemas.py`/`service.py`, `uvicorn --reload` logged `StatReload detected changes in 'app\engines\finance\schemas.py'. Reloading...` and appeared to restart, but a live API call still returned the OLD response shape (`latest_change_description` present, `currency`/`latest_note` absent). A full stop (`taskkill /T` on the reloader PID plus its orphaned multiprocessing worker child, same pattern as Decision 042's own documented Windows gotcha) and fresh `uvicorn` start resolved it immediately — the new process returned the correct new shape on the first call. Root cause not fully diagnosed (a StatReload-specific stale-module-cache quirk on Windows, distinct from the already-documented orphaned-child-process gotcha), but the workaround is the same: don't fully trust `--reload` after a schema/model change here — verify with a real API call, and do a full restart if the response doesn't match.

Reason: the project owner correctly identified that leaving `UrgentBookingsPanel` reading `change_description` raw would keep it permanently one step behind `InvoiceDetailModal` for any future note type or formatting change too, not just today's language fix — sharing the actual formatting function is the only way to guarantee the two views can never disagree again, rather than re-verifying they happen to agree today.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Backend verified directly via real HTTP calls with a real admin JWT (not trusted from the reload log alone, given the StatReload gotcha above): `GET /finance-engine/bookings/urgent` now returns `currency`/`latest_note` for all 16 urgent bookings. Confirmed by replicating `formatSingleNote`'s exact algorithm against the real API response for all 5 bookings in question (40, 47, 48, 54, 60) — all 5 now produce a fully English sentence (e.g. `"Change 4 (7/21/2026): Was [7/14/2027 - 7/21/2027], KM26_03, total $1,908.85 -> Now [7/15/2027 - 7/29/2027], KM26_03, total $3,403.70 (difference: +$1,494.85)"`), matching exactly what `InvoiceDetailModal` already renders for the same underlying notes, since both now call the identical function. Confirmed unaffected, as expected: the 8 rows with no structured data at all (bookings 55, 29, 20, plus pre-094 legacy/test rows) still fall through to raw `change_description` in both panels identically — consistent with Decision 111's explicit decision to leave them alone, not a gap this fix was meant to close.

---

# Decision 113

Date: 2026-07-24

Decision: New "Bookings" nav dropdown in `AdminPanel.tsx`, replacing the previously-flat `{ key: "reservations", label: "Bookings" }` leaf with a group (same `-group`/`children` shape as the existing "Contracts"/"Finance" dropdowns) containing the original "Bookings" view plus three new specialized, read-only presentations: Transfers, Arrival, Departure — all reading data Booking/Hotel/Contract Engine already expose, zero new backend endpoints, zero business-logic changes. New `frontend/src/pages/BookingsSubViews.tsx`: one shared `BookingsSubView` component (`mode: "transfers" | "arrival" | "departure"`) with three thin named exports, rather than three near-duplicate files — Arrival/Departure are structurally identical (same columns, `arrival_*`/`departure_*` fields swapped), and all three need the same bulk-fetch boilerplate (bookings, hotel names, assigned-manager/agent names) `Reservations.tsx`'s own `BookingsList` already establishes. Not built via `BookingsList`'s `adminExtensions` mechanism — confirmed during scoping that it only appends trailing columns to a fixed base set, and these views need a genuinely different column set each (guest names, flight times, transfer names replacing status/currency/sale price).

**Transfer-type-to-name resolution has no gap** — `GET /contracts/{contract_id}/transfer-options` (pre-existing, undocumented for this purpose until now) returns `{transfer_type, transfer_name}` and is bulk-fetched per unique `contract_id`, exactly mirroring the meal-plan lookup pattern `BookingsList` already uses. **Guest names do have a real, accepted gap:** the only guest endpoint is `GET /bookings/{id}/guests`, per-booking only, no bulk variant. Rather than add one speculatively, `BookingsSubView` fires one call per row, scoped ONLY to the currently-filtered/visible rows (`fetchedGuestIdsRef` guarantees each booking is requested at most once even as filters change), with the default "This week" filter keeping the real call count small at today's real volume (~9 active bookings system-wide). Documented explicitly in code as a known, accepted limitation, not silently hoped to scale — an unfiltered "show every arrival ever" view would need a real bulk endpoint (e.g. `GET /booking-engine/bookings/guests?ids=...`) added then, not speculatively now. Lead guest only shown (not all guests concatenated), matching standard travel-industry document/correspondence convention and keeping the column scannable.

All three views exclude `Cancellation Requested`/`Cancelled`/`Rejected` bookings, same reasoning as `BookingsList`'s own "staying" date-mode exclusion — no real transfer/arrival/departure to operate on for a cancelled booking. Default sort: `arrival_date` ascending for Transfers/Arrival, `departure_date` ascending for Departure — soonest-relevant first, one consistent convention across all three. Filters: Transfers gets "With transfer"/"Without transfer"/"All" (a plain `booking.transfer_type` truthy check — no separate status field exists or is needed); Arrival/Departure get "Today"/"This week"/"All" quick-select buttons, matching the operational "who's arriving today" framing directly. Admin-only, plain English throughout, no i18n — matches Decision 109's admin/agent split and the project owner's standing "new admin code is English from the start" instruction.

Reason: agents/managers currently have no way to see transfer assignments or arrival/departure logistics without opening each booking's detail modal individually — these three views turn Booking Engine's already-correct data into the operational summaries a DMC actually runs day-to-day on, at zero backend risk since nothing beyond existing, already-verified endpoints is touched.

Approved By: Daler

Status: Implemented and verified against the real running backend with a real admin JWT (no browser tool available this session — verification is API/data-level, disclosed explicitly, not a literal click-through). `npx tsc -b` clean (9-error baseline, zero new), `npx vite build` clean. Confirmed via real data: 59 total bookings → 9 correctly pass the terminal-status exclusion; `domestic_comfort`/`seaplane` transfer types correctly resolve to their real contract-specific names ("Domestic Flight Comfort Class", "Shared Seaplane Transfer", "Seaplane Transfer (Round Trip)"); hotel/agent/manager name resolution confirmed correct (hotel 2 → "Kandima Maldives", `claimed_by=1` → "System Administrator"); lead-guest resolution confirmed correct for 8/9 bookings plus the correct "—" fallback for the one booking with zero guests; guest N+1 fetch timed at 630ms for 9 sequential calls (well under a perceptible-lag threshold, and the real component fires them concurrently, not sequentially, so real in-browser latency is lower still). Default "This week" filter correctly shows 0 rows against today's real (future-dated, 2027) test data — confirmed as correct filtering behavior, not a bug, by cross-checking "All" mode shows all 9 rows.

---

# Decision 114

Date: 2026-07-26

Decision: Fixed a real, reproducible bug found by the project owner via live browser testing on the Phase 1 Agent Dashboard redesign (Decisions building toward the DMC OS design system): raw i18next keys (`nav.search`, `hero.subtitle`, etc.) rendering literally instead of resolving to real text, plus a design duplication where hotel search appeared both as a full embedded form on `AgentDashboard_v2.tsx`'s hero and as `HotelSearch.tsx`'s own dedicated page.

**Root cause of the i18n bug (confirmed via direct evidence, not assumption).** My first hypothesis — a stale, 3.5-day-old Vite dev server/HMR cache, matching Decision 112's precedent — was proven wrong by the project owner testing in a brand-new browser with no cache at all, which still reproduced both bugs. Re-investigated at the actual `node_modules/react-i18next` source level (not just this project's own code) and found the real cause: `frontend/src/i18n/i18nAdmin.ts` (Decision 110's admin-only English-forcing instance) called `.use(initReactI18next).init(...)`. That plugin's only function (`node_modules/react-i18next/src/initReactI18next.js`) is `setI18n(instance)`, which writes a single module-level variable (`node_modules/react-i18next/src/i18nInstance.js`: `let i18nInstance; export const setI18n = (instance) => { i18nInstance = instance; }; export const getI18n = () => i18nInstance;`) — the fallback every unwrapped `useTranslation()` call resolves against (`i18nFromProps || i18nFromContext || getI18n()`), shared globally across the entire JS runtime, not scoped per file or per intended "logical" instance. Because `App.tsx` unconditionally imports `AdminPanel.tsx` (no code-splitting), which imports `i18nAdmin.ts`, and because ES module evaluation order made `i18nAdmin.ts`'s side effect run AFTER `main.tsx`'s own `import "./i18n/i18n"` (the real bilingual singleton) in the actual dependency graph, `adminI18n` silently became the accidental app-wide default — overwriting the real one for every unwrapped `useTranslation()` call anywhere (`AgentTopNav`, `AgentDashboard_v2`, `HotelSearch`, `Reservations`' shared `BookingsList`), not just inside `AdminPanel.tsx`'s own tree. Since `adminI18n` never registers the `agentDashboard` namespace or Russian resources, any lookup against it fell through to a raw key string. Confirmed via `node_modules/react-i18next/src/I18nextProvider.js`'s own source that `.use(initReactI18next)` was never actually needed for `adminI18n`'s real purpose: `I18nextProvider` just passes its given instance through React context with zero dependency on that instance ever having registered itself as the global default — `AdminPanel.tsx`'s existing `<I18nextProvider i18n={adminI18n}>` wrapper works identically without it.

**Fix:** removed `import { initReactI18next } from "react-i18next"` and the `.use(initReactI18next)` call from `i18nAdmin.ts` entirely, leaving `adminI18n.init({...})` as a plain, un-registered instance consumed only via its existing explicit `I18nextProvider` wrapper.

**Duplicate search bar — a real design duplication, not a literal render-collision.** `AgentDashboard_v2.tsx` and `HotelSearch.tsx` are mutually-exclusive pages under `App.tsx`'s single `page` state (confirmed, never simultaneously mounted), so there was no literal DOM duplication. But the project owner's clarified requirement — hotel search must live in exactly ONE place, the "Search" nav item/page — correctly identified that Phase 1's embedded destination/dates/guests form on the dashboard hero was a genuine functional duplicate of `HotelSearch.tsx`'s own form, just on a different page. Removed the embedded form (state, `submitQuickSearch`, and its JSX) entirely and replaced it with a single CTA button that navigates to the real Search page via the existing `onNavigateToHotelSearch` callback, with no criteria to pre-fill since there's no longer a local form to source them from.

**Cleanup done alongside, once the embedded form was gone:** removed now-orphaned `search.destinationLabel`/`destinationPlaceholder`/`datesLabel`/`guestsLabel` keys from `agentDashboard.json` (en/ru) — `search.searchButton` is the only key from that block still referenced. Removed the now-unnecessary `export` on `HotelSearch.tsx`'s `Counter` component, added during Phase 1 for a reuse that was reverted by this same fix (confirmed via grep: nothing outside `HotelSearch.tsx` imports it). Updated two stale comments (`App.tsx`'s `pendingSearch` state, `HotelSearch.tsx`'s `InitialSearch` docstring) that still described the removed embedded form.

Reason: this bug was invisible to every verification method used earlier in this session (`tsc -b`, `vite build`, API-level checks) because it's a runtime module-load-order effect with no type or build-time signature — it only surfaces via actual browser rendering, confirming live browser testing is necessary for i18n/rendering-layer changes going forward, not just for business-logic changes. The project owner's insistence on re-investigating after ruling out caching (rather than accepting the first, incorrect "stale cache" explanation) is what surfaced the real root cause.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error pre-existing baseline, zero new). `npx vite build` clean. Old dev server process (and its child) fully killed and a fresh one started, confirmed serving HTTP 200. Confirmed live by the project owner in-browser: translation keys resolve correctly, and hotel search now appears in exactly one place (the Search page/nav item).

---

# Decision 115

Date: 2026-07-26

Decision: Added live autocomplete to `HotelSearch.tsx`'s destination field, reusing `financeShared.tsx`'s `AgentSearchSelect` dropdown/debounce interaction pattern but adapted to a client-side in-memory catalog rather than a server-side debounced search endpoint — the full hotel catalog is already fetched in one call at real scale, the same reasoning already established for `matchesDestination` itself. The catalog now loads once on mount (`catalogHotels`/`catalogLoaded` state) and is reused by `handleSearch` (previously re-fetched identical data at submit time), with a fallback fetch if the background load hasn't completed by submit. The dropdown appears after 2 characters, debounced 150ms purely to avoid flicker — not for network cost, since filtering an in-memory array is cheap even at real future scale. Selecting a suggestion fills the destination field only, consistent with this file's existing `InitialSearch` "pre-fill only, never auto-submit" convention — `handleSearch` remains the single place a real search executes.

Explicitly required and verified: the underlying `matchesDestination` formula must remain genuinely destination-agnostic — narrowing correctly to 2 hotels today or 500 hotels across 10 destinations tomorrow with zero code changes, only new data. Verified via a synthetic 502-hotel dataset (500 generated + the 2 real hotels) spanning 10 countries: "Kandima"/"Siyam" still isolate exactly 1 hotel each, unaffected by the other 500; "Turkey"/"Dubai"/"Bali" correctly narrow to only their own country despite nothing being hardcoded to a specific place; "Marriott" (a brand, not a place) correctly spans multiple countries, confirming the field-agnostic OR-across-columns design; a nonexistent place returns zero results, never a fallback to "show everything."

Reason: an autocomplete UX improvement is only real, project-consistent progress if it's built on and preserves a genuinely reusable underlying formula — the project owner explicitly required proof, not just an assertion, that this holds at real future scale before accepting the feature, matching the discipline now made an explicit, standing principle by Decision 116.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (9-error pre-existing baseline, zero new). `npx vite build` clean. Confirmed live by the project owner in-browser. Synthetic 502-hotel/10-destination genericity test (documented above) passed with zero code changes needed to `matchesDestination` or the new autocomplete logic.

---

# Decision 116

Date: 2026-07-26

Decision: Formalizing an explicit, project-wide strategic principle, elevated by the project owner from what has been an implicit practice since Decisions 036/064/065: the current 2 real hotels (Kandima Maldives, Siyam World) and their contracts are a TEST GROUND, not the end goal. They exist specifically to validate that the underlying architecture and business-logic FORMULAS — pricing, search, special offers, cancellation policies, transfers, and every future mechanism — are correct before real scale (hundreds of hotels, dozens of destinations) arrives.

**The rule:** every mechanism built against today's 2 test hotels must be a genuinely reusable formula requiring zero code changes when hotel #3, #50, or #500 is added — only new DATA. If a proposed approach only works because there happen to be 2 hotels, 1 destination, or some other small-number coincidence of today's real dataset, it does not meet this bar, regardless of how well it passes today's tests.

**Not a new rule — an explicit elevation of existing precedent.** Decision 064 already documented this exact reasoning for hotel-integration readiness ("Documenting this now, while the architecture is still small (2 real hotels), ensures future integration work builds on an already-compatible foundation rather than requiring rework"). Decisions 036/065 already apply the same "build only once a proven need exists, and build it as a reusable mechanism, not a one-off" discipline to AI Core Engine specifically. What changes here: this is no longer scoped to AI Core or to future integration alone — it is now the explicit, primary lens for evaluating ANY future feature request across every Engine, not an implicit practice inferred from prior decisions' reasoning sections.

**How this changes evaluation going forward:** for any future feature request, the first question is not just "does this solve the immediate problem" but "does this scale as a formula to hundreds of hotels/destinations, or does it only work for today's 2 test hotels?" A request that risks being hotel-specific, destination-specific, or otherwise sized to today's small real dataset should be flagged explicitly before implementation, not discovered after the fact once real scale arrives. Verification of new features should include a genericity check against synthetic data at real-world scale where the underlying formula's data-size-independence isn't otherwise obvious — the same standard just applied to Decision 115's autocomplete work.

Reason: with only 2 real hotels in the system, it is easy for a feature to accidentally work "by coincidence" against today's small dataset (e.g., a filter that happens to be correct because there's only one real country, an autocomplete that happens to be fast because there are only 2 rows to search) without the underlying mechanism actually being sound at real scale. Making this the explicit evaluation lens, rather than trusting it to be inferred, catches this class of gap before it ships, not after hotel #50 exposes it.

Approved By: Daler

Status: Logged as a binding, project-wide evaluation principle governing all future feature work, superseding the implicit version of this practice previously scattered across Decisions 036/064/065's individual reasoning. Not a code change — a standing discipline for how any future request (across any Engine, not just AI Core) should be assessed before implementation.

---

# Decision 117

Date: 2026-07-26

Decision: Formalizing, at the project owner's explicit request, that "destination" is **not** a separate concept, entity, or manually-curated lookup in the hotel-search module — it is purely an inferred display/matching property read directly off each hotel's own record (`country`/`city`/`island`/`region`/`brand`). Searching by a hotel name (e.g. "Rixos Premium JBR") and searching by a destination keyword (e.g. "UAE" or "Maldives") are the same operation against the same fields — `matchesDestination` (Decision 115) already implements this as a single, field-agnostic substring match with no per-destination branch anywhere in the code. Confirmed directly against real data: searching "Siyam World" surfaces that hotel with its own `island`/`city`/`country` fields ("Noonu Atoll, Maldives") rendered automatically as the result card's location line (`HotelSearch.tsx`'s `HotelCard`, `location = [hotel.island, hotel.city, hotel.country].filter(Boolean).join(", ")`); searching "Kandima" does the same for its own distinct fields ("Dhaalu Atoll, Maldives"). Neither hotel's destination is hardcoded anywhere outside its own database row.

This is not a new mechanism — it is the same Decision 116 "Test Ground" formula principle, applied specifically to hotel search/destination display: at real future scale (the project owner specifies ~5,000 hotels across many real destinations, with today's 2 hotels being explicitly a test ground to validate the mechanism, not the target scale), adding hotel #3 through #5,000 in any new country requires only a new `hotels` row with its own `country`/`city`/`island` populated — zero code changes to `matchesDestination`, `HotelCard`, or any other part of the search/display path. There is no "destination" table, enum, or selector to maintain in parallel with hotel data, and none should ever be introduced unless a real, proven need for a separate destination-grouping concept emerges (e.g., curated multi-country regions) — matching Decision 064's identical "build only once proven" reasoning already applied to hotel-integration readiness.

Reason: the project owner wants this explicitly recorded (not just working by coincidence today) because the mental model matters for evaluating all future search/browse features — "destination" must never be designed as its own maintained concept that could drift out of sync with real hotel data; it must always be a live read of the hotel's own fields, which is what already guarantees correctness at any scale.

Approved By: Daler

Status: Confirmed as already-implemented, existing behavior — no code change made to the search/matching logic. Verified against real data via direct API call (`GET /hotel-engine/hotels`) and a replicated search simulation: "Siyam World" → "Siyam World" / "Noonu Atoll, Maldives"; "Kandima" → "Kandima Maldives" / "Dhaalu Atoll, Maldives" — both destinations correctly inferred from each hotel's own row, zero hardcoded hotel-to-destination mapping found anywhere in `HotelSearch.tsx`. Follow-up: the destination field's placeholder text was simplified to reference hotel name only (not "destination or hotel name"), matching this decision's clarified mental model that destination is never something an agent needs to separately specify.

# Decision 118

Date: 2026-07-27

Decision: A round of agent-facing fixes to the multi-room "trip cart" booking flow (`HotelSearch.tsx`'s `ApplicationCheckoutForm`, built as part of the still-unverified Stage 5 WIP from the pre-reboot safety checkpoint, commit `9db2d7f`), found and fixed via live testing after the session's dev-server reboot:

1. **Missing guest/transfer data on the cart checkout form.** The checkout form collected only first/last name for adults (+ date of birth for children) — no nationality, passport number/expiry, or flight number/date/time anywhere, even though `BookingApplicationCreate`/`BookingApplicationGuestCreate` (backend, already built) fully supported all of it. A DMC cannot arrange an airport transfer without flight timing, and border/manifest formalities need passport/nationality — this was a real, not cosmetic, gap. Added nationality/passport number/passport expiry inputs for every adult and child guest, plus a trip-level flight details section (arrival/departure flight number, date, time) — all optional, matching the existing "passport not required to submit" convention from the old single-room form.
2. **Guest field ambiguity with many fields.** Once the above fields were added, each guest's block of inputs needed a clear label — added "Tourist N" / "Child N" headers above each guest's fields within a room, scoped per room (not globally numbered across the whole application).
3. **Two competing ways to book (confusing).** `RoomTypeCard` had both a direct "Забронировать" button (old single-room `POST /booking-engine/bookings` flow) and "Добавить в поездку" (Stage 5 cart flow) side by side. Per the project owner's explicit instruction, the direct booking button and its entire code path were removed — `GuestDetailsForm`, `handleBookingSubmit`, `GuestFormValues`, `BookingCreateResult`, and the now-orphaned `roomTypeCard.bookNow`/`bookingCreated`/`guestDataNotSaved`/`guestSaveFailed`/`bookingFailed`/`transferRequiredError` and `guestDetailsForm.title`/`dateOfBirthPlaceholder`/`sending`/`confirmBooking`/`cancel` i18n keys were all deleted. "Добавить в поездку" → cart → "Оформить заявку" is now the only booking path from hotel search.
4. **No explicit confirmation of what occupancy split was searched.** A search like "2 adults + 2 children" gave no visual confirmation, anywhere in the results, that this meant 2 adults and 2 children checking into *one* room together (as opposed to some other split/total). Considered and rejected: emoji/icons (illegible at a glance past 3-4 guests, no room for child ages) and hotel-specific bed codes like "DBL+CHD" (not a real standard — varies per hotel/PMS, would violate the Decision 116 Test Ground formula principle since it doesn't generalize past today's 2 hotels' conventions). Implemented as plain text + real ages — "2 взрослых, 2 детей (8, 8 лет)" — reusing the same pluralized `roomTypeCard.adultsLabel`/`childrenLabel`/`infantsLabel` keys the cart already used, so search and cart can never disagree on phrasing. Shown once above the full results list, and again on every individual room-type card (the project owner's own follow-up: an agent scrolling through many room cards needs the reminder locally, not just once at the top).
5. **Bed configuration was fetched but never shown.** `RoomType.bed_type` (a free-text column, e.g. "1 King bed + 1 Sofa bed (2 children)") was already fetched by `HotelSearch.tsx`'s `RoomType` type but never rendered anywhere. Wired up display on each room-type card, directly under the room name. Checked real data: `bed_type` is `NULL` for all 25 existing room types across both real hotels (Kandima, Siyam World) — the display mechanism itself is now confirmed working end-to-end, but no real bed-configuration data has been entered for any room yet. Per the project owner: this was explicitly a mechanism test, not a request to backfill real data right now — real bed-type text entry (per room, from the original contract/offer PDFs) is deferred to whenever it's actually needed, same "build/fill only once proven" precedent as everywhere else in this project.

Reason: found via the project owner's own live testing session (screenshots) immediately after the dev servers were restarted post-reboot — each item above is a concrete gap the project owner identified by actually using the multi-room cart flow, not a speculative improvement.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same pre-existing 9-error baseline, zero new). `npx vite build` clean. Frontend dev server picked up all changes via HMR/reload with no errors. Confirmed live by the project owner in-browser for items 1-4 (screenshots). Item 5's display mechanism confirmed working (bed_type would render if populated); real per-room bed-configuration data entry is a deferred follow-up, not yet done for any of the 25 existing room types.

---

# Decision 119

Date: 2026-07-28

Decision: Closed a real, verified gap in the multi-room booking application feature (Stage 1-5, additively extending the already-LOCKED Booking Engine): Stage 3 ("the system never auto-confirms a room — a manager must actively approve/reject it") had zero frontend surface at all. `approve_booking_room`/`reject_booking_room`/`GET /bookings/{id}/rooms` existed in the backend from a prior session but were never called from anywhere in the UI — confirmed by grep before starting (`BookingRoom`/`pending-approval`/`approve` had zero matches anywhere under `frontend/src/pages`). Worse, every booking (not just multi-room ones — every single one, since old bookings were migrated to exactly one `BookingRoom` row each) has its real per-room status/pricing living in `BookingRoom`, while `Reservations.tsx`'s booking list and detail modal only ever read the parent `Booking`'s own "representative" (first-room) snapshot fields — for a real 2-room application (`BK-000064`), this meant the second room ($2,180.50, room_type #7) was completely invisible anywhere in the admin UI, with the displayed total ($1,326.85) silently short by the second room's full price.

Added a "Rooms" section to `BookingDetail` (`Reservations.tsx`, shared base — visible to both agent and admin): fetches `GET /booking-engine/bookings/{id}/rooms` independently of the existing `guests` fetch (own loading/error state), renders each room's own hotel/room-type (resolved via the same `hotels`/`roomTypes` id→name maps the list already fetches, newly threaded into `BookingDetail` as props), dates, occupancy, and status badge (reusing the existing generic `StatusBadge`, since `BookingRoom.status` deliberately reuses `Booking.status`'s own vocabulary per that model's docstring). Approve/Reject buttons are gated on `permissions.canConfirmWithHotel` (reusing the existing "hotel-confirmation authority, admin-only" permission rather than inventing a new flag — the same boundary `ConfirmationNumberEdit`/`CancellationConfirmationEdit` already use) and only shown while a room is `"Pending"`; Reject requires a reason (`window.prompt`, min 2 chars, matching the backend's own validation). Per-room `total_amount` is only rendered when `adminExtensions` is present — same money-confidentiality boundary (Decision 102) as the existing financial summary, structurally absent for `AgentDashboard_v2.tsx`. After either action, both the room list and the parent `Booking` are refetched (`GET /booking-engine/bookings/{id}` then `onBookingUpdated`) so the application's own rolled-up status (`Pending` while any room is still Pending, `Confirmed` only once every room is) is never stale in the already-open modal or the list behind it.

Reason: found by direct inspection after the project owner asked what, if anything, was still "open" (not fully closed) despite all 7 Engines being LOCKED — grep confirmed the approve/reject endpoints were dead code from the UI's perspective, and a live DB query confirmed a real 2-room application (`BK-000064`) was silently under-reporting its own total by omitting the second room entirely, not a hypothetical concern.

Approved By: Daler

Status: Implemented and verified end-to-end against real data, not just compiled. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Backend verified directly via real HTTP calls with a real admin JWT (not through the UI): `GET /booking-engine/bookings/64/rooms` correctly returned both rooms (room_type #3 at $1,326.85 and room_type #7 at $2,180.50, both `"Pending"`); `POST /booking-engine/rooms/60/approve` flipped that room to `"Confirmed"` while the parent application correctly stayed `"Pending"` (room 61 still pending); `POST /booking-engine/rooms/61/approve` then flipped the parent application itself to `"Confirmed"` — confirming `_recompute_application_status`'s rollup logic works exactly as designed. Frontend dev server picked up all changes via HMR with no console errors. Not yet re-confirmed live in-browser by the project owner (backend path verified directly instead) — worth a quick visual check on `BK-000064` to confirm the two rooms now render correctly in the modal.

---

# Decision 120

Date: 2026-07-28

Decision: Split the Booking Detail modal (`Reservations.tsx`'s `BookingDetail`) into two purpose-defined panels, per the project owner's explicit field list (screenshot with red-boxed "1"/"2"), and added a genuinely new capability: an editable, per-room, per-category commercial cost/price ledger.

1. **Manager info panel** (left column, shared base — visible to both agent and admin, no financial gating): hotel name, room type, meal plan, transfer type, check-in/check-out, flight details, booking date, status, special requests — all already existed. Added: **Agency** (new `User.company_name`, resolved via the existing bulk `/users` fetch alongside `agentNames` → new `companyNames` map) next to the existing **Agent** field (the specific staff account), and **Handled by** (`claimed_by`, already existed on `Booking`/displayed elsewhere as a claim-workflow banner, now also surfaced here as a plain field, "Not claimed yet" when null). **Guest names** (previously in the commercial/right column with per-guest Edit) relocated here — pure layout move, `permissions.canEditGuestDetails` gating on Edit unchanged, since guest names aren't financial data.

2. **Commercial panel** (right column, admin-only via `adminExtensions`): a real gap closed, not a cosmetic one — before this, only Room ever had any cost(net)/price(sale) split at all (`Booking.total_amount`/`agent_markup_amount`/`agent_exclusive_discount_amount`); Transfer (`transfer_total`) and Tax (`mandatory_tax_total`) were pure pass-through with no markup mechanism; Meal/CIP(airport)/Excursion never existed as standalone figures anywhere — meal cost in particular is silently folded into Contract Engine's room rate with no exposed breakout. New Finance Engine table `BookingCommercialLine` (additive extension to this LOCKED Engine, same pattern as Decisions 097/108): one row per (`booking_room_id`, category), `category` a plain extensible string (`room`/`transfer`/`meal`/`tax`/`cip`/`excursion`, same flexible-core precedent as `RateSupplement.adjustment_type`). `base_cost`/`base_price` are the system-computed starting figure, auto-seeded exactly once per room (`service.get_or_seed_commercial_lines`, called on first `GET`) for room/transfer/tax from the room's own frozen columns; stay `NULL` for meal/cip/excursion until a manager enters one manually. `adjustment_cost`/`adjustment_price`/`adjustment_note`/`adjusted_by`/`adjusted_at` are a **deliberately separate** manual correction layer (`service.upsert_commercial_line`, same upsert precedent as Hotel Engine's `set_room_availability_status`) — the project owner's own real scenario: a room-charge discount granted by the hotel after the booking was already made needs to be recorded without silently overwriting the original system-computed figure, same "never mutate history" principle as `InvoiceReviewNote`/`HumanGateDecision`. Every row's real cost/price is `base + adjustment`. Replaces the old read-only, live-recomputed-from-contract-terms "Price breakdown" block (which could disagree with the actual frozen booking figures and had no edit capability at all) with `CommercialLineItemsPanel` — a 6-row table (Room/Transfer/Meal/Tax/CIP/Excursion), each row inline-editable following the `ConfirmationNumberEdit` pattern (local `editing` state → `PUT` → parent refresh). **Owner-confirmed:** the header Net/Sale/Profit box now sums directly from these commercial lines (`compute_booking_room_commercial_totals`, mirrored client-side as `computeCommercialLineTotals` in `financeShared.tsx`) instead of `compute_booking_financials`'s frozen-Booking-column formula — so a correction here is reflected immediately in the on-screen profit figure, per the owner's explicit request. **Deliberately out of scope:** `Invoice`/`InvoiceRoomLine`/`AgentStatement` generation stay on the old frozen-Booking-column formula, completely unretouched — an already-issued invoice/statement remains a frozen snapshot, never silently altered by a later commercial-line edit.

3. **Agency name backend support:** `User` (the shared root model, not inside any LOCKED engine folder) gained a nullable `company_name` column — it never existed before, only on `AgentRegistration` (the original application), never copied onto the approved account. `approve_registration` (`api/routes.py`) now sets it from `registration.company_name` at approval time; a one-off scratch script (not committed, same "raw ALTER TABLE + backfill, not a real migration tool" precedent as Decision 089's `cancelled_by`) backfilled it for already-approved agents by matching `User.email == AgentRegistration.email` (1 of 2 real agent accounts matched; the second is an internal test account with no registration record, expected). `/users`' `UserResponse` schema now includes it.

4. `DetailCtx` (the `adminExtensions` slot-context type) gained an optional `bookingRoomId` field — the selected `BookingRoom`'s own id, distinct from `effectiveBooking.id` (which stays the parent application's id; the room overlay never touched `id`). Needed because the new commercial-line endpoints are keyed to `booking_room_id`, not `booking_id`. Only `renderFinancialSummary`'s call site sets it (`displayRoom?.id ?? null`); every other slot's `ctx` is unaffected.

Reason: the project owner's explicit field-by-field spec (Russian, with a screenshot of the current modal, red-boxed "1" for manager-facing fields and "2" for commercial fields) — "1 поля — информация для менеджера... 2 это коммерческие поля... и все данные с суммой которые оплачиваем в отель... каждая сумма cost и price, также в каждой сумме должен быть возможность изменить его, например я получал за room charge скидку мне нужно добавить в этот поля изменения". Two clarifying questions were asked and answered before implementation: (1) "Agency" = the agent's company (new `User.company_name`), "Handled by" = `claimed_by` (an internal DMC OS staff member's claim, not the external agent) — confirmed distinct from the existing "Agent" field; (2) a commercial-line adjustment should immediately recompute the header Net/Sale/Profit, not just sit as a bookkeeping note.

Approved By: Daler

Status: Implemented and verified. Backend verified via real HTTP calls with a real admin JWT against `BK-000064`/room 61 (the same real 2-room application Decision 119 verified): `GET /finance-engine/booking-rooms/61/commercial-lines` auto-seeded room/transfer/tax with figures matching the room's real frozen totals exactly (room base_cost $2110.50/base_price $2180.50, transfer $714.00, tax $336.00 — byte-identical to the screenshot the project owner provided); a re-`GET` confirmed idempotency (no re-seed, no overwrite); `PUT .../room` with `adjustment_cost=-50`/`adjustment_price=-30`/a note persisted correctly and survived a re-`GET`; `PUT .../meal` created a brand-new row from empty; an invalid category correctly 400'd. All test data reverted afterward (adjustment zeroed, test meal row deleted) so `BK-000064`'s real data is untouched. `/users?role=agent` confirmed `company_name` now present in the response. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. **Not yet re-confirmed live in-browser** — no browser-automation tool was available this session (unlike some prior sessions), so this was verified end-to-end via the real API only, same as Decision 119's own precedent; worth a visual pass on `BK-000064` to confirm the two-panel layout and the new commercial table render as designed.

---

# Decision 121

Date: 2026-07-28

Decision: Fixed a real scaling/data-loss bug in the admin Bookings screen (`Reservations.tsx`'s `BookingsList`, also underlying `BookingsSubViews.tsx`'s Transfers/Arrival/Departure views), found from the project owner's own observation that clicking "Reset filters" on the Bookings tab shows every application ever made — flagged as unsustainable at real volume (~100 applications/day → ~3000/month) and a likely source of server strain.

Investigation found the actual mechanism was worse than "a big list": `GET /booking-engine/bookings?limit=500` was fetched **once on mount, unconditionally**, and every filter (status/hotel/agent/search/date range) was applied **client-side** over that already-fetched, capped array — the date filter (including the admin tab's own "opens scoped to today" default) never actually reduced server load, it only hid rows from an already-fetched fixed batch. Worse, `backend/app/engines/booking/repository.py`'s `list_bookings` ordered `ORDER BY Booking.id` **ascending** — meaning once total bookings exceed the 500 cap, the fetch silently returns the **oldest** 500 rows, not the newest. This is a real, latent data-loss bug, not just a performance concern: today's brand-new applications would eventually stop appearing in the admin list at all, with no error shown anywhere.

Fixed in two parts:

1. **Ordering fixed unconditionally** (`repository.list_bookings`, now `ORDER BY Booking.id DESC`) — if the `limit` cap is ever actually hit, the newest rows win, not the oldest. This alone benefits every consumer of this function, including `BookingsSubViews.tsx` (whose own `dateFilter` scopes on `arrival_date`/`departure_date`, not `created_at` — investigated during implementation and found to be a genuinely different date field than what this decision's new params filter, so it was deliberately left otherwise untouched, see "Deliberately deferred" below).
2. **New optional `created_from`/`created_to` query params** on `GET /booking-engine/bookings` (`api.py` → `service.list_bookings` → `repository.list_bookings`, thin passthrough at each layer, same shape as Finance Engine's own `list_invoices_by_agent_in_range` optional date-range precedent, Decision 087), filtering server-side on `Booking.created_at` (inclusive of the whole `created_to` day). Purely additive — omitting them preserves prior behavior, now newest-first.

Frontend (`Reservations.tsx`'s `BookingsList`): the fetch effect now depends on a new `createdDateKey` (`` `${dateFrom}|${dateTo}` `` when the "By date" filter is active AND scoped to `dateModeView === "created"`, else `null`) and requests `created_from`/`created_to` server-side when set — so the "which applications came in on day X" question (the owner's literal ask, answerable via the existing calendar picker) now only ever transfers one day's worth of data, regardless of total historical volume. Deliberately scoped to `"created"` mode only: `"staying"`/`"cancellations"` (which filter `arrival_date`, a forward-looking question, not a historical-volume one) keep today's instant, client-side-only filtering with no reload flicker — changing to a specific arrival date doesn't refetch. **"Reset filters" changed** to restore the screen's own opening default (`initialDateMode` — "today, by created date" for the admin tab) instead of calling `setDateModeEnabled(false)`, directly implementing the owner's "don't show everything, show daily, use the calendar for other days" ask as the resting state, not just the initial one.

**Deliberately deferred, not solved this pass:**
- Booking-number search (`searchQuery`) stays a client-side filter over whatever's currently fetched — searching for a booking outside the currently-scoped date window won't find it. A real fix needs a server-side `search` param on the same endpoint; not built now since the owner's ask was specifically about the default/reset view, not search.
- `BookingsSubViews.tsx`'s own scaling exposure (its `dateFilter` is `arrival_date`/`departure_date`-based, an entirely different field than this decision's `created_from`/`created_to`) is **not** server-side scoped by this change — it still fetches `?limit=500` unconditionally, now at least newest-first instead of oldest-first (free via the shared repository fix). A real fix there would need a separate `arrival_from`/`arrival_to`-style param; deferred as a distinct follow-up, not silently folded into this one.

Reason: direct project-owner report plus live investigation — not a hypothetical: confirmed via real HTTP calls that scoping to a specific `created_at` date returns exactly the bookings created that day (e.g. `2026-07-26` → exactly bookings `#64`/`#63`, `2026-07-27` → exactly `#65`), and confirmed the ordering bug (unscoped fetch returned `[65, 64, 63, ...]` newest-first only after the fix — previously would have been oldest-first).

Approved By: Daler

Status: Implemented and verified via real HTTP calls with a real admin JWT (no browser-automation tool available this session, same limitation noted in Decision 120): unscoped `GET /bookings?limit=500` returns all 62 real bookings newest-first (`id` 65 down to 2); `created_from=2026-07-26&created_to=2026-07-26` returns exactly `[64, 63]`; `created_from=2026-07-27&created_to=2026-07-27` returns exactly `[65]`; a date with no bookings (`2000-01-01`) returns `[]`, not an error. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Not yet re-confirmed live in-browser — worth a visual pass to confirm Reset now lands back on "today" instead of the full list, and that switching "By date" days feels instant (no scoping) while "created" mode triggers a real, visibly-scoped network request.

---

# Decision 122

Date: 2026-07-29

Decision: Fixed a real gap in `BookingDetail`'s Guests block (`Reservations.tsx`), found live by the project owner right after Decision 121: for a multi-room application, the Guests list always showed every guest across the WHOLE application at once, regardless of which room card was selected in the "Rooms" section above it — even though dates/pricing/meal plan already correctly scope to the selected room (`effectiveBooking`/`displayRoom`). The guests `useEffect` was still calling `GET /booking-engine/bookings/{booking.id}/guests` (the whole-application endpoint) unconditionally; a per-room endpoint, `GET /booking-engine/rooms/{booking_room_id}/guests` (backing `booking_service.list_guests_for_room`, already used server-side by Finance Engine's `compute_application_financials`), already existed but was never wired into this specific fetch.

Fixed by keying the fetch off `selectedRoomId` instead: scoped to `/rooms/{selectedRoomId}/guests` whenever a room is selected, falling back to the original whole-application endpoint only for a legacy booking with zero `BookingRoom` rows at all (`selectedRoomId` stays `null` in that case). The effect now waits for the sibling `rooms` fetch to resolve (`rooms === null` means still loading) before firing, specifically to avoid a double-fetch flash — firing once against the unscoped endpoint, then again against the scoped one, would have briefly shown all guests before narrowing down. No backend change needed — the scoping endpoint already existed, purely a frontend wiring fix.

Reason: direct project-owner report immediately after testing Decision 121 live ("имена показывает сразу все, надо чтоб только те имена показал которые выбрано по номеру" — names show all at once, need only the ones for the selected [room] number).

Approved By: Daler

Status: Implemented and verified via real HTTP calls against `BK-000064` (rooms 60/61): whole-application endpoint returns 7 guests; room 60 alone returns exactly 4 (`test test`, `test asda`, `sdfds dfvgdsf`, `sdfs sdfds`); room 61 alone returns a different 4 (`asdasd asda`, `sdfs sdfds`, `asdas asdasda`, `asdasdas asdasda`) — confirming the per-room endpoint returns a genuine, correctly-scoped subset (one guest, id 15, is linked to both rooms in this real test data — a pre-existing `BookingRoomGuest` link-table fact, not something this fix touches or needs to touch). `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Not yet re-confirmed live in-browser.

---

# Decision 123

Date: 2026-07-29

Decision: Closed the remaining loophole in Decision 121's Bookings-list scaling fix, found by the project owner testing it live (screenshot): "By date" correctly scoped the list while active, but the button itself could still be clicked to turn date-scoping off entirely — falling back to the unscoped (if capped) fetch, i.e. exactly the "shows every application at once" state Decision 121 was meant to eliminate as the resting state, now reachable again with one click. The project owner's own proposed fix: make "by date" the only available mode for the admin queue, not an optional toggle.

`Reservations.tsx`'s `BookingsList` gained `dateModeRequired = initialDateMode !== undefined` — `initialDateMode` is passed by exactly one caller today (`AdminBookingFinance.tsx`'s `AdminBookingsList`/`AdminNeedsAttentionView` wrapper, `{view: "created"}`), so this is precisely and only the admin "all applications" queue, not `AgentDashboard_v2.tsx`'s own view (which never passes it, by original design -- an agent's own booking history is naturally bounded by their own volume, not the whole company's, so it keeps its original opt-in toggle unchanged). The "By date" toggle button is now hidden entirely (not just disabled) whenever `dateModeRequired` — there's no legitimate "off" state left to represent for that caller, and the date range/view picker (Staying/Created/Cancellations) is unconditionally visible in its place. `dateModeEnabled` itself can no longer be set to `false` for this caller (confirmed by inspection: only two call sites remain, the now-hidden toggle and "Reset filters," and Reset already restores `initialDateMode !== undefined` per Decision 121, i.e. `true`).

Reason: direct project-owner report with a screenshot, immediately following Decision 121/122 — confirmed the date-scoped view works correctly, but flagged that the toggle-off path still regresses to exactly the volume problem being fixed ("когда уберёшь by date опять показывает все заявки которые есть у нас... предлагаю сортировать вариант только bydate").

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Code-inspection-verified (not live-browser, no automation tool available this session, same limitation as Decisions 120-122): the "By date" button's JSX is now wrapped in `{!dateModeRequired && (...)}`, and grep confirms `setDateModeEnabled(false)` is not reachable from any code path when `initialDateMode` is passed. Worth a live check that the admin Bookings tab no longer shows the toggle button at all and the date panel is always present.

---

# Decision 124

Date: 2026-07-29

Decision: Fixed a real, screenshotted rendering bug in `HotelSearch.tsx`'s shared `DateRangePicker` (consumed by `HotelSearch.tsx`/`Reservations.tsx`/admin's `PriceCalculator.tsx`, per Decision 109): a selected single day (e.g. clicking one date before completing a range, exactly the "By date" flow Decisions 121-123 just made mandatory for the admin Bookings queue) rendered invisible — white text on what was effectively a transparent background, not the intended solid coral circle.

Root cause, confirmed at the compiled-CSS level (not just inferred): the day-cell's `className` array unconditionally included base `bg-transparent`/`text-ink` classes, with `isEndpoint ? "bg-coral text-white ..." : ""` appended afterward in the same joined string. Two Tailwind utility classes targeting the same CSS property (`background-color`) don't resolve by their order in a `className` string — they resolve by their order in the *generated stylesheet*, which Tailwind controls, not this code. Inspecting the actual built `dist/assets/index-*.css` confirmed `.bg-coral` is emitted at an earlier byte offset than `.bg-transparent`, so `.bg-transparent` was winning the cascade on every selected day, regardless of `isEndpoint` — this is the exact same class of bug `Button.tsx`'s own `VARIANT_CLASSES` comment already documents and deliberately avoids ("two padding utilities targeting the same property fight over generated-stylesheet order, not string order"), just not yet applied to this component.

Fixed by making `isPast`/`isEndpoint`/default each own one mutually-exclusive background+text class pair, never combined with a separately-listed conflicting pair — `bg-transparent`/`text-ink` and `bg-coral`/`text-white` can now never both apply to the same cell at once. Selected-day color matches the project owner's own request ("сделать оранжевый — единый наш цвет, например под цвет меню Created"): `bg-coral text-white`, the identical class pair the "Created" sub-toggle button already uses (Decision 121's own `dateModeView === "created"` styling), so the two now visually agree by construction, not by coincidence.

Reason: direct project-owner report with a screenshot, immediately following Decision 123 — clicking a date (July 22) in the "By date" range picker left it unreadable, invisible against the white calendar background.

Approved By: Daler

Status: Implemented and verified, including at the compiled-CSS level (not just code inspection): `dist/assets/index-*.css` confirmed `.bg-coral{background-color:var(--color-coral)}` at byte offset 19925 vs. `.bg-transparent{background-color:#0000}` at byte offset 24229 before the fix — i.e. directly reproduced why `.bg-transparent` was winning. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Not yet re-confirmed live in-browser (no automation tool available this session, same limitation as Decisions 120-123) — worth a visual click-through to confirm a selected day now shows as a solid coral circle with white text, matching the "Created" toggle's own color.

---

# Decision 125

Date: 2026-07-29

Decision: Fixed two real regressions in the admin Bookings screen (`Reservations.tsx`), both traced directly to Decision 121's own date-scoping fetch wiring from the previous session — not pre-existing bugs, and not `DateRangePicker`'s own click logic, which was confirmed correct throughout.

1. **Picking the first day of a "By date" range closed the calendar immediately**, blocking the intended two-click range selection (e.g. "15 Jul → 16 Jul") and forcing a reopen-and-repick workaround. Root cause confirmed by code reading: `BookingsList` has `if (loading) return <p>...</p>;` — a full early return unmounting the *entire* filter bar, including the open `DateRangePicker`, whenever `loading` is `true`. Decision 121's `createdDateKey = ... \`${dateFrom}|${dateTo || dateFrom}\` ...` used a `dateTo || dateFrom` fallback that treated an in-progress selection (first day picked, `dateTo` still `""`) as already-complete, triggering an immediate refetch → `setLoading(true)` → the mounted `DateRangePicker` (and its `open=true` state) destroyed → refetch resolves → a *brand-new* picker instance mounts with fresh `open=false`. To the user this looked exactly like "the calendar closes itself" on one click. Fixed by making `createdDateKey` real state, advanced by its own effect that explicitly skips updating while `dateTo === ""` — the key (and the resulting refetch) now only changes once a range is genuinely complete, by which point `DateRangePicker` has already legitimately closed itself via its own existing, correct second-click handler. No changes needed to `DateRangePicker`/`HotelSearch.tsx` at all.

2. **Booking-number search only searched within the currently date-scoped result set.** Since "By date" (created view) now fetches only the selected creation-date window server-side (Decision 121), a search for a real booking outside that window found nothing, even though it exists — the project owner's point: search is a different, broader question than "what's in my current date filter," not a narrower one. Fixed with a new optional `search` query param on `GET /booking-engine/bookings` (`api.py`/`service.py`/`repository.py`, thin passthrough at each layer, same `.ilike()` case-insensitive partial-match pattern `api/routes.py`'s existing `GET /users?search=` already established, Decision 087) filtering `Booking.booking_number.ilike(f"%{search}%")`. Frontend: the search box is now debounced (~300ms `setTimeout`, same pattern `financeShared.tsx`'s `AgentSearchSelect` already uses) and, whenever non-empty, its fetch **overrides** `created_from`/`created_to` entirely — searching now finds any matching booking regardless of the active date filter. Clearing the search box reverts to the existing date-scoped/unscoped behavior unchanged.

Reason: direct project-owner report with a screenshot, testing Decisions 121-124 live — both are real usability regressions from the date-scoping work, not hypothetical.

Approved By: Daler

Status: Implemented and verified via real HTTP calls with a real admin JWT: `search=44` correctly returns `BK-000044` (created 2026-07-20) even though the active date window was today (2026-07-29) — confirming search genuinely bypasses date scope; a non-matching search returns `[]`, not an error; `search` combined with an unrelated `created_from`/`created_to` window (an edge case the frontend never actually sends, verified only at the repository-query level) correctly applies both filters together. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. The backend log itself, mid-session, already showed real traffic from a live browser exercising both fixes (`GET /booking-engine/bookings?limit=500&created_from=2026-07-29&created_to=2026-07-29` and `...&search=44`, both `200 OK`) — the project owner appears to already be testing this build directly. Not separately re-confirmed live in-browser by this session (no automation tool available, same limitation as recent decisions) beyond that log evidence.

**Correction (2026-07-29, same day):** the server-side fix above was real and correct (confirmed again by the project owner: search results were being fetched) but incomplete — `BookingsList`'s client-side `filteredSorted` had its own, independent `if (dateModeEnabled) { ... }` block that re-filtered whatever was in `bookings` by the currently-selected date range, unconditionally, regardless of whether a search was active. Since `bookings` now legitimately contains out-of-date-range matches (thanks to the server-side `search` fix), this second, previously-overlooked filter step immediately threw them back out again before they ever reached the screen — the fetch was right, the display was still wrong. Fixed by making the date-mode filter an `else if` against the search branch (`if (searchQuery.trim()) {...} else if (dateModeEnabled) {...}`), so an active search skips client-side date filtering entirely, matching what the fetch already does. `npx tsc -b`/`npx vite build` clean, same baseline.

---

# Decision 126

Date: 2026-07-29

Decision: First item of a broader agent-panel UX pass (a project-owner-requested review researching Booking.com/Agoda/Google Material/Apple HIG/B2B power-user design patterns before proposing a task list — see that analysis for full sourcing). Added a "copy from" quick-fill control to `HotelSearch.tsx`'s multi-room cart checkout form (`ApplicationCheckoutForm`), directly implementing Apple HIG's "reuse previously entered data" principle against a real, daily pain point: a family of 4+ split across 2 rooms required re-typing the same surname and nationality for every single traveler, once per person, with zero reuse.

New `copyableGuests` (a `useMemo` over the whole `cart`, not just the current room — deliberate: the exact case this exists for is a family split across rooms) builds a flat, ordered list of every guest already entered anywhere in the form (first+last name both non-empty). A new `CopyFromSelect` renders next to each "Tourist N"/"Child N" label (hidden entirely when there's nobody yet to copy from — the very first guest in an empty form). Selecting another guest copies **only `lastName` and `nationality`** into the current guest's fields — **deliberately never `passportNumber`/`passportExpiry`**, since a passport number is a unique per-person identifier; copying it would silently create two travelers sharing one passport number, a real data-integrity risk, not a hypothetical one. The select resets to a placeholder after each use (same "action select" pattern, not a persistent binding), so it can be used again immediately for the next guest.

Reason: project-owner-approved item #1 from the agent-panel UX analysis/plan (same session) — the highest-value, lowest-risk item on that list (no backend/schema change, single file, immediately reduces real per-booking data entry for the most common real-world case).

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. New i18n key `cart.copyFromPlaceholder` added to both `en`/`ru` `hotelSearch.json`. Not yet re-confirmed live in-browser (no automation tool available this session, same limitation as recent decisions) — worth a live check that the dropdown appears/disappears correctly as guests are filled in across multiple rooms, and that copying never touches passport fields.

---

# Decision 127

Date: 2026-07-29

Decision: Second item of the agent-panel UX pass — fixed `Reservations.tsx`'s `BookingsList` loading state, the exact component whose `if (loading) return <p>...</p>;` full-screen early return was already identified (Decision 125) as the root cause of the calendar-closing bug: it unmounted the ENTIRE screen, filter bar and open `DateRangePicker` included, on every single fetch, not just the first one.

The filter bar/table shell now always stays mounted; only the table body reacts to `loading`/`error`, matching Google Material's skeleton-screen guidance (researched this session): a skeleton should mirror the actual content shape and never tear down parts of the screen that aren't actually reloading. Two distinct states, not one: **first load** (`bookings.length === 0`) renders 6 real `SkeletonRow`s (reusing the existing `components/ui/Skeleton.tsx` primitive, already built but unused here) sized to the table's actual current column count (`columnCount`, now computed once and reused for the skeleton/error/empty rows instead of being duplicated three times). **Background refresh** (`bookings.length > 0`, e.g. picking a new date or typing a search) keeps showing the previous, still-valid `filteredSorted` rows, dimmed via `opacity-50 pointer-events-none`, instead of flashing a skeleton over content the user was already looking at — deliberately not "skeleton on every reload," since Google's own guidance also warns against a loading flash shorter than ~300ms feeling worse than no indicator at all. The error state is now an inline table row (correctly `colSpan`'d), not a full-screen replacement either.

This component is shared by both `AgentDashboard_v2.tsx` (agent's own bookings) and `AdminBookingFinance.tsx` (admin queue) — the fix benefits both surfaces from one change, no duplication.

**Deliberately not extended to this pass:** `BookingsSubViews.tsx` (admin-only Transfers/Arrival/Departure views) and `AdminPanel.tsx`'s Users tab have the identical `if (loading) return ...` full-unmount pattern, found by the same grep sweep, but are admin-only — out of scope for an explicitly agent-panel-focused pass. Flagged as a known, straightforward follow-up using the same pattern established here.

Reason: project-owner-approved item #2 from the agent-panel UX analysis/plan (same session as Decision 126).

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Not yet re-confirmed live in-browser (no automation tool available this session) — worth a live check that skeleton rows render correctly on first load, that changing a date range no longer flashes a skeleton (dims instead), and that the DateRangePicker genuinely stays open now during a background refresh.

---

# Decision 128

Date: 2026-07-29

Decision: Extended Decision 127's loading-state fix (project-owner-requested follow-up) to the two admin-only screens flagged but deliberately left out of that pass: `BookingsSubViews.tsx` (Transfers/Arrival/Departure) and `AdminPanel.tsx` (Users tab).

`BookingsSubViews.tsx`: same treatment as `Reservations.tsx` — the filter bar (hotel filter, transfer/date-range toggles) now stays mounted; `loading`/`error` moved into the table body (`SkeletonRow` for loading, an inline error row instead of a full-screen replacement). This component's fetch effect only ever fires on mount or on a `mode` change (`[mode]` dependency, no filter-triggered refetch), so unlike `BookingsList` there's no "background refresh keeps the stale rows dimmed" case to handle here — every load is effectively a first load.

`AdminPanel.tsx`: a **worse instance of the same bug family**, found while extending the fix — `if (loading) return ...` didn't just hide table content, it unmounted the **entire admin panel including `AdminNav`, the tab navigation itself**. `loadData()` fires not only on mount but also after every `handleApprove`/`handleReject` call, meaning an admin approving or rejecting a registration application would briefly lose the whole nav bar and get dropped back to a bare loading line — a real, jarring regression on one of the most frequent admin actions in the app, not a first-load-only cosmetic issue. Fixed the same way: `AdminNav`/"Log out" now render unconditionally; only the Users tab's own stat-card grid (7 skeleton `Card`s with `Skeleton`/`SkeletonText` bars while loading) and user table (`SkeletonRow`, `colSpan=7`) react to `loading`.

Reason: direct project-owner follow-up request ("сделай то же самое для BookingsSubViews.tsx и AdminPanel.tsx") after Decision 127 explicitly flagged both as having the identical anti-pattern but out of that pass's agent-panel scope.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Not yet re-confirmed live in-browser (no automation tool available this session) — worth a live check that approving/rejecting a registration no longer visibly drops the admin nav bar, and that the Transfers/Arrival/Departure tabs show skeleton rows instead of a blank screen while loading.

---

# Decision 129

Date: 2026-07-29

Decision: Third item of the agent-panel UX pass, directly implementing Booking.com/Agoda's "break complex, high-error-risk steps into stages instead of one long scrolling form" principle (researched this session). `HotelSearch.tsx`'s multi-room cart checkout (`ApplicationCheckoutForm`) previously rendered every room's full adult/child name/nationality/passport field set, one after another, followed by the flight-details section, all in a single continuously-scrolling form — for a real multi-room, multi-guest booking this was a lot to visually parse and easy to mis-fill without noticing (e.g. a passport field left blank three screens up).

Restructured into a step-per-room wizard: `currentStep` indexes `[...cart rooms, flightStep]` (`totalSteps = cart.length + 1`), and only the current step's fields render at a time. A thin segmented progress bar (one filled/outlined bar per step, each directly clickable for free navigation between already-reachable steps) plus a "Room X of N" / "Flights" label sits above the active step. "Next" is gated per-room via a new `roomIsValid(room)` helper (extracted from the existing `canSubmit` check, which now just becomes `cart.every(roomIsValid)` — zero duplicated validation logic between the two). The final step's "Next" becomes "Submit," gated by the full `canSubmit` as before — free step-navigation via the progress bar can never bypass validation, since submission itself still re-checks everything regardless of which steps were visited. "Back"/"Cancel" (close the whole modal) are always available. `CopyFromSelect` (Decision 126) is untouched and still works across the whole cart, not just the visible step, since `copyableGuests` was already computed over the entire `roomGuests` state, not per-step.

Reason: project-owner-requested item #3 of the agent-panel UX analysis/plan (same session as Decisions 126-128) — explicitly named as "форма гостей по стадиям."

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. New i18n keys `cart.stepRoom`/`cart.stepRoomOf`/`cart.stepFlights`/`cart.back`/`cart.next` added to both `en`/`ru` `hotelSearch.json`. Not yet re-confirmed live in-browser (no automation tool available this session) — worth a live check with a real multi-room cart that: each room's step shows only that room's fields, "Next" stays disabled until the room's required fields are valid, the progress bar accurately reflects position, and submitting from the final step still produces the exact same API payload as before (no change to `buildGuestsPayload`/`handleSubmit`).

---

# Decision 130

Date: 2026-07-29

Decision: Fixed a real regression in Decision 129's stepped checkout form, found immediately by the project owner testing live: filling in a single room's guest names and clicking through created a real application (`BK-000069`, confirmed via direct DB query — `arrival_flight_number` and every other flight field `NULL`) **without the flight step ever rendering at all** (explicitly confirmed by the project owner — not a case of clicking through too fast, the screen genuinely never appeared).

Root cause investigation was thorough before concluding this, not assumed: re-verified the actual JS the Vite dev server was serving (not just the source file, in case of stale HMR — killed and restarted the long-running dev process, then `curl`'d the compiled module directly) confirmed the room step's "Next" is correctly `type="button"` (never submits) and the `type="submit"` button only exists in the DOM once `isFlightStep` is true — the step logic itself was byte-correct as served. The remaining explanation: the native `<form onSubmit={handleSubmit}>` wrapping every step has its own browser-level implicit-submission behavior on pressing Enter in a text field, independent of which buttons happen to be visually present — a well-known class of quirk (behavior here isn't fully spec-consistent across browsers), and with 5 text fields per adult × 2 adults on the room step, a natural Enter-to-advance habit would trigger it.

Fixed at the root, independent of which exact mechanism triggers a premature submit event: `handleSubmit` now starts with `if (!isFlightStep) return;`, immediately after `e.preventDefault()` — a structural guard, not a fix for one specific triggering path. Any submit event firing before the flight step is reached is now unconditionally a no-op, regardless of Enter-key quirks, future step-count changes, or any other trigger not yet identified.

Reason: direct, reproducible project-owner report ("после имени сразу создаётся заявка"), confirmed via a real created booking with empty flight fields and an explicit yes/no answer ruling out the "clicked through too fast" theory.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. Verified the guard is actually live in the served dev bundle (`curl`'d `localhost:5173/src/pages/HotelSearch.tsx`, confirmed `if (!isFlightStep) return;` present), not just in the source file. Not yet re-confirmed by the project owner clicking through again — worth a real retest with the same "fill 2 adults, press Enter instead of clicking Next" sequence to confirm the application is no longer created prematurely.

---

# Decision 131

Date: 2026-07-29

Decision: Decision 130's fix did not resolve the issue — the project owner reproduced the identical premature-submission behavior twice more (`BK-000071`, again with empty flight fields, guest rows confirming a real, deliberate test) immediately after that fix was deployed and independently verified live in the served bundle. Explicitly confirmed via direct question: no flight screen ever visibly appears before "Заявка создана."

Re-investigated from scratch rather than assuming the same root cause: re-verified via `curl` against a freshly restarted dev server that the "Next" button is genuinely `type="button"` and `handleSubmit`'s `isFlightStep` guard is genuinely present in the served code — both true. Concluded the real cause is different from Decision 130's theory: **"Next" and "Submit" occupy the exact same on-screen position** (same primary coral button slot in the footer), so a fast double-click — ordinary human behavior, especially during rapid testing — lands its *first* click on "Next" (advancing the step) and its *second* click, a moment later, on whatever now occupies that same position: "Submit" on the just-revealed final step. Decision 130's `isFlightStep` guard doesn't catch this because by the time the second click's event fires, the step genuinely *has* advanced — from the guard's perspective this is a legitimate final-step submission, not a bypass. This isn't a step being skipped; it's a real step transition happening faster than a human visually registers it.

Fixed with a brief post-transition cooldown: new `navCooldown` state, set `true` by a new `goToStep(updater)` wrapper (now the only way `currentStep` changes — the step-indicator dots, "Back," and "Next" all route through it) immediately on any step change, cleared automatically after 400ms via `setTimeout`. `navCooldown` is added to the `disabled` condition of "Back," "Next," AND the "Submit" button — so immediately after any step transition, all three are briefly unclickable, closing the exact window a reflexive second click would land in. `handleSubmit` itself also gained `if (navCooldown) return;` (defense-in-depth alongside the `disabled` attribute, matching Decision 130's "guard the handler, not just the button" principle) in case the disabled attribute is ever bypassed by some mechanism not yet identified.

Reason: direct, twice-reproduced project-owner report, with the previous fix's theory explicitly ruled out by re-verification before proposing a new one — not a guess stacked on a guess.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. This time verified against a **fully restarted** dev server (both the npm wrapper and vite child process killed and relaunched, not relying on HMR at all) — confirmed via `curl localhost:5173/src/pages/HotelSearch.tsx` that `navCooldown`, the `goToStep` wrapper, and all three `disabled` conditions are present in the actually-served code. Not yet re-confirmed by the project owner — worth a real retest, including a deliberately fast double-click on "Next" to confirm the second click is now swallowed rather than landing on "Submit."

---

# Decision 132

Date: 2026-07-29

Decision: Added an explicit confirmation before submitting the multi-room cart application with every flight-detail field left blank. Flight fields stay genuinely optional at the schema/validation level (a real, valid scenario — a guest arranging a transfer before their flight is actually booked) — this isn't a new required-field rule, just a deliberate "are you sure" so an agent can't submit with zero flight information without ever having been asked, closing the gap the project owner flagged right after Decisions 130/131's double-click fixes made the wizard fast and easy to click straight through.

`handleSubmit` now checks `Object.values(flight).some((v) => v.trim() !== "")` immediately before the actual POST; if every flight field is empty, `window.confirm(t("cart.confirmNoFlightDetails"))` gates the submission — declining leaves the agent right back on the flight step to fill something in or reconsider. Same `window.confirm` pattern `AdminPanel.tsx` already uses for registration approve/reject (Decision-era precedent, not a new UI pattern introduced here).

Reason: direct project-owner request, immediately following the double-click fixes — flight information (needed to actually arrange an airport transfer) was too easy to skip entirely without any signal that it was skipped.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. New i18n key `cart.confirmNoFlightDetails` added to both `en`/`ru` `hotelSearch.json`. Verified live in the served dev bundle (`curl localhost:5173/src/pages/HotelSearch.tsx`, confirmed `hasAnyFlightDetail`/`confirmNoFlightDetails` present). **Confirmed working by the project owner testing live**, including the double-click and empty-flight-confirmation scenarios from Decisions 130-132.

---

# Decision 133

Date: 2026-07-29

Decision: Fourth item of the agent-panel UX pass, directly implementing Apple HIG's "verify values as soon as people enter them, provide feedback immediately when problems are detected" principle (researched earlier this session). `ApplicationCheckoutForm`'s validation was previously all-or-nothing: passport expiry was never checked at all (an already-expired passport would silently pass straight through to a real booking), and an invalid room's "Next"/"Submit" button just went grey with zero explanation of what was actually missing — an agent had to guess.

Added `passportExpiryError(room, expiry)` — same shape/precedent as the existing `childAgeError` (null = no error, only fires once a date is actually entered, since passport stays optional overall): flags a passport whose expiry falls before the room's own `arrivalDate`, an objective, non-debatable problem (an expired document can't be used for that trip), not a speculative policy like "6 months remaining validity" that wasn't asked for. Wired into both `roomIsValid` (now also gates on this, alongside the existing name/child-date checks) and a new inline red error rendered directly under each adult/child's passport expiry field, same visual treatment `childAgeError` already established (`border-coral` input outline + a coral message line below).

Added `roomValidationMessage(room)` — a plain-language, non-error-styled (slate, not coral — this is guidance shown before any mistake was made, not a correction after one) hint shown above the "Next"/"Submit" row whenever the current room isn't valid yet, returning the first concrete reason found (missing guest names → missing child date of birth → child age mismatch → expired passport) rather than a generic "fill in required fields." No touched-field tracking was added — deliberately scoped down from a full per-field dirty-state system, since a plain informational hint reads fine even before any typing has happened, unlike a red inline error would.

Reason: project-owner-requested item #4 of the agent-panel UX analysis/plan (same session as Decisions 126-132) — "мгновенная валидация полей (паспорт/дата) вместо проверки только при сохранении."

Approved By: Daler

Status: Implemented and verified. `npx tsc -b` clean (same 9-error baseline, zero new). `npx vite build` clean. New i18n keys `cart.passportExpired`/`cart.missingGuestNames`/`cart.missingChildDateOfBirth`/`cart.fixChildAge` added to both `en`/`ru` `hotelSearch.json`. Verified live in the served dev bundle (`curl localhost:5173/src/pages/HotelSearch.tsx`, confirmed `passportExpiryError`/`roomValidationMessage` present, 14 occurrences). Not yet re-confirmed by the project owner clicking through — worth a real retest: entering a past passport-expiry date should immediately show a red inline message and keep "Next" disabled with the hint visible; an empty room should show "Enter first and last name for every guest" before any field is touched.

---

# Decision 134

Date: 2026-07-29

Decision: Fixed the routing bug documented in `CLAUDE.md`'s own "Known issues" section — `App.tsx` owned all navigation via a local `useState<Page>` state machine and never rendered `<Outlet/>`, so `router.tsx`'s nested child routes were matched by React Router but never actually mounted. Direct URLs/bookmarks/refreshes silently rendered Home instead of the intended page; a guarded page that redirected on a missing token without clearing stale `role`/`user` data could loop forever.

Investigated with a dedicated research pass (an Explore agent read every relevant file) before touching anything, confirming several things not previously known precisely: `main.tsx` **does** render `<RouterProvider>` (the router is live at the framework level, only its children were unreachable); `react-router-dom`'s actual navigation API (`useNavigate`/`<Link>`/`<Outlet>`) was used **nowhere** in the app before this; **6 of the project's 9 "always-there" baseline TypeScript errors traced directly to this exact bug**, not separate pre-existing issues as they'd been treated all session — `router.tsx` passed `<Home/>`/`<Login/>` with zero props despite both requiring them (2 errors), and `App.tsx` had 2 genuinely-dead functions (`goToAdminPanel`/`goToManagerDashboard`, defined, never called) plus 2 unused-state errors (`userRole`/`forceUpdate`, 4 errors); and auth guards were **inconsistent, not just duplicated** — `AgentDashboard_v2.tsx`/`HotelSearch.tsx` each independently implemented an identical token/role check + hard redirect, but `AdminPanel.tsx`/`ManagerDashboard.tsx` had **no client-side guard at all**, a real gap (an unauthenticated admin/manager landing there saw silently-failing API calls, never a redirect) found during this investigation, not hypothetical. Also found and fixed as a natural side effect: `AgentTopNav.tsx`'s "Bookings" nav item was a genuine no-op (`onNavigateDashboard={() => {}}`) when already on the agent dashboard.

Fixed per the design `CLAUDE.md` itself proposed as one of two options — wired `App.tsx` to actually delegate to the router, rather than the lower-effort alternative of just deleting the dead nested routes (which would have cleaned up the confusing dead code but left direct-URL navigation, the actual reported problem, unsolved). `router.tsx` now has a real route per page (`/`, `/register`, `/login`, `/change-password`, `/dashboard`, `/admin-panel`, `/agent-dashboard`, `/manager-dashboard`, `/hotel-search`) plus a `*` catch-all (`<Navigate to="/" replace/>` — didn't exist before). New `components/layout/RequireAuth.tsx` is the single shared guard every protected route goes through now, replacing the duplicated-or-missing per-page checks — `{ path: "admin-panel", element: <RequireAuth role="admin"><AdminPanel/></RequireAuth> }`, same shape for every role-gated route. `App.tsx` is now a thin layout (`<Outlet/>` + conditional `<Header/>` based on `useLocation().pathname`, same 3-page "AgentTopNav replaces Header" exclusion list as before, just URL-driven instead of state-driven) — no more page state, no more `goTo*`/`handleLoginSuccess` functions. Every page that used to receive a navigation callback prop (`Home`, `Login`, `Header`, `ChangePassword`, `AgentDashboard_v2`, `HotelSearch`, `AgentTopNav`, `AdminPanel`, `ManagerDashboard`) now calls `useNavigate()` directly instead — the prop was always 1:1 with "go to this fixed URL," so nothing was left for a caller to parametrize. The one behavior that used to live in `App.tsx`'s own mount effect (auto-redirect to the right dashboard if a valid session already exists) relocated to `Home.tsx`, the only place it's actually needed now. `AgentDashboard_v2.tsx`'s destination-hint (clicking a featured hotel) now travels as router `state` (`navigate("/hotel-search", { state: { destination } })`) instead of a prop, read via `HotelSearch.tsx`'s own `useLocation().state`.

**Deliberately not touched:** `Hero.tsx`/`AgentDashboard.tsx` (the old v1, not `_v2`)/`AgentRegistration.tsx` — confirmed orphans, imported nowhere in the live app, each with their own dead parallel `window.location.href` logic; `AdminNav.tsx`'s tab state (Users/Bookings/Contracts/Finance/...) gaining URL deep-linking — confirmed self-contained, a related but separate, smaller gap, not the documented bug; `Register.tsx`'s own `window.location.href = '/'` success button — still correct behavior (Home's new redirect logic handles it fine), just not converted to a soft `navigate()`, left as a minor, low-risk omission rather than expanding scope further.

Reason: project-owner-requested item #6 of the original UX plan, explicitly the one item `CLAUDE.md` itself flagged as "its own task, not a drive-by change."

Approved By: Daler

Status: Implemented and verified. `npx tsc -b`: baseline dropped from 9 errors to **2** (better than the plan's predicted 3 — `Header.tsx`'s own unrelated unused-`Button`-import error was fixed for free while converting that exact line) — the only 2 remaining errors are both in the confirmed-dead `AgentDashboard.tsx` v1 file, untouched by this task. `npx vite build` clean. Dev server fully restarted (not relying on HMR, given the scale of this change) and every route (`/`, `/login`, `/register`, `/change-password`, `/dashboard`, `/admin-panel`, `/agent-dashboard`, `/manager-dashboard`, `/hotel-search`, plus a bogus path for the catch-all) confirmed to return `200` with the SPA shell; the served `App.tsx`/`router.tsx`/`RequireAuth.tsx` bundles confirmed live via direct `curl`, not stale. **Not yet re-confirmed live in-browser** (no automation tool available this session, same limitation as recent decisions) — client-side route matching, the guard's actual redirect behavior, and the destination-hint state-passing all need a real click-through/direct-URL-paste check by the project owner, including specifically: pasting `/agent-dashboard` directly with no session (should land on `/login`, not silently show Home); logging in as an agent then pasting `/admin-panel` (should bounce to `/`); refreshing mid-session on any protected page (should stay put, not reset).

---

# Decision 135

Date: 2026-07-29

Decision: Item #5 of the agent-panel/admin UX plan — finished the design-system rollout on the 3 lowest-risk of the 7 remaining hand-rolled admin pages (`Balance.tsx`, `Cashback.tsx`, `Counteragents.tsx`), plus closed 2 real primitive gaps the migration surfaced rather than assumed: no `Modal` component existed anywhere despite the exact same overlay+panel markup being hand-copied byte-for-byte 3 times (`Cashback.tsx`, `Counteragents.tsx`, `financeShared.tsx`'s `InvoiceDetailModal`), and no `<select>`-shaped primitive existed despite every one of the 7 target files using a raw `<select>` (`Input.tsx` only covers text-like inputs).

New `components/ui/Modal.tsx` — pure extraction of the identical markup, deliberately zero new behavior added (no focus trap/Escape handling, since neither original instance had that either). New `components/ui/Select.tsx` — same visual language as `Input.tsx` (border/focus/tone/scale), kept as its own component since a `<select>`'s `<option>` children don't fit `InputProps` cleanly.

`Balance.tsx`: search/export panel and both date inputs → `Card`/`Input`/`Button`; both empty-state messages and all KPI tiles → `Card`. Caught and corrected a real Tailwind same-property conflict before it shipped — `padding="lg"` combined with a custom `px-5 py-10` in the same className would have fought over generated-stylesheet order, not string order (documented bug class, Decision 124); used `padding="none"` instead.

`Cashback.tsx`: hotel `<select>` → `Select`; "Add arrangement" button → `Button` (no `teal` variant exists in `Button.tsx`, so this now renders coral/`primary` instead of teal — a deliberate, disclosed normalization, not a silent regression); empty-state and per-arrangement cards → `Card` (self-caught a `padding="lg"` vs. the original's actual `p-5`/`md` mismatch before finalizing); entire hand-rolled modal → `Modal`, its number/text/date fields → `Input`, Save/Cancel → `Button`. `StatusBadge` (from `financeShared.tsx`) deliberately left as-is per the plan's own open decision — reads cleaner unchanged for this lightweight consumer.

`Counteragents.tsx`: global markup panel → `Card`/`Input`/`Button` (the markup-amount validation branch, live pricing config per Decision 070, untouched — only the JSX wrapper changed); both raw `<table>`s (Standard/Exclusive agent lists) → the `TableShell` family; "Add" (was `bg-teal`) → `Button variant="dark"`; "Return to standard" (was an outline-coral button) → `Button variant="danger"`, matching the same outline-danger-action convention `AdminPanel.tsx`'s own reject button already established; "Add to exclusive" modal → `Modal`, its search input → `Input`, Cancel → `Button`. The candidate-picker list rows were deliberately left hand-styled — a list item acting as a click target, not a CTA, doesn't fit `Button`'s shape. Underline sub-tabs (Standard/Exclusive) left as-is per the plan (only 2 occurrences project-wide, not worth a new `Tabs` primitive yet).

**Explicitly deferred, not started, per the plan's own phasing:** `Contracts.tsx`, `Invoices.tsx` + `financeShared.tsx` (`InvoiceDetailModal`/`AgentSearchSelect`/`StatusBadge`), `PriceCalculator.tsx`, `ContractsAI.tsx` — each scoped as its own future pass in the plan, ranked by risk, not attempted here.

Reason: project-owner-requested item #5 of the UX plan; scoped down from all 7 remaining files to the 3 lowest-risk ones in the approved plan, matching this project's own "prove it once, extend later" convention rather than a single large, hard-to-review change touching real pricing/finance screens at once.

Approved By: Daler

Status: Implemented and verified. `npx tsc -b`: clean at the established 2-error baseline (both in the confirmed-dead `AgentDashboard.tsx` v1, untouched). `npx vite build` clean. Dev server fully restarted (killed the vite child process + its cmd.exe wrapper + the npm bash wrapper, not just one PID, matching this session's own established clean-restart precedent) and the 3 migrated pages plus both new primitives confirmed live via direct `curl` against the served dev bundle, not stale. **Not yet verified live in-browser** — no automation tool available this session; needs a real click-through by the project owner: open both modals (Cashback "Add arrangement," Counteragents "Add exclusive agent"), confirm they open/close/submit correctly, and that all 3 pages look visually consistent with the already-migrated `AdminPanel.tsx`.

---

# Decision 136

Date: 2026-07-30

Decision: Three real bugs reported live against BK-000066 (a genuine 2-room application) fixed, all frontend-only, backend extended additively.

(1) **Confirmation number was one field for the whole application.** `BookingRoom.confirmation_number` and `PUT /booking-engine/rooms/{id}` already existed server-side (Decision 097's own Stage 4), just never wired into the UI — `ConfirmationNumberEdit` only ever edited `Booking.confirmation_number`, so entering the hotel's reference for room 1 silently applied to room 2 as well. New `RoomConfirmationNumberEdit` (Reservations.tsx) renders per room whenever an application has 2+ rooms — single-room applications (the common case) keep the exact original whole-booking editor, untouched.

(2) **Bookings list showed stale profit after a manual commercial-ledger correction.** `BookingDetail`'s own header already read live `BookingCommercialLine` data (Decision 120) when it existed for a room, but the list's Net/Profit column and "Total profit" summary strip both still called `compute_booking_financials`/`computeBookingFinancials` — the frozen Pricing-Engine snapshot, never touched by `upsert_commercial_line`. New bulk, read-only `GET /finance-engine/bookings/financials?ids=...` (service.`compute_bookings_list_financials`, two bulk queries total — new `booking_service.list_booking_rooms_bulk`/`finance repository.list_commercial_lines_bulk` — never one query per booking/room, and deliberately never seeds rows the way the existing per-room GET does) returns the same live-if-corrected figure the detail view already showed. `AdminBookingFinance.tsx`'s `ListSummaryBar`/`renderFinancialColumnCells` now read this bulk result, falling back to the old frozen calc for any booking absent from it (no `BookingRoom` rows at all — a legacy edge case). A `✎` marker shows on rows with a real manual adjustment (`has_manual_adjustment`, keyed off `adjusted_by IS NOT NULL` on any line — corrected mid-implementation from an initial version that only checked the `adjustment_*` delta columns, which missed a direct `base_cost` correction, the exact kind BK-000066 had).

(3) **LPO for a multi-room application only ever described one room.** `renderCorrespondencePanel` always received `booking`'s own "representative" (first-room) fields; a hotel confirmation-request email for a 2-room stay silently covered just one of them. `DetailCtx` gained an optional `rooms` field (`BookingRoom[] | null`, threaded from `BookingDetail`'s own already-fetched `rooms` state). New `MultiRoomCorrespondencePanel`/`useLpoMultiRoomData`/`buildMultiRoomLpoEmailText` build one combined email — a `--- Room N of M ---` table per billable room plus a shared flight-details table and grand total — fired by exactly one `POST .../correspondence/send` call, same as before (no new endpoint, no room-scoped correspondence introduced). Identical-room lookups (contract/room type/dates/occupancy/transfer) are deduped via an in-request cache, so BK-000066's two identical villas cost the same number of backend calls as one room would. Single-room applications take the completely untouched original code path (`SingleRoomCorrespondencePanel`).

Reason: three independently-reported real defects on a live multi-room booking, not hypothetical — each traced to the same root cause shape (multi-room support added at the `BookingRoom` layer in earlier decisions, but a UI surface never updated to consume it).

Approved By: Daler

Status: Implemented and verified against BK-000066's real data (rooms 63/64) via direct API calls — the new bulk financials endpoint's `has_manual_adjustment`/summed net-sale-profit figures matched the real, deliberately-edited test values on those two commercial-line rows exactly. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline. Both dev servers restarted fresh; new code confirmed live via direct `curl` against served bundles. Not yet verified live in-browser (no automation tool this session) — needs a real click-through: open BK-000066, confirm both rooms show independent confirmation-number editors, the list's Profit column matches the detail view, and the LPO panel shows one combined 2-room email.

---

# Decision 137

Date: 2026-07-30

Decision: Kicked off "DMC OS Design System v1.0" — a full-platform corporate visual unification the project owner requested (explicit hard constraints: no new features, no business-logic/backend/API/Engine/permission changes, UI/UX only). Given the genuinely large scope (20+ page files, several still fully hand-rolled), this is being delivered in phases, same "prove it once, extend later" discipline as every prior design-system pass this session — **this decision covers Phase 0 (foundation) only.**

Before any code was touched, a palette proposal (colors, buttons, status pills, a card+table mock, a sidebar mock, calendar before/after, and the one real spec conflict) was shown to the owner as a live preview artifact, and three scope questions were asked and answered: **Cancelled** gets its own dedicated muted-terracotta token (`#8a5a52`) rather than reusing Rejected's red — preserves the Cancelled-vs-Rejected distinction (Decision 104, reinforced by this session's own recent line-through fix) while still reading "in the red family" per the brief. **Sidebar** is scoped to the admin panel only — the agent-facing top nav (`AgentTopNav.tsx`) is deliberately untouched, deferred to a later phase alongside HotelSearch/AgentDashboard_v2's own full migration. **Start point** confirmed as foundation (tokens/primitives/Sidebar/Calendar) rather than the highest-risk pages (Bookings/Finance) or the Sidebar alone.

**Colors** (`tailwind.css` `@theme`): `--color-ink` (`#1b2340`, primary/navy) and `--color-sand` (`#f3eee4`, background) were already correct per the brief and kept byte-identical. New `--color-gold`/`--color-gold-deep` (accent, used sparingly — sidebar active state — never the default button fill, since the brief names navy as основной). `--color-success` changed from a teal-alias to a genuine independent green (`#2f7d52`) — teal read too close to the new navy primary to stay an unambiguous "Confirmed" signal. New `--color-cancelled` (`#8a5a52`, see above). `--color-warning`/`--color-danger`/`--color-teal`/`--color-coral` unchanged and still defined (not deleted — still referenced directly by pages not yet migrated). Real bug found and fixed alongside this: `global.css`'s actual `body` background was a stock `#f5f7fb` (cool blue-grey) that had been silently overriding the sand token everywhere since before Design System v1.0 — corrected to sand's own hex.

**Buttons** (`Button.tsx`): the brief asks for exactly 4 — Primary/Secondary/Outline/Danger. `primary` is now solid navy (was coral) — gold stays the accent, not the default CTA. New `outline` variant (transparent + navy border) is what `secondary` used to render as; `secondary` itself is now a new subtle navy-tinted fill, a real second-tier action distinct from `outline`. `danger` unchanged. `dark`/`ghost` deliberately kept, not removed — dozens of existing call sites across already-migrated pages use them; ripping them out is future cleanup once every page is on v1.0, not attempted mid-foundation-pass. `primary`/`dark` now render identically (both solid navy) — disclosed, not accidental.

**Badge** (`Badge.tsx`): new `"cancelled"` tone using the new token.

**Sidebar/Header**: new `components/layout/AdminShell.tsx` — a left sidebar (navy, gold active-state) plus a slim topbar (user label, logout), replacing `AdminPanel.tsx`'s previous `AdminNav`-top-bar-only layout. Reuses `AdminNav.tsx`'s existing `NAV_STRUCTURE` data array and its exact controlled `activeTab`/`onSelect` contract verbatim — zero navigation logic change, purely a new presentational shell. Groups render as an always-expanded label + child list (a sidebar has the vertical room a horizontal bar didn't) rather than the old click-to-open dropdown, so that interaction's own state/click-outside-listener is gone entirely, not just hidden. `AdminNav.tsx` itself is left in place, unused by `AdminPanel.tsx` now but not deleted. **Scope-narrowed from the original plan during implementation:** a contextual search slot in the topbar was planned but dropped — `AdminPanel.tsx` has no single cross-tab search state to lift up without either faking a non-functional box or changing which page owns search state (a real behavior change, out of scope) — search unification stays a future-phase concern once individual pages' own search inputs get visually standardized.

**Calendar** (`HotelSearch.tsx`'s `MonthGrid`/`DateRangePicker`, shared by 3 consumers — HotelSearch, Reservations, PriceCalculator): visual-only rework — day cells `h-7/w-7` → `h-10/w-10`, panel width `w-56` → `w-72`, popover padding `p-3` → `p-5`, date numerals `text-xs` → `text-sm`, weekday header restyled to the Label convention (uppercase, tracking-wide), range-band recolored from `bg-coral/10` to `bg-gold/10`, endpoint circles recolored from `bg-coral` to `bg-ink` (navy, matching the new primary). `buildMonthGrid`, `handleDayClick`, and every prop (`checkIn`/`checkOut`/`onChange`/`forceLang`/`size`/`allowPast`) are byte-identical — confirmed by inspection, not just intent.

**Status**: `Reservations.tsx`'s `STATUS_CLASSES.Cancelled` repointed from neutral slate to the new `--color-cancelled` token (kept the line-through decoration from this session's own recent fix).

Explicitly **not** touched in Phase 0 (future phases): `Contracts.tsx`, `ContractsAI.tsx`, `Invoices.tsx`/`financeShared.tsx`, `PriceCalculator.tsx`, `BookingsSubViews.tsx`, `AdminBookingFinance.tsx`'s remaining raw stock-color literals, `AgentTopNav.tsx`, `ChangePassword.tsx`/`ManagerDashboard.tsx`/`AgentRegistration.tsx` (the last confirmed dead code), and any backend file.

Reason: project-owner-requested full-platform visual unification; scoped to a foundation-first phase (per the owner's own confirmed answer) specifically because the token/primitive layer already cascades automatically to every already-migrated page (`AdminPanel.tsx`, `Login.tsx`, `Balance.tsx`, `Cashback.tsx`, `Counteragents.tsx`) for zero additional file touches — the highest-leverage, lowest-risk place to start a genuinely large effort.

Approved By: Daler (palette + 3 scope questions confirmed via a preview artifact and AskUserQuestion before any code was touched)

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline (zero new). `git status` confirms zero backend files touched by this pass (the backend changes present in the working tree are Decision 136's, predating this one). Both dev servers restarted fresh; new tokens (`--color-gold`, `--color-cancelled`), `AdminShell.tsx`, `AdminPanel.tsx`'s new wiring, and the `STATUS_CLASSES.Cancelled` change all confirmed live via direct `curl` against the served bundles. **Not yet verified live in-browser** (no automation tool this session, same limitation as recent decisions) — needs a real click-through by the project owner: `/admin-panel`'s new sidebar+topbar (every nav item still reaches the same tab it did before), the booking status pills (Cancelled visibly distinct from both Rejected and the old grey), and the calendar's new spacing/sizing across all 3 consumers.

---

# Decision 138

Date: 2026-07-30

Decision: Four real, live-reported UX iterations on `AdminShell.tsx`'s new sidebar (Decision 137), all found by the project owner testing the actual running admin panel rather than planned in advance.

(1) **Collapsible.** The sidebar was permanently visible with no way to reclaim its width for wide tables (Needs Attention, Bookings). A chevron button inside the sidebar (near the logo) collapses it to full-width content; a menu icon appears in the topbar to bring it back. State persisted in `localStorage["admin_sidebar_collapsed"]`, same flat-key convention as `token`/`role`/`user`.

(2) **Accordion groups.** Bookings/Contracts/Finance used to show every child permanently expanded. Now one group opens at a time (`openGroup` state) — clicking a group expands it and closes whichever was open; clicking a top-level leaf (Users, Price calculator, Counteragents) closes any open group, since navigating there means leaving that section. The group containing the current `activeTab` starts open on load so landing directly on e.g. "Arrival" doesn't hide the very item you're on.

(3) **Real bug, found from a screenshot: group header labels (BOOKINGS/CONTRACTS/FINANCE) were unreadable** — near-invisible white-on-white. Root cause: the group header `<button>` never set an explicit `bg-*` class, and this project deliberately excludes Tailwind's preflight reset (`tailwind.css`'s own top comment), so the browser's native UA-stylesheet button background (light/white) showed through underneath low-opacity white text. Every other nav button in the file already had an explicit `bg-transparent`/`bg-gold/20`; only the group header was missing it. Fixed by adding `bg-transparent` explicitly.

(4) **"Make them all one look."** Group headers were small uppercase (`text-[10.5px] uppercase tracking-wide`) while leaf items were normal sentence-case `text-sm` buttons — visually two different component types. Extracted one shared `navItemClass(active)` builder that every nav row (top-level leaf, group header, child leaf) now renders through, so "one look" is true by construction, not by three independently hand-copied className strings that can drift apart (exactly what had just happened). Group headers keep only the trailing chevron and a `pl-3` indent on their children as the sole visual differentiators. A final pass added a subtle `border border-white/10` (`/20` + brighter on hover when active) to every nav item, per an explicit "add a frame so each item reads cleanly" request — folded into the same shared `navItemClass` builder.

Reason: real usability gaps and a real rendering bug found by the project owner actually using the feature Decision 137 shipped, not hypothetical — each fix scoped to exactly `AdminShell.tsx`.

Approved By: Daler (each iteration requested live against a running screenshot/session)

Status: Implemented and verified after every one of the 4 changes — `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline each time, dev server restarted fresh and the change confirmed live via `curl` against the served bundle before moving to the next iteration.

---

# Decision 139

Date: 2026-07-30

Decision: "DMC OS Design System v1.0" Phase 1 — search bar, hotel result cards, and a persistent cart, on top of Phase 0's foundation (Decision 137). Same hard constraints as Phase 0 (no new features/backend/API/Engine/business-logic/calculation/permission changes — UI/UX only). The project owner's brief for this phase was significantly larger and more detailed than Phase 0's (Apple/Stripe/Linear/Notion/Figma referenced, not Marriott/Booking.com; explicit asks for a 3-column tariff-selection page, richer hotel cards, table/detail-panel/modal unification across every remaining page, Header/Sidebar polish). Given the size, two scope questions were asked and owner-confirmed before implementation: **the full 3-column restructure (hotel list left / room-meal-transfer detail center / cart right) is deferred to its own future phase** — it's a real information-architecture change to `HotelSearch.tsx` (2853 lines, the largest file in the project, and the actual screen that creates real bookings), too large and risky to bundle with everything else in one pass; this phase does the smaller, still-high-value pieces within the *current* single-column results architecture instead. **Real hotel photos are out of scope entirely** — confirmed by reading `HotelResult`'s type definition: no image field exists anywhere in the search response today (only a `CARD_GRADIENTS` color placeholder), and adding one would require a backend/API change, explicitly forbidden.

**Token cleanup:** `Input.tsx`/`Select.tsx` still had `focus:border-coral`/`focus:ring-coral/30`, never updated in Phase 0 — repointed to `gold`, cascading free to every already-migrated page.

**Search bar (`HotelSearch.tsx`):** confirmed by reading the code that the form was **already** a Marriott-style unified block with inset dividers (an earlier decision this session), not separate cards — most of this ask was already done. What was actually missing: the old coral accent (hero gradient, `IconPin`, focus states) never got Phase 0's navy/gold treatment. Repointed throughout; modest spacing increase (`px-7 py-5` → `px-8 py-6`/`py-8`, tighter gaps loosened) for a more spacious feel. Hero gradient `to-coral/40` → `to-gold/30`.

**Hotel result cards (`HotelCard`):** new summary strip added — price ("from `{currency}` `{amount}` / night", the most prominent element, via new `cheapestPerNightForHotel`, which reuses the exact same `agent_room_total / nights` division `RoomTypeCard`'s own per-room-type header already does, just finding the minimum across room types — no new pricing formula), room-type count badge, deduped meal-plan-code badges, and a transfer-available badge — all built from data already present in `HotelResult`/`RoomTypeResult` (`cheapestOption`, `hotel.roomTypes`, `hotel.transferOptions`), zero new fetches. Card image area enlarged (`h-36`→`h-40`, `sm:w-56`→`sm:w-64`) and content padding increased (`p-5`→`p-6`). `CARD_GRADIENTS` recolored from coral/teal combinations to ink/gold. `RoomTypeCard`'s own coral usages (selected-meal-plan highlight, "Select" button, mandatory-transfer/included-free badges, radio accent, "Add to trip" CTA) recolored with real semantic distinctions, not a blind find-replace: selection/toggle states → `gold` (matching the sidebar's own "active = gold" convention); the actual submit-type CTA buttons (Add to trip, checkout) → `ink`/navy (matching `Button.tsx`'s own primary); genuine error text and a stray stock `text-red-600` → the branded `danger` token; "mandatory choice" notice → `warning`; "included free" (a real discount reaching 100%) → `success`.

**Persistent cart:** `CartPanel` gained an additive `variant?: "floating" | "pinned"` prop (default `"floating"`, byte-identical to the original behavior) — internal list/remove/checkout logic is completely shared and unchanged either way; only the outer wrapper and open/collapse header differ. On `lg+` screens, once a search has real results and checkout isn't open (`showPinnedCart`), results render in a 2-column grid (`lg:grid-cols-3`, results `lg:col-span-2`) with the cart pinned in a `lg:sticky lg:top-4` right column, `variant="pinned"` — always expanded, shown even when empty (new `cart.empty` copy) rather than gated on `cart.length > 0` as before. Below `lg`, the original floating bottom-right bubble (gated on `cart.length > 0`, same as always) is unchanged. Real gap closed while wiring this: the pinned cart is now reachable with zero items (previously impossible, since the floating panel never rendered at all when empty) — the checkout button gained a plain `disabled={cart.length === 0}` guard so this newly-reachable empty state can't submit a broken zero-room application; this is defensive UI only, not a new business rule (checkout with zero rooms was never a real, supported path either way).

Reason: continuation of the project owner's Design System v1.0 initiative, scoped to the next highest-value, self-contained slice per the owner's own confirmed answers, deferring the riskiest piece (3-column restructure of the real booking-creation screen) to its own future pass.

Approved By: Daler (3-column deferral and no-photos decisions confirmed via `AskUserQuestion` before implementation)

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline (zero new). `git status` confirms only `frontend/` files touched (the backend changes present in the working tree are Decision 136's, predating this one) — no backend/API/Engine file touched by this phase. Dev server restarted fresh; the new `showPinnedCart`/`cheapestPerNightForHotel`/`variant === "pinned"` code and `Input.tsx`'s `focus:border-gold` confirmed live via direct `curl` against the served bundle. **Not yet verified live in-browser** (no automation tool this session) — needs a real click-through by the project owner: search for a hotel, confirm the new card summary strip shows a correct minimum price, add a room to the cart and confirm it now appears pinned in a right column on a large screen (and still floats correctly on a narrow one), and complete a full add-to-cart → checkout flow to confirm the actual booking-creation logic is untouched.

---

# Decision 140

Date: 2026-08-03

Decision: Two live-reported layout iterations on `HotelSearch.tsx`, both found by the project owner on a real running search (screenshot with annotations), both purely presentational — no new features, no backend/API/pricing/business-logic change, same hard constraints as Decisions 137/139.

(1) **"Оформить заявку" moved to the top of the cart panel.** The checkout button used to be the last block inside `CartPanel`, below the room list. With a real multi-room trip the list grows tall enough to push the one action that finishes the whole flow out of view — the button that matters most was the first thing to disappear. Moved to sit directly under the panel's dark header, above the list, for both `variant` values (the floating mobile bubble's collapsed state is visually unchanged either way — header + button — so no separate handling was needed). Its border flipped `border-t` → a conditional `border-b` (`showList ? "border-b border-ink/10 p-3" : "p-3"`), so a collapsed floating panel doesn't render a dangling bottom rule. The `onClick`/`disabled={cart.length === 0}` guard/styling are byte-identical — only the position in the panel changed. Confirmed with the owner via `AskUserQuestion` before implementing (the annotated arrow pointed past the panel toward the top nav, which would have meant a cart button in `AgentTopNav.tsx` instead — a materially different, larger change; the owner chose the panel-top option).

(2) **Search + results area widened.** `main` capped at `max-w-6xl` (1152px), leaving roughly a third of a normal 1920 screen as dead margin on both sides — visible directly in the owner's screenshot, where the annotated "make this bigger" box spans ~81% of the viewport. Raised to `max-w-[96rem]` (1536px, matching that ~81%); Tailwind v4 dropped the old `max-w-screen-2xl` named utility, hence the explicit rem value. Because a 1/3-width cart column at that container width would be far wider than its own content needs, the pinned-cart grid switches to 4 columns at `xl` (`xl:grid-cols-4 xl:gap-8`, results `xl:col-span-3`), giving the extra width to the results and keeping the cart at ~360px. Below `xl` the original 3-column 2+1 split is untouched, and below `lg` the single-column + floating-cart layout is untouched. `ApplicationCheckoutForm` is a fixed overlay with its own `max-w-2xl` and is unaffected by the container change.

Reason: two real usability gaps reported by the project owner against the running app after Decision 139 shipped, not hypothetical.

Approved By: Daler (button destination confirmed via `AskUserQuestion` with previews before any code was touched)

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline (zero new). Only `frontend/src/pages/HotelSearch.tsx` touched — no backend file, no other page. Vite dev server (already running) confirmed serving the new code via direct `curl` against `/src/pages/HotelSearch.tsx` (`max-w-[96rem]`, `xl:col-span-3`, the conditional `border-b` on the moved button block all present). **Not yet verified live in-browser** — the browser-automation extension was declined this session, so this needs a real click-through by the project owner: confirm the checkout button now sits at the top of the "Поездка" panel with several rooms added, and that the wider layout looks right at his own screen width (including that the cart column doesn't get overly wide on a very large monitor).

---

# Decision 141

Date: 2026-08-03

Decision: One UI fix and one real data-completeness fix, both reported live off a running search screenshot.

(1) **Hotel-card image corners.** The gradient placeholder block sat flush against the card's own edges, so the card's `overflow-hidden rounded-2xl` clipped exactly one of its corners (top-left) round while the other three stayed square — three corners matching, one not, which is what the owner marked. Because `sm:items-start` (Decision 139) keeps the block sized to the header area rather than stretching to the card's full height, it only ever touches one rounded card edge, so no radius tweak on the card itself could make all four agree. Fixed by insetting the block (`m-6 mb-0`, the same 24px the content column's own `p-6` uses, `sm:mr-0` so the content padding provides the right-hand gap) and giving it its own `overflow-hidden rounded-2xl` — all four corners are now genuinely identical instead of depending on which card edge each one happens to touch. Purely presentational; the star badge, gradient, and every size class are otherwise unchanged.

(2) **Siyam World had no star rating at all.** `hotels.star_rating` was `NULL` for `hotel_id=13` since the row was created (2026-07-13), so `HotelCard`'s `hotel.star_rating != null` guard correctly rendered no badge — the card simply showed nothing where Kandima showed "★★★★★ 5". Not a display bug: the data was genuinely missing. Set to `5` (Siyam World Maldives is a real 5-star resort) via the existing `PUT /hotel-engine/hotels/13` endpoint with a real admin JWT — through Hotel Engine's own service/validators (`star_rating` 1-5 check), never raw SQL, so LOCKED Hotel Engine needed no change. Verified afterwards through `GET /hotel-engine/hotels`: both hotels in the database now return `star_rating = 5`. Same "real data gap, not a code bug" shape as Decision 105's missing cancellation policies — worth noting for the same reason: `star_rating` is nullable by design and nothing forces it at hotel creation, so any future hotel added without it will silently show no badge.

Reason: both reported directly by the project owner against the running app.

Approved By: Daler ("сделай все углы одинаковыми", "siyam world 5*")

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline. Only `frontend/src/pages/HotelSearch.tsx` touched in code; the star rating is a data change through the existing API, no file changed for it. Dev server confirmed serving the new corner classes via `curl`; the star rating confirmed via a real API read. **Not yet verified live in-browser** (browser automation declined this session) — needs the owner to refresh and confirm all four corners read as one shape and that Siyam World's card now shows its 5★ badge.

---

# Decision 142

Date: 2026-08-03

Decision: "DMC OS Design System v1.0" Phase 2 — the whole agent panel is now on one palette. Reported live with two side-by-side screenshots: `/agent-dashboard` (on entering) still rendered the pre-v1.0 coral/teal scheme — coral hero accent, solid-coral primary CTA, teal-and-coral featured-hotel tiles — while `/hotel-search` had already been migrated to navy/gold by Decisions 137/139, so the two screens read as two differently-lit products. Same hard constraints as every prior phase: no new features, no backend/API/Engine/business-logic/permission change, presentation only.

**Files touched (all agent-facing):** `AgentDashboard_v2.tsx`, `AgentTopNav.tsx`, `Reservations.tsx`, and the parts of `HotelSearch.tsx` Decision 139 hadn't reached.

**`AgentDashboard_v2.tsx`:** hero gradient `to-coral/40` → `to-gold/30` and its accent tag `text-coral` → `text-gold`, both now byte-identical to `HotelSearch.tsx`'s own hero band rather than merely "similar" (the previous code comment claimed they already matched — they didn't, which is exactly the drift this phase closes). The single "Найти отели" CTA became the same navy pill the search page's own submit button is (`rounded-full bg-ink`, `shadow-ink/30`) instead of a coral rounded-lg. Featured-hotel tiles moved from `from-ink to-teal`/`from-coral to-ink` to the `from-ink to-gold`/`from-gold to-ink` pair `HotelSearch.tsx`'s `CARD_GRADIENTS` already uses. Container widened `max-w-6xl` → `max-w-[96rem]` to match Decision 140's search-page width — two pages capping content at different widths read as two layouts even once the palette agrees.

**`AgentTopNav.tsx`:** the logo square and the user-avatar circle both used `from-coral to-teal` — the one element visible on every agent screen, and the only remaining place the retired palette appeared in the top bar. Both → `from-gold to-gold-deep`.

**`Reservations.tsx` (53 usages) and `HotelSearch.tsx`'s checkout flow (34):** mapped by meaning, not find-replaced — form focus rings/`focus:ring` → `gold` (matching `Input.tsx`/`Select.tsx`'s own Decision 139 change); selection/active states (selected room row, active date-mode chip, stepper progress, outbound correspondence bubble, lead-guest badge) → `gold`/`gold-deep`; error text, error banners, and validation-failed field borders → `danger`; submit-type CTAs → `ink`; status/success signals (`Confirmed`, `Partially Confirmed`, `Completed`, the "included" badge, a created-application row) teal → `success`, the genuine independent green Decision 137 introduced. Zero non-comment `coral`/`teal` references remain in any agent-facing file (verified by grep; the four remaining hits are explanatory comment text).

**Deliberately not touched:** the admin panel's own remaining pre-v1.0 files (`AdminBookingFinance.tsx`, `Contracts.tsx`, `ContractsAI.tsx`, `Invoices.tsx`, `financeShared.tsx`, `PriceCalculator.tsx`, `BookingsSubViews.tsx`, `AdminNav.tsx`, `Counteragents.tsx`, `Cashback.tsx`) and the public pages `Home.tsx`/`Register.tsx` — a separate phase, same staged discipline Decision 137 established. One real consequence disclosed rather than hidden: `AdminBookingFinance.tsx`'s "needs attention" badge is still coral and now sits inside an otherwise navy/gold `Reservations.tsx`; `Reservations.tsx`'s own `STATUS_CLASSES` comment was updated to say so explicitly instead of leaving a stale claim about where coral lives.

Reason: the project owner reported the two agent screens having visibly different "light" and asked for one scheme and one design.

Approved By: Daler ("сделай один свет и один дизайн", with two screenshots)

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline (zero new). Only frontend presentation files touched — no backend, no API, no `.json` locale, no logic. Dev server confirmed serving the recolored modules via direct `curl` (`AgentDashboard_v2.tsx`/`HotelSearch.tsx`: zero coral/teal served; `AgentTopNav.tsx`: the new gold gradient present). **Not yet verified live in-browser** (browser automation declined this session) — needs the owner to click through `/agent-dashboard` → `/hotel-search` → a booking's detail panel and confirm the light now reads as one product across all three, particularly that no status badge lost its meaning in the teal → success move.

---

# Decision 143

Date: 2026-08-03

Decision: Design System v1.0 remaining scope was presented to the project owner as a live preview artifact (six blocks A–F, each with a browser-rendered mockup on real project data — Kandima KM26_03 prices, the real 50%/14-day cancellation fee, real file/usage counts from a grep sweep). Owner approved and **re-ordered the plan: the entire agent panel first, admin panel only after it is finished.** This decision covers the first two agent-side blocks; the remaining agent-side work (shared table/panel/modal primitives, then the three-column search rework) follows in its own decisions, deliberately keeping the highest-risk screen last within the agent phase.

**Block E (agent scope) — stock Tailwind colors replaced with branded tokens in `Reservations.tsx`.** Decision 142 removed every `coral`/`teal` reference from this file but left 13 raw stock colors untouched (`red-500/600`, `red-50`, `amber-500/600`, `amber-50`) — visibly brighter than the branded `danger`/`warning` and sitting right next to them in the same panels. All 13 mapped: the cancellation panel's border/background/heading/fee-error/submit button → `danger`; the "awaiting hotel confirmation" notice and its adjacent action → `warning`; room-level rejection reasons and the list's own error row → `danger`.

**Block D — public pages (`Home.tsx`, `Register.tsx`, `Login.tsx`).** The first screens a new agent sees, still entirely on the retired palette, so a partner registered in one visual identity and landed in another. `Register.tsx`: focus rings → `gold`, invalid-field borders and all 11 field-error messages → `danger`, the "number accepted" confirmation and the success-state icon → `success`, submit buttons → `ink`, checkbox accents → `gold`, error banner → `danger`. `Login.tsx`: eyebrow → `gold-deep` (readable on its white card, unlike bright `gold`), checkbox accent → `gold`. `Home.tsx`: promo-slide gradients → the same ink/gold pair `HotelSearch.tsx`'s `CARD_GRADIENTS` uses, carousel active dot → `gold`, the slide's own CTA → `ink`. Its two hero CTAs needed a real decision rather than a mapping: both sit **on** the dark ink hero, where a navy primary fill would disappear entirely — so "Регистрация" became the single `gold` accent fill and "Вход для агентов" an outline-on-dark (`border-white/30 bg-transparent`), matching `Button.tsx`'s own Primary/Outline pairing adapted to a dark ground instead of two competing solid fills.

Verified by grep: zero non-comment `coral`/`teal` references and zero stock Tailwind color utilities remain in any agent-facing file (`Reservations.tsx`, `HotelSearch.tsx`, `AgentDashboard_v2.tsx`, `Home.tsx`, `Login.tsx`, `Register.tsx`, `AgentTopNav.tsx`).

**Correction to an earlier claim, found while building the preview:** Decision 139 recorded real hotel photos as impossible without a backend change, on the basis that no image field exists in the search response. The search response part is true, but the claim was too broad — Hotel Engine's `models.py` has had `hotel_images` and `room_images` tables since it was built, with real `POST /hotel-engine/hotel-images` / `GET /hotel-engine/hotels/{id}/hotel-images` endpoints. Both tables are empty (0 rows, verified directly) and store an `image_path` string, so what is actually missing is file hosting plus joining images into the search response — not the schema or the CRUD. Presented to the owner as Block F with two honest options (files committed into the project as a stopgap vs. real upload + storage); awaiting his decision.

Reason: owner-approved plan, re-sequenced by the owner to finish the agent panel before the admin panel.

Approved By: Daler ("мне нравится, предлагаю сделать сперва agent panel и всё, что связано с работой агента, и как закончим после этого сделаем admin panel")

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline. Frontend presentation only — no backend, no API, no locale, no logic. **Not yet verified live in-browser** — needs the owner to open `/`, `/register`, `/login` and a booking's cancellation panel.

---

# Decision 144

Date: 2026-08-03

Decision: Design System v1.0 **Block C, agent scope** — the agent panel now builds its table, its overlays and its detail fields from shared primitives instead of hand-rolled copies. Found on opening the block: `components/ui/Table.tsx` and `components/ui/Modal.tsx` already existed (Phase 0), and `Table.tsx`'s own header comment even names `Reservations.tsx` as one of the seven files it was extracted from — but only the **admin** pages ever adopted them (`AdminPanel`, `AdminBookingFinance`, `Counteragents`, `Cashback`). The agent-facing surfaces kept their own copies the whole time.

**Table.** `Reservations.tsx`'s bookings table (shell, head row, head cells, rows, cells, empty state, error row) now comes from `Table.tsx`. Columns, sorting, the admin extension slots, the skeleton first-load rows and the "needs attention" row treatment are all unchanged. Two additions to the primitive, both driven by what this migration actually needed: `TableShell` gained a `className` passthrough (the table dims itself during a background refresh), and new `TableNumericCell` gives money cells `tabular-nums` so digits stack instead of jittering row to row — right-alignment deliberately **not** applied yet, because `adminExtensions` appends further numeric columns after this one and moving them together belongs to the admin pass.

**Two real class-conflict bugs fixed in the primitives while adopting them** — the recurring failure mode where two utilities for the same CSS property land in one class list and the winner is decided by stylesheet order, not by the order they were written. (1) `TableCell` always emitted `text-slate/80`, while 13 existing call sites *also* pass a text color (`text-slate/50`, `font-medium text-ink`, `font-mono text-slate/40`, …) — every one of those was previously a coin flip. The default is now dropped whenever the caller supplies its own text color; verified against all 19 current call sites, listing which ones now resolve to the caller's color and which keep the base. (2) `TableRow` always emitted `hover:bg-sand/40` for clickable rows, which would have silently fought `Reservations.tsx`'s "needs attention" row — whose whole point (per its own long-standing comment) is that hovering *intensifies* the red alarm rather than washing it out to neutral sand. Same guard. Both fixes also make the pre-existing admin call sites deterministic, which they were not before.

**Modal.** Both agent overlays — the booking detail (`Reservations.tsx`) and the checkout wizard (`HotelSearch.tsx`) — now use `Modal.tsx`. It gained three additive props, defaults chosen so the two existing admin callers render byte-identically: `align="top"` (a tall working surface scrolls with the page instead of centering and overflowing — exactly what the booking detail already did), `panelClassName` (replaces rather than extends the panel's padding, so `p-8` / `max-h-[90vh] overflow-y-auto` don't collide with the default `p-5`), and `closeOnBackdrop`. That last one matters most: the checkout wizard has **never** closed on a backdrop click, and inheriting Modal's default would have meant a stray click beside the form silently discarding an already-filled set of guest passports, dates of birth and flight numbers. It is explicitly `closeOnBackdrop={false}`; the booking detail keeps its original click-to-close.

**DetailField.** New `components/ui/DetailField.tsx` — one "label above value, optional quiet hint line" pair, which the booking detail had hand-written twelve times, each copy free to drift in label size/weight/tracking. Its label styling *is* `tailwind.css`'s own documented Label convention, so adopting it is also how a page stops restating that rule by hand. All 12 fields migrated (agent, agency, handled by, hotel, room type, meal plan, transfer, booking date, dates + night count, guests, both flights with their date/time hint, special requests). **A first attempt at this migration by regex damaged the JSX** (it matched across neighbouring blocks, attaching one field's hint to another and leaving mismatched tags); the affected block was rewritten by hand instead, and content parity was then verified mechanically rather than by eye — all 72 `bookingDetail.*` translation keys present before and after, and every value expression (`claimerNames[...]`, `displayTransferName`, `displayRoom?.special_requests`, `effectiveBooking.nights`, …) at identical occurrence counts. Two labels were deliberately left alone: the "showing room X of Y" caption (not a label/value pair) and the "Итого" total (a deliberately larger `font-display text-2xl` treatment DetailField would have shrunk).

Verified afterwards: zero `fixed inset-0` overlays and zero hand-written `<table className=...>` remain in either agent-facing file.

Reason: owner-approved block C, agent panel first per his own re-sequencing.

Approved By: Daler ("закоммить и продолжи блок C")

Status: Implemented and verified. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline. Dev server confirmed serving the migrated modules. Frontend presentation/structure only — no backend, no API, no logic, no locale key changed. **Not yet verified live in-browser** — needs the owner to open the bookings list (sorting, the red "needs attention" row and its hover), a booking's detail overlay (every field still present, closing by backdrop click still works), and the checkout wizard (must NOT close when clicking beside it).

---

# Decision 145

Date: 2026-08-03

Decision: Design System v1.0 **Block A** — the three-column hotel search, the last block of the agent panel and the one deliberately kept until the end because `HotelSearch.tsx` is the screen that actually creates bookings. Owner confirmed photos are out of scope for now ("фото пока не надо"), so the colour placeholder stays and no image slot was designed in.

**Layout.** The search bar moved out of the results grid and now spans the full width above everything — one search governs all three columns, so it reads as the page header rather than as the first item of the left column. Beneath it: hotel list (left) → room/meal/transfer detail (centre) → trip cart (right), with `items-start` and both side columns `sticky top-4`. Column widths are explicit rather than equal fractions (`lg:grid-cols-[220px_minmax(0,1fr)_290px]`, `xl:grid-cols-[280px_minmax(0,1fr)_340px]`): the list and the cart each need a fixed modest width, and every remaining pixel belongs to the centre, which carries the actual decisions. Verified in the built CSS that both arbitrary templates really emit (`grid-template-columns:220px minmax(0,1fr) 290px` / `280px minmax(0,1fr) 340px`), along with `max-h-[calc(100vh-8rem)]` on the scrollable list — an easy class to write and never notice missing.

**New `HotelListRow`** — one row of the left column: gradient chip, name, stars, location, and the cheapest per-night price via the existing `cheapestPerNightForHotel`, i.e. the same figure `HotelCard`'s own summary strip shows, so list and detail can never quote different "from" prices. A hotel with no active contract shows that badge instead of a price, same as the card does. Built from `<span>`s inside the `<button>` rather than `<div>`s (a button's content model is phrasing content).

**Selection state.** New `selectedHotelId`, set to the first result at the end of every search so the centre column is never empty and never points at a hotel from the previous search; `selectedHotel` falls back to `results[0]` if the id no longer matches.

**The below-`lg` fallback is CSS, not a second render tree.** Every `HotelCard` stays mounted; at `lg+` the non-selected ones are `lg:hidden`. Deliberate: rendering only the selected hotel would unmount the others, so each card's own expanded-room-type state (and any per-room work in progress) would silently reset on every list click and on a window resize across the breakpoint. Below `lg` the page is exactly what it was before this block — every hotel stacked in one column, floating cart, no selection UI — so the layout verified in real use on a laptop/tablet is untouched.

**`HotelCard` gained one prop, `inColumnLayout`.** Its only effect: the colour placeholder is `lg:hidden` in the three-column layout. At `lg+` that block is pure duplication — the same gradient already identifies the hotel one row away in the left list — while costing the centre column roughly 300px of the width the room/meal/transfer rows need. Below `lg` there is no left column, so it still does its job and stays.

**i18n.** New `hotelList.found` key with real Russian plural forms (`_one`/`_few`/`_many`/`_other`) plus the English pair, following this project's existing rule that genuine grammatical pluralisation uses i18next plural keys rather than hand-rolled `mod10`/`mod100` logic. A `selectHint` key was added at the same time, then removed before finishing because nothing ever rendered it — no dead keys left behind.

Untouched by this block: pricing, special offers, transfers, occupancy limits, the cart's own add/remove/checkout logic, and `ApplicationCheckoutForm` in its entirety.

Reason: final block of the owner-approved agent-panel phase; the deferral in Decision 139 ("too large and risky to bundle with everything else") ends here, with the work done on its own and last.

Approved By: Daler ("фото пока не надо, делай блок A")

Status: Implemented and verified so far as this environment allows. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline; both locale files re-validated as JSON; dev server confirmed serving the new code. **Not yet verified live in-browser, and this block needs it more than any other so far** — the owner should check: the left list selects and highlights correctly, the centre column swaps hotels without losing an in-progress room selection, "Добавить в поездку" still lands in the cart, a full add-to-cart → checkout → real application still completes, and narrowing the window below the breakpoint still gives the old single-column page.

---

# Decision 146

Date: 2026-08-03

Decision: Block A follow-up, from the project owner testing the live three-column search against a real-scale question: **"with 1000 hotels you cannot show them all"** in the left-hand list. His proposal, implemented as specified — the agent picks hotels outright in the search field (numbered 3 on his screenshot), up to five; picking one means the list column (numbered 1) is not shown at all and the single result gets the full standard width instead of a narrowed centre lane.

**Multi-hotel picking.** The destination field now accumulates picked hotels as removable chips, capped at `MAX_PICKED_HOTELS = 5`. Choosing a suggestion adds a chip and clears the text instead of writing the hotel's name into the input; already-picked hotels are filtered out of the suggestion list, so the dropdown can never offer a duplicate. Above the cap the input is replaced by a plain "that's the maximum" line rather than silently ignoring further clicks. The chip row renders only once something is picked, so the ordinary single-hotel search looks and behaves exactly as it always has and the multi-hotel capability costs nothing until used. `handleSearch` searches the picked set in the order it was picked; the free-text matcher stays as the fallback for someone who types a destination and searches without picking, unchanged but no longer the primary path.

**Layout follows the result count, not the mode.** New `showHotelList = showPinnedCart && results.length > 1`. Two or more results keep the three-column grid; a single result switches to two columns (`lg:grid-cols-[minmax(0,1fr)_290px]`, `xl:[minmax(0,1fr)_340px]`) with no list column, and `inColumnLayout` is false for it — so the hotel's own colour placeholder comes back and the card renders at full standard width, exactly the "не уменьшенный вариант" the owner asked for. Keying this off the result count rather than off how the search was performed means a free-text search that happens to match one hotel also gets the full-width treatment, which is the same thing the agent would want.

**One extra hole closed, same root cause.** An empty search — no hotels picked, no text — previously matched every hotel in the catalog. Harmless with two hotels, and precisely the unbounded case the owner was pointing at with a thousand. `handleSearch` now requires either a picked hotel or some destination text before it will run (`page.hotelRequired`, checked before the existing date validation). This does remove the old "press Search with an empty field to see everything" shortcut, which is worth flagging explicitly rather than burying: it is a deliberate consequence, trivially reversible if the owner wants that shortcut back.

**i18n.** New `page.multiHotelHint`, `page.addAnotherHotel`, `page.maxHotelsReached`, `page.removeHotel`, `page.hotelRequired` in both catalogs. A sixth key (`pickedHotelAlready`) was added and then removed once the design settled on filtering picked hotels out of the dropdown — nothing rendered it, and this file keeps no dead keys.

Reason: real scale objection from the project owner against the layout shipped in Decision 145, with his own proposed solution.

Approved By: Daler (screenshot with blocks 1/2/3 marked, plus the two-point specification)

Status: Implemented and verified so far as this environment allows. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline; both locale files re-validated as JSON (30 `page` keys each, matching); all four arbitrary grid templates confirmed present in the built CSS (`220px minmax(0,1fr) 290px`, `280px …`, and both single-hotel variants); dev server confirmed serving the new code. **Not yet verified live in-browser** — needs the owner to check: picking two or more hotels gives the list + detail + cart layout, picking exactly one gives the full-width single card with no list column, the chip × removes a hotel, the sixth pick is refused with the maximum message, and an empty search now asks for a hotel instead of listing everything.

---

# Decision 147

Date: 2026-08-03

Decision: Agent-side booking detail made readable, plus the real bug the same screenshot exposed. Reported as "не всё ясно, надо делать его более понятным" against a live agent session on BK-000069.

**The screen was not only unclear, it was partly broken — session expiry was never handled anywhere.** The screenshot shows a red `Invalid token` under Номера and Гости stuck on "Загрузка..." forever. Diagnosed rather than assumed: both endpoints are plain `get_current_user` (no admin gate) and both return `200` with a freshly-issued token, while `ACCESS_TOKEN_EXPIRE_MINUTES = 30` and no refresh flow exists — so a tab open longer than half an hour starts 401-ing on every request, and until now *nothing in the frontend reacted to a 401 at all*. Each panel just printed the raw backend string or sat on a spinner, so an expired session read as "the app is broken" with no hint that logging in again was the entire fix. New `src/session.ts` owns this: `handleSessionExpired()` clears `token`/`role`/`user` (leaving them is what produced this project's old redirect-loop trap) and sends the browser to `/login?expired=1`, guarded by a module-level flag so the several requests that fail together produce one redirect, not several. Wired into the 401 branch of **all eight** `fetchJson` helpers (`Reservations`, `HotelSearch`, `AgentDashboard_v2`, `Contracts`, `ContractsAI`, `Counteragents`, `financeShared`, `PriceCalculator`) — admin side included, since the cause is global. `Login.tsx` shows a warning-toned "your session has expired, nothing was lost" notice when `sessionJustExpired()`, so the user isn't dropped on an unexplained empty form. A hard `location.assign` rather than router navigation is deliberate: module-scope helpers have no router context, and a full reload is the honest response to "every piece of state here was fetched with dead credentials".

**Clarity, each item traceable to something visible in the screenshot:**
- **Internal manager fields removed from the agent's view.** The facts grid opened with «Агент #2» (their own unresolved id), «Агентство —» (empty) and «Кто взял в работу: ещё не взято» (an internal queue state) — three fields before the first one that means anything to the person reading it. They are genuinely useful to a manager triaging other people's bookings, so they now render only when `adminExtensions` is present — the same structural boundary this file already uses for money, not a new permission flag. The grid now starts at the hotel.
- **Empty correspondence panel no longer renders.** It was drawing a bordered box containing only "Переписка пока пуста" — an empty container for an internal process, above the booking's own facts. It appears when there is a thread to read (agent included, Decision 103's read/write split untouched) or when the admin reply control needs a home.
- **«Тип трансфера: —» removed when there is no transfer.** A field whose whole content is an em dash costs a row and says nothing.
- **«Подтверждение отеля» heading no longer appears over nothing** — and, a real gap found while fixing it: `ConfirmationNumberEdit`/`RoomConfirmationNumberEdit` returned `null` outright for anyone without edit rights, so **an agent could never see their own booking's hotel confirmation number even after the hotel sent it**, while the heading still rendered above the empty space. Non-editors now get the number read-only; the heading renders only when there is a number or the right to add one.
- **Single-room applications no longer repeat themselves in the agent view.** The Номера block restated hotel, room type, dates, nights and guests — all already in the facts grid — and its status badge is provably identical to the booking's for one room (`service._recompute_booking_status` rolls a lone room's status straight up). Skipped in exactly that case; it still renders for a second room (where it is the room selector), for a room carrying a rejection reason the agent needs to read, and always for admin (approve/reject, per-room price).
- **Label punctuation made consistent.** Seven field labels ended in a colon while the rest didn't («ПИТАНИЕ:» next to «ТИП НОМЕРА»). Colons stripped from those seven only — the inline "Label: value" strings (`Штраф за отмену:`, `Кому:` …) legitimately keep theirs. Both catalogs, 7 lines each.

Note on an apparent problem that isn't one: `ru/reservations.json` has fewer `bookingDetail` keys than `en` (73 vs 77). Checked rather than assumed — the difference is entirely `_one`/`_other` plural pairs that English needs and the Russian catalog deliberately doesn't, because it uses invariant abbreviations ("ноч.", "взр.") per this project's own documented convention.

Reason: real confusion reported by the project owner against a live agent session, with a genuine functional bug behind part of it.

Approved By: Daler ("посмотри это agent panel, при подробнее на booking details, не всё ясно, надо делать его более понятным")

Status: Implemented and verified so far as this environment allows. `npx tsc -b`/`npx vite build` clean at the 2-error dead-file baseline; both `reservations.json` catalogs re-validated; dev server confirmed serving `session.ts` and the patched helpers. The 401 diagnosis itself was verified against the running backend (fresh token → `200` on both endpoints that were failing). **Not yet verified live in-browser** — needs the owner to open a booking detail as an agent (grid starts at the hotel, no empty panels, single-room bookings show no duplicate Номера block) and to confirm the expiry path by leaving a tab open past 30 minutes, or by clearing `localStorage.token` and clicking something: it should land on the login page with the notice, not print a red error.

---

# Decision 148

Date: 2026-08-04

Decision: **Booking Details rebuilt as a three-column Enterprise workspace.** Owner-specified 16-point brief, scoped explicitly to UI/UX: no backend, API, database, engine, business-logic, workflow or permission change. That constraint held completely — every figure, state and event below comes either from data the detail view already had, or from a pre-existing GET endpoint that already carried no admin gate. Files touched: `pages/Reservations.tsx`, `i18n/locales/{ru,en}/reservations.json`. `AdminBookingFinance.tsx` was **not** modified at all.

**Structural constraint the brief did not mention, and the reason this was done to the shared component rather than an agent-only copy.** `BookingDetail` is shared: `AdminBookingFinance.tsx` composes finance into it through the 9-slot `AdminBookingExtensions` interface established by the Admin/Agent Component Separation refactor, after two real production leaks (Decisions 102/106). A separate agent-only layout would have re-created exactly the divergence that separation exists to prevent, so the workspace is the shared component and all 9 slots were re-placed into the new grid, unchanged in contract: `renderStatusBadgeExtra` → hero, beside the status badge; `renderHeaderActions` → Quick Actions, in its own separated sub-block; `renderCorrespondencePanel`/`renderReplyLogButton` → centre column; `renderFinancialSummary` → right column, still replacing the base's own price block entirely; `onAfterClaim` and the three list-level slots untouched.

**Layout.** `lg` 12-col grid at 3/5/4 — left: booking reference (rooms selector, booking information, hotel/cancellation confirmations); centre: guests, flights, documents, correspondence, history; right: Booking Health, price, quick actions. `md` 2 columns, below that 1. The right column is source-ordered last but `order-first lg:order-none`, so when the columns stack the health/total/actions block lands above the reference data instead of below every field. Modal widened `max-w-6xl` → `max-w-[1400px]` (three real columns do not fit in the old width). New `SectionCard` wraps `Card` so all panels share one heading treatment instead of each writing its own.

**Booking Health — the new block, and the one the brief calls the most important.** Rule-based over stored data only: hotel confirmation (confirmed / waiting / **critical** once arrival is ≤7 days away and still unconfirmed), voucher, invoice, transfer selected, guest passports, approaching cancellation-penalty tier, plus an AI-check row that is an honest aggregate of the rows above rather than a separate claim. Worst tone drives the card's banner. Same category as this file's existing AI insight strip — plain threshold checks, no LLM call, no automated action. Two deliberate calibrations: guest-passport gaps escalate to critical only within 14 days of arrival (all 36 guest rows in the live database have `passport_number` NULL, so an unconditional red would have marked every booking in the system as broken), and a cancelled/rejected booking reports its terminal state instead of nagging about documents it will never need.

**Four brief items could not be delivered as literally written, each blocked by data that does not exist. Stated here rather than faked in the UI:**
- **Hotel photo.** `hotel_images` and `room_images` are both **0 rows**, and `main.py` mounts no `StaticFiles` route — so even a populated `image_path` could not be served. `HotelHeroMedia` renders the real image the moment one is reachable and a typographic placeholder (initials + star rating, from the real `GET /hotel-engine/hotels/{id}`) until then. No stock photo, no broken `<img>`.
- **Seven price lines → four.** Accommodation / transfer / mandatory tax / grand total. Meal is not separable: Contract Engine prices a room *per meal plan*, so the meal is inside the room figure, and the only way to split it is the contract's NET price — the exact internal cost Decision 102 removed from the agent's view. The agent-facing discount is omitted for the same reason (total + discount reveals the markup). The ready-made per-category breakdown at `/finance-engine/booking-rooms/{id}/commercial-lines` is `_require_admin`. Admin keeps its full breakdown through `renderFinancialSummary`, untouched.
- **Documents.** Voucher and Invoice only — LPO, Agent Statement and Credit Note are admin-only endpoints, so offering them to an agent would offer an action that returns 403. States are `Ready`/`Preparing` only: "Sent" and "Downloaded" are tracked nowhere in this project. Both documents are plain text (no PDF layer exists anywhere), so the button says "Download", not "Download PDF". The brief's specific complaint — the literal text "В работе" — is gone, replaced by cards that say *why* a document is not ready yet.
- **History.** No audit-log table exists. Real, stored events only: created, claimed, dates changed (`dates_changed_at` holds only the LAST change), every correspondence message, cancellation requested, cancellation confirmed. Guest edits, flight edits, manager approval, voucher generation and invoice issuing record no timestamp anywhere and are therefore absent — with a footnote in the card saying so. A complete history needs one new backend table and is deliberately left as a future task, not silently half-implemented.

**Timeline.** Seven real steps (created → claimed → approved → hotel confirmed → voucher → invoice → completed), with cancellation and rejection as their own separate tracks rather than greyed-out continuations of a path a cancelled booking never takes. **No "Waiting Hotel" step**, despite the brief listing one: that status exists in `BookingStatus`'s Literal but no code path ever sets it (verified against `booking/service.py` and against the live table, whose only values are Pending/Confirmed/Cancelled). Waiting on the hotel is shown the honest way — as the confirmation step not being reached yet.

**Smaller things fixed while in here, each a real gap rather than a restyle.** Flight details used to render inside the facts grid *only when already filled*, so an agent who had not entered them saw no sign the fields existed — they are now a permanent Flights card with the same `FlightNumbersEdit` write path and the same `canEditFlights` gate. Guest passport/nationality/date-of-birth were editable but only displayed when non-empty, making an incomplete guest look identical to a complete one — guest cards now always show all four fields with an explicit "не указано", which is the same gap Booking Health reports. Dates and guest counts were removed from the left card because the hero now carries them; both read the same `effectiveBooking`, so a multi-room application still shows the **selected** room's values, not the application's blended ones. Transfer moved from the facts grid into the Flights card (the brief groups it there) rather than being duplicated in both.

Three GET endpoints are newly called from this view — `/hotel-engine/hotels/{id}`, `/hotel-engine/hotels/{id}/images`, `/contract-engine/contracts/{id}/cancellation-policies`. All three verified agent-reachable: `_require_admin` does not appear anywhere in `hotel/api.py` or `contract/api.py`, and all three were called live and their response shapes checked against the new TypeScript interfaces. The invoice-status fetch was **de-duplicated**, not added: `useBookingDocuments` now serves the documents cards, the timeline and Booking Health from one request, so those three surfaces cannot disagree about whether an invoice is issued.

Reason: project owner's explicit 16-point brief — Booking Details "должен перестать выглядеть как обычная форма", becoming a workspace where an agent understands the whole state of a booking in 5–10 seconds.

Approved By: Daler (16-point brief, 2026-08-04; structure confirmed before implementation: "струкtura podtverjdayu, nachinay")

Status: Implemented. `npx tsc -b` and `npx vite build` both clean at the project's 2-error dead-file baseline (`AgentDashboard.tsx`, unrelated); every `t()` key mechanically verified present in **both** catalogs; the Vite dev server confirmed transforming the rewritten file without error; the three newly-called endpoints confirmed live against the running backend. **Not yet verified live in-browser** — the Chrome extension was not connected in this session, so the owner needs to open a booking as an agent and confirm: hero with placeholder + five figures, timeline highlighting the current step, Booking Health showing amber "ожидаем ответ отеля" plus a passport warning on the test data, four-line price, guest/flight/document cards, and history. Admin side needs the same pass in `Бронирования` to confirm all 9 extension slots still render in their new positions.

---

# Decision 149

Date: 2026-08-14

Decision: **"Flexible Dates" turned from a documented stub into a real feature — a server-side date scan in Pricing Engine plus a price strip / price calendar in `HotelSearch.tsx`.** The tab has existed since the Marriott-style search restyle, and `HotelSearch.tsx`'s own comment said outright what it was: *"Visual-only tab, per explicit scope -- no flexible-date search exists... Selecting 'Flexible Dates' just changes which pill is active; the calendar below keeps behaving identically either way."* `dateMode` was local state read by nothing. Files touched: `app/engines/pricing/{service,schemas,api}.py`, `pages/HotelSearch.tsx`, `i18n/locales/{ru,en}/hotelSearch.json`.

**What flexible dates mean here.** Stay LENGTH is held fixed and the check-in date moves across a whole month. The scan returns the cheapest bookable option per candidate date, rendered as a Mon–Sun price calendar; picking a cell is what ENDS flexible mode, writing real check-in/check-out dates and immediately running the ordinary exact-date search. Nothing downstream — results, cart, checkout, Booking Engine — ever sees a "flexible" booking, because there is no such thing. That is the whole reason this needed no change in any LOCKED engine.

**Whole-month is the only mode, by owner decision on seeing the first iteration.** That first iteration also shipped a `"window"` mode (±1/2/3 days around an already-chosen date) and a Период поиска toggle between the two; both were removed outright the same day rather than kept as an option — *"оставим только вариант весь месяц... остальные функции уберем все"*. The reasoning holds up: window mode required an exact anchor date to already be picked, so it could never be the first thing an agent reached for, and a month scan answers the same question more broadly ("when in this period is it cheap" rather than "is the day either side of this one cheaper"). What the agent actually needs is to move quickly between months **and years** — so the config panel is now a year navigator (‹ 2027 ›, bounded to `[current year, +5]`) over a 12-month grid with fully-past months disabled, replacing a flat rolling list of the next 12 months that could never reach a second year at all. Stay length stays, obviously: without it there is nothing to scan. `FlexibleDatesConfig` lost `mode` and `flexDays` entirely, `buildScanCandidates` lost its `checkIn` parameter, and every translation key belonging only to the removed mode was deleted from both catalogs rather than left orphaned. **The backend needed no change at all for this removal** — `scan_dates` takes an explicit list of candidate dates precisely so that choosing which dates to offer stays a UI concern.

**Two further owner refinements, same day, both UI-only.** (1) **Trip length is now a free number the agent types**, not a row of 3/5/7/10/14 preset pills — *"чтоб сам агент поставил, например 11 или 3 или 4"*. The presets were removed entirely rather than kept alongside the field. The input holds free text while being typed and commits to the config only when the value parses **and is already inside 1–30**, with blur snapping the box back to the value actually in effect; the earlier version clamped on every keystroke, which rewrote a half-typed "0" (on the way to "07") into "1" under the cursor. The backend needed nothing — verified live at 1/3/4/11/21/30 nights, all correct and consistent ($409/night × N for Kandima's Sky Studio, base 399 + the $10/night markup). (2) **The always-visible hint paragraph became a hover/focus/click "!" tooltip** (`InfoTooltip`, built locally — no tooltip component exists anywhere in this project yet, and one call site doesn't justify a shared `components/ui/` one), carrying a fuller four-step explanation of the whole mechanism plus an explicit what-is/what-isn't-in-the-price split.

**Double-clicking a month jumps straight to exact dates in it.** Single click still only selects the month for a scan; double click selects it AND hands off to the "Точные даты" calendar already showing that month. These are the two real intents an agent has in front of that grid — "scan this whole month for the cheapest dates" versus "I already know the month, let me pick the days" — and the second previously cost a separate trip up to the tab strip. The month key is passed to the handler explicitly rather than read back from state, so the handoff doesn't depend on whether the two `onClick` writes React fires first have landed yet; the buttons are `select-none` so the double click doesn't highlight the month name as text. Discoverability is deliberate rather than assumed: a visible hint line sits under the grid, each month carries the same text as a native `title`, and the "!" note repeats it — an affordance nobody is told about is one nobody uses.

**Month selection now carries across the tabs, both directions.** Switching to "Точные даты" with December 2027 chosen in flexible mode moves the calendar to December 2027 instead of dropping back to today's month, and switching the other way seeds `anchorMonth` from the month the calendar is currently showing. A third case is covered by re-anchoring `viewDate` every time the picker is **opened**: picking a date out of the price calendar writes check-in/check-out from the parent and never goes through `DateRangePicker` at all, so without this the agent could reopen the picker and be looking at a month a year away from the dates they had just chosen. That open-time re-anchor is the one behavior change reaching the other two callers (`Reservations.tsx`, `PriceCalculator.tsx`) — deliberate: opening a calendar on the month of the date already selected is correct everywhere, and the old behavior (keeping whatever month `viewDate` was first initialised with) was simply a latent bug.

**New endpoint `GET /pricing-engine/date-scan`, and why it lives in Pricing Engine.** The agent-facing price is Contract Engine's net plus this engine's markup/exclusive discount, so a strip built on raw net would repeat exactly the trust-breaking bug Decision 070 fixed (search showing one number, booking charging another). Pricing Engine now imports `contract_service`/`hotel_service` — a new import, but in the direction the dependency graph already runs (`hotel → contract → pricing → booking → finance`), so it stays acyclic; Booking and Finance already import downward the same way. Contract, Hotel and Booking Engine are not modified by a single line. Not admin-gated, same reasoning as `/agent-price` directly above it.

**Why a backend endpoint was mandatory, not a preference.** The existing exact-date search issues ~80 HTTP calls per hotel for ONE date pair (a price + agent-price call per room-type × meal-plan). A ±3-day scan over 5 hotels is ~2800 calls client-side. Measured server-side instead: a full sweep is 0.29s for Siyam World (15 room types × 1 meal plan) and 0.46s for Kandima (10 × 4).

**Correctness of the one optimization, verified rather than assumed.** `_net_ordering_is_faithful` lets the scan call `apply_agent_pricing` once for the winner instead of once per candidate (profiling put that at ~26% of scan time), but ONLY when no exclusive discount can apply — because the remaining transformation is then a flat per-night markup identical across candidates, which cannot reorder them. With an exclusive agent on a contract that has `ContractExclusiveDiscount` rows, it falls back to pricing every candidate. Verified against an independently-written brute-force sweep on **12 real cases** — both hotels, both fast and slow paths, including dates inside Kandima's real 50% exclusive window and Siyam's 10% one — all 12 matched to the cent AND picked the identical room type and meal plan. Guard rails also verified live: over-cap → HTTP 400, `nights=0`/`adults=0`/empty hotel list/empty date list → 400, unknown hotel id skipped rather than sinking the scan, unauthenticated → 401.

**Cost is bounded by a formula, not by today's catalog size.** `MAX_SCAN_UNITS = 40`, where a unit is one (hotel, date) pair — the thing that actually costs a sweep — so it stays meaningful at 500 hotels; the agent already cannot pick more than 5. The frontend sends candidates in chunks of 4 units and appends rows as they arrive, so the calendar fills progressively instead of freezing. Measured end-to-end through the real HTTP path: a whole month of one hotel is 4–7s arriving in 8 visible updates.

**It surfaces real money, and the jumps land exactly on the contract's own season boundaries** — verified by scanning whole months and printing every price change: Kandima December 2027 jumps on **26 Dec** ($3,318 → $4,816), which is precisely where that contract's Peak season starts (2027-12-26); Siyam World December 2026 jumps on **23 Dec** ($5,960.50 → $8,186.50), precisely where its Festive season starts (2026-12-23), plus a second real jump on 27 Dec. Month spreads of $1,498 and $3,308 respectively. A scan of the current month (August 2026) correctly returns 18 candidates rather than 31 (past days dropped) and prices none of them, since neither contract has started yet.

**Deliberately excluded, and said so in the UI.** `min_total` is the cheapest ROOM total only; transfer and mandatory tax are omitted because both depend on choices the agent has not made at this stage, and folding in a guessed one would make the strip disagree with the real quote that follows. The picker's own hint text and the panel subtitle both state this.

**Inherited limitation, surfaced honestly rather than worked around.** Contract Engine's `get_room_price` prices a whole stay off the season covering `check_in` — its own documented simplification. A candidate whose stay crosses a season boundary is therefore priced entirely at the check-in season's rate. Contract Engine is LOCKED and inventing a season-aware nightly rate in the scan would produce numbers the actual booking then contradicts, so the scan reproduces the same behavior and `scan_dates`' docstring records it.

**Pre-existing gap found while building this, NOT introduced by it and NOT fixed here.** `get_room_price` never consults `Rate.minimum_stay`/`maximum_stay` or the `minimum_stay_rules` table at all — they are CRUD-only, never read during pricing. Latent today (every `minimum_stay`/`maximum_stay` is NULL and `minimum_stay_rules` has 0 rows), but flexible dates make it reachable in a new way, since the agent now picks a stay length directly. Flagged for a future Contract Engine task rather than patched from Pricing Engine, which has no business enforcing another engine's contract rules.

**Side effect, intentional:** `Reservations.tsx` and `PriceCalculator.tsx` no longer render the Specific/Flexible segmented control at all. The tabs are now gated on a caller passing `onFlexibleChange`, so a caller that cannot honour flexible dates no longer shows a tab that does nothing — which is what all three callers did before this decision.

**Machine-readable reason codes, not sentences.** `unavailable_reason` returns `"no_active_contract"` / `"no_priceable_rooms"`; the frontend owns the RU/EN wording. Directly applies Decision 111's lesson that a sentence generated server-side bypasses i18next and freezes in whichever language it was written in.

Reason: project owner reported the tab as broken ("гибкие даты не работает") and approved the plan for stages 1–3 (backend scan, ±N-day mode, whole-month calendar).

Approved By: Daler (2026-08-14, "delai" against the presented plan)

Status: Implemented, backend verified live. `npx tsc -b` and `npx vite build` both clean at the project's 2-error dead-file baseline (`AgentDashboard.tsx`, unrelated); both i18n catalogs validated as parseable JSON and all 138 `t()` keys in `HotelSearch.tsx` mechanically confirmed present in **both**; every identifier and translation key belonging to the removed window mode confirmed to have zero remaining references anywhere in `src/`; the endpoint exercised over real HTTP including a Node script replicating the frontend's exact chunked request shape, across three months and both hotels. The first iteration (with window mode) was confirmed working in-browser by the owner via screenshot before that mode was removed. **The simplified version is not yet verified in-browser** — no browser tooling was connected in this session and `/hotel-search` is `role="agent"`-only, so the owner needs to open it as an agent and confirm: the Flexible tab shows trip length plus a year navigator over a 12-month grid (no period toggle), the year arrows reach 2027/2028, past months are greyed out, "Подобрать даты" fills a price calendar with the cheapest dates in green, and clicking a cell runs the normal search on those dates.

---

# Decision 150

Date: 2026-08-14

Decision: **Per-guest flight details — a traveller can now fly on a different flight from the rest of the party.** Until now an application carried exactly one set of flight fields on `Booking` (Decision 047), so a 5-guest, 2-room application had one arrival flight for everyone. Additive extension to LOCKED Booking Engine, same precedent as Decisions 084/089/090/097/104. Files touched: `booking/{models,schemas,service}.py`, `pages/HotelSearch.tsx`, `pages/Reservations.tsx`, `i18n/locales/{ru,en}/{hotelSearch,reservations}.json`.

**Schema: six nullable columns on `guests`**, mirroring `Booking`'s own flight fields rather than inventing a different shape — `arrival_flight_number/date/time`, `departure_flight_number/date/time`. Added by raw `ALTER TABLE` (Decision 084/089's technique); the database was backed up first, all 41 pre-existing guest rows verified untouched and NULL afterwards.

**NULL is meaningful, and is the normal case: it means "this guest is on the application's flight", not "unknown".** That single choice is what makes the whole feature purely additive — every existing application and every future one where the party travels together behaves exactly as before, with these columns NULL and nothing reading them.

**Deliberately NOT paired with a Booking-level "guests fly separately" boolean.** The real case isn't a binary mode but a mix — three of five travellers on the group flight, two arriving a day later on their own — and per-guest NULL-or-value expresses that exactly. A flag would be a second source of truth that could contradict the rows it summarises. The UI's radio button is therefore an *input convenience only*; nothing about the stored data is a "mode".

**`repository.create_guest`/`update_guest` needed no change at all** (they already take `**fields`), and neither did `POST /guests` or `PUT /guests/{id}` (already `**data.model_dump()` / `exclude_unset=True`). The four guest schemas now share a `GuestFlightFields` base instead of repeating six fields four times — which is exactly how `Booking`'s own flight fields ended up spelled out four separate times in that same file.

**Frontend — checkout.** The flight step gained a two-option choice: "Все летят одним рейсом" (default, byte-identical to previous behaviour — no guest ever sends flight fields) and "У кого-то свой рейс", which keeps the common flight AND lets individual travellers override it. Deliberately not "now fill in all five separately": an agent shouldn't have to retype the same flight five times to say that one person arrives late. A traveller left without an override simply travels on the common flight, which is precisely what a NULL row means server-side. The traveller list is derived from `buildGuestsPayload()` — the same dedupe the submit payload itself uses — so the names offered are exactly the guest rows that will be created, never a second list that could drift. Per-guest flights are keyed by the same name+DOB triple `findOrAdd` dedupes on, **not** by list position: going Back and editing a name can reorder that list, which would otherwise silently reassign somebody else's flight. The six inputs are one extracted `FlightFieldsGrid` used by both the common block and every override.

**Frontend — display.** A guest card shows an "own flight" block only for a guest who actually has one (showing the booking's flight on every card would make ordinary bookings look like individual arrangements). The Flights card, when anyone flies separately, names them and relabels its two legs "общий" — without that, those two legs read as "the whole party's flight", which stops being true the moment anyone has their own.

**Flight step redesigned on the owner's feedback ("логика работает, но дизайн сделать красивее и удобнее"), and the reason the first version looked wrong turned out to be a real, pre-existing project-wide bug.** `styles/components.css` applies `width:100%; padding:14px 16px; border:...` to **every** `input`, radios and checkboxes included, and Tailwind's preflight is deliberately excluded — so the mode radios rendered with the dot stranded on the far left and the text pushed to the far right, and the per-guest checkbox as a stretched double box. The codebase's own working precedent is explicit size utilities (`HotelSearch.tsx`'s transfer radio has always carried `h-4 w-4 accent-gold`). This step now avoids native radios/checkboxes altogether — the mode choice is two real selectable cards and the per-guest toggle is a pill, both `<button>` — which is both the better control here and immune to the rule. The rule itself is left alone and documented in CLAUDE.md's Known issues: a global exception would fix it everywhere but would also restyle `Login.tsx`/`Register.tsx`'s existing checkboxes, which nobody asked about.

Other design changes in the same pass: the flat 3×2 grid of six identical boxes became two captioned legs (Прилёт/Вылет, each with a plane icon), because native date/time inputs show only "dd/mm/yyyy" and "--:--" and the flight-number placeholder was the sole clue which row was which — an ambiguity that multiplies once the block repeats per traveller. Column widths are now 1.3/1/0.75 instead of equal thirds (a flight number needs room, a time input doesn't). The common-flight block carries a live "для N из M" badge so "common" isn't a claim the agent has to verify by counting. Each traveller row got an initials avatar and a gold-tinted active state, so five travellers scan as a list rather than a wall of near-identical boxes. Four `*Placeholder` translation keys the redesign stopped using were deleted from both catalogs rather than left orphaned (native date/time inputs ignore `placeholder` anyway — they are `aria-label`s now).

**Third pass, on the owner's next report ("добавил свой рейс — нет варианта выбрать его или сохранить... чтоб второй раз если смотреть увидеть для данного гостя уже выбранный конкретный рейс"): a saved state, and editing after creation.** Two real gaps, both closed.

(1) *In the wizard*, an override had exactly one state — permanently-open input fields. With five travellers that is five six-field forms and no way to read back what was actually entered for whom, and the single toggle both added an override and silently discarded a filled-in one. A traveller with an override now has two states: **editing** (fields + a "Сохранить рейс" button, disabled while every field is empty) and **saved** (a read-only two-line summary, "SU120 · 21 авг 2026 · 02:01"), with separate "Изменить" and "Убрать" actions instead of one ambiguous toggle. **Saving is display state only — an override still open at Submit is sent exactly the same as a saved one.** Deliberately: making Submit ignore unsaved fields would silently discard work plainly visible on screen, which is a worse failure than an un-collapsed card. A leg with only some pieces filled shows just those (a flight number without a confirmed time is a normal state, not an error).

(2) *After creation*, a guest's own flight was visible in `Reservations.tsx` but **not editable anywhere** — it could only ever be set at application time, so a traveller changing flights afterwards had no path but a direct API call. `GuestRow`'s edit form now carries the same own-flight section (a pill toggle, not a checkbox — same legacy-CSS reason). It sends the six fields **explicitly in both directions**: turning the toggle off must write nulls, and since the endpoint uses `exclude_unset`, omitting them would leave a removed flight silently in place. Verified live against the real endpoint with the exact payload the form now sends — set all six, change one leg while the other stays intact, toggle off and confirm all six cleared in the database, with the other guest's row and the booking-level flight both untouched; 9 checks, all passed, test data removed (guests back to 41, bookings 70, zero rows with flight data).

**Fourth pass — two live failures reported on a real submit, both with causes elsewhere than where they showed up.**

(1) **`[object Object]` as an error message.** Root cause reproduced exactly: FastAPI returns `detail` as a **plain string** for every deliberate `HTTPException` this project raises, but as a **list of `{loc, msg, ...}` objects** for a 422 request-validation failure. Both `fetchJson` copies did `if (body?.detail) detail = body.detail` and passed either straight to `new Error(...)`, so a 422 rendered as the literal text `[object Object]`. New `formatApiDetail` (added to `HotelSearch.tsx` and `Reservations.tsx`, which each carry their own `fetchJson` for the module-scope/i18n reasons documented there) turns the list into `field: message`, dropping FastAPI's leading `body`/`query`/`path` segment. The real captured 422 now reads *"departure_flight_date: Input should be a valid date or datetime…"*. **The 422 itself** came from a slipped keystroke turning a flight year into `122029` — beyond Python's `date` range. Flight date inputs now carry `min`/`max` bounds and a submit-time check (`isValidFlightDateValue`, 2000–2100) that names the problem instead of shipping it to the backend. The bounds are deliberately wide: this catches nonsense, it is not a rule about how far ahead a flight may be.

(2) **"пока не добавишь время PM или AM дальше не идёт".** Two compounding causes. `<input type="time">` renders in the **browser's** locale, so on this machine it demands an AM/PM segment and yields `""` until one is picked — the agent types 09:00, sees "09:00 --", and the value is silently empty. Worse, a partially-entered native date/time input is `badInput`, which makes the whole wizard `<form>` invalid, so the browser blocked Submit with no message anywhere on screen. Fixed at both levels: the form is now `noValidate` (this wizard does its own validation, and the native kind was actively harmful), and **every flight-time input in the project became a 24-hour text field** — `formatTimeInput` auto-inserts the colon while typing, `isValidTimeValue` rejects only a complete-but-impossible value like `25:70`, and a half-typed `09:3` stays un-flagged under the cursor but is caught at submit. This is not a workaround: the column is `String(5)` and the real values already stored are `08:45`/`14:20`, so plain text is the closer fit — locale-independent, always yields a value, and no AM/PM exists to forget. `FlightNumbersEdit`'s pre-existing native time inputs were converted too; leaving them would have meant the identical stored value being edited in two different formats on two screens.

Verified: 12 `formatTimeInput`/`isValidTimeValue` cases (including typing `09:30` one keystroke at a time and `21:45`, which natively would have required PM), 4 date-bound cases including the exact `122029-12-12` that caused the original failure, and 5 `formatApiDetail` cases run against the **real captured 422 body**. Both backend regression suites re-run and still fully green, database still at 41 guests / 70 bookings / zero flight rows.

**Real regression risk found and covered by a test rather than assumed away:** `GuestRow`'s save sends names/passport only, so a guest edit must not wipe that guest's flight. It doesn't, because the endpoint uses `exclude_unset=True` — but that is now an explicitly verified behaviour (check E), since if it ever stopped holding, every guest edit would silently clear their flight and nothing else would notice.

Reason: project owner, on making a real 2-room/5-guest booking — *"поletnoe dannie odin variant dlya vsekh, nado postavit opciu... vtoroi variant mojno vibrat raznogo turista vibrat na raznie poletnoe dannie"*.

Approved By: Daler (2026-08-14)

Status: Implemented, backend verified live. A scripted end-to-end run against the real HTTP API covers: a party splitting across flights (values checked in the response AND read back straight from SQLite), an all-on-one-flight application behaving exactly as before, adding a flight to a guest afterwards via `PUT /guests/{id}`, no bleed onto other guest rows, a name edit leaving the flight intact, explicit clearing still working, and no pre-existing guest row gaining flight data — **all 18 checks passed, and the script deletes everything it created** (guests table verified back at 41 rows, bookings at 70). One orphan test application from an earlier aborted attempt was found by check D and removed; allotments were confirmed byte-identical to the pre-change backup. `npx tsc -b` and `npx vite build` clean at the project's 2-error dead-file baseline; every new `t()` key confirmed present in both catalogs. **Not yet verified in-browser** — no browser tooling was connected, so the owner needs to make a real multi-guest application and confirm the radio, the per-traveller override blocks, and the resulting guest cards / Flights card.

---

# Decision 151

Date: 2026-08-15

Decision: **The admin Bookings screen fetches cancellation tiers once per CONTRACT instead of once per (contract, arrival date) pair.** One file, one effect: `pages/Reservations.tsx`'s `BookingsList` load effect. No backend change, no engine touched, no endpoint added — the endpoint already returns a contract's full tier list when `check_in` is omitted.

**Found by measurement, not by reading.** The project owner asked what would break at 100 applications/day, so 500 real applications were generated through the real `POST /booking-engine/applications` (500/500 succeeded, 49s) into an **isolated copy** of the backend and database running on port 8002 — the real `dmc.db` was verified untouched before and after (72 bookings both times). The load screen's request sequence was then replayed exactly, capped at 6 parallel connections to match Chrome's per-origin HTTP/1.1 limit.

| | today (72 bookings) | at volume (500) |
|---|---:|---:|
| requests to draw the screen | 26 | **309** |
| of which cancellation tiers | 19 | **302** |
| distinct contracts behind those 302 | 2 | **2** |
| tier rows those 302 requests actually returned | — | **12** |

The fan-out grew with **booking volume**, not with catalog size: 302 requests to slice the same 12 rows, 51 sequential rounds at 6 connections. On localhost that cost 0.95s and looked harmless, which is exactly why it survived — the cost is almost entirely round trips, so it only appears once there is a network:

| network latency | before | after | |
|---|---:|---:|---:|
| 0 ms (localhost) | 309 req / 0.92s | 9 req / 0.11s | 8.7× |
| 20 ms | 309 req / 2.06s | 9 req / 0.27s | 7.7× |
| 50 ms | 309 req / 3.71s | 9 req / 0.42s | 8.8× |
| **100 ms (real server)** | **309 req / 6.46s** | **9 req / 0.73s** | **8.9×** |

The selection that moved into the browser builds all 302 keys in **0.6 ms**.

**`tiersApplicableTo` is a deliberate client-side mirror of `contract/service.py`'s `get_cancellation_policy`**, including its both-or-neither quirk (a tier with only one bound set matches neither branch and is excluded) and its inclusive bounds. ISO date strings compare correctly with `<=`, so no date parsing is involved. Same precedent as `financeShared.tsx`'s `computeBookingFinancials` (Decision 101). The alternative — a new bulk endpoint accepting many dates — was rejected as a larger change to a LOCKED engine for a rule this small; the trade is recorded honestly in the helper's own comment: **if `get_cancellation_policy`'s rule ever changes, this must change with it.**

**Equivalence was proven, not assumed.** The mirror was compared against the server's own answer for **all 302 real pairs** from the 500-application dataset: 302/302 identical, and all 302 were non-empty (so it is not a trivially-both-empty comparison). Additionally every one of the **12 exact window-boundary dates** (each tier's first and last day) matched, and four deliberately outside-every-window dates matched at 0 rows each. The same check was then re-run against the **real production database**: 19/19 pairs identical, 19 requests → 2. `npx tsc -b` and `npx vite build` clean at the project's 2-error dead-file baseline. The map's shape (`"contractId|arrivalDate"` → tiers) is unchanged, so `computeCancellationDeadlineFlags` and every other consumer are untouched.

**Deliberately NOT changed in this decision, though measured:** the `limit=500` cap with no pagination — at volume the copy held 572 bookings and the screen received 500, leaving **72 already silently invisible** (at 100/day the cap is one working week). And the two remaining per-booking `?check_in=` calls in `BookingDetail`/Booking Health are one request per opened booking, not a fan-out, and are correct as they stand.

**What the measurement cleared of suspicion:** the database and backend are not the bottleneck — the 500-booking query runs in 0.03s, creating a full application takes ~0.1s including pricing, and opening one booking costs 9 requests regardless of volume. The entire problem was the frontend's request shape.

Reason: project owner, after reviewing the admin panel — *"дай свой комментарий что можно улучшить для работы при нагрузке каждый день 100 заявок"*, then *"сделай 500 тестовых заявок и покажи точные цифры"*, then *"да делай первый пункт"*.

Approved By: Daler (2026-08-15)

Status: Implemented and verified. **Not yet confirmed in-browser** — no browser tooling is connected, so the owner should open the admin Bookings screen and confirm it still renders identically (in particular the amber "cancellation deadline approaching" AI flags, which are the only consumer of this data).

---

# Decision 152

Date: 2026-08-15

Decision: **Real pagination for the admin Bookings screen, with every filter and the sort moved server-side.** Files: `booking/{repository,service,api}.py` (additive extension to LOCKED Booking Engine, same precedent as 084/089/090/097/104/150), `pages/Reservations.tsx`, `i18n/locales/{ru,en}/reservations.json`.

**The cap was losing data, measured not guessed.** At 500 generated applications the copy held 572 bookings, the screen fetched 500, and **72 were unreachable with nothing in the UI saying so**. The list is newest-first, so it is the oldest that vanish. At 100 applications/day that cap is one working week.

**The bigger finding, which is a correctness bug rather than a cap.** All filtering and sorting ran in the browser over whatever slice had been fetched (`Reservations.tsx`'s `filteredSorted`). That silently turned *"who is staying next week"* into *"who among the newest 500 bookings is staying next week"* — an answer that looks right and isn't, and it was already wrong today, before any pagination. Simply adding pages without moving these would have made it worse, because a filter would then have meant "within these 50 rows". So the three "By date" views (**staying** — stay interval overlaps the range, excluding Cancelled/Rejected; **created** — created_at within the range; **cancellations** — arrival in range and status Cancelled) moved into `repository._apply_booking_filters` **verbatim**, alongside new `status`/`hotel_id`/`agent_id` filters and a whitelisted `sort_by`/`sort_dir`.

**Backend shape.** `GET /bookings` gained the new optional params (all default to previous behavior, so no existing caller changes) and a sibling `GET /bookings/count` returning `{"total": N}` from **the same `_apply_booking_filters` helper** — a page and a total computed from different filter sets is exactly how a list ends up claiming "1-50 of 400" over 120 real rows. `/bookings/count` is declared **above** `/bookings/{booking_id}`: that route's param is an `int` and FastAPI matches in declaration order, so a later `count` would be swallowed and fail parsing — the exact bug `api/routes.py`'s `/agent-registrations/stats` still has (documented in CLAUDE.md), deliberately not repeated. Every non-default sort appends `Booking.id` as a tiebreaker so a page boundary can't repeat or skip a row when two share an `arrival_date`.

**A real bug the tests caught, not review:** `_booking_order_by` returned a tuple and was passed to `query.order_by(...)` as a single argument — every sorted page returned HTTP 500. `order_by()` takes criteria as separate arguments; it now always returns a tuple and callers splat it. Found by the pagination test on its first run.

**Three knock-on effects handled rather than ignored:**
- **AI flags** (`pending_soon`, `cancellation_deadline`) were computed from the loaded list, so pagination would have quietly shrunk them to 50 rows. They now have their own fetch bounded by *arrival* date (60-day horizon, sorted ascending so a cap would drop the furthest arrivals, never the most urgent), independent of the user's current filters. This is also **strictly more complete than before**: the admin screen's default view fetches only bookings *created today*, so a stay arriving in three days but booked last month could never raise a flag at all. If the cap is ever reached the strip says so instead of under-reporting silently.
- **Filter dropdowns** were built from `new Set(bookings.map(...))`. On a page of 50 Pending rows that would have left "Pending" as the only selectable status — trapping the user inside their own filter. Statuses now come from a fixed list mirroring `BookingStatus`, agents from the already-fetched user map.
- **`renderListSummary`** now receives one page, so its "Total profit" is page-scoped. Said out loud in the UI rather than left to be assumed; a true across-the-filter aggregate needs its own Finance endpoint and is not pretended here.

**Also generalized:** the mid-selection refetch guard (`createdDateKey`) covered only the "created" view; now that all three views hit the server, all three could trigger the refetch-mid-date-pick flicker it exists to prevent, so it covers all three and includes the view in its key. And the agent-scoped screen moved from `/agents/{id}/bookings` to the paginated `/bookings?agent_id=`, verified to return the identical set — same auth level, so no change in exposure.

**Measured, at 500 applications:**

| network latency | before | after | |
|---|---:|---:|---:|
| 0 ms (localhost) | 309 req / 1.52s | 11 req / 0.12s | 12.7× |
| 50 ms | 309 req / 3.68s | 11 req / 0.43s | 8.6× |
| **100 ms (real server)** | **309 req / 6.38s** | **11 req / 0.77s** | **8.3×** |

Rows transferred to draw the screen: **500 → 50**. Reachable bookings: **newest 500 (72 unreachable) → all 572 across 12 pages**.

Approved By: Daler (2026-08-15, "polniy variant delai")

Status: Implemented and verified. Backend proven at **both** 72 and 572 bookings: each of the three date views compared against the old client-side predicate over four date windows, every status/hotel/agent filter and two combined filters compared against ground truth, `count` equal to the row count for seven filter sets, pages tiling the full set with **no duplicate and no gap** across three sort orders, sort direction actually applied, and the no-parameter call byte-identical to before (still newest-first; an unknown `sort_by` falls back rather than erroring). The exact query strings the rewritten screen builds were then replayed — nine filter combinations, each checked for count-vs-rows agreement and for page 1 being the true prefix of the full order — plus Decision 125's "search ignores the date scope" rule re-proven, and the agent-scope switch proven set-identical. Decisions 150/151's suites re-run green afterwards. `npx tsc -b`, `npx vite build` and `npx oxlint` all clean (tsc at the project's 2-error dead-file baseline). **Not yet confirmed in-browser** — the owner should open `Бронирования`, page through, and check that filters/sort/search behave and that the "Showing X–Y of N" count matches. Note the AI-flag path could not be exercised with real rows: no booking in either dataset arrives within 60 days, so its query was verified correct (returns exactly the arrivals in range — zero) but never with a populated result.

---

# Decision 153

Date: 2026-08-15

Decision: **A flight date that cannot belong to a stay is now refused outright, not merely warned about.** Files: `booking/{validators,service}.py` (additive extension to LOCKED Booking Engine), `pages/{HotelSearch,Reservations}.tsx`, both i18n catalogs.

**Confirmed live before writing anything.** The owner asked whether check-in 22.11.2027 with a flight of 20.12.2020 is really accepted. It was: a real application went through the API and stored an arrival flight **2528 days before check-in** and a return flight **719 days before the outbound**, with no error anywhere. `booking/schemas.py` had no Pydantic validators at all, and `validators.py` never mentioned flights. The test booking was deleted afterwards.

**Two tiers, because both extremes are wrong.** Blocking everything unusual would break real itineraries (a night flight landing the day before check-in, a departure the morning after check-out, or an agent who genuinely doesn't know the flight yet and leaves it blank). Warning about everything leaves nonsense in the database. So:

- **Refused (HTTP 400), in `validate_flight_dates`:** an arrival flight more than **365 days** from the check-in date, a departure flight more than 365 days from the check-out date, or a **departure flight earlier than the arrival flight**. The owner set the year threshold directly — *"не бывает время трансфера через год после их проживания"*.
- **Warned, never blocked:** more than 3 days off the stay. Shown live in the checkout as the agent types, and as a new **Booking Health** item ("Flight dates") on existing bookings, which is how rows stored before this validation existed become visible instead of sitting silently in the database.

**Anchored to the STAY, deliberately not to today.** Bookings get edited long after travel has happened — a completed August stay still gets its guest list corrected — and anchoring to the current date would make every historical booking un-editable. A past stay with past flights is valid; a 2027 stay with a 2019 flight is not, and one rule judges both.

**Applied on every write path that can carry a flight date**, not just the one the owner happened to hit: `create_booking_application` (the application-level flight **and** each guest's own override, checked before any pricing or inventory work), `update_booking`, `create_guest`, `update_guest`. The two edit paths validate only the fields actually present in the payload, filling the rest from what is already stored — so a partial edit is judged on the booking's real resulting state rather than on nulls the caller never sent, and editing a guest's **name alone** is unaffected by the flight rule.

**The frontend mirrors it, the server decides it.** `flightDatesImpossible` reproduces the same rule so the agent finds out while typing rather than losing a filled-in wizard to a 400; `flightDatesSuspicious` drives the softer warning. Multi-room applications validate against the first room's dates — the same "representative" row whose dates become the Booking's own, so client and server judge identically.

**Existing data is affected, on purpose:** BK-000074 and BK-000075 (the owner's own test rows, gaps of 459–9775 days) can no longer be re-saved without fixing their flight dates, and now show a Booking Health warning. BK-000002's real 32-day departure-flight gap is inside the hard bound, so it is warned about and still editable.

**Revised the same day, after the owner tested it — and the report uncovered a real hole as well as a threshold disagreement.** *"если дата трансфер отличается 3-4 дня система не предупреждает... от 1 дня до 365 дней предупреждения"*. Two separate causes:

1. **Threshold.** The warning fired only above 3 days, on the reasoning that a night arrival the day before check-in is normal enough not to mention. The owner's call overrides that: warn on **any** difference, 1 day upward. It only ever produces a line of text, and a one-day slip is also exactly what a typo looks like. `FLIGHT_DATE_WARN_DAYS` is now 0 in both files. Verified on his own booking BK-000076 (arrival 2 days off, departure 3 days off) — silent before, both warn now.
2. **A real hole, not a threshold.** The notice was rendered **only under the common flight block**. A traveller's own flight (Decision 150) could be any number of days off the stay and say nothing at all — so if he tested there, no gap would have warned. Extracted into one `FlightDateNotice` component now rendered in **three** places: the common flight, each open per-guest override, **and the saved per-guest summary** (otherwise pressing "Сохранить рейс" would make the warning vanish without the date changing). The component also shows the hard-refusal case in red while typing, instead of only on submit.

The refusal message now names the actual reason — *"отличается больше чем на год ({{days}} дн.) — заявка не будет принята"* — rather than a generic "isn't possible". The backend rule and its 365-day bound are unchanged; only the reporting tier moved.

Reason: project owner — *"если не логично добавляется вообще не принимать... дата заезда 22.11.2027 и трансфер на 12.12.2019 этого не может быть"*, then after testing: *"от 1 дня до 365 дней предупреждения, если отличается больше года — не принимается"*.

Approved By: Daler (2026-08-15)

Status: Implemented and verified. 18 live checks over every write path: five impossible cases refused (including the exact 20.12.2020 report, a two-years-*late* flight, a reversed pair, and a guest's own override), six legitimate ones accepted (flights on the stay dates, night-before/morning-after, no dates at all, 364 days off), the 365-day boundary confirmed on both sides (364 accepted, 366 refused), both edit paths refusing nonsense while still saving sensible values, a name-only guest edit unaffected, and a partial edit correctly judged against the stored other leg. All test data removed (72 bookings / 46 guests, unchanged). The Booking Health check was run against the three real bookings that carry flight dates and flagged exactly the expected gaps, leaving a normal booking clean. Decisions 150/151/152's suites all re-run green. `npx tsc -b`, `npx vite build` clean; `npx oxlint` shows only the pre-existing fast-refresh advisories this file already had. **Not yet confirmed in-browser** — the owner should try entering a nonsense flight date in the checkout and open BK-000075 to see the new Booking Health row.

---

# Decision 154

Date: 2026-08-15

Decision: **The LPO now carries per-guest flight data, and pressing "Send" actually attempts to send.** Files: `booking/{models,schemas,service,api}.py`, `pages/{AdminBookingFinance,Reservations}.tsx`, both reservations catalogs.

**"LPO не работает" turned out to be three separate things, only one of which is about the LPO text.** Diagnosed live before changing anything:

1. **Nothing was ever emailed.** `POST /correspondence/send` never referenced `email_service` at all — it wrote a row and returned. Its own docstring said "record-only". So an LPO the manager believed had gone to the hotel had simply never left, with nothing on screen saying so.
2. **Nothing could be emailed even if it tried.** `backend/.env` does not exist, so `SMTP_USER`/`SMTP_PASSWORD` are empty and `send_real_email` prints to console and returns `False`. **This one needs the owner's SMTP credentials — it cannot be fixed from code.**
3. **The "To" field is empty.** `Hotel.email` is NULL for every hotel; the address the LPO would go to isn't in the database yet.

Separately, and matching the owner's actual request: **per-guest flights (Decision 150) were entirely absent from the LPO.** Both builders read only `booking.arrival_flight_*`, and `GuestRef` carried nothing but names — so a party splitting across flights produced an LPO telling the hotel they all arrive together, on the one piece of information an airport transfer is arranged from.

**What was built.** A shared `buildFlightSection(booking, guests)` used by **both** the single-room and multi-room LPO, so the two cannot describe the same trip differently. When nobody flies separately it emits exactly the previous two rows. When someone does, the group legs are relabelled "(group)" — the same reason the booking screen relabels them — and a second table lists each separately-flying traveller's own arrival and departure. In the multi-room builder the guest list is deduped by name across rooms, so a traveller occupying two rooms appears once. Verified against real booking BK-000075: the group legs render, and guest "123 123" appears with their own 222/3333 flights beneath.

**Sending is now real.** `send_correspondence` calls `email_service.send_real_email` for each recipient, wrapped so an email failure can never destroy the record of what was composed. New `booking_correspondence.delivered` column (nullable Boolean, added by raw `ALTER TABLE`; all 23 existing rows NULL = unknowable): **True** = SMTP accepted it, **False** = recorded only, **NULL** = predates the column. Deliberately separate from `status`, which tracks the *conversation* (sent/replied), not delivery. Keyed to the **primary** recipient only — a secondary copy going out while the hotel's own address failed is not a delivered LPO. The correspondence thread now shows an amber "Recorded but NOT emailed: mail is not configured. Copy the text and send it from your own mail client." on any outbound row with `delivered === false`, and shows nothing for the pre-existing NULL rows rather than guessing about them.

**Deliberately not done:** no SMTP credentials were invented or hardcoded, and no hotel email addresses were guessed. Both are real data the owner has to supply; everything is wired so that the moment `backend/.env` exists, sends start working and `delivered` starts coming back True with no further code change.

Reason: project owner — *"в admin panel единый LPO со всеми данными нужно создать и полётные данные. Сейчас есть LPO, не работает."*

Approved By: Daler (2026-08-15)

Status: Implemented and verified. The three failure causes were each reproduced against the live backend before any change (the send path confirmed to never reference `email_service`; `.env` confirmed absent; `Hotel.email` confirmed NULL for both hotels). A real LPO send was then performed end-to-end and came back `delivered: false` — recorded, honestly reported as not emailed — and the test row was removed (correspondence back to 23 rows). The new flight section was rendered against real booking BK-000075 and produced the group legs plus the separately-flying guest's own flights. All five existing regression suites (Decisions 150/151/152/153) re-run green. `npx tsc -b` and `npx vite build` clean at the project's dead-file baseline. **Not yet confirmed in-browser**, and **two blockers remain that only the owner can clear: SMTP credentials in `backend/.env`, and real hotel email addresses** (the latter is already tracked as a backfill task — the addresses exist in the contract PDFs).

---

# Decision 155

Date: 2026-08-15

Decision: **Stages 1+2 of the booking-integrity plan: the progress strip stops lying, and entering a hotel confirmation number stops being anonymous.** Files: `booking/{models,schemas,service,api}.py`, `pages/Reservations.tsx`, both reservations catalogs.

**The evidence, pulled from the live database before writing anything.** BK-000077, the booking on the owner's screenshot: `status = "Confirmed"`, `confirmation_number = "123"`, `claimed_by = NULL`, **zero outbound LPO messages, zero inbound replies**. Nobody took the booking on, the hotel was never asked, and the system nonetheless called it confirmed, released a voucher to the guest and reported profit on it.

**Problem 1 — three parts of one screen disagreeing, all technically correct.** `buildTimeline` was a strict queue: the first not-done step became "current" and *everything after it* rendered "upcoming" regardless of its own flag (the code said so explicitly, reasoning that a filled dot after an empty one reads wrong). On BK-000077 the only incomplete early step was **claimed**, at position 2 — so three genuinely finished stages (Approved, Hotel confirmed, Voucher ready) rendered grey, while the header badge said "Confirmed" and Booking Health listed both the confirmation and the voucher as done.

Now every step carries **its own** state, and a step completed while an earlier one is still open gets a new amber **`skipped`** state rather than a quiet green tick — because that ordering *is* the signal (a confirmation number typed by someone who never took the booking on). A new `ProgressSummary` above the strip gives one sentence — "Reached: X · next step: Y" — plus what was done out of order and what is still outstanding. It is derived from **the steps, not from `booking.status`**: the status column says what someone set, the steps say what actually happened. On BK-000077 the strip now reads Approved/Hotel confirmed/Voucher ready as amber "out of order", with the warning naming all three.

**Problem 2 — the one milestone with no actor.** Cancellation records `cancelled_by`, a room approval records `approved_by`, but `confirmation_number` — the single field that makes a booking count as hotel-confirmed and triggers the guest's voucher — recorded nobody. New `confirmation_number_by` / `confirmation_number_at` columns (raw `ALTER TABLE`, all 74 existing rows NULL), stamped in `update_booking` where the value actually changes, and **only when it genuinely changed** — so re-saving an unrelated field never rewrites who confirmed it (verified). `update_booking` gained an `acted_by` parameter threaded from `current_user.id`; it is not trusted from the payload.

The same write **auto-claims** the booking when nobody holds it. Deliberately auto-claim rather than refuse: blocking the save would leave a real hotel reply unrecorded, which is worse than recording it under the name of whoever entered it. Either way "who handled this" can never be blank again on a confirmed booking.

**Deliberately NOT in this decision:** the verification rules themselves (was an LPO ever sent? did the hotel reply? do the reply's dates match?) — that is stage 3 of the agreed plan, and the larger piece. This decision makes the existing truth *visible and attributable*; it does not yet judge whether that truth is correct.

Reason: project owner, on the admin panel — *"статус заявки не соответствует наверху по списку... система подтверждает всё без единой перепроверки, и непонятно кто брал заявку в работу"*, then approving stages 1+2 of the plan.

Approved By: Daler (2026-08-15, "da nachinay s 1+2")

Status: Implemented and verified. Accountability proven end-to-end against the live API: entering a confirmation number recorded `confirmation_number_by=1` (System Administrator) with a timestamp and auto-claimed the booking; a subsequent unrelated field edit left both untouched. BK-000077 was then **restored to its exact screenshot state** (`confirmation_number='123'`, all audit fields NULL) so the owner sees the same booking he reported. The new timeline logic was run against that booking's real flags and produces the corrected reading shown above. All five existing regression suites (Decisions 150–154) re-run green; `npx tsc -b`, `npx vite build` and `npx oxlint` clean; all 420 `t()` keys present in both catalogs. Database backed up before the schema change. **Not yet confirmed in-browser** — the owner should reopen BK-000077 and check that the three finished stages now show amber "out of order" with the summary sentence above the strip.

---

# Decision 156

Date: 2026-08-15

Decision: **Booking Detail de-duplication (done) + agreed accordion layout (NOT yet built).**

## Part A — shipped: duplication removed, interface only

Owner's constraint, verbatim: *"мы логику не меняем и схему не меняем, только интерфейс и где повторяется убираем их"*. Nothing below touches the backend, the schema, or any computation — only what is rendered.

Measured duplication on the reported screen, before changing anything:

| Block | Genuinely new | Already shown above |
|---|---|---|
| Rooms (single room) | status, price | hotel, room type, dates, nights, occupancy — all in the hero |
| Booking information | agent, agency, handled by, special requests | hotel, room type, meal plan, booking date — all in the hero |
| Booking Health → hotel / documents / invoice | — | timeline steps 4–6, plus the progress summary's "still outstanding" |
| Booking Health → transfer | — | the Transfer line under Flights |
| Booking Health → guest details | — | visible in the guest cards ("not provided") |
| Booking Health → AI check | — | by its own docstring, a count of the items beneath it |

Five of seven health items were restating the same screen. Changes made:

- **`visibleHealthItems`** — a **display filter**, `computeBookingHealth` untouched. Hides `ok` items and the `ai` aggregate, and hides hotel/documents/invoice unless **critical** — "unconfirmed and arrival is in 3 days" is an escalation the timeline cannot express, whereas plain "waiting" is exactly what the timeline already shows. **An all-clear card renders nothing at all** (owner: *"да, сворачивай только проблемы"*).
- **Booking information** dropped hotel / room type / meal plan / booking date.
- **Rooms** on a single-room booking shows only status + price. A multi-room application keeps every line — there the rooms genuinely differ from each other and from the hero's representative room, so repeating them is information, not noise.

**Not merged, and why:** Guests and Flights look like duplicates but are not — the guest card carries that guest's OWN flight (Decision 150) while the Flights card carries the group flight and the transfer. Two different contents in two blocks. Merging them is a layout choice, which fed into Part B rather than being done blind.

## Part B — agreed with the owner, NOT built

Reported after Part A: *"много мест, но всё равно часть деталей внизу надо искать... шрифты будто мёртвые... давай сверху всё поставить как блок и нажимаешь — его данные открываются полностью... не надо в одном экране 3 блока"*.

Diagnosis from the screenshots: three columns of unequal height (`lg:col-span-3 / 5 / 4` under one grid at `Reservations.tsx:3365`), so the left column ends while the centre and right continue — Quick Actions sits two screens down. Nearly all text is `text-xs` in light grey, labels and values styled alike, which is what reads as "dead".

**Agreed target:**

- Always visible, never collapsed: hero + timeline/progress summary + problems (when any).
- **Quick Actions pinned directly under the hero**, not in a column.
- Everything else becomes **one single-column accordion, one section open at a time**, each collapsed row carrying a summary on the right so a single figure never costs a click: Guests & flights · Rooms · Money · Documents · Correspondence · Booking information · History.
- **Auto-open the section that needs action** — owner chose this over "all collapsed" or "always the first one" (*"b delai"*): e.g. Guests & flights when passports are missing, Documents when the invoice is pending.
- Typography: keep labels small, raise **values** in size and contrast — today both use the same small grey, which is why the whole card reads flat.

**Constraint to respect when building it:** `BookingDetail` is shared with the agent screen, and admin content reaches it only through the 9 named `adminExtensions` slots (`Reservations.tsx`'s `AdminBookingExtensions`) — the structure that exists because of two real production leaks (Decisions 102/106). Every slot must keep a sensible home in the new layout; none may be inlined.

Reason: project owner's UI review of the booking detail screen.

Approved By: Daler (2026-08-15 — Part A implemented; Part B design approved, build deferred)

## Part B — implemented

Built as agreed. Key implementation choice: **`SectionCard` itself learned to collapse**, rather than wrapping every card in a new accordion component. Wrapping would have meant inserting a matching open/close pair around each of ~8 regions of dense conditional JSX; teaching the card that already surrounds every one of them means each call site changed by adding props to a tag that was already there, so no nesting was touched and nothing could be mis-paired. A card collapses only when `sectionKey` is passed — every other caller, including the agent screen, renders exactly as before.

Delivered: three columns collapsed into one top-to-bottom flow; **six collapsible sections** (guests, flights, documents, correspondence, info, history), one open at a time, each showing a summary line while closed so a single figure never costs a click; **auto-open of the section that needs action** on first render, guarded so it never fights the user's own clicks as data loads; **Quick Actions moved from the bottom of the old right column to directly under the hero/timeline**; and typography fixed — labels stay small and quiet while values gained size and contrast (`DetailField` values 14px→15px, guest-card values `text-xs text-ink` → `text-sm font-medium text-ink`), which was the actual cause of panels reading flat.

Not made collapsible, deliberately: Rooms (already reduced to status+price in Part A) and the money/health blocks (they are the answer to "what state is this in", which the plan keeps always-visible).

Status: **Parts A and B implemented and verified** — `npx tsc -b` and `npx vite build` clean at the project's 2-error dead-file baseline, no backend/schema/logic touched. All six admin extension slots confirmed still referenced after the restructure (`renderStatusBadgeExtra`, `renderHeaderActions`, `renderCorrespondencePanel`, `renderReplyLogButton`, `renderFinancialSummary`, `onAfterClaim`) — none inlined, the Decision 102/106 boundary intact. `npx tsc -b`, `npx vite build` and `npx oxlint` all clean; every `t()` key present in both catalogs. No backend, schema or logic touched anywhere in this decision. **Not yet confirmed in-browser** — the owner should open a booking and check that it lands on the section needing work, that opening another closes the first, and that the closed rows' summaries read correctly.

---

# Decision 157

Date: 2026-08-16

Decision: **Follow-up pass on the booking detail after the owner used the new layout.** Interface only — no backend, schema or logic touched, same constraint as Decision 156.

- **Quick Actions.** Moving the card under the hero (156B) turned every button into a full-page-width bar. The column is now capped (`max-w-xs`); the buttons stay one per row because each is a separate action and must not read as a segmented control.
- **Rooms card removed for the degenerate case.** A single-room booking's card carried only a status chip and a price — hotel, room type, dates and occupancy are all in the hero already (156A). Now hidden for **admin too**, not just the agent. Two deliberate exceptions keep it: the room still being `Pending` (the Approve/Reject buttons live in that card) or carrying a rejection reason. Multi-room applications always keep it.
- **Cost/price live in one place.** The Net cost / Sale price / Profit trio sat directly above the commercial breakdown — the table built to carry exactly those figures, per category, with the same totals at its foot. The trio is gone; the breakdown is the single source. The agent-facing total (`saleTotal`) is untouched — that is the price the agent is entitled to see, not cost or profit, and removing it would break the Decision 102 boundary from the other side.
- **Breakdown made readable.** Its money cells had nothing stopping them wrapping, so "1856.00" and "USD" landed on separate lines in the one table that exists to be read. Now `whitespace-nowrap` with tabular figures.

**Left alone, and flagged rather than guessed:** the bookings **list** still has its own Net cost / Profit columns. That is a different screen — an overview where those figures are the point — so "remove cost/price everywhere else" was not extended to it without asking.

Reason: project owner's review of the rebuilt detail screen.

Approved By: Daler (2026-08-16)

Status: Implemented. `npx tsc -b`, `npx vite build` and `npx oxlint` clean at the project's 2-error dead-file baseline; database untouched (74 bookings). Not yet confirmed in-browser.

---

# Decision 163 — BUILT

Date: 2026-08-16

Decision: **Claim-before-work. A booking nobody has taken on is locked to a single action.**

This is the first change in this run that alters **business logic**, not the interface. It exists because of a real finding: BK-000077 reached "Confirmed by the hotel", released a guest voucher and reported profit while `claimed_by` was NULL, zero LPO messages had been sent and the hotel had never replied. Someone typed a confirmation number and the system believed it, with no name attached to the act.

**Agreed behaviour, confirmed with the owner:**

1. **An unclaimed booking is visually alarming and functionally frozen.** The row/card shows a red state and the "Take" button pulses. Only that button works; every other action is unavailable until someone claims it.
2. **No exceptions, admin included** (owner: *"да, все должны сперва брать заявку в работу"*). Exempting admin would restore exactly the anonymity this exists to remove.
3. **Agents are outside this mechanism entirely.** They see the real status of their own booking as they do today; the red state and the Take button are admin-panel-only, and an agent never sees a claim control at all (owner: *"агентам не надо показать правила админа, она видит реальное статус заявок"*).
4. **One manager, no transfer, for now** (owner: *"я бы оставил пока только на одного менеджера"*). `claimed_by` is set once; reassignment would need its own deliberate action, which does not exist yet and is not being invented here.
5. After a claim the booking is bound to that manager, everything unlocks, and the LPO is prepared for sending to the hotel.
6. **Direction of travel:** all of this is eventually to be performed by AI with the manager assisting, not the reverse (owner). So the lock must be expressed as *"an accountable identity has taken this on"* — a future AI agent claims through a designated system user exactly as `Booking.claimed_by`'s own model comment already anticipates — rather than as *"a human clicked a button"*.

**Non-negotiable implementation note:** the block must be enforced **on the server**, not by hiding buttons. At the volumes this admin panel is meant to handle, a client-side-only guard is not a guard. Hiding the UI alone would leave every mutating endpoint open to anyone who can call it.

**Build order matters, and is the reason this is not started yet:** the server guard alone would make the UI fail with unexplained 403s; the UI alone would be security theatre. They have to land together — UI lock + red/pulsing state + server enforcement + LPO preparation on claim — or not at all.

Approved By: Daler (2026-08-16, all three questions answered)

## What was built

**Server side — `booking/api.py`'s new `_require_claimed(booking, current_user)`.** Refuses with HTTP 409 *"This booking has not been taken into work yet — claim it first"*. Three deliberate exemptions, each for a concrete reason rather than convenience:

- **Non-admin roles pass through untouched.** The rule is an internal accountability rule for the people processing a booking, not a lock on the agent whose booking it is (owner's point 3). Verified at the role level: `agent`/`Agent` allowed, `admin` refused, on the identical unclaimed booking.
- **Terminal statuses (Cancelled/Rejected/Completed) pass through.** There is nothing left to take on.
- **Anything that is not `Pending` passes through.** `claim_booking` is restricted to `Pending` (Decision 045), so a booking past that which is somehow still unclaimed would be *permanently unwritable* — bricked, with no legal way out. **This was not foreseen — it was caught by the verification run**: the first version of the guard made the real BK-000077 (Confirmed, `claimed_by` NULL — the very booking that motivated this decision) uneditable forever.

**Applied to every write path, not just the obvious one.** The first pass guarded only `PUT /bookings/{id}` and `PUT /guests/{id}` — 2 of 9 mutating endpoints, with the rest held shut by the UI alone, which is precisely the "security theatre" this decision's own non-negotiable note rules out. Now also on: `POST /bookings/{id}/cancel`, `POST /bookings/{id}/change-dates`, `POST /rooms/{id}/approve`, `POST /rooms/{id}/reject`, `PUT /rooms/{id}` (the per-room twin of BK-000077's own hole), `POST /guests`, `POST .../correspondence/send`, `POST .../correspondence/reply`. All 9 verified refused over real HTTP with a real admin JWT against a real unclaimed booking, then all verified to succeed after taking it, with the database confirmed clean afterwards (76 bookings / 55 guests, zero probe residue).

`POST /bookings/{id}/confirm-cancellation` is deliberately **not** guarded: it is reachable only at status `"Cancellation Requested"`, which the not-Pending exemption already passes through, so the call would be dead code that reads as protection.

**Client side — `Reservations.tsx`.** An unclaimed booking's permission object is replaced wholesale (`canChangeDates`/`canEditGuestDetails`/`canEditFlights`/`canCancel`/`canConfirmWithHotel` all `false`, `canClaim` preserved), rather than each control being individually gated — one place to be wrong instead of six. Scoped to `isAdminSide` (`Boolean(adminExtensions)`), so an agent's own list never shows the lock at all, per point 3.

## Not built

**LPO auto-preparation on claim** (point 5's second half). Taking a booking unlocks everything and binds it to the manager, but does not yet pre-fill the LPO. Deferred, not forgotten.

Status: **Built and verified end to end.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` and `npx oxlint` clean; filter/pagination regression suite passes in full.

---

# Decision 164 — BUILT

Date: 2026-08-16

Decision: Follow-up to Decision 163, from the owner using the claim gate on the real list.

## Built

**"Claim" renamed to "Take"** (owner: *"это просто и понятно"*). Text only — the translation keys, the API endpoint and `Booking.claimed_by` all keep the word `claim`, so a wording preference does not rename anything in the data model.

## Built — the important one

**An unclaimed booking carries forward to today, every day, until someone takes it.**

The admin list defaults to `date_view=created` scoped to today. A booking created yesterday and still unclaimed therefore drops out of the view entirely — it is not cancelled, not rejected, nobody has taken it, and nobody sees it again. That is a booking quietly lost, which at this volume is the most expensive failure the screen can have.

Agreed behaviour:
- While `claimed_by IS NULL`, a booking appears in **today's** list regardless of when it was created, shown red as it already is.
- The moment it is taken, it **returns to its real creation date** and stops floating.
- Both dates are kept and shown: when the booking was placed (`created_at`) and when it was taken (`claimed_at`) — both columns already exist, no schema change needed.

Implemented in `repository._apply_booking_filters`'s `date_view == "created"` branch as *"created in range **OR** (unclaimed and not terminal)"* — one shared helper, so the page and its count can never disagree (Decision 152's rule).

**Gated on the selected range actually containing today**, which is the part that keeps it honest: a historical report ("what came in during the first week of July") must not have today's live backlog float into it, or every past-period figure the screen has ever produced becomes unreproducible. Verified both directions — a July window returns only rows genuinely created in July, while today's window returns 15 rows of which 2 were created today and 13 are older, every one of them unclaimed and non-terminal.

Verified that taking a booking really does drop it back out: today's count went 15 → 14 the moment BK-000076 was taken, the row left the view, and both dates were kept and readable (placed `2026-08-15 14:00`, taken `2026-08-16 06:42`).

**The regression suite was updated, not silenced.** `verify_filters.py` compares the server against an independently-written client-side predicate; its two `created`-view checks failed after this change, correctly — the expectation now encodes the carry-forward rule itself, so the suite still guards the behaviour instead of merely agreeing with the code.

## Built — Take button in the list row

`RowTakeButton` in `Reservations.tsx`, shown on exactly the rows already flagged red (`needsAttention`) and gated by the same `permissions.canClaim` as the detail's own button. `stopPropagation` on click, since the row itself opens the detail and a manager working through a backlog must not lose their place. It calls the identical endpoint **and** the identical `onAfterClaim` side effect (Decision 080's auto-created Draft invoice) as the detail button, so "took it from the list" and "took it from inside" cannot diverge.

**Deviation from this decision's own original plan, deliberate:** it lives in the shared base `BookingsList`, not in an `adminExtensions` slot as written above. The Decision 102/106 boundary is specifically about **money** — cost, profit, invoices — and taking a booking is an ownership action, not a financial one. The detail's own claim button is already in the base, gated the same way; routing the list twin through an extension slot would have split one rule across two mechanisms for no gain. Agent-side safety is unchanged either way: `needsAttention` is already `isAdminQueue`-scoped, and agents do not carry `canClaim`.

Reason: project owner, after using the claim gate on the live list.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` and `npx oxlint` clean; the full filter/pagination suite passes with the carry-forward expectation added.

---

# Decision 165 — BUILT

Date: 2026-08-16

Decision: Three fixes to the booking detail, from the owner reading a real two-room booking (BK-000080) on screen.

## 1. Room type is a labelled field, not a subtitle

Room type appeared only in the hero's subtitle line, which renders the **representative first room** as if it were the whole application. BK-000080 read "Sky Studio" while also containing a Beach Villa with Swirlpool — a manager comparing the screen against a hotel's reply would have been comparing the wrong room.

Now a `HeroStat` fed by all rooms: one type across the application shows its name (the common case, identical to before), several show the count with the full list on hover. Room type and meal plan were then **removed from the subtitle**, which now carries only the location — they are labelled fields below, and repeating them is the duplication this run has been removing. The stat grid went 8-across → 5-across so the 9th field doesn't strand itself alone on a second row.

## 2. What Approve does, said where the button is

Approve was unexplained, and what a manager assumes it does matters. Verified in `booking/service.approve_booking_room` before writing a word of it: it flips the room to `"Confirmed"`, records who and when, and recomputes the application's rollup status. **It notifies nobody and sends no voucher** — the guest voucher is triggered by a different act entirely, entering the hotel's confirmation number (Decision 097).

The note says exactly that, shown only to whoever can press the button and only while a room still awaits a decision.

**The question this raised was put to the owner and answered — see Decision 166.** He chose that Approve should send the voucher, having been told directly that it would go out before the hotel confirms and therefore without a confirmation number on it.

## 3. The price the agent actually booked at

The Rooms block showed each room's `BookingRoom.total_amount` — **the room line alone**. Transfer and mandatory tax were missing and there was no total anywhere. On BK-000080 that read "1466.50" and "3927.00" while the agent had booked at **6700.50**.

New read-only `GET /finance-engine/bookings/{id}/commercial-summary` → `service.get_booking_commercial_summary`: every room, every category, and the grand total. Rendered at the foot of the Rooms block as "Booked by the agent at", with the full calculation on hover.

Three things make it trustworthy rather than a second opinion about the same money:

- **One definition of the arithmetic.** The seed formula was extracted into `derive_seed_lines(room)`. `get_or_seed_commercial_lines` persists those triples; the summary reads them without persisting. Two copies would let the tooltip quietly disagree with the Commercial breakdown it exists to explain.
- **It writes nothing.** The per-room GET auto-seeds, which is right when a manager opens one room's ledger, but a summary rendered for every room of every opened booking must not leave seed rows behind for rooms nobody looked at — the same rule `compute_bookings_list_financials` already follows. Verified: 5 summary calls, commercial-line row count unchanged at 78.
- **It agrees with the breakdown table.** Verified against the seeding endpoint the table itself uses, per room, on bookings 80 / 79 / 66 (66 being one with a real manual correction) — exact match every time; plus internal consistency across the 20 most recent bookings, with the 2 non-billable rooms shown but correctly excluded from the total.

A manual correction is not hidden: the total carries a "corrected" chip and the offending line is marked in the tooltip, so "what the agent booked at" and "what it is now" can't silently be the same sentence.

**Placed in `adminExtensions` (new `renderRoomsTotal` slot), not inline**, per Decision 107 — `AgentDashboard_v2.tsx` has zero references to the component, the slot or the endpoint, so it is structurally unreachable from the agent path rather than merely hidden.

## Point 3 of the owner's list

Withdrawn by the owner before any work started ("пока игнорируй, ничего не меняем на этот пункт — передумал"). Nothing was touched.

Reason: project owner, reading BK-000080 in the admin panel.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` and `npx oxlint` clean; database unchanged by the verification (77 bookings / 78 commercial lines / 82 rooms).

---

# Decision 166 — BUILT

Date: 2026-08-16

Decision: **Approving a room sends the guest voucher to the agent immediately, behind a re-confirmation the manager must give.**

## How this was decided

Decision 165 asked rather than assumed, because the owner's wording could be read either way and one reading was a business-logic change to a LOCKED engine. He was told plainly what it would mean — the voucher leaves before the hotel replies, so it carries no confirmation number — and chose it anyway. He then added the safeguard himself: *"но с переподтверждением с менеджером, что вы уверены… если менеджер дал добро, тогда скидываем ваучер и подтверждения"*.

That safeguard is what makes the change sound. Approve was previously a reversible internal note; it now puts a document in someone else's hands, and the dialog is where the manager takes that on.

## The dialog is not a generic "are you sure"

It names the room, states that the voucher goes to the agent and cannot be unsent, and then says the one thing that actually decides whether this is safe:

- confirmation number present → a neutral line quoting it, since it will appear on the voucher;
- confirmation number absent → a **red** line: the hotel has not confirmed, and the voucher will be sent without one.

A manager can still proceed — that is the owner's call — but not by accident, and not discovering it later from a guest at a check-in desk.

## What changed underneath

`Voucher.confirmation_number` was `NOT NULL`, physically as well as in the model, because a voucher only ever existed as a consequence of that number being entered. Now nullable (SQLite table rebuild, Decision 053's technique — 6 rows verified byte-identical against a pre-rebuild backup taken first). The hard `raise` in `create_and_send_voucher_for_room` is gone.

**Nothing is faked in its place.** The download and the email both print *"ожидается подтверждение отеля"*, and the email's opening line stops claiming the hotel confirmed anything — it says the booking is in work and confirmation is awaited. An empty field would have read as a broken system; a placeholder reference would have been worse.

**Real bug, found by running it rather than by reading it:** the first approve-time voucher was written to the database and the caller got a **500** — `VoucherResponse.confirmation_number` was still typed `str`. Fixed to `Optional[str]`. It is also precisely why the frontend send is best-effort: the room was correctly approved throughout.

## Wiring

The send is a Finance Engine call, so it goes through a new `onAfterRoomApproved` extension slot rather than inline in the shared `BookingsList` (Decision 107) — `AgentDashboard_v2.tsx` never supplies it. Best-effort by contract, the same as `onAfterClaim`'s auto-invoice: the approval has already succeeded by the time it runs and must never be undone or reported as failed because a document didn't go out. The confirmation-number editor remains the recovery path, unchanged.

Verified live end to end on a real room: approve → 200, voucher created with `confirmation_number=None`, document rendering the awaiting line; then with a confirmation number present → unchanged behaviour, the number on the document. Every change reverted afterwards and checked field-by-field against a snapshot taken before the test (room status/approved_by/approved_at/confirmation_number, booking status, 3 test vouchers deleted, count back to 6).

Reason: project owner, explicitly, after being shown the trade-off.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` and `npx oxlint` clean; filter/pagination suite passes; database identical to the pre-change backup on every table checked.

---

# Decision 167 — BUILT (one part deliberately left open)

Date: 2026-08-16

Decision: Four corrections to the room block, from the owner reading BK-000080 on screen.

## 1. The header describes the selected room, and only it

Decision 165 gave the hero a room-type field listing **every** type in the application ("2 room types · Sky Studio · Beach Villa with Swirlpool"). Wrong: every other field beside it — dates, nights, guests, meal plan — is the *selected* room's, so one aggregated field made the whole header read as an application-wide summary it is not. Owner: *"должен быть исключительно выбранные детали номера"*.

Now the selected room's own type. The hint says only **which** room is on screen ("Room #1 of 2"), so a multi-room application never leaves that ambiguous — the fix for the original problem, without re-introducing it.

## 2. The Approve explanation moved to a "!" beside the button

It was a banner above the room list. Owner: it belongs next to the control it describes. New local `ActionInfo` component — a real `<button>` with `stopPropagation` (these sit inside a clickable room row and must not open the room) and `focus-within`, so it is reachable by keyboard, not hover-only. Deliberately not `HotelSearch.tsx`'s `InfoTooltip`, which is built for a form field and has neither of those needs.

## 3. The per-room rate is gone from the Rooms block

With Decision 165's application total now at the foot of that same block, two different money figures sat centimetres apart — one a room line, one the whole booking — which is exactly the confusion the owner reported. Every per-room figure remains in the Commercial breakdown, itemized.

## 4. Reject: a "!", a real dialog, and the agent is actually told

The "!" explains what Reject means. Making that explanation **true** required work, not just text:

- **The agent is now emailed.** `reject_booking_room` previously only changed a status the agent had to notice by themselves — the one outcome that genuinely cannot wait to be discovered. New `email_service.send_room_rejected_email`: which room, which dates, and the manager's reason. **Deliberately carries no money** — whether anything is owed is the cancellation-terms conversation, not something to assert inside a rejection notice. Best-effort in a `try/except`: the rejection is already committed, and a mail failure must never undo it or report it as failed.
- **`window.prompt` is gone.** Rejecting now sends someone a message, so it gets the same deliberate dialog Approve got in Decision 166: the room named, a required reason field (labelled as *the text the agent will see* — it is), and a red line stating the mail goes immediately, cannot be unsent, and that a rejected room can never move to another status (Booking Engine's existing terminal-status rule, surfaced rather than discovered).

Verified live end to end: reject → 200, the notification really emitted by the running server with the manager's reason in it, then the room and booking restored field-by-field against a snapshot taken first.

**Found while verifying, worth recording:** the first reject test appeared to send nothing. It had actually been served by a *stale* uvicorn process — the restart had failed to bind port 8001 and logged only `[Errno 10048]`, while `curl` kept getting clean `200`s from the old code. Same family as Decisions 042/112. **A successful API response is not evidence that the code under test ran.** Killing the whole process tree and confirming `port 8001 free` before starting is the only reliable check.

## Deliberately NOT built — the owner's own words, left as spec

The owner described more of the flow: after the agent is told, *"ещё одно переподтверждение — заявка снимается в системе, и менеджер должен дать добро, что cancelled free of charge, и после этого удаляется заявка"*.

The notification and the re-confirmation were built here. The final step was left open rather than guessed at, because **"удаляется заявка" could not mean a row delete**: invoices, vouchers, statements and review notes all reference bookings, and this project's whole audit posture is append-only. The owner answered directly — *"да, cancelled free of charge, заявка остаётся видно как cancelled"* — and it is built in **Decision 168**.

Reason: project owner, reading BK-000080 in the admin panel.

Approved By: Daler (2026-08-16)

Status: **Points 1–3 and the built half of point 4 are done and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` and `npx oxlint` clean; filter/pagination suite passes; database restored to 77 bookings / 82 rooms / 6 vouchers / 51 invoices.

---

# Decision 168 — BUILT

Date: 2026-08-16

Decision: **An application nobody could fulfil is closed free of charge, by an explicit manager decision, and stays visible as Cancelled.** Nothing is deleted.

Closes the step left open in Decision 167. Owner, asked directly: *"да, cancelled free of charge, заявка остаётся видно как cancelled"*.

## The flow, end to end

Reject a room → the agent is emailed (Decision 167). If that was the last room with anything still owed, a second dialog opens **by itself**, right at the moment it becomes true, and asks whether to close the whole application at no cost. The manager grants it; it is never automatic.

New `POST /bookings/{id}/cancel-free-of-charge` → `service.cancel_application_free_of_charge`.

## Deliberately not the existing two-stage cancellation

Decision 104's `cancel_booking` → `confirm_cancellation` pair models *the agent asking* and *the hotel acknowledging*, and stage 2 requires the hotel's own cancellation reference. **There is no such reference here** — nobody is cancelling against the hotel; the rooms were already declined and their inventory already given back. Forcing this through that pair would have meant inventing a fake confirmation number.

`repository.cancel_free_of_charge` writes the same audit fields both stages do (who, when, why), and fills the confirmation-stage fields with the same actor and moment — because in this flow the decision and its confirmation genuinely are one act. The record is no thinner for taking the short path.

`cancellation_fee` is a real, computed `0.0`, never `NULL` — throughout this project NULL means "not computed", and this is a manager deciding zero.

## Two guards that carry real weight

1. **Refuses while any room is still live.** Verified on a real 2-room application: refused with both rooms live, refused *again* after only one was declined (naming which room is still open), and succeeded only once nothing was left. Without this, declining one room of a multi-room application would have closed the confirmed ones with it.

2. **Never releases allotment.** `reject_booking_room` already released each room's reservation as it was declined. Releasing again would hand the same inventory back twice and silently overstate availability — the most damaging thing this could get wrong, and invisible until a room oversells. Asserted structurally (`release_allotment` does not appear in the function, while it does appear in `reject_booking_room`), because today's data has only 7 allotment rows and none on the rooms tested, so an empirical check alone would have proven nothing and looked like it proved something.

`_recompute_application_status` now returns early on an already-Cancelled application. Unreachable today — a Cancelled application has no Pending room left, and approve/reject are its only two callers — but a rollup would otherwise relabel it "Rejected" and erase the fact that someone signed off on cancelling it at no cost. The invariant belongs in the code, not in the memory of whoever adds the third caller.

## Verified

Stays in the `status=Cancelled` list with `cancellation_fee 0.0` (the owner's whole point — visible, not deleted). Cancelling twice is refused rather than silently repeated. The existing terminal-status rule still refuses any move out of Cancelled. `flag-cancellation-confirmed` reuses Decision 104's existing Finance note trail rather than inventing a second one, best-effort. Every field restored afterwards and compared against a snapshot taken first.

**Process note, second time in two decisions:** the first attempt to test this ran against a *stale* uvicorn process — `/openapi.json` proved the new route was simply absent from the running server while every request returned `200`. Checking `openapi.json` for the route before testing is now the reliable pre-flight; see Decision 167's own note.

Reason: project owner, explicitly.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors; filter/pagination suite passes; database restored to 77 bookings / 82 rooms / 51 invoices / 7 allotments.

*(The vouchers table moved 6 → 8 during this session from the project owner's own browser session approving both rooms of BK-000080 — Decision 166's new behaviour firing for real, with `confirmation_number` NULL exactly as designed. Left in place; not test residue.)*

---

# Decision 169 — BUILT

Date: 2026-08-16

Decision: **The "Booking information" section is removed.** Owner: *"эти информации на верху уже имеется"* — correct.

Successive passes had already emptied it into the hero: hotel, room type, meal plan, dates, nights, guests and booking date went there in Decision 156, flights moved to the Flights card, transfer moved to sit with them. What was left by the end was agent, agency and who is handling it — all three of which the hero also shows. It had become a numbered section whose only job was making a manager open it to re-read the header.

`SECTION_ORDER` drops `"info"`, so everything below renumbers on its own. Nothing referenced the key elsewhere (the auto-open effect never picked it), verified rather than assumed.

**Its one genuinely unique field was not dropped with it.** Special requests — free text a guest wrote, and the only thing in that card the hero didn't already carry — moved into the hero as a highlighted full-width block under the stats. It is now *more* visible than before, not less: it used to sit behind a collapsed card. Rendered only when present, so a booking without one gains no empty box. Still reads the selected room's request first, falling back to the application's, exactly as it did.

Called out explicitly because "we removed a duplicated section" and "we removed a guest's request" are very different things, and the second would have been a real loss disguised as tidying.

`DetailField` (a design-system component added earlier in this run) now has no callers anywhere. Its import was removed; the component file was left in place rather than deleted as a side effect of an unrelated task.

Reason: project owner.

Approved By: Daler (2026-08-16)

Status: **Built.** `npx tsc -b` back at the project's 2-error dead-file baseline (an unused-import error this change introduced was fixed, not tolerated), `npx vite build` clean, `npx oxlint` 0 errors; filter/pagination suite passes; database untouched.

---

# Decision 170 — BUILT

Date: 2026-08-16

Decision: **Rooms moves directly under the timeline, above the numbered sections.** Owner's order, verbatim: timeline → Rooms → then the numbering.

Rooms sat *between* section #1 (Quick actions) and section #2 (Guests) — an unnumbered card interrupting a numbered run, which is what made the sequence hard to read.

The new order reads correctly rather than merely differently: the timeline says where the booking stands, Rooms says what the booking **is**, and only then do the numbered steps begin. Rooms stays deliberately outside the numbering — it is not a step in the sequence, it is the subject the steps act on, and it is also the room selector every section below reads from.

Decision 156B's reason for lifting Quick Actions (it used to sit two screens down, below every detail block) is still satisfied: it now sits directly beneath a compact Rooms card, not below the details.

Implementation is a pure move of `<QuickActionsCard>` — no props, state or behaviour touched. `SECTION_ORDER` is unchanged, so the numbering (Quick actions #1, Guests #2, Flights #3, Documents #4, Correspondence #5, History #6) follows automatically.

**Verified by reading the render tree, not by eye:** a script scanned the file from `<BookingHero>` down and confirmed all nine landmarks appear in exactly the requested sequence. Worth doing — an earlier version of that same check reported a false mismatch because it matched the *component definitions* higher in the file rather than the render tree, which is precisely how a reordering like this gets mis-verified.

Reason: project owner.

Approved By: Daler (2026-08-16)

Status: **Built.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 171 — BUILT

Date: 2026-08-16

Decision: Two fixes found by the owner comparing a two-room booking against a fresh single-room one.

## 1. Room details always show — the single-room card was rendering empty

BK-000081 (one room) showed a Rooms card with **nothing in it**: a "Pending" chip and the Approve/Reject buttons floating beside blank space, while BK-000080 (two rooms) showed hotel, room type, dates, nights and occupancy per room.

Two earlier rules stacked into this. Decision 156 suppressed those three detail lines when `rooms.length === 1` (the hero repeats them), and Decision 157 hid the whole card for a single non-Pending room. The de-duplication reasoning was right about the *words* and wrong about the *result*: it left a card that reads as a rendering bug, not as restraint. A room's own hotel, type, dates and occupancy belong on the room.

Both rules removed. The card always renders, and every room shows its full lines; the `#N` sequence prefix still appears only on multi-room applications, where a number means something.

## 2. Transfer type is in the header

Added as a labelled hero field, resolved to the contract's real name (`Domestic Flight Sapphire Class`, not `domestic_sapphire`) from the selected room — consistent with every other hero field, which describes the selected room. `null` renders "No transfer", a real answer rather than a gap.

**Removed from the Flights card in the same change.** It had lived there because that is where a transfer is *arranged*; the header is where facts get *checked against the hotel's reply*. Leaving both would have put the same value on screen twice — the exact duplication this run keeps removing — so `FlightsCard`'s now-unused `transferName` prop went with it rather than being left dangling.

## Verified

Hero renders 10 fields in order, transfer among them, room type still present; `transferTypeLabel` now appears exactly once in the file; no single-room suppression remains anywhere; the Decision 170 section order still holds end to end (checked by scanning the render tree, using the render-site marker — an earlier run of the same check reported a false negative because it looked for a translation key the render site doesn't use).

An unused-prop error this change introduced was fixed rather than tolerated: `npx tsc -b` is back at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

Reason: project owner, comparing BK-000080 and BK-000081 live.

Approved By: Daler (2026-08-16)

Status: **Built and verified.**

---

# Decision 172 — BUILT

Date: 2026-08-16

Decision: **A booking opens with every section closed. Each closed section carries a "!" naming exactly what is outstanding inside it.**

## Auto-open removed

Opening a booking used to guess which section to expand — guests if a passport was missing, otherwise documents, otherwise rooms. Owner: Booking Health already lists the gaps, so the guess was a second, less complete answer to a question already answered, and it forced a scroll past a section the reader had not asked for. The `autoOpened` guard that kept that effect from fighting the user's own clicks went with it.

## The "!" replaces it, and the text rule is the point

`SectionIssueMarker` on the section header, hover or focus to read. Same mechanics as Decision 167's `ActionInfo` — a real `<button>` with `stopPropagation`, which matters more here: the header row is itself the toggle, so without it, reading what is outstanding would collapse the very section being read.

**Owner's rule, verbatim: always state the specific thing, never "some details pending".** Enforced by *not* reusing `computeBookingHealth`'s strings. Those are written to summarize a whole booking — "2 guests without a passport" — which is exactly the aggregate phrasing being ruled out. New `computeSectionIssues` names individuals instead. The two coexist by design: Booking Health stays the overview, this names the rows.

What it produces, rendered against real bookings rather than asserted:

- **BK-000081** — *Quick actions:* "Room #1 still awaiting approve or reject". *Guests:* "Afshona Daler: no passport number, no passport expiry, no date of birth, no nationality" and the same for the second traveller, by name. *Documents:* "Voucher: waiting for the hotel's confirmation number", "Invoice: still Draft, not issued".
- **BK-000077** — *Quick actions:* "Nobody has taken this booking into work".

Rooms are named by number, guests by name, invoices by their actual status, and a missing field is named as the field. Flight-date problems reuse `describeFlightDateIssues`, which was already concrete (it names the leg, the traveller and how many days off). A section with nothing outstanding renders no marker at all — a "!" that means nothing is worse than none, because it costs a click to learn it said nothing.

Terminated bookings (Cancelled/Rejected) raise none of the document, flight or claim items — chasing a voucher for a cancelled booking is noise.

Wired into Quick actions, Guests, Flights and Documents. Correspondence and History raise nothing: neither has a definition of "outstanding" that would survive being written down.

Reason: project owner.

Approved By: Daler (2026-08-16)

Status: **Built.** An unused-state error the removal introduced was fixed rather than tolerated: `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 173 — BUILT

Date: 2026-08-16

Decision: **The hotel's confirmation number is entered inside the room, always.** The standalone "Hotel confirmation" card is gone.

Owner, comparing BK-000081 against BK-000080: the one-room booking sent this to a separate card while the two-room booking had it inside each room.

## Why the split existed, and why it had to go

A 2+-room application has always entered numbers per room — one shared field would silently apply a single hotel reference to every room, the real bug reported on BK-000066. Single-room applications kept the old booking-level card. So the same act lived in two different places depending on how many rooms had been booked, and on the one-room screen it sat detached from the room it describes.

Now every room carries its own editor. The booking-level `confirmation_number` column and its `ConfirmationNumberEdit` are untouched and still displayed everywhere — only this one entry point moved, so every booking that already holds a booking-level number keeps showing it. **Nothing was migrated.**

**One case genuinely still needs the old card:** an application with no `BookingRoom` rows at all has no room to hang a confirmation on. Kept for exactly that, and it is not speculative — there is precisely **1** such booking of 78 in the live database, checked rather than assumed.

## A real bug this surfaced, fixed rather than inherited

`useBookingDocuments` computed `voucherReady` from `booking.confirmation_number` alone. For a multi-room application that column is never set — its numbers live on the rooms — so a fully confirmed 2-room booking reported "voucher pending" forever, and Decision 172's new Documents "!" would have said so in writing.

Latent until now, because single-room bookings did set the booking column. Moving single-room entry into the room card would have spread it to *every* booking. `voucherReady` now counts either source: the booking column, **or** every room having a number.

Measured on real data before and after: 5 bookings ready before, 5 after, none lost. No delta because only 4 room rows carry a number today and BK-000080 has just 1 of its 2 rooms confirmed — correctly still not ready. The fix is proven by construction and becomes load-bearing the moment a room number is entered, which is now the only way to enter one.

Verified separately that the Documents download still resolves a per-room voucher through the booking-level endpoint: `GET /bookings/80/voucher/download` → 200, returning VCH-000008, on a booking whose own `confirmation_number` is NULL.

Reason: project owner, comparing BK-000080 and BK-000081 live.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 174 — BUILT

Date: 2026-08-16

Decision: **The Commercial breakdown becomes a spreadsheet.** Owner: put it in a table, make it readable, name what each line is actually charging for, and simplify the figures — *"по таблицу как excel например"*.

## A ruled grid, not a page table

Deliberately **not** the shared `TableShell`/`TableRow` components. Those are sized for page-level lists (`px-4 py-3` a cell), which here produced six rows of near-empty whitespace and let a six-line ledger fill a screen. This is a purpose-built grid: every cell bordered, tight rows, numbers right-aligned and tabular so digits line up down the column. Forcing that density through the shared components would have restyled every other table in the app.

## Figures simplified

The currency was printed on all fourteen figures. It is now stated **once per column head** ("Cost, USD") and the cells carry bare grouped numbers — `13,314.50`, not `13314.50 USD`. Empty categories (typically three of six) are dimmed instead of shouting a bold "—", so they recede rather than compete with the lines that carry money.

## Every line says what it is charging for

"Room" alone does not say which room — the owner's actual point. New `describeCommercialLine` gives each line its real subject, resolved from ids the screen already holds:

- **Room** — `Sky Studio · Kandima Maldives · 7n · 2 ad`
- **Transfer** — `Domestic Flight Sapphire Class`
- **Meal** — the contract's own meal-plan name
- **Tax** — `Mandatory tax`
- **CIP / Excursion** — `null`, honestly: they are free-form manual entries with no id anywhere to resolve. Nothing is invented to fill the column.

The names are resolved in `Reservations.tsx` and passed through a new optional `DetailCtx.labels`, because that component already holds the hotel/room-type/meal-plan/transfer maps — the extension would otherwise refetch all four to label rows it is being handed the ids for.

## A Margin column

The table already held both sides of it and made the reader subtract in their head, one row at a time. Negative margins render red, per line and in the total.

## Bug fixed in passing

The inline edit form's `colSpan` was `5`. With Details and Margin added the header is now seven columns, so the form would have stopped short and sat boxed into part of the table. Corrected to 7, and both amount inputs now state the currency they are in.

## Verified against real data

Rendered for BK-000081 from the live API: Room `2,793.00 / 2,863.00 / 70.00`, Transfer `1,220.00 / 1,220.00 / 0.00`, Tax `168.00 / 168.00 / 0.00`, Meal / CIP / Excursion empty, **Total 4,181.00 / 4,251.00 / 70.00** — and the booking total is `4,251.00`, an exact match, so the reconciliation line still holds.

Confirmed the currency now appears only in the three column heads and in the two reconciliation sentences below the table (prose, where it belongs); zero currency suffixes remain inside the grid.

Reason: project owner.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 175 — BUILT

Date: 2026-08-16

Decision: **The Commercial breakdown adopts the colour and type of the reference table the owner supplied.** His instruction was explicit and narrow: *"формулу не меняем, только цвет и шрифт"* — nothing about which figures appear or how they are computed changed.

What the reference actually specifies, and what was matched:

- **Header** — white, near-black **bold labels in normal case**, not the muted uppercase small-caps this table had. Columns separated by a light vertical tick (`border-l`), not a filled grey bar.
- **Body** — near-black text (`text-ink`) instead of muted slate, at `text-sm` rather than `text-xs`, on white with no zebra.
- **Rules** — horizontal only. The vertical grid lines inside the body are gone; the reference has none, and they were what made the previous version read as a spreadsheet mock rather than a table.
- **Rows** — `px-3 py-2`, roomier than the previous `px-2 py-1`, matching the reference's comfortable line height.

Two judgements the reference does not answer, made deliberately rather than silently:

- **An unused category stays lighter** (`text-slate/45`). The reference has no empty rows to copy. On a typical booking three of the six lines are empty, and rendering them at full contrast would read as six equally real charges.
- **Numbers stay right-aligned and tabular.** The reference left-aligns its Profit column, but alignment is neither colour nor font, and right-aligned tabular figures are what makes a money column readable down its length. Changing it would have been a regression smuggled in under a styling request.

Verified by scanning the grid markup itself, not the surrounding panel: no uppercase, no grey fill, no muted slate text, no vertical rules in the body, ticks present in the header, one horizontal rule per row, base font `text-sm`. The arithmetic (`computeCommercialLineTotals`, the per-line margin) is byte-identical.

The section heading above the table and the two reconciliation sentences below it keep their existing muted styling — they are page furniture and secondary prose, shared with every other admin section, and restyling them would have made this table inconsistent with the rest of the panel rather than consistent with the reference.

Reason: project owner, with a reference screenshot.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 176 — BUILT

Date: 2026-08-16

Decision: The bookings list gets the Commercial breakdown's grid treatment, the admin panel goes full width, and the list gains a **Manager** column.

This is step 1–2 of the plan assessed in the previous turn, taken in the order recommended there: the shared component first, the highest-value table second, everything else untouched pending a look at the result.

## The density lives in `Table.tsx`, not in the page

`TableShell` takes `density?: "comfortable" | "grid"`. **Comfortable is the default and is byte-identical to the old look**, so no existing caller moves — verified: `density=` appears at exactly one call site in the whole app.

Passed by **React context**, not as a prop on all six components. A caller would otherwise thread the same value through fourteen cells per row, and the one it forgot would be the one that looks wrong.

Grid mode: near-black text, bold headers in normal case (not muted uppercase), every cell ruled at `ink/20` (rgb 209,211,217 — the weight of the owner's reference; the first hand-built version used `ink/10`, rgb 232,233,236, which is why it did not read as a table at all), a heavier rule under the head, tighter rows, and money right-aligned so digits stack against a common edge.

This is deliberately **not** copy-pasted from the Commercial breakdown. That one-off was becoming the 9th hand-rolled table in a codebase that already extracted `Table.tsx` precisely because it had seven; folding it back onto the shared variant is the follow-up.

## Applied to the admin instance only

`density={isAdminQueue ? "grid" : "comfortable"}`. The same `BookingsList` component is the agent's own list, where a handful of rows needs no spreadsheet — restyling a screen nobody asked about is exactly what an opt-in prop exists to prevent. `AgentDashboard_v2.tsx` never passes `adminExtensions`, so it cannot reach grid mode.

## Full width

`AdminShell`'s `mx-auto max-w-[1400px]` is gone. It suited forms and short lists, but a 14-column table was squeezed into the middle of the screen with empty margins on both sides while its own cells wrapped. Nothing under that shell is prose, so no line-length argument applies — every child is a table, a card grid or a toolbar.

## Manager column

Who took the booking into work, between Agent and Hotel. **Admin-only**: an agent has no business seeing which manager handles their booking, the same internal queue state the detail header already keeps behind that boundary. Resolves from the existing `agentNames` map (a user-id → name map, not agents only), so it costs **no extra request**. An unclaimed booking reads "not taken" rather than a bare id.

## A real inconsistency this surfaced

`AdminBookingFinance.tsx`'s trailing Net cost / Profit columns were hand-rolled `<th>`/`<td>` appended into this very table. As raw elements they kept the comfortable padding and skipped the grid's rules entirely, so a ruled table would have ended in two unruled, left-aligned columns. Moved onto `TableHeadCell`/`TableNumericCell`, which pick the density up from the same context.

## Verified

Header cells 10, body cells 10, both with the same 2 conditionals — so no column can render without its header. `columnCount` (skeleton rows, empty and error states) counts the new column. `border-ink/20`, `border-ink/25`, `border-b-2`, `text-right` all confirmed present in the built CSS with their resolved colours, after the earlier lesson that a grep with the wrong escape reports a false absence.

Reason: project owner, with a reference screenshot.

Approved By: Daler (2026-08-16)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

**Not done, deliberately:** Transfers/Arrival/Departure and Invoices, and folding the Commercial breakdown onto the shared variant. Per the plan — look at this one in real use first.

---

# Decision 177 — BUILT

Date: 2026-08-17

Decision: **A booking can be taken into work at any non-terminal status, not only "Pending".** Plus: search and the date filters become one toolbar.

## The bug, and why it was a rule and not a typo

Reported live: *"есть заявки уже confirmed, но в то же время стоит как новые заявки… нельзя взять в работе, ошибка даёт already confirmed"*. Three real bookings — BK-000064, BK-000069, BK-000077 — sat `Confirmed` with `claimed_by` NULL.

Three rules, each defensible alone, combined into a trap:

- **Decision 045** restricted `claim_booking` to `Pending` — "claiming only means something for a booking nobody has looked at yet".
- **Decision 164** floats every unclaimed non-terminal booking into today's list until someone takes it.
- **Decision 163** locks an unclaimed booking, but exempted anything non-Pending *specifically because* it could not be claimed and would otherwise be bricked.

So a Confirmed unclaimed booking floated into the daily queue **permanently** (it could never be taken, so it never left), and was simultaneously the one category still freely editable with nobody's name attached. That is the exact failure Decision 163 was written about: BK-000077 reached "Confirmed by the hotel", released a guest voucher and reported profit anonymously — and under the old rule it could never be given an owner.

Decision 045's premise was simply inverted by Decision 163: once ownership is an *accountability* rule rather than a queue convenience, a Confirmed booking with no owner is the case that needs one most.

## What changed

- `claim_booking` now refuses only `TERMINAL_BOOKING_STATUSES` — a new named constant, because "can this be claimed", "does it float into today's list" and "is it locked until claimed" were three hand-written copies of the same set and could drift apart. The carry-forward filter already used exactly these three, so the rules now agree by construction.
- `_require_claimed`'s non-Pending exemption is **removed**. Its only justification was the brick risk, which no longer exists.
- Frontend: the red state and the Take button are gated on *unclaimed and non-terminal*, not on `Pending`. They were invisible on precisely the rows that needed them; a locked booking now always has a visible way out, in the list row and in the detail.

## Verified live

`POST /bookings/77/claim` → **200**, claimed, status still `Confirmed` (claiming does not touch business status). A `Cancelled` booking still refuses: *"there is nothing left to take on"*. On BK-000069: `PUT` refused with **409** while unclaimed → claim → the identical `PUT` succeeds. Today's carry-forward count dropped as the taken ones left the queue. All three test bookings restored to unclaimed afterwards, database at 78 bookings.

## The toolbar

Search + filters and the date range/view were two separate rows, the second a sand-filled panel of its own — the controls for one question split across two blocks, with the sentence explaining the chosen view colliding with the view pills on a narrow window (visible in the owner's screenshot). Now one bordered toolbar holds search, status, hotel, agent, the date range, the Staying/Created/Cancellations pills, the by-date toggle and Reset; a hairline separates "what" from "when" without them becoming separate blocks again. The explanatory sentence moved below the bar, where it is free to wrap without pushing controls around. The three view pills were also collapsed from three copy-pasted buttons into one `map`.

Reason: project owner, from a live screenshot.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes.

---

# Decision 178 — BUILT

Date: 2026-08-17

Decision: **The agent is billed the price they saw at booking, transfer included. One number, everywhere.** A manual correction in the admin panel changes our cost and margin, never the agent's price.

Owner's rule, verbatim: *"мы скидку не даём агенту… если сумма вручную уменьшается в админ панели, это только для нас, агент получит invoice сумму, которую видел во время бронирования, с трансфером… все суммы должны сходиться и быть едиными"*.

Measured before touching anything: **3 of the 14 most recent bookings** had four surfaces reporting different numbers. Three separate causes, all fixed.

## 1. Manual corrections were re-pricing the agent

The commercial ledger's price side (`base_price + adjustment_price`) fed the Bookings list's Sale price and the "Booked by the agent at" line, while the invoice was built from the frozen figures. So editing a price moved two of the three and not the third. BK-000077 read **3442.00** on its invoice and **10546.00** in the list.

Now: `compute_booking_room_commercial_totals(lines, room)` takes the room and reads the sale side from its frozen columns; the ledger governs **cost only**. Same in `compute_bookings_list_financials`, `get_booking_commercial_summary` and the frontend mirror. Profit = frozen sale − ledger cost, which is exactly the internal figure a correction is *meant* to move.

The price inputs are gone from the ledger's edit form — leaving them would promise an edit the system no longer honours. `base_price` rows are preserved as history (the upsert only writes what it is sent); they simply no longer decide anything.

## 2. The invoice-reconciliation line was never fed

`CommercialLineItemsPanel` had an `invoiceTotal` prop and a red "does not match" line — with **no caller ever passing it**. A stale Issued invoice was invisible on the one screen that shows the money.

Real case: BK-000054 was invoiced at 1156.65 and its booking now totals 1908.85 after a date change, and it had already dropped off the urgent panel because someone acknowledged the note — acknowledging means *seen*, not *fixed*. Now wired from the invoice cache the panel already loads. **7 of 19 invoiced bookings** are in this state; they are a real, different fact (frozen at issue vs changed since), and are now visible rather than silent.

## 3. Multi-room bookings understated the price everywhere — including the agent's own screen

`Booking.total_amount` is the **representative first room's** figure. Every list rendering `total_amount + transfer + tax` as "the price" understated every multi-room booking: BK-000080 showed **1964.50** for a booking the agent pays **6700.50**; the worst was understated by 7442.00 (6 bookings affected).

New `application_total` on `BookingResponse`, stamped by `service.attach_application_totals` on the list, the detail and the agent's own list — every billable room's room + transfer + tax. Non-billable rooms (Rejected/Cancelled/Cancellation Requested) are excluded, the same set Finance Engine already uses, so a room nobody pays for is never added into the price shown.

**One bulk query per page, never one per row** (Decision 151's load-shape rule). Verified by timing: 5 / 7 / 8 ms at page sizes 10 / 50 / 78 — flat, not linear.

## Verified

Re-ran the same four-surface audit over **every invoiced booking**: 19 checked, **0 live figures disagreeing**. Every booking on a full page (78) reports an `application_total` equal to an independently computed sum from the room rows. The filter/pagination suite passes unchanged.

Database untouched by the work: 78 bookings, 83 rooms, 53 invoices, 81 ledger lines.

## Known limitation, stated rather than hidden

A service genuinely sold to the agent *after* booking (an excursion added later) has no agent-facing price under this rule — the sale side is the frozen quote. Today those categories are cost-only manual entries, so nothing is lost; if a real "bill the agent for an extra" case appears, it needs its own decision rather than reopening the price field.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 179 — BUILT

Date: 2026-08-17

Decision: The Commercial breakdown stops confusing **one room's price** with **the whole booking's**. Fixes a labelling bug introduced by Decision 178 itself.

Reported on BK-000080, which read:

> *Agent is billed 1964.50 USD — the price they saw at booking…*
> *Invoice total: 6700.50 USD — does not match the breakdown*

Both figures were correct; both captions were wrong.

## What was actually happening

The panel is **one room's ledger** — `ctx.booking` is the selected room adapted onto a `Booking` shape, so `computeBookingFinancials(booking)` returns that room's price. Decision 178 passed it as `bookingTotal` and labelled it "Agent is billed", then compared it against an invoice covering **every** room.

On BK-000080: room #1 = 1964.50, room #2 = 4736.00, application = 6700.50, invoice = 6700.50 (correct). So the panel called one room's figure the agent's bill, and then reported a mismatch that was arithmetically guaranteed on any multi-room booking — **4 of 53 invoiced bookings were showing that false alarm**, every one of them actually correct.

Worse than a cosmetic slip: it looks exactly like the discrepancy Decision 178 had just been written to eliminate, which is how a real one would have been missed.

## The fix

`bookingTotal` split into two named props that cannot be conflated: `roomTotal` (this room's frozen price, what the table's own Total column sums to) and `applicationTotal` (`booking.application_total`, which rides through the room-adaptation spread untouched — the price the agent is billed and the one the invoice covers).

- The note now reads *"Agent is billed 6,700.50 for the whole booking, of which 1,964.50 is this room"*, and drops the second clause entirely when there is only one room.
- The heading says whose ledger it is: **Commercial breakdown · Room #1 of 2**. Unlabelled, one room's figures sat under a heading that read like the booking's.
- The invoice is compared against the **application** total, never a room's.
- The verdict names what it compared: *"matches what the agent is billed"* / *"does not match what the agent is billed; it was issued before the booking changed"*. The old "does not match the breakdown" never said match *what*.

## Verified

Rendered the panel's actual text from live data for all three shapes: BK-000080 (2 rooms — correct split, invoice matches from either room), BK-000081 (1 room — no room label, no split clause, matches), BK-000054 (1 room, genuinely stale invoice — correctly still reported as a mismatch).

Across all 53 invoiced bookings: **4 false alarms removed, 40 genuine stale invoices still reported.** The fix quiets only the wrong warnings.

Reason: project owner, reading BK-000080.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 180 — BUILT

Date: 2026-08-17

Decision: Switch rooms inside the Commercial breakdown, and show a **Grand total for N rooms** beneath it.

## Room tabs

The ledger is per room. Seeing another room's meant scrolling back up to the Rooms card and clicking there — once per room, on an application that may have eight. Tabs now sit under the panel's heading.

They drive the **same** selection the Rooms card does: `DetailCtx` gained `onSelectRoom`, wired straight to `BookingDetail`'s existing `setSelectedRoomId`. One piece of state, so the tabs and the Rooms card can never point at different rooms — and the hero, the guest list and everything else keyed to the selected room follow along, exactly as if the click had happened upstairs.

A Rejected or Cancelled room stays readable but is labelled on its own tab (`Room 3 · rejected`), reusing the file's existing `NON_BILLABLE_ROOM_STATUSES` set rather than adding a second copy — the first attempt did add one and the compiler caught the redeclaration.

## Grand total

The table above is deliberately one room's, so **cost and margin existed per room and nowhere in aggregate** — the only whole-booking figure on screen was the agent's price. The new row gives Cost / Price / Margin for the whole application, labelled with the real billable-room count ("for 2 rooms"), so it can never be read as the room above it.

Fed by the same read-only `/commercial-summary` the Rooms block's own total already uses — no second definition of the arithmetic, and it writes nothing (verified: ledger row count unchanged at 81). It re-fetches when `lines` change, so the grand total cannot lag an edit made in the table beneath it.

**Hidden when there is one billable room**, where it would only repeat the table's own Total.

## Verified against live data

Rendered what each booking will show: BK-000080 → tabs [Room 1, Room 2], *Grand total for 2 rooms — Cost 6,457.00 / Price 6,700.50 / Margin 243.50*. BK-000081 (one room) → no grand total row, as intended.

Then the invariant that matters: on **all 6** multi-room bookings, the grand total's Price equals `application_total` — what the agent is billed — to the cent, and the tab count equals the real room count. 0 problems.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 181 — BUILT

Date: 2026-08-17

Decision: The agent gets the same per-room breakdown and grand total, in the same design — **with nothing internal in it.**

Owner: *"дизайн commercial breakdown нужно сделать такой же как в админ панели, но без деталей скидок… разбивка для агента будет как она видела в онлайн"*.

## The bug this also fixes

The agent's price card listed the **selected room's** three lines (3927 / 725 / 84) under **"ИТОГО К ОПЛАТЕ 6700.50"** — the whole booking's total. The same room-vs-application conflation Decision 179 had just fixed on the admin side, still live on the agent's own screen, where it is least forgivable: the lines did not add up to the number underneath them.

## A separate endpoint, not a filtered view

New `GET /finance-engine/bookings/{id}/price-breakdown` → `service.get_booking_price_breakdown`. Per room, per category, **price only**.

Deliberately not a flag on `/commercial-summary`: that payload carries our cost, our margin and an `adjusted` marker. This one's response model **has no field for them**, so they cannot be sent by accident — the same principle as Decision 102's invoice-status endpoint, which returns only a status string. Verified by scanning the real payload for `cost` / `net_total` / `profit` / `margin` / `adjust`: none present.

Gated by `_require_admin_or_owning_agent`. Checked at the role level: admin allowed, the owning agent allowed, **a different agent refused 403**.

## What the agent sees

The admin panel's ruled grid, two columns — Item and Amount. Each room gets a heading row with its type, its own lines, and a subtotal; then the grand total labelled with the real count ("за 2 номера"). Clicking a room's heading selects that room everywhere else on the screen, so its guests and flights follow — the same single piece of state the Rooms card drives.

Single-room bookings lose nothing: no heading rows, no subtotals, just the lines and the total, as before.

## Two real bugs found while verifying, not by reading

- **`room.confirmation_number` was rendering as literal text.** A missing `{}` — the agent saw the variable name where the hotel's reference should be.
- **The one legacy booking with no `BookingRoom` rows reported 0.00** for a booking the agent is billed 1545.00 on. The new function iterated rooms and had none; it now falls back to the booking's own frozen columns, exactly as `attach_application_totals` already did. Caught by the reconciliation sweep, which is precisely what it is for.

## Verified

All **78** bookings: the breakdown total equals `application_total` (what the agent is billed) to the cent, and every room's lines sum to that room's own subtotal. 0 problems. Filter/pagination suite passes; database unchanged.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors.

---

# Decision 182 — BUILT

Date: 2026-08-17

Decision: The invoice module put in order, in the five steps the owner approved.

## The rules, written down (they were nowhere)

1. An invoice is created **manually** from a booking. Its amount is frozen at creation: what the agent saw — accommodation + transfer + tax across every billable room. Status **Draft**.
2. **Approve & send** is a separate act: Draft → **Issued**, emailed. Until then the agent cannot see or download it.
3. If the booking changes afterwards the invoice does **not** move. A review note is appended and the booking is flagged.
4. **Mark as reviewed** means *seen*, not *fixed*.
5. **Void** cancels it; a new one can then be issued.

One invoice per booking — verified, no booking has two live ones.

**`CLAUDE.md` was stale on point 1-2** (it claimed Issued-at-creation, the pre-Decision-079 behaviour). Corrected.

## 1. The list that was missing

The page had "Needs attention" plus a search requiring you to already know an agent's name or a booking number. **39 of 53 invoices were reachable by neither**, and all **12 Drafts — 48,893.00 USD, created and never sent** — could never appear in the flagged panel, because a Draft has no change note. The "Approve & send" button existed in that very table with no way to reach it.

New **All invoices** section: status tabs with live counts (All / Draft / Issued / Void), invoice-number search, 25 a page. Filtered, sorted and paginated **on the server** — at 100 bookings a day this is 3,000 rows a month, and `db.query(Invoice).all()` in no order was what it replaced. Count and page come from one shared `_apply_invoice_filters` (Decision 152's rule). Verified: count equals rows on every filter, pages tile 53 rows with no gap or duplicate.

## 2. Dates

`formatDate` was `en-US` on the finance screens alone — "7/20/2026" where the rest of the admin says 20.07.2026. Now dd.mm.yyyy.

**"Created" was showing `issue_date`**, which made INV-5E0847DAC701 read *"Created 7/20 · Approved 7/19"* — approved before it existed. It was created 19.07 19:09:12 and approved 24 seconds later; both now show date **and time**, because a date alone cannot order events seconds apart.

## 3. The comparison block

The two columns were built on different bases and stacked as addends. The right one listed Base rate (net), Supplements, Discount, Commission, Profit, then a total none of them summed to — on BK-000025, **1,509 + 828 + 72 above a total of 1,684.50**.

Both sides now carry the **same three agent-facing rows** and both add up. Frozen side from the invoice's own `InvoiceRoomLine` snapshot (reconciles to `total` on all 10 that have it; the 43 older ones say plainly that only the total was recorded, rather than reverse-engineering a split). Current side from the agent-facing price breakdown (Decision 181) — literally the same endpoint the agent reads, so the two cannot disagree.

Profit is gone from the invoice block: an invoice is what the agent pays; our margin lives in the booking's commercial breakdown. **Side effect: two or three fewer Contract Engine re-pricing calls per modal open**, since the live re-pricing that fed the old column is no longer needed.

## 4. Red now means money

Every flag was the same red. INV-5E0847DAC701 carries four date-change notes with its total unchanged at 2,412.50; INV-AA2FF204A259 is **2,174.55 short**. Indistinguishable.

Now: **red** for a real money difference, **amber** for "changed, same amount", and the badge states the delta.

**Judging on the notes alone was not enough** — INV-3A3B7074F568 is short and every one of its notes predates structured price snapshots, so it read as harmless. The decisive test is invoice total vs **what the booking costs now**, attached per row in one bulk query.

That surfaced a third state worth its own words: **a live invoice on a cancelled booking**. Reporting it as "Amount −1,609.05" describes it wrongly — nothing is owed because the booking is gone, not because the price fell. Now labelled "Booking cancelled — invoice still live". **7 of 27 live invoices are in that state**, and 7 more differ in amount (the largest by **+20,462.05**).

## 5. Names, not ids

Booking `#29` → BK-000029, hotel `#2` → its name, plus the agent's name — resolved server-side in three bulk queries per page, never one per row.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged (53 invoices / 78 bookings).

---

# Decision 183 — BUILT

Date: 2026-08-17

Decision: The invoice list becomes date-scoped with **Drafts carried forward**, and the detail modal adopts the booking screen's collapsible sections.

## 1. Dates, with unsent invoices refusing to leave

Decision 182 made every invoice reachable — correct, and unreadable within a fortnight at 100 a day. The list now opens on a date range, like Bookings.

But a Draft is money **nobody has been sent**. Dropping out of view because it was raised last Tuesday is precisely how it stays unsent. So the same rule as Decision 164's unclaimed bookings: while an invoice is Draft it appears in any range containing today, whenever it was raised; the moment it is approved it returns to its own issue date and stops floating. A Draft also renders **red with a "Not sent" badge**, unconditionally — the owner's rule, and now consistent with why it will not leave the screen.

**Gated on the range actually containing today**, so a historical window still answers "what was issued that week" — verified: a 19–20 July window returns 38 rows, all genuinely issued then, including the 2 Drafts that really were.

Verified live end to end: today's list opens on **11 rows, all Draft, 44,642.00 USD unsent**; approving one drops the list to 10, the row leaves, and it is then found on its own issue date. State restored afterwards.

The **tab counts are scoped to the same window** — a tab promising 26 Void while the list can show none of them is a lie in a different font. Count and rows agree on all four tabs.

## 2. One section design

`SectionCard` (the booking detail's collapsible card) is now exported and takes an optional `number`. It previously derived its number from `SECTION_ORDER`, which is the booking screen's own sequence — an invoice's sections are not in it and would all have rendered a blank circle. Booking-detail callers pass nothing and are unchanged.

The invoice modal was five permanently-open stacked panels. Now three sections: **1 Amounts** (open by default — the reason anyone opens an invoice, summarised with the total when collapsed), **2 Changes since this invoice** (auto-opens while still unreviewed), **3 Audit trail** (who created/approved/voided it, and when).

The blocks were then physically reordered so reading order matches the numbering — they had ended up 3-2-1 in the DOM, which is exactly the kind of "numbered but not in order" the numbering exists to prevent.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged (53 invoices, 11 drafts).

---

# Decision 184 — BUILT

Date: 2026-08-17

Decision: **A detail window always opens large, and always at the same size.**

Owner, with two screenshots of the same modal at visibly different sizes: *"они не удобны и разные размеры, нужно по больше как в booking… и один размер"*. The booking detail was supplied only as the reference and is untouched.

## Why it was two different windows

The invoice modal was `max-w-2xl` — **672px** — with `max-h-[85vh]`. A **max** height grows with content, so a Draft with three lines and an Issued invoice with a change history genuinely opened as two different windows. 672px was also too narrow for the two side-by-side money columns the modal carries, which is why the comparison read cramped.

## Now

`max-w-[1400px]` — **the same width as the booking detail**, not an invented middle ground — and a **fixed** `h-[85vh]` rather than a max. The header (title, status, Close) is pinned; only the body scrolls inside it. Every invoice therefore opens identically whatever it contains, and the change history no longer scrolls the Close button off the screen.

Deliberately **not** applied to the Counteragents and Cashback modals: those are two-field add-forms, and a 1400px window for two inputs would be worse, not better. The rule is about detail windows.

Verified structurally: one fixed width, one fixed height, no content-dependent `max-h` anywhere in the modal, exactly one scroll container, and the same `max-w-[1400px]` as the booking detail.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 185 — BUILT

Date: 2026-08-17

Decision: **Every invoice filter on one bar at the top.** The separate "Search invoices" section at the bottom of the page is gone.

Owner: the status tabs, the date range, the invoice-number box and the two searches further down should all sit together, in one row.

## What was wrong with two places

The page answered the same question — *show me these invoices* — with **two different lists**: the filtered list at the top, and a By-agent / By-booking-number search with its own results table at the bottom. So the controls for one list sat below the results of the other, and which one you got depended on which control you happened to reach first.

## Now

One bordered bar above the list, same treatment as the Bookings toolbar: **status tabs with counts · date range · agent · number search**, with a hairline separating "what" from "when".

- **Agent became a filter**, not a search with its own table.
- **One number box matches an invoice number OR a booking number.** Nobody should have to know which field to type a number into. Done in SQL as a subquery so the filter stays one statement shared with the count — a second round trip would be a second chance to disagree. Verified: `BK-000040`, `INV-AA2FF`, `000040` and `AA2FF` each find the right invoice.
- The tab counts respect the agent as well as the dates, so a tab can never promise rows the list will not show.

Verified across all six filter combinations, including all four applied at once: **rows equal count every time**.

## Removed, said out loud

`normalizeBookingNumber` (which padded a bare "21" into BK-000021) is gone — the server now matches any substring of either number directly, so it has nothing left to do.

**A client-side CSV export of one agent's search results was removed with the section that held it.** The real agent statement — the `.xlsx` from Decision 086 — lives on the Balance tab and is untouched. Recorded here rather than left for someone to discover missing.

`Invoices.tsx` went from 685 to 569 lines, all of it deleted duplication.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 186 — BUILT

Date: 2026-08-17

Decision: **One invoice list.** The separate "Needs attention" table is removed, and the overlapping filter controls are fixed.

Owner's own proposal: *"Needs attention и All invoices чем отличается, так как обе стоят красным и нужно внимания — я предлагаю можно сделать один список всех красных и то что нужно внимания"*. Correct — an invoice appeared in **both**, two rows apart, with the same buttons.

## The overlap

`AgentSearchSelect` carries its own `min-w-[280px]`. I had put it in a `w-56` (224px) box, and **min-width wins over a parent's width — it does not shrink to fit**, so it overflowed and sat on top of the search field beside it. The wrapper is gone; the component sizes itself.

## Why the panel existed, and why it no longer needs to

The list is date-scoped (Decision 183), so a flagged invoice from July would fall out of today's window — that is the whole reason a separate always-loaded panel existed.

So flagged invoices now **carry forward into today exactly as Drafts already did**. Same urgency source as everywhere else (`list_urgent_booking_ids`), never a second computation. Verified: all 3 flagged invoices are in today's window, counts still agree, and a historical window stays historical (17 rows, all genuinely issued 19.07).

**Real bug caught by running it, not by reading:** the carry-forward needed the session and `_apply_invoice_filters` only took a query — a `NameError: name 'db' is not defined`, returned as a 500 on the first call. The session is now threaded through both callers.

## Ordering replaces the panel

Three tiers, most urgent first: a **real money difference**, then anything else **flagged or unsent**, then the rest. `sort()` is stable, so within a tier the server's newest-first order survives.

Today that renders as 2 red money rows, then 12 drafts and flagged, then everything else — the panel's job done by ordering instead of by a second table showing the same rows again.

Verified: count equals rows on all seven filter combinations. `Invoices.tsx` is down to 552 lines from 685 before this pass began.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 187 — BUILT

Date: 2026-08-17

Decision: The invoice list adopts the Bookings grid, and **admin pages become tabs** instead of replacing each other.

## 1. One table design

`Invoices.tsx` was one of the seven files `Table.tsx` was extracted from and had never adopted it — so the two money screens in the same admin panel read as two different products. Now `density="grid"` (Decision 176's ruled spreadsheet): the same lines, the same near-black type, the same right-aligned amounts as the Bookings list. No hand-rolled `<th>`/`<td>` remains in the file.

## 2. Open pages stay open

Owner: *"когда я открываю booking menu… не надо закрывать booking menu, пусть он будет открыт, но открывается другая страница… и добавь в конце × чтоб если не надо закрыть его"*.

Two separate things were closing on him, and both are fixed:

- **The page itself.** Selecting a nav item replaced whatever you were looking at, so checking an invoice and returning to Bookings meant rebuilding the filters you had set. Pages now open **alongside** each other and appear as tabs in the top bar, each with its own **×**.
- **The sidebar group.** Navigating to a top-level page closed whichever group was expanded — reasonable when navigation meant leaving the section, wrong once pages live side by side. The group now stays open.

Tabs use the nav's own labels via a new `navLabelFor`, so a tab and the sidebar item that opened it cannot say different things. The strip only appears once a second page is open — a single tab labelling itself is noise.

**The close rules, simulated rather than assumed** (open Bookings → Invoices → back to Bookings → close each in turn): reopening an already-open page never duplicates it; closing a background tab leaves the active page alone; closing the **active** tab lands on the one to its left; and the last remaining tab refuses to close rather than leaving an empty screen.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes.

---

# Decision 188 — BUILT

Date: 2026-08-17

Decision: Pages stop titling themselves, the filter bar is pinned to the top, and every control on it shares one size and font.

## 1. No self-titling headings

The open tab already says **Invoices**; a page repeating it one line below is the same word twice for no reader. "All invoices" removed, and **Price Calculator** likewise — its own explanatory line stays, which is the part that actually says something.

Checked the other modules rather than assuming: "Needs Attention", "Global markup", "Upload contract", "New cashback arrangement" are **section** headings inside a page, not page titles, and stay. `AdminNeedsAttentionView` renders a panel with no title of its own already.

## 2. The filter bar is pinned

On a long list the filters scrolled away, so changing a status or a date meant scrolling back up first. Now `sticky top-0` on both the invoice list and the admin bookings list. `z-30` clears the table's own header, and the negative margin plus matching padding lets the bar's background span the full width — otherwise rows show through beside it as they pass underneath.

**Only the admin instance of the bookings list pins.** The agent's own dashboard is not a long scrolling queue and that bar sits inside its own page flow there.

## 3. One size, one font

The status pills were `text-xs` while the inputs were `text-sm`, and paddings differed, so a single row of controls read as three kinds of thing. All four now sit at the same height and the same size:

| control | vertical padding |
|---|---|
| status pills | group `p-0.5` + button `py-2` = 10px |
| date range | `py-2.5` = 10px |
| agent | `py-2.5` = 10px |
| invoice/booking # | `py-2.5` = 10px |

The count inside a pill ("All **14**") stays smaller on purpose — a secondary figure, not a competing label. The date picker renders an **unframed** button, so the border/radius/background is the caller's job; without it the picker read as a different kind of control beside two framed inputs.

## Caught while writing it

The bookings bar was first written as a shared base class plus a conditional suffix — which put `bg-sand` and `bg-white`, and `border-b` and `border`, in one class list. Tailwind resolves that by **stylesheet order, not string order**: a recurring bug class in this project, already recorded. Each branch now builds its own complete class list, verified to contain no duplicate property.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes.

---

# Decision 189 — BUILT

Date: 2026-08-17

Decision: **A search ignores the date scope and searches every invoice.**

Reported: typing `80` returned nothing. The invoice exists — INV-CA53F683BCD4 for BK-000080 — but it was issued on the 16th and is `Issued`, so it neither falls inside today's window nor carries forward (only Drafts and flagged invoices do). The search was silently confined to the current dates.

Owner's own framing, sent while this was being fixed: *"если даты выбраны не на те даты, которые бронь сделано, надо сделать чтоб поиск искал все существующие invoice и показал"* — exactly the rule implemented.

A search box that only searches the current window is worse than no search box: it answers "not found" for something that exists.

## Where the rule lives

In `_apply_invoice_filters` — the helper the page query and the count **both** go through — not by having the caller drop the date parameters. The page and the count are two separate requests, and one of them forgetting is precisely how "1–25 of 0" happens. The bookings list solved the same gap caller-side (Decision 152's own note records it as "a real gap found live"); this puts the same rule where it cannot be got wrong.

## The screen says so

While a search is active the date control dims and the results line reads **"Searching all dates —"**. Without that the date pill still shows "Aug 17 – Aug 17" and looks like it is filtering, which is how the original confusion happened in the first place.

Dates still apply normally when not searching: today returns 14, and a 19.07 window returns 17 rows all genuinely issued that day.

## Verified exhaustively, not by example

Every one of the **53** invoices in the database is findable from today's view by its **booking number**, and every one by its **own invoice number** — 0 failures either way. Count equals rows on every search term tried.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 190 — BUILT

Date: 2026-08-17

Decision: **Incoming and Outgoing, side by side, per room — plus the hotel's own figure recorded against ours.**

## The two sides

The invoice detail showed one blended pair of numbers, so the question a manager actually asks — *the hotel billed us more than we expected, which room, and why* — had nowhere to be asked.

New section **2 · Incoming & outgoing**:

- **Incoming — what we owe the hotel.** Every category, per room, with any manual correction marked, a subtotal per room and a total. This is the cost side of the commercial ledger, so a hotel discount entered as an adjustment is already in it.
- **Outgoing — what the agent pays.** The same shape, the frozen agent price (Decision 178), so a correction on the incoming side never moves it. Ends with the margin.

Both are **per room throughout**, because a multi-room application is confirmed room by room and a single booking-level figure cannot say where a discrepancy is.

## The hotel's own figure

New `HotelPriceConfirmation` table, **one row per BookingRoom, upserted**: what the hotel billed, their reference number, and a free-text why. Recorded inline under each room on the incoming side, with the difference against our own figure shown in red where it exists.

Upsert rather than append-only, deliberately: this is a **single external fact with a current value**, not a history of our own actions. `InvoiceReviewNote` is append-only because it records what *we* did; a hotel correcting itself should replace its figure, not leave two contradictory ones. `confirmed_by`/`confirmed_at` still record who set it last.

Currency is taken from the room, never from the caller — a confirmation in a currency the booking was never priced in is a typo, and accepting one would put two currencies in one comparison. A negative amount is refused; an unknown room 400s.

**Partial confirmation is stated, not hidden.** The footer says "Hotel confirmed (1 of 2 rooms)" and a line underneath warns that the figure is not yet comparable to the full incoming total — summing a partial confirmation against a full total would invent a discrepancy out of rooms nobody has checked.

## Verified on real multi-room data

Six bookings, 1 and 2 rooms: per-room lines sum to each room's subtotal, room subtotals sum to the section total, on **both** sides — 0 problems. Booking 66 correctly shows a **−26,573.48** margin: a real, already-known consequence of a manual ledger correction, surfaced rather than smoothed over.

The section numbering renumbered to 1 Amounts · 2 Incoming & outgoing · 3 Changes · 4 Audit trail, physical order checked against the numbers.

Test confirmation removed afterwards; database unchanged at 53 invoices / 78 bookings / 83 rooms.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes.

---

# Decision 191 — BUILT

Date: 2026-08-17

Decision: **One hotel confirmation per booking, not per room.** Corrects Decision 190's own table, made the same day.

Owner, seeing "Hotel has not confirmed this room / Record" appear once per room: *"если 2 номера всё равно будет 1 переписка с отелем... если 1 номер или 8 всё равно всё под один email будет — нужно один email показать"*.

He is right, and the error was mine. I keyed the table on `BookingRoom` reasoning that a per-room figure locates a discrepancy — but that **modelled a conversation that does not happen**. The hotel invoices an application once, in one email, whatever it holds. A per-room form would have asked a manager to split one hotel invoice across rooms by hand before they could record it at all.

Which room a discrepancy sits in is still answerable — by the per-room Incoming breakdown directly above it, which is where the reader already is.

## What changed

`hotel_price_confirmations` rekeyed from `booking_room_id` to `booking_id`, still unique and upserted. The table was empty (Decision 190's own test row had been cleaned up), so this is a clean rebuild with nothing to migrate — checked before touching it rather than assumed.

The endpoint moved from `/booking-rooms/{id}/hotel-confirmation` to `/bookings/{id}/hotel-confirmation`. Currency now comes from the booking. The per-room bulk lookup is gone, as is the "partly confirmed (1 of 2 rooms)" warning — a partial state that can no longer exist.

One editor now sits under the Incoming table, comparing the hotel's single figure against our incoming **total**.

## Verified

On BK-000080 (2 rooms): recorded 6,600.00 against our 6,457.00 → difference **+143.00** with the reference and reason shown. Re-recording 6,457.00 replaced it (difference +0.00) and left **one** row, confirming upsert rather than append. The room objects carry no hotel field at all any more — verified structurally, not by eye.

Test data removed; database unchanged at 53 invoices / 78 bookings / 83 rooms.

Reason: project owner.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes.

---

# Decision 192 — BUILT

Date: 2026-08-17

Decision: The **Amounts** section is fixed and made legible. It was raising a false alarm on every multi-room invoice, and the owner could not tell what it was for — a fair complaint about a section that looks like the money again and is not.

## What it is for

One question: **has the booking changed since this invoice was issued?** Left is the amount frozen into the invoice; right is what the booking costs today. Equal → the invoice is still correct. Different → the booking moved after invoicing, and the agent may be owed a different amount.

Now stated in the section itself, behind a `!` (the shared `ActionInfo`, exported from Reservations so it is the same marker as everywhere else), rather than left to be inferred.

## The false alarm

The warning compared `computeBookingFinancials(booking)` — the **parent Booking row**, whose columns on a multi-room application hold the **representative first room only**.

On BK-000080 it compared **1,964.50** (room #1) against an invoice for **6,700.50** and declared "the price differs", while the column two centimetres to its right correctly showed 6,700.50 = 6,700.50. Two answers to one question on one screen, and the wrong one was the one shouting.

Same bug class Decision 178 fixed for the list, the breakdown and "Booked by the agent at"; this was the one place it survived. It now reads the same all-rooms figure that column already uses, from the same endpoint.

**Measured across all 53 invoices: 4 false warnings removed, 40 genuine differences still reported.** The fix quiets only the wrong ones.

## Made legible

- It now says so **when the totals match too** (`✓ The invoice still matches the booking — $6,700.50`). Silence on the good case is what made the warning unreadable: there was nothing to contrast it against, so a red box looked like the section's normal state.
- The mismatch message names both figures and the gap instead of only asserting that one exists.
- The two columns say what they are: *"Frozen in invoice — what the agent was billed"* and *"Booking now — all rooms"*.
- On a multi-room booking the header facts (room type, dates, guests) come from the parent row and therefore describe **room 1**. Not recomputed — the per-room truth is one section away — but now **labelled**: "This booking has 2 rooms. The details below describe room 1 only." Saying it was the part that was missing.

Reason: project owner — *"поправь, но сделай его понятным, а то мне самому не понятно"*.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes, database unchanged.

---

# Decision 193 — BUILT

Date: 2026-08-17

Decision: **Multi-currency readiness: markup per currency, totals per currency.** Groundwork for the Mauritius contract in EUR.

Owner's rule, and it is the cheap one: **one currency per booking, end to end.** A Mauritius hotel sells in EUR, the agent is invoiced in EUR, the hotel is paid in EUR. No exchange rates, no conversion, nothing to reconcile — that only becomes necessary if the company ever wants its whole turnover as a single figure.

Currency already flowed `contracts → rates → bookings → invoices`, and search already prices off `contract.currency`, so a EUR contract would have displayed in EUR unaided. Two things would have been wrong.

## 1. The markup

It was **one global row**: `10.00 USD per night`. Since the markup is an **absolute amount, not a percentage**, applying it to a EUR booking would have added **10 EUR** because 10 USD was configured — a different amount, silently, on every night of every EUR booking.

Now one row per currency (`USD 10.00`, `EUR 10.00` — the owner's figure). Which row applies is decided by the **contract's own currency**, resolved inside Pricing Engine from the `contract_id` it already receives — deliberately **not** added to `apply_agent_pricing`'s signature, because LOCKED Booking Engine calls it directly and has no opinion about currency. Falls back to USD if a contract cannot be read: the markup must never be the reason a price fails to compute.

Proved end to end by temporarily flipping contract 2 to EUR with a distinct EUR markup: the same stay priced 50.00 markup in USD and 35.00 in EUR, then contract and markup were restored.

## 2. Totals that summed across currencies

**Balance** added every invoice into one number and stamped it with the **first invoice's** currency — fine while everything was USD, wrong the moment EUR exists. Now Amount and Profit render one line per currency, sorted. No conversion, which is the honest answer without rates.

The bookings list's "Total profit" already split by currency — checked rather than assumed, and left alone.

The admin markup screen now shows one input per currency, with a line saying plainly that the contract's currency selects the row and that nothing is ever converted.

## Not done

The `.xlsx` agent export and `generate_agent_statement` remain explicitly single-currency (already documented as such). They are per-agent, per-period documents; a mixed-currency statement needs its own decision about whether it becomes two documents or two sections.

Reason: project owner — EUR markup 10 per night, totals split USD/EUR in Balance and in the bookings list.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the project's 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors, filter/pagination suite passes; contracts still all USD, 78 bookings / 53 invoices untouched.

---

# Decision 194 — BUILT

Date: 2026-08-17

Decision: **The St. Regis Le Morne, Mauritius entered as real contract data — the first EUR contract, and the first hotel with a real email address.** Zero code changes. This is the test Decision 116's formula principle asked for: does a third hotel, in a second currency, from a contract nobody designed the schema around, go in **by data alone**? It did.

Loaded from `contract2027.pdf` (01.11.2026 – 31.10.2027) into hotel #14 / contract #9: 19 room types, 14 markets, 11 season windows, 4 age categories, 3 meal plans, **207 rates**, **621 rate supplements**, 11 cancellation tiers, 2 minimum-stay rules.

Every figure was parsed from the PDF **twice by independent methods** — once by text lines, once by x-coordinate columns — and the two parses cross-checked against each other before anything was written, because this contract's rate table has jumbled header ordering that a single text extraction reads wrongly. The 11 season windows were verified to tile the contract's own validity exactly: **365 days, no gap, no overlap.** 5 of 5 live price checks matched the PDF to the cent.

`Hotel.email` is populated for the first time (`reservations@stregislemorne.com`, from the contract's own Reservation Email Address block) — the LPO's empty "To" field, flagged as a blocker in Decision 154, now has one real hotel that fills it.

## The one real bug this surfaced — and it was in my data, not the engine

The first HB price check returned **200.00 where the contract says 400.00** for 2 adults × 2 nights. My initial read was that the engine multiplies a meal supplement per room instead of per person, and I reported it as an engine limitation. **That was wrong, and worth recording as wrong**, because the owner's answer is what corrected it: *"kandima doplata na cheloveka"* — Kandima has always charged per person and its figures have always verified.

`get_room_price` has **two** meal-supplement paths, and they are already exactly right:

- inside the age-category bucket loop, a `meal_plan_supplement` carrying an `age_category_id` is multiplied by **that bucket's headcount** — per person;
- below it, a supplement with `age_category_id IS NULL` is applied **once** — per room.

Kandima's 30 rows are tagged `Adult` (HB+ 90 / FB+ 140 / PAI 195, `per_person_per_night`) and take the first path. The 414 St Regis rows I created were left untagged and took the second. **The engine was never wrong; the tag is the switch, and I failed to set it.**

Fix: `age_category_id = Adult` on all 414 St Regis meal rows — the contract says "Adult Supplement per night", children sharing are free of charge. `service.py` untouched. Kandima's rows untouched (checked, not assumed: 30 rows, all still `Adult`, the UPDATE was scoped to contract 9's rates).

Verified after the fix — St Regis Junior Suite King, HIGH 1, 2 nights, BB base 1,700.00:

| Occupancy | Total | Supplement | Contract |
|---|---:|---:|---:|
| 1 adult HB | 1,900.00 | 200.00 | 100 × 2 × 1 ✓ |
| 2 adults HB | 2,100.00 | 400.00 | 100 × 2 × 2 ✓ |
| 3 adults HB | 2,300.00 | 600.00 | 100 × 2 × 3 ✓ |
| 1 adult FB | 2,000.00 | 300.00 | 150 × 2 × 1 ✓ |
| 2 adults FB | 2,300.00 | 600.00 | 150 × 2 × 2 ✓ |
| 2 adults BB | 1,700.00 | — | no supplement ✓ |

Kandima regression, Beach Studio, 3 nights: BB 1,854.00 unchanged; HB+ 2 adults 2,394.00 (540 = 90×3×2); PAI 1 adult 2,439.00 (585); PAI 2 adults 3,024.00 (1,170). All per adult per night, all unchanged.

**Rule this establishes for every future contract:** a meal supplement is entered **with the age category it applies to**. An untagged row means "per room" and should be rare and deliberate. Nothing in the UI enforces this yet — an entry form that lets a manager leave it blank will reproduce this exact under-charge, which is a real follow-up, not a hypothetical one.

## Deliberately not entered — flagged for the owner

These are in the PDF but were **not** guessed at, because each one needs either a mechanism decision or a figure the contract does not state:

- **Festive supplements** (24 and 31 December) — mandatory gala dinners, per person, not modelled as a date-scoped per-person charge anywhere yet.
- **10% child/teen own-room discount** — a discount on a *separate* room, keyed to the occupant's age; no existing mechanism expresses that.
- **Extra bed 50 EUR** — needs `"extra_bed"`, the one `RateSupplement.adjustment_type` still unimplemented since Decision 016.
- **Offers**: honeymoon, golf, long-stay 10%, repeaters.
- **PEAK rates for the 1BR and 2BR villas** — genuinely absent from the contract's own table, so those two season/room combinations are left unpriced rather than filled with a neighbouring season's figure. A search over the PEAK window simply will not offer them.
- **Per-season release rules** — the system holds one release field per contract; entered at the **strictest** value (14 days), which under-books rather than over-books.

Reason: project owner — *"posmotri contract i dobav ego"*, then *"kandima doplata na cheloveka"*.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** No code changed. Contract 9 live and priceable in EUR; St Regis 5/5 and Kandima 5/5 verified against source figures; contracts 2 and 8 untouched.

---

# Decision 195 — BUILT

Date: 2026-08-17

Decision: **A newly entered contract is invisible until activated — and the flexible-date strip was ranking prices across currencies.** Both found from one owner report: *"tceni ne pokazviaet v sisteme, naprimer april 2027 dbl"* → "Нет активного контракта" on St Regis.

## 1. Draft is invisible, and nothing says so

`Contract.contract_status` defaults to `"Draft"` (`repository.create_contract`), and `get_active_contract` matches only `"Active"`. Decision 194 created contract 9 through the real API and therefore got a Draft — every rate, season and supplement correct and in place, and the hotel still answering "no active contract" for every date. Kandima and Siyam World are both `"Active"`, so this had never come up before: they were the only two contracts, and both were activated long ago.

Nothing was wrong in the engine and nothing was changed in it. Contract 9 set to `"Active"` through `PUT /contract-engine/contracts/9`, so the engine's own `validate_contract_status` ran rather than a raw UPDATE.

**Worth stating plainly, because it will happen again:** entering a contract is two steps, and the second one is invisible. Loading 207 rates does not make a hotel bookable. Any future contract-entry flow (including AI Core Engine's write-through, which calls the same `create_contract`) lands in Draft and needs an explicit activation. A search screen that said *why* a hotel has no contract — Draft, expired, or genuinely absent — would have made this self-evident; today all three read identically.

Verified after activation, St Regis Junior Suite King, April 2027 (HIGH 2, 945.00 EUR/night), 7 nights, 2 adults:

| Meal | Net | Agent | Check |
|---|---:|---:|---|
| BB | 6,615.00 EUR | 6,685.00 EUR | 945 × 7 ✓ |
| HB | 8,015.00 EUR | 8,085.00 EUR | + 100 × 7 × 2 ✓ |
| FB | 8,715.00 EUR | 8,785.00 EUR | + 150 × 7 × 2 ✓ |

Markup 70.00 = 10 EUR × 7 nights, from the EUR settings row (Decision 193). The flexible-date scan now returns all three hotels together, 6 units in 1.26s, EUR beside USD.

## 2. The flexible-date strip compared currencies as bare numbers

Found by checking the above rather than reported: `FlexibleResultsPanel` computed one global `cheapest`/`dearest` across every cell and rendered a savings line as `dearest - cheapest`, **stamped with the first cell's currency** — the identical mistake Balance made before Decision 193.

Latent while every hotel was USD. Reproduced against real data the moment a EUR contract existed — a Nov–Dec 2026 scan of Siyam World + St Regis, where the cheapest displayed figure genuinely flips currency between dates:

| Date | Shown | Also available |
|---|---|---|
| 05.11.2026 | 6,685 EUR St Regis | 6,746 USD Siyam World |
| 05.12.2026 | 6,020 EUR St Regis | 6,746 USD Siyam World |
| 26.12.2026 | 9,269 USD Siyam World | 15,470 EUR St Regis |

Before: **"save 3,249 EUR"** — 9,269 USD minus 6,020 EUR, labelled EUR. A number with no meaning.
After: **"EUR: 665"** only; USD is flat across these dates and is omitted.

Fixed by keeping min/max **per currency** in a `Map`, exactly Decision 193's rule — split, never convert. Green highlight now means "cheapest **in its own currency**", and both it and the savings line are gated on the same `max > min` condition, so the two cannot disagree. That gate also removes two pieces of noise the old code produced: a currency represented by a single cell used to be badged cheapest against nothing, and a month where every date costs the same used to turn entirely green while the savings line correctly stayed silent.

**Known and accepted, not fixed:** `buildFlexibleCells` still picks each date's displayed row by the smallest raw number, so on a date carrying both currencies the cell shows whichever figure is numerically smaller. One cell has room for one figure and no exchange rate exists, so there is no better pick available — but what the cell then displays is true (that hotel really does cost that, in that currency, and the currency is printed under it), the tooltip lists every hotel with its own currency, and the ranking claim — the green badge — is now made only within a currency. Revisit only if agents actually search across currencies routinely; the common case is one destination.

Reason: project owner — *"tceni ne pokazviaet v sisteme, naprimer april 2027 dbl"*.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors. Contract 9 Active and priceable; contracts 2 and 8 untouched; single-currency scans render byte-identically to before.

---

# Decision 196 — BUILT

Date: 2026-08-17

Decision: **Transfers become a real module: priced per person OR per vehicle, declinable everywhere, and editable by the owner without a developer.** Started from one reported lie on screen — *"napisano Итого (проживание + трансфер), ot kuda info o transfer?"* — and was deliberately built as foundation rather than a Mauritius special case, on the owner's explicit instruction: *"Mnogie napravlenii delaetsya transfer takim je obrazom za mashinu i mogut sami ekhat toje, poetamu nujno etogo postavit v fundament proekta chtob ne lomat v budushem, i eto doljen bit kak modul."*

## 1. The label was lying

`grandTotalLabel` was the fixed string "Итого (проживание + трансфер)" with an optional tax suffix — printed on every room card regardless of whether a transfer was in the figure. On St Regis, which sells none, it claimed a transfer inside a pure accommodation total. Now assembled from the parts actually summed, so it reads "Итого (проживание)", "(проживание + трансфер)", or "(проживание + трансфер + налог)" and cannot drift from the arithmetic. `taxSuffix` is gone; three part-name keys replace it in both catalogs.

## 2. Per-vehicle pricing — the mechanism, not the hotel

Every transfer before this was per person, and `ContractTransferOption` only had `price_adult`/`price_child`/`price_infant`. A seaplane seat genuinely is per passenger; **a road transfer is sold by the car** — a sedan to Le Morne is 220 EUR round trip whether one guest rides in it or three. Entering 220 as `price_adult` would have billed a couple 440 for one car, and a family of four 880.

New `pricing_basis` (`"per_person"` default | `"per_vehicle"`) and `price_per_vehicle` on the option, added by raw `ALTER TABLE` (Decision 084/089 technique). **All 4 pre-existing rows were explicitly stamped `per_person`** rather than left NULL, so their behaviour is stated in the data, not inferred from a default. `get_transfer_price` branches on the basis and returns three new fields (`pricing_basis`, `price_per_vehicle`, `vehicle_total`) — purely additive: Booking Engine and Finance Engine only ever read `total`, verified by grep before touching anything.

On a `per_vehicle` row the three per-person columns are a real, computed **0.00**, and the fare is **not** folded into `adult_total`. That would have been the smaller change, and it would have made every breakdown in the system print a car's fare as an adult's fare. `validate_transfer_pricing_basis` refuses both mismatches — a `per_vehicle` row without a fare (which would price the transfer at nothing, silently) and a `per_person` row carrying one (a number nobody reads and nobody can explain a year later).

A transfer discount, if one ever applies, reduces the car fare as a whole — there is no adult/child split for `applies_to_children` to divide. No real offer discounts a road transfer today; it is wired so a `per_vehicle` row can never be silently exempt from a discount a `per_person` row on the same contract would have honoured.

## 3. "Without transfer" is a choice, not an absence

Guests taking their own taxi, or having a transfer arranged elsewhere, is a normal outcome on many destinations. Before this the agent could only ever **add** a transfer: once a radio was picked there was no way back to none, and a never-touched block was indistinguishable from a deliberate decision. An explicit "Без трансфера / Without transfer" option now leads the list, hidden only where the contract makes a transfer mandatory. New `CartRoom.transferDeclined` — true only when a transfer **was** on offer and was declined — is what lets the cart and the checkout say "Без трансфера" for a real decision while staying silent for a hotel that simply doesn't sell transfers. A null `transferType` alone cannot tell those apart, and both used to render the same blank line.

## 4. The module part: the owner can now do this without me

`Contracts.tsx`'s Transfers block was **read-only** — every transfer in this system was created by a developer running a script. Adding a destination therefore required me. It now has add / edit / delete, with a Per person ⇄ Per vehicle toggle that swaps which price fields are asked for, and `PUT`/`DELETE /contract-engine/contract-transfer-options/{id}` behind it (only `POST` and list existed).

The update is partial and normalising: editing a fare never re-opens the basis question, and switching basis clears the fields the other basis reads, so a row can never describe itself two ways at once. Delete is a real delete — the row carries no history, and a booking that used it froze its own `transfer_type`/`transfer_total` at booking time, so removing an option cannot change what anyone was charged; setting `status` to something other than `"Active"` remains available for an option a destination wants to keep on file but stop selling. The toggle is built from `<button>`s, not native radios, for the reason already documented in Known issues.

## Mauritius data, entered through that module's own API

Standard Sedan 2025 **220 EUR**, Lexus ES 2025 **300 EUR**, Mercedes S-Class 2025 **500 EUR** — all `per_vehicle`, round trip, on contract 9.

Verified: each priced identically for 1 adult, 2 adults, 2+2, and 4+1 infant — party size does not move it. Per-person regression on Kandima and Siyam World unchanged (414/828/1128 and 515/1030). All 7 admin actions exercised against the live API, including both basis switches and the rejection of a nonsense basis; the test row was deleted afterwards and St Regis's three real options confirmed intact.

Agent-facing result for the exact search in the owner's screenshot (Junior Suite King, BB, 7 nights, 2 adults + 2 children): 6,020.00 EUR without transfer — matching the screenshot to the cent — then 6,240 / 6,320 / 6,520 with each car.

## Known gap, stated rather than guessed at

**One option selected means one vehicle.** Nothing consults a vehicle capacity, because no contract states one — a party of six would be charged for one sedan. Deliberately not solved by inventing a capacity per car type: the honest fix is either a capacity column filled from real contract data or an explicit vehicle-count field the agent sets, and which one is right is the owner's call. Flagged to the owner in plain terms rather than silently modelled.

## Found while verifying, unrelated and not fixed

**Every special offer in the system has expired** — KM26_03's booking window closed 2026-07-31, all four SWJ26 offers closed 2026-08-15, two days ago. So no room or transfer discount applies anywhere today. This is why Decision 034's verified 564.00 Kandima figure now computes as 1128.00: not a regression (confirmed by running the pre-change code, which gives the identical 1128.00), just an offer that has genuinely lapsed. New booking windows are data the owner needs to enter for 2026/27. To prove the discount path itself was untouched, offer 5's window was temporarily opened, old and new code compared (both `[1340.00, 825.00, 310.00]`, exactly the expected no-tier / 50% / 100% adults-only results), and the window restored to `2026-08-15`.

Reason: project owner — the reported false label, the Mauritius transfer prices, and the explicit instruction to make this foundation and a module.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors. 4 pre-existing transfer options stamped `per_person` and unchanged in behaviour; 3 new Mauritius options live; no LOCKED engine's existing behaviour altered.

---

# Decision 197 — BUILT

Date: 2026-08-17

Decision: **A transfer option states how many guests it can carry, and the system stops offering one that cannot.** Closes Decision 196's own stated gap the same day, because the owner supplied the missing data: *"vse varianti kotoriy dobavili eto maximum do 2+2 / vishe 2+2 do 8 pax mercedes v class summa 550 euro tuda i obratno."*

Decision 196 deliberately shipped without capacity and said so — one selected option meant one vehicle, and a party of six would have been charged for one sedan. That was the right call at the time (no contract stated a capacity, and inventing one per car type would have been a guess); it is superseded now that the figures are real.

## The rule

New nullable `ContractTransferOption.max_passengers`. **NULL means the contract states no limit** — the honest value for a seaplane or a scheduled flight, and what all 4 pre-existing per-person options keep. It is never read as zero.

**Counted as adults + children + infants** — deliberately unlike Hotel Engine's `max_occupancy`, which excludes infants. A bed can be shared; a seat belt cannot. Over-counting sends a family to the larger car, under-counting sends five bodies to a four-seat one, so the error this convention makes is the harmless one. Stated in the model, in the admin form's own helper text, and enforced identically on both sides.

Enforced in two places on purpose:

- `get_transfer_options(db, contract_id, guests=None)` gained an optional party size, exposed as `?guests=` on the available-options endpoint. Optional and defaulting to None, so every existing caller keeps the full list.
- `get_transfer_price` **refuses** an option too small for the party, with a message naming both numbers. This is the one that matters: without it a stale screen or a direct API call could still book six people into a sedan.

## The search page needs both halves, so it filters locally

`HotelSearch.tsx` fetches the full Active list in **one** request and splits it itself, rather than asking the endpoint to filter. It needs the options that fit **and** how many exist but are too small — a filtered-only response would make a contract selling four transfers look like it sells none, with the whole transfer block silently vanishing for a party of five. New `HotelResult.transfersTooSmall` carries that count, and the block renders an amber line naming the party size instead of disappearing. The endpoint's `guests` filter remains as the protection for any other caller. Each option now also shows its own capacity ("· до 4 гост."), since that is the fact deciding the choice.

## Admin

The capacity field sits **outside** the per-person / per-vehicle branch in `Contracts.tsx`'s transfer form — a shared speedboat has seats too, so capacity is independent of how the fare is calculated. Empty means "no stated limit" and is sent as an explicit `null`, never dropped from the payload.

## Mauritius data

| Option | Fare | Carries |
|---|---:|---:|
| Standard Sedan 2025 | 220 EUR | up to 4 |
| Lexus ES 2025 | 300 EUR | up to 4 |
| Mercedes S-Class 2025 | 500 EUR | up to 4 |
| **Mercedes V-Class** (new) | **550 EUR** | **up to 8** |

Verified live: 2 guests and 4 guests see all four cars; 2+2+1 (five, infant counted) and 3+2 see only the V-Class with "3 options hidden"; nine guests see none and only "Без трансфера" remains. The server refuses `sedan_standard` at five guests and `mercedes_v` at nine, quoting both numbers. Kandima's three per-person options, `max_passengers` NULL, are still offered to parties of 2, 8 and 20 — an unlimited option must never be filtered out.

End-to-end totals (BB, 7 nights): Junior Suite King 2 adults — 6,020 without transfer, then 6,240 / 6,320 / 6,520 / 6,570. Two Bedroom Family Suite 2+2+1 — 8,540, then 9,090 as the only option.

## Deliberately no minimum

A couple is still offered the V-Class at 550 EUR. The owner described the tiers as "above 2+2 → V-Class", but a maximum is a safety constraint while a minimum would only remove a legitimate choice — an agent may want the larger car for luggage. Flagged to the owner rather than assumed: if the V-Class should be hidden below five guests, that is a `min_passengers` field, not a change to this one.

Reason: project owner — capacity figures for all four Mauritius vehicles. (Same message also confirmed: expired special offers stay as they are for now — *"poka ostavim kak est'"*.)

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors. All 4 pre-existing per-person options keep `max_passengers` NULL and are unfiltered for any party size.

---

# Decision 198 — BUILT

Date: 2026-08-17

Decision: **A vehicle's capacity is two numbers, not one: total seats and adult-sized seats.** Corrects Decision 197's own table hours after it was written, on the owner's correction: *"do 4 gost eto tolko do 2+2 detyam do 11.99 let / esli 3 vzr uje nelyza libo 4 vzr nelzya / 1+3 do 11.let mojno / 2+1 mojno."*

Decision 197 modelled a sedan as "up to 4 guests". That is wrong in a way a single number cannot fix: the same car takes **2 adults + 2 children** but refuses **3 adults**, and takes **1 adult + 3 children** again. Four is the body count; two is the adult-sized count; both are real and independent.

## The rule

New nullable `ContractTransferOption.max_adults`, alongside Decision 197's `max_passengers`. NULL means no separate adult limit — a V-Class is simply 8 seats, any mix.

**"Adult" here means anyone aged 12 or over, and this needed no new mechanism at all:** `HotelSearch.tsx`'s `deriveOccupancy` already promotes a 12-year-old out of `childAges` and into `adults` (`childAges.filter(a => a >= 12)`), with `children` being 2–11 and `infants` under 2. So the owner's "детям до 11.99 лет" boundary is exactly the boundary the search form has always used, and a 14-year-old counts against the adult seats on its own, with no age plumbing added anywhere. This was checked before designing the field, not assumed.

Both limits are enforced in both places, independently:

- `get_transfer_options(db, contract_id, guests=None, adults=None)` — a second optional filter param, exposed as `?adults=` on the available endpoint alongside `?guests=`. A NULL limit on an option is never read as zero.
- `get_transfer_price` raises separately for each, naming both numbers, so the message says *which* limit was hit ("takes up to 2 guests aged 12 or over — this booking has 3"). The refusal is the load-bearing half: 3 adults is under the sedan's total of 4 and would pass a total-only check.

The admin form asks for both as a pair, refuses an adult limit above the total (meaningless, and misleading to whoever reads the row later), and explains the pair in the owner's own terms — "4 in total, of which 2 aged 12+".

The search page's hidden-options warning was **reworded**: Decision 197's "fewer seats than guests" is no longer true when the reason is the adult limit, so it now names the party mix ("2 взрослых, 2 ребёнка") rather than asserting which limit was breached.

## Mauritius data

| Option | Fare | Total | Aged 12+ |
|---|---:|---:|---:|
| Standard Sedan 2025 | 220 EUR | 4 | 2 |
| Lexus ES 2025 | 300 EUR | 4 | 2 |
| Mercedes S-Class 2025 | 500 EUR | 4 | 2 |
| Mercedes V-Class | 550 EUR | 8 | no limit |

Every one of the owner's six examples verified against the live system:

| Party | Sedan offered | Owner's rule |
|---|---|---|
| 2 adults + 2 children | yes | allowed ✓ |
| 2 + 1 | yes | allowed ✓ |
| 3 adults | no — V-Class only | not allowed ✓ |
| 4 adults | no — V-Class only | not allowed ✓ |
| 1 adult + 3 children | yes | allowed ✓ |
| 2 + 2 + 1 infant | no — V-Class only | 5 bodies ✓ |

Asked directly, the API refuses the sedan for 3 and 4 adults quoting the adult limit, and prices it at 220 EUR for 1+3 and 2+2. Kandima's and Siyam World's per-person options carry NULL for both limits and remain offered to any party.

Reason: project owner — the correction above, with all four vehicles' real limits.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the 2-error dead-file baseline, `npx vite build` clean. All 4 pre-existing per-person options have both limits NULL and are unaffected.

---

# Decision 199 — BUILT

Date: 2026-08-17

Decision: **A room's transfer can be changed after the booking exists — by the agent as well as a manager — and the admin panel is told about it in the same request.** Owner's requirement: *"s pervo khoteli sidan potom reshili brat' lexus, chtob radi etogo ne otmenit bron... agent chtob delal eto izminenia u sebya cherez agent panel. kak tolko delaetsya izminenia srazy v admin panel doljen soobshenia priyti... tak kak izminenia mojet proizoyti cherez 3 mesyaca posle zayavok."*

Before this, the only way to record a change of car was to cancel and rebook — throwing away the booking's whole history over a 220 → 300 EUR swap.

## Scoped to one room, deliberately

`transfer_type`/`transfer_total` are `BookingRoom` columns, a multi-room party can genuinely split across vehicles, and every other real change on this model (dates, confirmation number, cancellation) is already per-room. `service.change_room_transfer` re-prices through Contract Engine's own `get_transfer_price` against **the room's** contract and dates, not the application's, since rooms in one application can hold different dates.

`new_transfer_type=None` is a first-class value — "the guests will make their own way" (Decision 196) — and clears `transfer_total` to NULL, not 0.0, keeping "no transfer" distinct from "a transfer that costs nothing". The schema uses `Optional[str] = Field(...)`: required-but-nullable, so None must be sent explicitly and an omitted field is a malformed request rather than a silent removal.

**Capacity came free.** Because the re-price goes through `get_transfer_price`, Decisions 197/198's limits apply to a change with no extra code: three adults are refused the sedan on a change exactly as they would have been at booking. The new `GET /rooms/{id}/transfer-options` filters by the room's own party through the same rules, so the change screen never offers a car the change would then refuse.

Refused before any write: a Cancelled/Rejected room (no trip left to transfer anyone to), a room mid-cancellation (same guard `change_booking_dates` already applies), a terminal application, and re-selecting the option already in place. A reason is required, same as a date change — a change landing three months later needs to say why, and whoever reads it is usually not who made it.

## The notification is in the same request, not a follow-up browser call

Decisions 080/083/094 all use best-effort frontend orchestration, and CLAUDE.md records why: avoiding a circular import. **Checked rather than assumed — there is none to avoid here.** `finance/service.py` imports booking's *service*, never its *api*, so `booking/api.py → finance/service.py` is acyclic (verified by importing both). The owner's requirement is that the change gets noticed; a signal that depends on a second call from a browser succeeding does not meet it.

`finance_service.record_transfer_change` does two things:

1. Appends an `InvoiceReviewNote` against the booking, which is what puts it in the admin panel's **"Needs Attention"** until someone acknowledges it — Decision 108's booking-rooted urgency mechanism, reused entirely unchanged.
2. Re-syncs the room's `transfer` commercial line. **This was a real trap, not a precaution:** `get_or_seed_commercial_lines` seeds once and never re-reads the BookingRoom, so without this the Commercial breakdown and the invoice would keep quoting the old car's price forever. Only `base_cost`/`base_price` are touched — `adjustment_cost`/`adjustment_price` are a deliberately separate manual correction, so re-syncing the system figure cannot discard a manager's own entry. A line that has never been seeded is left alone, matching `get_booking_commercial_summary`'s rule about not creating rows for rooms nobody opened.

**All 8 price-snapshot columns stay NULL.** Those columns describe a *date* change, and `financeShared.tsx`'s `formatSingleNote` picks its rendering tier from `old_total`/`new_total` — populating them here without dates would have rendered this note as a date change containing "Invalid Date". Found by reading that function before writing the note, not by seeing it break.

The note names the **cars**, not the `transfer_type` codes: `change_room_transfer` resolves the display names once and returns them, because "sedan_standard → lexus_es" makes the reader look up two codes to understand a sentence about a car. Generated in English server-side per Decision 111.

If the note itself fails, the change is already committed, so it is logged rather than pretended away — the change really did happen.

## Frontend

`RoomTransferEdit` lives in `Reservations.tsx` — the **shared** file, not `AdminBookingFinance.tsx`'s admin-only extensions — because the owner asked for the agent to do this in their own panel. Mirrors `RoomConfirmationNumberEdit`'s shape exactly. The current transfer, its price, and an amber "changed <date>" chip render for anyone who can see the room, not only whoever may edit it. Hidden entirely on a Cancelled/Rejected room. Three new `BookingRoomResponse` fields (`transfer_change_reason`/`transfer_changed_at`/`transfer_changed_by`) carry the audit trail to the UI so it is visible on the booking, not only inside finance.

## Verified

Against the real St Regis booking **BK-000082**, which had genuinely been booked with the Standard Sedan — the owner's exact scenario. Sedan → Lexus (220 → 300, +80), Lexus → S-Class (+200), S-Class → no transfer (−500), back to sedan: each one re-priced correctly, appended a numbered note, put the booking into Needs Attention, and re-synced the ledger line, which returned to 220.00 across all four. Refusals confirmed: re-selecting the same option, an unknown `transfer_type`, and a missing reason.

Permission boundary verified directly against real user rows: **admin allowed, the booking's own agent (id 2) allowed, an unrelated agent refused 403** "You can only modify bookings you own". Tested in-process rather than over HTTP because `SECRET_KEY` is regenerated on every restart (the known limitation in CLAUDE.md), so a locally minted JWT cannot authenticate against the running server.

Test notes and audit fields created while verifying were removed afterwards. The one note now on BK-000082 is the owner's **own** live change through the UI ("they dont wanted transfere", Standard Sedan → no transfer), left exactly as it is — the feature working in production, not test residue.

Reason: project owner — the requirement quoted above.

Approved By: Daler (2026-08-17)

Status: **Built and verified.** `npx tsc -b` at the 2-error dead-file baseline, `npx vite build` clean, `npx oxlint` 0 errors. 84 pre-existing booking_rooms have all three new columns NULL and behave exactly as before.

---

# Decision 200 — BUILT

Date: 2026-10-13

Decision: **The admin booking queue gets real work queues — Unassigned, Mine, Needs Attention — whose counts and lists are computed by the server over the whole database, never over the page that happens to be loaded.** Booking Engine (LOCKED) is extended, additively, with three optional list filters and one read-only counts endpoint. Recorded here before the LOCKED module is touched.

Owner's requirement: the queues "должны работать по всей базе, а не только по текущей странице … Не допускай двойного учёта или расхождения между счётчиком и списком. Сохрани прежнее поведение всех существующих API-запросов без новых параметров."

## Why the API has to change at all

`GET /booking-engine/bookings` could filter by status, hotel, agent and dates, but not by who is responsible. The admin screen paginates (Decision 152), so "bookings nobody has taken" could only be counted inside the 50 rows on screen — the exact "answer that looks right and isn't" Decision 152 exists to prevent. No amount of frontend work produces a correct whole-database count from one page.

## Scope — exactly this, nothing else

Three optional query parameters, on **both** `GET /bookings` and `GET /bookings/count`:

- `claimed_by: int` — bookings whose responsible manager is that user. A plain filter, no status condition.
- `unassigned: bool` — `claimed_by IS NULL` **and** status not in (Cancelled, Rejected, Completed).
- `mine: bool` — `claimed_by` = the caller (taken from the JWT, never from the query string) **and** status not in the same three.

One new read-only endpoint, `GET /booking-engine/bookings/queue-counts`, returning `{"unassigned": N, "mine": N}`. It accepts the same optional `status` / `hotel_id` / `agent_id` / `search` filters as the list, so a tab's number is always the number of rows that tab will show under the filters currently applied.

**"Unassigned" is not a new rule.** It is the predicate `_apply_booking_filters` already uses for Decision 164's carry-forward ("a booking nobody has taken on carries forward to today"), lifted into one shared expression so the carry-forward and the queue cannot drift apart. Decision 177 established that "nobody has taken this" is about the owner, not about the status being Pending; the same reading applies here.

**No date scope on queue counts, deliberately.** A booking nobody owns is unowned regardless of the day it was created. The screen drops its date range while a queue is selected, the same way the booking-number search already overrides it (Decision 125). **Superseded by Decision 208 (owner, same day): the dates now apply in every queue; the UI counts tabs through `/bookings/count` and no longer calls `/bookings/queue-counts`.**

Not changed: the database schema (no column, no index, no migration), `BookingResponse`, the claim endpoint, any pricing/allotment/cancellation logic, any other engine.

## How "count equals list" is guaranteed rather than hoped for

The counts endpoint does not have its own SQL. It calls the same `_apply_booking_filters` the list and `/bookings/count` call, with the same arguments the screen sends when that tab is selected. A tab's number and its list are therefore the same query with and without `LIMIT` — the property Decision 152 already relies on for "1–50 of N".

Needs Attention needs no API change: `GET /finance-engine/bookings/urgent` (Decision 108) already returns the complete, unpaginated set, so its count and its list are one response.

## Backward compatibility

All three parameters default to "not supplied", and each adds a `.filter()` only when supplied — a request without them builds byte-identical SQL to before. The new route is declared above `/bookings/{booking_id}`, whose `int` path parameter would otherwise swallow it (the bug `api/routes.py`'s `/agent-registrations/stats` still has).

## Known limits, accepted

- `claimed_by` has no index. Irrelevant at today's 79 rows; worth adding when the table is large enough to measure, as its own decision (it is a schema change).
- A queue is a point-in-time read. Two managers looking at Unassigned see the same row until one takes it; the claim endpoint is what arbitrates, exactly as before.

Reason: project owner — quoted above; plan presented and approved before implementation.

Approved By: Daler (2026-10-13)

## What was built

Backend (`booking/repository.py`, `service.py`, `api.py`): the three filters, `_unassigned_open()` shared with the carry-forward, `service.count_work_queues`, and `GET /bookings/queue-counts` (admin-only, declared above `/bookings/{booking_id}`). `mine` reaches the repository as `mine_user_id`, set by `api.py` from the JWT.

Frontend, admin only: `AdminBookingsQueues.tsx` (header + queue tabs), wired through two new optional slots on `AdminBookingExtensions` (`renderQueueBar`, `renderAttentionQueue`). `Reservations.tsx` holds the queue state because the fetch lives there, but at its defaults — which is all the agent's list can ever have — it adds nothing to the request.

The selected tab does not show a separately-fetched count: it shows the list's own total, the figure the pagination footer prints. A tab and its rows are one number.

## Verified

All write scenarios ran against an **isolated contour**: the real backend code started on port 8002 over a *copy* of the database (a launcher rebinds `database.db`'s engine before anything imports it; the hardcoded path in `db.py` was not edited). The working database was not written to by any check.

- **Existing calls unchanged:** 49 list/count/detail calls without the new parameters, response bodies hashed before and after — 49 of 49 identical.
- **Counts against independent SQL** (written from the definitions, not copied from the repository): unassigned 10/10, mine 18/18; under eight filter combinations (status, hotel, agent, search, combined) every count equalled both the SQL and the number of rows the list returned across pages.
- **No double counting:** Unassigned and Mine are disjoint; no closed booking appears in either; no row repeats across pages.
- **Unassigned → Mine:** taking a booking moved exactly one from one queue to the other (10→9, 18→19), it left the Unassigned list and appeared in Mine; a repeated claim (400) left both counts unchanged.
- **Access and failure:** no token 401, bad token 401, agent 403, malformed filter 422, `/bookings/{id}` and `/bookings/count` still resolve.
- **In the browser, same contour:** 28 checks — each tab's number against SQL, tab = rows = footer in every queue, counts following a status filter, the owner filter reaching the server, a Needs-attention row leading to its booking, and a failed counts request showing no number and a Retry (never a 0) while the list keeps working.

Status: **Built and verified.** `tsc -b` at the 2-error dead-file baseline, `vite build` clean, `oxlint` 0 errors. Not committed at the time of writing; committed in ceb6bba.

---

# Decision 201 — BUILT

Date: 2026-10-13

Decision: **Which admin screen is showing is read from the URL, not held in component state** (Admin restructure, Stage B1). Two query parameters on the existing `/admin-panel` route: `section` (which screen) and `view` (which view of Bookings).

Owner's requirement: the selected section and Bookings view must survive a page refresh, Back and Forward must work, and an invalid address must fall back safely to the defaults.

## Context this builds on

Stage A (2026-10-13, approved by the owner, **not separately recorded in this log**) regrouped the admin menu into Bookings / Contracts & prices / Finance / Agents & staff, moved Arrivals / Departures / Transfers inside the Bookings screen as views, removed the duplicate "Needs Attention" menu item, and made Bookings the opening screen. This supersedes Decision 088's menu layout. B1 changes none of that; it only changes where "which screen" is stored.

## Address format

| Address | Screen |
|---|---|
| `/admin-panel` | Bookings, the list |
| `/admin-panel?view=arrivals` (`departures`, `transfers`) | Bookings, that view |
| `/admin-panel?section=invoices` | Invoices |

`section` values: `contracts`, `import`, `price-calculator`, `markup`, `invoices`, `statements`, `cashback`, `users`, `special-agents`. They follow what the menu calls the screen, not the internal key (`statements`, not `balance`).

- **Query parameters, not path segments**, so `router.tsx` — shared with the agent panel — does not change.
- **The default screen carries no parameters**, so the address `Login.tsx` and `Home.tsx` navigate to, and every existing bookmark, means what it meant.
- **An invalid address is never half-trusted**: an unknown, empty, repeated or hostile `section` resolves to the plain default screen, `view` included. The address is then corrected with `replace`, so the bad one is not left in history. The screen is derived before the correction runs, so correcting remounts nothing and requests nothing.
- Parameters this code does not own are left untouched and in place.
- Choosing the screen already showing adds no history entry. Closing a page from the top bar uses `replace`.

## Files

`frontend/src/pages/adminLocation.ts` (new; pure functions, no storage, no network) and `frontend/src/pages/AdminPanel.tsx`. Nothing else: no API, no schema, no `Reservations.tsx`, no shared component, no agent file.

## Verified

On an isolated backend over a copy of the database — 97 checks: all 10 sections and 3 views open from their address and survive a refresh; Back and Forward walk the screens both ways with the menu and top-bar tab following; 9 kinds of invalid address give a safe screen and a corrected address; every screen opened by address makes exactly the requests it made by click before B1 (recorded beforehand, two identical baseline runs); agent-panel requests identical to the pre-B1 record; zero write requests. Stage A's 40 checks still pass. `tsc -b` at the 2-error dead-file baseline, `oxlint` 0 errors, `vite build` clean.

## Open limitation — pixel comparison of the agent panel

The 28-screenshot agent comparison, 28/28 identical in every earlier stage, was **not stable** during B1: three runs gave 27, 26 and 25 identical, a different handful differing each time and none twice. **The cause is not established.** In the one run whose images were kept, two of the three differing screenshots differ only by 1–2 levels out of 255 in gradient areas (not a content change); the third differs by 343 pixels in text bands, cause unknown. An earlier attribution to low memory was a guess with no measurement behind it and is withdrawn. Until this is explained, "the agent panel is unchanged" rests on the request comparison and on which files changed, not on pixels.

## Not covered (later sub-stages)

Filters, queue, sort and page number still reset on refresh and on leaving a section (B2). The open-page tabs in the top bar are not restored after a refresh. An open booking is not in the address.

Reason: project owner — requirement above; plan presented and B1 approved before implementation.

Approved By: Daler (2026-10-13), provisionally, pending his own review.

Status: **Built and verified as described; committed (ceb6bba).** `view` later moved from Bookings to the Transfer list (Decision 210); filters/queue/sort/page are kept by Decision 207.

---

# Decision 202 — BUILT

Date: 2026-10-14

Decision: **An invoice goes from the reservations manager to accounting, and only accounting sends it to the agent.** New invoice status **"Ready for posting"** between Draft and Issued. Finance Engine (LOCKED) is extended; plan presented and approved before implementation.

Owner's requirement (paraphrased from his messages): after the hotel confirmation, the reservations manager checks every amount, corrects it if needed (the commercial breakdown's existing correction mechanism), and sends it "for post invoice". It then appears in the Invoices menu, accounting re-checks and reconciles, and only then is the invoice sent to the agent. Manual today, automatic later.

## Owner's answers that shaped it

1. The manager may correct **both cost and the agent's price** in the commercial breakdown. **The agent keeps seeing the price they booked at until accounting posts the invoice**; only the posted invoice carries the new figure. This **partly reverses Decision 178** ("a correction changes our cost and margin, never what the agent is billed"): the agent price may now change, but only through a posted invoice.
2. Any administrator may send (manager or admin). Separate roles come later (the owner plans separate roles later).
3. A hotel confirmation number is **not** required — sometimes an invoice must go out urgently before the hotel replies.
4. Accounting can never post a Draft directly: the manager always sends first; whether accounting then posts depends on the situation.
5. Status names Draft → Ready for posting → Issued accepted; button text from the owner ("Send for post invoice").

## Flow

| Step | Who | Action | Status |
|---|---|---|---|
| 1 | system | Claiming a booking auto-creates a Draft (Decision 080, unchanged) | Draft |
| 2 | reservations | "Send for post invoice" under the commercial breakdown, confirming the amounts | Ready for posting |
| 3 | accounting | Checks; may **Return** it with a required note (Decision 205: from inside Details) | → Draft |
| 4 | accounting | "Post & send to agent" | Issued |

## Backend

- `POST /finance-engine/bookings/{id}/submit-for-posting` → `service.submit_invoice_for_posting`. Creates the invoice if the booking has none; refuses Cancelled/Rejected/Cancellation Requested bookings, a Ready invoice ("already sent") and Issued/Void. **Re-freezes the Draft from the commercial breakdown as it stands now** — the claim-time Draft was frozen before any correction — then sets Ready for posting and stamps who/when.
- `POST /finance-engine/invoices/{id}/return` (body `{note}`) → `return_invoice_to_reservations`: Ready → Draft, note required (`validate_reason`), who/when stored. The note and its stamps stay on the row after a re-send, so the last return is never lost.
- `approve_and_send_invoice` now requires Ready for posting (`validate_invoice_ready_for_posting`, replacing `validate_invoice_draft` there).
- `_ledger_room_financials(db, room)` prices a room from its commercial lines in exactly `compute_booking_financials`' shape. **A room whose ledger says what its frozen columns say returns `compute_booking_financials(room)` itself, byte for byte**, so an untouched booking invoices exactly as before, including the "not computed" profit of pre-Decision-069 rooms. Otherwise: transfer/tax are their own price lines, room_sale is every other price line (meal/CIP/excursion included — the invoice has no extras column), discount is the frozen exclusive discount, commission is the remainder — so `total = subtotal − discount + commission + tax` still holds. `compute_application_financials` gained an optional `room_financials` callable (default unchanged).
- `get_booking_commercial_summary` additionally returns `ledger_sale_total` (the breakdown's own agent price, corrections included); `sale_total` is still the booked price.
- Today's Invoices list carry-forward now keeps both unsent statuses (`UNSENT_INVOICE_STATUSES = Draft, Ready for posting`).
- Schema: 5 nullable `invoices` columns — `submitted_for_posting_by/_at`, `returned_by/_at`, `return_note` — added by raw `ALTER TABLE` after a backup (`DMC_OS_backups\dmc_2026-10-14_before_invoice_posting.db`); existing rows verified byte-identical. The plan said three columns; `returned_by/_at` were added so a return carries the same actor+time trail as every other invoice action.

## Frontend

- Booking detail (`AdminBookingFinance.tsx`): the invoice block under the breakdown shows the stage (with reservations / with accounting / posted), accounting's return note in amber, and the navy "Send for post invoice" button (disabled until the booking is assigned — same rule as editing the breakdown). Its confirm dialog shows Agent booked at / Invoice amount / Our cost / Our margin and flags any difference in amber.
- The breakdown's Price total is now its own price lines; the footer states the booked price and, in amber, a corrected "New agent price" with the difference. The invoice line compares against the breakdown and explains a Draft difference as "will be updated when you send it".
- Invoices: "Ready for posting" tab, "To post" badge, "Post & send to agent" (confirm dialog), Drafts read "With reservations" with no post button; the audit trail lists sent / returned / posted.

## Known limits, accepted

- The admin Bookings list's Sale/Profit columns still use the booked price, also after a posted price change.
- Changing the breakdown after sending does not update the Ready invoice; the block says so and tells the manager to have accounting return it.
- Admin timestamps display UTC (the open business-timezone issue); the new block uses the same `formatDateTime` as the invoice audit trail so one screen never mixes two clocks.
- Three live bookings already had breakdown prices differing from the booked price (old corrections made under Decision 178): BK-000075 (5000.00 vs 4896.00, no invoice), BK-000077 (3442.00 vs 10546.00, Draft), BK-000080 (4736.00 vs 7309.00, Issued). Reported to the owner, data untouched.

## Verified

Isolated contour (real backend on :8002 over a database copy): 24 API checks (untouched booking invoices at the booked price; +100 price / −50 cost / +60 excursion correction reaches the invoice with identities intact; agent sees nothing before posting; return/re-send/post; refusals; agent 403) and 22 browser checks of the full manager → accounting → return → re-send → post → agent path. The two "failures" in those runs were number-format mismatches in the checks themselves, the values were correct. Bookings-list regressions 44/44 and 15/15. The owner then ran one real cycle on the working site himself (BK-000083, return note "test1", posted) — confirmed by him.

Reason: project owner — requirement and answers above.

Approved By: Daler (2026-10-14)

Status: **Built, verified, committed (6049f8d).**

---

# Decision 203 — BUILT

Date: 2026-10-14

Decision: **The invoice an agent downloads or receives by email shows only the agent's own charges — never our net cost or our commission.**

Found while verifying Decision 202: both the download (`build_invoice_download_text`) and the email (`send_invoice_email`) printed "Сумма номера (нетто)" (our buying price) and "Комиссия" (our margin) to the agent — every agent could read our cost and markup. Owner: "убери нетто и комиссию".

- New `service.agent_invoice_lines(db, invoice)`, the single source for both documents: from the invoice's frozen room lines, per room (named with guests when there is more than one) — Проживание, Трансфер, Налог; they add up to `invoice.total` by construction. An invoice that predates room lines falls back to "Проживание и услуги" (total − tax) + "Налог".
- The exclusive-agent discount is no longer printed either: it is already inside the room price, so a separate "Скидка" line would read as a second reduction.
- Figures are rounded to cents (`8668.650000000001` → `8668.65`).
- `send_invoice_email` takes the caller's `lines` instead of subtotal/discount/commission/tax; its only caller is `approve_and_send_invoice`.

Not changed: the invoice's own columns, the admin views, the language of the document (still Russian).

Verified on the isolated contour: one-room, two-room and pre-room-lines invoices — no net/commission/discount, lines sum to the total — and the email text rendered from the same lines. Live server checked after restart.

Approved By: Daler (2026-10-14). Status: **Built, verified, committed (6049f8d).**

---

# Decision 204 — BUILT

Date: 2026-10-14

Decision: **A returned invoice reaches the manager without them having to open the booking**: it shows in the Bookings list's "Needs action" column and in the "Changes to review" queue.

- `repository.list_returned_invoices`: invoices in Draft with a `return_note`. Structural — a re-send moves the invoice out of Draft, so it leaves both places by itself; nothing to acknowledge or clear.
- `list_urgent_bookings` (the queue) adds these bookings. **Deliberately not added to `list_urgent_booking_ids`**, which also drives Invoices' own urgency and the "Mark as reviewed" acknowledgment — a return is cleared by re-sending, not by marking. `UrgentBookingResponse` gains `review_pending` (false when the return is the only reason; `latest_note` is then null), `invoice_returned_note`, `invoice_returned_at`; newest first across both kinds.
- "Needs action": "Invoice returned by accounting", first in the cell, amber, accounting's note on hover. A booking in the queue only for a return no longer gets the false "Changed — review invoice".
- Queue row: the note in amber; instead of "Mark as reviewed", "Re-send the invoice".

Verified on the isolated contour: 15 checks (in the queue for the return alone, tab count, column text/colour/hover, no false change reason, ordinary entries keep "Mark as reviewed", re-send removes it everywhere). Bookings-list regression 44/44.

Approved By: Daler (2026-10-14). Status: **Built, verified, committed (6049f8d).**

---

# Decision 205 — BUILT

Date: 2026-10-14

Decision: **(1) Accounting returns an invoice from inside its Details window; (2) "Changes to review" follows the Manager filter.**

1. Owner: accounting works inside Details; a separate dialog made them close the figures they were checking and write elsewhere, when the note often needs specific numbers. The Return button left the list row (which is now Details · Post & send to agent · Void). `InvoiceDetailModal` gains an optional `onReturned`; for a Ready-for-posting invoice it shows a panel **pinned under the scrolling sections** — note field + "Return to reservations" — visible while any section is open. A half-written note is not lost to a stray backdrop click (Close still closes).
2. Owner: when accounting returns an invoice, each manager must be able to see their own bookings in the queue. Previously the Manager filter existed only on "All". It now also shows on "Changes to review"; the list and the tab count are narrowed to that manager's bookings (`claimed_by` added to the queue response). The per-row "Needs action" reasons stay unfiltered. Bookings without a manager appear under "Anyone" only. No change to `Reservations.tsx` — `AdminBookingsList` reads the filter from the list state it already receives.

Verified on the isolated contour: 15 checks (row buttons, panel present and pinned at the top and bottom of the sections, backdrop click keeps the note, return from Details, no panel on a Draft, queue entries carry their manager, Anyone vs one manager vs another — rows and tab count, survives a refresh).

Pre-existing, not touched: in Details, section 1's "!" tooltip button sits inside the section's header button (React logs a nested-button warning; no functional effect).

Approved By: Daler (2026-10-14). Status: **Built, verified, committed (6049f8d).**

---

# Decision 206 — BUILT (recorded retroactively)

Date: 2026-10-13

Decision: **The admin menu is grouped by task**: Bookings | Contracts & prices (Contracts, Import from PDF, Price calculator, Our markup) | Finance (Invoices, Agent statements, Hotel cashback) | Agents & staff (Users & applications, Special-rate agents) | Transfer list. Bookings is the opening screen; the separate "Needs Attention" menu item is gone (it is the "Changes to review" queue, Decision 200). Supersedes Decision 088's menu layout.

This is "Stage A", referred to in Decision 201 as "not separately recorded"; numbered after 202–205 only because it is recorded later than they were. Arrivals / Departures / Transfers were briefly views inside Bookings; by the owner's decision of the same day they became their own section (Decision 210). Admin labels were reworded for meaning, labels only — status values and business logic untouched ("Assign to me", "Manager", "Needs action", "Awaiting hotel reply", date views "Stay dates / Booking date / Cancelled arrivals"); "Pending", "Issued/Draft", "Void" and "Hotel cashback" deliberately kept. The admin panel stays English. Admin-only label overrides live in their own catalog (`i18n/locales/admin/reservations.json`, loaded by `i18nAdmin.ts`) — a first version that edited the shared English catalog leaked into the agent panel and was caught by the screenshot comparison.

Approved By: Daler (2026-10-13). Status: **Built, committed (ceb6bba).**

---

# Decision 207 — BUILT (recorded retroactively)

Date: 2026-10-13

Decision: **The Bookings screen remembers its working state across a refresh** (Stage B2): queue, filters, Manager, search, date mode and range, sort and page.

- `pages/adminViewState.ts`: `sessionStorage` key `dmc.admin.viewState.v1`, per user and per section — another user on the same browser never inherits it. Every field is validated on read; anything unknown falls back to the default.
- A "today" range is never stored (tomorrow it must mean tomorrow); a custom range expires at local midnight.
- `Reservations.tsx` gained two optional props, `initialListState` / `onListStateChange` (`BookingsListState`); the agent panel passes neither, so its behaviour is unchanged. Page reset is keyed by scope.
- `todayStr()` in `Reservations.tsx` now returns the local date, not the UTC one (the admin queue came up empty 00:00–05:00 at UTC+5) — see Known issues in `CLAUDE.md`.

Not covered (possible "B3"): other admin pages' filters, including the Transfer list, are not remembered.

Verified: 50 of 51 checks; the one failure is a stale expectation written before B2 ("first load makes exactly the pre-B2 requests" — it now makes 29). Agent panel 28/28 screenshots identical to the pre-B2 baseline.

Approved By: Daler (2026-10-13). Status: **Built, committed (ceb6bba).**

---

# Decision 208 — BUILT (recorded retroactively)

Date: 2026-10-13

Decision: **In Bookings, the chosen dates apply in every queue.** Owner: with ~100 bookings a day, every view must show only the selected dates, otherwise large volumes load slowly and hang.

**Amends Decision 200**, whose text said queue counts carry no date scope and the screen drops its date range while a queue is selected. Now `queueIgnoresDates = false`; the tab counts come from `GET /bookings/count` with the full scope plus `unassigned=true` / `mine=true`. `GET /bookings/queue-counts` still exists and works but the UI no longer calls it.

Two exceptions, confirmed by the owner and explained on screen while in effect:
1. Search by booking number ignores the dates (still paged, 50 a page).
2. Today's list also carries forward earlier bookings nobody has taken (Decision 164) — they stay until someone takes them.

Not date-filtered: "Changes to review" (it would need optional date parameters on `/finance-engine/bookings/urgent`, a LOCKED-engine change not approved); the screen says so.

Verified: 15 checks for the two exceptions, plus the Bookings-controls suite.

Approved By: Daler (2026-10-13). Status: **Built, committed (ceb6bba).**

---

# Decision 209 — BUILT (recorded retroactively)

Date: 2026-10-13 / 2026-10-14

Decision: **The Bookings controls fold away, and the list marks what is waiting on someone in our own amber.**

- The block above the table (queues, filters, dates) is folded into a slim navy bar (`.admin-bk-handle`) showing chips for the queue, dates and filters. Owner's behaviour: it opens when the pointer comes up to it and **closes by itself when the pointer leaves** (pointer zone tracking, 120 ms open / 280 ms leave delay). It stays open while typing in the search or while a native dropdown is open; on touch a tap toggles and a tap outside closes; Escape closes; a click outside closes without being swallowed. Colours from our palette only (navy `#1b2340`, gold `#b8874a`).
- "Reset filters" uses the Pending amber (`--color-warning` on its own tint), so it is distinguishable from the white fields.
- **Unassigned open bookings** get a quiet amber wash on the whole row (7 %, 13 % on hover) and an amber-on-white "Assign to me" — previously an unowned booking two months old looked like one being worked. Text, status badges and the red/amber edge remain the strongest marks.

Verified: Bookings-controls suite 44/44; unowned rows 7 washed / 16 white, assign still confirms first, row click still opens the booking.

Approved By: Daler (2026-10-13/14). Status: **Built, committed (ceb6bba and 6049f8d).**

---

# Decision 210 — BUILT (recorded retroactively)

Date: 2026-10-13

Decision: **"Transfer list" is its own admin section** for meeting and seeing off guests on chosen dates — replacing Decision 113's Arrival / Departure / Transfers views under Bookings.

- Views: Arrivals, Departures, All movements — `/admin-panel?section=transfer-list[&view=departures|transfers]`. Decision 201's `view` parameter now belongs to this section alone; an old `/admin-panel?view=arrivals` opens Bookings and is corrected.
- Always by date: date range picker plus "Today" / "Next 7 days" (default next 7 days), local calendar dates. Hotel filter on the server. "All / With transfer / Without transfer" on every view; bookings without a transfer are listed as "No transfer", because guests are met and seen off either way. Totals line; dates as dd.mm.yyyy.
- **Filtered on the server** (previously: the newest 500 bookings filtered in the browser, Decision 152's rule broken). Arrivals use `arrival_from/arrival_to`; departures use `date_view=staying` over [from−1, to−1] and are then cut to the departure date — no API change. Paged 200 at a time up to 10 pages, with an explicit warning if the result is incomplete.

Known limit, unchanged from Decision 113: lead-guest names are fetched one request per visible row (no bulk guest endpoint).

Verified: 38 checks plus a mocked no-transfer case; zero write requests.

Approved By: Daler (2026-10-13). Status: **Built, committed (ceb6bba).**

---

# Decision 211 — BUILT

Date: 2026-10-15

Decision: **How a party actually sleeps is stored per occupancy option and shown to agents** ("Спальные места: 1 двуспальная кровать King + 1 раскладной диван (для 2 детей)"). Owner, with a screenshot: "2 adults + 2 children" does not tell an agent whether there is a bed for each — at Kandima it is a king bed and a sofa bed made up for two children.

(Commits 21d4091 and fd904ec call this "Decision 206" — the number was already taken in this log; renumbered here and in the code.)

## Model (Hotel Engine, LOCKED, additive)

- `room_occupancy_options` gains `beds` (JSON list of `{type, count, for_children}`) and `bedding_note`, both nullable (raw ALTER TABLE after a backup; existing rows byte-identical). NULL means "not entered", never "no beds".
- Bed types are a fixed list (`king, queen, double, single, sofa_bed, day_bed, rollaway, bunk_bed, crib`) rather than free text, so every screen can word them in Russian or English and the same data serves 3 hotels or 500.
- `GET /hotel-engine/hotels/{id}/occupancy-options` (one request per hotel) and admin-only `PUT /hotel-engine/room-occupancy-options/{id}`.

## Display (`frontend/src/pages/bedding.ts`, the single formatter + picker)

- An exact party match first; otherwise the closest combination **with the same number of adults** (its extra places are the children's and can be dropped), then the smallest that fits. Options are ceilings (Decision 024), so "2A+2C" also describes 2 adults + 1 child.
- Places marked for children are omitted when no children travel; when exactly one place serves all of them, the text says how many ("для 2 детей").
- Falls back to the room's `bed_type`; says nothing when neither is entered.
- Shown on the search room card, in the copied WhatsApp offer and in the booking card.
- Admin: Contracts & prices → **Rooms & beds** (`AdminRooms.tsx`) — per hotel and room type: general bed type, sleeping places per combination with a live RU/EN preview, add a combination (warned that a combination is also a booking limit).

## Data

- Kandima, all nine one-bedroom rooms, 2A+2C: 1 king + 1 sofa bed for the children — **on the owner's word**.
- Four Seasons Seychelles: from its contract's bedding grid (Decision 213).
- Siyam World / St. Regis: a draft from their contracts was prepared but **not applied** (owner to check). St. Regis has no occupancy options at all; adding them changes what can be booked, so not done without a decision.

## Known limits (owner's comment, 2026-10-15)

At 300 hotels × ~10 room types × 2–3 combinations this is 6–9 k entries — not maintainable one by one. Contracts usually state bedding as one hotel-wide rule (Siyam: "every villa one king + fixed day bed + one rollaway"), rarely per room. Recommended later, not built: a hotel-level default rule with per-room exceptions, and bedding extraction in the AI contract import. Wording on the card can be shortened at any time without touching data.

Verified on an isolated test copy: 13/13 (card, copied offer, booking card, admin save, agent 403, unknown bed type 422).

Approved By: Daler (2026-10-15). Status: **Built, committed (21d4091, fd904ec).**

---

# Decision 212 — BUILT

Date: 2026-10-15

Decision: **A special offer can carry its own conditions and an agent-facing description, and the search page shows the offers that apply to a stay.** Needed for Four Seasons Seychelles' offers: "Get Away 20%" (stay 4+ nights, booked 90+ days ahead, not over the festive season) and "Honeymoon" (gifts only, no discount, villas only). No existing offer or promotion type could check those conditions; entering the 20% without them would have quoted it on short and late stays and sold below cost.

(Commit fd904ec calls this "Decision 207" — renumbered.)

- Contract Engine (LOCKED, additive): `special_offers` gains `min_nights`, `min_days_before_arrival`, `room_type_ids` (JSON, NULL = all), `booking_code`, `description` — all nullable; every pre-existing offer (Kandima KM26_03, Siyam SWJ26) behaves exactly as before.
- `_bookable_special_offers` checks the conditions wherever an offer can change a price; the room / meal / family / transfer finders now receive the nights and room type from `get_room_price` / `get_transfer_price`. A caller that passes nothing gets the old behaviour.
- `GET /contract-engine/contracts/{id}/special-offers/applicable?check_in&check_out` — offers bookable today, not blacked out on check-in, conditions met, with room scope and discounts. Read-only; prices are still computed by `get_room_price` alone.
- Search: the room card shows each offer (name, code, description); a discount is labelled "уже в цене" only when that price's own `applied_special_offer_ids` contain it. The copied offer adds "Предложение: …" lines.
- A room with no rates now reads "Цена по запросу — рассчитывается индивидуально по правилам отеля" (owner's wording; generic for every hotel).

Known limits: there is no admin screen for special offers yet (they are entered through the API); a description is stored in one language (Russian for Four Seasons), so the English interface shows it in Russian; only one room discount is applied per price (`get_room_price`'s existing rule).

Verified on an isolated test copy: 12/12 pricing checks (20% only at 4+ nights and 90+ days, never on meals or extra guests, not in the blackout, Kandima unchanged), 7/7 in the browser.

Approved By: Daler (2026-10-15). Status: **Built, committed (fd904ec).**

---

# Decision 213 — DATA

Date: 2026-10-15

Decision: **Four Seasons Resort Seychelles is entered from its 2026-27 Static Package contract (contract1.pdf) and offers (offer1.pdf), with these rules confirmed by the owner:**

1. **Taxes on top are included in every figure.** The contract quotes rates, meal and extra-bed charges "subject to 10% service charge + 15% government tax = 25.375%". The system has no percentage-on-top mechanism, so all figures are entered ×1.25375 — the amount actually paid to the hotel (€1 450 → €1 817.94).
2. **The TESL levy (SCR 100 per person per night) is included** as the contract's mandatory tax, at **€6.40** (≈0.064 EUR/SCR, October 2026) — an estimate; the hotel converts at its own rate.
3. **"On request" rooms are listed without rates** and read "Цена по запросу…" (Presidential, Royal Suite, 7- and 8-bedroom residences).
4. **Hotel only for now** — the contract's package-only clause is acknowledged; our other hotels are sold the same way.

Entered: hotel (Mahé, Baie Lazare, 5★, reservations e-mail), 14 room types with occupancy combinations and sleeping places from the bedding grid, EUR contract 1 Nov 2026 – 31 Oct 2027, 12 season periods (Festive, Peak, High, Shoulder), 120 BB rates, 376 supplements (HB adult €150 / child €75, third adult €175, child 5–11 €149, all ×1.25375; no HB over the festive season), cancellation tiers (festive 50% from 120 days / 100% from 90; otherwise 50% from 60 / 100% from 30), minimum stays (2 nights; 5 for festive arrivals), release 21 days. Offers: Honeymoon (gifts, min 4 nights, four villa types, blackout 23 Dec–17 Jan and 10 Mar–11 Apr) and Get Away 20% (min 4 nights, booked 90+ days ahead, room rate only, festive blackout).

Checked: 8 cases by hand to the cent; the owner compared a 10-night March stay (Garden View Villa King, 2 adults) with a competitor's cost — BB €19 558 / HB €23 319.70 against ours €19 558.48 / €23 319.68.

Known gaps for this contract, not fixed: half board over the festive season would be priced as BB (do not sell HB 23 Dec–10 Jan); the mandatory Christmas/New Year dinners are not charged automatically; children 2–4 are priced as children 5–11 (see Decision 214); minimum stay and the 21-day release are recorded but not enforced.

Backups before each step: `DMC_OS_backups\dmc_2026-10-15_before_four_seasons.db`, `..._before_offer_conditions.db`. Status: **In the working database; contract Active.**

---

# Decision 214 — OPEN (no decision yet)

Date: 2026-10-15

Two pricing questions raised while entering Four Seasons. **The owner's position: no decision until a concrete case shows which behaviour is right** ("пока не будет конкретного факта, не могу сказать, какой правильный"). Recorded so they are not lost; nothing is built.

1. **Stays that cross a season boundary.** `get_room_price` prices the whole stay at the season of the check-in night (known since Decision 073). A competitor's quote for 19–29 March appeared to switch price on 22 March, which suggested per-night pricing; the owner then confirmed the competitor's cost for those dates equals ours (Peak covers the whole stay under this contract). Per-night pricing would change the LOCKED Contract Engine and would matter for every hotel whose stay crosses a boundary.
2. **Child ages from the contract.** Search buckets ages with fixed limits (infant < 2, child 2–11, adult 12+), whatever the contract says. St. Regis (infant 0–3, child 4–11, teen 12–15, adult 16+) and Four Seasons (free 0–4, child 5–11) do not fit; St. Regis' 207 teen prices are never used. A plan (price by each child's age against the contract's categories; season-specific limits later) was presented, not approved.

---

# Decision Template

Decision Number:

Date:

Module:

Description:

Reason:

Alternatives Considered:

Pros:

Cons:

Final Decision:

Approved By:

Implementation Date:

Notes:

---

# Change Log

Every architecture or business change must be recorded here before implementation.

---

# Final Rule

If there is a conflict between project documentation and memory, this Decisions Log is the official source of truth.
