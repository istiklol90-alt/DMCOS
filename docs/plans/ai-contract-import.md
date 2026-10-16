# Plan — AI contract import ("upload the PDF, the AI enters the contract")

Status: **PLANNED, not started.** Written 2026-10-15 at the owner's request, to be picked up when the paid Claude API is connected. Nothing here is built; nothing here is approved for implementation yet.

Owner's goal, in his words (2026-10-15): the manager uploads the contract file in the admin panel and the AI enters everything itself — "как ты сделал сегодня" — and the manager only answers the questions the AI cannot decide. Questions that are really standing rules ("taxes on top: include them?") are asked once and then applied automatically.

---

## 1. Why — Decision 036's three questions

1. **What business problem does it solve?** Entering one contract by hand takes hours (Four Seasons Seychelles, Decision 213: 14 room types, 12 season periods, 120 rates, 376 supplements, cancellation tiers, minimum stays, two offers). At the planned scale — hundreds of hotels, new contracts every season — manual entry does not keep up, and every hand-typed price is a chance to sell below cost.
2. **What proved it is needed?** Decision 213: the full Four Seasons contract was entered end to end by an AI assistant working through the system's own API, checked by hand to the cent, and confirmed by the owner against a competitor's cost (BB €19 558 / HB €23 319.70 vs ours €19 558.48 / €23 319.68). That is the real, end-to-end business workflow Decision 065 requires before a production implementation.
3. **Can we do without it for now?** Yes — contracts can still be entered by hand or by the assistant in a chat session. Not at scale.

## 2. Where we are today

- **Admin → Contracts & prices → Import from PDF** exists (`ContractsAI.tsx`, AI Core Engine, Decisions 035–068): upload → text extracted (`pdf_extraction.py`) → provider extracts entities → Human Gate review → `contract_writer.py` writes through the real Hotel/Contract services.
- The active provider is **`MockClaudeProvider`** — canned Kandima/Siyam answers; it does not read the uploaded file. `ClaudeProvider` is written but has **never made a real call** (no `ANTHROPIC_API_KEY`).
- Coverage today: room types, contract, age categories, meal plans, seasons, transfer options, rates, rate supplements, special offers + their room/meal/family/transfer rules.
- **Not covered** (all needed for Four Seasons): hotel record, occupancy combinations and sleeping places (Decision 211), cancellation tiers, minimum stays, blackout dates, offer conditions (Decision 212), mandatory tax / levy, contract family rules, "on request" rooms, release days, payment terms.
- The review screen labels only 3 of 17 entity types in plain words.
- The current shape is "extract everything in one pass, then a person reviews every field". The owner wants the opposite: the AI works, a person answers a few questions.

## 3. Target flow

```
Manager uploads PDF(s): contract + offers
  │
  ▼
1. Read      text AND tables per page (pdfplumber extract_tables -- the season
             table came out scrambled as plain text in contract1.pdf; the table
             reader gave clean columns)
2. Plan      AI lists what it found: hotel, room types, seasons, meal plans,
             rates grid, supplements, taxes, cancellation, offers, anything odd
3. Rules     standing rules are applied (section 5); only NEW situations become
             questions
4. Write     AI creates everything through the system's own services, into a
             contract left in DRAFT (Decision 195: a Draft contract is invisible
             to search, so nothing reaches agents yet)
5. Verify    AI recomputes 8-12 sample prices directly from the PDF and compares
             each with get_room_price; occupancy limits and cancellation tiers
             are checked the same way. Any mismatch becomes a question.
6. Ask       question queue in the admin panel ("2 places need your answer"),
             each with the PDF excerpt and the AI's suggested answer
7. Apply     manager answers -> AI applies; an answer marked "always" becomes a
             standing rule
8. Report    what was entered, what was assumed, the check results
9. Activate  a person presses "Activate contract" (until a track record says
             simple contracts may auto-activate -- an owner decision)
```

## 4. How the AI works (architecture)

- **Agent with tools, not one big extraction call.** The model is given tools that wrap the existing service functions (`create_hotel`, `create_room_type`, `create_room_occupancy_option`, `create_contract`, seasons, rates, supplements, cancellation policies, minimum stays, special offers, blackouts, `get_room_price`, `get_cancellation_policy`, …) and works step by step — read, write, check, correct — exactly the way Decision 213 was done. Every validator still runs; the AI never writes to the database directly.
- **One AI Core job per upload**, extending `ContractIngestionJob`: status `reading → writing → verifying → waiting_for_answers → ready → activated / failed`.
- **Audit:** every tool call (what, with which values, result) is logged against the job — append-only, same principle as `HumanGateDecision`.
- **Undo:** a failed or rejected job can remove what it created (new: delete-draft-contract and its children; a hotel/room type it created only if nothing else references them).
- **Model Router** (`providers.py`) stays the only place that talks to the API; the model choice is data (`ModelProviderConfig`), not code.
- **Limits:** a token/cost ceiling per job; the job stops and asks rather than looping.
- **Secrets:** `ANTHROPIC_API_KEY` in `backend/.env` only (see `.env.example`).

## 5. Standing rules ("asked once, then applied")

A small, editable table in the admin panel — this is AI Core's **Knowledge Base**, gated by Decision 065 and therefore part of this plan's approval, not built on its own.

Seed rules from Decisions 194, 195, 211, 213:

| Situation in a contract | Standing rule |
|---|---|
| "Rates subject to X% service + Y% tax" | Enter every figure grossed up |
| A levy in another currency (e.g. SCR 100 pppn) | Mandatory tax at the current rate, rate stated in the label |
| "On request" room | Create the room type with no rates ("price on request") |
| "Sold only as a package" | Note it; sell hotel only (owner, 2026-10-15) |
| Meal supplement per person | Always tag the age category (Decision 194) |
| New contract | Leave Draft; activation is a person's step (Decision 195) |
| Bedding grid present | Enter occupancy combinations + sleeping places (Decision 211) |

Ambiguous wording ("applicable for four consecutive nights", which villas an offer covers) is never a rule — it is always a question.

## 6. Coverage to add (beyond today's entity list)

hotel record · occupancy combinations + sleeping places · cancellation tiers with season windows · minimum stays · release days · payment terms · blackout dates · offer conditions (min nights, days ahead, room list, code, description) · mandatory tax / levy · contract family rules · "on request" rooms · seasons with several date ranges · extra-person / child / single supplements as the contract words them.

## 7. Test plan — golden contracts

We already have four contracts entered and checked by people: **Kandima, Siyam World, St. Regis, Four Seasons.** The import is accepted only when, run on a copy of the database, it reproduces each of them: same room types and occupancy limits, and `get_room_price` equal to the manually entered contract on a fixed set of stays (every season, BB/HB, extra adult, children, offers on/off), cancellation tiers equal. Same isolated test contour as every other decision (backend on :8002 over a database copy).

## 8. Phases

| Phase | What | Result |
|---|---|---|
| 0 | Owner decision: connect the paid API; key in `.env` | Real `ClaudeProvider` works |
| 1 | Reader (text + tables) and the agent loop with write tools, writing into Draft | Four Seasons reproduced on a copy |
| 2 | Self-verification + report | Mismatches caught automatically |
| 3 | Question queue + standing rules in the admin panel | Manager answers in minutes |
| 4 | Remaining coverage (section 6) + undo | All four golden contracts reproduced |
| 5 | Optional: auto-activation for contracts with no open questions | Owner decision, after a track record |

## 9. Cost (rough)

A 20-page contract is roughly 15–20 k tokens to read. A single extraction pass is cents to about $2 depending on the model; the agent mode (write, re-check, correct) is about **$1–5 per contract** — under $10 in normal cases. Re-check against Anthropic's current price list before connecting.

## 10. Open decisions for the owner

1. Connect the paid API (and which model).
2. Who answers questions (any admin, or a specific role once roles exist).
3. Whether a new hotel created by the import is visible before its contract is activated.
4. When, if ever, a contract may be activated without a person.
5. How Decision 214's open questions (per-night pricing across seasons, child ages by contract) are settled before the import relies on them.
