# Plan — selling packages: hotel + transfer + flight + insurance, net and gross

Status: **AGREED (2026-10-17) — Package Engine TASK-000/001 started; architecture in `docs/plans/package-engine-architecture.md`, interface contract in `docs/interface-contracts/package-booking-pricing-finance.md`.** First written 2026-10-17 ("сделай сначала формулу, потом добавим"), owner's answers recorded the same day (§3). Every rate, price and rule below is **data an admin edits**, never a constant in code — the owner expects these to change (per-component commission later, exchange rates later, automated flights / insurance later).

## 1. What we sell

A package = **hotel** (always) + optional **transfer**, **flight**, **insurance**.

Two ways an agent searches (agent home page, today's single "Найти отели" button becomes two):

1. **Ground services** (наземное обслуживание) — hotel + transfer (+ insurance if wanted). This is today's search.
2. **With flight** — start from the flight seats we hold (destination, dates), then hotel and transfer for those dates (+ insurance).

## 2. Three prices per component

| Symbol | Name | Who sees it |
|---|---|---|
| **C** | our cost — what we pay hotel / transfer / airline / insurer | staff only |
| **N** | net — what the agent pays us | agent + staff |
| **G** | gross — price for the client | agent + staff |

our margin `M = N − C` (staff only, **may be negative** — see flights); agent commission `K = G − N` (the agent's earning).

## 3. Owner's decisions (2026-10-17)

| # | Question | Decision |
|---|---|---|
| Flights | how they get into the system | **Manual for now**: a manager enters seats (quantity) and cost per seat. Automation later. |
| Flight price | fixed? | **No — the selling price changes.** E.g. last minute, an unsold seat may be sold **below cost** to fill the plane. |
| Insurance | how | **Manual for now** (plans and prices entered by a manager); automation later. |
| 1 | agent commission | **One % on the whole package for now** (per component maybe later), **any % per agent** — 5 %, 8 %, 10 %, 15 %… set by the admin, depending on the agent's sales. Formula G = N / (1 − k) confirmed "пока так". |
| 2 | agent's own markup (Decision 215) | **Hotel-only sales only.** In a package the agent cannot add their own %. |
| 3 | control | Admin must be able to **control both price and cost**. |
| 4 | currencies | **Each destination sells in its own currency** for now; exchange rates later. |
| 5 | flight entry | Manual (as above). |
| 6 | insurance | **Optional** — the agent chooses with or without. |
| 7 | invoice | **Invoice shows net only.** The booking must still store **gross, net and the agent's profit**. On screen **gross first**; the agent can open their **net** once the package is fully composed (an option, not in the result list). |
| 8 | rules in admin | Cancellation rules, cost, price and insurance amounts are **edited in the admin panel** so managers control them. |
| — | where | A new admin menu **"Packages"** holding all of it. |

### 3a. Added 2026-10-17 (second round)

- **Visa** — an optional component the agent picks; if picked, its amount is added. Cost and price controlled in the admin panel (same as insurance).
- **One-way flight packages** — a package with only the outbound or only the return flight. Allowed **only for agents the admin selects** (a per-agent switch in Packages → Agents).
- **Entering flights (Flight Engine):** the manager picks the weekdays and the date range, adds each flight with its seats, cost and a standard price; the system creates every departure date. Then the price **per date** is changed quickly from the load — e.g. on 20.10 many seats unsold, cost 1 000 USD, price set to 200 USD. Needs a fast price grid: dates × flights with seats sold / free and an inline editable price, plus bulk change for selected dates.

### 3b. What is a package (owner, 2026-10-17, third round)

- **A package = a booking that includes a flight** (plus whatever else is added: transfer, insurance, visa). Gross / net / package commission apply only then.
- **Ground services ("наземка") = hotel + transfer only** (visa maybe later) — sold exactly as today: the agent's net price and the agent's own markup (Decision 215), **no package commission**.
- Consequence: the agent-facing package flow (insurance / visa choice, gross first, net on demand, package booking, package invoice and report) goes live **together with flights** (Flight Engine).

## 4. The formula

```
Per component (agent net):
  hotel      N = today's Pricing Engine result (contract net + our per-night markup − exclusive discount)
  transfer   N = transfer price (today at cost)
  flight     N = current selling price per seat × passengers      (set by a manager; may be below cost)
  insurance  N = plan price × insured persons (× days if the plan is per day)
  visa       N = visa price × persons (optional, like insurance)

Package:
  N_package = Σ N_i                        (what the agent pays us — the invoice amount)
  G_package = N_package / (1 − k_agent)    (price for the client; k = the agent's package commission, 8 % / 10 % …)
  K         = G_package − N_package        (agent's profit = k × G)
  C_package = Σ C_i                        (staff only)
  our profit = N_package − C_package       (staff only; can be negative when a seat is sold below cost)
```

Example (Maldives, 7 nights, 2 adults, agent at 8 %):
N = hotel 8 100 + transfer 1 133 + flight 2 × 1 150 + insurance 2 × 48 = 11 629 → G = 11 629 / 0.92 = **12 640**, agent profit **1 011**.

Rounding: G rounded to a whole unit; the offer lines are the components' shares of G and add up to it.

**Confirmed (2026-10-17):** commission is a share of the client price, G = N / (1 − k). Kept switchable in the pricing policy.

## 5. Admin menu "Packages"

| Screen | What managers do |
|---|---|
| **Flights (seat blocks)** | Add a block: route, flight numbers, dates out/back, destination, currency (= destination's), seats total, **cost per seat**, **selling price per seat**. See seats sold / held / free. Change the selling price at any time (history kept: who, when, from → to, reason). Price below cost is allowed but shown in red with the loss per seat and requires a reason. |
| **Insurance plans** | Insurer, plan name, coverage note, per trip / per day, cost and selling price, destinations where offered. |
| **Agent commission** | Commission tiers (e.g. *Standard 8 %*, *Top 10 %*) and which agents are in which tier; new agents start in the default tier. |
| **Cancellation rules** | Per component type: notice period → penalty % (hotel keeps its contract tiers; flights often non-refundable; insurance refundable until X days). Package penalty = sum of the components'. |
| **Package report** | Per package booking: C / N / G, our profit, agent commission, below-cost seats. |

## 6. Agent side

- **Home:** two buttons — *Ground services* and *With flight*.
- **With flight (owner, 2026-10-17):** the agent enters the dates in the search as usual. If we have a flight out and back for those dates, the package is priced; if not, the result says plainly **"no flight on this date"** — no seat-picking step. The offer shows **Economy and Business side by side** when both exist, with flight numbers and departure / arrival times for both directions. Later the same search packages **GDS** flights too.
- **Prices on screen:** gross first. Net and "your profit" are an option the agent opens after composing the whole package. In a package the agent's own markup does not apply.
- **Offer to the client (WhatsApp):** gross only.
- **Booking card:** stores and shows the agent gross, net, profit; flight seats and insurance as their own lines.
- **Invoice:** net only.

## 7. Data (additive — existing bookings unchanged)

- `flight_blocks` (route, flights, dates, destination, currency, seats_total, cost_per_seat, sale_price_per_seat) + `flight_price_changes` (history) + seat holds per booking.
- `insurance_plans` (insurer, name, basis per trip / per day, cost, price, destinations).
- `commission_tiers` (name, %) + agent → tier.
- `package_cancellation_rules` (component type, days before, penalty %).
- `booking_package_lines` (booking_id, component = flight / insurance, reference, quantity, cost, net) and on the booking: `package_net`, `package_gross`, `agent_commission`, `commission_rate` — **frozen at booking time**, like every price in the system.

A booking stays anchored to its hotel (Booking Engine is hotel-bound); flight and insurance are lines on the same application. Per CLAUDE.md this is a new engine (**Package Engine**) and needs an **Interface Contract** with Booking / Pricing / Finance before its TASK-001.

## 8. Suggestions (for the owner)

1. **Seat holds:** a seat is held when the request is sent and released if the booking is rejected / cancelled — otherwise two agents can sell the last seat.
2. **Passenger data for tickets:** names exactly as in the passport, date of birth, passport number and expiry, nationality — the guest form needs these fields for flight packages (personal data: staff + owning agent only).
3. **Tiers instead of a number per agent:** "Top 10 %" assigned to agents scales better than typing a % on each of hundreds of agents.
4. **Below-cost sales need a reason** and show in the package report, so a loss is always a decision, not a typo.
5. **Insurance needs each traveller's age** — we already store date of birth per guest.
6. **Currency guard:** a flight block must use its destination's currency, so a package can always be summed.

## 9. Build order (each step: isolated DB copy first, `security_audit.py` for every endpoint)

1. Interface Contract + data model; admin **Packages → Agent commission** and **Insurance plans**; ground-services packages (hotel + transfer + optional insurance) with gross / net / profit.
2. **Flights:** seat blocks, price history, holds; agent "With flight" search.
3. Cancellation rules + package report; invoice net / booking gross-net-profit.
4. Later: per-component commission, exchange rates, automated flights and insurance.
