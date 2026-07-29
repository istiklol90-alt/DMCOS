import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { API_URL } from "../config";
import { DateRangePicker } from "./HotelSearch";
import Input from "../components/ui/Input";

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

// One room/leg within a booking "application" (Stage 1-5, multi-room
// booking applications). Every booking -- old single-room ones (migrated)
// and every new one created via the trip-cart checkout -- has at least
// one of these; a booking's own top-level fields (hotel_id/arrival_date/
// total_amount/etc.) only ever reflect the FIRST room as a legacy
// "representative" snapshot, so this is the only place that shows the
// real, complete picture for an application with more than one room.
interface BookingRoom {
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
  mandatory_tax_total: number | null;
  total_amount: number | null;
  confirmation_number: string | null;
  special_requests: string | null;
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
  // The selected BookingRoom's own id (distinct from booking.id, the
  // parent application) -- needed by renderFinancialSummary for
  // per-room commercial-line endpoints. null only when no rooms exist
  // at all for this application (legacy data, see the "Rooms" section
  // above), or DetailCtx is constructed by a slot other than
  // renderFinancialSummary that never had a room to select in the
  // first place.
  bookingRoomId?: number | null;
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

// Maps a raw status string onto its statusBadge.* translation key suffix.
// Kept as a data map (not translated text itself) so StatusBadge and
// BookingsList's status filter can share one lookup via statusLabel()
// below; a status with no mapping falls back to the raw string, same as
// the old STATUS_LABELS[status] ?? status behavior.
const STATUS_LABEL_KEYS: Record<string, string> = {
  Draft: "draft",
  Pending: "pending",
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
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral/20 text-coral">
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
    return (
      <li className="flex items-center gap-2 rounded-lg bg-sand/50 px-3 py-2">
        <span className="font-medium text-ink">{guest.first_name} {guest.last_name}</span>
        {guest.is_lead_guest && (
          <span className="rounded-full bg-coral/15 px-2 py-0.5 text-xs text-coral">{t("guestRow.leadGuest")}</span>
        )}
        {guest.nationality && <span className="text-slate/60">· {guest.nationality}</span>}
        {guest.date_of_birth && <span className="text-slate/60">· {formatDate(guest.date_of_birth)}</span>}
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto shrink-0 rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
          >
            {t("guestRow.edit")}
          </button>
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
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder={t("guestRow.lastNamePlaceholder")}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder={t("guestRow.nationalityPlaceholder")}
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
          placeholder={t("guestRow.passportNumberPlaceholder")}
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
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          placeholder={t("flightNumbersEdit.departureFlightNumberPlaceholder")}
          value={departureFlight}
          onChange={(e) => setDepartureFlight(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title={t("flightNumbersEdit.arrivalFlightDateTitle")}
            value={arrivalFlightDate}
            onChange={(e) => setArrivalFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
          <input
            type="time"
            title={t("flightNumbersEdit.arrivalFlightTimeTitle")}
            value={arrivalFlightTime}
            onChange={(e) => setArrivalFlightTime(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            title={t("flightNumbersEdit.departureFlightDateTitle")}
            value={departureFlightDate}
            onChange={(e) => setDepartureFlightDate(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
          <input
            type="time"
            title={t("flightNumbersEdit.departureFlightTimeTitle")}
            value={departureFlightTime}
            onChange={(e) => setDepartureFlightTime(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm text-slate focus:border-coral focus:outline-none"
          />
        </div>
      </div>
      <p className="text-[11px] text-slate/50">{t("flightNumbersEdit.flightDateTimeHint")}</p>
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

  if (!canEdit) return null;

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
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
      />
      {value.trim() && value.trim() !== (booking.confirmation_number ?? "") && (
        <p className="text-[11px] text-slate/50">{t("confirmationNumberEdit.voucherHint")}</p>
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
        className="rounded-lg border border-amber-500/30 bg-white px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
      >
        {t("cancellationConfirmationEdit.confirmWithHotel")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/20 bg-amber-50/40 p-3">
      <input
        placeholder={t("cancellationConfirmationEdit.numberPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
      />
      <p className="text-[11px] text-slate/50">{t("cancellationConfirmationEdit.hint")}</p>
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

function DocumentsSection({ booking }: { booking: Booking }) {
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
        let detail = t("errors.requestError", { status: response.status });
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
      setDownloadError(err.message || t("documentsSection.downloadFailed"));
    }
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">{t("documentsSection.title")}</h4>
      <div className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate/70">{t("documentsSection.voucher")}</span>
          {booking.confirmation_number ? (
            <button
              type="button"
              onClick={() => handleDownload("voucher")}
              className="font-medium text-coral hover:underline"
            >
              {t("documentsSection.download")}
            </button>
          ) : (
            <span className="text-slate/40">{t("documentsSection.inProgress")}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate/70">{t("documentsSection.invoice")}</span>
          {statusLoading ? (
            <span className="text-slate/40">...</span>
          ) : invoiceStatus === "Issued" ? (
            <button
              type="button"
              onClick={() => handleDownload("invoice")}
              className="font-medium text-coral hover:underline"
            >
              {t("documentsSection.download")}
            </button>
          ) : (
            <span className="text-slate/40">{t("documentsSection.inProgress")}</span>
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
  hotels,
  roomTypes,
  mealPlans,
  mealPlanInfo,
  onClose,
  onBookingUpdated,
  permissions,
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

  async function refreshAfterRoomAction() {
    const token = localStorage.getItem("token") || "";
    try {
      const [freshRooms, freshBooking] = await Promise.all([
        fetchJson<BookingRoom[]>(`/booking-engine/bookings/${booking.id}/rooms`, token),
        fetchJson<Booking>(`/booking-engine/bookings/${booking.id}`, token),
      ]);
      setRooms(freshRooms);
      onBookingUpdated(freshBooking);
    } catch (err: any) {
      setRoomsError(err.message || "Failed to refresh rooms");
    }
  }

  async function handleApproveRoom(roomId: number) {
    const token = localStorage.getItem("token") || "";
    setRoomActionError(null);
    setRoomActionId(roomId);
    try {
      await fetchJson(`/booking-engine/rooms/${roomId}/approve`, token, { method: "POST" });
      await refreshAfterRoomAction();
    } catch (err: any) {
      setRoomActionError(err.message || "Failed to approve room");
    } finally {
      setRoomActionId(null);
    }
  }

  async function handleRejectRoom(roomId: number) {
    const reason = window.prompt("Reason for rejecting this room:");
    if (!reason || reason.trim().length < 2) return;
    const token = localStorage.getItem("token") || "";
    setRoomActionError(null);
    setRoomActionId(roomId);
    try {
      await fetchJson(`/booking-engine/rooms/${roomId}/reject`, token, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await refreshAfterRoomAction();
    } catch (err: any) {
      setRoomActionError(err.message || "Failed to reject room");
    } finally {
      setRoomActionId(null);
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

  // DetailCtx passed to every adminExtensions slot below.
  const ctx: DetailCtx = { booking, onBookingUpdated };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 sm:px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-2xl border border-ink/10 bg-white p-8 shadow-xl"
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
            {t("bookingDetail.close")}
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
                {claimSubmitting ? t("bookingDetail.sending") : t("bookingDetail.claim")}
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
                {t("bookingDetail.changeDates")}
              </button>
            )}
            {permissions.canCancel && booking.status !== "Cancelled" && booking.status !== "Rejected" && booking.status !== "Cancellation Requested" && !changeDatesOpen && !cancelOpen && (
              <button
                type="button"
                onClick={openCancelPanel}
                className="rounded-lg border border-red-500/30 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                {t("bookingDetail.cancelBooking")}
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
              {t("bookingDetail.claimedByLabel")}{" "}
              <strong className="text-ink">{claimerNames[booking.claimed_by] ?? `#${booking.claimed_by}`}</strong>
              {booking.claimed_at && <> {t("bookingDetail.since")} {formatDate(booking.claimed_at)}</>}
            </p>
          </div>
        )}

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
            confidentiality boundary as the financial summary below. */}
        <div className="mt-3">
          <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate/50">
            {t("bookingDetail.roomsTitle")}
            {rooms && rooms.length > 1 && <span className="ml-1 normal-case text-slate/40">({rooms.length})</span>}
          </h4>
          {roomsError && <p className="text-sm text-red-600">{roomsError}</p>}
          {!rooms && !roomsError && <p className="text-sm text-slate/50">{t("bookingDetail.roomsLoading")}</p>}
          {roomActionError && (
            <div className="mb-2 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{roomActionError}</div>
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
                      ? "border-coral bg-coral/5"
                      : "border-ink/10 hover:border-coral/30"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {rooms.length > 1 && (
                          <span className="mr-1.5 text-slate/40">#{room.sequence_number}</span>
                        )}
                        {hotels[room.hotel_id] ?? `#${room.hotel_id}`} — {roomTypes[room.room_type_id] ?? `#${room.room_type_id}`}
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
                        <p className="mt-1 text-xs text-red-600">{room.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={room.status} />
                      {adminExtensions && room.total_amount !== null && (
                        <span className="font-mono text-sm font-semibold text-ink">
                          {formatMoney(room.total_amount, room.currency ?? booking.currency)}
                        </span>
                      )}
                      {permissions.canConfirmWithHotel && room.status === "Pending" && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApproveRoom(room.id)}
                            disabled={roomActionId === room.id}
                            className="rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                          >
                            {t("bookingDetail.approveRoom")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectRoom(room.id)}
                            disabled={roomActionId === room.id}
                            className="rounded-lg border border-red-500/30 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("bookingDetail.rejectRoom")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
              {t("bookingDetail.correspondenceTitle")}
            </p>
            {/* Decision 103: logging a hotel's reply is a write action on
                the same admin-only add_correspondence_reply endpoint the
                LPO panel uses -- reading the thread below stays visible to
                everyone (their own booking's correspondence history is
                reasonable to see); only the write button is
                AdminBookingFinance.tsx's concern now. */}
            {adminExtensions?.renderReplyLogButton?.(ctx)}
          </div>

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
                    className={`rounded-lg p-3 text-sm ${
                      outbound ? "ml-6 bg-coral/10" : "mr-6 bg-ink/5"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate/50">
                      <span className="font-semibold uppercase tracking-wide">
                        {outbound ? t("bookingDetail.correspondenceOutbound") : t("bookingDetail.correspondenceInbound")}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cancelOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-red-500/20 bg-red-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600/80">
              {t("bookingDetail.cancelPanelTitle")}
            </p>
            <div className="rounded-lg bg-white/70 px-3 py-2 text-sm">
              {cancelFeeLoading && <span className="text-slate/50">{t("bookingDetail.feeCalculating")}</span>}
              {cancelFeeError && <span className="text-red-600">{cancelFeeError}</span>}
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
          <div className="mt-3 space-y-3 rounded-lg border border-ink/10 bg-sand/30 p-4">
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

        {/* Two-column layout once there's screen real estate to spare
            (this modal is now near-fullscreen, 2026-07-27) -- lets a
            manager see booking facts/confirmations AND money/guests at
            once instead of scrolling through one long stacked column.
            Single column below `lg` (unchanged on narrower screens). */}
        <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            {/* ===== Block 1 -- booking facts, for a manager to compare
                against the hotel's own confirmation (project owner's
                explicit field list, 2026-07-28): agent, hotel, room type,
                meal plan, transfer type, check-in/out, booking date,
                special requests, full flight details. All sourced from
                the SELECTED room (effectiveBooking/displayTransferName)
                where the field is genuinely per-room, or from the
                application itself (agent, booking date, flight details)
                where it isn't -- flights are for the whole trip, not one
                specific room. */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink/10 bg-sand/30 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.agentLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{claimerNames[booking.agent_id] ?? `#${booking.agent_id}`}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.agencyLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{companyNames[booking.agent_id] ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.handledByLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {booking.claimed_by !== null ? claimerNames[booking.claimed_by] ?? `#${booking.claimed_by}` : t("bookingDetail.notClaimedYet")}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.hotelNameLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{hotels[effectiveBooking.hotel_id] ?? `#${effectiveBooking.hotel_id}`}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.roomTypeLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{roomTypes[effectiveBooking.room_type_id] ?? `#${effectiveBooking.room_type_id}`}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.mealPlanLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {effectiveMealPlanInfo?.meal_name || effectiveMealPlanInfo?.meal_code || `#${effectiveBooking.meal_plan_id}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.transferTypeLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{displayTransferName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.bookingDateLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatDate(booking.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.datesLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {formatDate(effectiveBooking.arrival_date)} — {formatDate(effectiveBooking.departure_date)}
                </p>
                <p className="text-xs text-slate/50">{t("bookingDetail.nights", { count: effectiveBooking.nights })}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.guestsLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {t("bookingDetail.adultsCount", { count: effectiveBooking.adults })} /{" "}
                  {t("bookingDetail.childrenCount", { count: effectiveBooking.children })} /{" "}
                  {t("bookingDetail.infantsCount", { count: effectiveBooking.infants })}
                </p>
              </div>
              {(booking.arrival_flight_number || booking.arrival_flight_date || booking.arrival_flight_time) && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.arrivalFlightLabel")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{booking.arrival_flight_number || "—"}</p>
                  {(booking.arrival_flight_date || booking.arrival_flight_time) && (
                    <p className="text-xs text-slate/50">
                      {booking.arrival_flight_date ? formatDate(booking.arrival_flight_date) : ""}
                      {booking.arrival_flight_time ? ` · ${booking.arrival_flight_time}` : ""}
                    </p>
                  )}
                </div>
              )}
              {(booking.departure_flight_number || booking.departure_flight_date || booking.departure_flight_time) && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.departureFlightLabel")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{booking.departure_flight_number || "—"}</p>
                  {(booking.departure_flight_date || booking.departure_flight_time) && (
                    <p className="text-xs text-slate/50">
                      {booking.departure_flight_date ? formatDate(booking.departure_flight_date) : ""}
                      {booking.departure_flight_time ? ` · ${booking.departure_flight_time}` : ""}
                    </p>
                  )}
                </div>
              )}
              {(displayRoom?.special_requests || booking.special_requests) && (
                <div className="col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.specialRequestsLabel")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{displayRoom?.special_requests || booking.special_requests}</p>
                </div>
              )}
            </div>

            {/* ===== Guests (moved here from the commercial column -- guest
                names are operational/manager info, not financial data;
                Edit stays gated by canEditGuestDetails exactly as before,
                only the position changed) ===== */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.guestsTitle")}</h4>
                <FlightNumbersEdit
                  booking={booking}
                  onUpdated={onBookingUpdated}
                  canEdit={permissions.canEditFlights}
                />
              </div>
              {guestsError && <p className="text-sm text-red-600">{guestsError}</p>}
              {!guests && !guestsError && <p className="text-sm text-slate/50">{t("bookingDetail.guestsLoading")}</p>}
              {guests && guests.length === 0 && <p className="text-sm text-slate/50">{t("bookingDetail.noGuests")}</p>}
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

            {/* ===== Подтверждение отеля (Decision 097) ===== */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">
                {t("bookingDetail.hotelConfirmationTitle")}
              </h4>
              <ConfirmationNumberEdit
                booking={booking}
                onUpdated={onBookingUpdated}
                canEdit={permissions.canConfirmWithHotel}
              />
            </div>

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
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">
                  {t("bookingDetail.cancellationConfirmationTitle")}
                </h4>
                <CancellationConfirmationEdit booking={booking} onUpdated={onBookingUpdated} />
              </div>
            )}

            {/* ===== Документы (Decision 102) — visible to admin and the
                owning agent alike; not gated by permissions at all since
                this is about document access/ownership, not the Cost/
                Profit confidentiality boundary. ===== */}
            <DocumentsSection booking={booking} />

            {/* Decision 104: covers both stages now -- a "Cancellation
                Requested" booking already has the request-side fields
                (reason/cancelled_at/fee/cancelled_by, frozen at request
                time); "Cancelled" additionally has the confirmation-side
                fields (populated only once stage 2 completes). */}
            {(booking.status === "Cancellation Requested" || booking.status === "Cancelled") && (
              <div className="rounded-lg bg-slate/5 p-3 text-sm">
                <p className="font-medium text-ink">{t("bookingDetail.cancellationSectionTitle")}</p>
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
                  <p className="mt-2 text-amber-600">{t("bookingDetail.awaitingHotelConfirmation")}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
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
            {/* ===== Financial summary (Decision 101/102/106 lineage) =====
                AdminBookingFinance.tsx's renderFinancialSummary now owns
                Net/Sale/Profit AND the "Разбивка стоимости" price-
                breakdown block (the fixed 9-slot interface has no
                separate slot for the breakdown, so it's folded into this
                one, in the same position "Итого" used to occupy) --
                structurally absent, not just gated, for any caller (e.g.
                AgentDashboard_v2.tsx) that never supplies adminExtensions.
                The base's own default is the plain sale total an agent
                needs to know they're charged. */}
            {adminExtensions?.renderFinancialSummary ? (
              adminExtensions.renderFinancialSummary({
                booking: effectiveBooking,
                onBookingUpdated,
                bookingRoomId: displayRoom?.id ?? null,
              })
            ) : (
              <div className="rounded-xl border border-ink/10 bg-sand/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("bookingDetail.total")}</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatMoney(saleTotal(effectiveBooking), effectiveBooking.currency)}
                </p>
              </div>
            )}
          </div>
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
  const [createdDateKey, setCreatedDateKey] = useState<string | null>(
    dateModeEnabled && dateModeView === "created" && dateTo ? `${dateFrom}|${dateTo}` : null
  );
  useEffect(() => {
    if (dateModeEnabled && dateModeView === "created") {
      if (dateTo) setCreatedDateKey(`${dateFrom}|${dateTo}`);
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

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);

        const bookingsUrl =
          scope.type === "all"
            ? debouncedSearch
              ? `/booking-engine/bookings?limit=500&search=${encodeURIComponent(debouncedSearch)}`
              : createdDateKey
                ? `/booking-engine/bookings?limit=500&created_from=${dateFrom}&created_to=${dateTo}`
                : "/booking-engine/bookings?limit=500"
            : `/booking-engine/agents/${scope.agentId}/bookings`;
        const bookingsData = await fetchJson<Booking[]>(bookingsUrl, token);
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
  }, [scope.type, scope.type === "agent" ? scope.agentId : null, createdDateKey, debouncedSearch]);

  // Decision 108: the "recently changed"/"recently cancelled" flags that
  // used to live here (24h ephemeral, no acknowledgment) were retired --
  // replaced by AdminBookingFinance.tsx's persistent, acknowledgment-aware
  // "Требует внимания" panel, which also correctly covers bookings that
  // have never had an invoice (the old mechanism's gap). pending_soon/
  // cancellation_deadline are unrelated forward-looking predictions, kept
  // as-is.
  const aiFlags = useMemo(() => {
    return [
      ...computePendingSoonFlags(bookings),
      ...computeCancellationDeadlineFlags(bookings, cancellationTiers),
    ];
  }, [bookings, cancellationTiers]);

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
      // Search overrides date scope entirely -- the fetch effect above
      // already requested `?search=...` with no created_from/created_to
      // (Decision 125), so `bookings` here is already every matching
      // booking regardless of date. Re-applying the date-mode filter
      // below on top of that would throw away exactly the out-of-range
      // matches search exists to find -- the real bug this closes: the
      // server-side fix alone wasn't enough, this client-side filter
      // was independently re-narrowing the results back down by date.
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((b) => b.booking_number.toLowerCase().includes(q));
    } else if (dateModeEnabled) {
      // DateRangePicker (below) reports an empty checkOut while only the
      // first day of a NEW range has been clicked -- treated as "just
      // this one day" rather than an unbounded range, so a single click
      // is enough to browse one day at a time (e.g. "26.07", then
      // "02.07"), and a second click still completes a real range.
      const effectiveDateTo = dateTo || dateFrom;
      if (dateModeView === "staying") {
        // ISO "YYYY-MM-DD" strings compare correctly lexicographically --
        // same convention already used elsewhere in this file. A booking
        // occupies [arrival_date, departure_date); it belongs in the
        // range if that occupied interval overlaps [dateFrom, effectiveDateTo]
        // at all (effectiveDateTo treated as inclusive) -- reduces to the
        // original single-day check when dateFrom === effectiveDateTo.
        list = list.filter(
          (b) =>
            b.arrival_date <= effectiveDateTo &&
            b.departure_date > dateFrom &&
            b.status !== "Cancelled" &&
            b.status !== "Rejected"
        );
      } else if (dateModeView === "created") {
        // created_at is a full ISO datetime ("2026-07-14T12:26:08.987733"),
        // not just a date -- compare only its first 10 characters.
        // Independent of the booking's actual stay dates: a reservation
        // created today for a stay next March belongs here, not in
        // "Заезды".
        list = list.filter((b) => {
          const createdDate = b.created_at.slice(0, 10);
          return createdDate >= dateFrom && createdDate <= effectiveDateTo;
        });
      } else {
        list = list.filter(
          (b) => b.arrival_date >= dateFrom && b.arrival_date <= effectiveDateTo && b.status === "Cancelled"
        );
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
    dateFrom,
    dateTo,
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
    return <p className="mt-10 text-center text-sm text-slate/60">{t("bookingsList.loading")}</p>;
  }

  if (error) {
    return (
      <p className="mt-10 text-center text-sm text-red-600">
        {t("bookingsList.errorLabel")} {error}
      </p>
    );
  }

  return (
    <div>
      <AIInsightStrip flags={aiFlags} hotels={hotels} />

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("bookingsList.searchPlaceholder")}
          scale="lg"
          className="w-48"
        />

        {!compactFilters && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
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
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
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
                className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
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
                ? "border-coral bg-coral/10 text-coral"
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
      </div>

      {dateModeEnabled && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-xl bg-sand/50 px-3.5 py-2.5">
          <DateRangePicker
            checkIn={dateFrom}
            checkOut={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
            allowPast
          />
          <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white p-1">
            <button
              type="button"
              onClick={() => setDateModeView("staying")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "staying" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              {t("bookingsList.dateModeStaying")}
            </button>
            <button
              type="button"
              onClick={() => setDateModeView("created")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "created" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              {t("bookingsList.dateModeCreated")}
            </button>
            <button
              type="button"
              onClick={() => setDateModeView("cancellations")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateModeView === "cancellations" ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
              }`}
            >
              {t("bookingsList.dateModeCancellations")}
            </button>
          </div>
          <span className="text-xs text-slate/50">
            {dateModeView === "staying"
              ? t("bookingsList.dateModeStayingDescription")
              : dateModeView === "created"
                ? t("bookingsList.dateModeCreatedDescription")
                : t("bookingsList.dateModeCancellationsDescription")}
          </span>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-card">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("created_at")}
              >
                {t("bookingsList.columnBookingDate")}{sortArrow("created_at")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("arrival_date")}
              >
                {t("bookingsList.columnArrivalDeparture")}{sortArrow("arrival_date")}
              </th>
              {scope.type === "all" && <th className="px-4 py-3 font-medium">{t("bookingsList.columnAgent")}</th>}
              <th className="px-4 py-3 font-medium">{t("bookingsList.columnHotel")}</th>
              <th className="px-4 py-3 font-medium">{t("bookingsList.columnRoomType")}</th>
              <th className="px-4 py-3 font-medium">{t("bookingsList.columnBookingNumber")}</th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("status")}
              >
                {t("bookingsList.columnStatus")}{sortArrow("status")}
              </th>
              <th className="px-4 py-3 font-medium">{t("bookingsList.columnCurrency")}</th>
              <th className="px-4 py-3 font-medium">{t("bookingsList.columnSalePrice")}</th>
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
                  {t("bookingsList.noBookingsFound")}
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
                            {t("bookingsList.needsAttention")}
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
        {t("bookingsList.totalLabel")}{" "}
        <strong className="text-ink">
          {t("bookingsList.totalCount", { count: filteredSorted.length })}
        </strong>
      </div>

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
