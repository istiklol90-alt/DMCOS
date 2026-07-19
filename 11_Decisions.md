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
