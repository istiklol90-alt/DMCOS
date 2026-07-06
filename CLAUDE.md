# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Engine Development Rule (non-negotiable)

Each of the 22 Core Engines must go through its FULL lifecycle (TASK-000 through TASK-006 LOCK) before work begins on the next Engine. No parallel Engine work. No starting a new Engine's TASK-001 while a previous Engine is still in progress. This was proven with Authentication Engine (fully migrated, tested, documented, and LOCKED before any other Engine was touched) and must be repeated for every subsequent Engine, in this exact order, unless explicitly told otherwise by the project owner.

Before starting any Engine that depends on another Engine's data (e.g. Booking Engine depends on Contract Engine for pricing), an **Interface Contract** document must exist first, defining exactly what functions/data one Engine provides to the other. Interface Contracts live in `docs/interface-contracts/`, named `<engine-a>-<engine-b>.md` (e.g. `contract-hotel-booking.md` for the Contract → Hotel → Booking data flow). This directory doesn't exist yet — create it when the first cross-Engine dependency actually needs one, rather than speculatively.

## Project

DMC Travel OS — a Destination Management System (DMC/tour-operator ERP: agents, hotels, contracts, rates, bookings, payments, finance, AI automation). Currently in early MVP stage: only authentication and agent-registration/approval are implemented end-to-end; most business modules listed in the design docs (hotels, contracts, rates, bookings, finance, transfers, charter, AI) do not exist in code yet.

## Governing documents — read before changing business logic

The numbered root-level docs are the project's spec and are treated as the source of truth for business rules, not just background reading:

- `00_MASTER_RULES.md` — golden rules. Notably: never change business logic without owner confirmation, don't remove existing features without reason, AI must follow `02_Logic_Rules.md` / `03_Domain_Model.md` / `04_Data_Dictionary` and must not invent its own business rules.
- `01_Modules_List.md` — full business module catalog (most are unbuilt).
- `02_Logic_Rules.md` — detailed workflow/status rules (agent registration, contracts, rates, bookings, etc.).
- `03_Domain_Model.md` — canonical entity/field definitions.
- `04_Data_Dictionary` (no extension, it's a text file, not a folder) — DB field dictionary. Note it specifies UUID primary keys + `tenant_id` on every table; actual code currently uses integer PKs and no multi-tenancy (see Reality vs. docs below).
- `05_Architecture.md` — target architecture (Postgres, Redis, Celery, S3, multi-tenant). Aspirational; current implementation is much simpler (see below).
- `06_API_Rules.md`, `07_UI_UX_Rules.md`, `08_Coding_Standards.md` — API/UI/coding conventions to follow for new work.
- `09_Project_Roadmap.md` — phase plan (currently in Phase 2 / MVP).
- `11_Decisions.md`, `12_REVIEW.md` — decision and review logs; templates are mostly still empty.

**Reality vs. docs gap:** the docs describe the long-term target (PostgreSQL, UUIDs, multi-tenant, Celery/Redis, S3). The actual backend today is a single-tenant FastAPI app on SQLite with integer auto-increment PKs and no queue/cache/storage layer. When implementing new features, follow the doc's business rules and API/module shape, but don't assume the infra described in `05_Architecture.md` already exists — check the code first.

## Commands

Backend (FastAPI, from `backend/`, using the committed `.venv`):
```
./.venv/Scripts/python.exe -m uvicorn main:app --reload   # dev server on :8000
./.venv/Scripts/python.exe -m database.init_db            # create tables from models (also backend/init_db.py, duplicate); must be run as a module — `python database/init_db.py` fails with ModuleNotFoundError since backend/ never lands on sys.path that way
./.venv/Scripts/python.exe create_admin.py                 # create admin@dmcos.com / Admin@2026
./.venv/Scripts/python.exe check_db.py                     # inspect dmc.db tables/columns via sqlite3
```
Dependencies are pinned in `backend/requirements.txt` — install with `./.venv/Scripts/pip.exe install -r requirements.txt` (or into a fresh venv). The `.venv` is committed to the repo; if it's ever recreated, install from this file rather than guessing packages.

Frontend (React + TypeScript + Vite, from `frontend/`):
```
npm run dev       # vite dev server, expects backend at http://127.0.0.1:8000
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```
No test suite exists in either backend or frontend.

## Backend architecture

- `main.py` — FastAPI app, CORS for local Vite origins, mounts `api.routes.router` and the authentication engine's router (`app.engines.authentication.api.router`).
- `database/db.py` — SQLAlchemy engine/session; SQLite file `backend/dmc.db` (path resolved relative to `backend/`, hardcoded, not tenant-aware).
- `models/` — SQLAlchemy models (`User`, `AgentRegistration`) on `models.base.Base` (`DeclarativeBase`).
- `schemas/` — Pydantic request/response schemas, separate from SQLAlchemy models per `08_Coding_Standards.md` ("validation inside Schemas").
- `api/routes.py` — all non-auth endpoints currently live in one router: user CRUD and the full agent-registration lifecycle (create → list/get → approve/reject → stats). Approving a registration creates a `User` row with role `agent` and a generated temp password, then emails it. Route ordering bug: `/agent-registrations/stats` is defined after `/agent-registrations/{registration_id}`, so FastAPI matches the `{id}` route first and `/stats` 404s with an int-parsing error — not yet fixed.
- **Authentication engine — `app/engines/authentication/` — Status: 🔒 LOCKED.** Migrated off `backend/auth/`, tested, and production-validated (TASK-000 through TASK-006). Considered complete and stable — do not modify without a deliberate new engine task (and if you do, update this status accordingly). `api.py` holds the router + `login`/`change-password` endpoints (this is what `main.py` mounts); `service.py` holds `create_access_token`, and the single consolidated password-hashing implementation (`verify_password`/`get_password_hash`, passlib `CryptContext(schemes=["bcrypt"])`) — there is only one hashing implementation now, not two; `repository.py` holds `get_db`/`get_user_by_email`/`update_last_login`/`update_password`; `schemas.py` holds `LoginRequest`/`ChangePasswordRequest`; `config.py`/`constants.py` hold `SECRET_KEY`/`ALGORITHM`/`ACCESS_TOKEN_EXPIRE_MINUTES`.
  - **Known limitation for production deployment:** `config.py` falls back to a random `secrets.token_urlsafe(32)` if the `SECRET_KEY` env var isn't set. As of this writing, `backend/.env` does not exist in this project at all, so `SECRET_KEY` is never set and this random fallback fires on **every single backend restart** — meaning every restart invalidates every previously-issued JWT and all logged-in users get silently signed out. Before any production deployment, a real, stable `SECRET_KEY` must be set in the environment (or `.env`).
  - `backend/auth/` is **fully retired** — `auth.py`, `security.py`, `schemas.py`, `dependencies.py` were moved (`git mv`, history preserved) into `backend/auth/_retired/`, each marked with a `RETIRED — DO NOT USE, kept only for history` comment. Nothing in the active codebase imports from `backend/auth/` anymore (confirmed by grep). Do not add new code there or import from it.
- `services/__init__.py` is currently empty.
- `services/email_service.py` — SMTP sending via env vars (`EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASSWORD`/`EMAIL_FROM`, Gmail defaults); if credentials aren't configured it logs the email to console instead of sending. `services/ai_service.py` is a rule-based stand-in (no real AI/LLM call yet) for registration risk scoring.
- Secrets: `backend/.env` is gitignored and would hold `SECRET_KEY`/SMTP credentials — never commit it. (It doesn't currently exist in this project — see the `SECRET_KEY` limitation above.)

## Frontend architecture

- Entry (`main.tsx`) mounts `router.tsx` (`react-router-dom`), which routes `/`, `/register`, `/login`, `/dashboard`, `/admin-panel`, `/agent-dashboard` to page components — but `App.tsx` (rendered at `/`) *also* implements its own internal page switcher via `useState<Page>` and renders `Home`/`Register`/`Login`/`AdminPanel`/`AgentDashboard_v2`/`ManagerDashboard` conditionally instead of delegating to the router's child routes. In practice nearly all in-app navigation happens through `App.tsx`'s local state (and `localStorage.getItem("role")` on mount), not through the router paths — the router-defined child routes are largely dead paths. Be aware of this split when adding a new page/screen: decide which mechanism it should join rather than assuming the router config is authoritative. See "Known issues" below for the concrete failure modes this causes.
- `config.ts` hardcodes `API_URL = "http://127.0.0.1:8000"`.
- `pages/` — one component per screen (Home, Register/AgentRegistration, Login, ChangePassword, Dashboard, AdminPanel, AgentDashboard, AgentDashboard_v2, ManagerDashboard, CounteragentDashboard). `AgentDashboard.tsx` (v1) is no longer rendered anywhere — `App.tsx` renders `AgentDashboard_v2.tsx` for the agent role instead — but v1 hasn't been deleted.
- `components/` grouped by feature area (`dashboard/`, `counteragents/`, `layout/`, `ui/`).
- Role handling is string-based and inconsistently cased across the stack (backend stores/returns roles like `"Admin"`/`"agent"`; frontend checks both `"Admin"`/`"admin"` etc.) — check exact casing when touching role logic instead of assuming one convention.

## Known issues (tracked, not yet fixed)

- **Router/`App.tsx` page-switching mismatch breaks direct-URL navigation and creates a redirect-loop trap.** `App.tsx` never renders `<Outlet/>`, so none of `router.tsx`'s nested child routes actually mount when visited directly by URL — the address bar changes but the visible content is always whatever `App`'s own `page` state resolves to (defaults to `"home"` on a fresh load, or gets set from `localStorage.getItem("role")` in `App`'s mount effect). Confirmed with Playwright: visiting `/agent-dashboard` directly with no session at all just silently renders Home instead of redirecting anywhere.
  - Related trap: a page that guards itself the way `AgentDashboard.tsx`/`AgentDashboard_v2.tsx` do (check `token` in `localStorage`, `window.location.href = "/login"` if missing) will loop forever if it redirects without also clearing the stale `role`/`user` keys — because on the next full load, `App`'s mount effect reads that leftover `role`, routes straight back to the same guarded page, which redirects again. `AgentDashboard_v2.tsx` calls `localStorage.clear()` before redirecting to avoid this; `AgentDashboard.tsx` (v1, unused but still present) does not have this fix and would still loop under the same conditions.
  - Proper fix is its own task, not a drive-by change — it touches how every page in the app is reached. Likely needs either: wire `App.tsx` to actually delegate to the router (add `<Outlet/>`, drop the internal `page` state), or remove `router.tsx`'s dead nested routes and rely solely on `App`'s state machine.
