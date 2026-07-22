import { useEffect, useState } from "react";
import type { InvoiceReviewNote } from "./financeShared";
import { computeBookingFinancials, fetchJson } from "./financeShared";
import BookingsList from "./Reservations";
import type { Booking, Permissions, Scope, AdminBookingExtensions, DetailCtx, BookingCorrespondenceRow } from "./Reservations";

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

function FinancialSummaryBlock({ ctx }: { ctx: DetailCtx }) {
  const { booking } = ctx;
  const financials = computeBookingFinancials(booking);
  const mealPlanInfo = useOwnMealPlan(booking);
  const { roomBreakdown, transferBreakdown, mandatoryTaxBreakdown, breakdownError, breakdownLoading } =
    useOwnBreakdown(booking, mealPlanInfo);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-sand/50 p-3 text-sm">
        <div>
          <p className="text-slate/50">Net cost</p>
          <p className="font-medium text-ink">{formatMoney(financials.netTotal, booking.currency)}</p>
        </div>
        <div>
          <p className="text-slate/50">Sale price</p>
          <p className="font-medium text-ink">{formatMoney(financials.saleTotal, booking.currency)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-slate/50">
            Profit
            {financials.profit === null && (
              <span
                className="cursor-help text-slate/40"
                title="Not computed — booking was created before Pricing Engine (Decision 069)"
              >
                ⓘ
              </span>
            )}
          </p>
          <p className="font-medium text-ink">
            {financials.profit !== null ? formatMoney(financials.profit, booking.currency) : "—"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-ink/10 p-3 text-sm">
        <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Price breakdown</h4>
        <p className="mt-1 text-xs text-slate/50">
          Calculated using the contract's current terms — may differ if prices changed after booking.
        </p>
        {breakdownLoading && <p className="mt-2 text-slate/50">Recalculating...</p>}
        {breakdownError && <p className="mt-2 text-red-600">{breakdownError}</p>}
        {roomBreakdown && (
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="text-slate/50">Base: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span>
            </div>
            <div>
              <span className="text-slate/50">Supplements: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span>
            </div>
            <div>
              <span className="text-slate/50">Before promo: </span>
              <span className="text-ink">
                {formatMoney(roomBreakdown.price_before_promotions, roomBreakdown.currency)}
              </span>
            </div>
            <div>
              <span className="text-slate/50">Room total: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.final_total, roomBreakdown.currency)}</span>
            </div>
          </div>
        )}
        {transferBreakdown && (
          <div className="mt-2 border-t border-ink/5 pt-2">
            <p className="text-slate/50">
              Transfer ({transferBreakdown.transfer_name}):{" "}
              <span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span>
            </p>
          </div>
        )}
        {mandatoryTaxBreakdown && mandatoryTaxBreakdown.total > 0 && (
          <div className="mt-2 border-t border-ink/5 pt-2">
            <p className="text-slate/50">
              {mandatoryTaxBreakdown.label || "Mandatory tax"} ({mandatoryTaxBreakdown.chargeable_guests} pax ×{" "}
              {formatMoney(mandatoryTaxBreakdown.rate_per_person_per_night, mandatoryTaxBreakdown.currency)} ×{" "}
              {mandatoryTaxBreakdown.nights} nights, charged after discounts and not itself discountable):{" "}
              <span className="text-ink">{formatMoney(mandatoryTaxBreakdown.total, mandatoryTaxBreakdown.currency)}</span>
            </p>
          </div>
        )}
      </div>
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
  latest_change_description: string | null;
  latest_note_at: string | null;
}

// renderStatusBadgeExtra slot -- same visual badge as before, now
// sourced from the booking-rooted set instead of an invoice-only one.
function NeedsAttentionBadge({ summary }: { summary: UrgentBookingSummary }) {
  return (
    <span
      className="inline-flex cursor-help items-center gap-1 rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-medium text-coral"
      title={summary.latest_change_description ?? undefined}
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
      <h3 className="font-display text-lg font-semibold text-ink">Needs Attention</h3>
      {loading ? (
        <p className="mt-3 text-sm text-slate/60">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-ink/10 bg-white px-5 py-6 text-center text-sm text-slate/50">
          No bookings need attention
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <tbody>
              {bookings.map((b) => (
                <tr key={b.booking_id} className="border-b border-ink/5 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{b.booking_number}</td>
                  <td className="px-4 py-3 text-slate/70">{b.latest_change_description ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate/50">
                    {b.latest_note_at ? formatDate(b.latest_note_at) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAcknowledge(b.booking_id)}
                      disabled={acknowledgingId === b.booking_id}
                      className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {acknowledgingId === b.booking_id ? "..." : "Mark as reviewed"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default function AdminBookingsList({ scope }: { scope: Scope }) {
  // Decision 108: keyed by booking_id, populated from ONE bulk
  // GET /bookings/urgent call -- the booking-rooted source of truth,
  // replacing the old invoice-only urgentInvoicesByBooking. Also drives
  // the new dedicated "Needs Attention" panel above the list.
  const [urgentBookings, setUrgentBookings] = useState<UrgentBookingSummary[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);
  // Per-booking invoice cache -- undefined (key absent) means "not yet
  // fetched", null means "fetched, none exists". Shared between
  // renderHeaderActions (reads/seeds it) and onAfterClaim (writes it
  // after auto-creating), which otherwise have no way to talk to each
  // other since onAfterClaim is a plain callback, not a component.
  const [invoicesByBooking, setInvoicesByBooking] = useState<Record<number, InvoiceInfo | null>>({});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.type === "agent" ? scope.agentId : null]);

  const urgentByBooking: Record<number, UrgentBookingSummary> = {};
  urgentBookings.forEach((b) => {
    urgentByBooking[b.booking_id] = b;
  });

  async function handleAcknowledge(bookingId: number) {
    const summary = urgentByBooking[bookingId];
    const confirmMessage = `⚠ ${summary?.latest_change_description ?? ""}\n\nMark as reviewed?`;
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
      <UrgentBookingsPanel
        bookings={urgentBookings}
        loading={urgentLoading}
        onAcknowledge={handleAcknowledge}
        acknowledgingId={acknowledgingId}
      />
      <BookingsList scope={scope} permissions={FULL_ADMIN_PERMISSIONS} adminExtensions={adminExtensions} />
    </div>
  );
}
