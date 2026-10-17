# Package Engine — architecture (TASK-000 / TASK-001)

Status: **TASK-000 done, TASK-001 in review — nothing built.** 2026-10-17. Business rules: `docs/plans/package-pricing.md`. Cross-engine functions: `docs/interface-contracts/package-booking-pricing-finance.md`.

The owner's brief: a new engine, "strong architecture for the future" — white label, integrations, GDS. Everything below is shaped by that: today's manual flights and insurance are the **first providers**, not the design.

## 0. Fit with the project's engines

- `01_Modules_List.md` §8 **Package Builder** (Hotel, Transfer, Flight, Excursions, Insurance, Package Calculation) is this engine. No `package` scaffold exists among the 22 engine folders, so it is a new folder `app/engines/package/` — created on the owner's explicit request (2026-10-17).
- The project already has **empty scaffolds** for `flight` and `integration`. To avoid a second home for the same thing:
  - **Flight Engine** (`app/engines/flight/`) owns seat blocks, flight offers, prices, holds. Package Engine reaches it only through the `FlightSupplier` interface.
  - **Integration Engine** (`app/engines/integration/`) owns external connections (GDS, insurer APIs) as suppliers behind the same interfaces.
  - **Insurance** has no engine of its own in the list; it starts as a supplier inside Package Engine and can move out later without changing callers.
  - **Excursions** (also in §8) = a future component type, no design change.
- **One engine at a time (CLAUDE.md rule):** Package Engine goes first through its full lifecycle with commission tiers, insurance and the ground package (hotel + transfer + insurance). Flight Engine then goes through its own lifecycle and plugs in via `FlightSupplier` — that is when "With flight" goes live. Integration Engine (GDS) after that.

## 1. Scope

**Owns:** composing a package quote, flight and insurance supply, the agent commission policy, seat inventory and holds, package cancellation rules, the frozen package snapshot on a booking.

**Does not own:** hotel and transfer prices (Contract + Pricing Engine), the booking itself (Booking Engine), invoices (Finance Engine). It calls them through their services, never their tables.

Dependency direction (stays acyclic): `hotel → contract → pricing → package → booking → finance`. Package Engine may call Booking to create the application; Finance reads Package for the package invoice. Booking never imports Package.

## 2. Core ideas

### 2.1 Components, not special cases
A package is a list of **components**, each with `type` (hotel, transfer, flight, insurance, visa — later excursion, …), `cost`, `net`, `currency`, `details`. Adding a new kind of service = a new component type and provider, no change to the quote, pricing or booking code.

### 2.2 Providers behind interfaces (integration-ready)
```
FlightSupplier.search(origin?, destination, out_date, back_date, pax) -> [FlightOffer]
FlightSupplier.hold(offer, pax) -> Hold      .release(hold)      .confirm(hold)
InsuranceSupplier.quote(destination, dates, travellers) -> [InsuranceOffer]
```
- **Today:** `ManualBlockSupplier` (seat blocks the admin enters), `ManualInsuranceSupplier` (plans the admin enters).
- **Later:** `GdsSupplier` (Amadeus / Sabre / Travelport / NDC), insurer APIs — same interface, registered in one place (same pattern as AI Core's Model Router: switching a provider is data, not code).
- A `FlightOffer` always carries both directions, cabin (**Economy / Business**), flight numbers, departure and arrival times, fare, seats available, supplier reference — so the offer to the client looks the same whatever the source.

### 2.3 Pricing policy as data (white-label-ready)
`price(components, agent, channel) -> {net, gross, commission, rate}` with
`net = Σ component.net`, `gross = net / (1 − k)`, `k` from the agent's commission tier.
Tiers and rates live in tables keyed by **channel** (nullable now = our own B2B site). A future white-label partner is a channel with its own tiers, markups and branding — no code fork.

### 2.4 Money and currency
Every amount is `(amount, currency)`. A package is priced in its **destination's currency**; a component in another currency is refused today (owner rule) and converted later through an exchange-rate table — the quote stores the rate it used, frozen.

### 2.5 Quote → booking, frozen
A quote is computed server-side and stored (id, expiry). Booking a package books **that quote**: the hotel application through Booking Engine, then package lines (flight seats, insurance) and the frozen `cost / net / gross / commission / rate`. Prices never re-compute after booking (same rule as every price in the system).

### 2.6 Inventory
Seat blocks have `seats_total`; a hold is created when the request is sent and released on reject / cancel / expiry, so the last seat cannot be sold twice. GDS holds map to the supplier's own PNR/hold.

### 2.7 Security (CLAUDE.md "Security rule")
- Cost and our margin: staff only — agent endpoints return `net`, `gross`, `commission` only; new field names added to `api/redaction.py`.
- Admin screens (`Packages` menu) admin-only; every endpoint through `security_audit.py`.
- Passenger passport data: visible to staff and the owning agent only.
- Price changes and below-cost sales: audit trail (who, when, from → to, reason).

## 3. Data model (TASK-002 proposal — additive, no existing table changes)

| Table | Purpose |
|---|---|
| `package_channels` | sales channel (our B2B = default; white label later) |
| `commission_tiers` | name, rate %, channel |
| *(Flight Engine, slice 2)* | flight series (weekdays + date range) → departures per date with seats, cost, price; price history; holds; fast price grid |
| `package_add_ons` | optional extras the agent picks — **insurance and visa** (kind), supplier, name, basis (per person / per person per day / per booking), cost, price, currency, destination; excursions later |
| `package_add_on_price_changes` | audit of every cost / price change (who, when, from → to, reason) |
| `agent_package_settings` | agent → commission tier, **one-way flights allowed** (admin switch) |
| `package_quotes` | agent, channel, destination, dates, party, components JSON, net, gross, commission, rate, currency, expires_at |
| `booking_packages` | booking_id, quote_id, net, gross, commission, rate, currency (frozen) |
| `booking_package_lines` | booking_id, component type, reference, quantity, cost, net, details JSON |
| `package_cancellation_rules` | component type, days before, penalty %, channel |

Passenger passport fields on `guests` (passport number, expiry, nationality) — a Booking Engine additive change, needed only for flight packages.

## 4. Lifecycle

| Task | Content |
|---|---|
| TASK-000 | Scope, current state (no package code exists), this document ✔ |
| TASK-001 | Interface contract with Pricing / Booking / Finance ✔ (in review) |
| TASK-002 | Models, schemas, repository; tables on a DB copy, then the working DB after a backup |
| TASK-003 | Service: providers (manual), pricing policy, quote, holds, booking with package lines |
| TASK-004 | API (agent: search / quote / book; admin: blocks, plans, tiers, rules) + `security_audit.py` |
| TASK-005 | Frontend: admin **Packages** menu; agent home "Ground services / With flight", package results (Economy & Business), gross first / net on demand |
| TASK-006 | Full verification on a DB copy, documentation, LOCK |

Delivered in slices of business value: (1) Package Engine — tiers + insurance + ground package, cancellation rules, report, invoice; (2) Flight Engine (own lifecycle) — seat blocks, price history, holds, "With flight"; (3) Integration Engine — GDS.
