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
