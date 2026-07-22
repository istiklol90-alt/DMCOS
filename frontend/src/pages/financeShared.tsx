import { useEffect, useState } from "react";
import { API_URL } from "../config";

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

export async function fetchJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
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

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US");
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
  const [roomBreakdown, setRoomBreakdown] = useState<RoomPriceBreakdown | null>(null);
  const [transferBreakdown, setTransferBreakdown] = useState<TransferPriceBreakdown | null>(null);
  const [taxBreakdown, setTaxBreakdown] = useState<MandatoryTaxBreakdown | null>(null);
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

        const roomPriceParams = new URLSearchParams({
          check_in: b.arrival_date,
          check_out: b.departure_date,
          meal_plan: mealPlan?.meal_code || "",
          adults: String(b.adults),
          children: String(b.children),
          infants: String(b.infants),
        });
        const mandatoryTaxParams = new URLSearchParams({
          nights: String(b.nights),
          adults: String(b.adults),
          children: String(b.children),
        });

        const promises: Promise<void>[] = [
          fetchJson<RoomPriceBreakdown>(
            `/contract-engine/contracts/${b.contract_id}/room-types/${b.room_type_id}/price?${roomPriceParams}`,
            token
          ).then(setRoomBreakdown),
          fetchJson<MandatoryTaxBreakdown>(
            `/contract-engine/contracts/${b.contract_id}/mandatory-tax?${mandatoryTaxParams}`,
            token
          ).then(setTaxBreakdown),
        ];
        if (b.transfer_type) {
          const transferParams = new URLSearchParams({
            transfer_type: b.transfer_type,
            check_in: b.arrival_date,
            check_out: b.departure_date,
            adults: String(b.adults),
            children: String(b.children),
            infants: String(b.infants),
          });
          promises.push(
            fetchJson<TransferPriceBreakdown>(
              `/contract-engine/contracts/${b.contract_id}/transfer-price?${transferParams}`,
              token
            ).then(setTransferBreakdown)
          );
        }
        await Promise.all(promises);
      })
      .catch((err: any) => setError(err.message || "Failed to load booking details"))
      .finally(() => setLoading(false));
  }, [invoice.booking_id]);

  // Decision 101: liveFinancials.saleTotal replaces what used to be a
  // separately hand-written liveTotal formula -- same numbers, one
  // source of truth instead of two copies of the same arithmetic.
  const liveFinancials = booking ? computeBookingFinancials(booking) : null;
  const liveTotal = liveFinancials ? liveFinancials.saleTotal : null;
  const mismatch = liveTotal !== null && Math.abs(liveTotal - invoice.total) > 0.01;
  const frozenProfit = invoiceProfit(invoice);
  const latestNote = invoice.review_notes.length > 0 ? invoice.review_notes[invoice.review_notes.length - 1] : undefined;
  const changeHighlights = booking ? deriveChangeHighlights(latestNote, booking.arrival_date, booking.departure_date) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
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

        <div className="mt-3 space-y-0.5 text-xs text-slate/50">
          <p>Created: {actorNames[invoice.created_by] ?? `#${invoice.created_by}`}, {formatDate(invoice.issue_date)}</p>
          {invoice.approved_by !== null && invoice.approved_at && (
            <p>Approved: {actorNames[invoice.approved_by] ?? `#${invoice.approved_by}`}, {formatDate(invoice.approved_at)}</p>
          )}
          {invoice.voided_by !== null && invoice.voided_at && (
            <p>Voided: {actorNames[invoice.voided_by] ?? `#${invoice.voided_by}`}, {formatDate(invoice.voided_at)}</p>
          )}
        </div>

        {invoice.review_notes.length > 0 && (
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

        {invoice.review_notes.length > 0 && !loading && !error && liveTotal !== null && (
          <div className="mt-3 rounded-lg border border-ink/10 bg-sand/40 p-3 text-sm">
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
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate/70">
              <span>Booking: <strong className="text-ink">{booking.booking_number}</strong></span>
              <span>Room type: <strong className="text-ink">{roomTypeName}</strong></span>
              <span>
                Dates: <strong className="text-ink">{formatDate(booking.arrival_date)} — {formatDate(booking.departure_date)} ({booking.nights} night{booking.nights === 1 ? "" : "s"})</strong>
              </span>
              <span>Meal plan: <strong className="text-ink">{mealPlanLabel}</strong></span>
              <span>Guests: <strong className="text-ink">{booking.adults} adult{booking.adults === 1 ? "" : "s"} / {booking.children} child{booking.children === 1 ? "" : "ren"} / {booking.infants} infant{booking.infants === 1 ? "" : "s"}</strong></span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Frozen in invoice</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate/60">Room amount (net+transfer)</span><span className="text-ink">{formatMoney(invoice.subtotal, invoice.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Discount</span><span className="text-ink">{invoice.discount !== null ? formatMoney(invoice.discount, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Commission</span><span className="text-ink">{invoice.commission !== null ? formatMoney(invoice.commission, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Profit</span><span className="text-ink">{frozenProfit !== null ? formatMoney(frozenProfit, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Tax</span><span className="text-ink">{invoice.tax !== null ? formatMoney(invoice.tax, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Total</span><span className="text-ink">{formatMoney(invoice.total, invoice.currency)}</span></div>
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${mismatch ? "border-coral/40 bg-coral/5" : "border-ink/10"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Current booking state</p>
                {changeHighlights.map((h, i) => (
                  <div key={i} className="mt-2 rounded-lg bg-coral/10 px-2 py-1.5 text-sm font-medium text-coral">
                    {h.label}: {h.newValue}{" "}
                    <span className="font-normal text-coral/70">(was: {h.oldValue}, {h.delta})</span>
                  </div>
                ))}
                {roomBreakdown && booking && (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate/60">Base rate (net)</span><span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Supplements</span><span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Discount</span><span className="text-ink">{booking.agent_exclusive_discount_amount !== null ? formatMoney(booking.agent_exclusive_discount_amount, booking.currency) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Commission</span><span className="text-ink">{booking.agent_markup_amount !== null ? formatMoney(booking.agent_markup_amount, booking.currency) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Profit</span><span className="text-ink">{liveFinancials && liveFinancials.profit !== null ? formatMoney(liveFinancials.profit, booking.currency) : "—"}</span></div>
                    {transferBreakdown && (
                      <div className="flex justify-between"><span className="text-slate/60">Transfer ({transferBreakdown.transfer_name})</span><span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span></div>
                    )}
                    {taxBreakdown && (
                      <div className="flex justify-between"><span className="text-slate/60">{taxBreakdown.label || "Tax"}</span><span className="text-ink">{formatMoney(taxBreakdown.total, taxBreakdown.currency)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Total now</span><span className="text-ink">{liveTotal !== null ? formatMoney(liveTotal, booking.currency) : "—"}</span></div>
                  </div>
                )}
              </div>
            </div>

            {mismatch && (
              <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
                ⚠ The booking's current price differs from what's frozen in the invoice — review before approving.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
