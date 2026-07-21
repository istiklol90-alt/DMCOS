import { useEffect, useState } from "react";
import type { InvoiceReviewNote } from "./financeShared";
import { formatSingleNote, computeBookingFinancials, fetchJson } from "./financeShared";
import BookingsList from "./Reservations";
import type { Booking, Permissions, Scope, AdminBookingExtensions, DetailCtx, BookingCorrespondenceRow } from "./Reservations";

// ---------------------------------------------------------------------------
// Admin/Agent Component Separation refactor — everything genuinely
// financial that used to live inline in Reservations.tsx, physically
// moved here: invoice creation/display, the LPO compose/send panel, the
// "Добавить ответ отеля вручную" write action, the re-derived price
// breakdown ("Разбивка стоимости"), Net/Sale/Profit, and the list
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
  return new Date(dateStr).toLocaleDateString("ru-RU");
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
      setSendError(err.message || "Не удалось отправить письмо");
    } finally {
      setSendSubmitting(false);
    }
  }

  return (
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
            <p className="mb-2 text-[11px] text-slate/40">У отеля не указан email в системе — заполните вручную.</p>
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
  );
}

// ---------------------------------------------------------------------------
// renderReplyLogButton slot -- "Добавить ответ отеля вручную" button and
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
      setReplyError("Введите текст ответа отеля");
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
      setReplyError(err.message || "Не удалось добавить ответ");
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
        Добавить ответ отеля вручную
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-ink/10 bg-sand/30 p-3">
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
  );
}

// ---------------------------------------------------------------------------
// renderFinancialSummary slot -- Net/Sale/Profit (Decision 101) AND the
// "Разбивка стоимости" price breakdown (Decision 106) folded into one
// slot, since the fixed 9-slot interface has no separate slot for the
// breakdown; both occupy the single position "Итого" used to.
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
                title="Не рассчитано — бронирование создано до внедрения Pricing Engine (Decision 069)"
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
        <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Разбивка стоимости</h4>
        <p className="mt-1 text-xs text-slate/50">
          Расчёт на текущих условиях контракта — может отличаться, если цены изменились после бронирования.
        </p>
        {breakdownLoading && <p className="mt-2 text-slate/50">Пересчёт...</p>}
        {breakdownError && <p className="mt-2 text-red-600">{breakdownError}</p>}
        {roomBreakdown && (
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="text-slate/50">База: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span>
            </div>
            <div>
              <span className="text-slate/50">Доплаты: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span>
            </div>
            <div>
              <span className="text-slate/50">До промо: </span>
              <span className="text-ink">
                {formatMoney(roomBreakdown.price_before_promotions, roomBreakdown.currency)}
              </span>
            </div>
            <div>
              <span className="text-slate/50">Итог проживания: </span>
              <span className="text-ink">{formatMoney(roomBreakdown.final_total, roomBreakdown.currency)}</span>
            </div>
          </div>
        )}
        {transferBreakdown && (
          <div className="mt-2 border-t border-ink/5 pt-2">
            <p className="text-slate/50">
              Трансфер ({transferBreakdown.transfer_name}):{" "}
              <span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span>
            </p>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderHeaderActions slot -- "Создать счёт" button + invoice summary.
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
      setError(err.message || "Не удалось создать счёт");
    } finally {
      setCreating(false);
    }
  }

  if (cachedInvoice === undefined) return null;

  if (cachedInvoice) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs text-slate/70">
          Счёт <strong className="text-ink">{cachedInvoice.invoice_number}</strong> ({cachedInvoice.status}) на{" "}
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
        {creating ? "Создание..." : "Создать счёт"}
      </button>
      {error && <div className="rounded-lg bg-coral/10 px-2 py-1 text-xs font-medium text-coral">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderStatusBadgeExtra slot -- urgent-invoice badge, sourced from ONE
// bulk GET /invoices/urgent fetch owned by AdminBookingsList (Decision
// 100's efficiency property preserved: never fetched per-row/per-detail).
// ---------------------------------------------------------------------------

function UrgentInvoiceBadge({ invoice }: { invoice: InvoiceInfo }) {
  return (
    <span
      className="inline-flex cursor-help items-center gap-1 rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-medium text-coral"
      title={
        invoice.review_notes.length > 0
          ? formatSingleNote(invoice.review_notes[invoice.review_notes.length - 1], invoice.currency)
          : undefined
      }
    >
      ⚠ Счёт
    </span>
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
  // Decision 100: keyed by booking_id, populated from ONE bulk
  // GET /invoices/urgent call -- the exact same server-bounded query
  // Финансы→Счета's own urgent panel already uses, so this badge can
  // never drift from what that panel shows.
  const [urgentInvoicesByBooking, setUrgentInvoicesByBooking] = useState<Record<number, InvoiceInfo>>({});
  // Per-booking invoice cache -- undefined (key absent) means "not yet
  // fetched", null means "fetched, none exists". Shared between
  // renderHeaderActions (reads/seeds it) and onAfterClaim (writes it
  // after auto-creating), which otherwise have no way to talk to each
  // other since onAfterClaim is a plain callback, not a component.
  const [invoicesByBooking, setInvoicesByBooking] = useState<Record<number, InvoiceInfo | null>>({});

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<InvoiceInfo[]>("/finance-engine/invoices/urgent", token)
      .then((urgentInvoices) => {
        const map: Record<number, InvoiceInfo> = {};
        urgentInvoices.forEach((inv) => {
          if (inv.booking_id !== undefined) map[inv.booking_id] = inv;
        });
        setUrgentInvoicesByBooking(map);
      })
      .catch(() => setUrgentInvoicesByBooking({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.type === "agent" ? scope.agentId : null]);

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
                title="Не рассчитано — бронирование создано до внедрения Pricing Engine (Decision 069)"
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
      urgentInvoicesByBooking[booking.id] ? <UrgentInvoiceBadge invoice={urgentInvoicesByBooking[booking.id]} /> : null,
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
      // this fires -- InvoiceHeaderActions' own fallback "Создать счёт"
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

  return <BookingsList scope={scope} permissions={FULL_ADMIN_PERMISSIONS} adminExtensions={adminExtensions} />;
}
