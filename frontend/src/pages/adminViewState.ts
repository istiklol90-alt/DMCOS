import { BOOKING_STATUSES, type BookingsListState } from "./Reservations";

// ---------------------------------------------------------------------------
// Admin restructure, Stage B2: what an admin screen was showing -- filters,
// queue, sort, page -- survives a refresh and a visit to another section.
//
// Kept in sessionStorage: it lasts as long as the browser tab, is not shared
// between tabs, and is gone when the tab closes. Which SCREEN is showing is a
// different question and lives in the URL (adminLocation.ts, Stage B1).
//
// One stored object, partitioned two ways:
//   * by USER  -- the object carries the id of the user who wrote it, and is
//     discarded whole the moment a different user reads it. Logging out and
//     in as someone else in the same tab never shows the previous person's
//     filters.
//   * by SECTION -- each screen reads and writes only its own entry.
//
// Reading never throws and never trusts what it finds. Storage can be
// unavailable, the text can be truncated or hand-edited, and a value that was
// valid when saved can stop being valid. Every field is checked on its own;
// a bad field falls back to that field's default and the rest still restore.
//
// Admin-only. Nothing in the agent panel imports this file, and the agent's
// booking list is never handed a saved state (see Reservations.tsx's
// `initialListState`).
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dmc.admin.viewState.v1";

interface StoredRoot {
  userId: number;
  sections: Record<string, unknown>;
}

function currentUserId(): number | null {
  try {
    const id = JSON.parse(localStorage.getItem("user") || "null")?.id;
    return typeof id === "number" && Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRoot(): StoredRoot | null {
  const userId = currentUserId();
  if (userId === null) return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked or unavailable
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && parsed.userId === userId && isRecord(parsed.sections)) {
      return { userId, sections: parsed.sections };
    }
  } catch {
    // not JSON -- fall through and discard it
  }
  // Someone else's, or damaged beyond use. Remove it so it is not re-read on
  // every screen, and so the next save starts clean.
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing more to do
  }
  return null;
}

function loadSection(section: string): unknown {
  return readRoot()?.sections[section];
}

function saveSection(section: string, value: unknown): void {
  const userId = currentUserId();
  if (userId === null) return;
  const sections = { ...(readRoot()?.sections ?? {}), [section]: value };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, sections } satisfies StoredRoot));
  } catch {
    // Quota or a blocked store. Losing the convenience is the correct
    // outcome; the screen itself must keep working.
  }
}

// Today as the person at this screen sees it -- the same local calendar date
// Reservations.tsx's todayStr() uses, never the UTC one.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && value === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "all", or a positive whole number as text -- what the hotel / agent /
// manager dropdowns hold. Whether that id still EXISTS can only be known once
// the lists have loaded, and is checked there (Reservations.tsx).
function idOrAll(value: unknown): string | undefined {
  if (value === "all") return "all";
  return typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? value : undefined;
}

const QUEUES = ["all", "unassigned", "mine", "attention"] as const;
const DATE_VIEWS = ["staying", "created", "cancellations"] as const;
const SORT_KEYS = ["created_at", "arrival_date", "status"] as const;
const SORT_DIRS = ["asc", "desc"] as const;
const MAX_SEARCH_LENGTH = 64;
const MAX_PAGE = 100_000;

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const BOOKINGS_SECTION = "bookings";

// Always returns an object for the admin list, possibly an empty one: every
// field it does not carry simply takes the list's normal default.
export function loadBookingsListState(): Partial<BookingsListState> {
  const stored = loadSection(BOOKINGS_SECTION);
  if (!isRecord(stored)) return {};
  const out: Partial<BookingsListState> = {};

  const status = stored.statusFilter;
  if (status === "all" || (typeof status === "string" && (BOOKING_STATUSES as readonly string[]).includes(status))) {
    out.statusFilter = status;
  }
  const hotel = idOrAll(stored.hotelFilter);
  if (hotel !== undefined) out.hotelFilter = hotel;
  const agent = idOrAll(stored.agentFilter);
  if (agent !== undefined) out.agentFilter = agent;
  const owner = idOrAll(stored.ownerFilter);
  if (owner !== undefined) out.ownerFilter = owner;

  if (typeof stored.searchQuery === "string" && stored.searchQuery.length <= MAX_SEARCH_LENGTH) {
    out.searchQuery = stored.searchQuery;
  }
  const queue = oneOf(QUEUES, stored.queue);
  if (queue !== undefined) out.queue = queue;
  const dateView = oneOf(DATE_VIEWS, stored.dateModeView);
  if (dateView !== undefined) out.dateModeView = dateView;
  const sortKey = oneOf(SORT_KEYS, stored.sortKey);
  const sortDir = oneOf(SORT_DIRS, stored.sortDir);
  // A sort is a pair; half of one is not restored.
  if (sortKey !== undefined && sortDir !== undefined) {
    out.sortKey = sortKey;
    out.sortDir = sortDir;
  }
  if (typeof stored.page === "number" && Number.isInteger(stored.page) && stored.page >= 0 && stored.page <= MAX_PAGE) {
    out.page = stored.page;
  }

  // A date range is restored only if it was chosen deliberately AND on this
  // same calendar day. The list's own default is "today"; a saved copy of
  // that would open tomorrow still showing yesterday, which is exactly the
  // stale-queue failure this screen has already had once. So "today" is never
  // written (see saveBookingsListState) and anything written expires at
  // midnight.
  const dates = stored.dates;
  if (isRecord(dates) && dates.day === localToday() && isIsoDate(dates.from) && isIsoDate(dates.to) && dates.from <= dates.to) {
    out.dateFrom = dates.from;
    out.dateTo = dates.to;
  }
  return out;
}

export function saveBookingsListState(state: BookingsListState): void {
  const today = localToday();
  // Not a finished range (the picker is mid-selection), or simply the default.
  const customRange = state.dateTo !== "" && !(state.dateFrom === today && state.dateTo === today);
  saveSection(BOOKINGS_SECTION, {
    statusFilter: state.statusFilter,
    hotelFilter: state.hotelFilter,
    agentFilter: state.agentFilter,
    ownerFilter: state.ownerFilter,
    searchQuery: state.searchQuery,
    queue: state.queue,
    dateModeView: state.dateModeView,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    page: state.page,
    ...(customRange ? { dates: { from: state.dateFrom, to: state.dateTo, day: today } } : {}),
  });
}
