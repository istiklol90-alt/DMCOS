import { Fragment, useEffect, useState } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
// Decision 183: one collapsible-section design across the admin panel.
import { SectionCard, ActionInfo } from "./Reservations";

// ---------------------------------------------------------------------------
// Shared across the Finance feature cluster (Invoices / Balance / Cashback,
// each its own top-level AdminPanel tab as of the Decision 088 restructure
// -- previously one "Finance" tab crammed everything together, which
// doesn't scale to a realistic 100 agents x 100 bookings volume). This
// module holds the genuinely-shared, must-stay-identical logic
// (InvoiceDetailModal, isUrgentFlag, AgentSearchSelect) rather than
// duplicating it across three page files, unlike this codebase's usual
// per-page-self-contained convention -- justified here because these
// three pages are facets of one restructured feature built together, not
// unrelated pages that happen to share a few small utils.
// ---------------------------------------------------------------------------

export interface InvoiceReviewNote {
  id: number;
  sequence_number: number;
  change_description: string | null;
  old_arrival_date: string | null;
  old_departure_date: string | null;
  old_total: number | null;
  old_offer_name: string | null;
  new_arrival_date: string | null;
  new_departure_date: string | null;
  new_total: number | null;
  new_offer_name: string | null;
  created_at: string;
}

export interface InvoiceRoomLine {
  booking_room_id: number | null;
  sequence_number: number;
  room_sale: number;
  transfer_amount: number | null;
  tax_amount: number | null;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  booking_id: number;
  agent_id: number;
  hotel_id: number;
  issue_date: string;
  currency: string;
  subtotal: number;
  discount: number | null;
  commission: number | null;
  tax: number | null;
  total: number;
  status: string;
  email_sent_at: string | null;
  // The row's real creation timestamp, distinct from issue_date (the
  // document's own date). Decision 182 -- see the "Created" line below.
  created_at: string | null;
  // Stage 4: the per-room split frozen at issue time. Absent on invoices
  // issued before it existed (43 of 53 today).
  room_breakdown?: InvoiceRoomLine[] | null;
  // Decision 182: resolved for display by the server, never stored.
  booking_number?: string | null;
  hotel_name?: string | null;
  agent_name?: string | null;
  // Decision 182: what the booking costs now, for the money/info split.
  booking_total_now?: number | null;
  booking_status?: string | null;
  review_notes: InvoiceReviewNote[];
  flag_acknowledged_at: string | null;
  flag_acknowledged_by: number | null;
  created_by: number;
  approved_by: number | null;
  approved_at: string | null;
  voided_by: number | null;
  voided_at: string | null;
}

// Decision 101: single shared source of truth for Net/Sale/Profit,
// reused by Reservations.tsx (detail modal + list table) and this
// module's own InvoiceDetailModal -- a direct TypeScript mirror of the
// backend's compute_booking_financials (finance/service.py), operating
// on booking fields already fetched client-side, no new API calls. Only
// figures that were never a fake placeholder to begin with belonged
// hardcoded in six different places; this exists so the real formula
// only ever lives in exactly one of them.
export interface BookingFinancialsInput {
  total_amount: number;
  agent_markup_amount: number | null;
  agent_exclusive_discount_amount: number | null;
  transfer_total: number | null;
  mandatory_tax_total: number | null;
}

export interface BookingFinancials {
  roomNet: number;
  roomSale: number;
  netTotal: number;
  saleTotal: number;
  // null (not 0) when agent_markup_amount is null -- a booking that
  // predates Decision 069's Pricing Engine integration never had a
  // markup computed at all, same NULL-vs-zero distinction the backend's
  // own markup_computed flag already carries.
  profit: number | null;
}

export function computeBookingFinancials(b: BookingFinancialsInput): BookingFinancials {
  const transfer = b.transfer_total ?? 0;
  const tax = b.mandatory_tax_total ?? 0;
  const markupComputed = b.agent_markup_amount !== null;
  const markup = b.agent_markup_amount ?? 0;
  const discount = b.agent_exclusive_discount_amount ?? 0;

  const roomNet = b.total_amount - markup + discount;
  return {
    roomNet,
    roomSale: b.total_amount,
    netTotal: roomNet + transfer + tax,
    saleTotal: b.total_amount + transfer + tax,
    profit: markupComputed ? markup - discount : null,
  };
}

// Same formula as BookingFinancials.profit, applied to an already-frozen
// Invoice's own commission/discount instead of a live Booking's markup/
// discount -- the two are numerically identical at the moment an
// invoice is created (Invoice.commission IS booking.agent_markup_amount,
// frozen), but this is the correct source for the "Frozen in invoice"
// side of InvoiceDetailModal, where computeBookingFinancials
// would need the live booking instead.
export function invoiceProfit(inv: { commission: number | null; discount: number | null }): number | null {
  if (inv.commission === null || inv.discount === null) return null;
  return inv.commission - inv.discount;
}

// Bulk, list-level Net/Sale/Profit -- mirrors backend/app/engines/finance/
// schemas.py's BookingListFinancialsResponse. See
// compute_bookings_list_financials's own docstring for why this exists:
// the Bookings list needs the same "live, commercial-line-aware if a
// manual correction exists" figure BookingDetail's own header already
// shows, instead of silently staying on computeBookingFinancials' frozen
// Pricing-Engine snapshot forever, even after a manager corrects a room's
// cost in its commercial ledger.
export interface BookingListFinancials {
  booking_id: number;
  currency: string;
  net_total: number;
  sale_total: number;
  profit: number | null;
  has_manual_adjustment: boolean;
}

// Per-room, per-category commercial cost/price ledger with a manual
// adjustment mechanism -- mirrors backend/app/engines/finance/models.py's
// BookingCommercialLine exactly (see its own docstring for the full
// rationale: Room was the only category that ever had a cost/price split
// before this; Transfer/Tax were pass-through; Meal/CIP/Excursion never
// existed as standalone figures at all).
export const COMMERCIAL_LINE_CATEGORIES = ["room", "transfer", "meal", "tax", "cip", "excursion"] as const;
export type CommercialLineCategory = (typeof COMMERCIAL_LINE_CATEGORIES)[number];

export interface BookingCommercialLine {
  id: number;
  booking_room_id: number;
  category: CommercialLineCategory;
  base_cost: number | null;
  base_price: number | null;
  adjustment_cost: number;
  adjustment_price: number;
  adjustment_note: string | null;
  adjusted_by: number | null;
  adjusted_at: string | null;
}

// Direct TypeScript mirror of finance/service.py's
// compute_booking_room_commercial_totals -- the new source for
// BookingDetail's on-screen Net/Sale/Profit box (owner-confirmed: a
// manual correction here should be reflected immediately in that
// figure), deliberately NOT used by Invoice/AgentStatement generation,
// which stay on computeBookingFinancials' frozen-Booking-column formula.
// Decision 178: cost from the ledger, sale price never. `frozenSaleTotal` is
// what the agent saw and booked at; a manual correction in the admin panel is
// an internal fact about our cost and must not re-price the agent. Passing it
// is how this mirror stays equal to the backend's own
// compute_booking_room_commercial_totals(lines, room).
export function computeCommercialLineTotals(
  lines: BookingCommercialLine[],
  frozenSaleTotal: number,
): {
  netTotal: number;
  saleTotal: number;
  profit: number;
} {
  const netTotal = lines.reduce((sum, l) => sum + (l.base_cost ?? 0) + (l.adjustment_cost ?? 0), 0);
  return { netTotal, saleTotal: frozenSaleTotal, profit: frozenSaleTotal - netTotal };
}

export async function fetchJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
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
    let detail = `Request error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response body wasn't JSON -- keep the generic message
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

// Decision 182: dd.mm.yyyy, matching every other date in the admin panel.
// It was en-US ("7/20/2026") on the finance screens alone -- and 7/20 vs
// 20/7 is exactly the ambiguity a financial screen cannot afford.
export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB").replace(/\//g, ".");
}

// Date plus time. Creation and approval can be seconds apart (they were,
// on the invoice that surfaced this), and a date alone cannot show which
// came first.
export function formatDateTime(value: string) {
  const d = new Date(value);
  return `${d.toLocaleDateString("en-GB").replace(/\//g, ".")} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const statusBadgeClasses: Record<string, string> = {
  Issued: "bg-teal/15 text-teal",
  Void: "bg-slate/10 text-slate",
  Draft: "bg-coral/15 text-coral",
  Active: "bg-teal/15 text-teal",
  Fulfilled: "bg-ink/10 text-ink",
  Expired: "bg-slate/10 text-slate",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses[status] ?? "bg-slate/10 text-slate"}`}>
      {label ?? status}
    </span>
  );
}

// Decision 099: takes the narrowest shape it actually uses, not the
// full Invoice type -- lets Reservations.tsx's much smaller InvoiceInfo
// (booking detail view's own invoice summary, not the full Finance
// Invoice shape) pass structurally without needing every Invoice field
// it doesn't have and doesn't need. Invoice itself still satisfies this
// shape automatically, so no existing call site changes.
interface UrgentFlaggable {
  status: string;
  review_notes: InvoiceReviewNote[];
  flag_acknowledged_at: string | null;
  // Decision 182: needed by flagKind/flagAmountDelta. Optional so the
  // panels that build a lighter object for isUrgentFlag still typecheck.
  total?: number;
  booking_total_now?: number | null;
  booking_status?: string | null;
}

// Decision 093: urgency is computed from the latest review note's
// timestamp vs. flag_acknowledged_at, not from a single field that has
// to be remembered and cleared -- mirrors the exact same logic as the
// backend's list_urgent_invoices query, so the two can never disagree.
// This structurally fixes a real, DB-traced bug in the old
// review_flag+flag_acknowledged_at pair: a second flag after
// acknowledgment updated the text but never reset flag_acknowledged_at,
// so it silently never re-appeared as urgent.
export function isUrgentFlag(inv: UrgentFlaggable): boolean {
  if (inv.status === "Void" || inv.review_notes.length === 0) return false;
  if (!inv.flag_acknowledged_at) return true;
  const latestNote = inv.review_notes[inv.review_notes.length - 1];
  return new Date(latestNote.created_at) > new Date(inv.flag_acknowledged_at);
}

// Decision 182: not every flag is a money problem, and treating them alike
// made the ones that are impossible to spot.
//
// A booking can change after its invoice was issued without the amount
// moving at all -- INV-5E0847DAC701 carries FOUR date-change notes and its
// total is 2,412.50 both before and after. That sat in exactly the same red
// as INV-3A3B7074F568, which really is 75.45 short. One of those needs a
// credit note; the other needs someone to glance at it.
//
// "money" wins over "info" when both are present, since the amount is the
// part that costs something to get wrong.
export type FlagKind = "money" | "info";

// A live invoice whose booking was cancelled or rejected. Its own state, not
// a price difference: nothing is owed because the booking is gone, and
// reporting that as "Amount -1,609.05" describes it wrongly.
export function invoiceOnCancelledBooking(inv: UrgentFlaggable): boolean {
  return (
    inv.status !== "Void" &&
    (inv.booking_status === "Cancelled" || inv.booking_status === "Rejected")
  );
}

export function flagKind(inv: UrgentFlaggable): FlagKind {
  if (invoiceOnCancelledBooking(inv)) return "money";
  // The decisive test: does the invoice still equal what the booking costs?
  // Judging on the notes alone was not enough -- INV-3A3B7074F568 is 75.45
  // short and every one of its notes predates structured price snapshots, so
  // it read as harmless.
  if (inv.total != null && inv.booking_total_now != null &&
      Math.abs(inv.booking_total_now - inv.total) > 0.01) {
    return "money";
  }
  for (const note of inv.review_notes) {
    if (note.old_total !== null && note.new_total !== null &&
        Math.abs(note.new_total - note.old_total) > 0.01) {
      return "money";
    }
  }
  return "info";
}

// The size of the money move across every note on the invoice, oldest to
// newest -- null when no note recorded both sides of a price.
export function flagAmountDelta(inv: UrgentFlaggable): number | null {
  // The gap that actually matters: invoice vs booking now. Falls back to the
  // notes' own snapshots for an invoice whose booking total we don't have.
  if (inv.total != null && inv.booking_total_now != null &&
      Math.abs(inv.booking_total_now - inv.total) > 0.01) {
    return inv.booking_total_now - inv.total;
  }
  const withPrice = inv.review_notes.filter((n) => n.old_total !== null && n.new_total !== null);
  if (withPrice.length === 0) return null;
  const first = withPrice[0];
  const last = withPrice[withPrice.length - 1];
  return (last.new_total as number) - (first.old_total as number);
}

// Decision 094: a note has a structured price snapshot (both old_total
// and new_total set) when it was created by the date-change flow after
// Decision 094 shipped -- the 14 pre-Decision-094 legacy notes only
// ever have change_description text, no structured fields at all.
export function hasPriceSnapshot(note: InvoiceReviewNote): boolean {
  return note.old_total !== null && note.new_total !== null;
}

// Decision 111: dates are captured unconditionally by add_invoice_review_note
// (backend/app/engines/finance/service.py) even when old-price repricing
// fails and old_total/new_total stay null -- so a note can have a full date
// snapshot without a full price snapshot. Building the sentence from these
// language-neutral fields client-side, in English, means this path never
// depends on the backend's Russian change_description fallback string at
// all (defense in depth: that fallback is still translated server-side too,
// but is never actually read as long as this tier exists), and works
// retroactively for any existing row shaped this way, same as the
// full-price-snapshot tier above already does.
export function hasDateSnapshot(note: InvoiceReviewNote): boolean {
  return (
    note.old_arrival_date !== null &&
    note.old_departure_date !== null &&
    note.new_arrival_date !== null &&
    note.new_departure_date !== null
  );
}

export function formatSingleNote(note: InvoiceReviewNote, currency: string): string {
  if (hasPriceSnapshot(note)) {
    const diff = note.new_total! - note.old_total!;
    const diffStr = Math.abs(diff) <= 0.01 ? "no change" : `${diff > 0 ? "+" : ""}${formatMoney(diff, currency)}`;
    return (
      `Change ${note.sequence_number} (${formatDate(note.created_at)}): ` +
      `Was [${formatDate(note.old_arrival_date!)} – ${formatDate(note.old_departure_date!)}], ` +
      `${note.old_offer_name ?? "contract only"}, total ${formatMoney(note.old_total!, currency)} → ` +
      `Now [${formatDate(note.new_arrival_date!)} – ${formatDate(note.new_departure_date!)}], ` +
      `${note.new_offer_name ?? "contract only"}, total ${formatMoney(note.new_total!, currency)} ` +
      `(difference: ${diffStr})`
    );
  }
  if (hasDateSnapshot(note)) {
    return (
      `Change ${note.sequence_number} (${formatDate(note.created_at)}): ` +
      `Dates [${formatDate(note.old_arrival_date!)} – ${formatDate(note.old_departure_date!)}] → ` +
      `[${formatDate(note.new_arrival_date!)} – ${formatDate(note.new_departure_date!)}] ` +
      `(amounts unavailable)`
    );
  }
  return `Change ${note.sequence_number}: ${note.change_description ?? ""} (${formatDate(note.created_at)})`;
}

// Joined, single-string rendering of the full numbered history -- used
// wherever the review_notes list needs to collapse into one string
// (CSV export, tooltips, confirm() dialogs), so the full history is
// still visible even outside the detail modal's own list rendering.
export function formatReviewNotes(notes: InvoiceReviewNote[], currency: string): string {
  return notes.map((note) => formatSingleNote(note, currency)).join("\n");
}

// Decision 096: a highlighted "this specific thing changed" line for
// InvoiceDetailModal's "Current booking state" block, generic across
// whatever kind of change a note captures -- not hardcoded to dates.
// Each field-change type this project ever adds gets its own small
// "build" function producing this exact shape; deriveChangeHighlights
// below is where a future one gets wired in. Rendering never needs to
// change, only this file.
export interface ChangeHighlight {
  label: string;
  newValue: string;
  oldValue: string;
  delta: string;
}

function pluralizeNights(n: number): string {
  return Math.abs(n) === 1 ? "night" : "nights";
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function buildDateChangeHighlight(
  oldArrival: string, oldDeparture: string, newArrival: string, newDeparture: string
): ChangeHighlight {
  const nightsDiff = daysBetween(oldArrival, oldDeparture) * -1 + daysBetween(newArrival, newDeparture);
  let delta: string;
  if (nightsDiff !== 0) {
    delta = `${nightsDiff > 0 ? "+" : ""}${nightsDiff} ${pluralizeNights(nightsDiff)}`;
  } else {
    const shiftDays = daysBetween(oldArrival, newArrival);
    delta = shiftDays !== 0 ? `shifted by ${shiftDays > 0 ? "+" : ""}${shiftDays} d.` : "no change";
  }
  return {
    label: "New dates",
    newValue: `${formatDate(newArrival)} – ${formatDate(newDeparture)}`,
    oldValue: `${formatDate(oldArrival)} – ${formatDate(oldDeparture)}`,
    delta,
  };
}

// latestNote's old_* fields are compared against the live-fetched
// booking's CURRENT dates (passed in as currentArrival/currentDeparture)
// -- not the note's own new_* fields -- since the modal already fetches
// the booking separately for exactly this "what's actually true right
// now" purpose, and that's more robust than trusting a snapshot field.
// Only ever derived from the LATEST note (the single most recent
// change), not cumulative drift across every note in the history.
export function deriveChangeHighlights(
  latestNote: InvoiceReviewNote | undefined,
  currentArrival: string,
  currentDeparture: string
): ChangeHighlight[] {
  const highlights: ChangeHighlight[] = [];
  if (
    latestNote?.old_arrival_date &&
    latestNote.old_departure_date &&
    (latestNote.old_arrival_date !== currentArrival || latestNote.old_departure_date !== currentDeparture)
  ) {
    highlights.push(
      buildDateChangeHighlight(latestNote.old_arrival_date, latestNote.old_departure_date, currentArrival, currentDeparture)
    );
  }
  // Future extension point: a note type capturing a room-type or
  // meal-plan change would add another `if (latestNote?.old_room_type_name
  // && ...) highlights.push(buildRoomTypeChangeHighlight(...))` block
  // here, same {label, oldValue, newValue, delta} shape.
  return highlights;
}

// "Void" (Invoice) and "Cancelled" (Booking) are deliberately NOT
// unified into one word -- an invoice can be voided for reasons
// unrelated to the booking (e.g. a data-entry correction on an
// otherwise-valid booking). The label stays "Void" always, with
// a qualifier appended only when the linked booking is actually
// terminal too.
export function voidLabel(bookingStatus: string | null): string {
  if (bookingStatus === "Cancelled") return "Void (booking cancelled)";
  if (bookingStatus === "Rejected") return "Void (booking rejected by hotel)";
  return "Void";
}

// ---------------------------------------------------------------------------
// Agent search-select -- never loads the full agent list. Only fires a
// server-side-filtered search (GET /users?search=...&role=agent&limit=10)
// once at least 2 characters are typed, debounced, so it stays safe at a
// realistic 100+-agent volume. Used by both Invoices.tsx and Balance.tsx.
// ---------------------------------------------------------------------------

export interface AgentOption {
  id: number;
  name: string;
  email: string;
}

export function AgentSearchSelect({
  selected,
  onSelect,
}: {
  selected: AgentOption | null;
  onSelect: (agent: AgentOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AgentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const token = localStorage.getItem("token") || "";
    setSearching(true);
    const handle = setTimeout(() => {
      fetchJson<AgentOption[]>(`/users?search=${encodeURIComponent(query.trim())}&role=agent&limit=10`, token)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-ink/15 bg-sand/60 px-4 py-2.5 text-sm text-ink">
          {selected.name} <span className="text-slate/50">({selected.email})</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-slate/70 hover:bg-sand/60"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-[280px]">
      <input
        type="text"
        placeholder="Enter agent name (min. 2 characters)..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink/10 bg-white shadow-lg">
          {searching ? (
            <p className="px-4 py-3 text-sm text-slate/50">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate/50">No agents found</p>
          ) : (
            results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a);
                  setOpen(false);
                }}
                className="block w-full appearance-none border-0 border-b border-ink/5 bg-white px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-sand/40"
              >
                <span className="font-medium text-ink">{a.name}</span>
                <span className="ml-2 text-slate/60">{a.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice detail modal -- unchanged in behavior from Decision 083/085,
// except actor-name resolution: previously took a userNames prop sourced
// from a full /users fetch (the exact anti-pattern this whole restructure
// exists to remove). Now resolves its own at-most-3 ids on demand via
// GET /users/{id}, one call per open, never the full list.
// ---------------------------------------------------------------------------

interface DetailBooking {
  id: number;
  booking_number: string;
  status: string;
  hotel_id: number;
  contract_id: number;
  room_type_id: number;
  meal_plan_id: number;
  arrival_date: string;
  departure_date: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  currency: string;
  total_amount: number;
  agent_markup_amount: number | null;
  agent_exclusive_discount_amount: number | null;
  transfer_type: string | null;
  transfer_total: number | null;
  mandatory_tax_total: number | null;
}

// Decision 190: the two sides of one booking, each per room.
//
// "Incoming" is what WE owe the hotel; "Outgoing" is what the AGENT pays us.
// They were previously one blended pair of numbers, so the question a manager
// actually asks -- "the hotel billed us more than we expected, which room, and
// why" -- had nowhere to be asked. Per room, because a hotel confirms a
// multi-room application room by room and a single booking-level figure
// cannot say where a discrepancy is.
interface SummaryRoom {
  booking_room_id: number;
  sequence_number: number;
  status: string;
  billable: boolean;
  lines: { category: string; cost: number; price: number; adjusted: boolean }[];
  net_total: number;
  sale_total: number;
}
interface Summary {
  currency: string;
  rooms: SummaryRoom[];
  net_total: number;
  sale_total: number;
  // Decision 191: ONE confirmation for the whole application.
  hotel_confirmed_amount: number | null;
  hotel_reference: string | null;
  hotel_note: string | null;
  hotel_difference: number | null;
  billable_rooms: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  room: "Accommodation",
  transfer: "Transfer",
  meal: "Meal",
  tax: "Mandatory tax",
  cip: "CIP (airport)",
  excursion: "Excursion",
};

// Decision 191: one editor for the whole application. It was one per room,
// which modelled a conversation that does not happen -- the owner: "если 2
// номера всё равно будет 1 переписка с отелем... всё под один email будет".
// A per-room form would have asked a manager to split one hotel invoice
// across rooms by hand before they could record it at all.
function HotelConfirmationEditor({
  bookingId,
  summary,
  currency,
  onSaved,
}: {
  bookingId: number;
  summary: Summary;
  currency: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    summary.hotel_confirmed_amount !== null ? String(summary.hotel_confirmed_amount) : "",
  );
  const [reference, setReference] = useState(summary.hotel_reference ?? "");
  const [note, setNote] = useState(summary.hotel_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = parseFloat(amount);
    if (Number.isNaN(value)) {
      setError("Enter the amount the hotel billed");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("token") || "";
      await fetchJson(`/finance-engine/bookings/${bookingId}/hotel-confirmation`, token, {
        method: "PUT",
        body: JSON.stringify({
          confirmed_amount: value,
          hotel_reference: reference.trim() || null,
          note: note.trim() || null,
        }),
      });
      setEditing(false);
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        {summary.hotel_confirmed_amount === null ? (
          <span className="text-slate/50">
            The hotel has not confirmed this booking
            {summary.billable_rooms > 1 && <> ({summary.billable_rooms} rooms, one invoice)</>}
          </span>
        ) : (
          <>
            <span className="text-slate/60">
              Hotel billed <strong className="text-ink">{formatMoney(summary.hotel_confirmed_amount, currency)}</strong>
              {summary.hotel_reference && <span className="ml-1 text-slate/50">· {summary.hotel_reference}</span>}
            </span>
            {summary.hotel_difference !== null && Math.abs(summary.hotel_difference) > 0.01 && (
              <span className="rounded-full bg-danger/10 px-1.5 py-0.5 font-semibold text-danger">
                {summary.hotel_difference > 0 ? "+" : ""}
                {formatMoney(summary.hotel_difference, currency)} vs our figure
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-ink/20 bg-white px-2 py-0.5 text-[11px] font-medium text-ink/70 hover:bg-sand"
        >
          {summary.hotel_confirmed_amount === null ? "Record" : "Edit"}
        </button>
        {summary.hotel_note && <span className="basis-full text-slate/50">{summary.hotel_note}</span>}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-[11px] text-slate/50">
        Hotel billed, {currency}
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded border border-ink/15 bg-white px-2 py-1 text-xs text-ink focus:border-gold focus:outline-none"
        />
      </label>
      <label className="flex flex-col text-[11px] text-slate/50">
        Hotel reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="their invoice #"
          className="w-36 rounded border border-ink/15 bg-white px-2 py-1 text-xs text-ink focus:border-gold focus:outline-none"
        />
      </label>
      <label className="flex min-w-[180px] flex-1 flex-col text-[11px] text-slate/50">
        Why it differs
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="resort fee, late checkout, agreed discount…"
          className="rounded border border-ink/15 bg-white px-2 py-1 text-xs text-ink focus:border-gold focus:outline-none"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded bg-ink px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="rounded border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-slate/70"
      >
        Cancel
      </button>
      {error && <p className="basis-full text-xs text-danger">{error}</p>}
    </div>
  );
}

function SideBySide({
  bookingId,
  summary,
  onReload,
}: {
  bookingId: number;
  summary: Summary;
  onReload: () => void;
}) {
  const cur = summary.currency;
  const cell = "border-b border-r border-ink/20 px-3 py-2 align-middle text-ink";
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* INCOMING -- our cost. Every category, per room, plus whatever the
          hotel itself says, so a difference is visible where it happens
          rather than only in a blended total. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
          Incoming — what we owe the hotel
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-ink/25 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-ink">
                <th className="border-b-2 border-r border-ink/25 px-3 py-2 text-left font-semibold">Item</th>
                <th className="border-b-2 border-ink/25 px-3 py-2 text-right font-semibold">Cost, {cur}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rooms.map((room) => (
                <Fragment key={room.booking_room_id}>
                  <tr className="bg-sand/40">
                    <td colSpan={2} className="border-b border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink">
                      Room {room.sequence_number}
                      {!room.billable && (
                        <span className="ml-1.5 font-normal text-slate/50">· {room.status.toLowerCase()}, not charged</span>
                      )}
                    </td>
                  </tr>
                  {room.lines.map((l) => (
                    <tr key={`in-${room.booking_room_id}-${l.category}`}>
                      <td className={cell}>
                        {CATEGORY_LABEL[l.category] ?? l.category}
                        {l.adjusted && <span className="ml-1 text-xs text-gold">· corrected</span>}
                      </td>
                      <td className={`${cell} border-r-0 whitespace-nowrap text-right tabular-nums`}>
                        {formatMoney(l.cost, cur)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className={cell}>Room {room.sequence_number} subtotal</td>
                    <td className={`${cell} border-r-0 whitespace-nowrap text-right tabular-nums`}>
                      {formatMoney(room.net_total, cur)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink">
                <td className="border-t-2 border-r border-ink/25 px-3 py-2">Total incoming</td>
                <td className="border-t-2 border-ink/25 px-3 py-2 text-right tabular-nums">
                  {formatMoney(summary.net_total, cur)}
                </td>
              </tr>
              {summary.hotel_confirmed_amount !== null && (
                <tr className={summary.hotel_difference && Math.abs(summary.hotel_difference) > 0.01 ? "text-danger" : "text-ink/70"}>
                  <td className="border-r border-ink/25 px-3 py-2 text-xs">Hotel's own invoice</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {formatMoney(summary.hotel_confirmed_amount, cur)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        {/* Decision 191: one confirmation, under the table it is compared
            against -- the hotel invoices this application once, in one
            email, whether it holds 1 room or 8. */}
        <HotelConfirmationEditor
          bookingId={bookingId}
          summary={summary}
          currency={cur}
          onSaved={onReload}
        />
      </div>

      {/* OUTGOING -- the agent's price. Frozen at booking (Decision 178), so
          a correction on the incoming side never moves it. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
          Outgoing — what the agent pays
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-ink/25 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-ink">
                <th className="border-b-2 border-r border-ink/25 px-3 py-2 text-left font-semibold">Item</th>
                <th className="border-b-2 border-ink/25 px-3 py-2 text-right font-semibold">Price, {cur}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rooms.map((room) => (
                <Fragment key={room.booking_room_id}>
                  <tr className="bg-sand/40">
                    <td colSpan={2} className="border-b border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink">
                      Room {room.sequence_number}
                      {!room.billable && (
                        <span className="ml-1.5 font-normal text-slate/50">· {room.status.toLowerCase()}, not charged</span>
                      )}
                    </td>
                  </tr>
                  {room.lines.map((l) => (
                    <tr key={`out-${room.booking_room_id}-${l.category}`}>
                      <td className={cell}>{CATEGORY_LABEL[l.category] ?? l.category}</td>
                      <td className={`${cell} border-r-0 whitespace-nowrap text-right tabular-nums`}>
                        {formatMoney(l.price, cur)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className={cell}>Room {room.sequence_number} subtotal</td>
                    <td className={`${cell} border-r-0 whitespace-nowrap text-right tabular-nums`}>
                      {formatMoney(room.sale_total, cur)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink">
                <td className="border-t-2 border-r border-ink/25 px-3 py-2">Total outgoing</td>
                <td className="border-t-2 border-ink/25 px-3 py-2 text-right tabular-nums">
                  {formatMoney(summary.sale_total, cur)}
                </td>
              </tr>
              <tr className={summary.sale_total - summary.net_total < 0 ? "text-danger" : "text-ink/70"}>
                <td className="border-r border-ink/25 px-3 py-2 text-xs">Margin (outgoing − incoming)</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatMoney(summary.sale_total - summary.net_total, cur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export function InvoiceDetailModal({
  invoice,
  onClose,
  onAcknowledged,
}: {
  invoice: Invoice;
  onClose: () => void;
  onAcknowledged?: () => void;
}) {
  const [acknowledging, setAcknowledging] = useState(false);

  async function handleAcknowledge() {
    const token = localStorage.getItem("token") || "";
    try {
      setAcknowledging(true);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/acknowledge-flag`, token, { method: "POST" });
      onAcknowledged?.();
    } catch (err: any) {
      alert(err.message || "Failed to mark as reviewed");
    } finally {
      setAcknowledging(false);
    }
  }

  const [booking, setBooking] = useState<DetailBooking | null>(null);
  const [roomTypeName, setRoomTypeName] = useState<string>("");
  const [mealPlanLabel, setMealPlanLabel] = useState<string>("");
  // Decision 182: the three live Contract Engine re-pricing calls that used
  // to feed the right-hand column are gone. That column now reads the
  // agent-facing price breakdown instead, which is the same figure the agent
  // sees -- so the modal makes two or three fewer cross-engine calls per open
  // AND can no longer show a number the agent's own screen disagrees with.
  const [actorNames, setActorNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    const ids = Array.from(
      new Set(
        [invoice.created_by, invoice.approved_by, invoice.voided_by, invoice.flag_acknowledged_by].filter(
          (id): id is number => id !== null
        )
      )
    );
    Promise.all(
      ids.map((id) =>
        fetchJson<{ id: number; name: string }>(`/users/${id}`, token).catch(() => null)
      )
    ).then((users) => {
      const map: Record<number, string> = {};
      users.forEach((u) => {
        if (u) map[u.id] = u.name;
      });
      setActorNames(map);
    });
  }, [invoice.created_by, invoice.approved_by, invoice.voided_by, invoice.flag_acknowledged_by]);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    setLoading(true);
    setError(null);

    fetchJson<DetailBooking>(`/booking-engine/bookings/${invoice.booking_id}`, token)
      .then(async (b) => {
        setBooking(b);

        const [roomType, mealPlans] = await Promise.all([
          fetchJson<{ room_name: string }>(`/hotel-engine/room-types/${b.room_type_id}`, token),
          fetchJson<{ id: number; meal_code: string; meal_name: string | null }[]>(
            `/contract-engine/contracts/${b.contract_id}/meal-plans`,
            token
          ),
        ]);
        setRoomTypeName(roomType.room_name);
        const mealPlan = mealPlans.find((mp) => mp.id === b.meal_plan_id);
        setMealPlanLabel(mealPlan?.meal_name || mealPlan?.meal_code || `#${b.meal_plan_id}`);

      })
      .catch((err: any) => setError(err.message || "Failed to load booking details"))
      .finally(() => setLoading(false));
  }, [invoice.booking_id]);

  // Decision 101: liveFinancials.saleTotal replaces what used to be a
  // separately hand-written liveTotal formula -- same numbers, one
  // source of truth instead of two copies of the same arithmetic.


  // Decision 182: the two comparison columns, on one basis.
  //
  // Frozen side: built from the invoice's own InvoiceRoomLine rows, which
  // were snapshotted at issue time and reconcile to `total` exactly --
  // verified on all 10 invoices that have them. Older invoices (43 of 53)
  // never recorded the split, so this is null for them and the column shows
  // the total alone rather than a split reverse-engineered from aggregates.
  const frozenLines = (() => {
    const lines = invoice.room_breakdown ?? [];
    if (lines.length === 0) return null;
    return {
      room: lines.reduce((sum, l) => sum + (l.room_sale ?? 0), 0),
      transfer: lines.reduce((sum, l) => sum + (l.transfer_amount ?? 0), 0),
      tax: lines.reduce((sum, l) => sum + (l.tax_amount ?? 0), 0),
    };
  })();

  // Current side: the agent-facing price breakdown (Decision 181), the same
  // endpoint the agent's own screen reads, so the invoice's "now" column and
  // what the agent is actually looking at cannot disagree.
  // Decision 190: the two sides, per room, plus the hotel's own figures.
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryReload, setSummaryReload] = useState(0);
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    let cancelled = false;
    fetchJson<Summary>(`/finance-engine/bookings/${invoice.booking_id}/commercial-summary`, token)
      .then((d) => {
        if (!cancelled) setSummary(d);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice.booking_id, summaryReload]);

  const [currentLines, setCurrentLines] = useState<
    { room: number; transfer: number; tax: number; total: number; currency: string } | null
  >(null);
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    let cancelled = false;
    setCurrentLines(null);
    fetchJson<{
      currency: string;
      total: number;
      rooms: { billable: boolean; lines: { category: string; price: number }[] }[];
    }>(`/finance-engine/bookings/${invoice.booking_id}/price-breakdown`, token)
      .then((d) => {
        if (cancelled) return;
        const pick = (category: string) =>
          d.rooms
            .filter((r) => r.billable)
            .reduce((sum, r) => sum + (r.lines.find((l) => l.category === category)?.price ?? 0), 0);
        setCurrentLines({
          room: pick("room"),
          transfer: pick("transfer"),
          tax: pick("tax"),
          total: d.total,
          currency: d.currency,
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice.booking_id]);

  // Decision 192: "what the booking costs now" is the total across EVERY
  // billable room -- the same figure the "Booking now" column beside it
  // already shows, read from the same endpoint.
  //
  // It used to be computeBookingFinancials(booking), which reads the parent
  // Booking row -- and on a multi-room application those columns hold the
  // REPRESENTATIVE FIRST ROOM only. On BK-000080 that made this section
  // compare 1,964.50 (room #1) against an invoice for 6,700.50 and raise
  // "the price differs" while the column two centimetres away correctly
  // showed 6,700.50 = 6,700.50. Two answers to one question on one screen,
  // and the wrong one was the one shouting.
  //
  // Same bug class Decision 178 fixed for the list and the breakdown; this
  // was the one place it survived.
  const liveTotal = currentLines ? currentLines.total : null;
  const mismatch = liveTotal !== null && Math.abs(liveTotal - invoice.total) > 0.01;
  // Decision 182: profit is no longer shown inside the invoice block -- an
  // invoice is what the agent pays, our margin belongs in the booking's
  // commercial breakdown. invoiceProfit() itself stays; Balance still uses it.
  // Decision 183: the same collapsible sections the booking detail uses --
  // one design across the admin panel instead of a modal that stacks five
  // permanently-open panels. Opens on "Amounts", the reason anyone opens an
  // invoice; everything else is one click away.
  const [openSection, setOpenSection] = useState<string | null>("amounts");
  const toggleSection = (key: string) => setOpenSection((cur) => (cur === key ? null : key));

  const latestNote = invoice.review_notes.length > 0 ? invoice.review_notes[invoice.review_notes.length - 1] : undefined;
  const changeHighlights = booking ? deriveChangeHighlights(latestNote, booking.arrival_date, booking.departure_date) : [];

  return (
    // Decision 184: ONE size, always large. It was max-w-2xl (672px) with a
    // height that followed its content, so a draft with three lines and an
    // issued invoice with a change history opened as two visibly different
    // windows -- and both too narrow for the two side-by-side money columns
    // they carry.
    //
    // Now 1400px wide, the same as the booking detail (owner: "как в
    // booking"), and a FIXED 85vh tall rather than a max-height: a max grows
    // with content, which is exactly what made two invoices look like two
    // different windows. The header stays put and only the body scrolls, so
    // every invoice opens identically whatever it contains.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink/10 px-6 py-4">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            Invoice {invoice.invoice_number}
            <StatusBadge
              status={invoice.status}
              label={invoice.status === "Void" ? voidLabel(booking?.status ?? null) : undefined}
            />
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-slate/70 hover:bg-sand/60"
          >
            Close
          </button>
        </div>

        {/* Only this scrolls -- the title and Close stay visible however long
            the change history gets. */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Section 1: the money. Open by default. */}
        <div>
        <SectionCard
          sectionKey="amounts"
          number={1}
          openSection={openSection}
          onToggleSection={toggleSection}
          title={
            <span className="inline-flex items-center gap-1.5">
              Amounts
              {/* Decision 192: the owner could not tell what this section was
                  for, which is a fair complaint -- it looks like the money
                  again, and it is not. It answers one question. */}
              <ActionInfo
                text={
                  "Has the booking changed since this invoice was issued? Left: the amount frozen " +
                  "into the invoice. Right: what the booking costs today, across every billable room. " +
                  "Equal means the invoice is still correct and safe to approve or send. Different " +
                  "means the booking moved after invoicing — check what changed before approving, and " +
                  "issue a credit note or a new invoice if the agent is owed a different amount."
                }
              />
            </span>
          }
          summary={formatMoney(invoice.total, invoice.currency)}
        >
        {invoice.review_notes.length > 0 && !loading && !error && liveTotal !== null && (
          <div className="rounded-lg border border-ink/10 bg-sand/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate/70">
                Was: <strong className="text-ink">{formatMoney(invoice.total, invoice.currency)}</strong>{" "}
                <span className="text-slate/50">(frozen {formatDate(invoice.issue_date)})</span>
              </span>
              <span className="text-slate/40">→</span>
              <span className="text-slate/70">
                Now: <strong className="text-ink">{formatMoney(liveTotal, invoice.currency)}</strong>{" "}
                <span className="text-slate/50">(current)</span>
              </span>
            </div>
            <div className="mt-1">
              {Math.abs(liveTotal - invoice.total) <= 0.01 ? (
                <span className="text-slate/50">No change in amount</span>
              ) : (
                <span className={liveTotal > invoice.total ? "font-medium text-coral" : "font-medium text-teal"}>
                  Difference: {liveTotal > invoice.total ? "+" : ""}
                  {formatMoney(liveTotal - invoice.total, invoice.currency)}
                </span>
              )}
            </div>
          </div>
        )}

        {loading && <p className="mt-6 text-center text-sm text-slate/60">Loading...</p>}
        {error && <p className="mt-6 text-center text-sm text-red-600">Error: {error}</p>}

        {!loading && !error && booking && (
          <>
            {/* Decision 192: room type, dates and guests here come from the
                parent Booking row, which on a multi-room application holds
                the FIRST room's values -- so they describe one room while
                reading like the whole booking. Not recomputed (the per-room
                truth is in section 2, one click away); said out loud
                instead, which is the part that was missing. */}
            {summary && summary.billable_rooms > 1 && (
              <p className="mt-2 rounded-lg bg-sand/60 px-3 py-1.5 text-xs text-slate/70">
                This booking has {summary.billable_rooms} rooms. The details below describe room 1 only —
                see <strong className="text-ink">Incoming &amp; outgoing</strong> for every room.
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate/70">
              <span>Booking: <strong className="text-ink">{booking.booking_number}</strong></span>
              <span>Room type: <strong className="text-ink">{roomTypeName}</strong></span>
              <span>
                Dates: <strong className="text-ink">{formatDate(booking.arrival_date)} — {formatDate(booking.departure_date)} ({booking.nights} night{booking.nights === 1 ? "" : "s"})</strong>
              </span>
              <span>Meal plan: <strong className="text-ink">{mealPlanLabel}</strong></span>
              <span>Guests: <strong className="text-ink">{booking.adults} adult{booking.adults === 1 ? "" : "s"} / {booking.children} child{booking.children === 1 ? "" : "ren"} / {booking.infants} infant{booking.infants === 1 ? "" : "s"}</strong></span>
            </div>

            {/* Decision 182: like for like. The two columns used to be built
                on different bases and stacked as if they were addends -- the
                right one listed "Base rate (net)", "Supplements", "Discount",
                "Commission", "Profit", then a Total that none of them added
                up to. On BK-000025 it read 1,509 + 828 + 72 above a total of
                1,684.50, because the base rate is a contract-side net figure
                and the total is the agent's price.

                Both sides now carry the SAME three agent-facing rows and both
                add up: what the invoice froze, and what the booking says now.
                Cost, commission and profit are gone from here -- an invoice is
                what the agent pays; our margin belongs in the booking's
                commercial breakdown, not inside the document. */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Frozen in invoice — what the agent was billed</p>
                {frozenLines ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate/60">Accommodation</span><span className="text-ink">{formatMoney(frozenLines.room, invoice.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Transfer</span><span className="text-ink">{formatMoney(frozenLines.transfer, invoice.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Mandatory tax</span><span className="text-ink">{formatMoney(frozenLines.tax, invoice.currency)}</span></div>
                    <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Total</span><span className="text-ink">{formatMoney(invoice.total, invoice.currency)}</span></div>
                  </div>
                ) : (
                  /* Invoices issued before per-room lines were frozen (43 of
                     53 today) never recorded the split. Showing the total
                     alone is honest; inventing a split from the aggregate
                     columns would be a guess presented as a record. */
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Total</span><span className="text-ink">{formatMoney(invoice.total, invoice.currency)}</span></div>
                    <p className="pt-1 text-xs text-slate/50">
                      Issued before the per-line split was recorded — only the total was frozen.
                    </p>
                  </div>
                )}
              </div>

              <div className={`rounded-xl border p-3 ${mismatch ? "border-coral/40 bg-coral/5" : "border-ink/10"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Booking now — all rooms</p>
                {changeHighlights.map((h, i) => (
                  <div key={i} className="mt-2 rounded-lg bg-coral/10 px-2 py-1.5 text-sm font-medium text-coral">
                    {h.label}: {h.newValue}{" "}
                    <span className="font-normal text-coral/70">(was: {h.oldValue}, {h.delta})</span>
                  </div>
                ))}
                {currentLines ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate/60">Accommodation</span><span className="text-ink">{formatMoney(currentLines.room, currentLines.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Transfer</span><span className="text-ink">{formatMoney(currentLines.transfer, currentLines.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Mandatory tax</span><span className="text-ink">{formatMoney(currentLines.tax, currentLines.currency)}</span></div>
                    <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Total now</span><span className="text-ink">{formatMoney(currentLines.total, currentLines.currency)}</span></div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate/50">Loading…</p>
                )}
              </div>
            </div>

            {/* Decision 192: it now says so either way. Silence on the good
                case is what made the warning unreadable -- there was no
                "checked and fine" state to contrast it against. */}
            {liveTotal !== null && (
              mismatch ? (
                <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
                  ⚠ The booking has changed since this invoice was issued: it now costs{" "}
                  {formatMoney(liveTotal, invoice.currency)} against the invoice's{" "}
                  {formatMoney(invoice.total, invoice.currency)} ({liveTotal > invoice.total ? "+" : ""}
                  {formatMoney(liveTotal - invoice.total, invoice.currency)}). Review before approving.
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
                  ✓ The invoice still matches the booking — {formatMoney(invoice.total, invoice.currency)}.
                </div>
              )
            )}
          </>
        )}
        </SectionCard>
        </div>
        {/* Section 2: the two sides of the money, each per room. */}
        <div className="mt-2">
        <SectionCard
          sectionKey="sides"
          number={2}
          openSection={openSection}
          onToggleSection={toggleSection}
          title="Incoming & outgoing"
          summary={
            summary
              ? `${formatMoney(summary.net_total, summary.currency)} → ${formatMoney(summary.sale_total, summary.currency)}`
              : "…"
          }
        >
          {summary ? (
            <SideBySide
              bookingId={invoice.booking_id}
              summary={summary}
              onReload={() => setSummaryReload((n) => n + 1)}
            />
          ) : (
            <p className="text-sm text-slate/50">Loading…</p>
          )}
        </SectionCard>
        </div>

        {/* Section 3: the change history. Auto-opens while it is still
            unreviewed, since that is the one case where it is the reason the
            invoice was opened at all. */}
        {invoice.review_notes.length > 0 && (
        <div className="mt-2">
        <SectionCard
          sectionKey="changes"
          number={3}
          openSection={isUrgentFlag(invoice) && openSection === "amounts" ? "changes" : openSection}
          onToggleSection={toggleSection}
          title="Changes since this invoice"
          summary={`${invoice.review_notes.length} note${invoice.review_notes.length === 1 ? "" : "s"}`}
        >
        {(
          isUrgentFlag(invoice) ? (
            <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
              <div className="space-y-1.5">
                {invoice.review_notes.map((note) => (
                  <div key={note.id}>⚠ {formatSingleNote(note, invoice.currency)}</div>
                ))}
              </div>
              {invoice.status === "Issued" && (
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="mt-2 appearance-none rounded-lg border-0 bg-coral px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {acknowledging ? "..." : "Mark as reviewed"}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-xs text-slate/60">
              {invoice.flag_acknowledged_at && (
                <p className="mb-1">
                  Reviewed (
                  {invoice.flag_acknowledged_by !== null
                    ? actorNames[invoice.flag_acknowledged_by] ?? `#${invoice.flag_acknowledged_by}`
                    : "—"}
                  , {formatDate(invoice.flag_acknowledged_at)})
                </p>
              )}
              <div className="space-y-1">
                {invoice.review_notes.map((note) => (
                  <div key={note.id}>{formatSingleNote(note, invoice.currency)}</div>
                ))}
              </div>
            </div>
          )
        )}
        </SectionCard>
        </div>
        )}

        {/* Section 4: who did what, when. Collapsed by default -- it is the
            answer to "who approved this", not something to read every time. */}
        <div className="mt-3">
        <SectionCard
          sectionKey="audit"
          number={4}
          openSection={openSection}
          onToggleSection={toggleSection}
          title="Audit trail"
          summary={invoice.approved_at ? "approved" : invoice.voided_at ? "voided" : "created"}
        >
        <div className="space-y-0.5 text-xs text-slate/50">
          {/* Decision 182: created_at, not issue_date. Showing the issue
              date under the word "Created" made INV-5E0847DAC701 read
              "Created 7/20, Approved 7/19" -- approved before it existed.
              It was created 19.07 19:09:12 and approved 24 seconds later. */}
          <p>Created: {actorNames[invoice.created_by] ?? `#${invoice.created_by}`}, {invoice.created_at ? formatDateTime(invoice.created_at) : formatDate(invoice.issue_date)}</p>
          {invoice.approved_by !== null && invoice.approved_at && (
            <p>Approved: {actorNames[invoice.approved_by] ?? `#${invoice.approved_by}`}, {formatDateTime(invoice.approved_at)}</p>
          )}
          {invoice.voided_by !== null && invoice.voided_at && (
            <p>Voided: {actorNames[invoice.voided_by] ?? `#${invoice.voided_by}`}, {formatDate(invoice.voided_at)}</p>
          )}
        </div>
        </SectionCard>
        </div>
        </div>

      </div>
    </div>
  );
}
