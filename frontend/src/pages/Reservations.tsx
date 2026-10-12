import { Fragment, useEffect, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import { DateRangePicker, formatTimeInput, isValidTimeValue } from "./HotelSearch";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import { SkeletonRow } from "../components/ui/Skeleton";
import {
  TableShell,
  TableHeadRow,
  TableHeadCell,
  TableRow,
  TableCell,
  TableNumericCell,
  TableEmptyState,
  TableErrorState,
} from "../components/ui/Table";

// ---------------------------------------------------------------------------
// Types (only the fields this screen actually reads)
// ---------------------------------------------------------------------------

export interface Booking {
  id: number;
  booking_number: string;
  agent_id: number;
  hotel_id: number;
  contract_id: number;
  room_type_id: number;
  meal_plan_id: number;
  applied_special_offer_id: number | null;
  arrival_date: string;
  departure_date: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  status: string;
  currency: string;
  total_amount: number;
  // Decision 178: the whole application's price (every billable room).
  application_total?: number | null;
  // Decision 101: were missing entirely -- Reservations.tsx's own
  // Net/Sale/Profit display had no way to compute a real figure without
  // these, even though the backend has returned them since Decision 069.
  agent_markup_amount: number | null;
  agent_exclusive_discount_amount: number | null;
  transfer_type: string | null;
  transfer_total: number | null;
  mandatory_tax_total: number | null;
  special_requests: string | null;
  arrival_flight_number: string | null;
  departure_flight_number: string | null;
  arrival_flight_date: string | null;
  arrival_flight_time: string | null;
  departure_flight_date: string | null;
  departure_flight_time: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancellation_fee: number | null;
  cancelled_by: number | null;
  // Decision 104: two-stage cancellation confirmation -- populated only
  // once status reaches the final "Cancelled" (stage 2), distinct from
  // cancellation_reason/cancelled_at/cancellation_fee/cancelled_by above,
  // which are stage 1's frozen request-time snapshot.
  cancellation_confirmation_number: string | null;
  cancellation_confirmed_at: string | null;
  cancellation_confirmed_by: number | null;
  date_change_reason: string | null;
  dates_changed_at: string | null;
  claimed_by: number | null;
  claimed_at: string | null;
  confirmation_number: string | null;
  created_at: string;
}

// One room/leg within a booking "application" (Stage 1-5, multi-room
// booking applications). Every booking -- old single-room ones (migrated)
// and every new one created via the trip-cart checkout -- has at least
// one of these; a booking's own top-level fields (hotel_id/arrival_date/
// total_amount/etc.) only ever reflect the FIRST room as a legacy
// "representative" snapshot, so this is the only place that shows the
// real, complete picture for an application with more than one room.
export interface BookingRoom {
  id: number;
  booking_id: number;
  sequence_number: number;
  hotel_id: number;
  contract_id: number;
  room_type_id: number;
  meal_plan_id: number | null;
  arrival_date: string;
  departure_date: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  status: string;
  rejection_reason: string | null;
  currency: string | null;
  agent_markup_amount: number | null;
  agent_exclusive_discount_amount: number | null;
  transfer_type: string | null;
  transfer_total: number | null;
  // Decision 199: set once a room's transfer has been changed after booking.
  // null means it is still whatever was chosen at booking time.
  transfer_change_reason: string | null;
  transfer_changed_at: string | null;
  transfer_changed_by: number | null;
  mandatory_tax_total: number | null;
  total_amount: number | null;
  confirmation_number: string | null;
  special_requests: string | null;
  applied_special_offer_id: number | null;
}

interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  is_lead_guest: boolean;
  // Decision 150: this guest's OWN flight, when it differs from the rest of
  // the party's. All null (the normal case) means the guest travels on the
  // booking's own arrival_flight_*/departure_flight_* -- it is not "unknown".
  arrival_flight_number: string | null;
  arrival_flight_date: string | null;
  arrival_flight_time: string | null;
  departure_flight_number: string | null;
  departure_flight_date: string | null;
  departure_flight_time: string | null;
}

// True when this guest was given a flight of their own, i.e. is NOT on the
// booking's common flight. One helper so the guest card, the flights card
// and anything added later cannot disagree about what "flies separately"
// means.
function hasOwnFlight(g: Guest): boolean {
  return Boolean(
    g.arrival_flight_number ||
      g.arrival_flight_date ||
      g.arrival_flight_time ||
      g.departure_flight_number ||
      g.departure_flight_date ||
      g.departure_flight_time
  );
}

interface Hotel {
  id: number;
  hotel_name: string;
  email?: string | null;
}

interface RoomType {
  id: number;
  room_name: string;
}

interface MealPlanInfo {
  meal_code: string;
  meal_name: string | null;
}

interface UserRecord {
  id: number;
  name: string;
  company_name?: string | null;
}

export interface BookingCorrespondenceRow {
  id: number;
  booking_id: number;
  direction: string;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  recipient_email: string | null;
  recipient_email_secondary: string | null;
  created_by: number | null;
  created_at: string;
  // Decision 154: did it actually leave? true = SMTP accepted it,
  // false = recorded only, null = predates the column.
  delivered?: boolean | null;
}

interface CancellationPolicy {
  id: number;
  contract_id: number;
  days_before_arrival: number;
  penalty_type: string;
  penalty_value: number;
  currency: string | null;
  description: string | null;
  // Decision 151: the season window a tier belongs to. Always returned by
  // CancellationPolicyResponse; needed here now that the list screen fetches
  // a contract's tiers once and selects the applicable ones itself.
  start_date: string | null;
  end_date: string | null;
}

// Mirrors contract/service.py's get_cancellation_policy EXACTLY -- the same
// predicate that endpoint applies when it is given a check_in:
//
//     (p.start_date is None and p.end_date is None)
//     or (p.start_date is not None and p.end_date is not None
//         and p.start_date <= check_in <= p.end_date)
//
// including its both-or-neither quirk: a tier with only ONE bound set matches
// neither branch and is excluded. Both bounds are inclusive. ISO "YYYY-MM-DD"
// strings compare correctly with <=, so no date parsing is involved.
//
// This is a deliberate client-side mirror of a backend rule, in the same
// spirit as financeShared.tsx's computeBookingFinancials (Decision 101). It
// exists so the list screen can ask for a contract's tiers ONCE instead of
// once per (contract, arrival date) pair -- see the load effect for the
// measured reason. Equivalence with the server was verified against every
// real pair at the time of the change; if get_cancellation_policy's rule ever
// changes, this must change with it.
function tiersApplicableTo(policies: CancellationPolicy[], checkIn: string): CancellationPolicy[] {
  return policies.filter((p) => {
    const start = p.start_date ?? null;
    const end = p.end_date ?? null;
    if (start === null && end === null) return true;
    if (start !== null && end !== null) return start <= checkIn && checkIn <= end;
    return false;
  });
}

type SortKey = "created_at" | "arrival_date" | "status";
type SortDir = "asc" | "desc";

export interface Permissions {
  canChangeDates: boolean;
  canEditGuestDetails: boolean;
  canEditFlights: boolean;
  canCancel: boolean;
  canClaim: boolean;
  // Admin/Agent Component Separation refactor: replaces the old invoice-
  // visibility permission flag (removed entirely -- nothing financial is
  // left in this base component to gate with it). Gates
  // ConfirmationNumberEdit's edit control and the
  // CancellationConfirmationEdit section -- both stay in this base file,
  // but for "hotel-confirmation authority" reasons (a manager records
  // what the hotel said), not money-secrecy.
  canConfirmWithHotel: boolean;
}

export type Scope = { type: "all" } | { type: "agent"; agentId: number };

// ---------------------------------------------------------------------------
// Composition boundary (Admin/Agent Component Separation refactor) --
// AdminBookingFinance.tsx implements this interface and passes it into
// BookingsList via the adminExtensions prop; AgentDashboard_v2.tsx's own
// usage omits it entirely, so nothing financial is even importable from
// that file's source, not just permission-gated at render time.
// ---------------------------------------------------------------------------

export interface DetailCtx {
  booking: Booking;
  onBookingUpdated: (b: Booking) => void;
  // The selected BookingRoom's own id (distinct from booking.id, the
  // parent application) -- needed by renderFinancialSummary for
  // per-room commercial-line endpoints. null only when no rooms exist
  // at all for this application (legacy data, see the "Rooms" section
  // above), or DetailCtx is constructed by a slot other than
  // renderFinancialSummary that never had a room to select in the
  // first place.
  bookingRoomId?: number | null;
  // Real bug fix: the LPO (booking confirmation request) email used to
  // be built from `booking`'s own "representative" (first-room) fields
  // only, so a 2+-room application's hotel email silently described just
  // one of the rooms. renderCorrespondencePanel needs the full room list
  // to build one combined email covering every room. null/undefined has
  // the exact same meaning as the "Rooms" section's own `rooms` state:
  // still loading, or a legacy application with zero BookingRoom rows.
  rooms?: BookingRoom[] | null;
  // Lets a slot switch which room is selected. Decision 180: the commercial
  // breakdown is one room's ledger, and changing rooms meant scrolling back
  // up to the Rooms card and clicking there -- on an 8-room application,
  // once per room. The selection still lives in one place (BookingDetail's
  // own state); this only hands the slot the setter.
  onSelectRoom?: (roomId: number) => void;
  // Names already resolved for the SELECTED room, so a slot can label what
  // each figure is actually for ("Room — Sky Studio") instead of showing a
  // bare category. Optional: slots that don't need them ignore it, and the
  // maps live here anyway.
  labels?: {
    hotel: string | null;
    roomType: string | null;
    mealPlan: string | null;
    transfer: string | null;
    nights: number;
    guests: { adults: number; children: number; infants: number };
  };
}

export interface AdminBookingExtensions {
  // list-level
  financialColumnHeaders?: ReactNode; // extra <th>s (Net cost, Profit)
  renderFinancialColumnCells?: (booking: Booking) => ReactNode; // extra <td>s per row
  extraColumnCount?: number; // for empty-state colSpan math
  renderStatusBadgeExtra?: (booking: Booking) => ReactNode; // urgent-invoice badge, list row + detail header (same fn, two call sites)

  // detail-level
  renderHeaderActions?: (ctx: DetailCtx) => ReactNode; // "Создать счёт" button + invoice summary
  renderCorrespondencePanel?: (ctx: DetailCtx) => ReactNode; // whole LPO compose/send block
  renderReplyLogButton?: (ctx: DetailCtx) => ReactNode; // "Добавить ответ отеля вручную" button
  renderFinancialSummary?: (ctx: DetailCtx) => ReactNode; // Net/Sale/Profit block; replaces the base's default "Итого" line when present
  onAfterClaim?: (ctx: DetailCtx) => void; // auto-invoice-on-claim side effect
  // list-level, additive (2026-07-27): a summary strip over whatever the
  // list is CURRENTLY filtered to (typically a "By date" range) -- e.g.
  // "23 applications, 10 cancelled, total profit $1,233". Receives the
  // already-filtered/sorted list so it never needs its own copy of the
  // filter logic; structurally absent for AgentDashboard_v2.tsx (never
  // supplies adminExtensions), same profit-confidentiality boundary
  // (Decision 102) as renderFinancialSummary.
  renderListSummary?: (bookings: Booking[]) => ReactNode;
  // The total the agent actually booked at, rendered at the foot of the
  // Rooms block. A financial figure, so it goes through the extension
  // mechanism rather than inline -- but the reason it is needed is not
  // financial: the Rooms block was showing BookingRoom.total_amount, the
  // ROOM line alone, with transfer and mandatory tax silently missing and
  // no total anywhere. On the real BK-000080 that read "1466.50" and
  // "3927.00" while the agent had booked at 6700.50.
  renderRoomsTotal?: (ctx: DetailCtx) => ReactNode;
  // Decision 166: approving a room sends its guest voucher. The send is a
  // Finance Engine call, so it lives here rather than inline in the shared
  // component. Best-effort by contract -- the approval has already
  // succeeded by the time this runs and must never be undone by it.
  onAfterRoomApproved?: (bookingRoomId: number) => Promise<void> | void;
}

const TERMINAL_STATUSES = ["Cancelled", "Rejected", "Completed"];

// Decision 168: room statuses that still represent something owed to the
// agent. Mirrors booking/service.py's _LIVE_ROOM_STATUSES -- the server is
// the authority (it refuses a free-of-charge cancellation while any room is
// live); this copy only decides whether to OFFER the step.
const LIVE_ROOM_STATUSES = ["Pending", "Confirmed", "Partially Confirmed", "Waiting Hotel"];

// Decision 164: taking a booking into work straight from the list row, so a
// manager working through a red backlog never has to open each application
// just to become its owner. Deliberately lives in the shared base (not in
// AdminBookingFinance.tsx's adminExtensions) because taking is an operations
// action, not a financial one -- BookingDetail's own claim button is already
// in the base, gated the same way by permissions.canClaim, and Decision 107's
// split is specifically about money, not about ownership.
//
// It calls the identical endpoint AND the identical onAfterClaim side effect
// (Decision 080's auto-created Draft invoice) as the detail's button, so
// "took it from the list" and "took it from inside" can never diverge.
function RowTakeButton({
  booking,
  onClaimed,
}: {
  booking: Booking;
  onClaimed: (updated: Booking) => void;
}) {
  const { t } = useTranslation("reservations");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(e: MouseEvent) {
    // The row itself opens the detail on click -- taking must not also
    // open it, or the manager loses their place in the queue.
    e.stopPropagation();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem("token") || "";
      const updated = await fetchJson<Booking>(
        `/booking-engine/bookings/${booking.id}/claim`,
        token,
        { method: "POST" },
      );
      onClaimed(updated);
    } catch (err: any) {
      setError(err.message || t("bookingDetail.claimFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="animate-pulse rounded-full bg-danger px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:animate-none hover:bg-danger/85 disabled:animate-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? t("bookingDetail.sending") : t("bookingDetail.claim")}
      </button>
      {error && <span className="text-[10px] font-medium text-danger">{error}</span>}
    </span>
  );
}

// Decision 152: the status filter's options. Mirrors booking/schemas.py's
// BookingStatus Literal — deliberately a fixed list rather than "whatever
// statuses happen to be on screen", which with pagination would mean a page
// of 50 Pending rows leaves "Pending" as the only status still selectable.
const BOOKING_STATUSES = [
  "Draft",
  "Pending",
  "Waiting Hotel",
  "Confirmed",
  "Partially Confirmed",
  "Cancellation Requested",
  "Cancelled",
  "Rejected",
  "Completed",
] as const;

// ---------------------------------------------------------------------------
// Fetch helper — same pattern as HotelSearch.tsx's fetchJson
// ---------------------------------------------------------------------------

// FastAPI returns TWO different shapes under "detail": a plain string for
// every deliberate HTTPException this project raises, but a LIST of
// {loc, msg, ...} objects for a 422 request-validation failure. Assigning
// either straight into `new Error(detail)` renders a 422 as the literal text
// "[object Object]" -- a real failure seen on a booking submit. Same helper
// exists in HotelSearch.tsx, which carries its own copy of fetchJson for the
// same module-scope/i18n reasons documented there.
function formatApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const lines = detail
      .map((entry) => {
        const e = entry as { loc?: unknown; msg?: unknown };
        const field = Array.isArray(e?.loc)
          ? e.loc.filter((p) => p !== "body" && p !== "query" && p !== "path").join(" → ")
          : "";
        const msg = typeof e?.msg === "string" ? e.msg : "";
        return [field, msg].filter(Boolean).join(": ");
      })
      .filter(Boolean);
    if (lines.length) return lines.join("; ");
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function fetchJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  // A 30-minute token simply expires while a tab sits open; every request
  // then fails with 401 "Invalid token". Handled once, centrally, instead of
  // each panel rendering that raw string or hanging on a spinner forever.
  if (response.status === 401) {
    handleSessionExpired();
    throw new Error("Session expired");
  }
  if (!response.ok) {
    // Module-scope helper (not a component) -- can't use the useTranslation()
    // hook, and can't safely call the ambient i18n singleton's t() either:
    // this function is shared by components rendered both standalone
    // (agent, ambient global i18n instance) and inside AdminPanel.tsx (via
    // AdminBookingFinance.tsx's I18nextProvider-scoped English-only
    // instance) -- a plain module-scope call has no way to know which
    // context is actually rendering. Kept language-neutral (English)
    // instead of translated; in practice this generic fallback almost
    // never surfaces since every real backend error path already returns
    // {"detail": "..."} (see api.py's ValueError->400 mapping), overwritten
    // below the moment a JSON body with .detail exists.
    let detail = `Request error (${response.status})`;
    try {
      const body = await response.json();
      detail = formatApiDetail(body?.detail, detail);
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Decision 153. The backend refuses a flight more than a year from the stay,
// or a return before the outbound — those cannot exist any more. This is the
// softer tier it deliberately still accepts and merely reports.
//
// Owner decision (2026-08-15): report ANY difference, from one day up. The
// first version skipped 1-3 days on the grounds that a night arrival the day
// before check-in is normal — true, but a one-day slip is also exactly what a
// typo looks like, and this only ever produces a line of text.
const FLIGHT_DATE_WARN_DAYS = 0;

function describeFlightDateIssues(
  t: TFunction,
  booking: Booking,
  guests: Guest[] | null
): string[] {
  const out: string[] = [];

  const legs: [string | null, string, string][] = [
    [booking.arrival_flight_date, booking.arrival_date, t("health.flightsArrivalLeg")],
    [booking.departure_flight_date, booking.departure_date, t("health.flightsDepartureLeg")],
  ];
  for (const [flightDate, stayDate, legLabel] of legs) {
    if (!flightDate) continue;
    const gap = Math.abs(daysBetween(stayDate, flightDate));
    if (gap > FLIGHT_DATE_WARN_DAYS) {
      out.push(t("health.flightsOffBy", { leg: legLabel, days: gap }));
    }
  }

  // Per-guest overrides (Decision 150) are checked against the same stay —
  // a traveller flying separately still cannot be flying a month out.
  for (const g of guests ?? []) {
    const guestLegs: [string | null, string, string][] = [
      [g.arrival_flight_date, booking.arrival_date, t("health.flightsArrivalLeg")],
      [g.departure_flight_date, booking.departure_date, t("health.flightsDepartureLeg")],
    ];
    for (const [flightDate, stayDate, legLabel] of guestLegs) {
      if (!flightDate) continue;
      const gap = Math.abs(daysBetween(stayDate, flightDate));
      if (gap > FLIGHT_DATE_WARN_DAYS) {
        out.push(
          t("health.flightsGuestOffBy", {
            name: `${g.first_name} ${g.last_name}`.trim(),
            leg: legLabel,
            days: gap,
          })
        );
      }
    }
  }
  return out;
}

// Local calendar date as "YYYY-MM-DD". Deliberately NOT toISOString(), which
// converts to UTC first and can therefore report yesterday or tomorrow
// depending on the timezone — fine for todayStr()'s existing uses, wrong for
// a horizon the server will compare against plain Date columns.
function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Mirrors backend/app/engines/booking/service.py's _resolve_cancellation_fee
// exactly, so the confirmation panel can preview the fee before the user
// commits: among tiers where actual notice is less than the tier's
// days_before_arrival threshold, the tier with the smallest threshold
// (strictest, closest to arrival) wins. No breached tier -> no fee.
function resolveCancellationFeePreview(
  policies: CancellationPolicy[],
  booking: Booking
): { fee: number | null; currency: string } {
  const noticeDays = daysBetween(todayStr(), booking.arrival_date);
  const applicable = policies.filter((p) => noticeDays < p.days_before_arrival);
  if (applicable.length === 0) return { fee: null, currency: booking.currency };
  const tier = applicable.reduce((min, p) => (p.days_before_arrival < min.days_before_arrival ? p : min));
  const fee = tier.penalty_type === "percentage" ? booking.total_amount * (tier.penalty_value / 100) : tier.penalty_value;
  return { fee, currency: tier.currency || booking.currency };
}

// Maps a raw status string onto its statusBadge.* translation key suffix.
// Kept as a data map (not translated text itself) so StatusBadge and
// BookingsList's status filter can share one lookup via statusLabel()
// below; a status with no mapping falls back to the raw string, same as
// the old STATUS_LABELS[status] ?? status behavior.
const STATUS_LABEL_KEYS: Record<string, string> = {
  Draft: "draft",
  Pending: "pending",
  "Waiting Hotel": "waitingHotel",
  "Partially Confirmed": "partiallyConfirmed",
  Confirmed: "confirmed",
  // Decision 104: intermediate stage -- allotment is still held, the
  // hotel hasn't yet acknowledged the cancellation.
  "Cancellation Requested": "cancellationRequested",
  Cancelled: "cancelled",
  Rejected: "rejected",
  Completed: "completed",
};

function statusLabel(t: TFunction, status: string): string {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(`statusBadge.${key}`) : status;
}

// Booking-control plan, Phase A: one color used to mean three different
// things (new/in-progress/alarm) at once -- coral was both "Pending" AND
// the "needs attention" overlay's color, so every brand-new booking read
// as an alarm. Pending/Waiting Hotel/Cancellation Requested now share the
// warning (amber) family -- "still moving, not final yet" -- freeing that
// alert color to mean a real alert exclusively (see the needsAttention
// badge below, scoped to the admin queue only; it still uses the old
// coral, which lives in AdminBookingFinance.tsx and is deliberately left
// for the admin-side design-system phase). Design System v1.0: every
// coral/teal usage in THIS file is now on the branded tokens instead --
// Confirmed/Partially Confirmed/Completed moved teal -> success (the real
// independent green), form focus rings and selection states -> gold,
// error text/CTA buttons -> danger/ink. Cancelled/Rejected use
// the branded danger/warning/slate tokens (tailwind.css's @theme) instead
// of raw stock red/amber, and Cancelled gets a line-through on its own
// label text so it can never again visually collide with an unmapped
// status falling back to the same neutral slate classes.
const STATUS_CLASSES: Record<string, string> = {
  Draft: "bg-slate/10 text-slate",
  Pending: "bg-warning/15 text-warning",
  "Waiting Hotel": "bg-warning/15 text-warning",
  // Outlined, not filled -- "moving toward Confirmed" without claiming it
  // yet, visually distinct from both solid Pending and solid Confirmed.
  "Partially Confirmed": "border border-success/40 bg-success/5 text-success",
  Confirmed: "bg-success/15 text-success",
  "Cancellation Requested": "bg-warning/15 text-warning",
  // Design System v1.0: dedicated muted-terracotta token, distinct from
  // Rejected's own danger red -- owner-approved resolution to the brief's
  // "Red = Cancelled" while preserving the Cancelled-vs-Rejected
  // distinction (Decision 104) this session's own line-through fix just
  // reinforced. See tailwind.css's --color-cancelled comment.
  Cancelled: "bg-cancelled/15 text-cancelled line-through decoration-cancelled/40",
  Rejected: "bg-danger/15 text-danger",
  Completed: "bg-success/15 text-success",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("reservations");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_CLASSES[status] ?? "bg-slate/10 text-slate"
      }`}
    >
      {statusLabel(t, status)}
    </span>
  );
}

function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  return `${amount.toFixed(2)} ${currency}`;
}

function formatNumber(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return amount.toFixed(2);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU");
}

// Admin/Agent Component Separation refactor: replaces the shared finance
// module's computeBookingFinancials (now imported only by
// AdminBookingFinance.tsx) for the one figure the operations base still
// needs -- the plain sale total an agent is charged. This base file must
// have zero imports from that finance-only module.
// Decision 178: the price the agent is billed for the WHOLE application.
// `total_amount` is the representative first room's figure, so summing it
// with that room's transfer and tax understated every multi-room booking --
// BK-000080 read 1964.50 on a booking the agent pays 6700.50 for, on both
// the admin list and the agent's own. The server now sends the real
// application total; the old formula stays as the fallback for a response
// that predates it (and for the one legacy booking with no rooms, where the
// two are the same number anyway).
function saleTotal(b: Booking): number {
  if (b.application_total != null) return b.application_total;
  return b.total_amount + (b.transfer_total ?? 0) + (b.mandatory_tax_total ?? 0);
}

// ---------------------------------------------------------------------------
// AI insight strip — rule-based only (plain threshold checks below), NOT an
// LLM call. "AI" here means Level-1-Advisor style surfacing of patterns
// already present in stored data, no automated actions taken.
// ---------------------------------------------------------------------------

type AIFlag =
  | { kind: "pending_soon"; booking: Booking; daysUntilArrival: number }
  | { kind: "cancellation_deadline"; booking: Booking; nextThreshold: number; daysUntilCross: number };

function computePendingSoonFlags(bookings: Booking[]): AIFlag[] {
  const today = todayStr();
  return bookings
    .filter((b) => b.status === "Pending")
    .map((b) => ({ booking: b, daysUntilArrival: daysBetween(today, b.arrival_date) }))
    .filter((x) => x.daysUntilArrival <= 7)
    .map((x) => ({ kind: "pending_soon" as const, booking: x.booking, daysUntilArrival: x.daysUntilArrival }));
}

function computeCancellationDeadlineFlags(
  bookings: Booking[],
  tiersByKey: Record<string, CancellationPolicy[]>
): AIFlag[] {
  const today = todayStr();
  const flags: AIFlag[] = [];
  for (const b of bookings) {
    if (TERMINAL_STATUSES.includes(b.status)) continue;
    const daysUntilArrival = daysBetween(today, b.arrival_date);
    if (daysUntilArrival <= 0) continue; // already arrived — no future deadline to approach
    const key = `${b.contract_id}|${b.arrival_date}`;
    const tiers = tiersByKey[key];
    if (!tiers || tiers.length === 0) continue;

    // A tier's penalty applies once actual notice drops below its
    // days_before_arrival threshold. Flag the soonest threshold that
    // hasn't been crossed yet but will be within the next 3 days.
    let best: { threshold: number; gap: number } | null = null;
    for (const tier of tiers) {
      const gap = daysUntilArrival - tier.days_before_arrival;
      if (gap > 0 && gap <= 3) {
        if (!best || gap < best.gap) best = { threshold: tier.days_before_arrival, gap };
      }
    }
    if (best) {
      flags.push({
        kind: "cancellation_deadline",
        booking: b,
        nextThreshold: best.threshold,
        daysUntilCross: best.gap,
      });
    }
  }
  return flags;
}

function flagText(t: TFunction, flag: AIFlag, hotelName: string): string {
  if (flag.kind === "pending_soon") {
    const days = flag.daysUntilArrival;
    const when =
      days < 0
        ? t("aiInsightStrip.arrivalPassed", { count: Math.abs(days) })
        : days === 0
          ? t("aiInsightStrip.arrivalToday")
          : t("aiInsightStrip.arrivalIn", { count: days });
    return t("aiInsightStrip.pendingSoon", {
      bookingNumber: flag.booking.booking_number,
      hotelName,
      when,
    });
  }
  return t("aiInsightStrip.cancellationDeadline", {
    bookingNumber: flag.booking.booking_number,
    hotelName,
    daysPhrase: t("aiInsightStrip.daysCount", { count: flag.daysUntilCross }),
    thresholdPhrase: t("aiInsightStrip.daysCount", { count: flag.nextThreshold }),
  });
}

function IconSparkle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5c.3 3.2 1.2 5.4 2.8 7 1.6 1.6 3.8 2.5 7 2.8-3.2.3-5.4 1.2-7 2.8-1.6 1.6-2.5 3.8-2.8 7-.3-3.2-1.2-5.4-2.8-7-1.6-1.6-3.8-2.5-7-2.8 3.2-.3 5.4-1.2 7-2.8 1.6-1.6 2.5-3.8 2.8-7Z" />
    </svg>
  );
}

function AIInsightStrip({
  flags,
  hotels,
}: {
  flags: AIFlag[];
  hotels: Record<number, string>;
}) {
  const { t } = useTranslation("reservations");
  const [expanded, setExpanded] = useState(false);

  if (flags.length === 0) return null;

  const first = flags[0];
  const firstHotelName = hotels[first.booking.hotel_id] ?? `#${first.booking.hotel_id}`;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-ink px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold">
          <IconSparkle className="w-4 h-4" />
        </span>
        <div className="text-sm leading-relaxed text-white/90">
          <p>
            <span className="font-medium text-white">{t("aiInsightStrip.aiNoticed")}</span>{" "}
            {flagText(t, first, firstHotelName)}
            {flags.length > 1 && (
              <span className="text-white/60"> {t("aiInsightStrip.andMore", { count: flags.length - 1 })}</span>
            )}
          </p>
          {expanded && flags.length > 1 && (
            <ul className="mt-2 space-y-1 text-white/70">
              {flags.slice(1).map((f, i) => (
                <li key={i}>— {flagText(t, f, hotels[f.booking.hotel_id] ?? `#${f.booking.hotel_id}`)}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-white/40">{t("aiInsightStrip.ruleBasedDisclaimer")}</p>
        </div>
      </div>
      {flags.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 self-start rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 sm:self-auto"
        >
          {expanded ? t("aiInsightStrip.collapse") : t("aiInsightStrip.viewDetails")}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guest edit — PUT /booking-engine/guests/{id}, a separate entity/endpoint
// from Booking itself (flight numbers, a Booking field, are edited via
// FlightNumbersEdit below instead — kept visually nearby, not merged).
// ---------------------------------------------------------------------------

function GuestRow({
  guest,
  onUpdated,
  canEdit,
}: {
  guest: Guest;
  onUpdated: (updated: Guest) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(guest.first_name);
  const [lastName, setLastName] = useState(guest.last_name);
  const [nationality, setNationality] = useState(guest.nationality ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(guest.date_of_birth ?? "");
  const [passportNumber, setPassportNumber] = useState(guest.passport_number ?? "");
  const [passportExpiry, setPassportExpiry] = useState(guest.passport_expiry ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decision 150: the guest's own flight is editable here too, not only at
  // application time -- a traveller switching to a different flight after
  // the booking exists is the normal case, and until this the only way to
  // record it was a direct API call.
  const [ownFlight, setOwnFlight] = useState(hasOwnFlight(guest));
  const [arrFlightNo, setArrFlightNo] = useState(guest.arrival_flight_number ?? "");
  const [arrFlightDate, setArrFlightDate] = useState(guest.arrival_flight_date ?? "");
  const [arrFlightTime, setArrFlightTime] = useState(guest.arrival_flight_time ?? "");
  const [depFlightNo, setDepFlightNo] = useState(guest.departure_flight_number ?? "");
  const [depFlightDate, setDepFlightDate] = useState(guest.departure_flight_date ?? "");
  const [depFlightTime, setDepFlightTime] = useState(guest.departure_flight_time ?? "");

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError(t("guestRow.nameRequired"));
      return;
    }
    const token = localStorage.getItem("token") || "";
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<Guest>(`/booking-engine/guests/${guest.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nationality: nationality.trim() || null,
          date_of_birth: dateOfBirth || null,
          passport_number: passportNumber.trim() || null,
          passport_expiry: passportExpiry || null,
          // Decision 150. Sent explicitly in BOTH directions: turning the
          // toggle off has to clear the columns, and the endpoint's
          // exclude_unset means omitting them would leave a removed flight
          // silently in place.
          arrival_flight_number: ownFlight ? arrFlightNo.trim() || null : null,
          arrival_flight_date: ownFlight ? arrFlightDate || null : null,
          arrival_flight_time: ownFlight ? arrFlightTime || null : null,
          departure_flight_number: ownFlight ? depFlightNo.trim() || null : null,
          departure_flight_date: ownFlight ? depFlightDate || null : null,
          departure_flight_time: ownFlight ? depFlightTime || null : null,
        }),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || t("guestRow.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    // Enterprise-workspace redesign: one card per guest instead of a single
    // dense line. The passport/nationality/date-of-birth fields were always
    // editable here but only ever displayed when already filled, so a guest
    // missing exactly the data a hotel needs looked identical to a complete
    // one. They are now always shown, with an explicit "not provided" -- the
    // same gap Booking Health reports above.
    const missing = <span className="text-slate/35">{t("guestRow.notProvided")}</span>;
    return (
      <li className="rounded-xl border border-ink/10 bg-sand/20 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              {guest.first_name} {guest.last_name}
              {guest.is_lead_guest && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold-deep">
                  {t("guestRow.leadGuest")}
                </span>
              )}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
            >
              {t("guestRow.edit")}
            </button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{t("guestRow.passportLabel")}</p>
            <p className="text-sm font-medium text-ink">{guest.passport_number || missing}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{t("guestRow.nationalityLabel")}</p>
            <p className="text-sm font-medium text-ink">{guest.nationality || missing}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{t("guestRow.birthDateLabel")}</p>
            <p className="text-sm font-medium text-ink">{guest.date_of_birth ? formatDate(guest.date_of_birth) : missing}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{t("guestRow.passportExpiryLabel")}</p>
            <p className="text-sm font-medium text-ink">{guest.passport_expiry ? formatDate(guest.passport_expiry) : missing}</p>
          </div>
        </div>
        {/* Decision 150: shown only for a guest who actually flies
            separately. A guest on the common flight gets nothing here
            rather than a repeat of the booking's own flight, which would
            make every guest card look like an individual arrangement. */}
        {hasOwnFlight(guest) && (
          <div className="mt-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gold-deep">
              {t("guestRow.ownFlightLabel")}
            </p>
            <p className="mt-0.5 text-xs text-ink">
              {t("guestRow.ownFlightArrival")}:{" "}
              <span className="font-mono font-semibold">{guest.arrival_flight_number || "—"}</span>
              {guest.arrival_flight_date ? ` · ${formatDate(guest.arrival_flight_date)}` : ""}
              {guest.arrival_flight_time ? ` · ${guest.arrival_flight_time}` : ""}
            </p>
            <p className="text-sm font-medium text-ink">
              {t("guestRow.ownFlightDeparture")}:{" "}
              <span className="font-mono font-semibold">{guest.departure_flight_number || "—"}</span>
              {guest.departure_flight_date ? ` · ${formatDate(guest.departure_flight_date)}` : ""}
              {guest.departure_flight_time ? ` · ${guest.departure_flight_time}` : ""}
            </p>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t("guestRow.firstNamePlaceholder")}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
        <input
          placeholder={t("guestRow.lastNamePlaceholder")}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
        <input
          placeholder={t("guestRow.nationalityPlaceholder")}
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-gold focus:outline-none"
        />
        <input
          placeholder={t("guestRow.passportNumberPlaceholder")}
          value={passportNumber}
          onChange={(e) => setPassportNumber(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
        <input
          type="date"
          value={passportExpiry}
          onChange={(e) => setPassportExpiry(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-gold focus:outline-none"
        />
      </div>

      {/* Own flight (Decision 150). A plain button rather than a checkbox --
          this project's legacy stylesheet stretches every native
          radio/checkbox (see CLAUDE.md's Known issues). */}
      <div className="rounded-lg border border-ink/10 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink">{t("guestRow.ownFlightSection")}</span>
          <button
            type="button"
            onClick={() => setOwnFlight((v) => !v)}
            aria-pressed={ownFlight}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              ownFlight
                ? "border-gold-deep bg-gold-deep text-white hover:bg-gold-deep/90"
                : "border-ink/15 bg-white text-slate hover:border-ink/40 hover:text-ink"
            }`}
          >
            {ownFlight ? t("guestRow.ownFlightOn") : t("guestRow.ownFlightOff")}
          </button>
        </div>
        {ownFlight ? (
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              placeholder={t("guestRow.arrivalFlightPlaceholder")}
              value={arrFlightNo}
              onChange={(e) => setArrFlightNo(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
            />
            <input
              type="date"
              aria-label={t("guestRow.arrivalFlightPlaceholder")}
              value={arrFlightDate}
              onChange={(e) => setArrFlightDate(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-gold focus:outline-none"
            />
            {/* 24-hour text, not type="time" -- see HotelSearch.tsx's
                TimeField comment: the native control renders in the
                browser's locale and yields nothing until an AM/PM segment
                is picked, while the column itself stores plain "08:45". */}
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder={t("guestRow.timePlaceholder")}
              aria-label={t("guestRow.arrivalFlightPlaceholder")}
              value={arrFlightTime}
              onChange={(e) => setArrFlightTime(formatTimeInput(e.target.value))}
              className={`rounded-lg border bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:outline-none ${
                arrFlightTime.length === 5 && !isValidTimeValue(arrFlightTime)
                  ? "border-danger focus:border-danger"
                  : "border-ink/15 focus:border-gold"
              }`}
            />
            <input
              placeholder={t("guestRow.departureFlightPlaceholder")}
              value={depFlightNo}
              onChange={(e) => setDepFlightNo(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
            />
            <input
              type="date"
              aria-label={t("guestRow.departureFlightPlaceholder")}
              value={depFlightDate}
              onChange={(e) => setDepFlightDate(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-gold focus:outline-none"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder={t("guestRow.timePlaceholder")}
              aria-label={t("guestRow.departureFlightPlaceholder")}
              value={depFlightTime}
              onChange={(e) => setDepFlightTime(formatTimeInput(e.target.value))}
              className={`rounded-lg border bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:outline-none ${
                depFlightTime.length === 5 && !isValidTimeValue(depFlightTime)
                  ? "border-danger focus:border-danger"
                  : "border-ink/15 focus:border-gold"
              }`}
            />
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate/55">{t("guestRow.ownFlightOffHint")}</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("guestRow.saving") : t("guestRow.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("guestRow.cancel")}
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Flight-number edit — a Booking field (PUT /booking-engine/bookings/{id}),
// deliberately a separate entity/endpoint from Guest — placed visually near
// the guest section per project owner's preference, not merged with it.
// ---------------------------------------------------------------------------

function FlightNumbersEdit({
  booking,
  onUpdated,
  canEdit,
}: {
  booking: Booking;
  onUpdated: (updated: Booking) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [arrivalFlight, setArrivalFlight] = useState(booking.arrival_flight_number ?? "");
  const [departureFlight, setDepartureFlight] = useState(booking.departure_flight_number ?? "");
  const [arrivalFlightDate, setArrivalFlightDate] = useState(booking.arrival_flight_date ?? "");
  const [arrivalFlightTime, setArrivalFlightTime] = useState(booking.arrival_flight_time ?? "");
  const [departureFlightDate, setDepartureFlightDate] = useState(booking.departure_flight_date ?? "");
  const [departureFlightTime, setDepartureFlightTime] = useState(booking.departure_flight_time ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const token = localStorage.getItem("token") || "";
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          arrival_flight_number: arrivalFlight.trim() || null,
          departure_flight_number: departureFlight.trim() || null,
          arrival_flight_date: arrivalFlightDate || null,
          arrival_flight_time: arrivalFlightTime || null,
          departure_flight_date: departureFlightDate || null,
          departure_flight_time: departureFlightTime || null,
        }),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || t("flightNumbersEdit.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canEdit) return null;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
      >
        {t("flightNumbersEdit.editFlights")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t("flightNumbersEdit.arrivalFlightNumberPlaceholder")}
          value={arrivalFlight}
          onChange={(e) => setArrivalFlight(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
        <input
          placeholder={t("flightNumbersEdit.departureFlightNumberPlaceholder")}
          value={departureFlight}
          onChange={(e) => setDepartureFlight(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title={t("flightNumbersEdit.arrivalFlightDateTitle")}
            value={arrivalFlightDate}
            onChange={(e) => setArrivalFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-gold focus:outline-none"
          />
          {/* Same 24-hour text field as everywhere else this project enters
              a flight time -- leaving this one native would have made the
              identical value editable in two different formats. */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder={t("flightNumbersEdit.timePlaceholder")}
            title={t("flightNumbersEdit.arrivalFlightTimeTitle")}
            value={arrivalFlightTime}
            onChange={(e) => setArrivalFlightTime(formatTimeInput(e.target.value))}
            className={`rounded-lg border bg-white px-2 py-2 text-sm text-slate placeholder:text-slate/40 focus:outline-none ${
              arrivalFlightTime.length === 5 && !isValidTimeValue(arrivalFlightTime)
                ? "border-danger focus:border-danger"
                : "border-ink/15 focus:border-gold"
            }`}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title={t("flightNumbersEdit.departureFlightDateTitle")}
            value={departureFlightDate}
            onChange={(e) => setDepartureFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-gold focus:outline-none"
          />
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder={t("flightNumbersEdit.timePlaceholder")}
            title={t("flightNumbersEdit.departureFlightTimeTitle")}
            value={departureFlightTime}
            onChange={(e) => setDepartureFlightTime(formatTimeInput(e.target.value))}
            className={`rounded-lg border bg-white px-2 py-2 text-sm text-slate placeholder:text-slate/40 focus:outline-none ${
              departureFlightTime.length === 5 && !isValidTimeValue(departureFlightTime)
                ? "border-danger focus:border-danger"
                : "border-ink/15 focus:border-gold"
            }`}
          />
        </div>
      </div>
      <p className="text-[11px] text-slate/50">{t("flightNumbersEdit.flightDateTimeHint")}</p>
      {error && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("flightNumbersEdit.saving") : t("flightNumbersEdit.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("flightNumbersEdit.cancel")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation-number edit (Decision 097) — the hotel's own reference
// number, entered by a manager once received (typically after sending
// the LPO and getting a hotel reply). Saving a new, non-empty value
// best-effort fires Finance Engine's Voucher auto-generation-and-send
// (POST /finance-engine/bookings/{id}/voucher) -- same frontend
// orchestration pattern as Decision 080's claim-auto-invoice and
// Decision 083's date-change-flag, avoiding any change to LOCKED
// Booking Engine. Only fires for an actually-new value, not a resave of
// the same one (would otherwise spam a fresh voucher email on every
// unrelated edit-and-resave).
// ---------------------------------------------------------------------------

function ConfirmationNumberEdit({
  booking,
  onUpdated,
  canEdit,
}: {
  booking: Booking;
  onUpdated: (updated: Booking) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(booking.confirmation_number ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const token = localStorage.getItem("token") || "";
    const trimmed = value.trim() || null;
    const previous = booking.confirmation_number;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ confirmation_number: trimmed }),
      });
      onUpdated(updated);
      setEditing(false);
      if (trimmed && trimmed !== previous) {
        fetchJson(`/finance-engine/bookings/${booking.id}/voucher`, token, { method: "POST" }).catch(() => {
          // Best-effort -- nothing to recover here even if this fails.
        });
      }
    } catch (err: any) {
      setError(err.message || t("confirmationNumberEdit.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // Whoever can't edit used to get nothing at all here -- so an agent never
  // saw their own booking's hotel reference number even once the hotel had
  // confirmed it, while the section heading still rendered above the empty
  // space. Read-only display when there is a real number; the parent drops
  // the heading when there is neither a number nor the right to add one.
  if (!canEdit) {
    return booking.confirmation_number ? (
      <span className="font-mono text-sm font-semibold text-ink">booking.confirmation_number</span>
    ) : null;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
      >
        {booking.confirmation_number
          ? t("confirmationNumberEdit.editNumber")
          : t("confirmationNumberEdit.addNumber")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <input
        placeholder={t("confirmationNumberEdit.numberPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
      />
      {value.trim() && value.trim() !== (booking.confirmation_number ?? "") && (
        <p className="text-[11px] text-slate/50">{t("confirmationNumberEdit.voucherHint")}</p>
      )}
      {error && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("confirmationNumberEdit.saving") : t("confirmationNumberEdit.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("confirmationNumberEdit.cancel")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-room confirmation-number edit (real bug fix, reported live on
// BK-000066: a 2-room application only ever had ONE confirmation_number
// field -- the whole-booking one above -- so entering the hotel's
// reference for room 1 silently "confirmed" room 2 with the exact same
// number too, even when the hotel sent two separate references. The
// backend has supported a genuinely separate confirmation_number per
// BookingRoom since Decision 097's own Stage 4 (PUT /rooms/{id}, see
// BookingRoomUpdate's docstring) -- this was simply never wired into the
// UI. Same shape as ConfirmationNumberEdit above, but scoped to one room
// and best-effort-triggering the already-built PER-ROOM voucher endpoint
// instead of the whole-booking one.
// ---------------------------------------------------------------------------

function RoomConfirmationNumberEdit({
  room,
  onUpdated,
  canEdit,
}: {
  room: BookingRoom;
  onUpdated: (updated: BookingRoom) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(room.confirmation_number ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const token = localStorage.getItem("token") || "";
    const trimmed = value.trim() || null;
    const previous = room.confirmation_number;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<BookingRoom>(`/booking-engine/rooms/${room.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ confirmation_number: trimmed }),
      });
      onUpdated(updated);
      setEditing(false);
      if (trimmed && trimmed !== previous) {
        fetchJson(`/finance-engine/rooms/${room.id}/voucher`, token, { method: "POST" }).catch(() => {
          // Best-effort -- nothing to recover here even if this fails.
        });
      }
    } catch (err: any) {
      setError(err.message || t("confirmationNumberEdit.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // Whoever can't edit used to get nothing at all here -- so an agent never
  // saw their own booking's hotel reference number even once the hotel had
  // confirmed it, while the section heading still rendered above the empty
  // space. Read-only display when there is a real number; the parent drops
  // the heading when there is neither a number nor the right to add one.
  if (!canEdit) {
    return room.confirmation_number ? (
      <span className="font-mono text-sm font-semibold text-ink">{room.confirmation_number}</span>
    ) : null;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
      >
        {room.confirmation_number
          ? t("confirmationNumberEdit.editNumber")
          : t("confirmationNumberEdit.addNumber")}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3" onClick={(e) => e.stopPropagation()}>
      <input
        placeholder={t("confirmationNumberEdit.numberPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
      />
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("confirmationNumberEdit.saving") : t("confirmationNumberEdit.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("confirmationNumberEdit.cancel")}
        </button>
      </div>
    </div>
  );
}

// Decision 199: change a room's transfer after the booking exists, without
// cancelling anything. Lives in this shared file, NOT in
// AdminBookingFinance.tsx's admin-only extensions, because the project owner
// asked explicitly for the agent to make this change themselves from the agent
// panel; the backend accepts it from an admin or the booking's own agent.
//
// The option list comes from the endpoint that already filters by this room's
// party size (Decisions 197/198), so a car the change itself would refuse is
// never offered here in the first place.
type RoomTransferOption = {
  transfer_type: string;
  transfer_name: string | null;
  pricing_basis: string;
  price_per_vehicle: number | null;
  max_passengers: number | null;
  max_adults: number | null;
};

function RoomTransferEdit({
  room,
  currentName,
  onUpdated,
  canEdit,
}: {
  room: BookingRoom;
  currentName: string | null;
  onUpdated: (updated: BookingRoom) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<RoomTransferOption[] | null>(null);
  // "" is the explicit "no transfer" choice, distinct from "nothing picked
  // yet" -- removing a transfer is a real decision (Decision 196), so it has
  // to be selectable, not merely reachable by never choosing anything.
  const [choice, setChoice] = useState<string>(room.transfer_type ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openEditor() {
    setEditing(true);
    setError(null);
    setChoice(room.transfer_type ?? "");
    setReason("");
    if (options !== null) return;
    const token = localStorage.getItem("token") || "";
    try {
      setOptions(
        await fetchJson<RoomTransferOption[]>(`/booking-engine/rooms/${room.id}/transfer-options`, token)
      );
    } catch (err: any) {
      setError(err.message || t("transferEdit.loadFailed"));
      setOptions([]);
    }
  }

  async function handleSave() {
    if (!reason.trim()) {
      setError(t("transferEdit.reasonRequired"));
      return;
    }
    const token = localStorage.getItem("token") || "";
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<BookingRoom>(`/booking-engine/rooms/${room.id}/transfer`, token, {
        method: "PUT",
        body: JSON.stringify({
          new_transfer_type: choice === "" ? null : choice,
          reason: reason.trim(),
        }),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || t("transferEdit.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function optionLabel(o: RoomTransferOption): string {
    const name = o.transfer_name ?? o.transfer_type;
    if (o.pricing_basis !== "per_vehicle" || o.price_per_vehicle === null) return name;
    return `${name} — ${room.currency ?? ""} ${o.price_per_vehicle.toLocaleString()}`;
  }

  if (!editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
        <span className="text-slate/50">{t("transferEdit.label")}</span>
        <span className="font-medium text-ink">{currentName ?? t("transferEdit.none")}</span>
        {room.transfer_total != null && (
          <span className="font-mono text-slate/60">
            {room.currency} {room.transfer_total.toLocaleString()}
          </span>
        )}
        {/* Shown to everyone who can see the room, not only to whoever may
            edit it: a transfer changed months after booking is exactly the
            kind of thing the next person needs to notice. */}
        {room.transfer_changed_at && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
            {t("transferEdit.changedOn", { date: formatDate(room.transfer_changed_at) })}
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={openEditor}
            className="rounded border border-ink/15 bg-white px-2 py-0.5 text-[11px] font-medium text-ink/70 hover:bg-sand"
          >
            {t("transferEdit.change")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="mt-2 w-full space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-medium text-ink">{t("transferEdit.title")}</p>
      {options === null ? (
        <p className="text-xs text-slate/50">{t("transferEdit.loading")}</p>
      ) : (
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-gold focus:outline-none"
        >
          <option value="">{t("transferEdit.none")}</option>
          {options.map((o) => (
            <option key={o.transfer_type} value={o.transfer_type}>
              {optionLabel(o)}
            </option>
          ))}
        </select>
      )}
      <input
        placeholder={t("transferEdit.reasonPlaceholder")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
      />
      <p className="text-[11px] leading-relaxed text-slate/50">{t("transferEdit.notice")}</p>
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || options === null}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("transferEdit.saving") : t("transferEdit.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("transferEdit.cancel")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancellation confirmation edit (Decision 104) — stage 2 of the two-step
// cancellation workflow. Mirrors ConfirmationNumberEdit above exactly
// (same admin-only gate, same inline edit-and-save shape), but for the
// hotel's acknowledgment of a CANCELLATION rather than the original
// booking. Only rendered while status === "Cancellation Requested" (by
// the caller); saving calls the dedicated confirm-cancellation endpoint,
// which is what actually releases the allotment — never PUT
// /bookings/{id}, which cannot touch this field at all. Unlike
// confirmation_number, the value is mandatory (no "clear it" flow) since
// there's no valid "Cancelled" state without it.
// ---------------------------------------------------------------------------

function CancellationConfirmationEdit({
  booking,
  onUpdated,
}: {
  booking: Booking;
  onUpdated: (updated: Booking) => void;
}) {
  const { t } = useTranslation("reservations");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t("cancellationConfirmationEdit.numberRequired"));
      return;
    }
    const token = localStorage.getItem("token") || "";
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<Booking>(
        `/booking-engine/bookings/${booking.id}/confirm-cancellation`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ cancellation_confirmation_number: trimmed }),
        }
      );
      onUpdated(updated);
      setEditing(false);

      // Best-effort, no request body -- the note is built server-side
      // from booking.cancellation_confirmation_number.
      fetchJson(`/finance-engine/bookings/${booking.id}/flag-cancellation-confirmed`, token, {
        method: "POST",
      }).catch(() => {
        // Best-effort -- nothing to recover here even if this fails.
      });
    } catch (err: any) {
      setError(err.message || t("cancellationConfirmationEdit.confirmFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-warning/30 bg-white px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
      >
        {t("cancellationConfirmationEdit.confirmWithHotel")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
      <input
        placeholder={t("cancellationConfirmationEdit.numberPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
      />
      <p className="text-[11px] text-slate/50">{t("cancellationConfirmationEdit.hint")}</p>
      {error && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("cancellationConfirmationEdit.saving") : t("cancellationConfirmationEdit.save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("cancellationConfirmationEdit.cancel")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents — Voucher/Invoice download (Decision 102). Visible to both
// admin and the owning agent (document access/ownership, not the
// Cost/Profit boundary), each gated independently: Voucher requires a
// confirmation_number (hotel has confirmed), Invoice requires the
// backend's own /invoice/status to report "Issued" (approved and sent
// by accounting) -- fetched via a status-only endpoint deliberately, so
// no financial figures ever reach the agent's browser even unrendered.
// Both show "В работе" until ready, matching the existing
// Draft-invisibility principle already established for invoices.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enterprise-workspace redesign — shared building blocks for the booking
// detail view.
//
// Scope note, deliberate: this whole layer is presentation only. It adds no
// backend endpoint, no schema field and no business rule -- every figure,
// state and event below is derived from data the detail view already had, or
// from a GET endpoint that already existed and is already reachable by both
// roles. Where the data genuinely does not exist (see BookingHistory and
// HotelHeroMedia), that is stated in the UI rather than invented.
// ---------------------------------------------------------------------------

interface HotelProfile {
  id: number;
  hotel_name: string;
  country: string;
  city: string;
  island: string | null;
  star_rating: number | null;
  checkin_time: string | null;
  checkout_time: string | null;
}

interface HotelImage {
  id: number;
  image_path: string;
  image_title: string | null;
  image_type: string | null;
  display_order: number | null;
}

// GET /hotel-engine/hotels/{id} and .../images -- both pre-existing,
// auth-only (no admin gate), so the agent view can call them exactly as the
// admin one does. Failures are swallowed on purpose: the hero already has a
// usable hotel name from the list's own lookup map, so a profile/image miss
// degrades the header instead of erroring the whole booking.
function useHotelProfile(hotelId: number) {
  const [profile, setProfile] = useState<HotelProfile | null>(null);
  const [image, setImage] = useState<HotelImage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("token") || "";
    setProfile(null);
    setImage(null);
    fetchJson<HotelProfile>(`/hotel-engine/hotels/${hotelId}`, token)
      .then((h) => {
        if (!cancelled) setProfile(h);
      })
      .catch(() => {
        /* header falls back to the name the list already resolved */
      });
    fetchJson<HotelImage[]>(`/hotel-engine/hotels/${hotelId}/images`, token)
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const sorted = [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        setImage(sorted[0]);
      })
      .catch(() => {
        /* no image -> typographic placeholder, see HotelHeroMedia */
      });
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  return { profile, image };
}

// Documents state, lifted out of the old DocumentsSection so the three
// surfaces that all need the same answer -- the documents cards, the
// timeline, and Booking Health -- share ONE fetch and can never disagree
// about whether an invoice is issued. Quick Actions reuses `download` too,
// rather than duplicating the blob/Content-Disposition dance.
function useBookingDocuments(booking: Booking, rooms: BookingRoom[] | null) {
  const { t } = useTranslation("reservations");
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    const token = localStorage.getItem("token") || "";
    fetchJson<{ status: string | null }>(`/finance-engine/bookings/${booking.id}/invoice/status`, token)
      .then((r) => {
        if (!cancelled) setInvoiceStatus(r.status);
      })
      .catch(() => {
        if (!cancelled) setInvoiceStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  async function download(kind: "voucher" | "invoice") {
    setDownloadError(null);
    const token = localStorage.getItem("token") || "";
    const path =
      kind === "voucher"
        ? `/finance-engine/bookings/${booking.id}/voucher/download`
        : `/finance-engine/bookings/${booking.id}/invoice/download`;
    try {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        let detail = t("errors.requestError", { status: response.status });
        try {
          const body = await response.json();
          detail = formatApiDetail(body?.detail, detail);
        } catch {
          // response body wasn't JSON -- keep the generic message
        }
        throw new Error(detail);
      }
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${kind}.txt`;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err.message || t("documentsSection.downloadFailed"));
    }
  }

  return {
    invoiceStatus,
    statusLoading,
    // A voucher exists once the hotel's reference is recorded -- which for a
    // multi-room application has ALWAYS been per room, never on the booking.
    // This read only the booking column, so a fully-confirmed 2-room booking
    // reported "voucher pending" forever. Latent until now (single-room
    // bookings did set the booking column); moving single-room entry into
    // the room card would have spread that bug to every booking, so it is
    // fixed here rather than inherited. Both sources count, so any booking
    // that already has a booking-level number is unaffected.
    voucherReady:
      Boolean(booking.confirmation_number) ||
      Boolean(rooms && rooms.length > 0 && rooms.every((r) => Boolean(r.confirmation_number))),
    invoiceReady: invoiceStatus === "Issued",
    download,
    downloadError,
  };
}

export type BookingDocuments = ReturnType<typeof useBookingDocuments>;

// ---------------------------------------------------------------------------
// One card shell, one heading treatment. Every panel in the workspace is
// built from this so the three columns read as one surface rather than a
// stack of independently-styled boxes.
// ---------------------------------------------------------------------------

// Decision 156B: SectionCard learned to collapse, rather than a separate
// accordion component being wrapped around every card.
//
// Deliberate: wrapping would have meant inserting a matching open/close pair
// around each of ~8 regions of dense conditional JSX. Teaching the card that
// already surrounds every one of them means each call site changes by adding
// props to a tag that is already there -- no nesting is touched, so nothing
// can be mis-paired.
//
// A card is only collapsible when `sectionKey` is given; every other caller
// (and the agent screen) renders exactly as before.
// The "!" on a section header. Same hover/focus mechanics as ActionInfo (see
// its comment for why a real <button> with stopPropagation), but it lists
// several concrete statements rather than explaining one control -- and it
// sits on a row that is itself a toggle, so swallowing the click matters
// more here: without it, reading what is outstanding would collapse or
// expand the very section being read.
function SectionIssueMarker({ issues }: { issues: string[] }) {
  const { t } = useTranslation("reservations");
  return (
    <span className="group/issue relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={issues.join("; ")}
        onClick={(e) => e.stopPropagation()}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-warning/60 bg-warning/10 text-[10px] font-bold leading-none text-warning transition-colors hover:bg-warning/20"
      >
        !
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden w-72 -translate-x-1/2 rounded-lg border border-ink/15 bg-white p-2.5 text-left text-xs font-normal leading-snug text-slate/70 shadow-lg group-focus-within/issue:block group-hover/issue:block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate/50">
          {t("sectionIssues.heading")}
        </span>
        {issues.map((issue, i) => (
          <span key={i} className="block">
            · {issue}
          </span>
        ))}
      </span>
    </span>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = "",
  id,
  sectionKey,
  openSection,
  onToggleSection,
  summary,
  number,
  issues,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  sectionKey?: string;
  openSection?: string | null;
  onToggleSection?: (key: string) => void;
  // One line shown while collapsed, so reading a single figure never costs
  // a click -- the point of the whole change.
  summary?: ReactNode;
  // Decision 183: an explicit number, for callers outside the booking
  // detail. sectionNumber() reads SECTION_ORDER, which is that screen's own
  // sequence -- an invoice's sections are not in it and would all render a
  // blank circle. Booking-detail callers keep passing nothing and keep
  // getting their own numbering.
  number?: number;
  // What is actually outstanding in this section, one concrete statement per
  // entry. Sections no longer open themselves (Booking Health already lists
  // the gaps), so this "!" is how a closed row still says it has something
  // in it. Owner's rule, and it is the whole point: every entry must name
  // the thing -- "Afshona Daler: no passport number" -- never a summary like
  // "some details pending". An empty/absent array renders no marker at all.
  issues?: string[];
}) {
  const collapsible = Boolean(sectionKey && onToggleSection);
  const isOpen = !collapsible || openSection === sectionKey;

  if (!collapsible) {
    return (
      <Card id={id} padding={children ? "sm" : "none"} className={className}>
        {(title || action) && (
          // Decision 161: an action-only card (Hotel confirmation) now uses the
          // same compact strip as a collapsed section, so every row in the
          // column shares one height and one left edge instead of stepping in
          // and out.
          <div
            className={`flex items-center justify-between gap-2 ${children ? "min-h-[1.75rem] mb-3" : "px-3 py-2"}`}
          >
            {title ? (
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink/70">{title}</h4>
            ) : (
              <span />
            )}
            {action}
          </div>
        )}
        {children}
      </Card>
    );
  }

  return (
    // Decision 159: a COLLAPSED card is one clickable strip, edge to edge --
    // the owner was hitting the card's padding and nothing happened, because
    // only the title row itself was the target. Padding also drops (sm -> a
    // tight row) since a closed section was as tall as an open one for a
    // single line of text.
    <Card
      id={id}
      padding={isOpen ? "sm" : "none"}
      className={`${className} ${isOpen ? "" : "cursor-pointer transition-colors hover:bg-sand/40"}`}
      onClick={isOpen ? undefined : () => onToggleSection!(sectionKey!)}
    >
      <div className={`flex items-center gap-2 ${isOpen ? "min-h-[1.75rem]" : "px-3 py-2"}`}>
        {/* When open, only this row toggles -- an "Edit flights" button in the
            action slot must not collapse the section it belongs to. */}
        <button
          type="button"
          // stopPropagation matters: while collapsed the whole Card is also a
          // click target, so without it a click on the title would toggle
          // twice (button, then the bubbled Card handler) and the section
          // would appear not to open at all.
          onClick={(e) => {
            e.stopPropagation();
            onToggleSection!(sectionKey!);
          }}
          aria-expanded={isOpen}
          className="flex flex-1 appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left"
        >
          {/* Decision 162: a number, not just a chevron -- with the rows now
              sitting flush against each other, the digit is what gives the
              column a readable order at a glance. */}
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              isOpen ? "bg-ink text-white" : "bg-sand text-slate/70"
            }`}
            aria-hidden="true"
          >
            {number ?? sectionNumber(sectionKey) ?? ""}
          </span>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink/70">{title}</h4>
          {!isOpen && summary && (
            <span className="ml-auto truncate text-xs text-slate/60">{summary}</span>
          )}
        </button>
        {issues && issues.length > 0 && <SectionIssueMarker issues={issues} />}
        {isOpen && action}
      </div>
      {isOpen && <div className="mt-3">{children}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hero — the "passport" band. Media on the left, identity and the five
// figures an agent opens a booking to check on the right.
// ---------------------------------------------------------------------------

// No file-storage layer exists in this project (05_Architecture.md's
// S3-compatible storage is still aspirational) and main.py mounts no static
// route, so `hotel_images` is empty and an image_path could not be served
// even if a row existed. This renders the real image the moment one is
// reachable, and a deliberate typographic placeholder -- not a stock photo
// or a broken <img> -- until then.
function HotelHeroMedia({
  image,
  hotelName,
  starRating,
}: {
  image: HotelImage | null;
  hotelName: string;
  starRating: number | null;
}) {
  if (image) {
    return (
      <img
        src={image.image_path}
        alt={image.image_title ?? hotelName}
        className="h-full w-full object-cover"
      />
    );
  }
  const initials = hotelName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-ink via-ink to-gold-deep/70 text-center">
      <span className="font-display text-3xl font-semibold tracking-tight text-white/90">{initials}</span>
      {starRating ? (
        <span className="mt-1 text-xs tracking-[0.35em] text-gold/80">{"★".repeat(starRating)}</span>
      ) : null}
    </div>
  );
}

function HeroStat({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{label}</p>
      <p className={emphasis ? "mt-0.5 font-display text-xl font-semibold text-ink" : "mt-0.5 text-sm font-semibold text-ink"}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-slate/50">{hint}</p> : null}
    </div>
  );
}

// A small "!" that explains the button it sits beside. Owner: the Approve
// explanation must not be a banner above the room list -- it belongs next to
// the control it describes, revealed on hover.
//
// Deliberately local to this file rather than reaching for HotelSearch.tsx's
// InfoTooltip: that one is a plain hover card built for a form field, while
// these sit inside a clickable room row and must not open the room when
// pressed. Kept keyboard- and touch-reachable via a real <button> with
// focus-visible, not a hover-only <span>.
export function ActionInfo({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "danger" }) {
  const ring =
    tone === "danger"
      ? "border-danger/40 text-danger hover:bg-danger/10"
      : "border-ink/25 text-slate/70 hover:bg-sand";
  return (
    <span className="group/info relative inline-flex">
      <button
        type="button"
        aria-label={text}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none transition-colors ${ring}`}
      >
        !
      </button>
      <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 hidden w-72 rounded-lg border border-ink/15 bg-white p-2.5 text-left text-xs font-normal leading-snug text-slate/70 shadow-lg group-focus-within/info:block group-hover/info:block">
        {text}
      </span>
    </span>
  );
}

function BookingHero({
  booking,
  effectiveBooking,
  hotelName,
  roomTypeName,
  mealPlanLabel,
  agentName,
  agencyName,
  handlerName,
  roomTypeSummary,
  transferName,
  specialRequests,
  profile,
  image,
  statusExtra,
  onClose,
}: {
  booking: Booking;
  effectiveBooking: Booking;
  hotelName: string;
  roomTypeName: string;
  mealPlanLabel: string;
  agentName?: string;
  agencyName?: string;
  handlerName?: string;
  // Every room type in the application, resolved by the caller (which is
  // what holds the rooms). null while rooms are still loading.
  roomTypeSummary?: { value: string; hint?: string } | null;
  // The selected room's transfer, already resolved to the contract's own
  // name for it by the caller (which holds transferNames). null = this room
  // has no transfer, which is a real answer, not missing data.
  transferName?: string | null;
  // The one field the removed "Booking information" card carried that
  // nothing else did. Full width under the stats, not squeezed into the
  // grid: it is free text a guest wrote, not a one-line value.
  specialRequests?: string | null;
  profile: HotelProfile | null;
  image: HotelImage | null;
  statusExtra?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation("reservations");
  const location = profile ? [profile.city, profile.country].filter(Boolean).join(", ") : null;

  return (
    <Card padding="none" shadow="card" className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="h-32 md:h-full md:min-h-[11rem]">
          <HotelHeroMedia image={image} hotelName={hotelName} starRating={profile?.star_rating ?? null} />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-medium uppercase tracking-wide text-slate/50">
                  {booking.booking_number}
                </span>
                <StatusBadge status={booking.status} />
                {statusExtra}
              </div>
              <h3 className="mt-1 font-display text-2xl font-semibold leading-tight text-ink">{hotelName}</h3>
              {/* Room type and meal plan are labelled stats below now, so
                  the subtitle carries only what isn't repeated there. */}
              {location ? <p className="mt-0.5 text-sm text-slate/70">{location}</p> : null}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 appearance-none rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-slate/70 transition-colors hover:bg-sand/60"
            >
              {t("bookingDetail.close")}
            </button>
          </div>

          {/* 9 stats: 5+4 at lg and up, rather than 8-across leaving one
              stranded alone on a second row. */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink/10 pt-4 sm:grid-cols-3 lg:grid-cols-5">
            <HeroStat
              label={t("hero.checkIn")}
              value={formatDate(effectiveBooking.arrival_date)}
              hint={profile?.checkin_time ?? undefined}
            />
            <HeroStat
              label={t("hero.checkOut")}
              value={formatDate(effectiveBooking.departure_date)}
              hint={profile?.checkout_time ?? undefined}
            />
            <HeroStat label={t("hero.nights")} value={effectiveBooking.nights} />
            <HeroStat
              label={t("hero.guests")}
              value={effectiveBooking.adults + effectiveBooking.children + effectiveBooking.infants}
              hint={`${t("bookingDetail.adultsCount", { count: effectiveBooking.adults })} / ${t(
                "bookingDetail.childrenCount",
                { count: effectiveBooking.children }
              )} / ${t("bookingDetail.infantsCount", { count: effectiveBooking.infants })}`}
            />
            {/* Decision 159: the total was removed from here on the owner's
                instruction that every money figure lives in ONE place -- the
                commercial breakdown. The space it freed carries the booking
                facts a manager was otherwise opening a section to read. */}
            {/* Room type was only ever in the subtitle line above, which on a
                multi-room application shows the FIRST room's type as if it
                were the whole booking -- BK-000080 read "Sky Studio" while
                also containing a Beach Villa with Swirlpool. As a labelled
                stat it can say how many types there really are, with the
                full list on hover. */}
            <HeroStat
              label={t("hero.roomType")}
              value={roomTypeSummary?.value ?? roomTypeName}
              hint={roomTypeSummary?.hint}
            />
            <HeroStat label={t("bookingDetail.mealPlanLabel")} value={mealPlanLabel || "—"} />
            {/* Transfer belongs with the other facts a manager checks against
                the hotel's reply. It had been sitting only with the flight
                details, which is where it is arranged but not where it is
                verified. */}
            <HeroStat
              label={t("bookingDetail.transferTypeLabel")}
              value={transferName || t("bookingDetail.noTransfer")}
            />
            <HeroStat
              label={t("bookingDetail.agentLabel")}
              value={agentName || `#${booking.agent_id}`}
              hint={agencyName ?? undefined}
            />
            <HeroStat
              label={t("bookingDetail.handledByLabel")}
              value={handlerName || t("bookingDetail.notClaimedYet")}
            />
            <HeroStat
              label={t("bookingDetail.bookingDateLabel")}
              value={formatDate(booking.created_at)}
            />
          </div>

          {specialRequests && (
            <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">
                {t("bookingDetail.specialRequestsLabel")}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{specialRequests}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline — where this booking is in the real workflow.
//
// Every step below maps onto a fact this system actually stores. Notably
// absent: a "Waiting Hotel" step. That status exists in the schema's Literal
// but NO code path ever sets it (verified against booking/service.py and
// against the live table, whose only values are Pending/Confirmed/Cancelled)
// -- so "waiting on the hotel" is shown the honest way, as the confirmation
// step not being reached yet, rather than as a stage that never happens.
// ---------------------------------------------------------------------------

// Decision 155: "skipped" = this stage IS done, but an earlier one is not --
// work that happened out of order, which is a signal, not a quiet success.
type StepState = "done" | "current" | "upcoming" | "alert" | "skipped";

interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
}

function buildTimeline(
  t: TFunction,
  booking: Booking,
  rooms: BookingRoom[] | null,
  docs: { voucherReady: boolean; invoiceReady: boolean }
): TimelineStep[] {
  const status = booking.status;

  // Cancellation/rejection is a separate track, not a later stage of the
  // normal one: a cancelled booking never reaches Confirmed or Completed, so
  // rendering those as merely "upcoming" underneath would misdescribe it.
  if (status === "Rejected") {
    return [
      { key: "created", label: t("timeline.created"), state: "done" },
      { key: "rejected", label: t("timeline.rejected"), state: "alert" },
    ];
  }
  if (status === "Cancellation Requested" || status === "Cancelled") {
    return [
      { key: "created", label: t("timeline.created"), state: "done" },
      {
        key: "cancellationRequested",
        label: t("timeline.cancellationRequested"),
        state: status === "Cancelled" ? "done" : "current",
      },
      {
        key: "cancelled",
        label: t("timeline.cancelled"),
        state: status === "Cancelled" ? "alert" : "upcoming",
      },
    ];
  }

  const hotelConfirmed =
    Boolean(booking.confirmation_number) ||
    Boolean(rooms && rooms.length > 0 && rooms.every((r) => Boolean(r.confirmation_number))) ||
    status === "Confirmed" ||
    status === "Completed";

  const done: Record<string, boolean> = {
    created: true,
    claimed: booking.claimed_by !== null,
    approved: Boolean(rooms && rooms.length > 0 && rooms.every((r) => r.status !== "Pending")),
    confirmed: hotelConfirmed,
    voucher: docs.voucherReady,
    invoice: docs.invoiceReady,
    completed: status === "Completed",
  };
  const order = ["created", "claimed", "approved", "confirmed", "voucher", "invoice", "completed"];

  // Decision 155: every step now shows ITS OWN state.
  //
  // This used to be a strict queue -- first not-done step = current,
  // everything after it "upcoming" regardless of its own flag -- on the
  // reasoning that a filled dot after an empty one reads as a completed
  // stage. In practice that hid real work and produced the contradiction
  // reported on BK-000077: the hotel had confirmed and the voucher was
  // ready, but because nobody had claimed the booking (step 2), those two
  // finished stages rendered grey while the header badge said "Confirmed".
  // Three parts of one screen disagreeing, all technically correct.
  //
  // A step that is done while an EARLIER one isn't is not simply "done" --
  // it happened out of order, which is a real signal (a confirmation
  // number typed by someone who never took the booking on), so it gets its
  // own amber "skipped" state instead of a quiet green tick.
  const firstPendingIndex = order.findIndex((key) => !done[key]);
  return order.map((key, index) => {
    if (!done[key]) {
      return {
        key,
        label: t(`timeline.${key}`),
        // The earliest incomplete step is the one to act on; later
        // incomplete ones are simply ahead.
        state: (index === firstPendingIndex ? "current" : "upcoming") as StepState,
      };
    }
    const outOfOrder = firstPendingIndex !== -1 && index > firstPendingIndex;
    return {
      key,
      label: t(`timeline.${key}`),
      state: (outOfOrder ? "skipped" : "done") as StepState,
    };
  });
}

const STEP_DOT_CLASSES: Record<StepState, string> = {
  done: "bg-success text-white",
  current: "bg-gold text-white ring-4 ring-gold/20",
  upcoming: "bg-ink/10 text-slate/50",
  alert: "bg-cancelled text-white",
  // Done, but reached before an earlier stage was — amber, so it reads as
  // "this happened, and that is worth a look", not as a clean tick.
  skipped: "bg-warning text-white",
};

const STEP_LABEL_CLASSES: Record<StepState, string> = {
  done: "text-slate/70",
  current: "text-ink font-semibold",
  upcoming: "text-slate/40",
  alert: "text-cancelled font-semibold",
  skipped: "text-warning font-medium",
};

// Decision 155: ONE sentence answering "what state is this application in",
// derived from the same steps the strip draws — so the header, the strip and
// Booking Health cannot disagree the way they did on BK-000077 (badge
// "Confirmed", strip pointing at step 2, health listing the hotel as
// confirmed with the voucher ready).
//
// Deliberately built from the STEPS, not from booking.status: the status
// column says what someone set, the steps say what has actually happened.
function summariseProgress(t: TFunction, steps: TimelineStep[]): {
  headline: string;
  missing: string[];
  outOfOrder: string[];
} {
  const alert = steps.find((s) => s.state === "alert");
  if (alert) {
    return { headline: alert.label, missing: [], outOfOrder: [] };
  }
  const missing = steps.filter((s) => s.state === "current" || s.state === "upcoming");
  const outOfOrder = steps.filter((s) => s.state === "skipped").map((s) => s.label);
  if (missing.length === 0) {
    return { headline: t("timeline.summaryComplete"), missing: [], outOfOrder };
  }
  const lastDone = [...steps].reverse().find((s) => s.state === "done" || s.state === "skipped");
  return {
    headline: t("timeline.summaryInProgress", {
      reached: lastDone?.label ?? steps[0].label,
      next: missing[0].label,
    }),
    missing: missing.map((s) => s.label),
    outOfOrder,
  };
}

function ProgressSummary({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation("reservations");
  const { headline, missing, outOfOrder } = summariseProgress(t, steps);
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold text-ink">{headline}</p>
      {outOfOrder.length > 0 && (
        <p className="mt-1 text-xs font-medium text-warning">
          {t("timeline.outOfOrderWarning", { steps: outOfOrder.join(", ") })}
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-0.5 text-xs text-slate/60">{t("timeline.stillMissing", { steps: missing.join(", ") })}</p>
      )}
    </div>
  );
}

function BookingTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max items-start gap-0">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-start">
            <div className="flex w-24 flex-col items-center text-center sm:w-28">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  STEP_DOT_CLASSES[step.state]
                }`}
              >
                {step.state === "done" ? "✓" : step.state === "alert" ? "✕" : index + 1}
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight ${STEP_LABEL_CLASSES[step.state]}`}>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mt-3 h-px w-6 shrink-0 sm:w-8 ${
                  steps[index + 1].state === "upcoming" ? "bg-ink/10" : "bg-success/40"
                }`}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking Health — the one block that answers "do I need to do anything?"
//
// Rule-based, same category as this file's existing AI insight strip: plain
// threshold checks over stored data, no LLM call and no automated action.
// ---------------------------------------------------------------------------

type HealthTone = "ok" | "warn" | "crit";

interface HealthItem {
  key: string;
  tone: HealthTone;
  title: string;
  detail: string;
}

const HEALTH_DOT_CLASSES: Record<HealthTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  crit: "bg-danger",
};

const HEALTH_RANK: Record<HealthTone, number> = { ok: 0, warn: 1, crit: 2 };

function computeBookingHealth({
  t,
  booking,
  rooms,
  guests,
  docs,
  transferName,
  cancellationTiers,
}: {
  t: TFunction;
  booking: Booking;
  rooms: BookingRoom[] | null;
  guests: Guest[] | null;
  docs: BookingDocuments;
  transferName: string | null;
  cancellationTiers: CancellationPolicy[] | null;
}): HealthItem[] {
  const items: HealthItem[] = [];
  const daysUntilArrival = daysBetween(todayStr(), booking.arrival_date);
  const terminated = booking.status === "Cancelled" || booking.status === "Rejected";

  // 1. Hotel confirmation
  const confirmed =
    Boolean(booking.confirmation_number) ||
    Boolean(rooms && rooms.length > 0 && rooms.every((r) => Boolean(r.confirmation_number))) ||
    booking.status === "Confirmed" ||
    booking.status === "Completed";
  if (terminated) {
    items.push({
      key: "hotel",
      tone: booking.status === "Rejected" ? "crit" : "ok",
      title: t("health.hotelTitle"),
      detail: booking.status === "Rejected" ? t("health.hotelRejected") : t("health.hotelCancelled"),
    });
  } else if (confirmed) {
    items.push({ key: "hotel", tone: "ok", title: t("health.hotelTitle"), detail: t("health.hotelConfirmed") });
  } else if (daysUntilArrival <= 7) {
    items.push({
      key: "hotel",
      tone: "crit",
      title: t("health.hotelTitle"),
      detail: t("health.hotelOverdue", { count: Math.max(daysUntilArrival, 0) }),
    });
  } else {
    items.push({ key: "hotel", tone: "warn", title: t("health.hotelTitle"), detail: t("health.hotelWaiting") });
  }

  // 2. Documents
  items.push(
    docs.voucherReady
      ? { key: "documents", tone: "ok", title: t("health.documentsTitle"), detail: t("health.documentsReady") }
      : {
          key: "documents",
          tone: terminated ? "ok" : "warn",
          title: t("health.documentsTitle"),
          detail: terminated ? t("health.documentsNotApplicable") : t("health.documentsPending"),
        }
  );

  // 3. Invoice
  if (docs.statusLoading) {
    items.push({ key: "invoice", tone: "warn", title: t("health.invoiceTitle"), detail: t("health.invoiceChecking") });
  } else if (docs.invoiceReady) {
    items.push({ key: "invoice", tone: "ok", title: t("health.invoiceTitle"), detail: t("health.invoiceIssued") });
  } else if (docs.invoiceStatus === null) {
    items.push({ key: "invoice", tone: "warn", title: t("health.invoiceTitle"), detail: t("health.invoiceMissing") });
  } else {
    items.push({
      key: "invoice",
      tone: "warn",
      title: t("health.invoiceTitle"),
      detail: t("health.invoicePreparing"),
    });
  }

  // 4. Transfer
  items.push(
    transferName
      ? { key: "transfer", tone: "ok", title: t("health.transferTitle"), detail: transferName }
      : {
          key: "transfer",
          tone: terminated ? "ok" : "warn",
          title: t("health.transferTitle"),
          detail: t("health.transferMissing"),
        }
  );

  // 5. Guest documents. Escalates to critical only close to arrival -- a
  // passport missing four months out is normal, the same gap a week out is
  // an operational problem.
  if (guests && guests.length > 0) {
    const missingPassport = guests.filter((g) => !g.passport_number).length;
    if (missingPassport === 0) {
      items.push({ key: "guests", tone: "ok", title: t("health.guestsTitle"), detail: t("health.guestsComplete") });
    } else {
      items.push({
        key: "guests",
        tone: !terminated && daysUntilArrival <= 14 ? "crit" : "warn",
        title: t("health.guestsTitle"),
        detail: t("health.guestsMissingPassport", { count: missingPassport }),
      });
    }
  }

  // 6. Cancellation deadline — same tier interpretation as this file's
  // existing preview/insight logic, scoped to this one booking.
  if (!terminated && cancellationTiers && cancellationTiers.length > 0 && daysUntilArrival > 0) {
    let best: { threshold: number; gap: number } | null = null;
    for (const tier of cancellationTiers) {
      const gap = daysUntilArrival - tier.days_before_arrival;
      if (gap > 0 && gap <= 7 && (!best || gap < best.gap)) best = { threshold: tier.days_before_arrival, gap };
    }
    if (best) {
      items.push({
        key: "deadline",
        tone: "warn",
        title: t("health.deadlineTitle"),
        detail: t("health.deadlineSoon", { days: best.gap }),
      });
    }
  }

  // 6b. Flight dates that don't sit near the stay (Decision 153).
  //
  // The backend now REFUSES anything more than a year from the stay, or a
  // return flight before the outbound — those can no longer be created at
  // all. What is left for this check is the merely-suspicious middle ground
  // it still accepts on purpose: a flight some weeks off, which is usually a
  // typo but is occasionally real, so it is surfaced rather than blocked.
  // Rows stored BEFORE that validation existed can be far worse than a few
  // weeks, and this is how they become visible instead of sitting silently
  // in the database.
  const flightIssues = describeFlightDateIssues(t, booking, guests);
  if (flightIssues.length > 0) {
    items.push({
      key: "flights",
      tone: "warn",
      title: t("health.flightsTitle"),
      detail: flightIssues.join("; "),
    });
  }

  // 7. AI check — an aggregate of the rule checks above, not a separate one.
  const issues = items.filter((i) => i.tone !== "ok").length;
  items.push({
    key: "ai",
    tone: issues === 0 ? "ok" : "warn",
    title: t("health.aiTitle"),
    detail: issues === 0 ? t("health.aiClean") : t("health.aiIssues", { count: issues }),
  });

  return items;
}

// What is outstanding in each collapsed section, stated concretely.
//
// Sections no longer open themselves, so a closed row has to be able to say
// it has something in it. The owner's rule for the text is absolute: name
// the thing. "Afshona Daler: no passport number", not "some details
// pending" -- a vague marker is worse than none, because it costs a click to
// learn it said nothing.
//
// Deliberately NOT derived from computeBookingHealth: those strings are
// written to summarize a whole booking ("2 guests without a passport"),
// which is exactly the aggregate phrasing being ruled out here. The two
// coexist -- Booking Health stays the overview, this names the individuals.
function computeSectionIssues({
  t,
  booking,
  rooms,
  guests,
  docs,
  isAdminSide,
}: {
  t: TFunction;
  booking: Booking;
  rooms: BookingRoom[] | null;
  guests: Guest[] | null;
  docs: BookingDocuments;
  isAdminSide: boolean;
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const push = (key: string, line: string) => {
    (out[key] ??= []).push(line);
  };
  const terminated = booking.status === "Cancelled" || booking.status === "Rejected";
  const name = (g: Guest) => `${g.first_name} ${g.last_name}`.trim() || `#${g.id}`;

  // --- 1. Quick actions -------------------------------------------------
  if (isAdminSide && booking.claimed_by === null && !terminated) {
    push("actions", t("sectionIssues.notTaken"));
  }
  if (!terminated) {
    // Which rooms are still awaiting a decision, by number, not "some".
    const pending = (rooms ?? []).filter((r) => r.status === "Pending");
    if (pending.length > 0 && isAdminSide) {
      push(
        "actions",
        t("sectionIssues.roomsAwaitingDecision", {
          rooms: pending.map((r) => `#${r.sequence_number}`).join(", "),
        }),
      );
    }
  }

  // --- 2. Guests --------------------------------------------------------
  if (guests !== null) {
    if (guests.length === 0) {
      push("guests", t("sectionIssues.noGuests"));
    } else {
      if (!guests.some((g) => g.is_lead_guest)) push("guests", t("sectionIssues.noLeadGuest"));
      for (const g of guests) {
        const missing: string[] = [];
        if (!g.passport_number) missing.push(t("sectionIssues.fieldPassport"));
        if (!g.passport_expiry) missing.push(t("sectionIssues.fieldPassportExpiry"));
        if (!g.date_of_birth) missing.push(t("sectionIssues.fieldDob"));
        if (!g.nationality) missing.push(t("sectionIssues.fieldNationality"));
        if (missing.length > 0) {
          push("guests", `${name(g)}: ${missing.join(", ")}`);
        }
      }
    }
  }

  // --- 3. Flights -------------------------------------------------------
  if (!terminated) {
    if (!booking.arrival_flight_number) push("flights", t("sectionIssues.noArrivalFlight"));
    if (!booking.departure_flight_number) push("flights", t("sectionIssues.noDepartureFlight"));
  }
  // Already concrete (names the leg, the guest and the number of days off).
  for (const issue of describeFlightDateIssues(t, booking, guests)) push("flights", issue);

  // --- 4. Documents -----------------------------------------------------
  if (!terminated) {
    if (!docs.voucherReady) push("documents", t("sectionIssues.voucherWaiting"));
    if (!docs.statusLoading && !docs.invoiceReady) {
      push(
        "documents",
        docs.invoiceStatus === null
          ? t("sectionIssues.invoiceMissing")
          : t("sectionIssues.invoiceNotIssued", { status: docs.invoiceStatus }),
      );
    }
  }

  return out;
}

// Decision 156 — display filter only; computeBookingHealth is untouched.
//
// Five of the seven items were restating what is already on the same screen:
// hotel confirmation / documents / invoice are timeline steps 4-6 (and the
// progress summary already lists what is outstanding), transfer is the line
// under Flights, and guest documents are visible in the guest cards. The
// "ai" item is explicitly an aggregate of the others, so with only problems
// listed it just counts the lines beneath it.
//
// Kept deliberately:
//   - anything CRITICAL, including hotel/documents/invoice — "unconfirmed and
//     arrival is in 3 days" is an escalation the timeline cannot express,
//     whereas the plain "waiting" state is exactly what the timeline shows.
//   - every non-ok item that has no equivalent elsewhere (flight dates,
//     cancellation deadline, transfer).
// Decision 162: the section order, and therefore their numbers. One list, so
// a card can never carry a number that disagrees with its position.
// "info" (Booking information) is gone -- everything it still carried by the
// end (agent, agency, who is handling it) was already in the hero, so it was
// a numbered section that made a manager open it to re-read the header.
// Its one non-duplicated field, special requests, moved into the hero itself.
const SECTION_ORDER = [
  "actions",
  "guests",
  "flights",
  "documents",
  "correspondence",
  "history",
] as const;

function sectionNumber(key?: string): number | null {
  if (!key) return null;
  const i = SECTION_ORDER.indexOf(key as (typeof SECTION_ORDER)[number]);
  return i === -1 ? null : i + 1;
}

const HEALTH_KEYS_MIRRORED_BY_TIMELINE = new Set(["hotel", "documents", "invoice"]);

function visibleHealthItems(items: HealthItem[]): HealthItem[] {
  return items.filter((i) => {
    if (i.tone === "ok") return false;
    if (i.key === "ai") return false;
    if (HEALTH_KEYS_MIRRORED_BY_TIMELINE.has(i.key) && i.tone !== "crit") return false;
    return true;
  });
}

function BookingHealthCard({ items: allItems }: { items: HealthItem[] }) {
  const { t } = useTranslation("reservations");
  const items = visibleHealthItems(allItems);
  // Nothing wrong -> no card. A list of green ticks is noise on a screen that
  // already shows the same facts in the hero, the timeline and the guest cards.
  if (items.length === 0) return null;
  const worst = items.reduce<HealthTone>((acc, i) => (HEALTH_RANK[i.tone] > HEALTH_RANK[acc] ? i.tone : acc), "ok");
  const bannerClasses: Record<HealthTone, string> = {
    ok: "border-success/30 bg-success/5",
    warn: "border-warning/30 bg-warning/5",
    crit: "border-danger/30 bg-danger/5",
  };
  const bannerText: Record<HealthTone, string> = {
    // "ok" is unreachable now (an all-ok card returns null above), kept only
    // so the Record stays exhaustive.
    ok: t("health.summaryOk"),
    warn: t("health.summaryWarn"),
    crit: t("health.summaryCrit"),
  };

  return (
    <Card padding="sm" shadow="card" className={`border ${bannerClasses[worst]}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT_CLASSES[worst]}`} />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">{t("health.title")}</h4>
      </div>
      <p className="mt-1 text-sm font-medium text-ink">{bannerText[worst]}</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item.key} className="flex gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT_CLASSES[item.tone]}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{item.title}</p>
              <p className="text-sm text-ink">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Price breakdown (agent default).
//
// Deliberately three lines plus the total, and deliberately NOT the seven
// the brief listed. Meal is not separable -- Contract Engine prices a room
// per meal plan, so the meal is inside the room figure and the only way to
// split it out is the contract's NET price, which is exactly the internal
// cost Decision 102 removed from this view. The agent-facing discount is
// omitted for the same reason: total plus discount reveals the markup. The
// admin side keeps its full breakdown through renderFinancialSummary.
// ---------------------------------------------------------------------------

// Decision 181: the agent's own price breakdown -- per room, per category,
// with a grand total. Same ruled grid the admin panel uses, minus everything
// internal: no cost, no margin, no adjustments. Not filtered on the client
// either -- it reads a dedicated endpoint whose response model has no field
// for them, so our figures never reach this browser at all.
//
// Replaces a card that listed the SELECTED room's three lines under a total
// for the WHOLE booking (reported on BK-000080: lines 3927/725/84 above a
// 6700.50 total), the same room-vs-application conflation Decision 179 fixed
// on the admin side.
interface AgentPriceLine {
  category: string;
  price: number;
}
interface AgentPriceRoom {
  booking_room_id: number;
  sequence_number: number;
  room_type_id: number;
  status: string;
  billable: boolean;
  lines: AgentPriceLine[];
  total: number;
}
interface AgentPriceBreakdown {
  booking_id: number;
  currency: string;
  rooms: AgentPriceRoom[];
  total: number;
}

function PriceBreakdownCard({
  booking,
  roomTypes,
  selectedRoomId,
  onSelectRoom,
}: {
  booking: Booking;
  roomTypes: Record<number, string>;
  selectedRoomId: number | null;
  // Clicking a room here selects it everywhere else on the screen, the same
  // single piece of state the Rooms card drives -- so the agent can read one
  // room's price and see that room's guests and flights without hunting for
  // the selector.
  onSelectRoom?: (roomId: number) => void;
}) {
  const { t } = useTranslation("reservations");
  const [data, setData] = useState<AgentPriceBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    setData(null);
    setError(null);
    fetchJson<AgentPriceBreakdown>(`/finance-engine/bookings/${booking.id}/price-breakdown`, token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [booking.id]);

  const categoryLabel = (c: string) =>
    c === "room"
      ? t("price.accommodation")
      : c === "transfer"
        ? t("price.transfer")
        : c === "tax"
          ? t("price.tax")
          : c;

  const multiRoom = (data?.rooms.length ?? 0) > 1;
  const billableRooms = data?.rooms.filter((r) => r.billable).length ?? 0;

  return (
    <Card padding="sm" shadow="card">
      <h4 className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("price.title")}</h4>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="mt-2 text-sm text-slate/50">{t("price.loading")}</p>}

      {data && (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-ink/25 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-ink">
                  <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-left font-semibold">
                    {t("price.itemColumn")}
                  </th>
                  <th className="border-b-2 border-ink/25 px-3 py-2.5 text-right font-semibold">
                    {t("price.amountColumn", { currency: data.currency })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.map((room) => (
                  <Fragment key={room.booking_room_id}>
                    {multiRoom && (
                      <tr
                        onClick={onSelectRoom ? () => onSelectRoom(room.booking_room_id) : undefined}
                        className={`${onSelectRoom ? "cursor-pointer" : ""} ${
                          room.booking_room_id === selectedRoomId ? "bg-gold/10" : "bg-sand/40"
                        }`}
                      >
                        <td colSpan={2} className="border-b border-ink/20 px-3 py-1.5 text-xs text-ink">
                          <span className="font-semibold">
                            {t("price.roomHeading", { number: room.sequence_number })}
                          </span>
                          <span className="ml-1.5 text-slate/60">
                            {roomTypes[room.room_type_id] ?? ""}
                          </span>
                          {!room.billable && (
                            <span className="ml-1.5 text-slate/50">· {t("price.notCharged")}</span>
                          )}
                        </td>
                      </tr>
                    )}
                    {room.lines.map((line) => (
                      <tr key={`${room.booking_room_id}-${line.category}`}>
                        <td className="border-b border-r border-ink/20 px-3 py-2 text-ink">
                          {categoryLabel(line.category)}
                        </td>
                        <td className="border-b border-ink/20 px-3 py-2 text-right tabular-nums text-ink">
                          {formatNumber(line.price)}
                        </td>
                      </tr>
                    ))}
                    {multiRoom && (
                      <tr className="text-ink/70">
                        <td className="border-b border-r border-ink/20 px-3 py-1.5 text-xs">
                          {t("price.roomSubtotal", { number: room.sequence_number })}
                        </td>
                        <td className="border-b border-ink/20 px-3 py-1.5 text-right text-xs tabular-nums">
                          {formatNumber(room.total)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
              {t("price.grandTotal")}
              {billableRooms > 1 && (
                <span className="ml-1 normal-case text-slate/40">
                  {t("price.forRooms", { count: billableRooms })}
                </span>
              )}
            </p>
            <p className="mt-0.5 font-display text-3xl font-semibold leading-none text-ink">
              {formatNumber(data.total)} <span className="text-lg text-slate/50">{data.currency}</span>
            </p>
            <p className="mt-1.5 text-[11px] text-slate/50">{t("price.mealIncludedHint")}</p>
          </div>
        </>
      )}
    </Card>
  );
}
// ---------------------------------------------------------------------------
// Documents — one card per document, replacing the old two-row "В работе"
// list. Only Voucher and Invoice appear: LPO, Agent Statement and Credit
// Note are all admin-only endpoints (an agent gets 403), so offering them
// here would be offering an action that cannot succeed.
//
// The states are "ready" and "preparing" only. Sent/Downloaded are not
// tracked anywhere in this project, so they are not claimed. Both documents
// are served as plain text (no PDF layer exists), hence "Download" rather
// than "Download PDF".
// ---------------------------------------------------------------------------

function DocumentCard({
  name,
  ready,
  loading,
  pendingHint,
  onDownload,
}: {
  name: string;
  ready: boolean;
  loading?: boolean;
  pendingHint: string;
  onDownload: () => void;
}) {
  const { t } = useTranslation("reservations");
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        ready ? "border-success/30 bg-success/5" : "border-ink/10 bg-sand/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            ready ? "bg-success/15 text-success" : "bg-slate/10 text-slate/60"
          }`}
        >
          {loading ? t("documentsSection.checking") : ready ? t("documentsSection.ready") : t("documentsSection.preparing")}
        </span>
      </div>
      {ready ? (
        <button
          type="button"
          onClick={onDownload}
          className="mt-2 w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
        >
          {t("documentsSection.download")}
        </button>
      ) : (
        <p className="mt-1.5 text-xs leading-snug text-slate/50">{pendingHint}</p>
      )}
    </div>
  );
}

function DocumentsSection({
  docs,
  openSection,
  onToggleSection,
  issues,
}: {
  docs: BookingDocuments;
  openSection?: string | null;
  onToggleSection?: (key: string) => void;
  issues?: string[];
}) {
  const { t } = useTranslation("reservations");
  const summary = t("bookingDetail.summaryDocuments", {
    voucher: docs.voucherReady ? t("documentsSection.ready") : t("documentsSection.preparing"),
    invoice: docs.invoiceReady ? t("documentsSection.ready") : t("documentsSection.preparing"),
  });
  return (
    <SectionCard
      sectionKey="documents"
      openSection={openSection}
      onToggleSection={onToggleSection}
      issues={issues}
      summary={summary}
      id="booking-documents" title={t("documentsSection.title")}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DocumentCard
          name={t("documentsSection.voucher")}
          ready={docs.voucherReady}
          pendingHint={t("documentsSection.voucherPending")}
          onDownload={() => docs.download("voucher")}
        />
        <DocumentCard
          name={t("documentsSection.invoice")}
          ready={docs.invoiceReady}
          loading={docs.statusLoading}
          pendingHint={t("documentsSection.invoicePending")}
          onDownload={() => docs.download("invoice")}
        />
      </div>
      {docs.downloadError && <p className="mt-2 text-xs font-medium text-danger">{docs.downloadError}</p>}
      <p className="mt-2 text-[11px] text-slate/40">{t("documentsSection.formatHint")}</p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// History — assembled from the timestamps this project actually stores.
//
// Honest limitation, surfaced in the UI rather than papered over: there is
// no audit-log table. Guest edits, flight edits, manager approval, voucher
// generation and invoice issuing record no timestamp anywhere, so they
// cannot appear here. `dates_changed_at` holds only the LAST date change,
// not a history of them. Everything below is a real stored fact.
// ---------------------------------------------------------------------------

interface HistoryEvent {
  key: string;
  at: string;
  title: string;
  detail?: string;
}

function buildHistory(
  t: TFunction,
  booking: Booking,
  correspondence: BookingCorrespondenceRow[] | null,
  claimerNames: Record<number, string>
): HistoryEvent[] {
  const who = (id: number | null) => (id !== null ? claimerNames[id] ?? `#${id}` : undefined);
  const events: HistoryEvent[] = [
    { key: "created", at: booking.created_at, title: t("history.created"), detail: who(booking.agent_id) },
  ];

  if (booking.claimed_at) {
    events.push({ key: "claimed", at: booking.claimed_at, title: t("history.claimed"), detail: who(booking.claimed_by) });
  }
  if (booking.dates_changed_at) {
    events.push({
      key: "datesChanged",
      at: booking.dates_changed_at,
      title: t("history.datesChanged"),
      detail: booking.date_change_reason ?? undefined,
    });
  }
  (correspondence ?? []).forEach((msg) => {
    const at = msg.sent_at ?? msg.received_at ?? msg.created_at;
    events.push({
      key: `mail-${msg.id}`,
      at,
      title: msg.direction === "outbound" ? t("history.mailOut") : t("history.mailIn"),
      detail: msg.subject ?? undefined,
    });
  });
  if (booking.cancelled_at) {
    events.push({
      key: "cancelRequested",
      at: booking.cancelled_at,
      title: t("history.cancellationRequested"),
      detail: [booking.cancellation_reason, who(booking.cancelled_by)].filter(Boolean).join(" · ") || undefined,
    });
  }
  if (booking.cancellation_confirmed_at) {
    events.push({
      key: "cancelConfirmed",
      at: booking.cancellation_confirmed_at,
      title: t("history.cancellationConfirmed"),
      detail: [booking.cancellation_confirmation_number, who(booking.cancellation_confirmed_by)]
        .filter(Boolean)
        .join(" · ") || undefined,
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function formatDateTime(value: string) {
  const d = new Date(value);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("ru-RU")} · ${time}`;
}

function BookingHistoryCard({
  events,
  openSection,
  onToggleSection,
}: {
  events: HistoryEvent[];
  openSection?: string | null;
  onToggleSection?: (key: string) => void;
}) {
  const { t } = useTranslation("reservations");
  const summary = t("bookingDetail.summaryHistory", { count: events.length });
  return (
    <SectionCard sectionKey="history" openSection={openSection} onToggleSection={onToggleSection} summary={summary} title={t("history.title")}>
      <ol className="space-y-3">
        {events.map((event, index) => (
          <li key={event.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${index === 0 ? "bg-gold" : "bg-ink/20"}`} />
              {index < events.length - 1 && <span className="mt-1 w-px flex-1 bg-ink/10" />}
            </div>
            <div className="min-w-0 pb-0.5">
              <p className="text-sm font-medium text-ink">{event.title}</p>
              <p className="text-[11px] text-slate/50">{formatDateTime(event.at)}</p>
              {event.detail && <p className="mt-0.5 text-xs text-slate/60">{event.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-ink/10 pt-2 text-[11px] leading-snug text-slate/40">
        {t("history.partialHint")}
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Flights — a real card instead of two entries buried in the facts grid.
// Renders whenever there is either something to show or the right to enter
// it; FlightNumbersEdit (unchanged) stays the single write path, and returns
// null by itself when the user can't edit.
//
// No "Terminal" field: no such column exists on Booking, so it is not shown
// as an empty row.
// ---------------------------------------------------------------------------

function FlightLeg({
  label,
  number,
  date,
  time,
}: {
  label: string;
  number: string | null;
  date: string | null;
  time: string | null;
}) {
  const { t } = useTranslation("reservations");
  return (
    <div className="rounded-xl border border-ink/10 bg-sand/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{label}</p>
      <p className="mt-0.5 font-mono text-base font-semibold text-ink">{number || "—"}</p>
      <p className="text-xs text-slate/60">
        {date ? formatDate(date) : t("flightsCard.noDate")}
        {time ? ` · ${time}` : ""}
      </p>
    </div>
  );
}

function FlightsCard({
  booking,
  onBookingUpdated,
  canEdit,
  openSection,
  onToggleSection,
  guests,
  issues,
}: {
  booking: Booking;
  onBookingUpdated: (updated: Booking) => void;
  canEdit: boolean;
  issues?: string[];
  // Decision 150: needed only to say whether these two legs are actually
  // everyone's. Null while the guest list is still loading, which reads the
  // same as "nobody flies separately" -- correct, since that is the case
  // for every booking that predates this decision.
  guests: Guest[] | null;
  openSection?: string | null;
  onToggleSection?: (key: string) => void;
}) {
  const { t } = useTranslation("reservations");
  const separate = (guests ?? []).filter(hasOwnFlight);
  return (
    <SectionCard
      id="booking-flights"
      sectionKey="flights"
      openSection={openSection}
      onToggleSection={onToggleSection}
      issues={issues}
      summary={booking.arrival_flight_number || booking.departure_flight_number
        ? [booking.arrival_flight_number, booking.departure_flight_number].filter(Boolean).join(" / ")
        : t("flightsCard.noDate")}
      title={t("flightsCard.title")}
      action={<FlightNumbersEdit booking={booking} onUpdated={onBookingUpdated} canEdit={canEdit} />}
    >
      {/* Without this line the two legs below read as "the whole party's
          flight", which stops being true the moment anyone has their own.
          Names are listed rather than just a count so the transfer can
          actually be arranged from this card. */}
      {separate.length > 0 && (
        <p className="mb-2.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-ink">
          <span className="font-semibold">{t("flightsCard.someFlySeparately", { count: separate.length })}</span>{" "}
          <span className="text-slate/70">
            {separate.map((g) => `${g.first_name} ${g.last_name}`.trim()).join(", ")} —{" "}
            {t("flightsCard.seeGuestCards")}
          </span>
        </p>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <FlightLeg
          label={
            separate.length > 0
              ? t("bookingDetail.arrivalFlightLabel") + " · " + t("flightsCard.commonFlightSuffix")
              : t("bookingDetail.arrivalFlightLabel")
          }
          number={booking.arrival_flight_number}
          date={booking.arrival_flight_date}
          time={booking.arrival_flight_time}
        />
        <FlightLeg
          label={
            separate.length > 0
              ? t("bookingDetail.departureFlightLabel") + " · " + t("flightsCard.commonFlightSuffix")
              : t("bookingDetail.departureFlightLabel")
          }
          number={booking.departure_flight_number}
          date={booking.departure_flight_date}
          time={booking.departure_flight_time}
        />
      </div>
      {/* The transfer line that used to repeat here is gone: it is now a
          labelled field in the hero, where a manager checks facts against
          the hotel's reply. Leaving both would have put the same value on
          screen twice, which is the duplication this run keeps removing. */}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Quick actions — every action on this booking in one place, one size.
// Nothing new is authorized here: each button is the same permission-gated
// action that already existed elsewhere in this panel, and a button whose
// action isn't available to this user simply isn't rendered.
// ---------------------------------------------------------------------------

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function QuickActionButton({
  children,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "primary";
  disabled?: boolean;
}) {
  const toneClasses =
    tone === "danger"
      ? "border-danger/30 bg-white text-danger hover:bg-danger/10"
      : tone === "primary"
        ? "border-transparent bg-ink text-white hover:-translate-y-0.5"
        : "border-ink/15 bg-white text-ink hover:bg-sand";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-lg border px-4 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

function QuickActionsCard({
  openSection,
  onToggleSection,
  locked,
  booking,
  permissions,
  docs,
  onChangeDates,
  onCancel,
  onClaim,
  claimSubmitting,
  issues,
}: {
  booking: Booking;
  permissions: Permissions;
  docs: BookingDocuments;
  onChangeDates: () => void;
  onCancel: () => void;
  locked?: boolean;
  openSection?: string | null;
  onToggleSection?: (key: string) => void;
  onClaim: () => void;
  claimSubmitting: boolean;
  issues?: string[];
}) {
  const { t } = useTranslation("reservations");
  // Same condition the header buttons have always used -- a booking already
  // cancelled, mid-cancellation or rejected takes no further operational
  // action.
  const mutable =
    booking.status !== "Cancelled" && booking.status !== "Rejected" && booking.status !== "Cancellation Requested";

  // Decision 158: a collapsible section like every other block, not a
  // permanently-open card. It keeps its place directly under the hero --
  // first in the flow, where the actions belong -- but no longer spends
  // vertical space while the manager is reading rather than acting. Buttons
  // stay one per row inside it: each is a separate action, not a choice
  // between alternatives.
  return (
    <SectionCard
      sectionKey="actions"
      openSection={openSection}
      onToggleSection={onToggleSection}
      issues={issues}
      summary={t("quickActions.summary")}
      title={t("quickActions.title")}
    >
      {/* Owner, on seeing it open: the buttons stacked in a narrow column
          left the whole right-hand width of the panel empty. They now flow
          across it and wrap, so the opened section is a compact toolbar
          rather than a tall ladder. */}
      <div className="flex flex-wrap items-center gap-2">
        {permissions.canClaim &&
          booking.claimed_by === null &&
          !TERMINAL_STATUSES.includes(booking.status) && (
          <QuickActionButton tone="primary" onClick={onClaim} disabled={claimSubmitting}>
            {claimSubmitting ? t("bookingDetail.sending") : t("bookingDetail.claim")}
          </QuickActionButton>
        )}
        {permissions.canChangeDates && mutable && (
          <QuickActionButton onClick={onChangeDates}>{t("bookingDetail.changeDates")}</QuickActionButton>
        )}
        {permissions.canEditFlights && (
          <QuickActionButton onClick={() => scrollToSection("booking-flights")}>
            {t("quickActions.editFlights")}
          </QuickActionButton>
        )}
        {permissions.canEditGuestDetails && (
          <QuickActionButton onClick={() => scrollToSection("booking-guests")}>
            {t("quickActions.editGuests")}
          </QuickActionButton>
        )}
        {/* Decision 163: downloading is an action, not reading -- the voucher
            is what reaches the guest. Locked with everything else until the
            booking has an owner. */}
        <QuickActionButton
          onClick={() => (docs.voucherReady ? docs.download("voucher") : scrollToSection("booking-documents"))}
          disabled={!docs.voucherReady || locked}
        >
          {t("quickActions.downloadVoucher")}
        </QuickActionButton>
        <QuickActionButton
          onClick={() => (docs.invoiceReady ? docs.download("invoice") : scrollToSection("booking-documents"))}
          disabled={!docs.invoiceReady || locked}
        >
          {t("quickActions.downloadInvoice")}
        </QuickActionButton>
        {/* Admin's invoice controls (renderHeaderActions) keep their own
            markup untouched -- only separated from the operational buttons
            above, since they are a different kind of action. */}

        {permissions.canCancel && mutable && (
          <QuickActionButton tone="danger" onClick={onCancel}>
            {t("bookingDetail.cancelBooking")}
          </QuickActionButton>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — guests, meal plan, transfer, cancellation info, and an
// on-demand re-derived price breakdown for one booking
// ---------------------------------------------------------------------------

function BookingDetail({
  booking,
  hotelName,
  roomTypeName,
  hotels,
  roomTypes,
  mealPlans,
  mealPlanInfo,
  onClose,
  onBookingUpdated,
  permissions: rawPermissions,
  claimerNames,
  companyNames,
  adminExtensions,
}: {
  booking: Booking;
  hotelName: string;
  roomTypeName: string;
  // id->name lookups, same maps the list itself already fetched -- needed
  // here too since a multi-room application's rooms (below) can each
  // reference a different hotel_id/room_type_id/meal_plan_id than the
  // parent booking's own "representative" fields.
  hotels: Record<number, string>;
  roomTypes: Record<number, string>;
  mealPlans: Record<number, MealPlanInfo>;
  mealPlanInfo: MealPlanInfo | undefined;
  onClose: () => void;
  onBookingUpdated: (updated: Booking) => void;
  permissions: Permissions;
  claimerNames: Record<number, string>;
  companyNames: Record<number, string>;
  adminExtensions?: AdminBookingExtensions;
}) {
  const { t } = useTranslation("reservations");
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [guestsError, setGuestsError] = useState<string | null>(null);

  // Stage 3 (manager approve/reject) -- every booking has at least one
  // BookingRoom row (old single-room bookings were migrated, every new
  // one is created with at least one). Fetched independently of `guests`
  // since it has its own loading/error lifecycle and its own write
  // actions (approve/reject) that need to refresh just this list plus
  // the parent booking's own rollup status.
  const [rooms, setRooms] = useState<BookingRoom[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomActionId, setRoomActionId] = useState<number | null>(null);
  const [roomActionError, setRoomActionError] = useState<string | null>(null);
  // Decision 166: which room is awaiting the manager's re-confirmation
  // before it is approved (and its voucher sent). null = no dialog open.
  const [approveConfirmRoom, setApproveConfirmRoom] = useState<BookingRoom | null>(null);
  // Rejecting now also tells the agent, so it gets the same deliberate
  // re-confirmation Approve has -- and a real reason field instead of the
  // window.prompt() it used to open, which no longer suits an action that
  // sends someone a message.
  const [rejectConfirmRoom, setRejectConfirmRoom] = useState<BookingRoom | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Decision 168: the second re-confirmation. Opens by itself right after a
  // rejection that leaves the application with nothing to deliver -- the
  // manager then decides whether to close it free of charge.
  const [freeCancelOpen, setFreeCancelOpen] = useState(false);
  const [freeCancelSubmitting, setFreeCancelSubmitting] = useState(false);
  const [freeCancelError, setFreeCancelError] = useState<string | null>(null);
  // Which room's own data (dates/guests/meal plan/Net-Sale-Profit/price
  // breakdown) is shown below -- the project owner's own explicit fix for
  // "unclear which room this data is for" once an application has more
  // than one room. Defaults to the first room once loaded so there's
  // never a moment with rooms visible but nothing selected below.
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  useEffect(() => {
    setRooms(null);
    setRoomsError(null);
    setSelectedRoomId(null);
    const token = localStorage.getItem("token") || "";
    fetchJson<BookingRoom[]>(`/booking-engine/bookings/${booking.id}/rooms`, token)
      .then((loaded) => {
        setRooms(loaded);
        if (loaded.length > 0) setSelectedRoomId(loaded[0].id);
      })
      .catch((err) => setRoomsError(err.message || "Failed to load rooms"));
  }, [booking.id]);

  // Transfer type -> human name, same "one bulk fetch per unique
  // contract_id" pattern BookingsSubViews.tsx already established for
  // the same lookup (GET /contracts/{id}/transfer-options, no new
  // backend endpoint). Keyed by `${contract_id}:${transfer_type}` since
  // the same raw code can mean different things on different contracts.
  const [transferNames, setTransferNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!rooms) return;
    const uniqueContractIds = Array.from(new Set(rooms.map((r) => r.contract_id)));
    const token = localStorage.getItem("token") || "";
    Promise.all(
      uniqueContractIds.map(async (contractId) => {
        try {
          const options = await fetchJson<{ transfer_type: string; transfer_name: string | null }[]>(
            `/contract-engine/contracts/${contractId}/transfer-options`,
            token
          );
          return { contractId, options };
        } catch {
          return { contractId, options: [] };
        }
      })
    ).then((results) => {
      const map: Record<string, string> = {};
      results.forEach(({ contractId, options }) => {
        options.forEach((o) => {
          map[`${contractId}:${o.transfer_type}`] = o.transfer_name ?? o.transfer_type;
        });
      });
      setTransferNames(map);
    });
  }, [rooms]);

  const displayRoom = rooms?.find((r) => r.id === selectedRoomId) ?? null;

  // The hero describes the SELECTED room and nothing else -- dates, nights,
  // guests and meal plan already come from effectiveBooking, and room type
  // now does too. It briefly listed every type in the application ("2 room
  // types · Sky Studio · Beach Villa with Swirlpool"), which read as if the
  // whole header were an application-wide summary while every field beside
  // it was in fact one room's. Owner: the header must be exclusively the
  // selected room. The hint only says WHICH room is on screen, so a
  // multi-room application never leaves that ambiguous.
  const roomTypeSummary = useMemo(() => {
    if (!displayRoom || !rooms || rooms.length <= 1) return null;
    return {
      value: roomTypes[displayRoom.room_type_id] ?? `#${displayRoom.room_type_id}`,
      hint: t("hero.roomOfCount", {
        number: displayRoom.sequence_number,
        count: rooms.length,
      }),
    };
  }, [displayRoom, rooms, roomTypes, t]);

  const displayTransferName = displayRoom?.transfer_type
    ? transferNames[`${displayRoom.contract_id}:${displayRoom.transfer_type}`] ?? displayRoom.transfer_type
    : null;

  // Adapts the selected BookingRoom's own fields onto a copy of the
  // parent Booking so the existing, already-verified financial/breakdown
  // machinery (computeBookingFinancials, useOwnMealPlan, useOwnBreakdown
  // -- all built against the `Booking` shape) can be reused completely
  // unchanged for a single room's figures instead of the application's
  // blended "representative" ones. Fields not overridden (booking_number,
  // agent_id, status, claimed_by, etc.) are structurally required by
  // `Booking` but never read by that machinery, so inheriting them from
  // the real parent booking is harmless.
  // Memoized: FinancialSummaryBlock's own useOwnBreakdown effect
  // dependency-arrays on this exact object by reference (same pattern
  // its existing, unchanged `[booking, mealPlanInfo]` dependency already
  // relies on for the single-room case) -- without memoizing, a plain
  // object literal recreated on every render would look "changed" on
  // every re-render (e.g. from unrelated guests/correspondence state
  // updates elsewhere in this same component) and re-fire the contract-
  // engine recalculation calls needlessly.
  const effectiveBooking: Booking = useMemo(
    () =>
      displayRoom
        ? {
            ...booking,
            hotel_id: displayRoom.hotel_id,
            contract_id: displayRoom.contract_id,
            room_type_id: displayRoom.room_type_id,
            meal_plan_id: displayRoom.meal_plan_id ?? booking.meal_plan_id,
            arrival_date: displayRoom.arrival_date,
            departure_date: displayRoom.departure_date,
            nights: displayRoom.nights,
            adults: displayRoom.adults,
            children: displayRoom.children,
            infants: displayRoom.infants,
            currency: displayRoom.currency ?? booking.currency,
            total_amount: displayRoom.total_amount ?? 0,
            agent_markup_amount: displayRoom.agent_markup_amount,
            agent_exclusive_discount_amount: displayRoom.agent_exclusive_discount_amount,
            transfer_type: displayRoom.transfer_type,
            transfer_total: displayRoom.transfer_total,
            mandatory_tax_total: displayRoom.mandatory_tax_total,
          }
        : booking,
    [booking, displayRoom]
  );
  const effectiveMealPlanInfo = displayRoom ? mealPlans[displayRoom.meal_plan_id ?? -1] : mealPlanInfo;

  // Returns the freshly-fetched rooms so a caller can decide what to do next
  // from the real post-action state rather than from its own stale copy.
  async function refreshAfterRoomAction(): Promise<BookingRoom[] | null> {
    const token = localStorage.getItem("token") || "";
    try {
      const [freshRooms, freshBooking] = await Promise.all([
        fetchJson<BookingRoom[]>(`/booking-engine/bookings/${booking.id}/rooms`, token),
        fetchJson<Booking>(`/booking-engine/bookings/${booking.id}`, token),
      ]);
      setRooms(freshRooms);
      onBookingUpdated(freshBooking);
      return freshRooms;
    } catch (err: any) {
      setRoomsError(err.message || "Failed to refresh rooms");
      return null;
    }
  }

  // Decision 166: approving now sends the guest voucher to the agent
  // immediately, so it is no longer a reversible internal note -- it puts a
  // document in someone else's hands. The owner asked for a re-confirmation
  // step for exactly that reason ("с переподтверждением с менеджером, что вы
  // уверены"). The dialog is not a generic "are you sure": it names what
  // will be sent, and says plainly when the hotel's confirmation number is
  // still missing, so the manager decides knowing the voucher will go out
  // without one rather than finding out from a guest at check-in.
  async function handleApproveRoom(roomId: number) {
    const token = localStorage.getItem("token") || "";
    setRoomActionError(null);
    setRoomActionId(roomId);
    try {
      await fetchJson(`/booking-engine/rooms/${roomId}/approve`, token, { method: "POST" });
      // The voucher send is a Finance Engine call, so it goes through the
      // extension mechanism (Decision 107) rather than inline here.
      // Best-effort: the approval itself has already succeeded and must not
      // be reported as failed because a document didn't go out -- the same
      // contract onAfterClaim's auto-invoice already follows.
      await adminExtensions?.onAfterRoomApproved?.(roomId);
      await refreshAfterRoomAction();
    } catch (err: any) {
      setRoomActionError(err.message || "Failed to approve room");
    } finally {
      setRoomActionId(null);
      setApproveConfirmRoom(null);
    }
  }

  async function handleRejectRoom(roomId: number, rawReason: string) {
    const reason = rawReason.trim();
    if (reason.length < 2) return;
    const token = localStorage.getItem("token") || "";
    setRoomActionError(null);
    setRoomActionId(roomId);
    try {
      await fetchJson(`/booking-engine/rooms/${roomId}/reject`, token, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      const refreshed = await refreshAfterRoomAction();
      // Decision 168: if declining this room left nothing to deliver, the
      // application itself has to be closed -- and the owner's rule is that
      // it is closed free of charge, by an explicit manager decision, not
      // automatically. Asked for here rather than left to be remembered
      // later, since this is the exact moment it becomes true. Computed from
      // the freshly-refetched rooms, never from the pre-reject copy.
      const stillLive = (refreshed ?? []).some((r) => LIVE_ROOM_STATUSES.includes(r.status));
      if (!stillLive) setFreeCancelOpen(true);
    } catch (err: any) {
      setRoomActionError(err.message || "Failed to reject room");
    } finally {
      setRoomActionId(null);
      setRejectConfirmRoom(null);
      setRejectReason("");
    }
  }

  async function handleFreeCancel() {
    const token = localStorage.getItem("token") || "";
    setFreeCancelSubmitting(true);
    setFreeCancelError(null);
    try {
      const updated = await fetchJson<Booking>(
        `/booking-engine/bookings/${booking.id}/cancel-free-of-charge`,
        token,
        {
          method: "POST",
          // The reason is generated, not typed: at this point every room
          // already carries its own rejection reason entered by the manager,
          // and asking again would only invite a second, vaguer version of
          // the same fact into a permanent audit field.
          body: JSON.stringify({ reason: t("freeCancel.reason") }),
        },
      );
      onBookingUpdated(updated);
      // Finance already has a note mechanism for cancellations (Decision
      // 104); reuse it rather than inventing a second trail. Best-effort --
      // the cancellation itself is committed and must not be reported as
      // failed because a note didn't attach.
      try {
        await fetchJson(`/finance-engine/bookings/${booking.id}/flag-cancellation-confirmed`, token, {
          method: "POST",
        });
      } catch {
        // see above
      }
      setFreeCancelOpen(false);
    } catch (err: any) {
      setFreeCancelError(err.message || "Failed to cancel the application");
    } finally {
      setFreeCancelSubmitting(false);
    }
  }

  // Read-only thread display stays here (both roles); the compose/send
  // (LPO) and reply-log write actions moved to AdminBookingFinance.tsx,
  // reached only via the renderCorrespondencePanel/renderReplyLogButton
  // slots below. Depends on the whole `booking` reference, not just
  // booking.id, so it re-fetches after those extensions call
  // onBookingUpdated to signal "the thread may have changed."
  const [correspondence, setCorrespondence] = useState<BookingCorrespondenceRow[] | null>(null);

  const [changeDatesOpen, setChangeDatesOpen] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState(booking.arrival_date);
  const [newCheckOut, setNewCheckOut] = useState(booking.departure_date);
  const [changeDatesReason, setChangeDatesReason] = useState("");
  const [changeDatesError, setChangeDatesError] = useState<string | null>(null);
  const [changeDatesSubmitting, setChangeDatesSubmitting] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeePreview, setCancelFeePreview] = useState<{ fee: number | null; currency: string } | null>(null);
  const [cancelFeeLoading, setCancelFeeLoading] = useState(false);
  const [cancelFeeError, setCancelFeeError] = useState<string | null>(null);

  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function handleClaimSubmit() {
    const token = localStorage.getItem("token") || "";
    setClaimSubmitting(true);
    setClaimError(null);
    try {
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/claim`, token, {
        method: "POST",
      });
      onBookingUpdated(updated);
      // Admin/Agent Component Separation refactor: the auto-invoice-on-
      // claim side effect (Decision 080) is now AdminBookingFinance.tsx's
      // own concern, reached only through this optional slot -- the base
      // has no invoice state left to manage, and AgentDashboard_v2.tsx's
      // usage never provides this slot at all.
      adminExtensions?.onAfterClaim?.({ booking: updated, onBookingUpdated });
    } catch (err: any) {
      setClaimError(err.message || t("bookingDetail.claimFailed"));
    } finally {
      setClaimSubmitting(false);
    }
  }

  function openCancelPanel() {
    setChangeDatesOpen(false);
    setCancelError(null);
    setCancelReason("");
    setCancelOpen(true);
    setCancelFeePreview(null);
    setCancelFeeError(null);
    setCancelFeeLoading(true);
    const token = localStorage.getItem("token") || "";
    fetchJson<CancellationPolicy[]>(
      `/contract-engine/contracts/${booking.contract_id}/cancellation-policies?check_in=${booking.arrival_date}`,
      token
    )
      .then((policies) => setCancelFeePreview(resolveCancellationFeePreview(policies, booking)))
      .catch((err) => setCancelFeeError(err.message || t("bookingDetail.feeCalcFailed")))
      .finally(() => setCancelFeeLoading(false));
  }

  async function handleCancelSubmit() {
    if (cancelReason.trim().length < 2) {
      setCancelError(t("bookingDetail.cancelReasonRequired"));
      return;
    }
    const token = localStorage.getItem("token") || "";
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      // Decision 104: this now only REQUESTS cancellation (stage 1 of 2)
      // -- status becomes "Cancellation Requested", allotment is NOT
      // released yet. Final "Cancelled" only happens once an admin
      // enters the hotel's own cancellation acknowledgment via
      // CancellationConfirmationEdit below (stage 2).
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/cancel`, token, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      onBookingUpdated(updated);
      setCancelOpen(false);
      setCancelReason("");

      // Best-effort, same fire-and-forget pattern as the date-change flag
      // call above -- no request body (the note is built server-side
      // from booking.cancellation_reason, never trusting client-supplied
      // prose for a permanent audit record, per Decision 094's own
      // established principle). Fires unconditionally regardless of role
      // (Decision 098) -- this base no longer has any invoice state to
      // populate from the response, so the result is simply discarded;
      // AdminBookingFinance.tsx's own invoice slot re-fetches independently.
      fetchJson(`/finance-engine/bookings/${booking.id}/flag-cancellation-requested`, token, {
        method: "POST",
      }).catch(() => {
        // Best-effort -- nothing to recover here even if this fails.
      });
    } catch (err: any) {
      setCancelError(err.message || t("bookingDetail.cancelRequestFailed"));
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleChangeDatesSubmit() {
    if (!newCheckIn || !newCheckOut || changeDatesReason.trim().length < 2) {
      setChangeDatesError(t("bookingDetail.changeDatesRequired"));
      return;
    }
    const token = localStorage.getItem("token") || "";
    const oldArrival = booking.arrival_date;
    const oldDeparture = booking.departure_date;
    setChangeDatesSubmitting(true);
    setChangeDatesError(null);
    try {
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/change-dates`, token, {
        method: "POST",
        body: JSON.stringify({
          new_arrival_date: newCheckIn,
          new_departure_date: newCheckOut,
          reason: changeDatesReason.trim(),
        }),
      });
      onBookingUpdated(updated);
      setChangeDatesOpen(false);
      setChangeDatesReason("");
      // Decision 083 (Requirement 2), extended by Decision 094, fixed by
      // Decision 098: best-effort, frontend-only side effect -- appends
      // a numbered review note for this booking's invoice (if any, and
      // not Void), same shape as Decision 080's claim-auto-invoice.
      // Only the old dates are sent -- the new dates are already on the
      // booking row by now (the change-dates call above already
      // succeeded), and the backend recomputes the real price breakdown
      // for both sides itself rather than trusting a client-supplied
      // number for a permanent audit record. Never affects the date
      // change itself, which already succeeded above.
      //
      // Decision 098: deliberately NOT gated by permissions.canConfirmWithHotel
      // (nor the old invoice-visibility flag it replaced) -- a real, traced
      // bug found that gate (meant only for "can this user see Draft invoice
      // data") also silently blocked an agent's own date change from ever
      // flagging their own booking's invoice, since AgentDashboard_v2.tsx
      // passes no adminExtensions at all. This call now fires for ANY
      // successful date change, agent or admin; Finance Engine's own
      // endpoint independently enforces who's actually allowed to do this
      // (_require_admin_or_owning_agent). This base has no invoice state
      // to populate from the response anymore -- AdminBookingFinance.tsx's
      // own invoice/urgent-badge slots re-fetch independently.
      fetchJson(`/finance-engine/bookings/${booking.id}/flag-for-review`, token, {
        method: "POST",
        body: JSON.stringify({
          old_arrival_date: oldArrival,
          old_departure_date: oldDeparture,
        }),
      }).catch(() => {
        // Best-effort -- nothing to recover here even if this fails.
      });
    } catch (err: any) {
      setChangeDatesError(err.message || t("bookingDetail.changeDatesFailed"));
    } finally {
      setChangeDatesSubmitting(false);
    }
  }

  // Scoped to the SELECTED room (same "which room is this data for"
  // fix the Rooms section itself already established for dates/pricing)
  // -- previously always fetched every guest across the whole
  // application via /bookings/{id}/guests, so a 2-room booking showed
  // both rooms' guests at once regardless of which room card was
  // selected, a real gap the project owner found live. Waits for
  // `rooms` to resolve (null while loading) before fetching, so this
  // never fires once against the unscoped "everyone" endpoint and then
  // again against the scoped one -- selectedRoomId is only ever null
  // here for a legacy booking with zero BookingRoom rows at all
  // (rooms === []), where the whole-application endpoint is correct.
  useEffect(() => {
    if (rooms === null) return;
    const token = localStorage.getItem("token") || "";
    setGuests(null);
    setGuestsError(null);
    const url =
      selectedRoomId !== null
        ? `/booking-engine/rooms/${selectedRoomId}/guests`
        : `/booking-engine/bookings/${booking.id}/guests`;
    fetchJson<Guest[]>(url, token)
      .then(setGuests)
      .catch((err) => setGuestsError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, selectedRoomId, rooms === null]);

  // Correspondence thread (Decision 049) -- fetched independently of
  // status/claim state so history stays visible even after a booking
  // moves past Pending. Depends on the whole `booking` reference (not
  // just booking.id) so that a successful send/reply from
  // AdminBookingFinance.tsx's renderCorrespondencePanel/renderReplyLogButton
  // extensions -- which cannot reach this component's setCorrespondence
  // directly, since DetailCtx is deliberately just {booking,
  // onBookingUpdated} -- can trigger a re-fetch here by calling
  // onBookingUpdated with a fresh object reference.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<BookingCorrespondenceRow[]>(`/booking-engine/bookings/${booking.id}/correspondence`, token)
      .then(setCorrespondence)
      .catch(() => setCorrespondence([]));
  }, [booking]);

  // ---- Enterprise-workspace data (presentation only, no new business rule)
  const { profile: hotelProfile, image: hotelImage } = useHotelProfile(effectiveBooking.hotel_id);
  const docs = useBookingDocuments(booking, rooms);

  // Cancellation tiers for Booking Health's deadline check. The cancel panel
  // fetches the same list on demand when it opens; this copy runs on open so
  // the health block can warn about an approaching penalty threshold BEFORE
  // the agent thinks about cancelling, which is the only moment the warning
  // is actually useful. Same endpoint, same interpretation.
  const [healthTiers, setHealthTiers] = useState<CancellationPolicy[] | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    setHealthTiers(null);
    fetchJson<CancellationPolicy[]>(
      `/contract-engine/contracts/${booking.contract_id}/cancellation-policies?check_in=${booking.arrival_date}`,
      token
    )
      .then(setHealthTiers)
      .catch(() => setHealthTiers([]));
  }, [booking.contract_id, booking.arrival_date]);

  // Decision 156B: accordion state. One section open at a time; the one that
  // needs action is opened automatically on first render (owner's choice over
  // "all collapsed" / "always the first one"), so the screen opens on the work
  // rather than on whatever happens to be listed first.
  // null = every section closed, which is now also how a booking opens.
  // `autoOpened`, the guard that stopped the removed auto-open effect from
  // fighting the user's own clicks, went with it.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (key: string) => setOpenSection((cur) => (cur === key ? null : key));

  // Auto-open removed (owner). A booking now opens with every section
  // closed. It used to guess which one to open from what was outstanding --
  // but Booking Health already lists exactly that, so the guess added a
  // second, less complete answer to a question already answered, and forced
  // a scroll past a section the reader had not asked for. What replaces it
  // is `sectionIssues`: each closed row carries a "!" naming what is
  // outstanding inside it, so nothing is hidden and nothing is assumed.

  const timelineSteps = buildTimeline(t, booking, rooms, docs);
  // Decision 163: claim-before-work.
  //
  // A booking nobody has taken on is frozen to a single action. The reason is
  // concrete, not theoretical: BK-000077 reached "confirmed by the hotel",
  // released a guest voucher and reported profit with claimed_by NULL, no LPO
  // ever sent and no hotel reply -- someone typed a confirmation number and
  // the system believed it, with no name attached.
  //
  // Scoped to the ADMIN side only (`adminExtensions` present). An agent sees
  // the real state of their own booking exactly as before and never sees a
  // claim control at all -- this is an internal accountability rule, not
  // something to impose on the customer-facing screen.
  //
  // Admins are NOT exempt (owner, explicitly): an exception would restore the
  // very anonymity this removes.
  const isAdminSide = Boolean(adminExtensions);
  const unclaimed = isAdminSide && booking.claimed_by === null && !TERMINAL_STATUSES.includes(booking.status);
  // Everything off except the one action that resolves the state. Derived
  // centrally so a control added later is locked by default rather than
  // silently escaping the rule.
  const permissions: Permissions = unclaimed
    ? {
        canChangeDates: false,
        canEditGuestDetails: false,
        canEditFlights: false,
        canCancel: false,
        canConfirmWithHotel: false,
        canClaim: rawPermissions.canClaim,
      }
    : rawPermissions;

  const healthItems = computeBookingHealth({
    t,
    booking,
    rooms,
    guests,
    docs,
    transferName: displayTransferName,
    cancellationTiers: healthTiers,
  });
  const sectionIssues = computeSectionIssues({ t, booking, rooms, guests, docs, isAdminSide });
  const historyEvents = buildHistory(t, booking, correspondence, claimerNames);

  // DetailCtx passed to every adminExtensions slot below.
  const ctx: DetailCtx = { booking, onBookingUpdated, rooms };

  return (
    // Design System v1.0, block C: the same overlay+panel shell
    // components/ui/Modal.tsx already owns. align="top" and the
    // backdrop-click close are exactly what this detail view did before.
    // Widened for the three-column workspace -- max-w-6xl could not hold
    // three real columns without each becoming a narrow strip.
    <Modal open onClose={onClose} align="top" maxWidth="max-w-[1400px]" panelClassName="border border-ink/10 p-4 sm:p-6">
      <div className="space-y-4">
        {/* ===== Hero — the booking's "passport": identity, status and the
            five figures an agent opens a booking to check, above the fold
            and in one place. Replaces the old plain title + separate
            status row + facts-grid-only presentation. ===== */}
        <BookingHero
          booking={booking}
          effectiveBooking={effectiveBooking}
          hotelName={hotels[effectiveBooking.hotel_id] ?? hotelName}
          roomTypeName={roomTypes[effectiveBooking.room_type_id] ?? roomTypeName}
          mealPlanLabel={effectiveMealPlanInfo?.meal_name || effectiveMealPlanInfo?.meal_code || ""}
          agentName={claimerNames[booking.agent_id]}
          agencyName={companyNames[booking.agent_id]}
          handlerName={booking.claimed_by !== null ? claimerNames[booking.claimed_by] : undefined}
          roomTypeSummary={roomTypeSummary}
          transferName={displayTransferName}
          specialRequests={displayRoom?.special_requests || booking.special_requests}
          profile={hotelProfile}
          image={hotelImage}
          statusExtra={adminExtensions?.renderStatusBadgeExtra?.(booking)}
          onClose={onClose}
        />

        {/* Decision 163: an unclaimed booking announces itself. Everything
            below is inert until someone takes responsibility for it, so the
            screen has to say why rather than leaving a manager clicking dead
            controls. */}
        {unclaimed && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-danger/60 bg-danger/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-danger">{t("claimGate.title")}</p>
              <p className="mt-0.5 text-xs text-danger/80">{t("claimGate.detail")}</p>
            </div>
            {permissions.canClaim && (
              <button
                type="button"
                onClick={handleClaimSubmit}
                disabled={claimSubmitting}
                className="shrink-0 animate-pulse rounded-lg border-0 bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:animate-none disabled:opacity-60"
              >
                {claimSubmitting ? t("bookingDetail.sending") : t("bookingDetail.claim")}
              </button>
            )}
          </div>
        )}

        {/* ===== Timeline — progress through the real workflow. See
            buildTimeline for why there is no "Waiting Hotel" step. ===== */}
        <Card padding="sm">
          <>
            <ProgressSummary steps={timelineSteps} />
            <BookingTimeline steps={timelineSteps} />
          </>
        </Card>

        {claimError && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{claimError}</div>
        )}

        {/* The two inline write-panels stay full width, directly under the
            header, where they were -- they are focused tasks that take over
            the view, not column content. Unchanged behavior; only their
            position in the document moved. */}
        {cancelOpen && (
          <div className="space-y-3 rounded-xl border border-danger/20 bg-danger/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-danger/80">
              {t("bookingDetail.cancelPanelTitle")}
            </p>
            <div className="rounded-lg bg-white/70 px-3 py-2 text-sm">
              {cancelFeeLoading && <span className="text-slate/50">{t("bookingDetail.feeCalculating")}</span>}
              {cancelFeeError && <span className="text-danger">{cancelFeeError}</span>}
              {!cancelFeeLoading && !cancelFeeError && cancelFeePreview && (
                <span className="text-ink">
                  {t("bookingDetail.cancellationFeeLabel")}{" "}
                  <strong>
                    {cancelFeePreview.fee === null
                      ? t("bookingDetail.noFee")
                      : formatMoney(cancelFeePreview.fee, cancelFeePreview.currency)}
                  </strong>
                </span>
              )}
            </div>
            <textarea
              placeholder={t("bookingDetail.cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
            />
            {cancelError && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{cancelError}</div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelSubmit}
                disabled={cancelSubmitting || cancelFeeLoading}
                className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white shadow-sm shadow-danger/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {cancelSubmitting ? t("bookingDetail.sending") : t("bookingDetail.confirmCancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelOpen(false);
                  setCancelError(null);
                }}
                disabled={cancelSubmitting}
                className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("bookingDetail.cancel")}
              </button>
            </div>
          </div>
        )}

        {changeDatesOpen && (
          <div className="space-y-3 rounded-xl border border-ink/10 bg-sand/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
              {t("bookingDetail.changeDatesPanelTitle")}
            </p>
            <DateRangePicker
              checkIn={newCheckIn}
              checkOut={newCheckOut}
              onChange={(ci, co) => {
                setNewCheckIn(ci);
                setNewCheckOut(co);
              }}
            />
            <textarea
              placeholder={t("bookingDetail.changeDatesReasonPlaceholder")}
              value={changeDatesReason}
              onChange={(e) => setChangeDatesReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
            />
            {changeDatesError && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                {changeDatesError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleChangeDatesSubmit}
                disabled={changeDatesSubmitting}
                className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {changeDatesSubmitting ? t("bookingDetail.sending") : t("bookingDetail.confirm")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChangeDatesOpen(false);
                  setChangeDatesError(null);
                }}
                disabled={changeDatesSubmitting}
                className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("bookingDetail.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* ===== Three independent working areas =====
            lg: 3 columns (12-col grid, 3/5/4) · md: 2 · below: 1.
            The commercial column comes first in source order so that on
            anything narrower than lg -- where columns stack -- Booking
            Health, the total and the actions land above the reference
            data, instead of the agent scrolling past every field to reach
            the block that tells them whether anything needs doing. */}
        {/* Decision 156B: one column, top to bottom. The three columns were of
            unequal height, so the left one ended while the centre and right
            ran on -- Quick Actions sat two screens down and details had to be
            hunted for. */}
        <div className="flex flex-col gap-2">
          {/* ============================ LEFT ============================ */}
          <div className="flex flex-col gap-4">

        {/* ===== Rooms (Stage 1-5, multi-room booking applications) =====
            Every application (single-room or multi-room) is really a
            list of BookingRoom rows -- this is the only place that shows
            each room's own hotel/dates/status and the ONLY place a
            manager can actually approve/reject one (the system never
            auto-confirms a room, even one whose allotment reserved
            successfully). Approve/reject are backend admin-only
            endpoints, so the actions themselves are gated the same way
            ConfirmationNumberEdit already is (canConfirmWithHotel) --
            not a new permission flag. Room pricing (total_amount) is
            money, so it's only shown when adminExtensions is present
            (structurally absent for AgentDashboard_v2.tsx), same
            confidentiality boundary as the financial summary below.

            Reported live: on a single-room application in the AGENT view this
            block says nothing the screen doesn't already say -- hotel, room
            type, dates, nights and guests all repeat the facts grid below,
            and the room's own status is provably identical to the booking's
            (service._recompute_booking_status rolls a lone room's status
            straight up: Pending->Pending, Confirmed->Confirmed, and so on).
            So it is skipped in exactly that case, and only that case. It
            still renders whenever it carries something unique: a second room
            (where it is the room selector), a rejection reason the agent
            genuinely needs to read, or the admin view (approve/reject
            actions and per-room pricing). */}
        {/* Decision 157: a single-room booking's card carried only a status
            chip and a price -- hotel, room type, dates and occupancy are all
            in the hero (Decision 156A). Now hidden for admin too, and not
            just for the agent, UNLESS that one room still needs a decision
            (Pending -> the Approve/Reject buttons live here) or carries a
            rejection reason. Multi-room applications always keep the card:
            there the rooms genuinely differ from each other. */}
        {/* Always rendered now. Decisions 156/157 hid this card, and blanked
            its detail lines, for a single-room application on the grounds
            that the hero already says the same thing -- true of the words,
            but it left BK-000081 rendering an all-but-empty row: a status
            chip and two buttons floating beside nothing, which reads as a
            broken screen rather than as tidy de-duplication. Owner, seeing
            it live: show the room details always, the way a two-room
            application already does. */}
        <Card padding="sm">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate/50">
            {t("bookingDetail.roomsTitle")}
            {rooms && rooms.length > 1 && <span className="ml-1 normal-case text-slate/40">({rooms.length})</span>}
          </h4>
          {roomsError && <p className="text-sm text-danger">{roomsError}</p>}
          {!rooms && !roomsError && <p className="text-sm text-slate/50">{t("bookingDetail.roomsLoading")}</p>}
          {roomActionError && (
            <div className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{roomActionError}</div>
          )}
          {rooms && rooms.length > 1 && (
            <p className="mb-2 text-xs text-slate/50">{t("bookingDetail.roomsClickHint")}</p>
          )}
          {rooms && rooms.length > 0 && (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`rounded-lg border p-3 transition-colors ${
                    rooms.length > 1 ? "cursor-pointer" : ""
                  } ${
                    room.id === selectedRoomId
                      ? "border-gold bg-gold/5"
                      : "border-ink/10 hover:border-gold/30"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {/* Shown for every room, one or many. Decision 156
                        suppressed these three lines on a single-room
                        application because the hero repeats them -- but the
                        left half of the row then had nothing in it at all,
                        so the card read as broken. A room's own hotel, type,
                        dates and occupancy belong on the room. */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {rooms.length > 1 && (
                          <span className="mr-1.5 text-slate/40">#{room.sequence_number}</span>
                        )}
                        {hotels[room.hotel_id] ?? `#${room.hotel_id}`} —{" "}
                        {roomTypes[room.room_type_id] ?? `#${room.room_type_id}`}
                      </p>
                      <p className="text-xs text-slate/50">
                        {formatDate(room.arrival_date)} — {formatDate(room.departure_date)} (
                        {t("bookingDetail.nights", { count: room.nights })})
                      </p>
                      <p className="text-xs text-slate/50">
                        {t("bookingDetail.adultsCount", { count: room.adults })} /{" "}
                        {t("bookingDetail.childrenCount", { count: room.children })} /{" "}
                        {t("bookingDetail.infantsCount", { count: room.infants })}
                      </p>
                      {room.rejection_reason && (
                        <p className="mt-1 text-xs text-danger">{room.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={room.status} />
                      {/* The per-room rate used to sit here. Removed on the
                          owner's instruction: with the application total now
                          at the foot of this block ("Booked by the agent
                          at"), two different money figures a few centimetres
                          apart -- one a room line, one the whole booking --
                          invited exactly the confusion he was reading. Every
                          per-room figure is still in the Commercial
                          breakdown, itemized, where money belongs. */}
                      {permissions.canConfirmWithHotel && room.status === "Pending" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setApproveConfirmRoom(room)}
                            disabled={roomActionId === room.id}
                            className="rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                          >
                            {t("bookingDetail.approveRoom")}
                          </button>
                          <ActionInfo text={t("bookingDetail.approveInfo")} />
                          <button
                            type="button"
                            onClick={() => setRejectConfirmRoom(room)}
                            disabled={roomActionId === room.id}
                            className="rounded-lg border border-danger/30 bg-white px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("bookingDetail.rejectRoom")}
                          </button>
                          <ActionInfo tone="danger" text={t("bookingDetail.rejectInfo")} />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Every room carries its own confirmation, one room or
                      many. A single-room application used to send this to a
                      separate "Hotel confirmation" card instead, so the same
                      act lived in two different places depending on how many
                      rooms had been booked -- and on the one-room screen it
                      sat detached from the room it actually describes.
                      Owner: put it inside the room, the way BK-000080
                      already does. */}
                  <RoomConfirmationNumberEdit
                    room={room}
                    canEdit={permissions.canConfirmWithHotel}
                    onUpdated={(updated) =>
                      setRooms((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null)
                    }
                  />
                  {/* Decision 199: the transfer sits on the room, so changing
                      it does too. Editable by the booking's own agent as well
                      as an admin -- the owner's explicit requirement -- and
                      hidden on a room where there is nothing left to arrange. */}
                  {!["Cancelled", "Rejected"].includes(room.status) && (
                    <RoomTransferEdit
                      room={room}
                      currentName={
                        room.transfer_type
                          ? transferNames[`${room.contract_id}:${room.transfer_type}`] ?? room.transfer_type
                          : null
                      }
                      canEdit
                      onUpdated={(updated) =>
                        setRooms((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null)
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {/* The price the agent saw and booked at, with the calculation
              behind it on hover. Admin-only by construction (the slot is
              only ever supplied by AdminBookingFinance.tsx). */}
          {/* Decision 166: the re-confirmation the owner asked for. */}
          <Modal
            open={approveConfirmRoom !== null}
            onClose={() => setApproveConfirmRoom(null)}
            maxWidth="max-w-lg"
          >
            {approveConfirmRoom && (
              <>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {t("approveConfirm.title")}
                </h3>
                <p className="mt-2 text-sm text-slate/70">
                  {t("approveConfirm.body", {
                    room: roomTypes[approveConfirmRoom.room_type_id] ?? `#${approveConfirmRoom.room_type_id}`,
                  })}
                </p>
                {/* The one fact that decides whether this is safe. Stated,
                    not buried: approving before the hotel replies means the
                    voucher leaves with no hotel reference on it. */}
                {approveConfirmRoom.confirmation_number ? (
                  <p className="mt-3 rounded-lg bg-sand/60 px-3 py-2 text-xs text-slate/70">
                    {t("approveConfirm.withNumber", { number: approveConfirmRoom.confirmation_number })}
                  </p>
                ) : (
                  <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
                    {t("approveConfirm.withoutNumber")}
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApproveConfirmRoom(null)}
                    disabled={roomActionId !== null}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60 disabled:opacity-50"
                  >
                    {t("approveConfirm.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveRoom(approveConfirmRoom.id)}
                    disabled={roomActionId !== null}
                    className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {roomActionId !== null ? t("bookingDetail.sending") : t("approveConfirm.confirm")}
                  </button>
                </div>
              </>
            )}
          </Modal>
          {/* Rejecting tells the agent their room could not be confirmed, so
              it gets the same deliberate step Approve has. The reason is
              required and goes into that message -- it is the whole content
              of what the agent will read. */}
          <Modal
            open={rejectConfirmRoom !== null}
            onClose={() => {
              setRejectConfirmRoom(null);
              setRejectReason("");
            }}
            maxWidth="max-w-lg"
            closeOnBackdrop={false}
          >
            {rejectConfirmRoom && (
              <>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {t("rejectConfirm.title")}
                </h3>
                <p className="mt-2 text-sm text-slate/70">
                  {t("rejectConfirm.body", {
                    room: roomTypes[rejectConfirmRoom.room_type_id] ?? `#${rejectConfirmRoom.room_type_id}`,
                  })}
                </p>
                <label className="mt-3 block text-xs font-medium text-slate/60">
                  {t("rejectConfirm.reasonLabel")}
                  <Input
                    scale="sm"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("rejectConfirm.reasonPlaceholder")}
                    className="mt-1"
                  />
                </label>
                <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-snug text-danger">
                  {t("rejectConfirm.consequence")}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectConfirmRoom(null);
                      setRejectReason("");
                    }}
                    disabled={roomActionId !== null}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60 disabled:opacity-50"
                  >
                    {t("approveConfirm.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectRoom(rejectConfirmRoom.id, rejectReason)}
                    disabled={roomActionId !== null || rejectReason.trim().length < 2}
                    className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {roomActionId !== null ? t("bookingDetail.sending") : t("rejectConfirm.confirm")}
                  </button>
                </div>
              </>
            )}
          </Modal>
          {/* Decision 168: the manager's sign-off closing an application the
              company could not fulfil. Not automatic -- the owner's rule is
              that someone grants it. */}
          <Modal
            open={freeCancelOpen}
            onClose={() => setFreeCancelOpen(false)}
            maxWidth="max-w-lg"
            closeOnBackdrop={false}
          >
            <h3 className="font-display text-lg font-semibold text-ink">
              {t("freeCancel.title")}
            </h3>
            <p className="mt-2 text-sm text-slate/70">{t("freeCancel.body")}</p>
            <ul className="mt-3 space-y-1 rounded-lg bg-sand/50 px-3 py-2 text-xs leading-snug text-slate/70">
              <li>· {t("freeCancel.pointFee")}</li>
              <li>· {t("freeCancel.pointVisible")}</li>
              <li>· {t("freeCancel.pointFinal")}</li>
            </ul>
            {freeCancelError && (
              <p className="mt-2 text-xs font-medium text-danger">{freeCancelError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFreeCancelOpen(false)}
                disabled={freeCancelSubmitting}
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60 disabled:opacity-50"
              >
                {t("freeCancel.later")}
              </button>
              <button
                type="button"
                onClick={handleFreeCancel}
                disabled={freeCancelSubmitting}
                className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {freeCancelSubmitting ? t("bookingDetail.sending") : t("freeCancel.confirm")}
              </button>
            </div>
          </Modal>
          {adminExtensions?.renderRoomsTotal?.({
            booking,
            onBookingUpdated,
            bookingRoomId: selectedRoomId ?? null,
            rooms,
          })}
        </Card>

            {/* Owner's ordering, and it reads correctly: the timeline says
                where the booking stands, Rooms says what the booking IS, and
                only then do the numbered sections begin -- Quick actions as
                #1, guests #2, and so on down. Rooms deliberately sits OUTSIDE
                that numbering: it is not a step in the sequence, it is the
                subject the numbered steps act on, and it is also the room
                selector every section below reads from.

                Decision 156B moved Quick Actions above Rooms to get it off
                the second screen; that is still satisfied here -- it sits
                directly under a compact Rooms card, not below every detail
                block as it originally did. */}
            <QuickActionsCard
              openSection={openSection}
              onToggleSection={toggleSection}
              locked={unclaimed}
              booking={booking}
              permissions={permissions}
              docs={docs}
              claimSubmitting={claimSubmitting}
              onClaim={handleClaimSubmit}
              issues={sectionIssues.actions}
              onChangeDates={() => {
                setCancelOpen(false);
                setNewCheckIn(booking.arrival_date);
                setNewCheckOut(booking.departure_date);
                setChangeDatesError(null);
                setChangeDatesOpen(true);
              }}
              onCancel={openCancelPanel}
            />

            {/* The "Booking information" card that used to sit here is gone
                (owner: "эти информации на верху уже имеется").

                Successive passes had already moved its contents into the
                hero -- hotel, room type, meal plan, dates, nights, guests,
                booking date (Decision 156), then flights to the Flights
                card, then transfer to sit with them. What remained by the
                end was agent, agency and who is handling it, all three of
                which the hero also shows: a numbered section whose only job
                was making a manager open it to re-read the header.

                Its one genuinely unique field, special requests, was NOT
                dropped with it -- it moved into the hero, where it is now
                always visible rather than behind a collapsed card. Said out
                loud because "we removed a duplicated section" and "we
                removed a guest's request" are very different things. */}

            {/* The standalone "Hotel confirmation" card is gone. It existed
                only for single-room applications; a 2+-room one has always
                entered its numbers per room, because one shared field would
                silently apply a single hotel reference to every room (the
                real bug reported on BK-000066). That split meant the same
                act lived in two different places depending on room count,
                and on the one-room screen it sat detached from the room it
                describes. Now every room carries its own, and this card has
                nothing left to do.

                The booking-level `confirmation_number` column and its
                `ConfirmationNumberEdit` editor are untouched and still
                readable everywhere -- only this one entry point moved, so
                every existing booking that already has a booking-level
                number keeps showing it. Nothing was migrated. */}

            {/* Legacy applications with no BookingRoom rows at all have no
                room to hang a confirmation on, so they keep the old field --
                without this they would have no way to record one. */}
            {rooms !== null && rooms.length === 0 &&
              (permissions.canConfirmWithHotel || booking.confirmation_number) && (
                <SectionCard
                  title={t("bookingDetail.hotelConfirmationTitle")}
                  action={
                    <ConfirmationNumberEdit
                      booking={booking}
                      onUpdated={onBookingUpdated}
                      canEdit={permissions.canConfirmWithHotel}
                    />
                  }
                />
              )}

            {/* ===== Подтверждение отмены отелем (Decision 104) — stage 2
                of the two-step cancellation workflow. Admin-only, same
                canConfirmWithHotel boundary as confirmation_number above
                (an agent can request cancellation on their own booking,
                but does not confirm the hotel processed it) -- this is
                hotel-confirmation authority, not money-secrecy, per the
                Admin/Agent Component Separation refactor's renamed
                permission. Only shown while status is still "Cancellation
                Requested" -- once confirmed, status flips to "Cancelled"
                and this section naturally stops rendering. ===== */}
            {permissions.canConfirmWithHotel && booking.status === "Cancellation Requested" && (
              <SectionCard
                title={t("bookingDetail.cancellationConfirmationTitle")}
                action={<CancellationConfirmationEdit booking={booking} onUpdated={onBookingUpdated} />}
              />
            )}

            {/* Decision 104: covers both stages now -- a "Cancellation
                Requested" booking already has the request-side fields
                (reason/cancelled_at/fee/cancelled_by, frozen at request
                time); "Cancelled" additionally has the confirmation-side
                fields (populated only once stage 2 completes). */}
            {(booking.status === "Cancellation Requested" || booking.status === "Cancelled") && (
              <div className="rounded-2xl border border-cancelled/25 bg-cancelled/5 p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-cancelled">{t("bookingDetail.cancellationSectionTitle")}</p>
                <p className="mt-1 text-slate/70">
                  {t("bookingDetail.reasonLabel")} {booking.cancellation_reason || "—"}
                </p>
                <p className="text-slate/70">
                  {t("bookingDetail.requestedLabel")}{" "}
                  {booking.cancelled_at ? formatDate(booking.cancelled_at) : "—"}
                </p>
                <p className="text-slate/70">
                  {t("bookingDetail.requestedByLabel")}{" "}
                  <strong className="text-ink">{booking.cancelled_by !== null ? (claimerNames[booking.cancelled_by] ?? `#${booking.cancelled_by}`) : "—"}</strong>
                </p>
                <p className="text-slate/70">
                  {t("bookingDetail.feeLabel")} {formatMoney(booking.cancellation_fee, booking.currency)}
                </p>
                {booking.status === "Cancelled" ? (
                  <>
                    <p className="mt-2 text-slate/70">
                      {t("bookingDetail.confirmedByHotelLabel")}{" "}
                      {booking.cancellation_confirmed_at ? formatDate(booking.cancellation_confirmed_at) : "—"}
                      {booking.cancellation_confirmation_number && (
                        <> ({t("bookingDetail.numberLabel")} {booking.cancellation_confirmation_number})</>
                      )}
                    </p>
                    <p className="text-slate/70">
                      {t("bookingDetail.confirmedByLabel")}{" "}
                      <strong className="text-ink">{booking.cancellation_confirmed_by !== null ? (claimerNames[booking.cancellation_confirmed_by] ?? `#${booking.cancellation_confirmed_by}`) : "—"}</strong>
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-warning">{t("bookingDetail.awaitingHotelConfirmation")}</p>
                )}
              </div>
            )}
          </div>

          {/* =========================== CENTER ===========================
              The travelling party and its paperwork: who is going, how they
              arrive, what documents exist, and what has happened to this
              booking so far. */}
          <div className="flex flex-col gap-4">
            {/* Guests. Scoped to the SELECTED room exactly as before (see the
                guests effect above) -- only the presentation changed, from
                one dense line per guest to a card that always shows the
                passport/nationality/date-of-birth fields, filled or not. */}
            <SectionCard
              sectionKey="guests"
              issues={sectionIssues.guests}
              openSection={openSection} onToggleSection={toggleSection}
              summary={t("bookingDetail.summaryGuests", { count: guests?.length ?? 0 })}
              id="booking-guests"
              title={
                rooms && rooms.length > 1 && displayRoom
                  ? `${t("bookingDetail.guestsTitle")} · #${displayRoom.sequence_number}`
                  : t("bookingDetail.guestsTitle")
              }
            >
              {guestsError && <p className="text-sm text-danger">{guestsError}</p>}
              {!guests && !guestsError && <p className="text-sm text-slate/50">{t("bookingDetail.guestsLoading")}</p>}
              {guests && guests.length === 0 && <p className="text-sm text-slate/50">{t("bookingDetail.noGuests")}</p>}
              {guests && guests.length > 0 && (
                <ul className="space-y-2.5">
                  {guests.map((g) => (
                    <GuestRow
                      key={g.id}
                      guest={g}
                      canEdit={permissions.canEditGuestDetails}
                      onUpdated={(updated) =>
                        setGuests((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
                      }
                    />
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Flights. Previously two conditional rows inside the facts
                grid, shown only when already filled -- so the agent who
                had not yet entered them saw nothing at all to enter them
                into. Now a real card, with the same FlightNumbersEdit
                write path and the same canEditFlights gate. */}
            <FlightsCard
              openSection={openSection}
              onToggleSection={toggleSection}
              booking={booking}
              onBookingUpdated={onBookingUpdated}
              canEdit={permissions.canEditFlights}
              guests={guests}
              issues={sectionIssues.flights}
            />

            {/* ===== Документы (Decision 102) — visible to admin and the
                owning agent alike; not gated by permissions at all since
                this is about document access/ownership, not the Cost/
                Profit confidentiality boundary. ===== */}
            <DocumentsSection docs={docs} openSection={openSection} onToggleSection={toggleSection} issues={sectionIssues.documents} />

            {/* ===== LPO — запрос на подтверждение отелю (Decision 046, gated
                admin-only by Decision 103) =====
                This is outbound communication to a hotel on the company's
                behalf, not booking-operations data -- same category as
                invoice management, not something an individual agent
                should be able to compose/dispatch themselves. The backend
                (claim_booking/send_correspondence) now enforces this too;
                structurally absent here rather than merely gated -- entirely
                AdminBookingFinance.tsx's concern via renderCorrespondencePanel,
                still wrapped in the SAME booking-state condition the LPO panel
                always checked. */}
            {booking.status === "Pending" &&
              booking.claimed_by !== null &&
              adminExtensions?.renderCorrespondencePanel?.(ctx)}

            {/* ===== Переписка с отелем (Decision 049) =====
                Renders only when there is something to read, or when the
                admin side has its own reply-logging control to place in it
                -- an empty bordered box for an internal, manager-driven
                process was reported live as pure noise in the agent view.
                Nothing is hidden that ever had content: a real thread still
                shows for everyone, agent included (Decision 103's read/write
                split is untouched). */}
            {(correspondence === null || correspondence.length > 0 || adminExtensions?.renderReplyLogButton) && (
              <SectionCard
                sectionKey="correspondence"
                openSection={openSection} onToggleSection={toggleSection}
                summary={t("bookingDetail.summaryCorrespondence", { count: correspondence?.length ?? 0 })}
                title={t("bookingDetail.correspondenceTitle")}
                action={adminExtensions?.renderReplyLogButton?.(ctx)}
              >
                {correspondence === null ? (
                  <p className="text-xs text-slate/50">{t("bookingDetail.correspondenceLoading")}</p>
                ) : correspondence.length === 0 ? (
                  <p className="text-xs text-slate/50">{t("bookingDetail.correspondenceEmpty")}</p>
                ) : (
                  <div className="space-y-2">
                    {correspondence.map((msg) => {
                      const outbound = msg.direction === "outbound";
                      const timestamp = msg.sent_at ?? msg.received_at ?? msg.created_at;
                      return (
                        <div
                          key={msg.id}
                          className={`rounded-lg p-3 text-sm ${outbound ? "ml-6 bg-gold/10" : "mr-6 bg-ink/5"}`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate/50">
                            <span className="font-semibold uppercase tracking-wide">
                              {outbound
                                ? t("bookingDetail.correspondenceOutbound")
                                : t("bookingDetail.correspondenceInbound")}
                            </span>
                            <span>{formatDate(timestamp)}</span>
                          </div>
                          {outbound && (msg.recipient_email || msg.recipient_email_secondary) && (
                            <p className="text-[11px] text-slate/50">
                              {t("bookingDetail.correspondenceTo")}{" "}
                              {[msg.recipient_email, msg.recipient_email_secondary].filter(Boolean).join(", ")}
                            </p>
                          )}
                          {msg.subject && <p className="font-medium text-ink">{msg.subject}</p>}
                          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink">{msg.body}</pre>
                          <p className="mt-1 text-[11px] text-slate/40">
                            {msg.status === "sent" && t("bookingDetail.correspondenceStatusSent")}
                            {msg.status === "replied" && t("bookingDetail.correspondenceStatusReplied")}
                            {msg.status === "draft" && t("bookingDetail.correspondenceStatusDraft")}
                          </p>
                          {/* Decision 154: an outbound message that was
                              recorded but never actually emailed used to be
                              indistinguishable from one the hotel received.
                              Only ever shown for outbound rows, and never
                              for the rows predating the column (null). */}
                          {msg.direction === "outbound" && msg.delivered === false && (
                            <p className="mt-1 rounded bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                              {t("bookingDetail.correspondenceNotDelivered")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            )}

            {/* History — see buildHistory for exactly which events this
                project stores and which it cannot. */}
            <BookingHistoryCard events={historyEvents} openSection={openSection} onToggleSection={toggleSection} />
          </div>

          {/* =========================== RIGHT ============================
              The commercial and decision column. Source-ordered last so it
              reads third on a wide screen, but pulled to the top when the
              columns stack (order-first below lg) -- Booking Health and the
              total are what the agent needs first, not after scrolling
              past every reference field. */}
          <div className="flex flex-col gap-4">
            {rooms && rooms.length > 1 && displayRoom && (
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                {t("bookingDetail.showingRoom", {
                  number: displayRoom.sequence_number,
                  name: `${hotels[displayRoom.hotel_id] ?? `#${displayRoom.hotel_id}`} — ${
                    roomTypes[displayRoom.room_type_id] ?? `#${displayRoom.room_type_id}`
                  }`,
                })}
              </p>
            )}

            {/* ===== Booking Health — the block that answers "is anything
                wrong, and do I need to act?" without opening anything else.
                Rule-based over stored data only, same category as this
                file's existing AI insight strip: no LLM call, no automated
                action, no new backend field. ===== */}
            <BookingHealthCard items={healthItems} />

            {/* ===== Financial summary (Decision 101/102/106 lineage) =====
                AdminBookingFinance.tsx's renderFinancialSummary owns
                Net/Sale/Profit AND the full price breakdown -- structurally
                absent, not just gated, for any caller (e.g.
                AgentDashboard_v2.tsx) that never supplies adminExtensions.
                The base's own default is now a real agent-facing breakdown
                (accommodation / transfer / mandatory tax / grand total)
                instead of a single "Итого" line; see PriceBreakdownCard for
                why the meal and the agent discount are deliberately not
                separate lines there. */}
            {adminExtensions?.renderFinancialSummary ? (
              adminExtensions.renderFinancialSummary({
                booking: effectiveBooking,
                onBookingUpdated,
                bookingRoomId: displayRoom?.id ?? null,
                // Decision 179: the ledger panel needs to know it is showing
                // ONE room of possibly several, so it can name the room and
                // quote the whole booking's price alongside it.
                rooms,
                onSelectRoom: setSelectedRoomId,
                // Resolved here because this component already holds the
                // hotel/room-type/meal-plan/transfer name maps; the
                // extension would otherwise refetch all four to label rows
                // it is already being handed the ids for.
                labels: {
                  hotel: hotels[effectiveBooking.hotel_id] ?? null,
                  roomType: roomTypes[effectiveBooking.room_type_id] ?? null,
                  mealPlan:
                    effectiveMealPlanInfo?.meal_name || effectiveMealPlanInfo?.meal_code || null,
                  transfer: displayTransferName,
                  nights: effectiveBooking.nights,
                  guests: {
                    adults: effectiveBooking.adults,
                    children: effectiveBooking.children,
                    infants: effectiveBooking.infants,
                  },
                },
              })
            ) : (
              <PriceBreakdownCard
                // The application, not the selected room -- this card now
                // covers every room and says so, instead of showing one
                // room's lines under the whole booking's total.
                booking={booking}
                roomTypes={roomTypes}
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
              />
            )}

            {/* ===== Quick actions — every action on this booking, one
                size, one place. Each button is the same permission-gated
                action that already existed in the old header row; the
                admin header slot (invoice creation) is passed straight
                through, unchanged. ===== */}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Reservations screen
// ---------------------------------------------------------------------------

const BookingsList = ({
  scope,
  permissions,
  adminExtensions,
  compactFilters,
  initialDateMode,
}: {
  scope: Scope;
  permissions: Permissions;
  adminExtensions?: AdminBookingExtensions;
  // Admin-only (Decision: 2026-07-27 "make Bookings tidy at 100+/day
  // volume") -- drops the Status/Hotel/Agent dropdowns (a proper
  // replacement filter UI is a separate, future task, not built here)
  // and puts Search first. Defaults to false/undefined so the agent's
  // own Reservations screen (AgentDashboard_v2.tsx) is byte-identical
  // to before -- only AdminBookingFinance.tsx opts in.
  compactFilters?: boolean;
  // Admin-only (Decision: 2026-07-27) -- opens the list already scoped
  // to "By date" in the given view (dateFrom/dateTo both default to
  // today), instead of the agent screen's unscoped default. undefined
  // preserves the exact previous default-off behavior.
  initialDateMode?: { view: "staying" | "created" | "cancellations" };
}) => {
  const { t } = useTranslation("reservations");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [roomTypes, setRoomTypes] = useState<Record<number, string>>({});
  const [mealPlans, setMealPlans] = useState<Record<number, MealPlanInfo>>({});
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  const [companyNames, setCompanyNames] = useState<Record<number, string>>({});
  const [cancellationTiers, setCancellationTiers] = useState<Record<string, CancellationPolicy[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // "By date" view. dateModeView chooses between three genuinely
  // different questions for the selected range: who's actually staying
  // at any point in it (excludes Cancelled/Rejected -- they were never
  // really there), which reservations were CREATED within it
  // (booking_date, independent of whenever the actual stay happens to
  // be), and who was supposed to arrive within it but cancelled.
  // dateFrom/dateTo default to today. Opt-in default-OFF for the agent's
  // own screen (AgentDashboard_v2.tsx never passes initialDateMode --
  // an agent's own booking history shouldn't silently hide everything
  // but today's on first load); the admin queue (AdminBookingFinance.tsx)
  // passes initialDateMode={{view: "created"}} so it opens already
  // scoped to "applications submitted today", matching the reference
  // DMS workflow this was modeled on (2026-07-27).
  // Decision 122-follow-up: when the caller opts into a default date
  // scope at all (today only admin's AdminBookingsList does), date mode
  // can never be turned off -- see the "By date" button's own comment
  // below for why. Agent scope (initialDateMode undefined) is unaffected.
  const dateModeRequired = initialDateMode !== undefined;
  const [dateModeEnabled, setDateModeEnabled] = useState(initialDateMode !== undefined);
  const [dateModeView, setDateModeView] = useState<"staying" | "created" | "cancellations">(
    initialDateMode?.view ?? "staying"
  );
  const [dateFrom, setDateFrom] = useState<string>(todayStr());
  const [dateTo, setDateTo] = useState<string>(todayStr());
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Decision 152: real pagination. `total` is what the server says matches
  // the CURRENT filters, so "1-50 of N" is the truth rather than "the first
  // 500 we happened to load". Measured before this: 572 bookings in the
  // database, 500 fetched, 72 silently invisible with nothing in the UI
  // saying so — at 100 applications/day that cap is one working week.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Server-side date scoping for the "created" (By date) view only --
  // "staying"/"cancellations" stay unscoped-but-capped (same as before)
  // so browsing arrival dates keeps its instant, client-side-only
  // filtering with no reload flicker. null when not in "created" mode
  // (or date mode is off), which the fetch effect below treats as
  // "no server-side date scope, fall back to the safety-capped fetch".
  //
  // Real state (not a plain derived value), updated by its own effect
  // below that deliberately does NOT advance while `dateTo` is still ""
  // -- i.e. the user has picked only the first day of a new range and
  // hasn't finished. Advancing on every `dateFrom` change (even
  // mid-selection) was a real, found bug: it triggered an immediate
  // refetch -> setLoading(true) -> the whole filter bar (including the
  // still-open DateRangePicker) unmounts via this component's own
  // `if (loading) return ...` early return further down, destroying
  // the picker's own `open` state. To the user that looked exactly
  // like "the calendar closes after picking just one date," even
  // though DateRangePicker's own two-click range logic was never
  // actually broken. Only a genuinely complete range (dateTo set)
  // advances this key -- by then DateRangePicker has already
  // legitimately closed itself via its own second-click handler, so
  // the refetch's loading flicker never fights with an open calendar.
  // Decision 152 widened this from the "created" view only to ALL THREE date
  // views: they are all resolved server-side now, so all three can trigger
  // the mid-selection refetch this guard exists to prevent, not just one.
  // The view is part of the key so switching Проживание/Создано/Отмены over
  // the same range still refetches.
  const [createdDateKey, setCreatedDateKey] = useState<string | null>(
    dateModeEnabled && dateTo ? `${dateModeView}|${dateFrom}|${dateTo}` : null
  );
  useEffect(() => {
    if (dateModeEnabled) {
      if (dateTo) setCreatedDateKey(`${dateModeView}|${dateFrom}|${dateTo}`);
      // else: mid-selection (first day picked, second not yet) --
      // deliberately leave the previous key alone, see comment above.
    } else {
      setCreatedDateKey(null);
    }
  }, [dateModeEnabled, dateModeView, dateFrom, dateTo]);

  // Debounced booking-number search -- same setTimeout pattern
  // financeShared.tsx's AgentSearchSelect already uses (~300ms). When
  // active, it OVERRIDES date scoping entirely (fetches ?search=...,
  // no created_from/created_to) -- a real, separate gap found live:
  // search used to only ever look inside whatever was already fetched
  // for the current date window, so a real booking outside that
  // window was invisible to search even though it exists.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Decision 152: every filter the screen offers is now a server parameter.
  // They used to be applied in the browser over whatever slice had been
  // fetched, which quietly turned "who is staying next week" into "who among
  // the newest 500 bookings is staying next week" — an answer that looks
  // right and isn't. Shared by the page fetch, the count fetch and the
  // AI-flag fetch so all three can never disagree about the current scope.
  // Extracted rather than written inline in the dependency arrays below:
  // `scope` may be a fresh object literal on every render of the caller, so
  // depending on it directly would refetch in a loop -- the reason the
  // original effect depended on primitives too.
  const scopedAgentId = scope.type === "agent" ? scope.agentId : null;

  const listFilterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (scopedAgentId !== null) p.set("agent_id", String(scopedAgentId));
    if (debouncedSearch) {
      // Search deliberately OVERRIDES the date scope entirely (Decision
      // 125) — a booking outside the current window must still be findable.
      p.set("search", debouncedSearch);
    } else if (createdDateKey) {
      const [view, from, to] = createdDateKey.split("|");
      p.set("date_view", view);
      p.set("date_from", from);
      p.set("date_to", to || from);
    }
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (hotelFilter !== "all") p.set("hotel_id", hotelFilter);
    if (scope.type === "all" && agentFilter !== "all") p.set("agent_id", agentFilter);
    return p.toString();
  }, [scope.type, scopedAgentId, debouncedSearch, createdDateKey, statusFilter, hotelFilter, agentFilter]);

  // Any change of scope must send the reader back to the first page —
  // staying on page 7 of a result set that now has 2 pages would show an
  // empty screen with no explanation.
  useEffect(() => {
    setPage(0);
  }, [listFilterQuery, sortKey, sortDir]);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);

        const sortQuery = `sort_by=${sortKey}&sort_dir=${sortDir}`;
        const pageQuery =
          `/booking-engine/bookings?limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}` +
          `&${sortQuery}${listFilterQuery ? `&${listFilterQuery}` : ""}`;
        const countQuery =
          `/booking-engine/bookings/count${listFilterQuery ? `?${listFilterQuery}` : ""}`;

        // Page and total are fetched together and from the same filter
        // string, so the list can never claim "of N" from a different
        // question than the rows it is showing.
        const [bookingsData, countData] = await Promise.all([
          fetchJson<Booking[]>(pageQuery, token),
          fetchJson<{ total: number }>(countQuery, token),
        ]);
        setBookings(bookingsData);
        setTotal(countData.total);

        const hotelsData = await fetchJson<Hotel[]>("/hotel-engine/hotels", token);
        const hotelMap: Record<number, string> = {};
        hotelsData.forEach((h) => (hotelMap[h.id] = h.hotel_name));
        setHotels(hotelMap);

        // Agent-scoped view never shows the Агент column/filter, so skip
        // fetching the full user list — no reason to expose other users'
        // data to a plain agent's own booking view.
        if (scope.type === "all") {
          const usersData = await fetchJson<UserRecord[]>("/users", token);
          const userMap: Record<number, string> = {};
          const companyMap: Record<number, string> = {};
          usersData.forEach((u) => {
            userMap[u.id] = u.name;
            if (u.company_name) companyMap[u.id] = u.company_name;
          });
          setAgentNames(userMap);
          setCompanyNames(companyMap);
        }

        const uniqueHotelIds = Array.from(new Set(bookingsData.map((b) => b.hotel_id)));
        const roomTypeMap: Record<number, string> = {};
        await Promise.all(
          uniqueHotelIds.map(async (hotelId) => {
            const roomTypesData = await fetchJson<RoomType[]>(
              `/hotel-engine/hotels/${hotelId}/room-types`,
              token
            );
            roomTypesData.forEach((rt) => (roomTypeMap[rt.id] = rt.room_name));
          })
        );
        setRoomTypes(roomTypeMap);

        const uniqueContractIds = Array.from(new Set(bookingsData.map((b) => b.contract_id)));
        const mealPlanMap: Record<number, MealPlanInfo> = {};
        await Promise.all(
          uniqueContractIds.map(async (contractId) => {
            const mealPlansData = await fetchJson<
              { id: number; meal_code: string; meal_name: string | null }[]
            >(`/contract-engine/contracts/${contractId}/meal-plans`, token);
            mealPlansData.forEach((mp) => (mealPlanMap[mp.id] = { meal_code: mp.meal_code, meal_name: mp.meal_name }));
          })
        );
        setMealPlans(mealPlanMap);

        // Cancellation tiers — one call per unique CONTRACT, not per unique
        // (contract_id, arrival_date) pair (Decision 151).
        //
        // This used to issue one request per pair, which grew with booking
        // volume rather than with catalog size. Measured on 500 generated
        // applications: 302 requests, all to fetch slices of the same 12
        // rows, across only 2 distinct contracts — 51 sequential rounds at
        // the browser's 6-connection limit, ~5.8s of pure waiting at 100ms
        // network latency (0.95s on localhost, which is why it looked fine).
        // Fetching each contract's tiers once and selecting the applicable
        // ones locally is the same information in 2 requests / ~0.12s.
        //
        // tiersApplicableTo is an exact mirror of the filter the endpoint
        // applies when given check_in — see its comment.
        const today = todayStr();
        const nonTerminalFuture = bookingsData.filter(
          (b) => !TERMINAL_STATUSES.includes(b.status) && b.arrival_date > today
        );
        const tierContractIds = Array.from(new Set(nonTerminalFuture.map((b) => b.contract_id)));
        const policiesByContract: Record<number, CancellationPolicy[]> = {};
        await Promise.all(
          tierContractIds.map(async (contractId) => {
            policiesByContract[contractId] = await fetchJson<CancellationPolicy[]>(
              `/contract-engine/contracts/${contractId}/cancellation-policies`,
              token
            );
          })
        );

        // Same map shape as before — keyed by "contractId|arrivalDate" — so
        // computeCancellationDeadlineFlags and every other consumer are
        // untouched by this change.
        const tiersMap: Record<string, CancellationPolicy[]> = {};
        for (const b of nonTerminalFuture) {
          const key = `${b.contract_id}|${b.arrival_date}`;
          if (tiersMap[key]) continue;
          tiersMap[key] = tiersApplicableTo(policiesByContract[b.contract_id] ?? [], b.arrival_date);
        }
        setCancellationTiers(tiersMap);
      } catch (err: any) {
        setError(err.message || t("bookingsList.loadFailed"));
      } finally {
        setLoading(false);
      }
    };
    load();
    // Depend on primitive values, not the scope object itself — a caller
    // passing an inline object literal would otherwise create a new
    // reference every render and refetch in a loop. createdDateKey and
    // debouncedSearch are also primitives (string|null) derived from
    // date-mode/search state, so this re-fetches (server-side scoped)
    // only when the active "created" date window or the debounced
    // search term actually changes, per the same rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFilterQuery, page, sortKey, sortDir]);

  // Decision 108: the "recently changed"/"recently cancelled" flags that
  // used to live here (24h ephemeral, no acknowledgment) were retired --
  // replaced by AdminBookingFinance.tsx's persistent, acknowledgment-aware
  // "Требует внимания" panel, which also correctly covers bookings that
  // have never had an invoice (the old mechanism's gap). pending_soon/
  // cancellation_deadline are unrelated forward-looking predictions, kept
  // as-is.
  // Decision 152: the flags get their OWN fetch, scoped by arrival date,
  // instead of being computed from whatever the list happens to hold.
  //
  // Necessary: with pagination `bookings` is one page, so leaving this as it
  // was would have quietly shrunk the flags to 50 rows. It is also strictly
  // MORE complete than before — previously the admin screen's default view
  // fetches only bookings *created today*, so a stay arriving in three days
  // that was booked last month could never raise a flag at all.
  //
  // Both rules only ever look at near-term arrivals: pending_soon at
  // arrival <= today+7 (including overdue, which is the point), and
  // cancellation_deadline at most (largest tier threshold + 3) days out.
  // FLAG_HORIZON_DAYS covers both with room to spare, sorted by arrival
  // ascending so the cap — if it is ever reached — drops the FURTHEST
  // arrivals, never the most urgent ones.
  const FLAG_HORIZON_DAYS = 60;
  const FLAG_FETCH_CAP = 500;
  const [flagBookings, setFlagBookings] = useState<Booking[]>([]);
  const [flagsTruncated, setFlagsTruncated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + FLAG_HORIZON_DAYS);
    const p = new URLSearchParams({
      limit: String(FLAG_FETCH_CAP),
      arrival_to: toIsoDate(horizon),
      sort_by: "arrival_date",
      sort_dir: "asc",
    });
    if (scopedAgentId !== null) p.set("agent_id", String(scopedAgentId));
    fetchJson<Booking[]>(`/booking-engine/bookings?${p.toString()}`, token)
      .then((rows) => {
        setFlagBookings(rows);
        setFlagsTruncated(rows.length >= FLAG_FETCH_CAP);
      })
      .catch(() => {
        // Best-effort: the flag strip is advisory, and failing it must never
        // take the actual booking list down with it.
        setFlagBookings([]);
        setFlagsTruncated(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedAgentId]);

  // Decision 108: the "recently changed"/"recently cancelled" flags that
  // used to live here (24h ephemeral, no acknowledgment) were retired --
  // replaced by AdminBookingFinance.tsx's persistent, acknowledgment-aware
  // "Требует внимания" panel, which also correctly covers bookings that
  // have never had an invoice (the old mechanism's gap). pending_soon/
  // cancellation_deadline are unrelated forward-looking predictions, kept
  // as-is.
  const aiFlags = useMemo(() => {
    return [
      ...computePendingSoonFlags(flagBookings),
      ...computeCancellationDeadlineFlags(flagBookings, cancellationTiers),
    ];
  }, [flagBookings, cancellationTiers]);

  // Decision 152: these drive the filter dropdowns, so they must NOT be
  // derived from the current page — a page of 50 Pending rows would leave
  // "Pending" as the only status you could still pick, trapping the user in
  // their own filter. Statuses come from the fixed set the backend can
  // return; agents from the already-fetched user map.
  const availableStatuses = useMemo(
    () => [...BOOKING_STATUSES].sort(),
    []
  );

  const availableAgentIds = useMemo(
    () => Object.keys(agentNames).map(Number).sort((a, b) => a - b),
    [agentNames]
  );

  // Decision 152: `bookings` IS the answer now — the server applied every
  // filter and the sort, over the whole dataset rather than over a loaded
  // slice. The name is kept so the render below and the adminExtensions
  // slots (renderListSummary) are untouched.
  //
  // Everything the old client-side version did lives in
  // repository._apply_booking_filters / _booking_order_by, moved there
  // verbatim and verified equal to this code's output on every filter
  // combination at both 72 and 572 bookings before the switch.
  const filteredSorted = bookings;


  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // UX pass (2026-07-29 analysis, item 2 — Google Material's skeleton-
  // screen guidance): this used to be `if (loading) return <p>...</p>`
  // at the very top, before the filter bar was even rendered -- a full
  // unmount of the ENTIRE screen (filter bar, DateRangePicker, table)
  // on every single fetch, including a background refresh triggered by
  // just picking a date. That was the literal root cause of Decision
  // 125's "calendar closes after one click" bug: the open DateRangePicker
  // got torn down and rebuilt from scratch. The filter bar/table shell
  // now always stays mounted; only the table BODY reacts to loading/
  // error, matching the actual shape of what's actually reloading.
  // Admin instance vs the agent's own list. Was recomputed per row inside
  // the map; the header and the column-count arithmetic need it too, and
  // three copies of one predicate is how a column and its header drift out
  // of step.
  const isAdminQueue = Boolean(adminExtensions);
  const columnCount =
    8 +
    (scope.type === "all" ? 1 : 0) +
    (isAdminQueue ? 1 : 0) + // manager
    (adminExtensions?.extraColumnCount ?? 0);
  // First paint (nothing to show yet) gets real skeleton rows -- a
  // background refresh (bookings already has the previous result)
  // keeps showing that stale-but-real data, just dimmed, instead of
  // flashing a skeleton over content that's still perfectly valid to
  // look at for another few hundred milliseconds.
  const isFirstLoad = loading && bookings.length === 0;
  const isBackgroundRefresh = loading && bookings.length > 0;

  return (
    <div>
      <AIInsightStrip flags={aiFlags} hotels={hotels} />
      {/* Decision 152: the flag fetch is bounded (nearest FLAG_HORIZON_DAYS
          of arrivals, capped). If that cap is ever actually reached the
          strip is incomplete, and it says so instead of quietly under-
          reporting — a warning panel that silently misses items is worse
          than no panel. Reaching this needs a dedicated server-side
          "needs attention" query, not a bigger cap. */}
      {flagsTruncated && (
        <p className="-mt-2 mb-3 text-xs text-warning">{t("bookingsList.flagsTruncated")}</p>
      )}

      {/* One toolbar. Search + filters and the date range/view used to be two
          separate rows -- the second one a sand-filled panel of its own -- so
          the controls for one question were split across two visual blocks,
          and the explanatory sentence trailing the view pills collided with
          them on a narrow window (the owner's screenshot). Everything that
          filters the list now sits on one line, and the sentence explaining
          the chosen view moved below it, where it can wrap without pushing
          controls around. */}
      {/* Decision 188: pinned, same as the invoice list -- on a long list the
          filters scrolled away, so changing a status or a date meant
          scrolling back up first. Only the ADMIN instance pins: the agent's
          own dashboard is not a long scrolling queue and this bar sits inside
          its own page flow there. */}
      {/* Each branch builds its OWN complete class list. The first version
          shared a base containing `bg-sand`/`border-b` and appended
          `bg-white`/`border` for the agent branch -- two utilities for one
          property in one class list, which Tailwind resolves by stylesheet
          order, not by the order they appear here. That is a recurring bug
          class in this project, not a hypothetical. */}
      <div
        className={
          isAdminQueue
            ? "sticky top-0 z-30 -mx-5 flex flex-wrap items-center gap-2 border-b border-ink/10 bg-sand px-5 py-3"
            : "mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2.5"
        }
      >
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("bookingsList.searchPlaceholder")}
          scale="lg"
          className="w-56"
        />

        {!compactFilters && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="all">{t("bookingsList.allStatuses")}</option>
              {availableStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(t, s)}
                </option>
              ))}
            </select>

            <select
              value={hotelFilter}
              onChange={(e) => setHotelFilter(e.target.value)}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="all">{t("bookingsList.allHotels")}</option>
              {Object.entries(hotels).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            {scope.type === "all" && (
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                <option value="all">{t("bookingsList.allAgents")}</option>
                {availableAgentIds.map((id) => (
                  <option key={id} value={id}>
                    {agentNames[id] ?? `#${id}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        {/* Admin ("all" scope, initialDateMode passed) MUST always stay
            date-scoped -- previously this toggle could turn date-scoping
            off entirely, which fell back to an unscoped fetch (up to the
            safety cap). At real volume (100+/day) that's exactly the
            "shows everything, hangs" state the project owner flagged
            live: toggling "By date" off, then back to seeing every
            application ever made. There's no legitimate reason to leave
            date mode here, so the toggle itself is hidden rather than
            kept clickable-but-inert -- the date range/view picker below
            is now unconditionally visible for this caller. The agent's
            own dashboard (no initialDateMode) keeps the original opt-in
            toggle unchanged -- one agent's own history is naturally
            bounded by their own volume, not the whole company's. */}
        {!dateModeRequired && (
          <button
            type="button"
            onClick={() => setDateModeEnabled(!dateModeEnabled)}
            className={`appearance-none rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
              dateModeEnabled
                ? "border-gold bg-gold/10 text-gold-deep"
                : "border-ink/15 bg-white text-slate hover:bg-sand/60"
            }`}
          >
            {t("bookingsList.byDate")}
          </button>
        )}

        {(statusFilter !== "all" || hotelFilter !== "all" || agentFilter !== "all" || searchQuery.trim() || dateModeEnabled) && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setHotelFilter("all");
              setAgentFilter("all");
              setSearchQuery("");
              // Restores the screen's own opening default (e.g. the
              // admin Bookings tab opens scoped to "today, by created
              // date") rather than turning date-scoping off entirely --
              // an unscoped fetch showing every application ever made
              // doesn't scale (100+/day => 3000+/month) and isn't a
              // useful "reset" state to land on.
              setDateModeEnabled(initialDateMode !== undefined);
              setDateModeView(initialDateMode?.view ?? "staying");
              setDateFrom(todayStr());
              setDateTo(todayStr());
            }}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
          >
            {t("bookingsList.resetFilters")}
          </button>
        )}
        {dateModeEnabled && (
          <>
            {/* A hairline that separates "what to show" from "when", without
                the two becoming separate blocks again. */}
            <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-ink/10 sm:block" />
            <DateRangePicker
              checkIn={dateFrom}
              checkOut={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
              allowPast
            />
            <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-sand/40 p-0.5">
              {(["staying", "created", "cancellations"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setDateModeView(view)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    dateModeView === view
                      ? "bg-ink text-white"
                      : "text-slate/70 hover:bg-white"
                  }`}
                >
                  {t(
                    view === "staying"
                      ? "bookingsList.dateModeStaying"
                      : view === "created"
                        ? "bookingsList.dateModeCreated"
                        : "bookingsList.dateModeCancellations",
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* The sentence explaining the chosen view. Below the toolbar, not
          inside it: inline it collided with the view pills as soon as the
          window narrowed, and it is the one element here that legitimately
          wraps. */}
      {dateModeEnabled && (
        <p className="mt-1.5 px-1 text-xs text-slate/50">
          {dateModeView === "staying"
            ? t("bookingsList.dateModeStayingDescription")
            : dateModeView === "created"
              ? t("bookingsList.dateModeCreatedDescription")
              : t("bookingsList.dateModeCancellationsDescription")}
        </p>
      )}

      {/* Design System v1.0, block C: this table used to hand-roll the exact
          shell/head/row/cell markup components/ui/Table.tsx already owns
          (that file's own header comment lists this file as one of the seven
          copies it was extracted from -- the admin pages adopted it, the
          agent-facing one never did). Same columns, same sorting, same
          extension slots; only the markup now comes from one place. */}
      {/* The ruled, spreadsheet-style variant, on the ADMIN instance only.
          This same component is the agent's own list, where a handful of
          rows needs no spreadsheet -- and restyling a screen nobody asked
          about is exactly what the opt-in density prop exists to avoid. */}
      <TableShell
        minWidth="1320px"
        density={isAdminQueue ? "grid" : "comfortable"}
        className={`shadow-card transition-opacity ${isBackgroundRefresh ? "pointer-events-none opacity-50" : ""}`}
      >
        <TableHeadRow>
          <TableHeadCell onClick={() => toggleSort("created_at")}>
            {t("bookingsList.columnBookingDate")}{sortArrow("created_at")}
          </TableHeadCell>
          <TableHeadCell onClick={() => toggleSort("arrival_date")}>
            {t("bookingsList.columnArrivalDeparture")}{sortArrow("arrival_date")}
          </TableHeadCell>
          {scope.type === "all" && <TableHeadCell>{t("bookingsList.columnAgent")}</TableHeadCell>}
          {/* Who took it into work. Admin-only: an agent has no business
              seeing which of our managers is handling their booking, and it
              is the same internal queue state the detail header already
              keeps behind the admin boundary. */}
          {isAdminQueue && <TableHeadCell>{t("bookingsList.columnManager")}</TableHeadCell>}
          <TableHeadCell>{t("bookingsList.columnHotel")}</TableHeadCell>
          <TableHeadCell>{t("bookingsList.columnRoomType")}</TableHeadCell>
          <TableHeadCell>{t("bookingsList.columnBookingNumber")}</TableHeadCell>
          <TableHeadCell onClick={() => toggleSort("status")}>
            {t("bookingsList.columnStatus")}{sortArrow("status")}
          </TableHeadCell>
          <TableHeadCell>{t("bookingsList.columnCurrency")}</TableHeadCell>
          <TableHeadCell>{t("bookingsList.columnSalePrice")}</TableHeadCell>
          {adminExtensions?.financialColumnHeaders}
        </TableHeadRow>
          <tbody>
            {isFirstLoad ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={columnCount} />)
            ) : error ? (
              <TableErrorState colSpan={columnCount}>
                {t("bookingsList.errorLabel")} {error}
              </TableErrorState>
            ) : filteredSorted.length === 0 ? (
              <TableEmptyState colSpan={columnCount}>
                {t("bookingsList.noBookingsFound")}
              </TableEmptyState>
            ) : (
              filteredSorted.map((b) => {
                // "Взято в работу" overlay (independent of the status
                // badge): only meaningful for Pending bookings -- a
                // Cancelled/old booking doesn't need an "has anyone
                // looked at this" signal. Unclaimed Pending gets a
                // strong, unmistakable red highlight to demand
                // attention; claimed Pending gets a quiet "in review"
                // chip instead (see inReview below) -- neither the alarm
                // nor a silent return to "looks resolved". hover: is
                // overridden too (not just left as the default
                // hover:bg-sand/40) so hovering never washes out the
                // signal -- it intensifies it instead.
                //
                // Booking-control plan, Phase A: this overlay only means
                // something to a manager deciding what to pick up next --
                // an agent's own list (adminExtensions absent, see
                // Decision 107's structural admin/agent split) would
                // otherwise show virtually every fresh booking she just
                // submitted as a red "alarm", since Pending+unclaimed is
                // simply the normal starting state, not a problem. Scoped
                // to the admin queue only.
                // Decision 177: "nobody has taken this on" is about the
                // OWNER, not the status. Gating on Pending meant a Confirmed
                // booking with claimed_by NULL -- the exact case Decision 163
                // exists for, a released voucher with nobody's name on it --
                // showed neither the red state nor a Take button, and the
                // carry-forward (Decision 164) floated it into today's list
                // forever with no way to resolve it.
                const needsAttention =
                  isAdminQueue && b.claimed_by === null && !TERMINAL_STATUSES.includes(b.status);
                const inReview = isAdminQueue && b.status === "Pending" && b.claimed_by !== null;
                return (
                  <TableRow
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className={
                      needsAttention ? "border-l-8 border-l-danger bg-danger/15 hover:bg-danger/25" : ""
                    }
                  >
                    <TableCell className="whitespace-nowrap text-slate/70">{formatDate(b.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate/70">
                      {formatDate(b.arrival_date)} → {formatDate(b.departure_date)}
                    </TableCell>
                    {scope.type === "all" && (
                      <TableCell>{agentNames[b.agent_id] ?? `#${b.agent_id}`}</TableCell>
                    )}
                    {/* agentNames is a user-id -> name map, not agents only,
                        so the manager who claimed it resolves from the same
                        one -- no second fetch. An unclaimed booking says so
                        rather than showing a bare id. */}
                    {isAdminQueue && (
                      <TableCell className={b.claimed_by === null ? "text-slate/40" : ""}>
                        {b.claimed_by === null
                          ? t("bookingsList.notTakenShort")
                          : agentNames[b.claimed_by] ?? `#${b.claimed_by}`}
                      </TableCell>
                    )}
                    <TableCell>{hotels[b.hotel_id] ?? `#${b.hotel_id}`}</TableCell>
                    <TableCell>{roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}</TableCell>
                    <TableCell className="font-medium text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {b.booking_number}
                        {needsAttention && (
                          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {t("bookingsList.needsAttention")}
                          </span>
                        )}
                        {/* Decision 164: take it without opening it. Same
                            permission gate as the detail's own button. */}
                        {needsAttention && permissions.canClaim && (
                          <RowTakeButton
                            booking={b}
                            onClaimed={(updated) => {
                              setBookings((prev) =>
                                prev.map((row) => (row.id === updated.id ? updated : row)),
                              );
                              adminExtensions?.onAfterClaim?.({
                                booking: updated,
                                onBookingUpdated: (next) =>
                                  setBookings((prev) =>
                                    prev.map((row) => (row.id === next.id ? next : row)),
                                  ),
                              });
                            }}
                          />
                        )}
                        {inReview && (
                          <span className="rounded-full border border-ink/15 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate/70">
                            {t("bookingsList.inReview")}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={b.status} />
                        {adminExtensions?.renderStatusBadgeExtra?.(b)}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate/70">{b.currency}</TableCell>
                    <TableNumericCell className="font-medium text-ink">
                      {formatNumber(saleTotal(b))}
                    </TableNumericCell>
                    {adminExtensions?.renderFinancialColumnCells?.(b)}
                  </TableRow>
                );
              })
            )}
          </tbody>
      </TableShell>

      {/* Decision 152: real pagination. The count is the server's answer for
          the CURRENT filters, so nothing is hidden without saying so — the
          previous version showed "N" meaning "however many of the newest 500
          survived the client-side filter", with anything past that cap simply
          absent. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate/60">
          {total === 0 ? (
            <>
              {t("bookingsList.totalLabel")}{" "}
              <strong className="text-ink">{t("bookingsList.totalCount", { count: 0 })}</strong>
            </>
          ) : (
            <>
              {t("bookingsList.showingRange", {
                from: page * PAGE_SIZE + 1,
                to: page * PAGE_SIZE + filteredSorted.length,
              })}{" "}
              <strong className="text-ink">{t("bookingsList.totalCount", { count: total })}</strong>
            </>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              {t("bookingsList.prevPage")}
            </button>
            <span className="text-sm text-slate/70">
              {t("bookingsList.pageOf", {
                page: page + 1,
                pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
              })}
            </span>
            <button
              type="button"
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              {t("bookingsList.nextPage")}
            </button>
          </div>
        )}
      </div>

      {/* renderListSummary now receives ONE PAGE, not the whole filtered set,
          so its figures are page-scoped. Said out loud rather than left for
          the reader to assume — a "Total profit" that silently means "this
          page's profit" is worse than one that admits its scope. A true
          across-the-filter aggregate needs its own Finance endpoint. */}
      {adminExtensions?.renderListSummary && total > filteredSorted.length && (
        <p className="mt-3 text-xs text-slate/50">{t("bookingsList.summaryPageScoped")}</p>
      )}
      {adminExtensions?.renderListSummary?.(filteredSorted)}

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          hotelName={hotels[selectedBooking.hotel_id] ?? `#${selectedBooking.hotel_id}`}
          roomTypeName={roomTypes[selectedBooking.room_type_id] ?? `#${selectedBooking.room_type_id}`}
          hotels={hotels}
          roomTypes={roomTypes}
          mealPlans={mealPlans}
          mealPlanInfo={mealPlans[selectedBooking.meal_plan_id]}
          onClose={() => setSelectedBooking(null)}
          onBookingUpdated={(updated) => {
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            setSelectedBooking(updated);
          }}
          permissions={permissions}
          claimerNames={agentNames}
          companyNames={companyNames}
          adminExtensions={adminExtensions}
        />
      )}
    </div>
  );
};

export default BookingsList;
