import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { DateRangePicker } from "./HotelSearch";

// ---------------------------------------------------------------------------
// Types (only the fields this screen actually reads)
// ---------------------------------------------------------------------------

interface Booking {
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
  date_change_reason: string | null;
  dates_changed_at: string | null;
  claimed_by: number | null;
  claimed_at: string | null;
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

interface BookingCorrespondenceRow {
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

interface RoomPriceBreakdown {
  base_total: number;
  supplements_total: number;
  price_before_promotions: number;
  applied_promotions: number[];
  final_total: number;
  currency: string;
}

interface TransferPriceBreakdown {
  transfer_name: string;
  price_adult: number;
  price_child: number;
  price_infant: number;
  total: number;
  currency: string;
}

interface MandatoryTaxBreakdown {
  label: string | null;
  rate_per_person_per_night: number;
  chargeable_guests: number;
  nights: number;
  total: number;
  currency: string;
}

interface InvoiceInfo {
  id: number;
  invoice_number: string;
  total: number;
  currency: string;
  status: string;
}

type SortKey = "created_at" | "arrival_date" | "status" | "net";
type SortDir = "asc" | "desc";

export interface Permissions {
  canChangeDates: boolean;
  canEditGuestDetails: boolean;
  canEditFlights: boolean;
  canCancel: boolean;
  canClaim: boolean;
  // Decision 079: gates the entire invoice button/badge block below --
  // Draft invoices are accounting-only, not agent-visible, so an agent
  // must not see the "Создать счёт" button or any invoice info at all
  // (not just a disabled version of it).
  canManageInvoices: boolean;
}

export type Scope = { type: "all" } | { type: "agent"; agentId: number };

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
  Cancelled: "Отменено",
  Rejected: "Отклонено",
  Completed: "Завершено",
};

const STATUS_CLASSES: Record<string, string> = {
  Draft: "bg-slate/10 text-slate",
  Pending: "bg-coral/15 text-coral",
  Confirmed: "bg-teal/15 text-teal",
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

interface Promotion {
  id: number;
  promotion_name: string;
}

interface SpecialOffer {
  id: number;
  offer_name: string;
}

// Plain-text Markdown-style table -- chosen over manually-padded fixed-
// width columns because LPO values vary wildly in length (a one-word
// meal plan code next to a full price-breakdown sentence); a Markdown
// pipe table stays unambiguous and self-labeled as raw plain text even
// where nothing renders it as an actual table, which matters since this
// is pasted into a plain-text email compose box, not an HTML surface.
function renderTextTable(rows: [string, string][]): string {
  const lines = ["| Field | Details |", "|---|---|"];
  for (const [label, value] of rows) {
    lines.push(`| ${label} | ${value.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n");
}

// Decision 047: the guest's real flight date/time is a genuinely
// separate fact from the room's check-in/check-out date -- a flight can
// land the morning after check-in. Never conflates the two, and is
// honest about partial data: a flight NUMBER on file with no date (the
// state of every booking created before these fields existed) is still
// surfaced, not silently dropped, while making clear the date itself
// isn't confirmed.
function formatFlightDetail(date: string | null, time: string | null, flightNumber: string | null): string {
  if (!date) {
    return flightNumber ? `to follow (flight number on file: ${flightNumber})` : "to follow";
  }
  const dateTime = time ? `${formatDate(date)} ${time}` : formatDate(date);
  return flightNumber ? `${dateTime} (Flight ${flightNumber})` : `${dateTime} (flight number: to follow)`;
}

// LPO (booking confirmation request) email text -- Decision 046, Level 3
// per the AI Autonomy Levels framework (autonomous generation/display,
// no model inference: a straightforward template fill from data already
// fetched by BookingDetail's own cost-breakdown useEffect, never
// re-derived). Every number here is read from roomBreakdown/
// transferBreakdown/mandatoryTaxBreakdown -- the SAME objects the
// on-screen cost breakdown already renders -- so this can never drift
// from what the manager sees on screen. Special Offer Code combines two
// distinct, honestly-separate sources (Decision 048): promotionNames
// (generic Promotion ids from get_room_price's applied_promotions) and
// specialOfferName (booking.applied_special_offer_id, set at
// create_booking time from get_room_price's applied_special_offer_ids --
// only when exactly one offer applied, never guessed when zero or
// multiple did).
function buildLpoEmailText(
  booking: Booking,
  hotelName: string,
  roomTypeName: string,
  mealPlanInfo: MealPlanInfo | undefined,
  guests: Guest[] | null,
  roomBreakdown: RoomPriceBreakdown | null,
  transferBreakdown: TransferPriceBreakdown | null,
  mandatoryTaxBreakdown: MandatoryTaxBreakdown | null,
  promotionNames: string[],
  specialOfferName: string | null,
  managerName: string
): { subject: string; body: string } | null {
  // Never generate from partial/unconfirmed numbers -- if the same
  // breakdown data the on-screen cost display depends on hasn't loaded,
  // there is nothing honest to show yet.
  if (!roomBreakdown || !mandatoryTaxBreakdown) return null;

  const guestNames = (guests ?? [])
    .map((g) => `${g.first_name} ${g.last_name}${g.is_lead_guest ? " (Lead Guest)" : ""}`)
    .join(", ") || "—";

  const mealPlanLabel = mealPlanInfo?.meal_name || mealPlanInfo?.meal_code || "—";

  const includesParts = [`room rate ${formatMoney(roomBreakdown.base_total, booking.currency)}`];
  if (roomBreakdown.supplements_total > 0) {
    includesParts.push(`supplements ${formatMoney(roomBreakdown.supplements_total, booking.currency)}`);
  }
  if (mandatoryTaxBreakdown.total > 0) {
    const taxLabel = mandatoryTaxBreakdown.label || "mandatory tax";
    includesParts.push(`${taxLabel} ${formatMoney(mandatoryTaxBreakdown.total, booking.currency)}`);
  }
  const lpoTotal = roomBreakdown.final_total + mandatoryTaxBreakdown.total;

  const rows: [string, string][] = [
    ["Room Type", roomTypeName],
    [
      "Room Check-in — Check-out",
      `${formatDate(booking.arrival_date)} — ${formatDate(booking.departure_date)} (${booking.nights} nights)`,
    ],
    ["Meal Plan", mealPlanLabel],
    ["Guest Names", guestNames],
    ["Occupancy", `${booking.adults} Adults, ${booking.children} Children, ${booking.infants} Infants`],
  ];

  const offerLabels = [...promotionNames, ...(specialOfferName ? [specialOfferName] : [])];
  if (offerLabels.length > 0) {
    rows.push(["Special Offer Code", offerLabels.join(", ")]);
  }

  rows.push(["Total Amount", `${formatMoney(lpoTotal, booking.currency)} (includes: ${includesParts.join(" + ")})`]);

  if (booking.transfer_type && transferBreakdown) {
    rows.push([
      "Transfer",
      `${transferBreakdown.transfer_name}, for ${booking.adults} Adults + ${booking.children} Children — ${formatMoney(transferBreakdown.total, booking.currency)}`,
    ]);
  }

  // Deliberately separate rows from "Room Check-in — Check-out" above --
  // the whole point of Decision 047 is that these can legitimately be
  // different dates, and a hotel reading this must never have to guess
  // which one it's looking at.
  rows.push(
    [
      "Flight Arrival",
      formatFlightDetail(booking.arrival_flight_date, booking.arrival_flight_time, booking.arrival_flight_number),
    ],
    [
      "Flight Departure",
      formatFlightDetail(
        booking.departure_flight_date,
        booking.departure_flight_time,
        booking.departure_flight_number
      ),
    ]
  );

  const subject = `Booking Confirmation Request — ${booking.booking_number} — ${hotelName}`;

  const bodyLines = [
    `Dear ${hotelName} Team,`,
    "",
    "Greetings from DMC OS.",
    "",
    "We would like to ask you to confirm the below reservation as per the following details:",
    "",
    renderTextTable(rows),
    "",
    "Please confirm this reservation exactly as per the above details.",
    "",
    "Best regards,",
    managerName || "—",
  ];

  return { subject, body: bodyLines.join("\n") };
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
}: {
  booking: Booking;
  hotelName: string;
  roomTypeName: string;
  mealPlanInfo: MealPlanInfo | undefined;
  onClose: () => void;
  onBookingUpdated: (updated: Booking) => void;
  permissions: Permissions;
  claimerNames: Record<number, string>;
}) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [roomBreakdown, setRoomBreakdown] = useState<RoomPriceBreakdown | null>(null);
  const [transferBreakdown, setTransferBreakdown] = useState<TransferPriceBreakdown | null>(null);
  const [mandatoryTaxBreakdown, setMandatoryTaxBreakdown] = useState<MandatoryTaxBreakdown | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [promotionNames, setPromotionNames] = useState<string[]>([]);
  const [specialOfferName, setSpecialOfferName] = useState<string | null>(null);
  const [lpoCopied, setLpoCopied] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Decision 050: hotel's stored email (Hotel.email -- the field already
  // existed on LOCKED Hotel Engine, just unpopulated for every hotel
  // today) seeds the "To" field once, but stays independently editable.
  const [hotelEmail, setHotelEmail] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientEmailSecondary, setRecipientEmailSecondary] = useState("");
  const [editableLpoBody, setEditableLpoBody] = useState("");

  const [correspondence, setCorrespondence] = useState<BookingCorrespondenceRow[] | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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

  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // A 400 here just means "not yet invoiced" (the common case) --
  // treated the same as BookingCorrespondence's fetch above, not
  // surfaced as an error. Gated on canManageInvoices so a view without
  // that permission (e.g. the agent's own dashboard) never even fires
  // the request -- the endpoint is admin-only server-side anyway, but
  // there's no reason to make a doomed call.
  useEffect(() => {
    if (!permissions.canManageInvoices) {
      setInvoiceLoading(false);
      return;
    }
    const token = localStorage.getItem("token") || "";
    setInvoiceLoading(true);
    fetchJson<InvoiceInfo>(`/finance-engine/bookings/${booking.id}/invoice`, token)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setInvoiceLoading(false));
  }, [booking.id, permissions.canManageInvoices]);

  async function handleCreateInvoice() {
    const token = localStorage.getItem("token") || "";
    setInvoiceSubmitting(true);
    setInvoiceError(null);
    try {
      const created = await fetchJson<InvoiceInfo>(`/finance-engine/bookings/${booking.id}/invoice`, token, {
        method: "POST",
      });
      setInvoice(created);
    } catch (err: any) {
      setInvoiceError(err.message || "Не удалось создать счёт");
    } finally {
      setInvoiceSubmitting(false);
    }
  }

  async function handleClaimSubmit() {
    const token = localStorage.getItem("token") || "";
    setClaimSubmitting(true);
    setClaimError(null);
    try {
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/claim`, token, {
        method: "POST",
      });
      onBookingUpdated(updated);
      // Decision 080: claiming auto-creates a Draft invoice as a
      // second, best-effort request -- frontend orchestration only,
      // calling the same unmodified /finance-engine endpoint the
      // fallback "Создать счёт" button below already uses. A failure
      // here (e.g. one already exists) must never undo or fail the
      // claim itself, which has already succeeded above -- it
      // surfaces as a non-blocking error, and the fallback button
      // (still rendered whenever !invoice) stays as the recovery path.
      if (permissions.canManageInvoices && !invoice) {
        try {
          const created = await fetchJson<InvoiceInfo>(`/finance-engine/bookings/${booking.id}/invoice`, token, {
            method: "POST",
          });
          setInvoice(created);
        } catch (invoiceErr: any) {
          setInvoiceError(
            invoiceErr.message || "Не удалось автоматически создать счёт — используйте кнопку «Создать счёт» ниже"
          );
        }
      }
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
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/cancel`, token, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      onBookingUpdated(updated);
      setCancelOpen(false);
      setCancelReason("");
    } catch (err: any) {
      setCancelError(err.message || "Не удалось отменить бронирование");
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
  // moves past Pending.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<BookingCorrespondenceRow[]>(`/booking-engine/bookings/${booking.id}/correspondence`, token)
      .then(setCorrespondence)
      .catch(() => setCorrespondence([]));
  }, [booking.id]);

  // Decision 050: the hotel's stored email, to default the "To" field.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Hotel>(`/hotel-engine/hotels/${booking.hotel_id}`, token)
      .then((hotel) => setHotelEmail(hotel.email ?? null))
      .catch(() => setHotelEmail(null));
  }, [booking.hotel_id]);

  // Seed "To" from the hotel's stored email exactly once, when it first
  // arrives -- never overwrites a value the manager already typed.
  useEffect(() => {
    if (hotelEmail && !recipientEmail) setRecipientEmail(hotelEmail);
  }, [hotelEmail]);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    if (!mealPlanInfo) {
      setBreakdownError("Не удалось определить план питания для пересчёта");
      setBreakdownLoading(false);
      return;
    }
    setBreakdownLoading(true);
    setBreakdownError(null);

    const roomPriceParams = new URLSearchParams({
      check_in: booking.arrival_date,
      check_out: booking.departure_date,
      meal_plan: mealPlanInfo.meal_code,
      adults: String(booking.adults),
      children: String(booking.children),
      infants: String(booking.infants),
    });

    const mandatoryTaxParams = new URLSearchParams({
      nights: String(booking.nights),
      adults: String(booking.adults),
      children: String(booking.children),
    });

    const promises: Promise<void>[] = [
      fetchJson<RoomPriceBreakdown>(
        `/contract-engine/contracts/${booking.contract_id}/room-types/${booking.room_type_id}/price?${roomPriceParams}`,
        token
      )
        .then(setRoomBreakdown)
        .catch((err) => setBreakdownError(err.message)),
      fetchJson<MandatoryTaxBreakdown>(
        `/contract-engine/contracts/${booking.contract_id}/mandatory-tax?${mandatoryTaxParams}`,
        token
      )
        .then(setMandatoryTaxBreakdown)
        .catch((err) => setBreakdownError(err.message)),
    ];

    if (booking.transfer_type) {
      const transferParams = new URLSearchParams({
        transfer_type: booking.transfer_type,
        check_in: booking.arrival_date,
        check_out: booking.departure_date,
        adults: String(booking.adults),
        children: String(booking.children),
        infants: String(booking.infants),
      });
      promises.push(
        fetchJson<TransferPriceBreakdown>(
          `/contract-engine/contracts/${booking.contract_id}/transfer-price?${transferParams}`,
          token
        )
          .then(setTransferBreakdown)
          .catch((err) => setBreakdownError(err.message))
      );
    }

    Promise.all(promises).finally(() => setBreakdownLoading(false));
  }, [booking, mealPlanInfo]);

  // Resolve generic Promotion ids (get_room_price's applied_promotions)
  // to real names for the LPO's optional "Special Offer Code" line --
  // only fires when at least one actually applied to this booking's
  // price.
  useEffect(() => {
    if (!roomBreakdown || roomBreakdown.applied_promotions.length === 0) {
      setPromotionNames([]);
      return;
    }
    const token = localStorage.getItem("token") || "";
    Promise.all(
      roomBreakdown.applied_promotions.map((id) =>
        fetchJson<Promotion>(`/contract-engine/promotions/${id}`, token).catch(() => null)
      )
    ).then((results) => setPromotionNames(results.filter((p): p is Promotion => p !== null).map((p) => p.promotion_name)));
  }, [roomBreakdown]);

  // Resolve booking.applied_special_offer_id (Decision 048, set by
  // create_booking from get_room_price's applied_special_offer_ids) to
  // the real SpecialOffer.offer_name -- e.g. "KM26_03" -- for the same
  // "Special Offer Code" line, alongside any generic Promotion names.
  useEffect(() => {
    if (booking.applied_special_offer_id === null) {
      setSpecialOfferName(null);
      return;
    }
    const token = localStorage.getItem("token") || "";
    fetchJson<SpecialOffer>(`/contract-engine/special-offers/${booking.applied_special_offer_id}`, token)
      .then((offer) => setSpecialOfferName(offer.offer_name))
      .catch(() => setSpecialOfferName(null));
  }, [booking.applied_special_offer_id]);

  const managerName = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").name || "";
    } catch {
      return "";
    }
  })();

  const lpo = buildLpoEmailText(
    booking,
    hotelName,
    roomTypeName,
    mealPlanInfo,
    guests,
    roomBreakdown,
    transferBreakdown,
    mandatoryTaxBreakdown,
    promotionNames,
    specialOfferName,
    managerName
  );
  // Seed the editable body exactly once, when the auto-generated LPO
  // first becomes available -- never overwrites text the manager has
  // already started editing, even if breakdown data re-fetches later.
  useEffect(() => {
    if (lpo && !editableLpoBody) setEditableLpoBody(lpo.body);
  }, [lpo?.body]);

  const lpoFullText = lpo ? `Subject: ${lpo.subject}\n\n${editableLpoBody || lpo.body}` : null;

  function handleCopyLpo() {
    if (!lpoFullText) return;
    navigator.clipboard.writeText(lpoFullText).then(() => {
      setLpoCopied(true);
      setTimeout(() => setLpoCopied(false), 2000);
    });
  }

  async function handleSendCorrespondence() {
    if (!lpo) return;
    const token = localStorage.getItem("token") || "";
    setSendSubmitting(true);
    setSendError(null);
    try {
      const created = await fetchJson<BookingCorrespondenceRow>(
        `/booking-engine/bookings/${booking.id}/correspondence/send`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            subject: lpo.subject,
            body: editableLpoBody || lpo.body,
            recipient_email: recipientEmail.trim() || null,
            recipient_email_secondary: recipientEmailSecondary.trim() || null,
          }),
        }
      );
      setCorrespondence((prev) => [...(prev ?? []), created]);
    } catch (err: any) {
      setSendError(err.message || "Не удалось отправить письмо");
    } finally {
      setSendSubmitting(false);
    }
  }

  async function handleAddReply() {
    if (replyBody.trim().length < 1) {
      setReplyError("Введите текст ответа отеля");
      return;
    }
    const token = localStorage.getItem("token") || "";
    setReplySubmitting(true);
    setReplyError(null);
    try {
      await fetchJson<BookingCorrespondenceRow>(
        `/booking-engine/bookings/${booking.id}/correspondence/reply`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ subject: replySubject.trim() || null, body: replyBody.trim() }),
        }
      );
      // The reply may have flipped an earlier outbound row's status to
      // "replied" server-side -- refetch the whole thread rather than
      // just appending, so that resolved state shows correctly too.
      const thread = await fetchJson<BookingCorrespondenceRow[]>(
        `/booking-engine/bookings/${booking.id}/correspondence`,
        token
      );
      setCorrespondence(thread);
      setReplyOpen(false);
      setReplySubject("");
      setReplyBody("");
    } catch (err: any) {
      setReplyError(err.message || "Не удалось добавить ответ");
    } finally {
      setReplySubmitting(false);
    }
  }

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
          <StatusBadge status={booking.status} />
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
            {permissions.canChangeDates && booking.status !== "Cancelled" && booking.status !== "Rejected" && !changeDatesOpen && !cancelOpen && (
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
            {permissions.canCancel && booking.status !== "Cancelled" && booking.status !== "Rejected" && !changeDatesOpen && !cancelOpen && (
              <button
                type="button"
                onClick={openCancelPanel}
                className="rounded-lg border border-red-500/30 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Отменить бронь
              </button>
            )}
            {permissions.canManageInvoices && !invoiceLoading && !invoice && booking.status !== "Cancelled" && booking.status !== "Rejected" && (
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={invoiceSubmitting}
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {invoiceSubmitting ? "Создание..." : "Создать счёт"}
              </button>
            )}
          </div>
        </div>

        {permissions.canManageInvoices && invoice && (
          <div className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-xs text-slate/70">
            Счёт <strong className="text-ink">{invoice.invoice_number}</strong> ({invoice.status}) на{" "}
            <strong className="text-ink">{formatMoney(invoice.total, invoice.currency)}</strong>
          </div>
        )}
        {invoiceError && (
          <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{invoiceError}</div>
        )}

        {claimError && (
          <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{claimError}</div>
        )}

        {booking.status === "Pending" && booking.claimed_by !== null && (
          <div className="mt-3 rounded-lg bg-ink/5 p-3 text-sm">
            <p className="text-slate/70">
              В работе: <strong className="text-ink">{claimerNames[booking.claimed_by] ?? `#${booking.claimed_by}`}</strong>
              {booking.claimed_at && <> с {formatDate(booking.claimed_at)}</>}
            </p>
          </div>
        )}

        {booking.status === "Pending" && booking.claimed_by !== null && (
          <div className="mt-3 rounded-lg border border-ink/10 bg-sand/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
                LPO — запрос на подтверждение отелю
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLpo}
                  disabled={!lpoFullText}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {lpoCopied ? "Скопировано ✓" : "Копировать"}
                </button>
                <button
                  type="button"
                  onClick={handleSendCorrespondence}
                  disabled={!lpo || sendSubmitting}
                  className="rounded-lg bg-coral px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {sendSubmitting ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </div>
            {lpo ? (
              <>
                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    placeholder="Кому (email отеля)"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Второй email (опционально)"
                    value={recipientEmailSecondary}
                    onChange={(e) => setRecipientEmailSecondary(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                  />
                </div>
                {!hotelEmail && (
                  <p className="mb-2 text-[11px] text-slate/40">
                    У отеля не указан email в системе — заполните вручную.
                  </p>
                )}
                <p className="mb-1 text-[11px] font-medium text-slate/50">Тема: {lpo.subject}</p>
                <textarea
                  value={editableLpoBody || lpo.body}
                  onChange={(e) => setEditableLpoBody(e.target.value)}
                  rows={14}
                  className="w-full rounded-lg border border-ink/15 bg-white p-3 font-mono text-xs text-ink focus:border-coral focus:outline-none"
                />
              </>
            ) : (
              <p className="text-xs text-slate/50">
                {breakdownLoading ? "Расчёт стоимости..." : "Не удалось сформировать письмо — проверьте расчёт стоимости выше."}
              </p>
            )}
            {sendError && (
              <div className="mt-2 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{sendError}</div>
            )}
          </div>
        )}

        {/* ===== Переписка с отелем (Decision 049) ===== */}
        <div className="mt-3 rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Переписка с отелем</p>
            {!replyOpen && (
              <button
                type="button"
                onClick={() => {
                  setReplyError(null);
                  setReplySubject("");
                  setReplyBody("");
                  setReplyOpen(true);
                }}
                className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-sand"
              >
                Добавить ответ отеля вручную
              </button>
            )}
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

          {replyOpen && (
            <div className="mt-3 space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
              <input
                placeholder="Тема (опционально)"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
              />
              <textarea
                placeholder="Текст ответа отеля *"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
              />
              {replyError && (
                <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{replyError}</div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddReply}
                  disabled={replySubmitting}
                  className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {replySubmitting ? "Сохранение..." : "Сохранить ответ"}
                </button>
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  disabled={replySubmitting}
                  className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
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

        {/* ===== Net / Sale / Profit ===== */}
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-sand/50 p-3 text-sm">
          <div>
            <p className="text-slate/50">Net cost</p>
            <p className="font-medium text-ink">
              {formatMoney(
                (booking.total_amount || 0) + (booking.transfer_total || 0) + (booking.mandatory_tax_total || 0),
                booking.currency
              )}
            </p>
          </div>
          <div>
            <p className="text-slate/50">Sale price</p>
            <p className="font-medium text-ink">
              {formatMoney(
                (booking.total_amount || 0) + (booking.transfer_total || 0) + (booking.mandatory_tax_total || 0),
                booking.currency
              )}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-slate/50">
              Profit
              <span
                className="cursor-help text-slate/40"
                title="Наценка агента ещё не реализована — Pricing Engine (Decision 009)"
              >
                ⓘ
              </span>
            </p>
            <p className="font-medium text-ink">—</p>
          </div>
        </div>

        {/* ===== Re-derived price breakdown ===== */}
        <div className="mt-4 rounded-lg border border-ink/10 p-3 text-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Разбивка стоимости</h4>
          </div>
          <p className="mt-1 text-xs text-slate/50">
            Расчёт на текущих условиях контракта — может отличаться, если цены изменились после бронирования.
          </p>
          {breakdownLoading && <p className="mt-2 text-slate/50">Пересчёт...</p>}
          {breakdownError && <p className="mt-2 text-red-600">{breakdownError}</p>}
          {roomBreakdown && (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              <div><span className="text-slate/50">База: </span><span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">Доплаты: </span><span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">До промо: </span><span className="text-ink">{formatMoney(roomBreakdown.price_before_promotions, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">Итог проживания: </span><span className="text-ink">{formatMoney(roomBreakdown.final_total, roomBreakdown.currency)}</span></div>
            </div>
          )}
          {transferBreakdown && (
            <div className="mt-2 border-t border-ink/5 pt-2">
              <p className="text-slate/50">Трансфер ({transferBreakdown.transfer_name}): <span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span></p>
            </div>
          )}
          {mandatoryTaxBreakdown && mandatoryTaxBreakdown.total > 0 && (
            <div className="mt-2 border-t border-ink/5 pt-2">
              <p className="text-slate/50">
                {mandatoryTaxBreakdown.label || "Обязательный налог"} ({mandatoryTaxBreakdown.chargeable_guests} чел. ×{" "}
                {formatMoney(mandatoryTaxBreakdown.rate_per_person_per_night, mandatoryTaxBreakdown.currency)} ×{" "}
                {mandatoryTaxBreakdown.nights} ноч., начисляется после скидок и не подлежит скидке):{" "}
                <span className="text-ink">{formatMoney(mandatoryTaxBreakdown.total, mandatoryTaxBreakdown.currency)}</span>
              </p>
            </div>
          )}
        </div>

        {booking.status === "Cancelled" && (
          <div className="mt-4 rounded-lg bg-slate/5 p-3 text-sm">
            <p className="font-medium text-ink">Отмена</p>
            <p className="mt-1 text-slate/70">Причина: {booking.cancellation_reason || "—"}</p>
            <p className="text-slate/70">Дата отмены: {booking.cancelled_at ? formatDate(booking.cancelled_at) : "—"}</p>
            <p className="text-slate/70">Штраф: {formatMoney(booking.cancellation_fee, booking.currency)}</p>
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

const BookingsList = ({ scope, permissions }: { scope: Scope; permissions: Permissions }) => {
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

  const netOf = (b: Booking) => (b.total_amount || 0) + (b.transfer_total || 0) + (b.mandatory_tax_total || 0);

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
      else if (sortKey === "net") cmp = netOf(a) - netOf(b);
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
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("net")}
              >
                Net cost{sortArrow("net")}
              </th>
              <th className="px-4 py-3 font-medium">Sale price</th>
              <th className="px-4 py-3 font-medium">Profit</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td colSpan={scope.type === "all" ? 11 : 10} className="px-4 py-10 text-center text-sm text-slate/50">
                  Бронирования не найдены
                </td>
              </tr>
            ) : (
              filteredSorted.map((b) => {
                const net = netOf(b);
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
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3.5 text-slate/70">{b.currency}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(net)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(net)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className="cursor-help text-slate/40"
                        title="Наценка агента ещё не реализована — Pricing Engine (Decision 009)"
                      >
                        —
                      </span>
                    </td>
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
        />
      )}
    </div>
  );
};

export default BookingsList;
