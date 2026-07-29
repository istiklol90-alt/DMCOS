import { useEffect, useState } from "react";
import type { InvoiceReviewNote, BookingCommercialLine, CommercialLineCategory } from "./financeShared";
import {
  computeBookingFinancials,
  computeCommercialLineTotals,
  COMMERCIAL_LINE_CATEGORIES,
  fetchJson,
  formatSingleNote,
  hasPriceSnapshot,
  hasDateSnapshot,
} from "./financeShared";
import BookingsList from "./Reservations";
import type { Booking, Permissions, Scope, AdminBookingExtensions, DetailCtx, BookingCorrespondenceRow } from "./Reservations";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { TableShell, TableHeadRow, TableHeadCell, TableRow, TableCell } from "../components/ui/Table";

// ---------------------------------------------------------------------------
// Admin/Agent Component Separation refactor — everything genuinely
// financial that used to live inline in Reservations.tsx, physically
// moved here: invoice creation/display, the LPO compose/send panel, the
// "Add hotel reply manually" write action, the re-derived price
// breakdown ("Price breakdown"), Net/Sale/Profit, and the list
// table's Net cost/Profit columns + urgent-invoice badges. Reached only
// through the base's optional `adminExtensions` prop (render-prop/slot
// pattern) -- AgentDashboard_v2.tsx never imports this file at all, so
// none of this is even reachable from that surface, not just permission-
// gated at render time.
//
// This is the ONLY file in the booking-list tree that imports from
// financeShared.tsx. Every extension component below independently
// fetches whatever contextual data it needs (hotel name, room type name,
// meal plan, guests, price breakdown) straight from `booking` -- the
// same "each slot manages its own state/fetches independently" pattern
// financeShared.tsx's own InvoiceDetailModal already established, since
// DetailCtx is deliberately just {booking, onBookingUpdated}, nothing
// richer.
// ---------------------------------------------------------------------------

// Local formatMoney/formatDate, NOT financeShared's Intl-based versions --
// deliberately kept byte-identical to Reservations.tsx's own originals
// (simple toFixed + currency-code suffix) so every figure that moved out
// of that file renders exactly as it did before the split.
function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  return `${amount.toFixed(2)} ${currency}`;
}

function formatNumber(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return amount.toFixed(2);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US");
}

// ---------------------------------------------------------------------------
// Local types -- each file in this codebase defines the narrow shape it
// actually reads rather than sharing a central type module (the same
// convention financeShared.tsx's own DetailBooking/RoomPriceBreakdown/
// TransferPriceBreakdown/MandatoryTaxBreakdown already follow).
// ---------------------------------------------------------------------------

interface InvoiceInfo {
  id: number;
  invoice_number: string;
  total: number;
  currency: string;
  status: string;
  review_notes: InvoiceReviewNote[];
  flag_acknowledged_at: string | null;
  booking_id?: number;
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

interface PromotionRef {
  id: number;
  promotion_name: string;
}

interface SpecialOfferRef {
  id: number;
  offer_name: string;
}

interface GuestRef {
  first_name: string;
  last_name: string;
  is_lead_guest: boolean;
}

interface HotelRef {
  id: number;
  hotel_name: string;
  email?: string | null;
}

interface MealPlanRef {
  meal_code: string;
  meal_name: string | null;
}

// ---------------------------------------------------------------------------
// LPO (booking confirmation request) email text -- moved verbatim from
// Reservations.tsx (Decision 046/047/048), only the parameter types
// changed to this file's local ones.
// ---------------------------------------------------------------------------

function renderTextTable(rows: [string, string][]): string {
  const lines = ["| Field | Details |", "|---|---|"];
  for (const [label, value] of rows) {
    lines.push(`| ${label} | ${value.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n");
}

function formatFlightDetail(date: string | null, time: string | null, flightNumber: string | null): string {
  if (!date) {
    return flightNumber ? `to follow (flight number on file: ${flightNumber})` : "to follow";
  }
  const dateTime = time ? `${formatDate(date)} ${time}` : formatDate(date);
  return flightNumber ? `${dateTime} (Flight ${flightNumber})` : `${dateTime} (flight number: to follow)`;
}

function buildLpoEmailText(
  booking: Booking,
  hotelName: string,
  roomTypeName: string,
  mealPlanInfo: MealPlanRef | undefined,
  guests: GuestRef[] | null,
  roomBreakdown: RoomPriceBreakdown | null,
  transferBreakdown: TransferPriceBreakdown | null,
  mandatoryTaxBreakdown: MandatoryTaxBreakdown | null,
  promotionNames: string[],
  specialOfferName: string | null,
  managerName: string
): { subject: string; body: string } | null {
  if (!roomBreakdown || !mandatoryTaxBreakdown) return null;

  const guestNames =
    (guests ?? [])
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
// renderCorrespondencePanel slot -- whole LPO compose/send block.
// Independently fetches guests/hotel/room type/meal plan/breakdown; the
// base's own guests/hotel/room-type state is not reachable from here.
// ---------------------------------------------------------------------------

function useOwnBreakdown(booking: Booking, mealPlanInfo: MealPlanRef | undefined) {
  const [roomBreakdown, setRoomBreakdown] = useState<RoomPriceBreakdown | null>(null);
  const [transferBreakdown, setTransferBreakdown] = useState<TransferPriceBreakdown | null>(null);
  const [mandatoryTaxBreakdown, setMandatoryTaxBreakdown] = useState<MandatoryTaxBreakdown | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    if (!mealPlanInfo) {
      setBreakdownError("Could not determine meal plan for recalculation");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, mealPlanInfo]);

  return { roomBreakdown, transferBreakdown, mandatoryTaxBreakdown, breakdownError, breakdownLoading };
}

function useOwnMealPlan(booking: Booking) {
  const [mealPlanInfo, setMealPlanInfo] = useState<MealPlanRef | undefined>(undefined);
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<{ id: number; meal_code: string; meal_name: string | null }[]>(
      `/contract-engine/contracts/${booking.contract_id}/meal-plans`,
      token
    )
      .then((plans) => {
        const match = plans.find((p) => p.id === booking.meal_plan_id);
        setMealPlanInfo(match ? { meal_code: match.meal_code, meal_name: match.meal_name } : undefined);
      })
      .catch(() => setMealPlanInfo(undefined));
  }, [booking.contract_id, booking.meal_plan_id]);
  return mealPlanInfo;
}

function CorrespondencePanel({ ctx }: { ctx: DetailCtx }) {
  const { booking, onBookingUpdated } = ctx;
  const [guests, setGuests] = useState<GuestRef[] | null>(null);
  const [hotelName, setHotelName] = useState("");
  const [roomTypeName, setRoomTypeName] = useState("");
  const [hotelEmail, setHotelEmail] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientEmailSecondary, setRecipientEmailSecondary] = useState("");
  const [editableLpoBody, setEditableLpoBody] = useState("");
  const [lpoCopied, setLpoCopied] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [promotionNames, setPromotionNames] = useState<string[]>([]);
  const [specialOfferName, setSpecialOfferName] = useState<string | null>(null);

  const mealPlanInfo = useOwnMealPlan(booking);
  const { roomBreakdown, transferBreakdown, mandatoryTaxBreakdown, breakdownLoading } = useOwnBreakdown(
    booking,
    mealPlanInfo
  );

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<GuestRef[]>(`/booking-engine/bookings/${booking.id}/guests`, token)
      .then(setGuests)
      .catch(() => setGuests([]));
  }, [booking.id]);

  // Decision 050: hotel's stored email seeds the "To" field once, but
  // stays independently editable.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<HotelRef>(`/hotel-engine/hotels/${booking.hotel_id}`, token)
      .then((hotel) => {
        setHotelName(hotel.hotel_name);
        setHotelEmail(hotel.email ?? null);
      })
      .catch(() => {});
  }, [booking.hotel_id]);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<{ room_name: string }>(`/hotel-engine/room-types/${booking.room_type_id}`, token)
      .then((rt) => setRoomTypeName(rt.room_name))
      .catch(() => {});
  }, [booking.room_type_id]);

  useEffect(() => {
    if (hotelEmail && !recipientEmail) setRecipientEmail(hotelEmail);
  }, [hotelEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!roomBreakdown || roomBreakdown.applied_promotions.length === 0) {
      setPromotionNames([]);
      return;
    }
    const token = localStorage.getItem("token") || "";
    Promise.all(
      roomBreakdown.applied_promotions.map((id) =>
        fetchJson<PromotionRef>(`/contract-engine/promotions/${id}`, token).catch(() => null)
      )
    ).then((results) =>
      setPromotionNames(results.filter((p): p is PromotionRef => p !== null).map((p) => p.promotion_name))
    );
  }, [roomBreakdown]);

  useEffect(() => {
    if (booking.applied_special_offer_id === null) {
      setSpecialOfferName(null);
      return;
    }
    const token = localStorage.getItem("token") || "";
    fetchJson<SpecialOfferRef>(`/contract-engine/special-offers/${booking.applied_special_offer_id}`, token)
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

  useEffect(() => {
    if (lpo && !editableLpoBody) setEditableLpoBody(lpo.body);
  }, [lpo?.body]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await fetchJson<BookingCorrespondenceRow>(`/booking-engine/bookings/${booking.id}/correspondence/send`, token, {
        method: "POST",
        body: JSON.stringify({
          subject: lpo.subject,
          body: editableLpoBody || lpo.body,
          recipient_email: recipientEmail.trim() || null,
          recipient_email_secondary: recipientEmailSecondary.trim() || null,
        }),
      });
      // The base's own correspondence thread display can't be updated
      // directly from here -- DetailCtx is deliberately just {booking,
      // onBookingUpdated}. A fresh object reference makes the base's
      // thread-fetch effect (which depends on the whole `booking`
      // object, not just booking.id) re-run and pick up the new message.
      onBookingUpdated({ ...booking });
    } catch (err: any) {
      setSendError(err.message || "Failed to send email");
    } finally {
      setSendSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-ink/10 bg-sand/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
          LPO — booking confirmation request to hotel
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLpo}
            disabled={!lpoFullText}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lpoCopied ? "Copied ✓" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleSendCorrespondence}
            disabled={!lpo || sendSubmitting}
            className="rounded-lg bg-coral px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {sendSubmitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
      {lpo ? (
        <>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="email"
              placeholder="To (hotel email)"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
            />
            <input
              type="email"
              placeholder="Second email (optional)"
              value={recipientEmailSecondary}
              onChange={(e) => setRecipientEmailSecondary(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
            />
          </div>
          {!hotelEmail && (
            <p className="mb-2 text-[11px] text-slate/40">The hotel has no email on file — enter one manually.</p>
          )}
          <p className="mb-1 text-[11px] font-medium text-slate/50">Subject: {lpo.subject}</p>
          <textarea
            value={editableLpoBody || lpo.body}
            onChange={(e) => setEditableLpoBody(e.target.value)}
            rows={14}
            className="w-full rounded-lg border border-ink/15 bg-white p-3 font-mono text-xs text-ink focus:border-coral focus:outline-none"
          />
        </>
      ) : (
        <p className="text-xs text-slate/50">
          {breakdownLoading ? "Calculating price..." : "Could not generate the email — check the price calculation above."}
        </p>
      )}
      {sendError && (
        <div className="mt-2 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{sendError}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderReplyLogButton slot -- "Add hotel reply manually" button and
// its form. The base's correspondence THREAD READ-DISPLAY stays put; this
// only writes a new inbound row, then nudges the base to re-fetch by
// calling onBookingUpdated with a fresh object reference (same technique
// as CorrespondencePanel's send above).
// ---------------------------------------------------------------------------

function ReplyLogButton({ ctx }: { ctx: DetailCtx }) {
  const { booking, onBookingUpdated } = ctx;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function handleAddReply() {
    if (replyBody.trim().length < 1) {
      setReplyError("Enter the hotel's reply text");
      return;
    }
    const token = localStorage.getItem("token") || "";
    setReplySubmitting(true);
    setReplyError(null);
    try {
      await fetchJson<BookingCorrespondenceRow>(`/booking-engine/bookings/${booking.id}/correspondence/reply`, token, {
        method: "POST",
        body: JSON.stringify({ subject: replySubject.trim() || null, body: replyBody.trim() }),
      });
      setReplyOpen(false);
      setReplySubject("");
      setReplyBody("");
      onBookingUpdated({ ...booking });
    } catch (err: any) {
      setReplyError(err.message || "Failed to add reply");
    } finally {
      setReplySubmitting(false);
    }
  }

  if (!replyOpen) {
    return (
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
        Add hotel reply manually
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
      <input
        placeholder="Subject (optional)"
        value={replySubject}
        onChange={(e) => setReplySubject(e.target.value)}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
      />
      <textarea
        placeholder="Hotel reply text *"
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
          {replySubmitting ? "Saving..." : "Save reply"}
        </button>
        <button
          type="button"
          onClick={() => setReplyOpen(false)}
          disabled={replySubmitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderFinancialSummary slot -- Net/Sale/Profit (Decision 101) AND the
// "Price breakdown" price breakdown (Decision 106) folded into one
// slot, since the fixed 9-slot interface has no separate slot for the
// breakdown; both occupy the single position "Total" used to.
// ---------------------------------------------------------------------------

const COMMERCIAL_CATEGORY_LABELS: Record<CommercialLineCategory, string> = {
  room: "Room",
  transfer: "Transfer",
  meal: "Meal",
  tax: "Tax",
  cip: "CIP (airport)",
  excursion: "Excursion",
};

function useCommercialLines(bookingRoomId: number | null | undefined) {
  const [lines, setLines] = useState<BookingCommercialLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingRoomId) {
      setLines([]);
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("token") || "";
    setLoading(true);
    setError(null);
    fetchJson<BookingCommercialLine[]>(`/finance-engine/booking-rooms/${bookingRoomId}/commercial-lines`, token)
      .then(setLines)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [bookingRoomId]);

  return { lines, setLines, error, loading };
}

// One row per category -- follows the ConfirmationNumberEdit inline-edit
// pattern (local `editing` state -> PUT -> parent onUpdated refresh), just
// packing base_cost/base_price/adjustment_cost/adjustment_price/note into
// one row's edit form instead of a single field. A row with no `line` yet
// (meal/cip/excursion before anyone has entered one) shows "—" and an
// "Add" button instead of "Edit" -- same affordance, different label.
function CommercialLineRow({
  bookingRoomId,
  category,
  line,
  currency,
  onUpdated,
}: {
  bookingRoomId: number;
  category: CommercialLineCategory;
  line: BookingCommercialLine | undefined;
  currency: string;
  onUpdated: (updated: BookingCommercialLine) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [baseCost, setBaseCost] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [adjCost, setAdjCost] = useState("0");
  const [adjPrice, setAdjPrice] = useState("0");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setBaseCost(line?.base_cost != null ? String(line.base_cost) : "");
    setBasePrice(line?.base_price != null ? String(line.base_price) : "");
    setAdjCost(line ? String(line.adjustment_cost) : "0");
    setAdjPrice(line ? String(line.adjustment_price) : "0");
    setNote(line?.adjustment_note ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    const token = localStorage.getItem("token") || "";
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fetchJson<BookingCommercialLine>(
        `/finance-engine/booking-rooms/${bookingRoomId}/commercial-lines/${category}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            base_cost: baseCost.trim() === "" ? null : parseFloat(baseCost),
            base_price: basePrice.trim() === "" ? null : parseFloat(basePrice),
            adjustment_cost: adjCost.trim() === "" ? null : parseFloat(adjCost),
            adjustment_price: adjPrice.trim() === "" ? null : parseFloat(adjPrice),
            note: note.trim() === "" ? null : note.trim(),
          }),
        }
      );
      onUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const totalCost = (line?.base_cost ?? 0) + (line?.adjustment_cost ?? 0);
  const totalPrice = (line?.base_price ?? 0) + (line?.adjustment_price ?? 0);
  const hasAdjustment = !!line && (line.adjustment_cost !== 0 || line.adjustment_price !== 0);

  if (!editing) {
    return (
      <TableRow>
        <TableCell className="font-medium text-ink">{COMMERCIAL_CATEGORY_LABELS[category]}</TableCell>
        <TableCell>{line ? formatMoney(totalCost, currency) : "—"}</TableCell>
        <TableCell>{line ? formatMoney(totalPrice, currency) : "—"}</TableCell>
        <TableCell>
          {hasAdjustment && (
            <span title={line?.adjustment_note ?? undefined} className="cursor-help">
              <Badge tone={(line!.adjustment_cost < 0 || line!.adjustment_price < 0) ? "success" : "warning"}>
                {formatMoney(line!.adjustment_cost, currency)} / {formatMoney(line!.adjustment_price, currency)}
              </Badge>
            </span>
          )}
        </TableCell>
        <TableCell>
          <Button variant="secondary" size="sm" onClick={startEdit}>
            {line ? "Edit" : "Add"}
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <td colSpan={5} className="px-4 py-3.5 text-slate/80">
        <div className="flex flex-wrap items-end gap-2 py-1">
          <span className="w-24 shrink-0 text-sm font-medium text-ink">{COMMERCIAL_CATEGORY_LABELS[category]}</span>
          <label className="flex flex-col text-xs text-slate/50">
            Base cost
            <Input scale="sm" type="number" step="0.01" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} placeholder="—" className="w-28" />
          </label>
          <label className="flex flex-col text-xs text-slate/50">
            Base price
            <Input scale="sm" type="number" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="—" className="w-28" />
          </label>
          <label className="flex flex-col text-xs text-slate/50">
            Adjustment cost
            <Input scale="sm" type="number" step="0.01" value={adjCost} onChange={(e) => setAdjCost(e.target.value)} className="w-28" />
          </label>
          <label className="flex flex-col text-xs text-slate/50">
            Adjustment price
            <Input scale="sm" type="number" step="0.01" value={adjPrice} onChange={(e) => setAdjPrice(e.target.value)} className="w-28" />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col text-xs text-slate/50">
            Note (e.g. hotel discount)
            <Input scale="sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the adjustment" />
          </label>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </TableRow>
  );
}

// Replaces the old read-only, live-recomputed-from-contract "Price
// breakdown" block. Each category (Room/Transfer/Meal/Tax/CIP/Excursion)
// now has its own persisted cost+price, editable with an explicit,
// audited adjustment (see BookingCommercialLine's own docstring on the
// backend for the full rationale) instead of a number nobody could correct
// when reality diverged from what the system originally computed.
function CommercialLineItemsPanel({
  bookingRoomId,
  currency,
  lines,
  onLineUpdated,
}: {
  bookingRoomId: number;
  currency: string;
  lines: BookingCommercialLine[];
  onLineUpdated: (updated: BookingCommercialLine) => void;
}) {
  const byCategory = new Map(lines.map((l) => [l.category, l]));

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate/50">Commercial breakdown</h4>
      <p className="mt-1 text-xs text-slate/50">
        Cost/price per category, editable. An adjustment is a manual correction on top of the system-computed base
        figure (e.g. a discount the hotel granted after booking) — the original figure is never overwritten.
      </p>
      <TableShell>
        <TableHeadRow>
          <TableHeadCell>Category</TableHeadCell>
          <TableHeadCell>Cost</TableHeadCell>
          <TableHeadCell>Price</TableHeadCell>
          <TableHeadCell>Adjustment</TableHeadCell>
          <TableHeadCell>{null}</TableHeadCell>
        </TableHeadRow>
        <tbody>
          {COMMERCIAL_LINE_CATEGORIES.map((category) => (
            <CommercialLineRow
              key={category}
              bookingRoomId={bookingRoomId}
              category={category}
              line={byCategory.get(category)}
              currency={currency}
              onUpdated={onLineUpdated}
            />
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function FinancialSummaryBlock({ ctx }: { ctx: DetailCtx }) {
  const { booking, bookingRoomId } = ctx;
  const { lines, setLines, error: linesError, loading: linesLoading } = useCommercialLines(bookingRoomId);
  // Falls back to the old frozen-Booking-column formula only while lines
  // haven't loaded yet (or for the legacy "no rooms at all" case where
  // bookingRoomId is null) -- once GET auto-seeds, lines is always the
  // real source from then on, per the owner-confirmed decision that a
  // manual correction here should be reflected immediately.
  const financials =
    lines && lines.length > 0 ? computeCommercialLineTotals(lines) : computeBookingFinancials(booking);

  function handleLineUpdated(updated: BookingCommercialLine) {
    setLines((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((l) => l.category === updated.category);
      if (idx === -1) return [...list, updated];
      const next = [...list];
      next[idx] = updated;
      return next;
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-3 rounded-xl border border-ink/10 bg-sand/30 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Net cost</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            {formatMoney(financials.netTotal, booking.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Sale price</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            {formatMoney(financials.saleTotal, booking.currency)}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate/50">
            Profit
            {financials.profit === null && (
              <span
                className="cursor-help normal-case text-slate/40"
                title="Not computed — booking was created before Pricing Engine (Decision 069)"
              >
                ⓘ
              </span>
            )}
          </p>
          <p
            className={`mt-1 font-display text-xl font-semibold ${
              financials.profit !== null && financials.profit < 0 ? "text-danger" : "text-ink"
            }`}
          >
            {financials.profit !== null ? formatMoney(financials.profit, booking.currency) : "—"}
          </p>
        </div>
      </div>

      {linesLoading && <p className="text-sm text-slate/50">Loading commercial breakdown...</p>}
      {linesError && <p className="text-sm text-red-600">{linesError}</p>}
      {!linesLoading && !linesError && bookingRoomId && (
        <CommercialLineItemsPanel
          bookingRoomId={bookingRoomId}
          currency={booking.currency}
          lines={lines ?? []}
          onLineUpdated={handleLineUpdated}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderListSummary slot -- aggregate strip over whatever the list is
// currently filtered to (e.g. one "By date" day/range): total
// applications, how many were cancelled, and total profit across the
// rest. Grouped by currency (never assumes USD-only, per the project's
// Test Ground formula discipline) -- in practice almost always renders
// one figure since every real booking today is USD, but a second
// currency shows as a second line instead of being silently summed
// together or dropped.
// ---------------------------------------------------------------------------

function ListSummaryBar({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) return null;

  const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
  // Same exclusion as Finance Engine's own generate_agent_statement
  // (backend/app/engines/finance/service.py): Cancelled/Rejected never
  // contributed real profit, so they don't belong in the sum.
  const billable = bookings.filter((b) => b.status !== "Cancelled" && b.status !== "Rejected");

  const profitByCurrency: Record<string, number> = {};
  let anyUncomputed = false;
  for (const b of billable) {
    const financials = computeBookingFinancials(b);
    if (financials.profit === null) {
      anyUncomputed = true;
      continue;
    }
    profitByCurrency[b.currency] = (profitByCurrency[b.currency] ?? 0) + financials.profit;
  }
  const profitEntries = Object.entries(profitByCurrency);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-6 rounded-xl border border-ink/10 bg-sand/30 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Applications</p>
        <p className="mt-0.5 font-display text-xl font-semibold text-ink">{bookings.length}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Cancelled</p>
        <p className={`mt-0.5 font-display text-xl font-semibold ${cancelled > 0 ? "text-coral" : "text-ink"}`}>
          {cancelled}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
          Total profit{anyUncomputed ? " *" : ""}
        </p>
        <p className="mt-0.5 font-display text-xl font-semibold text-ink">
          {profitEntries.length === 0
            ? "—"
            : profitEntries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ")}
        </p>
      </div>
      {anyUncomputed && (
        <p className="text-xs text-slate/40">* excludes bookings without a computed profit (pre-Pricing Engine)</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderHeaderActions slot -- "Create invoice" button + invoice summary.
// Caches its fetched/created InvoiceInfo at the AdminBookingsList level
// (via cachedInvoice/setInvoice props) rather than owning its own state,
// specifically so onAfterClaim (a plain callback, not a component --
// it can't hold state of its own) can update the same cache and have
// this block reflect the auto-created invoice without a page reload.
// ---------------------------------------------------------------------------

function InvoiceHeaderActions({
  booking,
  cachedInvoice,
  setInvoice,
}: {
  booking: Booking;
  cachedInvoice: InvoiceInfo | null | undefined; // undefined = not yet fetched
  setInvoice: (inv: InvoiceInfo | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A 400 here just means "not yet invoiced" (the common case).
  useEffect(() => {
    if (cachedInvoice !== undefined) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<InvoiceInfo>(`/finance-engine/bookings/${booking.id}/invoice`, token)
      .then(setInvoice)
      .catch(() => setInvoice(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, cachedInvoice]);

  async function handleCreate() {
    const token = localStorage.getItem("token") || "";
    setCreating(true);
    setError(null);
    try {
      const created = await fetchJson<InvoiceInfo>(`/finance-engine/bookings/${booking.id}/invoice`, token, {
        method: "POST",
      });
      setInvoice(created);
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  if (cachedInvoice === undefined) return null;

  if (cachedInvoice) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs text-slate/70">
          Invoice <strong className="text-ink">{cachedInvoice.invoice_number}</strong> ({cachedInvoice.status}) for{" "}
          <strong className="text-ink">{formatMoney(cachedInvoice.total, cachedInvoice.currency)}</strong>
        </div>
        {error && <div className="rounded-lg bg-coral/10 px-2 py-1 text-xs font-medium text-coral">{error}</div>}
      </div>
    );
  }

  if (
    booking.status === "Cancelled" ||
    booking.status === "Rejected" ||
    booking.status === "Cancellation Requested"
  ) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {creating ? "Creating..." : "Create invoice"}
      </button>
      {error && <div className="rounded-lg bg-coral/10 px-2 py-1 text-xs font-medium text-coral">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision 108: booking-rooted "needs attention" data -- ONE bulk
// GET /bookings/urgent fetch owned by AdminBookingsList (Decision 100's
// efficiency property preserved: never fetched per-row/per-detail),
// replacing the old invoice-only urgentInvoicesByBooking. This is the
// SAME underlying signal Finance→Invoices's own /invoices/urgent panel now
// derives from (both read list_urgent_booking_ids server-side) -- a
// booking shows up here whether or not it has ever had an invoice.
// ---------------------------------------------------------------------------

interface UrgentBookingSummary {
  booking_id: number;
  booking_number: string;
  currency: string;
  latest_note: InvoiceReviewNote | null;
}

// Decision 112: derives the display string via the exact same
// formatSingleNote() InvoiceDetailModal already uses, instead of the
// raw change_description string the backend used to send directly --
// this panel and InvoiceDetailModal's note history can no longer
// disagree about how the same note displays, since it's the same code.
function latestNoteText(summary: UrgentBookingSummary): string | undefined {
  return summary.latest_note ? formatSingleNote(summary.latest_note, summary.currency) : undefined;
}

// renderStatusBadgeExtra slot -- same visual badge as before, now
// sourced from the booking-rooted set instead of an invoice-only one.
function NeedsAttentionBadge({ summary }: { summary: UrgentBookingSummary }) {
  return (
    <span
      className="inline-flex cursor-help items-center gap-1 rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-medium text-coral"
      title={latestNoteText(summary)}
    >
      ⚠ Invoice
    </span>
  );
}

// New dedicated "Needs Attention" panel -- Bookings' own
// equivalent of Finance→Invoices's always-loaded urgent panel (Decision
// 088), same proven pattern: a small, always-loaded section above the
// full list, so a manager doesn't have to scroll hundreds of rows to
// find what changed. Parallel to (not sharing a component with)
// Invoices.tsx's own panel -- the shapes differ enough (Invoice rows
// with void/approve/send actions vs. a booking summary with one
// acknowledge action) that forcing a shared generic component isn't
// worth it.
// Compact, single-line "what changed" summary for one urgent booking's
// latest note -- shows only the CURRENT (new) dates plus the price-diff
// badge, since at real volume (100+ applications/day, several changes
// each) a two-line-per-row breakdown doesn't scale to a scannable queue.
// The full before/after detail (old dates, old price) is never lost --
// it's the exact same formatSingleNote() sentence InvoiceDetailModal
// already uses, surfaced as a hover tooltip via the native title
// attribute, same pattern NeedsAttentionBadge already established above.
function CompactChangeSummary({ note, currency }: { note: InvoiceReviewNote; currency: string }) {
  const fullDetail = formatSingleNote(note, currency);
  if (hasPriceSnapshot(note)) {
    const diff = note.new_total! - note.old_total!;
    const noChange = Math.abs(diff) <= 0.01;
    const diffTone = noChange ? "neutral" : diff > 0 ? "warning" : "success";
    const diffLabel = noChange ? "no change" : `${diff > 0 ? "+" : ""}${formatMoney(diff, currency)}`;
    return (
      <span title={fullDetail} className="inline-flex cursor-help flex-wrap items-center gap-1.5 text-xs text-slate/70">
        <span className="font-medium text-ink">
          {formatDate(note.new_arrival_date!)} – {formatDate(note.new_departure_date!)}
        </span>
        <Badge tone={diffTone}>{diffLabel}</Badge>
      </span>
    );
  }
  if (hasDateSnapshot(note)) {
    return (
      <span title={fullDetail} className="inline-flex cursor-help flex-wrap items-center gap-1.5 text-xs text-slate/70">
        <span className="font-medium text-ink">
          {formatDate(note.new_arrival_date!)} – {formatDate(note.new_departure_date!)}
        </span>
        <Badge tone="neutral">dates changed</Badge>
      </span>
    );
  }
  return (
    <span title={fullDetail} className="block max-w-[420px] cursor-help truncate text-xs text-slate/70">
      {note.change_description ?? "—"}
    </span>
  );
}

function UrgentBookingsPanel({
  bookings,
  loading,
  onAcknowledge,
  acknowledgingId,
}: {
  bookings: UrgentBookingSummary[];
  loading: boolean;
  onAcknowledge: (bookingId: number) => void;
  acknowledgingId: number | null;
}) {
  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        Needs Attention
        {bookings.length > 0 && <Badge tone="coral">{bookings.length}</Badge>}
      </h3>
      {loading ? (
        <p className="mt-3 text-sm text-slate/60">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-ink/10 bg-white px-5 py-6 text-center text-sm text-slate/50">
          No bookings need attention
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl shadow-card">
          <TableShell minWidth="760px">
            <TableHeadRow>
              <TableHeadCell className="w-8">#</TableHeadCell>
              <TableHeadCell>Booking</TableHeadCell>
              <TableHeadCell>Change</TableHeadCell>
              <TableHeadCell>Flagged</TableHeadCell>
              <TableHeadCell>{null}</TableHeadCell>
            </TableHeadRow>
            <tbody>
              {bookings.map((b, index) => (
                <TableRow key={b.booking_id} className="hover:bg-sand/40 transition-colors">
                  <TableCell className="py-2 text-slate/50">{index + 1}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 font-medium text-ink">{b.booking_number}</TableCell>
                  <TableCell className="py-2">
                    {b.latest_note ? <CompactChangeSummary note={b.latest_note} currency={b.currency} /> : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs text-slate/50">
                    {b.latest_note?.created_at ? formatDate(b.latest_note.created_at) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAcknowledge(b.booking_id)}
                      disabled={acknowledgingId === b.booking_id}
                    >
                      {acknowledgingId === b.booking_id ? "..." : "Mark as reviewed"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminBookingsList -- the wrapper AdminPanel.tsx actually renders.
// Hardcodes full admin permissions, owns the two pieces of shared state
// (bulk urgent-invoice map, per-booking invoice cache) that let
// renderStatusBadgeExtra/renderHeaderActions/onAfterClaim stay coherent
// with each other, and assembles the full adminExtensions object.
// ---------------------------------------------------------------------------

const FULL_ADMIN_PERMISSIONS: Permissions = {
  canChangeDates: true,
  canEditGuestDetails: true,
  canEditFlights: true,
  canCancel: true,
  canClaim: true,
  canConfirmWithHotel: true,
};

// Own nav item under Bookings (2026-07-27 reorg) -- previously this same
// panel sat above the full booking list on every page load, pushing the
// actual list down; now it's a dedicated destination, reached only when a
// manager actually wants the "what needs action" queue. Fully
// self-contained (own fetch/state/handler) rather than a prop-drilled
// piece of AdminBookingsList -- the two are independent nav destinations
// now, not one screen's two halves. AdminBookingsList (below) still runs
// its own, separate fetch of the same endpoint for the small inline
// per-row "⚠ Invoice" badge (renderStatusBadgeExtra) -- that's a
// different, smaller use of the same data, not worth threading through
// two nav destinations just to share one HTTP call.
export function AdminNeedsAttentionView() {
  const [urgentBookings, setUrgentBookings] = useState<UrgentBookingSummary[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);

  async function loadUrgentBookings() {
    const token = localStorage.getItem("token") || "";
    try {
      setUrgentLoading(true);
      setUrgentBookings(await fetchJson<UrgentBookingSummary[]>("/finance-engine/bookings/urgent", token));
    } catch {
      setUrgentBookings([]);
    } finally {
      setUrgentLoading(false);
    }
  }

  useEffect(() => {
    loadUrgentBookings();
  }, []);

  const urgentByBooking: Record<number, UrgentBookingSummary> = {};
  urgentBookings.forEach((b) => {
    urgentByBooking[b.booking_id] = b;
  });

  async function handleAcknowledge(bookingId: number) {
    const summary = urgentByBooking[bookingId];
    const confirmMessage = `⚠ ${(summary && latestNoteText(summary)) ?? ""}\n\nMark as reviewed?`;
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setAcknowledgingId(bookingId);
      await fetchJson(`/finance-engine/bookings/${bookingId}/acknowledge-review`, token, { method: "POST" });
      await loadUrgentBookings();
    } catch (err: any) {
      alert(err.message || "Failed to mark booking as reviewed");
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <UrgentBookingsPanel
      bookings={urgentBookings}
      loading={urgentLoading}
      onAcknowledge={handleAcknowledge}
      acknowledgingId={acknowledgingId}
    />
  );
}

export default function AdminBookingsList({ scope }: { scope: Scope }) {
  // Decision 108: keyed by booking_id, populated from ONE bulk
  // GET /bookings/urgent call -- the booking-rooted source of truth,
  // replacing the old invoice-only urgentInvoicesByBooking. Now only
  // used for the small inline per-row "⚠ Invoice" badge
  // (renderStatusBadgeExtra) -- the full panel moved to its own nav
  // destination, AdminNeedsAttentionView above.
  const [urgentBookings, setUrgentBookings] = useState<UrgentBookingSummary[]>([]);
  // Per-booking invoice cache -- undefined (key absent) means "not yet
  // fetched", null means "fetched, none exists". Shared between
  // renderHeaderActions (reads/seeds it) and onAfterClaim (writes it
  // after auto-creating), which otherwise have no way to talk to each
  // other since onAfterClaim is a plain callback, not a component.
  const [invoicesByBooking, setInvoicesByBooking] = useState<Record<number, InvoiceInfo | null>>({});

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<UrgentBookingSummary[]>("/finance-engine/bookings/urgent", token)
      .then(setUrgentBookings)
      .catch(() => setUrgentBookings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.type === "agent" ? scope.agentId : null]);

  const urgentByBooking: Record<number, UrgentBookingSummary> = {};
  urgentBookings.forEach((b) => {
    urgentByBooking[b.booking_id] = b;
  });

  function setInvoiceFor(bookingId: number, inv: InvoiceInfo | null) {
    setInvoicesByBooking((prev) => ({ ...prev, [bookingId]: inv }));
  }

  const adminExtensions: AdminBookingExtensions = {
    financialColumnHeaders: (
      <>
        <th className="px-4 py-3 font-medium">Net cost</th>
        <th className="px-4 py-3 font-medium">Profit</th>
      </>
    ),
    renderFinancialColumnCells: (booking) => {
      const financials = computeBookingFinancials(booking);
      return (
        <>
          <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(financials.netTotal)}</td>
          <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">
            {financials.profit !== null ? (
              formatNumber(financials.profit)
            ) : (
              <span
                className="cursor-help text-slate/40"
                title="Not computed — booking was created before Pricing Engine (Decision 069)"
              >
                —
              </span>
            )}
          </td>
        </>
      );
    },
    extraColumnCount: 2,
    renderStatusBadgeExtra: (booking) =>
      urgentByBooking[booking.id] ? <NeedsAttentionBadge summary={urgentByBooking[booking.id]} /> : null,
    renderHeaderActions: (ctx) => (
      <InvoiceHeaderActions
        booking={ctx.booking}
        cachedInvoice={invoicesByBooking[ctx.booking.id]}
        setInvoice={(inv) => setInvoiceFor(ctx.booking.id, inv)}
      />
    ),
    renderCorrespondencePanel: (ctx) => <CorrespondencePanel ctx={ctx} />,
    renderReplyLogButton: (ctx) => <ReplyLogButton ctx={ctx} />,
    renderFinancialSummary: (ctx) => <FinancialSummaryBlock ctx={ctx} />,
    renderListSummary: (bookings) => <ListSummaryBar bookings={bookings} />,
    onAfterClaim: (ctx) => {
      const bookingId = ctx.booking.id;
      // Decision 080: claiming auto-creates a Draft invoice as a
      // second, best-effort request. A failure here must never undo or
      // fail the claim itself, which has already succeeded by the time
      // this fires -- InvoiceHeaderActions' own fallback "Create invoice"
      // button stays as the recovery path either way.
      if (invoicesByBooking[bookingId]) return;
      const token = localStorage.getItem("token") || "";
      fetchJson<InvoiceInfo>(`/finance-engine/bookings/${bookingId}/invoice`, token, { method: "POST" })
        .then((created) => setInvoiceFor(bookingId, created))
        .catch(() => {
          // Best-effort -- InvoiceHeaderActions' fallback button recovers.
        });
    },
  };

  return (
    <div>
      <BookingsList
        scope={scope}
        permissions={FULL_ADMIN_PERMISSIONS}
        adminExtensions={adminExtensions}
        compactFilters
        initialDateMode={{ view: "created" }}
      />
    </div>
  );
}
