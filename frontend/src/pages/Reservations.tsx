import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { API_URL } from "../config";
import { DateRangePicker } from "./HotelSearch";

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
}

interface CancellationPolicy {
  id: number;
  contract_id: number;
  days_before_arrival: number;
  penalty_type: string;
  penalty_value: number;
  currency: string | null;
  description: string | null;
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
}

const TERMINAL_STATUSES = ["Cancelled", "Rejected", "Completed"];

// ---------------------------------------------------------------------------
// Fetch helper — same pattern as HotelSearch.tsx's fetchJson
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
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

const STATUS_LABELS: Record<string, string> = {
  Draft: "Черновик",
  Pending: "В ожидании",
  Confirmed: "Подтверждено",
  // Decision 104: intermediate stage -- allotment is still held, the
  // hotel hasn't yet acknowledged the cancellation.
  "Cancellation Requested": "Запрос на отмену",
  Cancelled: "Отменено",
  Rejected: "Отклонено",
  Completed: "Завершено",
};

const STATUS_CLASSES: Record<string, string> = {
  Draft: "bg-slate/10 text-slate",
  Pending: "bg-coral/15 text-coral",
  Confirmed: "bg-teal/15 text-teal",
  // Amber, deliberately distinct from both Cancelled's neutral slate and
  // Rejected's red -- signals "in progress, not final."
  "Cancellation Requested": "bg-amber-500/15 text-amber-600",
  Cancelled: "bg-slate/10 text-slate",
  Rejected: "bg-red-500/15 text-red-600",
  Completed: "bg-teal/15 text-teal",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_CLASSES[status] ?? "bg-slate/10 text-slate"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
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
function saleTotal(b: Booking): number {
  return b.total_amount + (b.transfer_total ?? 0) + (b.mandatory_tax_total ?? 0);
}

// ---------------------------------------------------------------------------
// AI insight strip — rule-based only (plain threshold checks below), NOT an
// LLM call. "AI" here means Level-1-Advisor style surfacing of patterns
// already present in stored data, no automated actions taken.
// ---------------------------------------------------------------------------

type AIFlag =
  | { kind: "pending_soon"; booking: Booking; daysUntilArrival: number }
  | { kind: "cancellation_deadline"; booking: Booking; nextThreshold: number; daysUntilCross: number }
  | { kind: "recently_changed"; booking: Booking; hoursAgo: number }
  | { kind: "recently_cancelled"; booking: Booking; hoursAgo: number };

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

// Admin-view-only rule (caller filters by scope): bookings whose dates were
// changed by an agent within the last 24h — a "here's what changed, worth a
// glance" signal, not an approval queue (Decision 029: Level 3 autonomous +
// notification, not a Level 2 gate — the change is already applied).
const RECENTLY_CHANGED_WINDOW_HOURS = 24;

// Same pattern, cancellation instead of date-change (Decision 029/033
// addendum: cancellation follows the identical staged rollout as
// date-change — Stage "next" is this notification, nothing about the
// cancellation flow itself changes here).
const RECENTLY_CANCELLED_WINDOW_HOURS = 24;

// The backend serializes datetime.utcnow() as a naive ISO string with no
// "Z"/offset suffix (e.g. "2026-07-08T13:18:14.668797"). new Date(...) on
// such a string parses it as LOCAL time, not UTC — for any viewer whose
// timezone isn't UTC+0, that silently shifts every elapsed-time
// computation by the local offset. Appending "Z" forces correct UTC parsing.
function parseUtcTimestamp(isoString: string): number {
  const withZ = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoString) ? isoString : `${isoString}Z`;
  return new Date(withZ).getTime();
}

function computeRecentlyChangedFlags(bookings: Booking[]): AIFlag[] {
  const now = Date.now();
  return bookings
    .filter((b): b is Booking & { dates_changed_at: string } => b.dates_changed_at !== null)
    .map((b) => ({ booking: b, hoursAgo: (now - parseUtcTimestamp(b.dates_changed_at)) / (1000 * 60 * 60) }))
    .filter((x) => x.hoursAgo >= 0 && x.hoursAgo <= RECENTLY_CHANGED_WINDOW_HOURS)
    .map((x) => ({ kind: "recently_changed" as const, booking: x.booking, hoursAgo: Math.round(x.hoursAgo) }));
}

function isRecentlyChanged(b: Booking): boolean {
  if (!b.dates_changed_at) return false;
  const hoursAgo = (Date.now() - parseUtcTimestamp(b.dates_changed_at)) / (1000 * 60 * 60);
  return hoursAgo >= 0 && hoursAgo <= RECENTLY_CHANGED_WINDOW_HOURS;
}

function computeRecentlyCancelledFlags(bookings: Booking[]): AIFlag[] {
  const now = Date.now();
  return bookings
    .filter((b): b is Booking & { cancelled_at: string } => b.cancelled_at !== null)
    .map((b) => ({ booking: b, hoursAgo: (now - parseUtcTimestamp(b.cancelled_at)) / (1000 * 60 * 60) }))
    .filter((x) => x.hoursAgo >= 0 && x.hoursAgo <= RECENTLY_CANCELLED_WINDOW_HOURS)
    .map((x) => ({ kind: "recently_cancelled" as const, booking: x.booking, hoursAgo: Math.round(x.hoursAgo) }));
}

function isRecentlyCancelled(b: Booking): boolean {
  if (!b.cancelled_at) return false;
  const hoursAgo = (Date.now() - parseUtcTimestamp(b.cancelled_at)) / (1000 * 60 * 60);
  return hoursAgo >= 0 && hoursAgo <= RECENTLY_CANCELLED_WINDOW_HOURS;
}

function flagText(flag: AIFlag, hotelName: string, agentNames: Record<number, string>): string {
  if (flag.kind === "pending_soon") {
    const days = flag.daysUntilArrival;
    const when =
      days < 0
        ? `заезд уже прошёл ${Math.abs(days)} дн. назад`
        : days === 0
          ? "заезд сегодня"
          : `заезд через ${days} дн.`;
    return `${flag.booking.booking_number} (${hotelName}) всё ещё "В ожидании" — ${when}`;
  }
  if (flag.kind === "recently_changed") {
    const agentName = agentNames[flag.booking.agent_id] ?? `#${flag.booking.agent_id}`;
    const when = flag.hoursAgo <= 0 ? "только что" : `${flag.hoursAgo} ч. назад`;
    return `${flag.booking.booking_number} (${hotelName}) — даты изменены агентом ${agentName} ${when}`;
  }
  if (flag.kind === "recently_cancelled") {
    const agentName = agentNames[flag.booking.agent_id] ?? `#${flag.booking.agent_id}`;
    const when = flag.hoursAgo <= 0 ? "только что" : `${flag.hoursAgo} ч. назад`;
    return `${flag.booking.booking_number} (${hotelName}) — отменено агентом ${agentName} ${when}`;
  }
  return `${flag.booking.booking_number} (${hotelName}) — через ${flag.daysUntilCross} дн. ужесточаются условия отмены (штраф начинает действовать за ${flag.nextThreshold} дн. до заезда)`;
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
  agentNames,
}: {
  flags: AIFlag[];
  hotels: Record<number, string>;
  agentNames: Record<number, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (flags.length === 0) return null;

  const first = flags[0];
  const firstHotelName = hotels[first.booking.hotel_id] ?? `#${first.booking.hotel_id}`;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-ink px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral/20 text-coral">
          <IconSparkle className="w-4 h-4" />
        </span>
        <div className="text-sm leading-relaxed text-white/90">
          <p>
            <span className="font-medium text-white">AI заметил:</span> {flagText(first, firstHotelName, agentNames)}
            {flags.length > 1 && <span className="text-white/60"> (и ещё {flags.length - 1})</span>}
          </p>
          {expanded && flags.length > 1 && (
            <ul className="mt-2 space-y-1 text-white/70">
              {flags.slice(1).map((f, i) => (
                <li key={i}>— {flagText(f, hotels[f.booking.hotel_id] ?? `#${f.booking.hotel_id}`, agentNames)}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-white/40">
            Правила на основе пороговых значений, вычисляются на лету — не вызов LLM.
          </p>
        </div>
      </div>
      {flags.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 self-start rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 sm:self-auto"
        >
          {expanded ? "Свернуть" : "Посмотреть детали"}
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
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(guest.first_name);
  const [lastName, setLastName] = useState(guest.last_name);
  const [nationality, setNationality] = useState(guest.nationality ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(guest.date_of_birth ?? "");
  const [passportNumber, setPassportNumber] = useState(guest.passport_number ?? "");
  const [passportExpiry, setPassportExpiry] = useState(guest.passport_expiry ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Имя и фамилия обязательны");
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
        }),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Не удалось сохранить гостя");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-center gap-2 rounded-lg bg-sand/50 px-3 py-2">
        <span className="font-medium text-ink">{guest.first_name} {guest.last_name}</span>
        {guest.is_lead_guest && (
          <span className="rounded-full bg-coral/15 px-2 py-0.5 text-xs text-coral">Основной</span>
        )}
        {guest.nationality && <span className="text-slate/60">· {guest.nationality}</span>}
        {guest.date_of_birth && <span className="text-slate/60">· {formatDate(guest.date_of_birth)}</span>}
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto shrink-0 rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
          >
            Изменить
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Имя *"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder="Фамилия *"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder="Гражданство"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
        <input
          placeholder="Номер паспорта"
          value={passportNumber}
          onChange={(e) => setPassportNumber(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          value={passportExpiry}
          onChange={(e) => setPassportExpiry(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
      </div>
      {error && (
        <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Отмена
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
      setError(err.message || "Не удалось сохранить данные рейсов");
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
        Изменить рейсы
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Номер рейса прилёта"
          value={arrivalFlight}
          onChange={(e) => setArrivalFlight(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder="Номер рейса вылета"
          value={departureFlight}
          onChange={(e) => setDepartureFlight(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title="Дата прилёта (может отличаться от даты заезда)"
            value={arrivalFlightDate}
            onChange={(e) => setArrivalFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
          <input
            type="time"
            title="Время прилёта"
            value={arrivalFlightTime}
            onChange={(e) => setArrivalFlightTime(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title="Дата вылета (может отличаться от даты выезда)"
            value={departureFlightDate}
            onChange={(e) => setDepartureFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
          <input
            type="time"
            title="Время вылета"
            value={departureFlightTime}
            onChange={(e) => setDepartureFlightTime(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
        </div>
      </div>
      <p className="text-[11px] text-slate/50">
        Дата/время рейса могут отличаться от дат заезда/выезда (например, поздний прилёт на следующее утро).
      </p>
      {error && (
        <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Отмена
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
      setError(err.message || "Не удалось сохранить номер подтверждения");
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
        {booking.confirmation_number ? "Изменить номер подтверждения" : "Добавить номер подтверждения"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <input
        placeholder="Номер подтверждения отеля"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
      />
      {value.trim() && value.trim() !== (booking.confirmation_number ?? "") && (
        <p className="text-[11px] text-slate/50">
          При сохранении агенту автоматически будет отправлен ваучер с этим номером.
        </p>
      )}
      {error && (
        <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Отмена
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
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Укажите номер подтверждения отмены");
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
      setError(err.message || "Не удалось подтвердить отмену");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-amber-500/30 bg-white px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
      >
        Подтвердить отмену отелем
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/20 bg-amber-50/40 p-3">
      <input
        placeholder="Номер подтверждения отмены (от отеля)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
      />
      <p className="text-[11px] text-slate/50">
        Подтверждает, что отель обработал отмену — только после этого бронирование станет
        окончательно отменённым и номер вернётся в продажу.
      </p>
      {error && (
        <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Отмена
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

function DocumentsSection({ booking }: { booking: Booking }) {
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

  async function handleDownload(kind: "voucher" | "invoice") {
    setDownloadError(null);
    const token = localStorage.getItem("token") || "";
    const path =
      kind === "voucher"
        ? `/finance-engine/bookings/${booking.id}/voucher/download`
        : `/finance-engine/bookings/${booking.id}/invoice/download`;
    try {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        let detail = `Ошибка запроса (${response.status})`;
        try {
          const body = await response.json();
          if (body?.detail) detail = body.detail;
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
      setDownloadError(err.message || "Не удалось скачать документ");
    }
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Документы</h4>
      <div className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate/70">Ваучер</span>
          {booking.confirmation_number ? (
            <button
              type="button"
              onClick={() => handleDownload("voucher")}
              className="font-medium text-coral hover:underline"
            >
              Скачать
            </button>
          ) : (
            <span className="text-slate/40">В работе</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate/70">Счёт</span>
          {statusLoading ? (
            <span className="text-slate/40">...</span>
          ) : invoiceStatus === "Issued" ? (
            <button
              type="button"
              onClick={() => handleDownload("invoice")}
              className="font-medium text-coral hover:underline"
            >
              Скачать
            </button>
          ) : (
            <span className="text-slate/40">В работе</span>
          )}
        </div>
      </div>
      {downloadError && (
        <p className="mt-1.5 text-xs font-medium text-coral">{downloadError}</p>
      )}
    </div>
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
  mealPlanInfo,
  onClose,
  onBookingUpdated,
  permissions,
  claimerNames,
  adminExtensions,
}: {
  booking: Booking;
  hotelName: string;
  roomTypeName: string;
  mealPlanInfo: MealPlanInfo | undefined;
  onClose: () => void;
  onBookingUpdated: (updated: Booking) => void;
  permissions: Permissions;
  claimerNames: Record<number, string>;
  adminExtensions?: AdminBookingExtensions;
}) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [guestsError, setGuestsError] = useState<string | null>(null);

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
      setClaimError(err.message || "Не удалось взять бронирование в работу");
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
      .catch((err) => setCancelFeeError(err.message || "Не удалось рассчитать штраф"))
      .finally(() => setCancelFeeLoading(false));
  }

  async function handleCancelSubmit() {
    if (cancelReason.trim().length < 2) {
      setCancelError("Укажите причину отмены (минимум 2 символа)");
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
      setCancelError(err.message || "Не удалось запросить отмену бронирования");
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleChangeDatesSubmit() {
    if (!newCheckIn || !newCheckOut || changeDatesReason.trim().length < 2) {
      setChangeDatesError("Укажите обе даты и причину (минимум 2 символа)");
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
      setChangeDatesError(err.message || "Не удалось изменить даты");
    } finally {
      setChangeDatesSubmitting(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Guest[]>(`/booking-engine/bookings/${booking.id}/guests`, token)
      .then(setGuests)
      .catch((err) => setGuestsError(err.message));
  }, [booking.id]);

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

  // DetailCtx passed to every adminExtensions slot below.
  const ctx: DetailCtx = { booking, onBookingUpdated };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">{booking.booking_number}</h3>
            <p className="mt-1 text-sm text-slate/70">{hotelName} — {roomTypeName}</p>
          </div>
          <button
            onClick={onClose}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-slate/70 hover:bg-sand/60"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={booking.status} />
            {adminExtensions?.renderStatusBadgeExtra?.(booking)}
          </div>
          <div className="flex items-center gap-2">
            {permissions.canClaim && booking.status === "Pending" && booking.claimed_by === null && (
              <button
                type="button"
                onClick={handleClaimSubmit}
                disabled={claimSubmitting}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {claimSubmitting ? "Отправка..." : "Взять в работу"}
              </button>
            )}
            {permissions.canChangeDates && booking.status !== "Cancelled" && booking.status !== "Rejected" && booking.status !== "Cancellation Requested" && !changeDatesOpen && !cancelOpen && (
              <button
                type="button"
                onClick={() => {
                  setNewCheckIn(booking.arrival_date);
                  setNewCheckOut(booking.departure_date);
                  setChangeDatesError(null);
                  setChangeDatesOpen(true);
                }}
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
              >
                Изменить даты
              </button>
            )}
            {permissions.canCancel && booking.status !== "Cancelled" && booking.status !== "Rejected" && booking.status !== "Cancellation Requested" && !changeDatesOpen && !cancelOpen && (
              <button
                type="button"
                onClick={openCancelPanel}
                className="rounded-lg border border-red-500/30 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Отменить бронь
              </button>
            )}
            {adminExtensions?.renderHeaderActions?.(ctx)}
          </div>
        </div>

        {claimError && (
          <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{claimError}</div>
        )}

        {/* Requirement (audit trail): claimed_by/claimed_at are permanent
            facts -- "X claimed this at time Y" stays true forever, so this
            display no longer disappears once the booking leaves Pending
            (e.g. gets cancelled). Previously gated on status === "Pending",
            which hid this from view (though never from the database) the
            moment a booking moved past Pending. */}
        {booking.claimed_by !== null && (
          <div className="mt-3 rounded-lg bg-ink/5 p-3 text-sm">
            <p className="text-slate/70">
              В работе: <strong className="text-ink">{claimerNames[booking.claimed_by] ?? `#${booking.claimed_by}`}</strong>
              {booking.claimed_at && <> с {formatDate(booking.claimed_at)}</>}
            </p>
          </div>
        )}

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
        {booking.status === "Pending" && booking.claimed_by !== null && adminExtensions?.renderCorrespondencePanel?.(ctx)}

        {/* ===== Переписка с отелем (Decision 049) ===== */}
        <div className="mt-3 rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Переписка с отелем</p>
            {/* Decision 103: logging a hotel's reply is a write action on
                the same admin-only add_correspondence_reply endpoint the
                LPO panel uses -- reading the thread below stays visible to
                everyone (their own booking's correspondence history is
                reasonable to see); only the write button is
                AdminBookingFinance.tsx's concern now. */}
            {adminExtensions?.renderReplyLogButton?.(ctx)}
          </div>

          {correspondence === null ? (
            <p className="text-xs text-slate/50">Загрузка переписки...</p>
          ) : correspondence.length === 0 ? (
            <p className="text-xs text-slate/50">Переписка пока пуста.</p>
          ) : (
            <div className="space-y-2">
              {correspondence.map((msg) => {
                const outbound = msg.direction === "outbound";
                const timestamp = msg.sent_at ?? msg.received_at ?? msg.created_at;
                return (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 text-sm ${
                      outbound ? "ml-6 bg-coral/10" : "mr-6 bg-ink/5"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate/50">
                      <span className="font-semibold uppercase tracking-wide">
                        {outbound ? "DMC OS → Отель" : "Отель → DMC OS"}
                      </span>
                      <span>{formatDate(timestamp)}</span>
                    </div>
                    {outbound && (msg.recipient_email || msg.recipient_email_secondary) && (
                      <p className="text-[11px] text-slate/50">
                        Кому: {[msg.recipient_email, msg.recipient_email_secondary].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {msg.subject && <p className="font-medium text-ink">{msg.subject}</p>}
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink">{msg.body}</pre>
                    <p className="mt-1 text-[11px] text-slate/40">
                      {msg.status === "sent" && "Отправлено, ожидаем ответ отеля"}
                      {msg.status === "replied" && "Отвечено"}
                      {msg.status === "draft" && "Черновик"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cancelOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-red-500/20 bg-red-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600/80">Отмена бронирования</p>
            <div className="rounded-lg bg-white/70 px-3 py-2 text-sm">
              {cancelFeeLoading && <span className="text-slate/50">Расчёт штрафа...</span>}
              {cancelFeeError && <span className="text-red-600">{cancelFeeError}</span>}
              {!cancelFeeLoading && !cancelFeeError && cancelFeePreview && (
                <span className="text-ink">
                  Штраф за отмену:{" "}
                  <strong>
                    {cancelFeePreview.fee === null
                      ? "без штрафа"
                      : formatMoney(cancelFeePreview.fee, cancelFeePreview.currency)}
                  </strong>
                </span>
              )}
            </div>
            <textarea
              placeholder="Причина отмены *"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
            />
            {cancelError && (
              <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{cancelError}</div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelSubmit}
                disabled={cancelSubmitting || cancelFeeLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-red-600/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {cancelSubmitting ? "Отправка..." : "Подтвердить отмену"}
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
                Отмена
              </button>
            </div>
          </div>
        )}

        {changeDatesOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-ink/10 bg-sand/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Изменить даты</p>
            <DateRangePicker
              checkIn={newCheckIn}
              checkOut={newCheckOut}
              onChange={(ci, co) => {
                setNewCheckIn(ci);
                setNewCheckOut(co);
              }}
            />
            <textarea
              placeholder="Причина изменения дат *"
              value={changeDatesReason}
              onChange={(e) => setChangeDatesReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
            />
            {changeDatesError && (
              <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
                {changeDatesError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleChangeDatesSubmit}
                disabled={changeDatesSubmitting}
                className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {changeDatesSubmitting ? "Отправка..." : "Подтвердить"}
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
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-slate/50">Дата брони: </span>
            <span className="text-ink">{formatDate(booking.created_at)}</span>
          </div>
          <div>
            <span className="text-slate/50">Даты: </span>
            <span className="text-ink">{formatDate(booking.arrival_date)} — {formatDate(booking.departure_date)} ({booking.nights} ноч.)</span>
          </div>
          <div>
            <span className="text-slate/50">Гости: </span>
            <span className="text-ink">{booking.adults} взр. / {booking.children} дет. / {booking.infants} млад.</span>
          </div>
          <div>
            <span className="text-slate/50">Питание: </span>
            <span className="text-ink">{mealPlanInfo?.meal_name || mealPlanInfo?.meal_code || `#${booking.meal_plan_id}`}</span>
          </div>
          {booking.confirmation_number && (
            <div>
              <span className="text-slate/50">Номер подтверждения: </span>
              <span className="text-ink">{booking.confirmation_number}</span>
            </div>
          )}
          {booking.arrival_flight_number && (
            <div>
              <span className="text-slate/50">Рейс прилёта: </span>
              <span className="text-ink">{booking.arrival_flight_number}</span>
            </div>
          )}
          {booking.departure_flight_number && (
            <div>
              <span className="text-slate/50">Рейс вылета: </span>
              <span className="text-ink">{booking.departure_flight_number}</span>
            </div>
          )}
          {booking.special_requests && (
            <div className="col-span-2">
              <span className="text-slate/50">Пожелания: </span>
              <span className="text-ink">{booking.special_requests}</span>
            </div>
          )}
        </div>

        {/* ===== Financial summary (Decision 101/102/106 lineage) =====
            AdminBookingFinance.tsx's renderFinancialSummary now owns Net/
            Sale/Profit AND the "Разбивка стоимости" price-breakdown block
            (the fixed 9-slot interface has no separate slot for the
            breakdown, so it's folded into this one, in the same position
            "Итого" used to occupy) -- structurally absent, not just
            gated, for any caller (e.g. AgentDashboard_v2.tsx) that never
            supplies adminExtensions. The base's own default is the plain
            sale total an agent needs to know they're charged. */}
        {adminExtensions?.renderFinancialSummary ? (
          adminExtensions.renderFinancialSummary(ctx)
        ) : (
          <div className="mt-4 rounded-lg bg-sand/50 p-3 text-sm">
            <p className="text-slate/50">Итого</p>
            <p className="font-medium text-ink">{formatMoney(saleTotal(booking), booking.currency)}</p>
          </div>
        )}

        {/* ===== Подтверждение отеля (Decision 097) ===== */}
        <div className="mt-4 flex items-center justify-between">
          <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Подтверждение отеля</h4>
          <ConfirmationNumberEdit
            booking={booking}
            onUpdated={onBookingUpdated}
            canEdit={permissions.canConfirmWithHotel}
          />
        </div>

        {/* ===== Подтверждение отмены отелем (Decision 104) — stage 2 of
            the two-step cancellation workflow. Admin-only, same
            canConfirmWithHotel boundary as confirmation_number above (an
            agent can request cancellation on their own booking, but does
            not confirm the hotel processed it) -- this is hotel-
            confirmation authority, not money-secrecy, per the Admin/Agent
            Component Separation refactor's renamed permission. Only shown
            while status is still "Cancellation Requested" -- once
            confirmed, status flips to "Cancelled" and this section
            naturally stops rendering. ===== */}
        {permissions.canConfirmWithHotel && booking.status === "Cancellation Requested" && (
          <div className="mt-4 flex items-center justify-between">
            <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">
              Подтверждение отмены
            </h4>
            <CancellationConfirmationEdit booking={booking} onUpdated={onBookingUpdated} />
          </div>
        )}

        {/* ===== Документы (Decision 102) — visible to admin and the
            owning agent alike; not gated by permissions at all since this
            is about document access/ownership, not the Cost/Profit
            confidentiality boundary. ===== */}
        <DocumentsSection booking={booking} />

        {/* Decision 104: covers both stages now -- a "Cancellation
            Requested" booking already has the request-side fields
            (reason/cancelled_at/fee/cancelled_by, frozen at request
            time); "Cancelled" additionally has the confirmation-side
            fields (populated only once stage 2 completes). */}
        {(booking.status === "Cancellation Requested" || booking.status === "Cancelled") && (
          <div className="mt-4 rounded-lg bg-slate/5 p-3 text-sm">
            <p className="font-medium text-ink">Отмена</p>
            <p className="mt-1 text-slate/70">Причина: {booking.cancellation_reason || "—"}</p>
            <p className="text-slate/70">Запрошена: {booking.cancelled_at ? formatDate(booking.cancelled_at) : "—"}</p>
            <p className="text-slate/70">
              Запросил: <strong className="text-ink">{booking.cancelled_by !== null ? (claimerNames[booking.cancelled_by] ?? `#${booking.cancelled_by}`) : "—"}</strong>
            </p>
            <p className="text-slate/70">Штраф: {formatMoney(booking.cancellation_fee, booking.currency)}</p>
            {booking.status === "Cancelled" ? (
              <>
                <p className="mt-2 text-slate/70">
                  Подтверждена отелем: {booking.cancellation_confirmed_at ? formatDate(booking.cancellation_confirmed_at) : "—"}
                  {booking.cancellation_confirmation_number && <> (номер: {booking.cancellation_confirmation_number})</>}
                </p>
                <p className="text-slate/70">
                  Подтвердил: <strong className="text-ink">{booking.cancellation_confirmed_by !== null ? (claimerNames[booking.cancellation_confirmed_by] ?? `#${booking.cancellation_confirmed_by}`) : "—"}</strong>
                </p>
              </>
            ) : (
              <p className="mt-2 text-amber-600">Ожидает подтверждения отелем — номер ещё не освобождён.</p>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Гости</h4>
            <FlightNumbersEdit
              booking={booking}
              onUpdated={onBookingUpdated}
              canEdit={permissions.canEditFlights}
            />
          </div>
          {guestsError && <p className="text-sm text-red-600">{guestsError}</p>}
          {!guests && !guestsError && <p className="text-sm text-slate/50">Загрузка...</p>}
          {guests && guests.length === 0 && <p className="text-sm text-slate/50">Гости не добавлены</p>}
          {guests && guests.length > 0 && (
            <ul className="space-y-1.5 text-sm">
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
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Reservations screen
// ---------------------------------------------------------------------------

const BookingsList = ({
  scope,
  permissions,
  adminExtensions,
}: {
  scope: Scope;
  permissions: Permissions;
  adminExtensions?: AdminBookingExtensions;
}) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [roomTypes, setRoomTypes] = useState<Record<number, string>>({});
  const [mealPlans, setMealPlans] = useState<Record<number, MealPlanInfo>>({});
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  const [cancellationTiers, setCancellationTiers] = useState<Record<string, CancellationPolicy[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Opt-in "by date" view -- unchecked by default so the screen's existing
  // full-list behavior is unaffected until a manager explicitly asks for
  // a single day's picture. dateModeView chooses between three genuinely
  // different questions for that day: who's actually staying (excludes
  // Cancelled/Rejected -- they were never really there), which
  // reservations were CREATED that day (booking_date, independent of
  // whenever the actual stay happens to be), and who was supposed to
  // arrive but cancelled (arrival_date match + Cancelled only).
  const [dateModeEnabled, setDateModeEnabled] = useState(false);
  const [dateModeView, setDateModeView] = useState<"staying" | "created" | "cancellations">("staying");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);

        const bookingsData =
          scope.type === "all"
            ? await fetchJson<Booking[]>("/booking-engine/bookings?limit=500", token)
            : await fetchJson<Booking[]>(`/booking-engine/agents/${scope.agentId}/bookings`, token);
        setBookings(bookingsData);

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
          usersData.forEach((u) => (userMap[u.id] = u.name));
          setAgentNames(userMap);
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

        // Cancellation tiers — only for non-terminal bookings with a future
        // check-in, one call per unique (contract_id, arrival_date) pair.
        const today = todayStr();
        const nonTerminalFuture = bookingsData.filter(
          (b) => !TERMINAL_STATUSES.includes(b.status) && b.arrival_date > today
        );
        const uniqueKeys = Array.from(
          new Set(nonTerminalFuture.map((b) => `${b.contract_id}|${b.arrival_date}`))
        );
        const tiersMap: Record<string, CancellationPolicy[]> = {};
        await Promise.all(
          uniqueKeys.map(async (key) => {
            const [contractId, checkIn] = key.split("|");
            const tiers = await fetchJson<CancellationPolicy[]>(
              `/contract-engine/contracts/${contractId}/cancellation-policies?check_in=${checkIn}`,
              token
            );
            tiersMap[key] = tiers;
          })
        );
        setCancellationTiers(tiersMap);
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки бронирований");
      } finally {
        setLoading(false);
      }
    };
    load();
    // Depend on primitive values, not the scope object itself — a caller
    // passing an inline object literal would otherwise create a new
    // reference every render and refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.type === "agent" ? scope.agentId : null]);

  const aiFlags = useMemo(() => {
    return [
      ...computePendingSoonFlags(bookings),
      ...computeCancellationDeadlineFlags(bookings, cancellationTiers),
      // Admin-view only — an agent doesn't need to be told about their own edit.
      ...(scope.type === "all" ? computeRecentlyChangedFlags(bookings) : []),
      ...(scope.type === "all" ? computeRecentlyCancelledFlags(bookings) : []),
    ];
  }, [bookings, cancellationTiers, scope.type]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.status))).sort(),
    [bookings]
  );

  const availableAgentIds = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.agent_id))),
    [bookings]
  );

  const filteredSorted = useMemo(() => {
    let list = bookings;
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    if (hotelFilter !== "all") list = list.filter((b) => String(b.hotel_id) === hotelFilter);
    if (scope.type === "all" && agentFilter !== "all") {
      list = list.filter((b) => String(b.agent_id) === agentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((b) => b.booking_number.toLowerCase().includes(q));
    }
    if (dateModeEnabled) {
      if (dateModeView === "staying") {
        // ISO "YYYY-MM-DD" strings compare correctly lexicographically --
        // same convention already used elsewhere in this file (e.g. the
        // b.arrival_date > today check above), no Date parsing needed.
        // [arrival_date, departure_date) -- a checkout-day booking has
        // already left, so departure_date itself is excluded.
        list = list.filter(
          (b) =>
            selectedDate >= b.arrival_date &&
            selectedDate < b.departure_date &&
            b.status !== "Cancelled" &&
            b.status !== "Rejected"
        );
      } else if (dateModeView === "created") {
        // created_at is a full ISO datetime ("2026-07-14T12:26:08.987733"),
        // not just a date -- compare only its first 10 characters against
        // selectedDate. Independent of the booking's actual stay dates:
        // a reservation created today for a stay next March belongs here,
        // not in "Заезды".
        list = list.filter((b) => b.created_at.slice(0, 10) === selectedDate);
      } else {
        list = list.filter((b) => b.arrival_date === selectedDate && b.status === "Cancelled");
      }
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === "arrival_date") cmp = a.arrival_date.localeCompare(b.arrival_date);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    bookings,
    statusFilter,
    hotelFilter,
    agentFilter,
    scope.type,
    searchQuery,
    dateModeEnabled,
    dateModeView,
    selectedDate,
    sortKey,
    sortDir,
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  if (loading) {
    return <p className="mt-10 text-center text-sm text-slate/60">Загрузка бронирований...</p>;
  }

  if (error) {
    return <p className="mt-10 text-center text-sm text-red-600">Ошибка: {error}</p>;
  }

  return (
    <div>
      <AIInsightStrip flags={aiFlags} hotels={hotels} agentNames={agentNames} />

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        >
          <option value="all">Все статусы</option>
          {availableStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>

        <select
          value={hotelFilter}
          onChange={(e) => setHotelFilter(e.target.value)}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        >
          <option value="all">Все отели</option>
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
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          >
            <option value="all">Все агенты</option>
            {availableAgentIds.map((id) => (
              <option key={id} value={id}>
                {agentNames[id] ?? `#${id}`}
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по № брони..."
          className="w-48 appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        />

        <button
          type="button"
          onClick={() => setDateModeEnabled(!dateModeEnabled)}
          className={`appearance-none rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
            dateModeEnabled
              ? "border-coral bg-coral/10 text-coral"
              : "border-ink/15 bg-white text-slate hover:bg-sand/60"
          }`}
        >
          По дате
        </button>

        {(statusFilter !== "all" || hotelFilter !== "all" || agentFilter !== "all" || searchQuery.trim() || dateModeEnabled) && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setHotelFilter("all");
              setAgentFilter("all");
              setSearchQuery("");
              setDateModeEnabled(false);
              setDateModeView("staying");
            }}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {dateModeEnabled && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-xl bg-sand/50 px-3.5 py-2.5">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white p-1">
            <button
              type="button"
              onClick={() => setDateModeView("staying")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "staying" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              Заезды
            </button>
            <button
              type="button"
              onClick={() => setDateModeView("created")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "created" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              Созданы
            </button>
            <button
              type="button"
              onClick={() => setDateModeView("cancellations")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "cancellations" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              Отмены
            </button>
          </div>
          <span className="text-xs text-slate/50">
            {dateModeView === "staying"
              ? "Бронирования, у которых выбранная дата попадает в период проживания (заезд ≤ дата < выезд), кроме отменённых/отклонённых"
              : dateModeView === "created"
                ? "Бронирования, созданные в выбранную дату, независимо от дат заезда/выезда"
                : "Бронирования с заездом на выбранную дату, которые были отменены"}
          </span>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("created_at")}
              >
                Дата брони{sortArrow("created_at")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("arrival_date")}
              >
                Заезд → Выезд{sortArrow("arrival_date")}
              </th>
              {scope.type === "all" && <th className="px-4 py-3 font-medium">Агент</th>}
              <th className="px-4 py-3 font-medium">Отель</th>
              <th className="px-4 py-3 font-medium">Тип номера</th>
              <th className="px-4 py-3 font-medium">№ брони</th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("status")}
              >
                Статус{sortArrow("status")}
              </th>
              <th className="px-4 py-3 font-medium">Валюта</th>
              <th className="px-4 py-3 font-medium">Sale price</th>
              {adminExtensions?.financialColumnHeaders}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={8 + (scope.type === "all" ? 1 : 0) + (adminExtensions?.extraColumnCount ?? 0)}
                  className="px-4 py-10 text-center text-sm text-slate/50"
                >
                  Бронирования не найдены
                </td>
              </tr>
            ) : (
              filteredSorted.map((b) => {
                // "Взято в работу" overlay (independent of the status
                // badge): only meaningful for Pending bookings -- a
                // Cancelled/old booking doesn't need an "has anyone
                // looked at this" signal. Unclaimed Pending gets a
                // strong, unmistakable red highlight to demand
                // attention; claimed Pending gets no overlay at all,
                // back to the normal row appearance. hover: is
                // overridden too (not just left as the default
                // hover:bg-sand/40) so hovering never washes out the
                // signal -- it intensifies it instead.
                const needsAttention = b.status === "Pending" && b.claimed_by === null;
                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className={`cursor-pointer border-b border-ink/5 last:border-b-0 ${
                      needsAttention
                        ? "border-l-8 border-l-red-600 bg-red-500/20 hover:bg-red-500/30"
                        : "hover:bg-sand/40"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">{formatDate(b.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                      {formatDate(b.arrival_date)} → {formatDate(b.departure_date)}
                    </td>
                    {scope.type === "all" && (
                      <td className="px-4 py-3.5 text-slate/80">{agentNames[b.agent_id] ?? `#${b.agent_id}`}</td>
                    )}
                    <td className="px-4 py-3.5 text-slate/80">{hotels[b.hotel_id] ?? `#${b.hotel_id}`}</td>
                    <td className="px-4 py-3.5 text-slate/80">{roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}</td>
                    <td className="px-4 py-3.5 font-medium text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {b.booking_number}
                        {needsAttention && (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Требует внимания
                          </span>
                        )}
                        {scope.type === "all" && isRecentlyChanged(b) && (
                          <span
                            className="rounded-full bg-coral/15 px-1.5 py-0.5 text-[10px] font-medium text-coral"
                            title="Даты изменены агентом менее 24 часов назад"
                          >
                            Изменено
                          </span>
                        )}
                        {scope.type === "all" && isRecentlyCancelled(b) && (
                          <span
                            className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600"
                            title="Отменено агентом менее 24 часов назад"
                          >
                            Отменено
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={b.status} />
                        {adminExtensions?.renderStatusBadgeExtra?.(b)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate/70">{b.currency}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(saleTotal(b))}</td>
                    {adminExtensions?.renderFinancialColumnCells?.(b)}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-slate/60">
        Всего: <strong className="text-ink">{filteredSorted.length}</strong> бронирований
      </div>

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          hotelName={hotels[selectedBooking.hotel_id] ?? `#${selectedBooking.hotel_id}`}
          roomTypeName={roomTypes[selectedBooking.room_type_id] ?? `#${selectedBooking.room_type_id}`}
          mealPlanInfo={mealPlans[selectedBooking.meal_plan_id]}
          onClose={() => setSelectedBooking(null)}
          onBookingUpdated={(updated) => {
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            setSelectedBooking(updated);
          }}
          permissions={permissions}
          claimerNames={agentNames}
          adminExtensions={adminExtensions}
        />
      )}
    </div>
  );
};

export default BookingsList;
