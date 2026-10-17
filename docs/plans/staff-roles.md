# Plan — staff roles and access ("who can do what")

Status: **DRAFT, not started.** Written 2026-10-16 at the owner's request ("сначала нужно создать логику, как всё это будет действовать"). The owner agreed to the proposals in §5 the same day, but called this **a rough first idea that will be changed and extended later** — keep the role bundles in one editable place. Nothing here is built yet.

## 1. The owner's requirement (2026-10-16)

| # | Role | What they may do |
|---|---|---|
| 0 | **Owner / Admin** | Everything. |
| 1 | **Reservations manager** | Work bookings and send invoices for posting, including cost correction. |
| 2 | **Senior reservations manager** | Everything in 1, plus approve new agents after registration. |
| 3 | **Accountant** | Only they post an invoice or reject (return) it. |
| 4 | **Finance** | Only they see Balance and incoming / outgoing payments. |
| 5 | **Transfer manager** | Only assign a specific driver to each booking's transfer (e.g. Mauritius, where every transfer gets its own driver). |

## 2. Where the system is today

- `users.role` holds one string: today `Admin` (3 users) and `agent` (2). `manager` is accepted by `RequireAuth` but `ManagerDashboard` shows demo data.
- Every staff action is gated by `_require_admin` (57 calls across Booking, Finance, Pricing) — one switch, all or nothing. The Admin Panel route requires `admin`.
- **Real gaps found while writing this plan, independent of roles:** `PUT /agent-registrations/{id}/approve` and `/reject`, and `GET /users`, have **no authentication at all** — anyone who knows the URL can approve an agent. Closing that is step 1 of any roles work.
- The "who did it" trail already exists for most actions (`claimed_by`, `submitted_for_posting_by`, `approved_by`, `returned_by`, `confirmation_number_by`, `transfer_changed_by`…), so roles add *who may*, not *who did*.
- **Not built yet:** drivers and driver assignment (role 5), incoming / outgoing payments (role 4 — Payments / Supplier Payments are deferred modules). Balance (agent statements) exists.

## 3. Design

### 3.1 Permissions, not role checks

Code checks a **permission** ("may post an invoice"), never a role name. A role is a named bundle of permissions. This is what keeps the system changeable: moving one ability from one role to another is an edit to a list, not a hunt through 57 checks.

### 3.2 Permissions (first set)

| Code | Meaning |
|---|---|
| `bookings.view` | See bookings list and booking cards |
| `bookings.work` | Claim, confirm with hotel, change dates/guests/transfer, cancel, LPO |
| `costs.view` | See our cost and profit |
| `costs.correct` | Edit the commercial breakdown (cost / agent price corrections) |
| `invoices.submit` | "Send for post invoice" (reservations → accounting) |
| `invoices.post` | Post & send to agent; return to reservations with a note |
| `invoices.void` | Void a posted invoice |
| `agents.approve` | Approve / reject agent registrations, block agents |
| `finance.balance` | Agent statements / balance |
| `finance.payments` | Incoming and outgoing payments *(module not built)* |
| `transfers.view` | Transfer list (no prices) |
| `transfers.assign_driver` | Assign / change a driver on a booking's transfer *(not built)* |
| `drivers.manage` | Add / edit drivers *(not built)* |
| `contracts.manage` | Contracts, rooms & beds, import, markup, special-rate agents |
| `staff.manage` | Create staff users and give them roles |

### 3.3 Roles = bundles

| Permission | Owner | Reservations | Senior res. | Accountant | Finance | Transfer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| bookings.view | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| bookings.work | ✔ | ✔ | ✔ | — | — | — |
| costs.view | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| costs.correct | ✔ | ✔ | ✔ | — | — | — |
| invoices.submit | ✔ | ✔ | ✔ | — | — | — |
| invoices.post | ✔ | — | — | ✔ | — | — |
| invoices.void | ✔ | — | — | ✔ | — | — |
| agents.approve | ✔ | — | ✔ | — | — | — |
| finance.balance | ✔ | — | — | — | ✔ | — |
| finance.payments | ✔ | — | — | — | ✔ | — |
| transfers.view | ✔ | ✔ | ✔ | — | — | ✔ |
| transfers.assign_driver | ✔ | — | — | — | — | ✔ |
| drivers.manage | ✔ | — | — | — | — | ✔ |
| contracts.manage | ✔ | — | — | — | — | — |
| staff.manage | ✔ | — | — | — | — | — |

Cells marked for owner decision in §5 are the defaults proposed here.

### 3.4 Data

- `users.role` keeps meaning "agent" vs "staff" exactly as today (nothing that reads it breaks).
- New `staff_roles` (user_id, role_code, granted_by, granted_at) — **a person can hold several roles** (a small team: the accountant is often also finance). Effective permissions = union.
- Role → permission bundles live in code (one file), so they are versioned and reviewed. Per-person overrides can be added later without changing anything else.
- Existing `Admin` users become `owner` automatically: zero change for the people using the system today.

### 3.5 Enforcement

- **Server is the authority.** One shared `require_permission(code)` replaces `_require_admin` endpoint by endpoint (it also finally gives the project the shared auth dependency Decision 006 has been waiting for). A hidden button is a convenience; the 403 is the protection.
- **Admin Panel shows only what a person may use:** menu sections, buttons (Post, Void, Assign driver, Approve agent) and money columns (cost / profit) follow permissions. Same structural principle as Decision 107: content a role may not see is not rendered at all.
- `GET /me/permissions` tells the frontend what to show.
- Every permission-gated action keeps recording who did it (already the case).

### 3.6 Driver assignment (role 5) — new, small module

- `drivers` (name, phone, vehicle, plate, destination country, active).
- `transfer_assignments` (booking_room_id, leg = arrival / departure, driver_id, pickup date/time, note, assigned_by/at) — one driver per leg, changeable, history kept.
- Transfer list gains a "Driver" column and an assign control for `transfers.assign_driver`; the transfer manager sees no prices.
- Later, if wanted: send the driver the pickup details (WhatsApp / e-mail) and show the driver on the guest voucher.

## 4. Phases

| Phase | What | Changes |
|---|---|---|
| 1 | Close the open endpoints (agent approve/reject, users list) | API, small |
| 2 | Permissions + `staff_roles` + `require_permission`; Admin users → owner; menu/buttons follow permissions | DB (new table), API, admin UI; touches LOCKED Booking/Finance/Pricing APIs (auth only, no business logic) |
| 3 | Admin → Agents & staff: create staff, give / remove roles | admin UI |
| 4 | Drivers + driver assignment | DB (2 new tables), API, Transfer list |
| 5 | Incoming / outgoing payments for Finance | separate, larger module (Payments) |

Each phase on an isolated database copy first, as always.

## 5. Decisions (owner agreed to all six proposals, 2026-10-16 — subject to later change)

1. May reservations managers see **profit** (they need cost for cost correction)? Proposed: yes.
2. "Reject" by the accountant = **return to reservations with a note** (exists today), not a cancellation of the booking? Proposed: yes.
3. May the accountant **void** a posted invoice, or only the owner? Proposed: accountant.
4. One person, **several roles** (e.g. accountant + finance)? Proposed: yes.
5. Does the transfer manager see **guest names and flights** (needed to meet them)? Proposed: yes; prices no.
6. Are drivers per destination (Mauritius drivers see only Mauritius bookings)? Proposed: driver has a destination; the transfer manager sees all.
