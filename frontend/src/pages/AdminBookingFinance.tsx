import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import type { InvoiceReviewNote, BookingCommercialLine, CommercialLineCategory, BookingListFinancials } from "./financeShared";
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
import type { Booking, BookingRoom, Permissions, Scope, AdminBookingExtensions, DetailCtx, BookingCorrespondenceRow } from "./Reservations";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { TableShell, TableHeadRow, TableHeadCell, TableRow, TableCell, TableNumericCell } from "../components/ui/Table";

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
  // Decision 154: a traveller's OWN flight (Decision 150). The LPO was
  // written before that feature existed and only ever carried the
  // booking-level flight, so a guest flying separately was invisible to the
  // hotel — the one piece of information an airport transfer is arranged
  // from. All null for anyone on the common flight.
  arrival_flight_number: string | null;
  arrival_flight_date: string | null;
  arrival_flight_time: string | null;
  departure_flight_number: string | null;
  departure_flight_date: string | null;
  departure_flight_time: string | null;
}

function guestHasOwnFlight(g: GuestRef): boolean {
  return Boolean(
    g.arrival_flight_number ||
      g.arrival_flight_date ||
      g.arrival_flight_time ||
      g.departure_flight_number ||
      g.departure_flight_date ||
      g.departure_flight_time
  );
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

// Decision 154: ONE flight section, used by both the single-room and the
// multi-room LPO, so the two can't describe the same trip differently.
//
// It states the common flight, and then every traveller who is NOT on it —
// which is exactly what the hotel needs to meet people at the airport. The
// per-guest case (Decision 150) was missing entirely before this: a party
// splitting across flights produced an LPO claiming they all arrive together.
function buildFlightSection(booking: Booking, guests: GuestRef[] | null): string[] {
  const rows: [string, string][] = [
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
    ],
  ];

  const separate = (guests ?? []).filter(guestHasOwnFlight);
  if (separate.length === 0) {
    return [renderTextTable(rows)];
  }

  // Named explicitly so the two legs above are not mistaken for the whole
  // party's, the same reason the booking screen relabels them.
  rows[0][0] = "Flight Arrival (group)";
  rows[1][0] = "Flight Departure (group)";

  const perGuest: [string, string][] = [];
  for (const g of separate) {
    const name = `${g.first_name} ${g.last_name}`.trim() || "—";
    perGuest.push([
      `${name} — arrival`,
      formatFlightDetail(g.arrival_flight_date, g.arrival_flight_time, g.arrival_flight_number),
    ]);
    perGuest.push([
      `${name} — departure`,
      formatFlightDetail(g.departure_flight_date, g.departure_flight_time, g.departure_flight_number),
    ]);
  }

  return [
    renderTextTable(rows),
    "",
    `The following ${separate.length === 1 ? "guest travels" : "guests travel"} on separate flights:`,
    renderTextTable(perGuest),
  ];
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
    // Decision 154: flights moved out of the room table into their own
    // section, so per-guest flights have somewhere to live.
    ...buildFlightSection(booking, guests),
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

// Real bug fix, reported live: a 2+-room application's LPO used to be
// built entirely from `booking`'s own "representative" (first-room)
// fields, so the hotel confirmation-request email silently described
// only ONE of the rooms, and the only way to cover every room was to
// compose/send the panel's editable text manually, multiple times, into
// separate emails -- exactly the "sends separately" behavior reported.
// There is deliberately still only ONE correspondence endpoint/thread
// per booking (no room-scoped correspondence exists, or should exist --
// it's one hotel relationship, one thread), so the fix is entirely about
// what goes INTO that one email, not about adding more send actions.
// Single-room applications (the common case) keep the exact original
// code path untouched below -- zero behavior change, zero added
// requests -- and only a genuinely multi-room, multi-billable-room
// application takes the new combined-email path.
const NON_BILLABLE_ROOM_STATUSES = new Set(["Rejected", "Cancelled", "Cancellation Requested"]);

function CorrespondencePanel({ ctx }: { ctx: DetailCtx }) {
  const { booking, onBookingUpdated, rooms } = ctx;
  const billableRooms = (rooms ?? []).filter((r) => !NON_BILLABLE_ROOM_STATUSES.has(r.status));
  if (billableRooms.length > 1) {
    return <MultiRoomCorrespondencePanel booking={booking} rooms={billableRooms} onBookingUpdated={onBookingUpdated} />;
  }
  return <SingleRoomCorrespondencePanel booking={booking} onBookingUpdated={onBookingUpdated} />;
}

function SingleRoomCorrespondencePanel({
  booking,
  onBookingUpdated,
}: {
  booking: Booking;
  onBookingUpdated: (b: Booking) => void;
}) {
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
// Multi-room LPO -- one combined email covering every billable room.
// ---------------------------------------------------------------------------

interface RoomLpoData {
  room: BookingRoom;
  hotelName: string;
  roomTypeName: string;
  mealPlanInfo: MealPlanRef | undefined;
  guests: GuestRef[];
  roomBreakdown: RoomPriceBreakdown | null;
  transferBreakdown: TransferPriceBreakdown | null;
  mandatoryTaxBreakdown: MandatoryTaxBreakdown | null;
  promotionNames: string[];
  specialOfferName: string | null;
}

// Same per-room table shape buildLpoEmailText's rows use, minus the
// flight rows (those are booking-level, not per-room -- shown once at
// the end of the combined email instead of repeated for every room).
function buildLpoRoomRows(data: RoomLpoData): { rows: [string, string][]; totalAmount: number } | null {
  const { room, roomTypeName, mealPlanInfo, guests, roomBreakdown, transferBreakdown, mandatoryTaxBreakdown } = data;
  if (!roomBreakdown || !mandatoryTaxBreakdown) return null;

  const currency = room.currency ?? "USD";
  const guestNames =
    guests.map((g) => `${g.first_name} ${g.last_name}${g.is_lead_guest ? " (Lead Guest)" : ""}`).join(", ") || "—";
  const mealPlanLabel = mealPlanInfo?.meal_name || mealPlanInfo?.meal_code || "—";

  const includesParts = [`room rate ${formatMoney(roomBreakdown.base_total, currency)}`];
  if (roomBreakdown.supplements_total > 0) {
    includesParts.push(`supplements ${formatMoney(roomBreakdown.supplements_total, currency)}`);
  }
  if (mandatoryTaxBreakdown.total > 0) {
    const taxLabel = mandatoryTaxBreakdown.label || "mandatory tax";
    includesParts.push(`${taxLabel} ${formatMoney(mandatoryTaxBreakdown.total, currency)}`);
  }
  const totalAmount = roomBreakdown.final_total + mandatoryTaxBreakdown.total;

  const rows: [string, string][] = [
    ["Room Type", roomTypeName],
    [
      "Room Check-in — Check-out",
      `${formatDate(room.arrival_date)} — ${formatDate(room.departure_date)} (${room.nights} nights)`,
    ],
    ["Meal Plan", mealPlanLabel],
    ["Guest Names", guestNames],
    ["Occupancy", `${room.adults} Adults, ${room.children} Children, ${room.infants} Infants`],
  ];

  const offerLabels = [...data.promotionNames, ...(data.specialOfferName ? [data.specialOfferName] : [])];
  if (offerLabels.length > 0) {
    rows.push(["Special Offer Code", offerLabels.join(", ")]);
  }

  rows.push(["Total Amount", `${formatMoney(totalAmount, currency)} (includes: ${includesParts.join(" + ")})`]);

  if (room.transfer_type && transferBreakdown) {
    rows.push([
      "Transfer",
      `${transferBreakdown.transfer_name}, for ${room.adults} Adults + ${room.children} Children — ${formatMoney(transferBreakdown.total, currency)}`,
    ]);
  }

  return { rows, totalAmount };
}

function buildMultiRoomLpoEmailText(
  booking: Booking,
  hotelName: string,
  roomsData: RoomLpoData[],
  managerName: string
): { subject: string; body: string } | null {
  // One application is one trip for one guest set (see Decision 150), but the
  // guests arrive here split per room -- deduped by identity so a traveller
  // occupying two rooms is listed once in the flight section.
  const seen = new Set<string>();
  const allGuests: GuestRef[] = [];
  for (const d of roomsData) {
    for (const g of d.guests) {
      const key = `${g.first_name}|${g.last_name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allGuests.push(g);
    }
  }
  const built = roomsData
    .map((d) => buildLpoRoomRows(d))
    .filter((b): b is { rows: [string, string][]; totalAmount: number } => b !== null);
  if (built.length === 0) return null;

  const subject = `Booking Confirmation Request — ${booking.booking_number} — ${hotelName}`;
  const currency = roomsData[0]?.room.currency ?? booking.currency;

  const sections: string[] = [];
  built.forEach((b, i) => {
    sections.push(`--- Room ${i + 1} of ${built.length} ---`, renderTextTable(b.rows), "");
  });
  const grandTotal = built.reduce((sum, b) => sum + b.totalAmount, 0);


  const bodyLines = [
    `Dear ${hotelName} Team,`,
    "",
    "Greetings from DMC OS.",
    "",
    `We would like to ask you to confirm the below reservations (${built.length} rooms) as per the following details:`,
    "",
    ...sections,
    `Grand Total (${built.length} rooms): ${formatMoney(grandTotal, currency)}`,
    "",
    // Decision 154: same shared section as the single-room LPO -- one
    // application is one trip for one guest set, so the flights belong once
    // at the end, covering every traveller including those flying apart.
    ...buildFlightSection(booking, allGuests),
    "",
    "Please confirm these reservations exactly as per the above details.",
    "",
    "Best regards,",
    managerName || "—",
  ];

  return { subject, body: bodyLines.join("\n") };
}

// Fetches everything buildMultiRoomLpoEmailText needs, once per room,
// with results shared across rooms that turn out to need the exact same
// underlying data (same contract/room type/dates/occupancy/transfer --
// the common real case for a multi-room application, e.g. BK-000066's
// two identical villas) so N identical rooms cost the same number of
// requests as 1, not N.
function useLpoMultiRoomData(rooms: BookingRoom[]) {
  const [dataByRoomId, setDataByRoomId] = useState<Record<number, RoomLpoData> | null>(null);
  const [loading, setLoading] = useState(true);
  const roomsKey = rooms.map((r) => r.id).join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const token = localStorage.getItem("token") || "";

    const hotelCache = new Map<number, Promise<string>>();
    const roomTypeCache = new Map<number, Promise<string>>();
    const mealPlansByContract = new Map<number, Promise<{ id: number; meal_code: string; meal_name: string | null }[]>>();
    const specialOfferCache = new Map<number, Promise<string | null>>();
    const breakdownCache = new Map<
      string,
      Promise<{
        roomBreakdown: RoomPriceBreakdown | null;
        transferBreakdown: TransferPriceBreakdown | null;
        mandatoryTaxBreakdown: MandatoryTaxBreakdown | null;
        promotionNames: string[];
      }>
    >();

    function getHotelName(hotelId: number): Promise<string> {
      if (!hotelCache.has(hotelId)) {
        hotelCache.set(
          hotelId,
          fetchJson<HotelRef>(`/hotel-engine/hotels/${hotelId}`, token).then((h) => h.hotel_name).catch(() => `#${hotelId}`)
        );
      }
      return hotelCache.get(hotelId)!;
    }

    function getRoomTypeName(roomTypeId: number): Promise<string> {
      if (!roomTypeCache.has(roomTypeId)) {
        roomTypeCache.set(
          roomTypeId,
          fetchJson<{ room_name: string }>(`/hotel-engine/room-types/${roomTypeId}`, token)
            .then((rt) => rt.room_name)
            .catch(() => `#${roomTypeId}`)
        );
      }
      return roomTypeCache.get(roomTypeId)!;
    }

    async function getMealPlanInfo(contractId: number, mealPlanId: number | null): Promise<MealPlanRef | undefined> {
      if (mealPlanId === null) return undefined;
      if (!mealPlansByContract.has(contractId)) {
        mealPlansByContract.set(
          contractId,
          fetchJson<{ id: number; meal_code: string; meal_name: string | null }[]>(
            `/contract-engine/contracts/${contractId}/meal-plans`,
            token
          ).catch(() => [])
        );
      }
      const plans = await mealPlansByContract.get(contractId)!;
      const match = plans.find((p) => p.id === mealPlanId);
      return match ? { meal_code: match.meal_code, meal_name: match.meal_name } : undefined;
    }

    function getSpecialOfferName(offerId: number | null): Promise<string | null> {
      if (offerId === null) return Promise.resolve(null);
      if (!specialOfferCache.has(offerId)) {
        specialOfferCache.set(
          offerId,
          fetchJson<SpecialOfferRef>(`/contract-engine/special-offers/${offerId}`, token)
            .then((o) => o.offer_name)
            .catch(() => null)
        );
      }
      return specialOfferCache.get(offerId)!;
    }

    async function getBreakdown(room: BookingRoom) {
      const key = [
        room.contract_id, room.room_type_id, room.meal_plan_id, room.arrival_date, room.departure_date,
        room.adults, room.children, room.infants, room.transfer_type,
      ].join("|");
      if (breakdownCache.has(key)) return breakdownCache.get(key)!;

      const promise = (async () => {
        const mealPlanInfo = await getMealPlanInfo(room.contract_id, room.meal_plan_id);
        if (!mealPlanInfo) {
          return { roomBreakdown: null, transferBreakdown: null, mandatoryTaxBreakdown: null, promotionNames: [] };
        }
        const roomPriceParams = new URLSearchParams({
          check_in: room.arrival_date,
          check_out: room.departure_date,
          meal_plan: mealPlanInfo.meal_code,
          adults: String(room.adults),
          children: String(room.children),
          infants: String(room.infants),
        });
        const mandatoryTaxParams = new URLSearchParams({
          nights: String(room.nights),
          adults: String(room.adults),
          children: String(room.children),
        });
        const [roomBreakdown, mandatoryTaxBreakdown] = await Promise.all([
          fetchJson<RoomPriceBreakdown>(
            `/contract-engine/contracts/${room.contract_id}/room-types/${room.room_type_id}/price?${roomPriceParams}`,
            token
          ).catch(() => null),
          fetchJson<MandatoryTaxBreakdown>(
            `/contract-engine/contracts/${room.contract_id}/mandatory-tax?${mandatoryTaxParams}`,
            token
          ).catch(() => null),
        ]);
        let transferBreakdown: TransferPriceBreakdown | null = null;
        if (room.transfer_type) {
          const transferParams = new URLSearchParams({
            transfer_type: room.transfer_type,
            check_in: room.arrival_date,
            check_out: room.departure_date,
            adults: String(room.adults),
            children: String(room.children),
            infants: String(room.infants),
          });
          transferBreakdown = await fetchJson<TransferPriceBreakdown>(
            `/contract-engine/contracts/${room.contract_id}/transfer-price?${transferParams}`,
            token
          ).catch(() => null);
        }
        let promotionNames: string[] = [];
        if (roomBreakdown && roomBreakdown.applied_promotions.length > 0) {
          promotionNames = (
            await Promise.all(
              roomBreakdown.applied_promotions.map((id) =>
                fetchJson<PromotionRef>(`/contract-engine/promotions/${id}`, token).catch(() => null)
              )
            )
          )
            .filter((p): p is PromotionRef => p !== null)
            .map((p) => p.promotion_name);
        }
        return { roomBreakdown, transferBreakdown, mandatoryTaxBreakdown, promotionNames };
      })();
      breakdownCache.set(key, promise);
      return promise;
    }

    Promise.all(
      rooms.map(async (room) => {
        const [hotelName, roomTypeName, mealPlanInfo, guests, breakdown, specialOfferName] = await Promise.all([
          getHotelName(room.hotel_id),
          getRoomTypeName(room.room_type_id),
          getMealPlanInfo(room.contract_id, room.meal_plan_id),
          fetchJson<GuestRef[]>(`/booking-engine/rooms/${room.id}/guests`, token).catch(() => []),
          getBreakdown(room),
          getSpecialOfferName(room.applied_special_offer_id),
        ]);
        const data: RoomLpoData = {
          room,
          hotelName,
          roomTypeName,
          mealPlanInfo,
          guests,
          roomBreakdown: breakdown.roomBreakdown,
          transferBreakdown: breakdown.transferBreakdown,
          mandatoryTaxBreakdown: breakdown.mandatoryTaxBreakdown,
          promotionNames: breakdown.promotionNames,
          specialOfferName,
        };
        return [room.id, data] as const;
      })
    ).then((entries) => {
      if (!cancelled) {
        setDataByRoomId(Object.fromEntries(entries));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsKey]);

  return { dataByRoomId, loading };
}

function MultiRoomCorrespondencePanel({
  booking,
  rooms,
  onBookingUpdated,
}: {
  booking: Booking;
  rooms: BookingRoom[];
  onBookingUpdated: (b: Booking) => void;
}) {
  const { dataByRoomId, loading } = useLpoMultiRoomData(rooms);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientEmailSecondary, setRecipientEmailSecondary] = useState("");
  const [editableLpoBody, setEditableLpoBody] = useState("");
  const [lpoCopied, setLpoCopied] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [hotelEmail, setHotelEmail] = useState<string | null>(null);

  // All real rooms today share one hotel_id per application; even if
  // they didn't, the first billable room's hotel is still the right "To"
  // default -- the recipient field stays freely editable either way.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<HotelRef>(`/hotel-engine/hotels/${rooms[0].hotel_id}`, token)
      .then((hotel) => setHotelEmail(hotel.email ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms[0]?.hotel_id]);

  useEffect(() => {
    if (hotelEmail && !recipientEmail) setRecipientEmail(hotelEmail);
  }, [hotelEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const managerName = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").name || "";
    } catch {
      return "";
    }
  })();

  const roomsData = dataByRoomId ? rooms.map((r) => dataByRoomId[r.id]).filter((d): d is RoomLpoData => !!d) : null;
  const hotelName = roomsData?.[0]?.hotelName ?? "";
  const lpo = roomsData && roomsData.length > 0 ? buildMultiRoomLpoEmailText(booking, hotelName, roomsData, managerName) : null;

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
      // Still exactly ONE POST, to the same booking-level (not room-
      // level) endpoint -- one combined email, sent once, covering every
      // room in the body built above.
      await fetchJson<BookingCorrespondenceRow>(`/booking-engine/bookings/${booking.id}/correspondence/send`, token, {
        method: "POST",
        body: JSON.stringify({
          subject: lpo.subject,
          body: editableLpoBody || lpo.body,
          recipient_email: recipientEmail.trim() || null,
          recipient_email_secondary: recipientEmailSecondary.trim() || null,
        }),
      });
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
          LPO — booking confirmation request to hotel ({rooms.length} rooms, one email)
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
            rows={20}
            className="w-full rounded-lg border border-ink/15 bg-white p-3 font-mono text-xs text-ink focus:border-coral focus:outline-none"
          />
        </>
      ) : (
        <p className="text-xs text-slate/50">
          {loading ? "Calculating prices for all rooms..." : "Could not generate the email — check each room's price calculation."}
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

// ---------------------------------------------------------------------------
// The price the agent booked at, at the foot of the Rooms block.
//
// The Rooms block showed each room's BookingRoom.total_amount -- the ROOM
// line only. Transfer and mandatory tax were missing and there was no total
// at all, so a real two-room booking read "1466.50" and "3927.00" while the
// agent had booked at 6700.50. Both facts a manager needs are now here: the
// number the agent paid, and, on hover, where it comes from.
//
// Deliberately fed by /commercial-summary rather than by adding up the room
// objects the base already has in hand: that endpoint is the same money the
// Commercial breakdown table below shows (same seed arithmetic, and it reads
// a manager's manual corrections), so the two figures on one screen cannot
// drift apart. It writes nothing.
// ---------------------------------------------------------------------------

interface CommercialSummaryLine {
  category: CommercialLineCategory;
  cost: number;
  price: number;
  adjusted: boolean;
}

interface CommercialSummaryRoom {
  booking_room_id: number;
  sequence_number: number;
  room_type_id: number;
  status: string;
  billable: boolean;
  lines: CommercialSummaryLine[];
  net_total: number;
  sale_total: number;
}

interface BookingCommercialSummary {
  booking_id: number;
  currency: string;
  rooms: CommercialSummaryRoom[];
  net_total: number;
  sale_total: number;
  has_manual_adjustment: boolean;
}

function RoomsAgentTotal({ booking }: { booking: Booking }) {
  const [summary, setSummary] = useState<BookingCommercialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    setSummary(null);
    setError(null);
    fetchJson<BookingCommercialSummary>(
      `/finance-engine/bookings/${booking.id}/commercial-summary`,
      token,
    )
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, [booking.id]);

  if (error) return <p className="mt-3 text-xs text-red-600">{error}</p>;
  if (!summary) return <p className="mt-3 text-xs text-slate/50">Loading total...</p>;

  const multiRoom = summary.rooms.length > 1;

  return (
    <div className="group relative mt-3 flex flex-wrap items-baseline justify-end gap-x-2 border-t border-ink/10 pt-3">
      <span className="text-xs text-slate/60">Booked by the agent at</span>
      <span className="cursor-help font-mono text-base font-semibold text-ink underline decoration-dotted decoration-slate/40 underline-offset-4">
        {formatMoney(summary.sale_total, summary.currency)}
      </span>
      {summary.has_manual_adjustment && (
        <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-ink/70">
          corrected
        </span>
      )}

      {/* Hover/focus card. group-hover only -- no state, no portal, and it is
          purely explanatory, so nothing is lost on a touch device that can't
          hover: every figure in it is also in the Commercial breakdown. */}
      <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-[22rem] rounded-xl border border-ink/15 bg-white p-3 shadow-lg group-hover:block">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate/50">
          How this total is built
        </p>
        <table className="w-full text-xs">
          <tbody>
            {summary.rooms.map((room) => (
              <Fragment key={room.booking_room_id}>
                {multiRoom && (
                  <tr>
                    <td colSpan={2} className="pt-2 font-medium text-ink">
                      Room #{room.sequence_number}
                      {!room.billable && (
                        <span className="ml-1 font-normal text-slate/50">
                          — {room.status.toLowerCase()}, not charged
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                {room.lines.map((line) => (
                  <tr key={`${room.booking_room_id}-${line.category}`} className="text-slate/70">
                    <td className="py-0.5 pl-2">
                      {COMMERCIAL_CATEGORY_LABELS[line.category] ?? line.category}
                      {line.adjusted && <span className="ml-1 text-gold">·corrected</span>}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {formatMoney(line.price, summary.currency)}
                    </td>
                  </tr>
                ))}
                {multiRoom && (
                  <tr className="text-slate/50">
                    <td className="py-0.5 pl-2">Room #{room.sequence_number} subtotal</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {formatMoney(room.sale_total, summary.currency)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink/15 font-semibold text-ink">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right font-mono tabular-nums">
                {formatMoney(summary.sale_total, summary.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-[11px] leading-snug text-slate/50">
          Sale price only. Cost and profit are in the Commercial breakdown, where these figures can also be
          corrected.
        </p>
      </div>
    </div>
  );
}

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
  detail,
  onUpdated,
  locked,
}: {
  bookingRoomId: number;
  category: CommercialLineCategory;
  line: BookingCommercialLine | undefined;
  currency: string;
  // What this line is actually charging for ("Sky Studio", "Shared Seaplane
  // Transfer"), resolved by the caller. null when nothing names it.
  detail?: string | null;
  // Decision 163: this table edits through its own control, not through the
  // detail screen's `permissions`, so it needs the lock passed in explicitly
  // or it silently escapes the claim rule -- which it did.
  locked?: boolean;
  onUpdated: (updated: BookingCommercialLine) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [baseCost, setBaseCost] = useState("");
  const [adjCost, setAdjCost] = useState("0");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setBaseCost(line?.base_cost != null ? String(line.base_cost) : "");
    setAdjCost(line ? String(line.adjustment_cost) : "0");
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
            // Decision 178: the price side is no longer sent. Omitted
            // fields keep their stored value (upsert_commercial_line only
            // writes what it is given), so existing base_price rows are
            // preserved as history rather than zeroed -- they simply no
            // longer decide anything.
            base_cost: baseCost.trim() === "" ? null : parseFloat(baseCost),
            adjustment_cost: adjCost.trim() === "" ? null : parseFloat(adjCost),
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
    // Colour and type follow the reference the owner supplied: near-black
    // body text at a readable size, horizontal rules only (no vertical grid
    // inside the body), white background, no zebra. Nothing about which
    // figures are shown or how they are computed changed here -- his
    // instruction was explicit that only the colour and the font move.
    //
    // One thing the reference does not answer: an unused category. It stays
    // lighter, because on a typical booking three of the six lines are empty
    // and they should recede rather than read as six equally real charges.
    const empty = !line;
    // Every cell is ruled, horizontally AND vertically. The previous version
    // dropped the vertical rules and used ink/10 (rgb 232,233,236) for the
    // horizontals -- on a white card inside a white card that is close to
    // invisible, and the owner's report was exactly that: "нет табличку", it
    // does not read as a table at all. ink/20 lands at rgb(209,211,217),
    // matching the weight of the reference's own grid lines.
    const cell = `border-b border-r border-ink/20 px-3 py-2 align-middle ${
      empty ? "text-slate/45" : "text-ink"
    }`;
    return (
      <tr>
        <td className={`${cell} font-medium`}>{COMMERCIAL_CATEGORY_LABELS[category]}</td>
        <td className={`${cell} max-w-[18rem] truncate`} title={detail ?? undefined}>
          {detail ?? "—"}
        </td>
        <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
          {line ? formatAmount(totalCost) : "—"}
        </td>
        <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
          {line ? formatAmount(totalPrice) : "—"}
        </td>
        {/* Per-line margin. The table already held both sides of it and made
            the reader subtract in their head, one row at a time. */}
        <td
          className={`${cell} whitespace-nowrap text-right tabular-nums ${
            line && totalPrice - totalCost < 0 ? "text-danger" : ""
          }`}
        >
          {line ? formatAmount(totalPrice - totalCost) : "—"}
        </td>
        <td className={cell}>
          {hasAdjustment && (
            <span title={line?.adjustment_note ?? undefined} className="cursor-help">
              <Badge tone={(line!.adjustment_cost < 0 || line!.adjustment_price < 0) ? "success" : "warning"}>
                {formatAmount(line!.adjustment_cost)} / {formatAmount(line!.adjustment_price)}
              </Badge>
            </span>
          )}
        </td>
        <td className="border-b border-ink/20 px-3 py-2 text-right">
          <button
            type="button"
            onClick={startEdit}
            disabled={locked}
            className="rounded border border-ink/25 bg-white px-2 py-0.5 text-xs font-medium text-ink/70 transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
          >
            {line ? "Edit" : "Add"}
          </button>
        </td>
      </tr>
    );
  }

  // The edit form spans the whole grid row. colSpan follows the header's
  // seven columns -- it was 5 and silently stopped short of the new Margin
  // and Details columns, leaving the form boxed into part of the table.
  return (
    <tr>
      <td colSpan={7} className="border-b border-ink/10 px-3 py-2 text-ink">
        <div className="flex flex-wrap items-end gap-2 py-1">
          <span className="w-24 shrink-0 text-sm font-medium text-ink">{COMMERCIAL_CATEGORY_LABELS[category]}</span>
          <label className="flex flex-col text-xs text-slate/50">
            Base cost, {currency}
            <Input scale="sm" type="number" step="0.01" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} placeholder="—" className="w-28" />
          </label>
          <label className="flex flex-col text-xs text-slate/50">
            Adjustment cost, {currency}
            <Input scale="sm" type="number" step="0.01" value={adjCost} onChange={(e) => setAdjCost(e.target.value)} className="w-28" />
          </label>
          {/* Decision 178: the price inputs are gone. The sale price is what
              the agent saw and will be invoiced -- editing it here changed
              nothing the agent is charged (the invoice has always been built
              from the frozen figures) while silently moving what this screen,
              the Bookings list and the "Booked by the agent at" line each
              reported. Three different numbers for one booking. Cost is the
              only side a correction here was ever meant to move. */}
          <span className="self-center text-xs text-slate/50">
            Price is fixed at what the agent booked
          </span>
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
    </tr>
  );
}

// Bare figures for the spreadsheet grid. The currency is in the column head,
// so repeating it fourteen times inside the table is exactly the noise the
// owner asked to remove ("сделать попроще цифры"). Thousands are grouped so
// 13314.50 reads as 13,314.50 at a glance.
function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// What each line is actually charging for. A category on its own ("Room")
// does not say which room, which is the whole of the owner's point. Returns
// null where nothing in the booking names the line -- CIP and Excursion are
// free-form manual entries with no id anywhere to resolve.
function describeCommercialLine(
  category: CommercialLineCategory,
  labels?: DetailCtx["labels"],
): string | null {
  if (!labels) return null;
  switch (category) {
    case "room": {
      const parts = [labels.roomType, labels.hotel].filter(Boolean);
      if (parts.length === 0) return null;
      const g = labels.guests;
      const occupancy = [
        `${g.adults} ad`,
        g.children ? `${g.children} ch` : null,
        g.infants ? `${g.infants} inf` : null,
      ]
        .filter(Boolean)
        .join(" + ");
      return `${parts.join(" · ")} · ${labels.nights}n · ${occupancy}`;
    }
    case "transfer":
      return labels.transfer;
    case "meal":
      return labels.mealPlan;
    case "tax":
      // Named by the contract, not by us -- the figure comes from Contract
      // Engine's mandatory-tax rule, which is where the name lives too.
      return "Mandatory tax";
    default:
      return null;
  }
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
  roomTotal,
  applicationTotal,
  roomLabel,
  invoiceTotal,
  locked,
  labels,
  rooms,
  onSelectRoom,
  grandTotal,
}: {
  bookingRoomId: number;
  currency: string;
  lines: BookingCommercialLine[];
  onLineUpdated: (updated: BookingCommercialLine) => void;
  locked?: boolean;
  // This table is ONE ROOM's ledger. `roomTotal` is that room's own frozen
  // price; `applicationTotal` is the whole booking's, which is what the
  // agent is billed and what the invoice covers. Decision 179: these were a
  // single `bookingTotal` prop, so on a multi-room booking the panel called
  // one room's figure "what the agent is billed" and then compared it to an
  // invoice for every room -- guaranteed to read "does not match" even when
  // everything was correct (reported on BK-000080: 1964.50 vs 6700.50).
  roomTotal?: number | null;
  applicationTotal?: number | null;
  invoiceTotal?: number | null;
  roomLabel?: string | null;
  labels?: DetailCtx["labels"];
  // Decision 180: switching rooms without leaving the ledger.
  rooms?: BookingRoom[] | null;
  onSelectRoom?: (roomId: number) => void;
  // The whole application's cost/price/margin, for the grand total below.
  // null while it loads, or when there is nothing to aggregate.
  grandTotal?: { net: number; sale: number; rooms: number } | null;
}) {
  const byCategory = new Map(lines.map((l) => [l.category, l]));
  // Decision 160: this table had NO totals row at all. Decision 157 removed
  // the summary trio above it on the assumption the breakdown carried its
  // own totals -- it did not, so the screen was left with no total anywhere.
  // Decision 178: the sale side is the frozen price, never the ledger's --
  // for THIS room, since this table is this room's ledger.
  const totals = computeCommercialLineTotals(lines, roomTotal ?? 0);
  const centsApart = (a: number, b: number) => Math.abs(Math.round((a - b) * 100)) > 1;
  // Decision 179: the invoice covers the whole application, so it is checked
  // against the application total -- never against one room's, which cannot
  // match it whenever there is more than one room.
  const invoiceMismatch =
    invoiceTotal != null && applicationTotal != null && centsApart(applicationTotal, invoiceTotal);
  const multiRoom = applicationTotal != null && roomTotal != null && centsApart(applicationTotal, roomTotal);

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate/50">
        Commercial breakdown
        {/* Decision 179: say WHOSE ledger this is. Unlabelled, a two-room
            booking showed one room's figures under a heading that read like
            the whole booking's. */}
        {roomLabel && <span className="ml-1.5 normal-case text-slate/40">· {roomLabel}</span>}
      </h4>
      <p className="mt-1 text-xs text-slate/50">
        Cost/price per category for this room, editable. An adjustment is a manual correction on top of the
        system-computed base figure (e.g. a discount the hotel granted after booking) — the original figure is
        never overwritten.
      </p>

      {/* Decision 180: switch rooms here. The ledger is per room, and the
          only way to see another one's was to scroll back up to the Rooms
          card and click there -- once per room, on an application that may
          have eight. The tabs drive the SAME selection the Rooms card does
          (one piece of state in BookingDetail), so the two can never point
          at different rooms. */}
      {rooms && rooms.length > 1 && onSelectRoom && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {rooms.map((room) => {
            const active = room.id === bookingRoomId;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-ink/15 bg-white text-ink/70 hover:bg-sand"
                }`}
              >
                Room {room.sequence_number}
                {/* A rejected or cancelled room is still readable, but it is
                    not part of what the agent pays -- saying so on the tab
                    avoids explaining it again inside the table. */}
                {NON_BILLABLE_ROOM_STATUSES.has(room.status) && (
                  <span className={active ? "ml-1 text-white/60" : "ml-1 text-slate/40"}>
                    · {room.status.toLowerCase()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Spreadsheet, not a page table. Deliberately NOT the shared
          TableShell/TableRow components: those are sized for page-level
          lists (px-4 py-3 a cell), which here produced six rows of near-empty
          whitespace and made a six-line ledger fill a screen. This is a
          ruled grid -- every cell bordered, tight rows, numbers right-aligned
          and tabular so digits line up down the column. Forcing that density
          through the shared components would have restyled every other table
          in the app.

          The currency is stated ONCE, in the column heads. It used to be
          repeated on all fourteen figures, which is most of what made the
          numbers hard to read.

          The Details column is what the owner actually asked for: a category
          alone ("Room") does not say which room, so each line now names the
          real thing it is charging for. */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-ink/25 bg-white">
        <table className="w-full border-collapse text-sm">
          {/* Header keeps the reference's colour and type -- white ground,
              near-black bold labels in normal case, not muted small-caps --
              but its rules are drawn at a weight that is actually visible.
              The separator under the header is heavier than the row rules,
              so the head reads as a head. */}
          <thead>
            <tr className="text-ink">
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-left font-semibold">Item</th>
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-left font-semibold">Details</th>
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-right font-semibold">
                Cost, {currency}
              </th>
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-right font-semibold">
                Price, {currency}
              </th>
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-right font-semibold">
                Margin, {currency}
              </th>
              <th className="border-b-2 border-r border-ink/25 px-3 py-2.5 text-left font-semibold">
                Adjustment
              </th>
              <th className="border-b-2 border-ink/25 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {COMMERCIAL_LINE_CATEGORIES.map((category) => (
              <CommercialLineRow
                key={category}
                bookingRoomId={bookingRoomId}
                category={category}
                line={byCategory.get(category)}
                currency={currency}
                detail={describeCommercialLine(category, labels)}
                onUpdated={onLineUpdated}
                locked={locked}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-ink">
              <td className="border-t-2 border-r border-ink/25 px-3 py-2.5">Total</td>
              <td className="border-t-2 border-r border-ink/25 px-3 py-2.5 font-normal text-ink/60">
                {labels?.nights != null ? `${labels.nights} nights` : ""}
              </td>
              <td className="border-t-2 border-r border-ink/25 px-3 py-2.5 text-right tabular-nums">
                {formatAmount(totals.netTotal)}
              </td>
              <td className="border-t-2 border-r border-ink/25 px-3 py-2.5 text-right tabular-nums">
                {formatAmount(totals.saleTotal)}
              </td>
              <td
                className={`border-t-2 border-r border-ink/25 px-3 py-2.5 text-right tabular-nums ${
                  totals.profit < 0 ? "text-danger" : "text-ink"
                }`}
              >
                {formatAmount(totals.profit)}
              </td>
              <td className="border-t-2 border-r border-ink/25 px-3 py-2.5" />
              <td className="border-t-2 border-ink/25 px-3 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Decision 180: the whole booking, under the one room's table. The
          table above is deliberately per room, so without this the only
          figure for "what does this booking cost us in total" was the
          agent's price -- cost and margin existed per room and nowhere in
          aggregate. Labelled with the real room count ("for 2 rooms") so it
          can never be mistaken for the room above it. */}
      {grandTotal && grandTotal.rooms > 1 && (
        <div className="mt-3 overflow-x-auto rounded-lg border-2 border-ink/25 bg-sand/30">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="font-semibold text-ink">
                <td className="border-r border-ink/20 px-3 py-2.5">
                  Grand total
                  <span className="ml-1.5 font-normal text-ink/60">for {grandTotal.rooms} rooms</span>
                </td>
                <td className="border-r border-ink/20 px-3 py-2.5 text-right tabular-nums">
                  <span className="mr-2 font-normal text-ink/50">Cost</span>
                  {formatAmount(grandTotal.net)}
                </td>
                <td className="border-r border-ink/20 px-3 py-2.5 text-right tabular-nums">
                  <span className="mr-2 font-normal text-ink/50">Price</span>
                  {formatAmount(grandTotal.sale)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    grandTotal.sale - grandTotal.net < 0 ? "text-danger" : "text-ink"
                  }`}
                >
                  <span className="mr-2 font-normal text-ink/50">Margin</span>
                  {formatAmount(grandTotal.sale - grandTotal.net)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 space-y-1 text-xs">
        {applicationTotal != null && (
          <p className="text-slate/60">
            Agent is billed <strong className="text-ink">{formatMoney(applicationTotal, currency)}</strong>
            {multiRoom && roomTotal != null && (
              <> for the whole booking, of which {formatMoney(roomTotal, currency)} is this room</>
            )}{" "}
            — the price they saw at booking, transfer included. Corrections here change our cost and
            margin, never this figure.
          </p>
        )}
        {invoiceTotal != null && (
          <p className={invoiceMismatch ? "font-medium text-danger" : "text-slate/60"}>
            Invoice total: {formatMoney(invoiceTotal, currency)}
            {/* Decision 179: the comparison names what it compared. "Does not
                match the breakdown" was both wrong (it was checked against
                one room) and unhelpful -- it never said match WHAT. */}
            {invoiceMismatch
              ? " — does not match what the agent is billed; it was issued before the booking changed"
              : " ✓ matches what the agent is billed"}
          </p>
        )}
      </div>
    </div>
  );
}

function FinancialSummaryBlock({
  ctx,
  invoiceSlot,
  invoiceTotal,
}: {
  ctx: DetailCtx;
  invoiceSlot?: ReactNode;
  invoiceTotal?: number | null;
}) {
  const { booking, bookingRoomId, rooms } = ctx;
  const { lines, setLines, error: linesError, loading: linesLoading } = useCommercialLines(bookingRoomId);
  // Decision 179: `booking` here is the SELECTED ROOM adapted onto a Booking
  // shape, so computeBookingFinancials(booking) is that room's price, not
  // the application's. application_total rides through the spread untouched
  // (Reservations.tsx only overrides the per-room fields), and is the figure
  // the agent is actually billed and the invoice actually covers.
  const applicationTotal = booking.application_total ?? null;
  // Decision 180: the whole application's cost/price, for the grand total.
  // Same read-only endpoint the Rooms block's own total uses -- it writes
  // nothing and already aggregates exactly this, so no second definition of
  // the arithmetic appears here.
  const [summary, setSummary] = useState<BookingCommercialSummary | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    setSummary(null);
    fetchJson<BookingCommercialSummary>(
      `/finance-engine/bookings/${booking.id}/commercial-summary`,
      token,
    )
      .then(setSummary)
      .catch(() => setSummary(null));
    // Re-fetches when a ledger edit changes `lines`, so the grand total can
    // never lag the per-room table it sits under.
  }, [booking.id, lines]);
  const grandTotal = summary
    ? {
        net: summary.net_total,
        sale: summary.sale_total,
        rooms: summary.rooms.filter((r) => r.billable).length,
      }
    : null;
  const selected = rooms?.find((r) => r.id === bookingRoomId) ?? null;
  const roomLabel =
    selected && rooms && rooms.length > 1
      ? `Room #${selected.sequence_number} of ${rooms.length}`
      : null;
  // Falls back to the old frozen-Booking-column formula only while lines
  // haven't loaded yet (or for the legacy "no rooms at all" case where
  // bookingRoomId is null) -- once GET auto-seeds, lines is always the
  // real source from then on, per the owner-confirmed decision that a
  // manual correction here should be reflected immediately.
  // Decision 157: the summary trio that consumed this was removed (its
  // figures now live only at the foot of the breakdown table). Kept as a
  // void reference rather than deleting the computation, so the documented
  // "commercial lines win over the frozen Booking columns" rule above stays
  // in one readable place for whoever adds the next consumer.
  void (
    lines && lines.length > 0
      ? computeCommercialLineTotals(lines, computeBookingFinancials(booking).saleTotal)
      : computeBookingFinancials(booking)
  );

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
      {/* Decision 157: the Net cost / Sale price / Profit trio lived here
          AND at the foot of the commercial breakdown below, which is the
          table built to carry exactly those figures per category. Owner:
          they belong in one place -- the breakdown. */}


      {linesLoading && <p className="text-sm text-slate/50">Loading commercial breakdown...</p>}
      {linesError && <p className="text-sm text-red-600">{linesError}</p>}
      {!linesLoading && !linesError && bookingRoomId && (
        <CommercialLineItemsPanel
          bookingRoomId={bookingRoomId}
          currency={booking.currency}
          lines={lines ?? []}
          onLineUpdated={handleLineUpdated}
          // Decision 160: the booking's own frozen total, so the table can
          // say out loud whether it still reconciles. Invoice total is not
          // wired here yet -- it lives behind a separate fetch in the
          // renderHeaderActions slot, and guessing it would be worse than
          // showing nothing.
          // This room's own frozen price (ctx.booking is the SELECTED room
          // adapted onto a Booking shape), and the whole application's --
          // two different figures that were being conflated.
          roomTotal={computeBookingFinancials(booking).saleTotal}
          applicationTotal={applicationTotal}
          roomLabel={roomLabel}
          rooms={rooms}
          onSelectRoom={ctx.onSelectRoom}
          grandTotal={grandTotal}
          invoiceTotal={invoiceTotal}
          // Same rule as the rest of the detail screen: no owner, no edits.
          locked={booking.claimed_by === null && !["Cancelled", "Rejected", "Completed"].includes(booking.status)}
          labels={ctx.labels}
        />
      )}
      {/* Decision 161: the invoice number + amount moved here from Quick
          Actions. It quotes a figure that must equal the breakdown's Total
          Price, and in Quick Actions the two were screens apart -- so a
          disagreement (the owner found one) was invisible. */}
      {invoiceSlot && (
        <div className="rounded-xl border border-ink/10 p-4">{invoiceSlot}</div>
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

function ListSummaryBar({
  bookings,
  financialsByBooking,
  onFinancialsLoaded,
}: {
  bookings: Booking[];
  financialsByBooking: Record<number, BookingListFinancials>;
  onFinancialsLoaded: (map: Record<number, BookingListFinancials>) => void;
}) {
  // Bulk-fetches live (commercial-line-aware) financials for exactly
  // whatever the list currently has visible -- one request per distinct
  // visible set (filter/sort/date-range change), not one per row and not
  // one per re-render. See compute_bookings_list_financials's own
  // docstring (backend/app/engines/finance/service.py) for why this is
  // needed at all: a manual cost correction in a room's commercial ledger
  // never touches Booking's own frozen columns, so without this, the list
  // silently keeps showing the pre-correction profit forever.
  const idsKey = bookings.map((b) => b.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (bookings.length === 0) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<BookingListFinancials[]>(`/finance-engine/bookings/financials?ids=${idsKey}`, token)
      .then((rows) => {
        const map: Record<number, BookingListFinancials> = {};
        rows.forEach((r) => {
          map[r.booking_id] = r;
        });
        onFinancialsLoaded(map);
      })
      .catch(() => {
        // Best-effort -- rows simply keep using the frozen-column
        // fallback below, same as before this endpoint existed.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (bookings.length === 0) return null;

  const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
  // Same exclusion as Finance Engine's own generate_agent_statement
  // (backend/app/engines/finance/service.py): Cancelled/Rejected never
  // contributed real profit, so they don't belong in the sum.
  const billable = bookings.filter((b) => b.status !== "Cancelled" && b.status !== "Rejected");

  const profitByCurrency: Record<string, number> = {};
  let anyUncomputed = false;
  for (const b of billable) {
    const bulk = financialsByBooking[b.id];
    const profit = bulk ? bulk.profit : computeBookingFinancials(b).profit;
    if (profit === null) {
      anyUncomputed = true;
      continue;
    }
    profitByCurrency[b.currency] = (profitByCurrency[b.currency] ?? 0) + profit;
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
  // Bulk, live (commercial-line-aware) Net/Sale/Profit per booking_id --
  // populated by ListSummaryBar's own bulk-fetch effect (it's the one
  // component that already receives the full visible booking array), read
  // by renderFinancialColumnCells below. A booking_id absent from this map
  // (not yet loaded, or the bulk endpoint returned nothing for it) falls
  // back to the old frozen-column computeBookingFinancials, same as
  // before this existed -- never a blank/broken cell.
  const [financialsByBooking, setFinancialsByBooking] = useState<Record<number, BookingListFinancials>>({});

  function mergeFinancials(map: Record<number, BookingListFinancials>) {
    setFinancialsByBooking((prev) => ({ ...prev, ...map }));
  }

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
    // Shared components, not raw <th>/<td>. These trailing columns are
    // appended into the SAME table whose density the shell now sets -- as
    // hand-rolled cells they kept the comfortable padding and skipped the
    // grid's rules, so the last two columns of a ruled table would have had
    // no lines and the wrong alignment.
    financialColumnHeaders: (
      <>
        <TableHeadCell>Net cost</TableHeadCell>
        <TableHeadCell>Profit</TableHeadCell>
      </>
    ),
    renderFinancialColumnCells: (booking) => {
      const bulk = financialsByBooking[booking.id];
      const netTotal = bulk ? bulk.net_total : computeBookingFinancials(booking).netTotal;
      const profit = bulk ? bulk.profit : computeBookingFinancials(booking).profit;
      return (
        <>
          <TableNumericCell className="font-medium text-ink">
            {formatNumber(netTotal)}
            {bulk?.has_manual_adjustment && (
              <span
                className="ml-1 cursor-help text-[10px] text-warning"
                title="Includes a manual correction from the commercial ledger"
              >
                ✎
              </span>
            )}
          </TableNumericCell>
          <TableNumericCell className="font-medium text-ink">
            {profit !== null ? (
              formatNumber(profit)
            ) : (
              <span
                className="cursor-help text-slate/40"
                title="Not computed — booking was created before Pricing Engine (Decision 069)"
              >
                —
              </span>
            )}
          </TableNumericCell>
        </>
      );
    },
    extraColumnCount: 2,
    renderStatusBadgeExtra: (booking) =>
      urgentByBooking[booking.id] ? <NeedsAttentionBadge summary={urgentByBooking[booking.id]} /> : null,
    // Decision 161: no longer a header action -- the invoice block is
    // rendered inside the financial summary, next to the totals it must
    // agree with. The slot itself is kept (other callers/pages may still
    // use it) but the booking detail passes nothing through it.
    renderHeaderActions: undefined,
    renderCorrespondencePanel: (ctx) => <CorrespondencePanel ctx={ctx} />,
    renderReplyLogButton: (ctx) => <ReplyLogButton ctx={ctx} />,
    renderFinancialSummary: (ctx) => (
      <FinancialSummaryBlock
        ctx={ctx}
        // Decision 178: the breakdown's invoice-reconciliation line existed
        // but was never fed -- `invoiceTotal` had no caller, so a stale
        // Issued invoice was invisible on the one screen that shows the
        // money. Real case in the live data: BK-000054 was invoiced at
        // 1156.65 and its booking now totals 1908.85 after a date change,
        // and it had already dropped off the urgent panel because someone
        // acknowledged the note. Acknowledging means "seen", not "fixed".
        invoiceTotal={invoicesByBooking[ctx.booking.id]?.total ?? null}
        invoiceSlot={
          <InvoiceHeaderActions
            booking={ctx.booking}
            cachedInvoice={invoicesByBooking[ctx.booking.id]}
            setInvoice={(inv) => setInvoiceFor(ctx.booking.id, inv)}
          />
        }
      />
    ),
    renderListSummary: (bookings) => (
      <ListSummaryBar bookings={bookings} financialsByBooking={financialsByBooking} onFinancialsLoaded={mergeFinancials} />
    ),
    renderRoomsTotal: (ctx) => <RoomsAgentTotal booking={ctx.booking} />,
    onAfterRoomApproved: async (bookingRoomId) => {
      // Decision 166: the voucher the approve dialog promised the manager.
      // Best-effort by contract -- the room is already approved; a failure
      // here must not be reported as a failed approval. The manager can
      // still send it from the confirmation-number editor, which is the
      // recovery path that already existed.
      const token = localStorage.getItem("token") || "";
      try {
        await fetchJson(`/finance-engine/rooms/${bookingRoomId}/voucher`, token, { method: "POST" });
      } catch {
        // swallowed on purpose -- see above
      }
    },
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
