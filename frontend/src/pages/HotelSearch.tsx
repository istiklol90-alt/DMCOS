import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import type { TFunction } from "i18next";
import i18n from "../i18n/i18n";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import AgentTopNav from "../components/layout/AgentTopNav";
import Modal from "../components/ui/Modal";
import { IconPin, IconSearch } from "../components/ui/icons";
import { describeSleeping, pickBedding, type Bedding, type OccupancyOption } from "./bedding";

function localeOf(lang: string): string {
  return lang === "en" ? "en-US" : "ru-RU";
}

// ---------------------------------------------------------------------------
// Tiny inline icons (same approach as AgentDashboard_v2.tsx — no icon
// package installed in this project)
// ---------------------------------------------------------------------------

function IconPlus({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconMinus({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

function IconAlert({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 9v4M12 17h.01M10.3 3.9 2.7 17.3a1.8 1.8 0 0 0 1.6 2.7h15.4a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
    </svg>
  );
}

function IconCalendar({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function IconChevronLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconChevronRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Decision 150's flight step. A plane tilted down vs up reads as
// arrival/departure at a glance in a way the words alone don't, which
// matters on a step that now shows the same six fields several times over.
function IconPlaneArrival({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 21h20" />
      <path d="M3.8 12.6l2.6-.7 3.2 2.4 4.4-1.2-5.3-6.6 2-.6 7.1 5.6 3.1-.8a1.7 1.7 0 0 1 .9 3.3L5.6 18.1z" />
    </svg>
  );
}

function IconPlaneDeparture({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 21h20" />
      <path d="M3.2 15.5l2.3 1.4 3.7-1.5.9 5.1 2 .5.9-6.4 6.9-2.8a1.7 1.7 0 0 0-1-3.2l-3 1.2-5.6-4.3-2 .8 3.4 5.4-4.3 1.7-2.6-1.6-1.6.6z" />
    </svg>
  );
}

function IconGift({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function IconBed({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 18v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7" />
      <path d="M2 14h20" />
      <path d="M6 9V7a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
      <path d="M2 18v2M22 18v2" />
    </svg>
  );
}

function IconUsers({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.5 5a3.2 3.2 0 0 1 0 6.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Real session + API types
//
// Hotel/RoomType/Contract/ContractMealPlan/RoomPrice shapes below are typed
// from the actual Pydantic Response schemas in
// backend/app/engines/hotel/schemas.py and backend/app/engines/contract/
// schemas.py + service.py's get_room_price return dict — not guessed.
// ---------------------------------------------------------------------------

type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type Hotel = {
  id: number;
  hotel_name: string;
  brand: string | null;
  country: string;
  region: string | null;
  island: string | null;
  city: string;
  star_rating: number | null;
  status: string;
};

type RoomType = {
  id: number;
  hotel_id: number;
  room_name: string;
  room_size: number | null;
  bed_type: string | null;
  max_occupancy: number;
  status: string;
  bedroom_count?: number | null;
};

type Contract = {
  id: number;
  hotel_id: number;
  contract_status: string;
  currency: string;
  transfer_required: boolean;
};

type TransferOption = {
  id: number;
  contract_id: number;
  transfer_type: string;
  transfer_name: string | null;
  price_adult: number;
  price_child: number;
  price_infant: number | null;
  // Decision 196: "per_person" (a seaplane seat, priced per passenger) or
  // "per_vehicle" (a road transfer, one flat fare for the car whoever rides
  // in it). On a per_vehicle option the three per-person prices are a real
  // 0.00 and price_per_vehicle carries the fare.
  pricing_basis: string;
  price_per_vehicle: number | null;
  // Decision 197: how many guests it can carry, counting infants. null means
  // the contract states no limit (a seaplane), never "unknown".
  max_passengers: number | null;
  // Decision 198: separate cap on guests aged 12+. A sedan is "4 total but
  // only 2 adults", which one number could not express. null = no adult-
  // specific limit.
  max_adults: number | null;
  status: string;
};

// GET /contracts/{id}/transfer-price's response shape — the authoritative,
// discount-aware total (applies any active SpecialOfferTransferDiscount,
// e.g. Kandima's KM26_03 50%/25% off), unlike TransferOption's raw catalog
// price_adult/price_child/price_infant, which say nothing about discounts.
type TransferPrice = {
  transfer_type: string;
  transfer_name: string | null;
  currency: string;
  price_adult: number;
  price_child: number;
  price_infant: number | null;
  // Decision 059: the real, final post-discount subtotal per guest bucket
  // -- a SpecialOfferTransferDiscount's applies_to_children flag can make
  // the discount non-uniform across buckets, so these must be used
  // directly for any per-guest breakdown, never reconstructed from total.
  adult_total: number;
  child_total: number;
  infant_total: number;
  // Decision 196: on a per_vehicle option the buckets above are all 0.00 and
  // the fare lives here, so a breakdown must branch on pricing_basis rather
  // than assume the buckets tell the whole story.
  pricing_basis: string;
  price_per_vehicle: number | null;
  vehicle_total: number;
  total: number;
};

type PricedTransferOption = {
  option: TransferOption;
  price?: TransferPrice;
  priceError?: string;
};

// Decision 196. Read from the priced response when there is one and fall
// back to the catalog row otherwise, so an option whose price call failed
// still renders as the kind of thing it is rather than silently reverting
// to a per-person layout that would print "2 adults - 0".
function isPerVehicle(opt: PricedTransferOption): boolean {
  return (opt.price?.pricing_basis ?? opt.option.pricing_basis) === "per_vehicle";
}

// GET /contracts/{id}/mandatory-tax's response shape — a flat
// per-person-per-night government tax (e.g. Kandima's Green Tax), keyed
// only by contract_id/nights/adults/children, never room_type_id or
// meal_plan, so it's fetched once per hotel (like transferOptions), not
// per room type or per meal plan.
type MandatoryTax = {
  label: string | null;
  rate_per_person_per_night: number;
  chargeable_guests: number;
  nights: number;
  currency: string;
  total: number;
};

// Stage 5 (multi-room booking applications) -- one room the agent has
// added to an in-progress, not-yet-submitted "trip". Deliberately a
// client-side-only concept: nothing is written to the backend until the
// whole cart is submitted at once via POST /booking-engine/applications.
// Carries both the real request fields (hotelId/roomTypeId/mealPlan/
// dates/occupancy/transferType) and display-only fields (hotelName/
// roomTypeName/mealPlanLabel/transferName/grandTotal) so the cart panel
// never needs to re-fetch anything already known at add-to-cart time.
type CartRoom = {
  key: string;
  hotelId: number;
  hotelName: string;
  country: string;
  roomTypeId: number;
  roomTypeName: string;
  mealPlan: string;
  mealPlanLabel: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  // The exact ages used to price this room at search time (same 2-11
  // bucket deriveOccupancy itself computes `children` from) -- kept so
  // the checkout form can require each child guest's real date of birth
  // to reconcile with the age this room was actually priced at, not just
  // a count. Length always equals `children` above.
  childAges: number[];
  transferType: string | null;
  transferName: string | null;
  // Decision 196: true only when a transfer WAS on offer for this room and
  // the agent chose to go without one. Distinguishes a deliberate "guests
  // make their own way" from a hotel that simply doesn't sell transfers,
  // which a null transferType alone cannot -- the cart would otherwise show
  // the same blank line for both.
  transferDeclined: boolean;
  currency: string | null;
  grandTotal: number | null;
  // Decision 211: sleeping places, kept structured so the copied offer is
  // worded in whatever language is active when it is copied.
  bedding?: Bedding | null;
  bedType?: string | null;
  bedroomCount?: number | null;
  // Decision 212: offers to mention in the copied text.
  offers?: RoomOffer[];
  // Copy-offer text (the manager or agent pastes it into WhatsApp): the
  // parts of grandTotal, and the hotel line. Display-only, never sent to the
  // backend; optional so a room added before this existed still renders.
  hotelStars?: number | null;
  hotelLocation?: string;
  nights?: number;
  roomTotal?: number | null;
  transferTotal?: number | null;
  taxLabel?: string | null;
  taxTotal?: number | null;
};

// ---------------------------------------------------------------------------
// Copy offer -- one click turns a priced room (or the whole trip) into a
// plain message for WhatsApp, instead of retyping each figure by hand. Built
// only from figures already on screen (the agent's own price, the chosen
// transfer, the tax), so the text can never quote something the screen does
// not. *text* is WhatsApp's bold.
// ---------------------------------------------------------------------------

function offerMoney(amount: number, currency: string | null, lang: string): string {
  const figure = amount.toLocaleString(localeOf(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${figure}` : figure;
}

function offerDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

// The lines describing one room, without a title or total line. No blank
// lines inside a room (owner, 2026-10-14) -- blank lines only separate rooms.
function offerRoomLines(t: TFunction, lang: string, room: CartRoom): string[] {
  const head = `*${room.hotelName}*${room.hotelStars ? ` ${room.hotelStars}★` : ""}${
    room.hotelLocation ? `, ${room.hotelLocation}` : ""
  }`;
  const dates = `${offerDate(room.arrivalDate)} – ${offerDate(room.departureDate)}${
    room.nights ? ` · ${t("offer.nights", { count: room.nights })}` : ""
  }`;
  const lines = [
    head,
    dates,
    formatSearchOccupancy(t, { adults: room.adults, children: room.children, infants: room.infants }, room.childAges),
    `${t("offer.roomType")}: ${room.roomTypeName}`,
  ];
  const sleeping = describeSleeping(room.bedding, room.bedType, lang, room.children, room.bedroomCount);
  if (sleeping) lines.push(`${t("offer.bedding")}: ${sleeping}`);
  lines.push(`${t("offer.meal")}: ${room.mealPlanLabel}`);
  for (const o of room.offers ?? []) {
    const head = `${o.name}${o.code ? ` (${o.code})` : ""}`;
    const tail = o.discountPercent !== null ? ` — −${o.discountPercent}%, ${t("offer.offerInPrice")}` : o.description ? ` — ${o.description}` : "";
    lines.push(`${t("offer.offerLine")}: ${head}${tail}`);
  }
  if (room.roomTotal != null) lines.push(`${t("offer.accommodation")}: ${offerMoney(room.roomTotal, room.currency, lang)}`);
  if (room.transferType && room.transferTotal != null) {
    const price = room.transferTotal === 0 ? t("offer.transferFree") : offerMoney(room.transferTotal, room.currency, lang);
    lines.push(`${t("offer.transfer")}: ${room.transferName ?? room.transferType} — ${price}`);
  } else if (room.transferDeclined) {
    lines.push(`${t("offer.transfer")}: ${t("offer.noTransfer")}`);
  }
  if (room.taxTotal) lines.push(`${room.taxLabel ?? t("offer.taxDefault")}: ${offerMoney(room.taxTotal, room.currency, lang)}`);
  return lines;
}

// One room: its lines and a bold total. Several rooms: each numbered, each
// with its own total, then one grand total -- per currency, never summed
// across currencies (there is no exchange rate in the system).
function buildOfferText(t: TFunction, lang: string, rooms: CartRoom[]): string {
  if (rooms.length === 1) {
    const room = rooms[0];
    const lines = offerRoomLines(t, lang, room);
    if (room.grandTotal != null) lines.push(`*${t("offer.total")}: ${offerMoney(room.grandTotal, room.currency, lang)}*`);
    return lines.join("\n");
  }
  const blocks: string[] = [];
  const byCurrency = new Map<string, number>();
  rooms.forEach((room, i) => {
    const lines = [`*${t("offer.roomTitle", { n: i + 1 })}*`, ...offerRoomLines(t, lang, room)];
    if (room.grandTotal != null) {
      lines.push(`*${t("offer.roomTotal", { n: i + 1 })}: ${offerMoney(room.grandTotal, room.currency, lang)}*`);
      const key = room.currency ?? "";
      byCurrency.set(key, (byCurrency.get(key) ?? 0) + room.grandTotal);
    }
    blocks.push(lines.join("\n"));
  });
  const grand = [...byCurrency.entries()].map(([cur, sum]) => offerMoney(sum, cur || null, lang)).join(" + ");
  return [...blocks, "———", `*${t("offer.grandTotal")}: ${grand}*`].join("\n\n");
}

// Clipboard API first; the old execCommand path for a page served over
// plain http, where navigator.clipboard does not exist.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

type ContractMealPlan = {
  id: number;
  contract_id: number;
  meal_code: string;
  meal_name: string | null;
};

type RoomPrice = {
  // Decision 212: which special offers this price already includes.
  applied_special_offer_ids?: number[];
  contract_id: number;
  room_type_id: number;
  rate_id: number;
  meal_plan_id: number;
  currency: string;
  nights: number;
  final_total: number;
};

// Decision 070: the exact dict apply_agent_pricing returns (same function
// create_booking calls server-side) -- never reconstructed client-side, so
// this preview can't drift from what a real booking would actually charge.
type AgentPrice = {
  room_net_total: number;
  is_exclusive: boolean;
  contract_discount_percent: number;
  exclusive_discount_amount: number;
  markup_amount_per_night: number;
  markup_amount: number;
  agent_room_total: number;
};

// Decision 074: one entry per calendar night, lazy-fetched only when an
// agent expands "Показать цены по ночам" -- same build_nightly_breakdown
// computation apply_agent_pricing itself sums, so it can't disagree with
// the aggregate AgentPrice already shown.
type NightlyPrice = {
  date: string;
  base_rate: number;
  markup: number;
  discount_applied: boolean;
  discount_percent: number;
  discount_amount: number;
  final_price: number;
};

type MealPlanOption = {
  mealCode: string;
  mealName: string | null;
  price?: RoomPrice;
  agentPrice?: AgentPrice;
  priceError?: string;
};

// Decision 212: a special offer as the search page shows it on a room card.
type ApplicableOffer = {
  id: number;
  offer_name: string;
  booking_code: string | null;
  description: string | null;
  room_type_ids: number[] | null;
  room_discounts: { room_type_id: number | null; discount_percent: number }[];
};

type RoomOffer = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  // The discount on this room; null for a gifts-only offer.
  discountPercent: number | null;
};

// Offers that concern one room type. A discount offer is kept only when one
// of its discounts covers this room; whether the price already includes it
// is decided on the card from the price's own applied_special_offer_ids.
function offersForRoom(offers: ApplicableOffer[], roomTypeId: number): RoomOffer[] {
  return offers
    .filter((o) => o.room_type_ids === null || o.room_type_ids.includes(roomTypeId))
    .map((o) => {
      const hits = o.room_discounts.filter((d) => d.room_type_id === null || d.room_type_id === roomTypeId);
      return {
        id: o.id,
        name: o.offer_name,
        code: o.booking_code,
        description: o.description,
        discountPercent: hits.length > 0 ? Math.max(...hits.map((d) => d.discount_percent)) : null,
        hasDiscountRows: o.room_discounts.length > 0,
      };
    })
    .filter((o) => !(o.hasDiscountRows && o.discountPercent === null))
    .map(({ hasDiscountRows: _unused, ...o }) => o);
}

type RoomTypeResult = RoomType & {
  options: MealPlanOption[];
  priceError?: string;
  // Decision 212: special offers for this stay that concern this room.
  offers?: RoomOffer[];
  // Decision 211: how this search's party sleeps in this room, from the
  // hotel's occupancy options. null when the hotel has not described it.
  bedding?: Bedding | null;
};

type HotelResult = Hotel & {
  contractId?: number;
  transferRequired: boolean;
  transferOptions: PricedTransferOption[];
  // Decision 197: Active options this party is too large for. Lets the room
  // card explain an empty transfer list instead of just omitting it.
  transfersTooSmall: number;
  transferCurrency: string | null;
  mandatoryTax?: MandatoryTax;
  roomTypes: RoomTypeResult[];
};

const CARD_GRADIENTS = [
  "from-ink to-gold",
  "from-ink via-ink to-gold/70",
  "from-gold to-ink",
  "from-ink to-gold/60",
  "from-gold/80 to-ink",
];

function cheapestOption(rt: RoomTypeResult): MealPlanOption | null {
  let best: MealPlanOption | null = null;
  for (const opt of rt.options) {
    if (opt.agentPrice && (best === null || opt.agentPrice.agent_room_total < best.agentPrice!.agent_room_total)) {
      best = opt;
    }
  }
  return best;
}

function cheapestOptionPrice(rt: RoomTypeResult): number | null {
  return cheapestOption(rt)?.agentPrice?.agent_room_total ?? null;
}

// Hotel-card summary strip ("from $X / night") -- the lowest per-night
// price across every room type, using the exact same
// agent_room_total/nights division RoomTypeCard's own header already
// does per room type (see cheapestPerNight there), just aggregated
// across room types for the card-level summary. No new pricing formula.
function cheapestPerNightForHotel(hotel: HotelResult): { amount: number; currency: string } | null {
  let best: { amount: number; currency: string } | null = null;
  for (const rt of hotel.roomTypes) {
    const opt = cheapestOption(rt);
    if (opt?.agentPrice && opt.price) {
      const perNight = opt.agentPrice.agent_room_total / opt.price.nights;
      if (best === null || perNight < best.amount) {
        best = { amount: perNight, currency: opt.price.currency };
      }
    }
  }
  return best;
}

function sortRoomTypesByPrice(roomTypes: RoomTypeResult[]): RoomTypeResult[] {
  // Cheapest first, using each room type's cheapest available meal-plan
  // option; room types with no priced option at all (no active contract,
  // no meal plans, every price call failed) sort after every priced room
  // type instead of disrupting the cheap-to-expensive reading.
  return [...roomTypes].sort((a, b) => {
    const pa = cheapestOptionPrice(a);
    const pb = cheapestOptionPrice(b);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });
}

// Case-insensitive partial match across every field the "Destination /
// hotel" search field's own label promises to cover -- hotel_name (e.g.
// "Kandima"), and country/city/island/region/brand (e.g. "Maldives") --
// not hotel_name alone. Client-side, not a backend endpoint: every hotel
// is already fetched in one bulk call per search (real volume today is 2
// hotels total), so a server-side search endpoint would add real backend
// surface for zero benefit at this scale. Revisit only if hotel count
// grows enough that fetching the full catalog per search stops being
// cheap -- not a speculative concern today.
function matchesDestination(hotel: Hotel, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    hotel.hotel_name.toLowerCase().includes(q) ||
    hotel.country.toLowerCase().includes(q) ||
    hotel.city.toLowerCase().includes(q) ||
    (hotel.island?.toLowerCase().includes(q) ?? false) ||
    (hotel.region?.toLowerCase().includes(q) ?? false) ||
    (hotel.brand?.toLowerCase().includes(q) ?? false)
  );
}

// A transfer-price bucket line (adults/children/infants) must always reflect
// the ACTUAL discounted amount, never the raw undiscounted catalog price —
// showing undiscounted math next to a "included free"/discounted total is a
// contradictory, misleading breakdown. When a bucket's true discounted total
// is exactly 0, it gets the same explicit "included free" wording as the
// overall total badge, instead of a "2 × $0 = $0" line that reads as a glitch.
// Russian noun forms (взрослый/взрослых, ребёнок/ребёнка/детей,
// младенец/младенца/младенцев) are handled by i18next's own Intl.PluralRules
// -based one/few/many/other categories via the labelKey's own _one/_few/_many
// suffixes in reservations.json -- no manual mod10/mod100 logic needed.
function renderTransferBucketLine(
  t: TFunction,
  lang: string,
  count: number,
  labelKey: string,
  discountedTotal: number,
  currency: string | null
) {
  const label = t(labelKey, { count });
  if (discountedTotal === 0) {
    return (
      <>
        {label}: {t("roomTypeCard.includedFree")}
      </>
    );
  }
  const perUnit = discountedTotal / count;
  const locale = localeOf(lang);
  return (
    <>
      {label} × {currency} {perUnit.toLocaleString(locale)} = {currency} {discountedTotal.toLocaleString(locale)}
    </>
  );
}

// Real Maldives contracts (verified against Kandima's PDF) price a guest
// aged 12+ as an adult, 2-11.99 as a child, 0-1.99 as an infant — the exact
// buckets get_room_price/get_transfer_price already use. The search form
// only takes each child's age directly; adults/children/infants sent to
// every API call are derived from that, never entered as separate raw
// counts for children/infants.
export function deriveOccupancy(
  baseAdults: number,
  childAges: number[]
): { adults: number; children: number; infants: number } {
  const extraAdults = childAges.filter((a) => a >= 12).length;
  const children = childAges.filter((a) => a >= 2 && a < 12).length;
  const infants = childAges.filter((a) => a < 2).length;
  return { adults: baseAdults + extraAdults, children, infants };
}

// "2 adults, 2 children (8, 8 years)" -- explicit words + real ages, never
// a bare "2+2"/total count, so it's unambiguous this is one room's
// occupancy. Reuses the same pluralized labels formatCartOccupancy (Stage
// 5) already established, so the two summaries can never phrase the same
// counts differently.
function formatSearchOccupancy(
  t: TFunction,
  occupancy: { adults: number; children: number; infants: number },
  childBucketAges: number[]
): string {
  const parts = [t("roomTypeCard.adultsLabel", { count: occupancy.adults })];
  if (occupancy.children > 0) parts.push(t("roomTypeCard.childrenLabel", { count: occupancy.children }));
  if (occupancy.infants > 0) parts.push(t("roomTypeCard.infantsLabel", { count: occupancy.infants }));
  let text = parts.join(", ");
  if (childBucketAges.length > 0) {
    text += ` (${childBucketAges.join(", ")} ${t("page.yearsShort")})`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Small fetch helper — attaches the real JWT, throws with the backend's
// own error detail on failure (Hotel/Contract Engine's api.py maps
// ValueError -> HTTP 400 with {"detail": "..."})
// ---------------------------------------------------------------------------

// FastAPI returns TWO different shapes under "detail": a plain string for
// every deliberate HTTPException this project raises, but a LIST of
// {loc, msg, ...} objects for a 422 request-validation failure. The old code
// assigned either straight into `new Error(detail)`, so a 422 surfaced to the
// agent as the literal text "[object Object]" -- which is exactly what a real
// booking submit showed after a stray keystroke turned a flight year into
// "122029". Kept language-neutral (English) for the same reason the caller's
// own comment gives: this is module scope, with no safe `t()` to call.
function formatApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const lines = detail
      .map((entry) => {
        const e = entry as { loc?: unknown; msg?: unknown };
        // Drop FastAPI's leading "body"/"query" segment -- it names the
        // request part, not anything the agent can act on.
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
    // Module-scope helper -- can't use the useTranslation() hook, and can't
    // safely call the ambient i18n singleton's t() either: DateRangePicker
    // (this file) is also rendered inside AdminPanel.tsx via an
    // I18nextProvider-scoped English-only instance (see Reservations.tsx's
    // fetchJson for the full reasoning). Kept language-neutral (English)
    // instead of translated; this generic fallback almost never surfaces
    // since every real backend error path already returns {"detail": "..."}.
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

// ---------------------------------------------------------------------------
// Guest counter control
// ---------------------------------------------------------------------------

// The three fields of the main search bar share one look: a white, bordered
// box of one height, our gold on hover/focus. Tailwind utilities beat the
// legacy global input/select CSS (cascade layer), which is why the resets
// (border, padding, shadow) are spelled out where an input sits inside.
const SEARCH_FIELD_CLASS =
  "flex h-14 w-full appearance-none items-center gap-3 rounded-xl border border-ink/15 bg-white px-4 text-left text-base transition-colors hover:border-gold/60 focus:outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/25";
const SEARCH_FIELD_OPEN_CLASS = "border-gold ring-2 ring-gold/20";

// Guests: one field showing the party ("2 adults · 1 child"); the counters
// and the children's ages open beneath it. Same state and handlers as the
// two counters it replaces -- only how they are presented changed.
function GuestsPicker({
  adults,
  childAges,
  onAdultsChange,
  onChildCountChange,
  onChildAgeChange,
}: {
  adults: number;
  childAges: number[];
  onAdultsChange: (value: number) => void;
  onChildCountChange: (value: number) => void;
  onChildAgeChange: (index: number, age: number) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary = [
    t("roomTypeCard.adultsLabel", { count: adults }),
    childAges.length > 0 ? t("roomTypeCard.childrenLabel", { count: childAges.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={summary}
        className={`${SEARCH_FIELD_CLASS} ${open ? SEARCH_FIELD_OPEN_CLASS : ""}`}
      >
        <IconUsers className="h-5 w-5 shrink-0 text-gold-deep" />
        <span className="min-w-0 flex-1 truncate text-ink">{summary}</span>
        <IconChevronRight className={`h-4 w-4 shrink-0 text-slate/40 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-ink/10 bg-white p-5 shadow-lg">
          <GuestStepper
            label={t("page.adultsLabel")}
            hint={t("page.adultsHint")}
            value={adults}
            min={1}
            onChange={onAdultsChange}
          />
          <div className="my-3 h-px bg-ink/10" />
          <GuestStepper
            label={t("page.childrenLabel")}
            hint={t("page.childrenHint")}
            value={childAges.length}
            min={0}
            onChange={onChildCountChange}
          />
          {childAges.length > 0 && (
            <div className="mt-3 space-y-2 rounded-xl bg-sand/50 p-3">
              {childAges.map((age, i) => (
                <label key={i} className="flex items-center justify-between gap-3">
                  <span className="whitespace-nowrap text-sm text-slate/80">{t("page.childAgeLabel", { index: i + 1 })}</span>
                  <select
                    value={age}
                    onChange={(e) => onChildAgeChange(i, Number(e.target.value))}
                    className="w-28 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-gold focus:shadow-none focus:outline-none"
                  >
                    {Array.from({ length: 18 }, (_, a) => (
                      <option key={a} value={a}>
                        {a === 0 ? t("page.ageUnderOne") : t("page.ageOption", { count: a })}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full appearance-none rounded-full border-0 bg-ink py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            {t("page.guestsDone")}
          </button>
        </div>
      )}
    </div>
  );
}

function GuestStepper({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const stepClass =
    "flex h-9 w-9 shrink-0 appearance-none items-center justify-center rounded-full border border-ink/20 bg-white text-ink transition-colors hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate/25 disabled:hover:bg-white";
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-slate/50">{hint}</span>
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={t("counter.decreaseAriaLabel", { label })}
          className={stepClass}
        >
          <IconMinus />
        </button>
        <span className="w-5 text-center text-base font-semibold text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={t("counter.increaseAriaLabel", { label })}
          className={stepClass}
        >
          <IconPlus />
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom calendar date-range picker — no date-picker library exists in
// package.json, so this is a small, dependency-free month-grid instead of
// a heavy new install. checkIn/checkOut stay plain "YYYY-MM-DD" strings,
// the same shape every other fetch in this file already expects.
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Stage 5 -- age in whole years as of a given date, used by
// ApplicationCheckoutForm to require a child guest's real date of birth
// to match the age this room was actually priced at during search (see
// CartRoom.childAges), not just any date the agent happens to type.
function ageAtDate(dateOfBirth: string, atIso: string): number {
  const dob = parseISODate(dateOfBirth);
  const at = parseISODate(atIso);
  let age = at.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    at.getMonth() > dob.getMonth() || (at.getMonth() === dob.getMonth() && at.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Sun=0..Sat=6 -> Mon=0..Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDateRangeLabel(t: TFunction, lang: string, checkIn: string, checkOut: string): string {
  if (!checkIn && !checkOut) return t("dateRangePicker.selectDates");
  const locale = localeOf(lang);
  const fmt = (iso: string) => parseISODate(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (checkIn && checkOut) return `${fmt(checkIn)} – ${fmt(checkOut)}`;
  return `${fmt(checkIn || checkOut)} – ?`;
}

// ---------------------------------------------------------------------------
// Flexible dates (Decision 149)
//
// Until now the picker's "Flexible Dates" tab was an explicitly documented
// visual-only stub -- it flipped a pill and changed nothing else. It now
// describes a real scan: hold the stay LENGTH fixed and let the check-in
// date move across a whole month, so the agent can see which check-in
// dates are actually cheaper before committing to one.
//
// Whole-month is the ONLY mode, by explicit owner decision after seeing the
// first version: an earlier "+/- N days around a chosen date" mode was
// removed outright rather than kept as a second option. It needed an exact
// anchor date to already be picked (so it could never be the first thing an
// agent used), and a month scan answers the same question more broadly --
// "when in this period is it cheap" rather than "is the day either side of
// this one cheaper". What the agent actually needs instead is to move
// quickly between months AND YEARS, which is what the config panel is now
// built around.
//
// The config lives in the parent (HotelSearch.tsx), not in the picker,
// because the scan it drives and the price strip it produces both belong
// to the search screen -- the picker only edits it. Callers that don't
// pass onFlexibleChange (Reservations.tsx, PriceCalculator.tsx) don't get
// the tab at all, rather than getting a tab that does nothing.
// ---------------------------------------------------------------------------

export type FlexibleDatesConfig = {
  nights: number;
  // Candidates are every (not-yet-past) day of this month. "YYYY-MM".
  anchorMonth: string;
};

const DEFAULT_FLEX_NIGHTS = 7;
const FLEX_MIN_NIGHTS = 1;
// Matches the longest stay the month grid can meaningfully scan, and keeps
// a mistyped "300" from becoming a check-out a year away.
const FLEX_MAX_NIGHTS = 30;
// How far ahead the year arrows may go. Contracts in this project already
// run into 2028, and a hotel contract signed more than a few years out
// isn't a real case -- this only stops the arrows running away, it isn't a
// business rule.
const FLEX_MAX_YEARS_AHEAD = 5;

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const n = Math.round(
    (parseISODate(checkOut).getTime() - parseISODate(checkIn).getTime()) / (1000 * 60 * 60 * 24)
  );
  return n > 0 ? n : null;
}

// Seeded from whatever exact dates the agent already picked, so switching
// to the flexible tab keeps their intent (a 20-27 Nov selection becomes
// "7 nights, November") instead of resetting to an unrelated default.
// fallbackMonth is the month the calendar is currently showing, used when
// no check-in is picked yet -- so an agent who paged the calendar forward
// to December 2027 and only then switched tabs lands on December 2027,
// the mirror image of the month carrying back the other way.
function defaultFlexibleConfig(checkIn: string, checkOut: string, fallbackMonth: Date): FlexibleDatesConfig {
  return {
    nights: nightsBetween(checkIn, checkOut) ?? DEFAULT_FLEX_NIGHTS,
    anchorMonth: monthKeyOf(checkIn ? parseISODate(checkIn) : fallbackMonth),
  };
}

// Small "!" affordance that reveals an explanation on hover, focus or
// click. Built here rather than imported -- no tooltip component exists
// anywhere in this project yet, and one call site isn't enough to justify
// putting a shared one in components/ui/ (same "build only once a real,
// repeated need exists" precedent the engines follow).
function InfoTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex h-4 w-4 appearance-none items-center justify-center rounded-full border border-slate/40 bg-transparent p-0 text-[10px] font-bold leading-none text-slate/60 transition-colors hover:border-ink hover:text-ink"
      >
        !
      </button>
      {open && (
        // Left-anchored, not centred: the icon sits near the left edge of
        // the popover, so a centred tooltip would hang off it.
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-2 w-72 whitespace-pre-line rounded-lg bg-ink px-3.5 py-3 text-[11px] font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function formatFlexibleLabel(t: TFunction, lang: string, cfg: FlexibleDatesConfig): string {
  const [y, m] = cfg.anchorMonth.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(localeOf(lang), {
    month: "long",
    year: "numeric",
  });
  return `${monthLabel} · ${t("dateRangePicker.flexNightsShort", { count: cfg.nights })}`;
}

// Every (hotel, candidate check-in) row the scan endpoint returns. Mirrors
// pricing/schemas.py's DateScanResultResponse exactly.
export type DateScanRow = {
  hotel_id: number;
  hotel_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  contract_id: number | null;
  currency: string | null;
  min_total: number | null;
  room_type_id: number | null;
  room_name: string | null;
  meal_code: string | null;
  meal_name: string | null;
  available: boolean | null;
  combinations_priced: number;
  unavailable_reason: string | null;
};

// The candidate check-in dates a config expands to. Past days are dropped
// (a stay can't start yesterday), which is also why a scan of the current
// month legitimately returns fewer days than the month has.
export function buildScanCandidates(cfg: FlexibleDatesConfig): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  const [year, month] = cfg.anchorMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d);
    if (day >= today) out.push(toISODate(day));
  }
  return out;
}

// Stay length + a year/month picker, shown in place of the two-month
// calendar while the flexible tab is active. The year is navigated with
// arrows and the 12 months are always all visible, so reaching e.g. April
// 2028 is two clicks from anywhere -- the previous rolling "next 12 months"
// list could only ever reach one year ahead, and buried the month the agent
// wanted in a flat list of 12 differently-worded buttons.
function FlexibleConfigPanel({
  t,
  lang,
  cfg,
  onChange,
  onCommitMonth,
}: {
  t: TFunction;
  lang: string;
  cfg: FlexibleDatesConfig;
  onChange: (cfg: FlexibleDatesConfig) => void;
  // Double-click shortcut: take this month and go straight to the exact-date
  // calendar on it. Single click still just selects the month for a scan --
  // the two are the two real intents an agent has in front of this grid
  // ("scan this whole month" vs "I already know the month, let me pick the
  // days"), and the second used to cost a separate trip to the tab strip.
  onCommitMonth: (monthKey: string) => void;
}) {
  const locale = localeOf(lang);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [selectedYear, selectedMonth] = cfg.anchorMonth.split("-").map(Number);
  // The panel browses independently of the selection, so an agent can look
  // at another year without losing the month they already picked.
  const [viewYear, setViewYear] = useState(selectedYear);

  // The nights field is free text while being typed, committed to the
  // config only when it parses. Binding the input straight to cfg.nights
  // made it impossible to clear: an empty box reads as 0, which the clamp
  // instantly rewrote to 1, so backspacing to type "11" produced "1".
  const [nightsText, setNightsText] = useState(String(cfg.nights));
  useEffect(() => {
    setNightsText(String(cfg.nights));
  }, [cfg.nights]);

  const minYear = currentYear;
  const maxYear = currentYear + FLEX_MAX_YEARS_AHEAD;

  return (
    <div className="w-[26rem] max-w-full">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {t("dateRangePicker.flexNightsLabel")}
        <InfoTooltip label={t("dateRangePicker.flexHowItWorksAria")} text={t("dateRangePicker.flexHint")} />
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={FLEX_MIN_NIGHTS}
          max={FLEX_MAX_NIGHTS}
          value={nightsText}
          onChange={(e) => {
            const raw = e.target.value;
            setNightsText(raw);
            const parsed = Math.floor(Number(raw));
            // Commit only a value that is already in range, rather than
            // clamping every keystroke: clamping rewrote a half-typed "0"
            // (on the way to "07") into "1" under the agent's cursor.
            // Anything out of range just stays as text until blur snaps it
            // back to the value actually in effect.
            if (raw.trim() === "" || Number.isNaN(parsed)) return;
            if (parsed < FLEX_MIN_NIGHTS || parsed > FLEX_MAX_NIGHTS) return;
            if (parsed !== cfg.nights) onChange({ ...cfg, nights: parsed });
          }}
          // An empty or out-of-range box on blur snaps back to the value
          // actually in effect, so what is displayed is never a number the
          // scan isn't about to use.
          onBlur={() => setNightsText(String(cfg.nights))}
          aria-label={t("dateRangePicker.flexNightsLabel")}
          className="w-20 rounded-lg border border-ink/15 px-3 py-2 text-center text-sm font-semibold text-ink focus:border-gold focus:outline-none"
        />
        <span className="text-sm text-slate/70">{t("dateRangePicker.flexNightsUnit")}</span>
        <span className="text-xs text-slate/45">
          {t("dateRangePicker.flexNightsRange", { min: FLEX_MIN_NIGHTS, max: FLEX_MAX_NIGHTS })}
        </span>
      </div>

      <p className="mt-5 text-sm font-semibold text-ink">{t("dateRangePicker.flexMonthLabel")}</p>

      <div className="mt-2 flex items-center justify-between rounded-full bg-sand px-1.5 py-1">
        <button
          type="button"
          disabled={viewYear <= minYear}
          onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
          aria-label={t("dateRangePicker.flexPrevYear")}
          className="flex h-7 w-7 appearance-none items-center justify-center rounded-full border-0 bg-transparent text-slate transition-colors hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:text-slate/25 disabled:hover:bg-transparent"
        >
          <IconChevronLeft />
        </button>
        <span className="text-sm font-semibold text-ink">{viewYear}</span>
        <button
          type="button"
          disabled={viewYear >= maxYear}
          onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
          aria-label={t("dateRangePicker.flexNextYear")}
          className="flex h-7 w-7 appearance-none items-center justify-center rounded-full border-0 bg-transparent text-slate transition-colors hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:text-slate/25 disabled:hover:bg-transparent"
        >
          <IconChevronRight />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => {
          const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
          const label = new Date(viewYear, i, 1).toLocaleDateString(locale, { month: "short" });
          // A month entirely in the past has no candidate check-in dates at
          // all, so offering it would only ever produce an empty scan.
          const isPast = viewYear < currentYear || (viewYear === currentYear && i < currentMonth);
          const isSelected = viewYear === selectedYear && i + 1 === selectedMonth;
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => onChange({ ...cfg, anchorMonth: key })}
              // React fires both onClick calls before this; passing the key
              // explicitly makes the handoff independent of whether those
              // state writes have landed yet. select-none stops the double
              // click from highlighting the month name as text.
              onDoubleClick={() => onCommitMonth(key)}
              title={t("dateRangePicker.flexMonthDoubleClickHint")}
              className={`select-none appearance-none rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                isPast
                  ? "cursor-not-allowed border-ink/5 bg-sand/40 text-slate/25"
                  : isSelected
                    ? "border-ink bg-ink text-white"
                    : "border-ink/15 bg-white text-slate hover:border-ink/40 hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* The double-click shortcut is invisible otherwise -- an affordance
          nobody is told about is one nobody uses. */}
      <p className="mt-2.5 text-[11px] text-slate/50">{t("dateRangePicker.flexMonthDoubleClickHint")}</p>

      {/* The selection can be in a different year than the one being
          browsed, so it is always restated in full rather than left to be
          inferred from a highlight that may not even be on screen. */}
      <p className="mt-2 text-xs text-slate/70">
        {t("dateRangePicker.flexSelected", {
          value: new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString(locale, {
            month: "long",
            year: "numeric",
          }),
        })}
      </p>
    </div>
  );
}

// One month's weekday header + day grid -- shared by both panels of the
// two-month picker below. Pure rendering, all selection logic (which day
// is check-in/check-out/in-range, whether a day is clickable) stays in
// the parent, passed in already-resolved, so both panels behave
// identically with zero duplicated logic.
function MonthGrid({
  t,
  lang,
  year,
  month,
  checkInDate,
  checkOutDate,
  onDayClick,
  allowPast = false,
}: {
  t: TFunction;
  lang: string;
  year: number;
  month: number;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  onDayClick: (day: Date) => void;
  // Reservations.tsx's "By date" range (browsing past bookings) needs
  // past days selectable -- every other caller (real hotel check-in
  // search) keeps the default false, since a stay can't start in the
  // past.
  allowPast?: boolean;
}) {
  const cells = buildMonthGrid(year, month);
  const locale = localeOf(lang);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdayLabels = t("dateRangePicker.weekdays", { returnObjects: true }) as string[];

  return (
    <div className="w-72">
      <p className="text-center text-lg font-semibold capitalize text-ink">{monthLabel}</p>
      <div className="mt-4 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-slate/40">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {/* Design System v1.0: bigger cells (h-7/w-7 -> h-10/w-10), more
          vertical breathing room (gap-y-0.5 -> gap-y-1.5), larger date
          numerals (text-xs -> text-sm) -- "больше, удобнее, крупнее
          даты" from the brief. buildMonthGrid/handleDayClick/every prop
          on this component are untouched, this is styling only. */}
      <div className="mt-2 grid grid-cols-7 gap-y-1.5 text-center text-sm">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isPast = !allowPast && day < today;
          const isCheckIn = checkInDate && isSameDate(day, checkInDate);
          const isCheckOut = checkOutDate && isSameDate(day, checkOutDate);
          const isEndpoint = Boolean(isCheckIn || isCheckOut);
          // Marriott's own range look: a continuous light band spanning
          // every day between check-in/check-out (a full-width rectangle on
          // the cell itself, not a per-day circle), with only the two
          // endpoint days shown as solid filled circles sitting on top of
          // it -- not every in-range day getting its own separate dot.
          const isInRangeInclusive = Boolean(checkInDate && checkOutDate && day >= checkInDate && day <= checkOutDate);

          return (
            <div key={i} className={isInRangeInclusive ? "bg-gold/10" : ""}>
              <button
                type="button"
                disabled={isPast}
                onClick={() => onDayClick(day)}
                className={[
                  "mx-auto flex h-10 w-10 appearance-none items-center justify-center rounded-full border-0 font-medium transition-colors",
                  // isPast/isEndpoint/default each own their own
                  // background+text pair outright, never combined with a
                  // separately-listed bg-transparent/text-ink -- two
                  // utilities targeting the same CSS property fight over
                  // Tailwind's generated-stylesheet order, not the order
                  // they appear in this string (same class of bug
                  // Button.tsx's own VARIANT_CLASSES comment documents).
                  // That's exactly what made a selected day render
                  // white-on-white/invisible here: bg-transparent was
                  // silently winning over the endpoint's own bg-ink.
                  isPast
                    ? "cursor-not-allowed bg-transparent text-slate/20"
                    : isEndpoint
                      ? "bg-ink text-white hover:bg-ink"
                      : "bg-transparent text-ink hover:bg-sand",
                ].join(" ")}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  forceLang,
  size = "sm",
  allowPast = false,
  flexible,
  onFlexibleChange,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  // Decision (agent i18n): admin-only callers (e.g. PriceCalculator.tsx)
  // pass forceLang="en" for deterministic English regardless of whatever
  // language an agent elsewhere has the global i18n toggle set to.
  // Agent-facing callers (HotelSearch.tsx, Reservations.tsx) omit this and
  // follow the ambient i18n.language normally.
  forceLang?: "en" | "ru";
  // "lg" is opt-in, only used by HotelSearch.tsx's own main search bar (the
  // Marriott-style restyle) -- default "sm" keeps every other caller
  // (Reservations.tsx's date-change flow, PriceCalculator.tsx) visually
  // unchanged.
  size?: "sm" | "lg";
  // Reservations.tsx's "By date" range (browsing past applications/
  // bookings) needs past days selectable. Defaults false so every
  // existing caller (real hotel check-in search, which can never start
  // in the past) is byte-identical to before.
  allowPast?: boolean;
  // Decision 149: flexible-date mode. The config is owned by the parent
  // (the scan it drives and the price strip it renders both live there);
  // this component only edits it. A caller that omits onFlexibleChange
  // gets no Specific/Flexible tabs at all -- deliberate, since before this
  // decision every caller rendered those tabs and none of them did
  // anything at all.
  flexible?: FlexibleDatesConfig | null;
  onFlexibleChange?: (cfg: FlexibleDatesConfig | null) => void;
}) {
  const { t: ambientT, i18n: i18nInstance } = useTranslation("hotelSearch");
  const lang = forceLang ?? i18nInstance.language;
  const t = forceLang ? i18n.getFixedT(forceLang, "hotelSearch") : ambientT;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (checkIn ? parseISODate(checkIn) : new Date()));
  // Decision 149: no longer local state. The tab now reflects real parent
  // state -- "flexible" is exactly "the parent is holding a config" -- so
  // the pill can never show a mode the actual search isn't in.
  const supportsFlexible = Boolean(onFlexibleChange);
  const dateMode: "specific" | "flexible" = flexible ? "flexible" : "specific";
  const containerRef = useRef<HTMLDivElement>(null);

  function monthStartOf(anchorMonth: string): Date {
    const [y, m] = anchorMonth.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }

  // Re-anchor the calendar every time the picker is opened, so it always
  // opens on the month the current selection is actually about. Without
  // this, viewDate kept whatever month it was first initialised with: after
  // picking a date out of the flexible price calendar (which writes
  // check-in/check-out from the parent, never through this component), the
  // agent could reopen the picker and be looking at a month a year away
  // from the dates they had just chosen.
  function togglePicker() {
    if (!open) {
      if (flexible) setViewDate(monthStartOf(flexible.anchorMonth));
      else if (checkIn) setViewDate(parseISODate(checkIn));
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleDayClick(day: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!allowPast && day < today) return;

    const hasCompleteRange = checkIn && checkOut;
    if (!checkIn || hasCompleteRange) {
      onChange(toISODate(day), "");
      return;
    }
    // checkIn is set, checkOut isn't yet
    const checkInDate = parseISODate(checkIn);
    if (day > checkInDate) {
      onChange(checkIn, toISODate(day));
      setOpen(false);
    } else {
      onChange(toISODate(day), "");
    }
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  // Second panel is always the month right after the first -- Marriott's
  // own two-month pattern advances both together, one shared prev/next
  // pair framing the whole block, not two independently-navigable panels.
  const nextMonthDate = new Date(year, month + 1, 1);
  const checkInDate = checkIn ? parseISODate(checkIn) : null;
  const checkOutDate = checkOut ? parseISODate(checkOut) : null;

  return (
    <div ref={containerRef} className="relative">
      {size === "lg" ? (
        // The main search bar's field: the same white, bordered box as the
        // destination and guests fields beside it. It had no appearance
        // reset, so the browser drew it as a grey bevelled system button.
        <button
          type="button"
          onClick={togglePicker}
          aria-expanded={open}
          className={`${SEARCH_FIELD_CLASS} ${open ? SEARCH_FIELD_OPEN_CLASS : ""}`}
        >
          <IconCalendar className="h-5 w-5 shrink-0 text-gold-deep" />
          <span className={`min-w-0 flex-1 truncate ${checkIn || checkOut || flexible ? "text-ink" : "text-slate/40"}`}>
            {flexible
              ? formatFlexibleLabel(t, lang, flexible)
              : formatDateRangeLabel(t, lang, checkIn, checkOut)}
          </span>
          {!flexible && checkIn && checkOut && (nightsBetween(checkIn, checkOut) ?? 0) > 0 && (
            <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium text-gold-deep">
              {t("offer.nights", { count: nightsBetween(checkIn, checkOut) ?? 0 })}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={togglePicker}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate"
        >
          <IconCalendar className="w-4 h-4 shrink-0 text-slate/50" />
          <span className={checkIn || checkOut || flexible ? "text-slate" : "text-slate/40"}>
            {flexible
              ? formatFlexibleLabel(t, lang, flexible)
              : formatDateRangeLabel(t, lang, checkIn, checkOut)}
          </span>
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-fit rounded-2xl border border-ink/10 bg-white p-5 shadow-lg">
          {/* Marriott-style segmented control: a light gray track with the
              active tab rendered as a raised white pill, not a solid-filled
              tab against a transparent track. Rendered only where flexible
              dates are actually supported (Decision 149) -- a caller
              without onFlexibleChange never sees a tab it can't honour. */}
          {supportsFlexible && (
            <div className="mb-4 flex items-center gap-1 rounded-full bg-sand p-1">
              <button
                type="button"
                onClick={() => {
                  // Carry the flexible month over to the calendar: an agent
                  // who settled on December 2027 in flexible mode and then
                  // switches here to pick exact dates within it should land
                  // on December 2027, not back on today's month.
                  if (flexible) setViewDate(monthStartOf(flexible.anchorMonth));
                  onFlexibleChange?.(null);
                }}
                className={`flex-1 appearance-none rounded-full border-0 px-4 py-2 text-xs font-semibold transition-colors ${
                  dateMode === "specific" ? "bg-white text-ink shadow-sm" : "bg-transparent text-slate/50 hover:text-ink"
                }`}
              >
                {t("dateRangePicker.specificDates")}
              </button>
              <button
                type="button"
                onClick={() => onFlexibleChange?.(flexible ?? defaultFlexibleConfig(checkIn, checkOut, viewDate))}
                className={`flex-1 appearance-none rounded-full border-0 px-4 py-2 text-xs font-semibold transition-colors ${
                  dateMode === "flexible" ? "bg-white text-ink shadow-sm" : "bg-transparent text-slate/50 hover:text-ink"
                }`}
              >
                {t("dateRangePicker.flexibleDates")}
              </button>
            </div>
          )}

          {flexible ? (
            <FlexibleConfigPanel
              t={t}
              lang={lang}
              cfg={flexible}
              onChange={(next) => onFlexibleChange?.(next)}
              onCommitMonth={(monthKey) => {
                // Same handoff the "Точные даты" tab performs, just reached
                // in one gesture from the month itself.
                setViewDate(monthStartOf(monthKey));
                onFlexibleChange?.(null);
              }}
            />
          ) : (
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label={t("dateRangePicker.prevMonth")}
              className="mt-1 flex shrink-0 appearance-none items-center justify-center border-0 bg-transparent p-1 text-slate/50 transition-colors hover:text-ink"
            >
              <IconChevronLeft />
            </button>

            <MonthGrid
              t={t}
              lang={lang}
              year={year}
              month={month}
              checkInDate={checkInDate}
              checkOutDate={checkOutDate}
              onDayClick={handleDayClick}
              allowPast={allowPast}
            />
            <MonthGrid
              t={t}
              lang={lang}
              year={nextMonthDate.getFullYear()}
              month={nextMonthDate.getMonth()}
              checkInDate={checkInDate}
              checkOutDate={checkOutDate}
              onDayClick={handleDayClick}
              allowPast={allowPast}
            />

            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label={t("dateRangePicker.nextMonth")}
              className="mt-1 flex shrink-0 appearance-none items-center justify-center border-0 bg-transparent p-1 text-slate/50 transition-colors hover:text-ink"
            >
              <IconChevronRight />
            </button>
          </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3">
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="appearance-none border-0 bg-transparent p-0 text-sm font-medium text-slate/60 transition-colors hover:text-ink hover:underline"
            >
              {t("dateRangePicker.reset")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="appearance-none rounded-full border-0 bg-ink px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/90"
            >
              {t("dateRangePicker.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flexible-date price calendar (Decision 149)
//
// One cell per candidate check-in date, showing the cheapest bookable
// room total for a stay of the chosen length starting that day. Picking a
// cell is what ends flexible mode: it writes real check-in/check-out
// dates and hands off to the normal exact-date search, so nothing
// downstream (results, cart, checkout, booking) ever sees a "flexible"
// booking -- there is no such thing.
// ---------------------------------------------------------------------------

type FlexibleDayCell = {
  checkIn: string;
  checkOut: string;
  best: DateScanRow | null;
  // Every hotel scanned for this date, cheapest first -- shown in the
  // tooltip so a multi-hotel scan doesn't hide which hotel the headline
  // price actually belongs to.
  priced: DateScanRow[];
  reason: string | null;
};

function buildFlexibleCells(candidates: string[], rows: DateScanRow[]): FlexibleDayCell[] {
  const byDate = new Map<string, DateScanRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.check_in) ?? [];
    list.push(row);
    byDate.set(row.check_in, list);
  }
  return candidates.map((checkIn) => {
    const dayRows = byDate.get(checkIn) ?? [];
    const priced = dayRows
      .filter((r) => r.min_total !== null)
      .sort((a, b) => (a.min_total as number) - (b.min_total as number));
    return {
      checkIn,
      checkOut: dayRows[0]?.check_out ?? "",
      best: priced[0] ?? null,
      priced,
      // Only meaningful when nothing could be priced at all. Every hotel
      // agreeing on one reason reports it; a mix reports the first, since
      // the cell has room for one line.
      reason: priced.length > 0 ? null : (dayRows.find((r) => r.unavailable_reason)?.unavailable_reason ?? null),
    };
  });
}

function FlexibleResultsPanel({
  cfg,
  candidates,
  rows,
  scanning,
  scannedCount,
  error,
  multiHotel,
  onPick,
}: {
  cfg: FlexibleDatesConfig;
  candidates: string[];
  rows: DateScanRow[];
  scanning: boolean;
  scannedCount: number;
  error: string | null;
  multiHotel: boolean;
  onPick: (checkIn: string, checkOut: string) => void;
}) {
  const { t, i18n: i18nInstance } = useTranslation("hotelSearch");
  const locale = localeOf(i18nInstance.language);
  const cells = buildFlexibleCells(candidates, rows);
  const pricedCells = cells.filter((c) => c.best !== null);

  // Cheapest and dearest PER CURRENCY, never across them. With a EUR
  // contract in the system a mixed scan is now normal (Mauritius in EUR
  // beside the Maldives in USD), and ranking 6,685 EUR against 2,863 USD as
  // bare numbers would paint a "cheapest date" that no exchange rate backs
  // -- the exact mistake Balance made before Decision 193, where one summed
  // figure was stamped with the first row's currency. No conversion here
  // either: a scan spanning two currencies reports each one on its own.
  const range = new Map<string, { min: number; max: number }>();
  for (const cell of pricedCells) {
    const cur = cell.best!.currency ?? "";
    const total = cell.best!.min_total as number;
    const seen = range.get(cur);
    range.set(
      cur,
      seen === undefined
        ? { min: total, max: total }
        : { min: Math.min(seen.min, total), max: Math.max(seen.max, total) }
    );
  }

  // Green means "there is a real spread across these dates, and this is the
  // low end of it" -- so it requires max > min, the same condition the
  // savings line uses, which is what keeps the two from ever disagreeing.
  // Without that condition a currency represented by a single cell would be
  // badged cheapest against nothing (a lone EUR date beside USD ones), and a
  // month where every date costs the same would turn entirely green while
  // the savings line correctly stayed silent.
  function isCheapestCell(cell: FlexibleDayCell): boolean {
    if (cell.best === null) return false;
    const seen = range.get(cell.best.currency ?? "");
    return seen !== undefined && seen.max > seen.min && (cell.best.min_total as number) <= seen.min + 0.005;
  }

  // One entry per currency that actually varies across the scanned dates.
  // A single-currency scan produces exactly one line, identical to what this
  // rendered before.
  const savings = [...range.entries()]
    .filter(([, r]) => r.max > r.min)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cur, r]) =>
      t("flexPanel.savings", {
        amount: (r.max - r.min).toLocaleString(locale, { maximumFractionDigits: 0 }),
        currency: cur,
      })
    );

  function cellClasses(cell: FlexibleDayCell): string {
    const base =
      "flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 text-center transition-colors";
    if (cell.best === null) {
      return `${base} cursor-not-allowed border-ink/5 bg-sand/40 text-slate/30`;
    }
    return isCheapestCell(cell)
      ? `${base} cursor-pointer border-success bg-success/10 text-ink hover:bg-success/20`
      : `${base} cursor-pointer border-ink/10 bg-white text-ink hover:border-ink/40 hover:bg-sand/50`;
  }

  function cellTitle(cell: FlexibleDayCell): string {
    if (cell.best === null) {
      return cell.reason === "no_active_contract"
        ? t("flexPanel.reasonNoContract")
        : cell.reason === "no_priceable_rooms"
          ? t("flexPanel.reasonNoRooms")
          : t("flexPanel.reasonPending");
    }
    return cell.priced
      .map(
        (r) =>
          `${r.hotel_name}: ${r.currency} ${(r.min_total as number).toLocaleString(locale, {
            maximumFractionDigits: 0,
          })} — ${r.room_name}${r.available === false ? ` (${t("flexPanel.onRequest")})` : ""}`
      )
      .join("\n");
  }

  function renderCellBody(cell: FlexibleDayCell, dayLabel: string) {
    const isCheapest = isCheapestCell(cell);
    return (
      <>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate/50">{dayLabel}</span>
        {cell.best ? (
          <>
            <span className={`text-sm font-semibold ${isCheapest ? "text-success" : "text-ink"}`}>
              {(cell.best.min_total as number).toLocaleString(locale, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-slate/40">{cell.best.currency}</span>
            {multiHotel && (
              <span className="max-w-full truncate text-[10px] text-slate/50">{cell.best.hotel_name}</span>
            )}
          </>
        ) : (
          <span className="text-sm font-semibold">—</span>
        )}
      </>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold capitalize text-ink">
          {t("flexPanel.title", {
            count: cfg.nights,
            month: new Date(
              Number(cfg.anchorMonth.split("-")[0]),
              Number(cfg.anchorMonth.split("-")[1]) - 1,
              1
            ).toLocaleDateString(locale, { month: "long", year: "numeric" }),
          })}
        </h2>
        {scanning ? (
          <span className="text-xs font-medium text-slate/60">
            {t("flexPanel.progress", { done: scannedCount, total: candidates.length })}
          </span>
        ) : (
          savings.length > 0 && (
            <span className="text-xs font-medium text-success">{savings.join(" · ")}</span>
          )
        )}
      </div>

      <p className="mt-1 text-xs text-slate/60">{t("flexPanel.subtitle")}</p>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">
          <IconAlert />
          {error}
        </div>
      )}

      <MonthPriceGrid
        cfg={cfg}
        cells={cells}
        cellClasses={cellClasses}
        cellTitle={cellTitle}
        renderCellBody={renderCellBody}
        onPick={onPick}
      />

      {!scanning && pricedCells.length === 0 && !error && (
        <p className="mt-4 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t("flexPanel.nothingPriceable")}
        </p>
      )}
    </section>
  );
}

// Month mode's calendar grid -- the same cells as the window strip, but
// laid out Mon-Sun so a month reads as a calendar. Reuses buildMonthGrid
// (the exact same weekday alignment the date picker itself uses) rather
// than a second, independently-written month layout that could drift.
function MonthPriceGrid({
  cfg,
  cells,
  cellClasses,
  cellTitle,
  renderCellBody,
  onPick,
}: {
  cfg: FlexibleDatesConfig;
  cells: FlexibleDayCell[];
  cellClasses: (cell: FlexibleDayCell) => string;
  cellTitle: (cell: FlexibleDayCell) => string;
  renderCellBody: (cell: FlexibleDayCell, dayLabel: string) => React.ReactNode;
  onPick: (checkIn: string, checkOut: string) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const [year, month] = cfg.anchorMonth.split("-").map(Number);
  const grid = buildMonthGrid(year, month - 1);
  const byIso = new Map(cells.map((c) => [c.checkIn, c]));
  const weekdayLabels = t("dateRangePicker.weekdays", { returnObjects: true }) as string[];

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[38rem]">
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate/40">
          {weekdayLabels.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {grid.map((day, i) => {
            if (!day) return <span key={i} />;
            const cell = byIso.get(toISODate(day));
            if (!cell) {
              // A day of this month that isn't a candidate at all -- i.e.
              // already in the past. Rendered as an inert placeholder so
              // the calendar keeps its real shape instead of collapsing.
              return (
                <span
                  key={i}
                  className="flex flex-col items-center justify-center rounded-xl border border-ink/5 bg-sand/20 px-2 py-2.5 text-center text-[11px] text-slate/20"
                >
                  {day.getDate()}
                </span>
              );
            }
            return (
              <button
                key={i}
                type="button"
                disabled={cell.best === null}
                title={cellTitle(cell)}
                onClick={() => cell.best && onPick(cell.checkIn, cell.checkOut)}
                className={`${cellClasses(cell)} appearance-none`}
              >
                {renderCellBody(cell, String(day.getDate()))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotel result card
// ---------------------------------------------------------------------------

function RoomTypeCard({
  rt,
  expanded,
  onToggle,
  transferOptions,
  transfersTooSmall,
  transferRequired,
  transferCurrency,
  mandatoryTax,
  adults,
  childrenCount,
  infants,
  childAges,
  agentId,
  checkIn,
  checkOut,
  hotelId,
  hotelName,
  hotelCountry,
  hotelStars,
  hotelLocation,
  onAddToTrip,
  stale = false,
}: {
  stale?: boolean;
  rt: RoomTypeResult;
  expanded: boolean;
  onToggle: () => void;
  transferOptions: PricedTransferOption[];
  transfersTooSmall: number;
  transferRequired: boolean;
  transferCurrency: string | null;
  mandatoryTax?: MandatoryTax;
  adults: number;
  childrenCount: number;
  infants: number;
  // Stage 5 -- real ages behind childrenCount, carried onto CartRoom.
  childAges: number[];
  agentId: number;
  checkIn: string;
  checkOut: string;
  // Stage 5 (multi-room booking applications) -- hotel context needed to
  // build a CartRoom entry, and the callback that actually adds it to the
  // in-progress trip (owned by the top-level HotelSearch component, not
  // this card -- multiple cards across multiple hotels share one cart).
  hotelId: number;
  hotelName: string;
  hotelCountry: string;
  hotelStars?: number | null;
  hotelLocation?: string;
  onAddToTrip: (room: CartRoom) => { ok: boolean; error?: string };
}) {
  const { t, i18n: i18nInstance } = useTranslation("hotelSearch");
  const lang = i18nInstance.language;
  const [selectedMealCode, setSelectedMealCode] = useState<string | null>(null);
  const [selectedTransferType, setSelectedTransferType] = useState<string | null>(null);

  // Stage 5 (multi-room booking applications) -- "Добавить в поездку"
  // feedback, entirely local/transient: addedToTripAt just flips a
  // button label to a checkmark briefly, addToTripError surfaces the
  // client-side same-destination pre-check (the real, authoritative
  // check still runs server-side on submit).
  const [addedToTripAt, setAddedToTripAt] = useState<number | null>(null);
  const [addToTripError, setAddToTripError] = useState<string | null>(null);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  // If a transfer is mandatory (transferRequired) and there's genuinely
  // only one option to choose from, there's no real decision for the
  // agent to make -- auto-select it instead of leaving a required radio
  // unchecked. Guarded by transferOptions.length === 1 specifically (not
  // "just pick the first one") so a real choice between multiple options
  // is never silently made for the agent. Re-fires if the room type's
  // own transfer options change (e.g. a different hotel/date search).
  useEffect(() => {
    if (transferRequired && transferOptions.length === 1 && !selectedTransferType) {
      setSelectedTransferType(transferOptions[0].option.transfer_type);
    }
  }, [transferRequired, transferOptions, selectedTransferType]);

  // Decision 074: per-meal-plan-option nightly breakdown, lazy-loaded on
  // toggle -- keyed by mealCode since this component is already scoped to
  // one room type.
  const [nightlyOpen, setNightlyOpen] = useState<Record<string, boolean>>({});
  const [nightlyData, setNightlyData] = useState<Record<string, NightlyPrice[]>>({});
  const [nightlyLoading, setNightlyLoading] = useState<Record<string, boolean>>({});
  const [nightlyError, setNightlyError] = useState<Record<string, string>>({});

  async function toggleNightly(opt: MealPlanOption) {
    const isOpen = nightlyOpen[opt.mealCode] ?? false;
    if (isOpen) {
      setNightlyOpen((prev) => ({ ...prev, [opt.mealCode]: false }));
      return;
    }
    setNightlyOpen((prev) => ({ ...prev, [opt.mealCode]: true }));
    if (nightlyData[opt.mealCode] || !opt.price) return;

    const token = localStorage.getItem("token");
    if (!token) return;
    setNightlyLoading((prev) => ({ ...prev, [opt.mealCode]: true }));
    setNightlyError((prev) => {
      const next = { ...prev };
      delete next[opt.mealCode];
      return next;
    });
    try {
      const query = new URLSearchParams({
        agent_id: String(agentId),
        contract_id: String(opt.price.contract_id),
        room_net_total: String(opt.price.final_total),
        nights: String(opt.price.nights),
        room_type_id: String(rt.id),
        meal_plan_id: String(opt.price.meal_plan_id),
        check_in: checkIn,
        check_out: checkOut,
      });
      const nightly = await fetchJson<NightlyPrice[]>(
        `/pricing-engine/agent-price/nightly?${query.toString()}`,
        token
      );
      setNightlyData((prev) => ({ ...prev, [opt.mealCode]: nightly }));
    } catch (err) {
      setNightlyError((prev) => ({
        ...prev,
        [opt.mealCode]: err instanceof Error ? err.message : t("roomTypeCard.nightlyLoadFailed"),
      }));
    } finally {
      setNightlyLoading((prev) => ({ ...prev, [opt.mealCode]: false }));
    }
  }

  const cheapest = cheapestOption(rt);
  const cheapestPerNight =
    cheapest?.agentPrice && cheapest.price ? cheapest.agentPrice.agent_room_total / cheapest.price.nights : null;

  const selectedMeal = rt.options.find((o) => o.mealCode === selectedMealCode) ?? null;
  const selectedTransfer = transferOptions.find((o) => o.option.transfer_type === selectedTransferType) ?? null;
  const selectedTransferTotal = selectedTransfer?.price?.total ?? null;
  const grandTotal =
    selectedMeal?.agentPrice
      ? selectedMeal.agentPrice.agent_room_total + (selectedTransferTotal ?? 0) + (mandatoryTax?.total ?? 0)
      : null;

  // Stage 5: adds the currently-selected meal plan (+ transfer, if any) to
  // the shared trip cart. "Добавить в поездку" is the only way to book
  // from this card (the old direct "Забронировать" single-room flow was
  // removed) -- the cart is 100% client-side until checkout, no network
  // call happens here. When a transfer is mandatory, a specific option
  // must actually be selected first (real bug found live: the room was
  // silently addable to cart with transferRequired=true and no radio
  // checked, so the cart carried transferType=null with no way for the
  // agent to tell which transfer, if any, would be booked) -- the single-
  // option case never hits this block since it's auto-selected above.
  // The selected meal plan + transfer as a trip room -- shared by "Add to
  // trip" and "Copy offer", so the copied text describes exactly what would
  // be added. null (with the reason shown) when the choice is incomplete.
  function buildSelectedRoom(): CartRoom | null {
    setAddToTripError(null);
    if (!selectedMeal?.price) return null;
    if (transferRequired && !selectedTransferType) {
      setAddToTripError(t("roomTypeCard.selectTransferFirst"));
      return null;
    }
    return {
      key: `${hotelId}-${rt.id}-${selectedMealCode}-${Date.now()}`,
      hotelId,
      hotelName,
      country: hotelCountry,
      roomTypeId: rt.id,
      roomTypeName: rt.room_name,
      mealPlan: selectedMealCode!,
      mealPlanLabel: selectedMeal.mealName ?? selectedMealCode!,
      arrivalDate: checkIn,
      departureDate: checkOut,
      adults,
      children: childrenCount,
      infants,
      childAges,
      transferType: selectedTransferType,
      transferName: selectedTransfer?.option.transfer_name ?? selectedTransferType,
      transferDeclined: transferOptions.length > 0 && selectedTransferType === null,
      currency: selectedMeal.price.currency,
      grandTotal,
      hotelStars,
      hotelLocation,
      bedding: rt.bedding ?? null,
      bedType: rt.bed_type,
      bedroomCount: rt.bedroom_count ?? null,
      offers: (rt.offers ?? []).filter(
        (o) => o.discountPercent === null || (selectedMeal.price?.applied_special_offer_ids ?? []).includes(o.id),
      ),
      nights: selectedMeal.price.nights,
      roomTotal: selectedMeal.agentPrice?.agent_room_total ?? null,
      transferTotal: selectedTransferTotal,
      taxLabel: mandatoryTax?.label ?? null,
      taxTotal: mandatoryTax?.total ?? null,
    };
  }

  function handleAddToTrip() {
    const room = buildSelectedRoom();
    if (!room) return;
    const result = onAddToTrip(room);
    if (result.ok) {
      setAddedToTripAt(Date.now());
    } else {
      setAddToTripError(result.error ?? null);
    }
  }

  async function handleCopyOffer() {
    const room = buildSelectedRoom();
    if (!room) return;
    if (await copyText(buildOfferText(t, lang, [room]))) {
      setCopiedAt(Date.now());
      setTimeout(() => setCopiedAt(null), 2000);
    } else {
      setAddToTripError(t("roomTypeCard.copyFailed"));
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-ink">{rt.room_name}</h4>
          <p className="mt-0.5 text-xs text-slate/50">{t("roomTypeCard.maxGuests", { count: rt.max_occupancy })}</p>
          <p className="mt-0.5 text-xs font-medium text-gold-deep">
            {formatSearchOccupancy(t, { adults, children: childrenCount, infants }, childAges)}
          </p>
          {/* Decision 211: how this party will actually sleep -- "2 adults +
              2 children" alone does not say whether there is a bed for each.
              Falls back to the room's own bed type; says nothing when the
              hotel has described neither. */}
          {/* Decision 212: special offers for this stay -- gifts-only ones
              always, a discount only when the price really includes it. */}
          {(rt.offers ?? [])
            .filter(
              (o) =>
                o.discountPercent === null ||
                rt.options.some((opt) => (opt.price?.applied_special_offer_ids ?? []).includes(o.id)),
            )
            .map((o) => (
              <div key={o.id} className="mt-1.5 max-w-xl rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-xs text-ink">
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <IconGift className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                  <span className="font-semibold">{o.name}</span>
                  {o.code && (
                    <span className="text-slate/60">
                      · {t("roomTypeCard.offerCode")} {o.code}
                    </span>
                  )}
                  {o.discountPercent !== null && (
                    <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold text-success">
                      −{o.discountPercent}% · {t("roomTypeCard.offerInPrice")}
                    </span>
                  )}
                </p>
                {o.description && <p className="mt-0.5 leading-snug text-slate/70">{o.description}</p>}
              </div>
            ))}
          {describeSleeping(rt.bedding, rt.bed_type, lang, childrenCount, rt.bedroom_count) && (
            <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-sand/60 px-2.5 py-1.5 text-xs text-ink">
              <IconBed className="mt-px h-4 w-4 shrink-0 text-gold-deep" />
              <span>
                <span className="font-semibold">{t("roomTypeCard.bedding")}:</span>{" "}
                {describeSleeping(rt.bedding, rt.bed_type, lang, childrenCount, rt.bedroom_count)}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {rt.priceError ? (
            <span className="text-xs font-medium text-slate/50">{rt.priceError}</span>
          ) : cheapest?.price && cheapestPerNight != null ? (
            <p className="text-right">
              <span className="text-xs text-slate/50">{t("roomTypeCard.from")}</span>{" "}
              <span className="font-mono text-base font-semibold text-ink">
                {cheapest.price.currency}{" "}
                {cheapestPerNight.toLocaleString(localeOf(lang), { maximumFractionDigits: 0 })}
              </span>{" "}
              <span className="text-xs text-slate/50">{t("roomTypeCard.perNight")}</span>
            </p>
          ) : (
            <span className="text-xs font-medium text-slate/50">{t("roomTypeCard.pricesUnavailable")}</span>
          )}

          {!rt.priceError && rt.options.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand"
            >
              {expanded ? t("roomTypeCard.hideRate") : t("roomTypeCard.showRate")}
            </button>
          )}
        </div>
      </div>

      {expanded && !rt.priceError && (
        <>
          <div className="divide-y divide-ink/5 border-t border-ink/5 px-4">
            {rt.options.map((opt) => {
              const perNight =
                opt.agentPrice && opt.price ? opt.agentPrice.agent_room_total / opt.price.nights : null;
              const isSelected = selectedMealCode === opt.mealCode;
              const isNightlyOpen = nightlyOpen[opt.mealCode] ?? false;
              return (
                <div key={opt.mealCode} className="py-2.5">
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 ${
                      isSelected ? "rounded-lg bg-gold/10 px-2 py-1" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-ink">{opt.mealName ?? opt.mealCode}</span>

                    <div className="flex shrink-0 items-center gap-3">
                      {opt.price && opt.agentPrice ? (
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold text-ink">
                            {opt.price.currency}{" "}
                            {perNight!.toLocaleString(localeOf(lang), { maximumFractionDigits: 0 })}
                            <span className="ml-1 text-xs font-normal text-slate/50">{t("roomTypeCard.perNight")}</span>
                          </p>
                          <p className="text-[11px] text-slate/50">
                            {t("roomTypeCard.totalForNights", { count: opt.price.nights })} {opt.price.currency}{" "}
                            {opt.agentPrice.agent_room_total.toLocaleString(localeOf(lang))}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate/50">
                          {opt.priceError ?? t("roomTypeCard.priceUnavailable")}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!opt.price}
                        onClick={() => setSelectedMealCode(opt.mealCode)}
                        className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${
                          isSelected ? "bg-gold text-white" : "bg-ink text-white"
                        }`}
                      >
                        {isSelected ? t("roomTypeCard.selected") : t("roomTypeCard.select")}
                      </button>
                    </div>
                  </div>

                  {opt.price && opt.price.nights > 1 && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => toggleNightly(opt)}
                        className="appearance-none border-0 bg-transparent p-0 text-xs font-medium text-gold-deep underline decoration-dotted hover:text-gold-deep/70"
                      >
                        {isNightlyOpen ? t("roomTypeCard.hideNightlyPrices") : t("roomTypeCard.showNightlyPrices")}
                      </button>

                      {isNightlyOpen && (
                        <div className="mt-1.5 rounded-lg border border-ink/10 bg-sand/30 p-2.5">
                          {nightlyLoading[opt.mealCode] && (
                            <p className="text-xs text-slate/50">{t("roomTypeCard.loading")}</p>
                          )}
                          {nightlyError[opt.mealCode] && (
                            <p className="text-xs text-danger">{nightlyError[opt.mealCode]}</p>
                          )}
                          {nightlyData[opt.mealCode] && (
                            <div className="space-y-0.5">
                              {nightlyData[opt.mealCode].map((n) => (
                                <div
                                  key={n.date}
                                  className="flex items-center justify-between gap-3 text-xs text-slate/70"
                                >
                                  <span>
                                    {new Date(n.date).toLocaleDateString(localeOf(lang))}
                                    {n.discount_applied && (
                                      <span className="ml-1.5 inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                                        -{n.discount_percent}%
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono font-medium text-ink">
                                    {opt.price!.currency}{" "}
                                    {n.final_price.toLocaleString(localeOf(lang), { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {(transferOptions.length > 0 || transfersTooSmall > 0) && (
            <div className="border-t border-ink/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate/50">{t("roomTypeCard.transfer")}</span>
                {transferRequired && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    {t("roomTypeCard.mandatoryChoice")}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-2.5">
                {/* Decision 196: "no transfer" is a real, chosen outcome, not
                    the absence of a decision. On many destinations guests take
                    a taxi themselves or have a transfer arranged elsewhere, and
                    before this the agent could only ever ADD a transfer -- once
                    a radio was picked there was no way back to none, and a
                    never-touched block was indistinguishable from a deliberate
                    "they're making their own way". Hidden when the contract
                    mandates a transfer, where declining it is not on offer. */}
                {!transferRequired && (
                  <div>
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`transfer-${rt.id}`}
                          checked={selectedTransferType === null}
                          onChange={() => setSelectedTransferType(null)}
                          className="h-4 w-4 accent-gold"
                        />
                        <span className="text-ink">{t("roomTypeCard.noTransfer")}</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate/50">—</span>
                    </label>
                    <p className="pl-6 text-[11px] leading-relaxed text-slate/50">
                      {t("roomTypeCard.noTransferHint")}
                    </p>
                  </div>
                )}
                {transferOptions.map((opt) => {
                  // Decision 059: use the API's real, final post-discount
                  // subtotals directly -- a SpecialOfferTransferDiscount's
                  // applies_to_children flag can make the discount apply only
                  // to adults, so it's no longer safe to assume one uniform
                  // factor across every bucket (Decision 058's original
                  // reconstruction approach, now removed). Falls back to the
                  // raw catalog subtotal only when opt.price is unavailable
                  // (a priceError case), matching the pre-existing behavior
                  // there.
                  const adultTotal = opt.price ? opt.price.adult_total : opt.option.price_adult * adults;
                  const childTotal = opt.price ? opt.price.child_total : opt.option.price_child * childrenCount;
                  const infantTotal = opt.price ? opt.price.infant_total : (opt.option.price_infant ?? 0) * infants;
                  return (
                    <div key={opt.option.id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`transfer-${rt.id}`}
                            disabled={!opt.price}
                            checked={selectedTransferType === opt.option.transfer_type}
                            onChange={() => setSelectedTransferType(opt.option.transfer_type)}
                            className="h-4 w-4 accent-gold disabled:cursor-not-allowed"
                          />
                          <span className="text-ink">
                            {opt.option.transfer_name ?? opt.option.transfer_type}
                            {/* Decision 197: state the capacity on the option
                                itself. The agent is choosing a car, and "up to
                                4" is the fact that decides it. */}
                            {/* Decision 198: when a car also caps adults, say
                                both numbers. "до 4 гост." alone would read as
                                "any four people", which is exactly the wrong
                                impression for a sedan that refuses 3 adults. */}
                            {opt.option.max_passengers != null && (
                              <span className="ml-1.5 text-[11px] text-slate/50">
                                {opt.option.max_adults != null
                                  ? t("roomTypeCard.upToGuestsAndAdults", {
                                      guests: opt.option.max_passengers,
                                      adults: opt.option.max_adults,
                                    })
                                  : t("roomTypeCard.upToGuests", { count: opt.option.max_passengers })}
                              </span>
                            )}
                          </span>
                        </span>
                        {opt.price ? (
                          opt.price.total === 0 ? (
                            // A special-offer transfer discount can reach 100% (e.g.
                            // Siyam World's SWJ26 free-seaplane tier at 7+ nights) —
                            // $0 must never look like "no price computed" or be
                            // confused with the priceError branch below, so it gets
                            // its own explicit "included free" badge instead of a
                            // bare "USD 0" that's easy to misread as a glitch.
                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                              {t("roomTypeCard.includedFree")}
                            </span>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-ink">
                              {transferCurrency} {opt.price.total.toLocaleString(localeOf(lang))}
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] font-medium text-slate/50">
                            {opt.priceError ?? t("roomTypeCard.priceUnavailable")}
                          </span>
                        )}
                      </label>
                      <p className="pl-6 text-[11px] leading-relaxed text-slate/50">
                        {/* Decision 196: a car's fare has no per-guest split to
                            show. Rendering the per-person lines here would print
                            "2 adults — 0" beside a 220 charge, which reads as a
                            bug; the honest line says what it is, one vehicle,
                            round trip, whoever rides in it. */}
                        {isPerVehicle(opt) ? (
                          t("roomTypeCard.perVehicleLine", {
                            currency: transferCurrency,
                            amount: (opt.price ? opt.price.total : (opt.option.price_per_vehicle ?? 0)).toLocaleString(
                              localeOf(lang)
                            ),
                          })
                        ) : (
                          <>
                            {renderTransferBucketLine(t, lang, adults, "roomTypeCard.adultsLabel", adultTotal, transferCurrency)}
                            {childrenCount > 0 && (
                              <>
                                <br />
                                {renderTransferBucketLine(t, lang, childrenCount, "roomTypeCard.childrenLabel", childTotal, transferCurrency)}
                              </>
                            )}
                            {infants > 0 && opt.option.price_infant != null && (
                              <>
                                <br />
                                {renderTransferBucketLine(t, lang, infants, "roomTypeCard.infantsLabel", infantTotal, transferCurrency)}
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
                {/* Decision 197: say why an option is missing. Filtering the
                    list silently would make a contract that sells four
                    transfers look like it sells none to a party of six. */}
                {transfersTooSmall > 0 && (
                  <p className="text-[11px] leading-relaxed text-warning">
                    {t("roomTypeCard.transfersTooSmall", {
                      count: transfersTooSmall,
                      // Decision 198: the reason can be the total OR the adult
                      // count, so the message names the party rather than
                      // asserting which limit was breached.
                      summary: [
                        t("roomTypeCard.adultsLabel", { count: adults }),
                        childrenCount > 0 ? t("roomTypeCard.childrenLabel", { count: childrenCount }) : null,
                        infants > 0 ? t("roomTypeCard.infantsLabel", { count: infants }) : null,
                      ]
                        .filter(Boolean)
                        .join(", "),
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {mandatoryTax && (
            <div className="border-t border-ink/5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate/50">
                  {mandatoryTax.label ?? t("roomTypeCard.mandatoryTaxDefaultLabel")}
                </span>
                <span className="font-mono text-xs font-semibold text-ink">
                  {mandatoryTax.currency} {mandatoryTax.total.toLocaleString(localeOf(lang))}
                </span>
              </div>
              <p className="pl-0 text-[11px] leading-relaxed text-slate/50">
                {t("roomTypeCard.chargeableGuestsLabel", { count: mandatoryTax.chargeable_guests })} × {mandatoryTax.currency}{" "}
                {mandatoryTax.rate_per_person_per_night.toLocaleString(localeOf(lang))}
                {t("roomTypeCard.perNight")}{" "}
                {t("roomTypeCard.nightsMultiplier", { count: mandatoryTax.nights })}
              </p>
            </div>
          )}

          {grandTotal != null && (
            <div className="border-t border-ink/10 bg-sand/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                {/* Decision 196: name only what is actually in this figure.
                    The label used to read "accommodation + transfer" always,
                    including on St Regis, which has no transfer in its price at
                    all -- reported live. Built from the parts that are really
                    summed, so it stays true when a transfer is declined, when
                    none is offered, and when a mandatory tax applies. */}
                <span className="text-sm font-medium text-ink">
                  {t("roomTypeCard.grandTotalLabel", {
                    parts: [
                      t("roomTypeCard.partAccommodation"),
                      selectedTransferTotal != null ? t("roomTypeCard.partTransfer") : null,
                      mandatoryTax ? t("roomTypeCard.partTax") : null,
                    ]
                      .filter(Boolean)
                      .join(" + "),
                  })}
                </span>
                <span className="font-mono text-base font-semibold text-ink">
                  {selectedMeal!.price!.currency} {grandTotal.toLocaleString(localeOf(lang))}
                </span>
              </div>

              {/* Booking only happens through the trip cart / "Оформить
                  заявку" flow now -- the old direct "Забронировать"
                  single-room booking button was removed (project owner's
                  explicit instruction, 2026-07-27): having two separate
                  ways to book was confusing, so only add-to-cart remains. */}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleAddToTrip}
                  disabled={stale}
                  className="w-full rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 sm:flex-1"
                >
                  {addedToTripAt ? t("roomTypeCard.addedToTrip") : t("roomTypeCard.addToTrip")}
                </button>
                {/* One click instead of retyping room, meal, transfer and
                    every figure into WhatsApp by hand. */}
                <button
                  type="button"
                  onClick={handleCopyOffer}
                  disabled={stale}
                  className="w-full rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {copiedAt ? t("roomTypeCard.copied") : t("roomTypeCard.copyOffer")}
                </button>
              </div>
              {addToTripError && (
                <p className="mt-2 text-xs font-medium text-danger">{addToTripError}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Design System v1.0, block A: one row of the left-hand hotel column in the
// three-column layout. Deliberately carries only what's needed to CHOOSE a
// hotel -- name, stars, location, cheapest per-night price -- with every
// room/meal/transfer decision left to the centre column. Reuses
// cheapestPerNightForHotel, the same figure HotelCard's own summary shows,
// so the list and the detail can never quote different "from" prices.
function HotelListRow({
  hotel,
  gradient,
  selected,
  onSelect,
}: {
  hotel: HotelResult;
  gradient: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const perNight = cheapestPerNightForHotel(hotel);
  const location = [hotel.island, hotel.city, hotel.country].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={`flex w-full appearance-none items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        selected ? "border-gold bg-gold/10" : "border-transparent bg-transparent hover:bg-sand/60"
      }`}
    >
      <span className={`h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br ${gradient}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-semibold text-ink">{hotel.hotel_name}</span>
        {hotel.star_rating != null && (
          <span className="block text-[10px] tracking-[0.2em] text-gold">{"★".repeat(hotel.star_rating)}</span>
        )}
        <span className="block truncate text-xs text-slate/55">{location || "—"}</span>
        {!hotel.contractId ? (
          <span className="mt-1 inline-block rounded-full bg-slate/10 px-2 py-0.5 text-[10px] font-medium text-slate/60">
            {t("hotelCard.noActiveContract")}
          </span>
        ) : (
          perNight && (
            <span className="mt-0.5 block text-xs text-slate/60">
              {t("roomTypeCard.from")}{" "}
              <span className="font-mono text-sm font-semibold text-ink">
                {perNight.currency} {perNight.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>{" "}
              {t("roomTypeCard.perNight")}
            </span>
          )
        )}
      </span>
    </button>
  );
}

function HotelCard({
  hotel,
  gradient,
  adults,
  childrenCount,
  infants,
  childAges,
  agentId,
  checkIn,
  checkOut,
  onAddToTrip,
  inColumnLayout = false,
  stale = false,
}: {
  // True when the form changed after this search: booking and copying are
  // blocked until the agent searches again.
  stale?: boolean;
  hotel: HotelResult;
  gradient: string;
  adults: number;
  childrenCount: number;
  infants: number;
  // Stage 5 -- the real ages behind childrenCount (see CartRoom.childAges).
  childAges: number[];
  agentId: number;
  checkIn: string;
  checkOut: string;
  onAddToTrip: (room: CartRoom) => { ok: boolean; error?: string };
  // Block A: true when this card is the centre column of the three-column
  // layout. The only thing it changes is the colour placeholder, which at
  // lg+ is pure duplication -- the same gradient already identifies this
  // hotel in the left-hand list, one row above the eye -- and it costs the
  // centre column ~300px of width that the actual room/meal/transfer
  // decisions need. Hidden at lg+ only: below lg there is no left column,
  // so the placeholder still does its job and stays.
  inColumnLayout?: boolean;
}) {
  const { t } = useTranslation("hotelSearch");
  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Set<number>>(new Set());
  const location = [hotel.island, hotel.city, hotel.country].filter(Boolean).join(", ");
  const perNight = cheapestPerNightForHotel(hotel);
  // Distinct meal-plan codes across every room type -- already-fetched
  // data (rt.options), never a new fetch. Order-preserving dedupe (not a
  // Set spread) so the badge row always lists a room type's first-seen
  // meal codes in the same order the room types themselves sort in.
  const mealCodes: string[] = [];
  for (const rt of hotel.roomTypes) {
    for (const opt of rt.options) {
      if (!mealCodes.includes(opt.mealCode)) mealCodes.push(opt.mealCode);
    }
  }

  function toggleRoomType(id: number) {
    setExpandedRoomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      {/* Requested live: the gradient placeholder used to stretch (sm:h-auto
          under the row's default align-items:stretch) to match the FULL
          card height, including every room type listed below -- a huge
          dark block running the whole card. Fixed height + sm:items-start
          on the row keeps it sized to roughly the header (name/location/
          summary) area only, not the room list underneath. */}
      <div className="flex flex-col sm:flex-row sm:items-start">
        {/* Requested live: the image block used to sit flush against the
            card's own edges, so the card's `overflow-hidden rounded-2xl`
            clipped exactly ONE of its corners (top-left) round while the
            other three stayed square -- three corners matching, one not.
            Inset by the same 24px the content column's own p-6 uses and
            given its own uniform rounded-2xl, so all four corners are
            genuinely identical instead of depending on which card edge
            each one happens to touch. */}
        <div
          className={`relative m-6 mb-0 h-40 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br sm:mr-0 sm:h-32 sm:w-48 ${
            inColumnLayout ? "lg:hidden" : ""
          } ${gradient}`}
        >
          {hotel.star_rating != null && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink">
              {"★".repeat(hotel.star_rating)} {hotel.star_rating}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 p-6 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-display text-xl font-semibold text-ink">{hotel.hotel_name}</h3>
              <p className="mt-1 flex items-center gap-1 truncate text-sm text-slate/60">
                <IconPin className="h-3.5 w-3.5 shrink-0 text-slate/40" />
                {location || "—"}
              </p>
            </div>
            {!hotel.contractId ? (
              <span className="shrink-0 rounded-full bg-slate/10 px-2.5 py-1 text-xs font-medium text-slate/60">
                {t("hotelCard.noActiveContract")}
              </span>
            ) : (
              perNight && (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate/40">
                    {t("roomTypeCard.from")}
                  </p>
                  <p className="font-mono text-2xl font-semibold text-ink">
                    {perNight.currency}{" "}
                    {perNight.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px] text-slate/40">{t("roomTypeCard.perNight")}</p>
                </div>
              )
            )}
          </div>

          {hotel.contractId && (hotel.roomTypes.length > 0 || hotel.transferOptions.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {hotel.roomTypes.length > 0 && (
                <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-slate/70">
                  {t("hotelCard.roomOptions", { count: hotel.roomTypes.length })}
                </span>
              )}
              {mealCodes.map((code) => (
                <span key={code} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-slate/70">
                  {code}
                </span>
              ))}
              {hotel.transferOptions.length > 0 && (
                <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold-deep">
                  {t("hotelCard.transferAvailable")}
                </span>
              )}
            </div>
          )}

        </div>
      </div>
      <div className="px-6 pb-6 pt-5">
        {hotel.roomTypes.length === 0 ? (
          <p className="text-sm text-slate/50">{t("hotelCard.noRoomTypes")}</p>
        ) : (
          <div className="space-y-3">
            {sortRoomTypesByPrice(hotel.roomTypes).map((rt) => (
              <RoomTypeCard
                key={rt.id}
                rt={rt}
                expanded={expandedRoomTypes.has(rt.id)}
                onToggle={() => toggleRoomType(rt.id)}
                transferOptions={hotel.transferOptions}
                transfersTooSmall={hotel.transfersTooSmall}
                transferRequired={hotel.transferRequired}
                transferCurrency={hotel.transferCurrency}
                mandatoryTax={hotel.mandatoryTax}
                adults={adults}
                childrenCount={childrenCount}
                infants={infants}
                childAges={childAges}
                agentId={agentId}
                checkIn={checkIn}
                checkOut={checkOut}
                hotelId={hotel.id}
                hotelName={hotel.hotel_name}
                hotelCountry={hotel.country}
                hotelStars={hotel.star_rating}
                hotelLocation={location}
                onAddToTrip={onAddToTrip}
                stale={stale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip cart (Stage 5 -- multi-room booking applications)
// ---------------------------------------------------------------------------

// "2 adults, 1 child" style summary for one cart room, reusing the exact
// same pluralized labels roomTypeCard's own transfer breakdown already
// uses (roomTypeCard.adultsLabel/childrenLabel/infantsLabel) rather than
// inventing a second set of guest-count strings.
function formatCartOccupancy(t: TFunction, room: CartRoom): string {
  const parts = [t("roomTypeCard.adultsLabel", { count: room.adults })];
  if (room.children > 0) parts.push(t("roomTypeCard.childrenLabel", { count: room.children }));
  if (room.infants > 0) parts.push(t("roomTypeCard.infantsLabel", { count: room.infants }));
  return parts.join(", ");
}

// Floating summary of the in-progress trip cart -- every room the agent
// has added via "Добавить в поездку" across any hotel result on this
// page, not yet submitted. Purely a list/remove view; the actual
// guest-entry/submit step is ApplicationCheckoutForm below.
function CartPanel({
  cart,
  onRemove,
  onCheckout,
  variant = "floating",
}: {
  cart: CartRoom[];
  onRemove: (key: string) => void;
  onCheckout: () => void;
  // "pinned" -- the new persistent right-column presentation on large
  // screens (requested live): always expanded (no show/hide toggle,
  // there's nothing to collapse when the whole point is "always
  // visible"), and rendered as a normal static block instead of a fixed
  // bottom-right overlay, so the caller's own grid/sticky positioning
  // controls where it sits. "floating" (default) is the exact original
  // behavior, byte-identical, used below the lg breakpoint. The actual
  // list/remove/checkout logic is shared, untouched either way.
  variant?: "floating" | "pinned";
}) {
  const { t, i18n: i18nInstance } = useTranslation("hotelSearch");
  const [open, setOpen] = useState(false);
  const pinned = variant === "pinned";
  const showList = pinned || open;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // Every room in the trip as one message: numbered rooms, each with its own
  // total, then the grand total.
  async function handleCopyAll() {
    const ok = await copyText(buildOfferText(t, i18nInstance.language, cart));
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  const panel = (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl">
      {pinned ? (
        <div className="border-0 bg-ink px-5 py-3.5 text-white">
          <span className="text-sm font-medium">{t("cart.title", { count: cart.length })}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full appearance-none items-center justify-between border-0 bg-ink px-5 py-3.5 text-left text-white"
        >
          <span className="text-sm font-medium">{t("cart.title", { count: cart.length })}</span>
          <span className="text-xs text-white/70">{open ? t("cart.hide") : t("cart.show")}</span>
        </button>
      )}

      {/* Requested live: the checkout action sits directly under the
          header, ABOVE the room list -- with a real multi-room trip the
          list grows tall enough to push a bottom-anchored button out of
          view, so the one action that finishes the flow was the first
          thing to disappear. Same button/handler/disabled guard as
          before, only its position in the panel changed. */}
      <div className={showList ? "border-b border-ink/10 p-3" : "p-3"}>
        <button
          type="button"
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {t("cart.checkout")}
        </button>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={handleCopyAll}
            className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand"
          >
            {copyState === "copied"
              ? t("cart.copied")
              : copyState === "failed"
                ? t("cart.copyFailed")
                : cart.length === 1
                  ? t("cart.copyOne")
                  : t("cart.copyAll", { count: cart.length })}
          </button>
        )}
      </div>

      {showList &&
        (cart.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate/50">{t("cart.empty")}</p>
        ) : (
          <div className={pinned ? "divide-y divide-ink/5" : "max-h-72 overflow-y-auto divide-y divide-ink/5"}>
            {cart.map((room) => (
              <div key={room.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{room.hotelName}</p>
                  <p className="text-xs text-slate/60">
                    {room.roomTypeName} · {room.mealPlanLabel}
                    {room.transferName ? ` · ${room.transferName}` : ""}
                    {room.transferDeclined ? ` · ${t("roomTypeCard.noTransfer")}` : ""}
                  </p>
                  <p className="text-xs text-slate/50">
                    {room.arrivalDate} – {room.departureDate}
                  </p>
                  <p className="text-xs text-slate/50">{formatCartOccupancy(t, room)}</p>
                  {room.grandTotal != null && (
                    <p className="mt-0.5 font-mono text-xs font-semibold text-ink">
                      {room.currency} {room.grandTotal.toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(room.key)}
                  aria-label={t("cart.remove")}
                  className="shrink-0 appearance-none rounded-md border-0 bg-transparent p-1 text-slate/40 transition-colors hover:bg-sand hover:text-danger"
                >
                  <IconMinus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  );

  if (pinned) return panel;

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[calc(100%-2rem)] max-w-sm sm:right-6 sm:bottom-6">{panel}</div>
  );
}

// Guest entry (once per trip, not per room) + per-room guest assignment +
// submit to POST /booking-engine/applications. Confirmed directly with the
// project owner: same guests throughout one application; a different
// guest set means a separate, new application -- so this form collects
// exactly one flat guest list, then asks which room(s) each guest
// occupies.
// Stage 5 -- one room's worth of guest entry within the checkout form.
// Deliberately per-room, not one shared list with checkboxes (the
// project owner's explicit instruction): each room is numbered
// ("Номер 1"), shows its own full details, then its own adult/child name
// fields directly below. A child's date of birth is REQUIRED and must
// reconcile with the exact age that room was priced at during search
// (CartRoom.childAges) -- otherwise an agent could search with a young,
// cheap/free age bracket and then quietly enter an older child's real
// details at checkout, after the price was already locked in. The same
// real person appearing in more than one room (e.g. a multi-leg trip)
// still only becomes one Guest row -- buildGuestsPayload below dedupes
// by exact name (+ date of birth for children) across rooms.
type RoomGuestEntry = {
  adults: {
    firstName: string;
    lastName: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
  }[];
  children: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
  }[];
};

// One flight leg's worth of trip-level detail -- entered once per
// application (not per room), same shape as Booking's own
// arrival_flight_number/date/time columns. Needed to actually arrange an
// airport transfer, which cannot be scheduled from a room/rate alone.
type FlightDetails = {
  arrivalFlightNumber: string;
  arrivalFlightDate: string;
  arrivalFlightTime: string;
  departureFlightNumber: string;
  departureFlightDate: string;
  departureFlightTime: string;
};

const EMPTY_FLIGHT: FlightDetails = {
  arrivalFlightNumber: "",
  arrivalFlightDate: "",
  arrivalFlightTime: "",
  departureFlightNumber: "",
  departureFlightDate: "",
  departureFlightTime: "",
};

function hasAnyFlightDetail(f: FlightDetails): boolean {
  return Object.values(f).some((v) => v.trim() !== "");
}

// Decision 150: a traveller's stable identity across re-renders of the
// flight step. Deliberately the SAME triple buildGuestsPayload's own
// findOrAdd dedupes on -- keying per-guest flights by position in the flat
// list would silently reassign somebody else's flight if the agent went
// Back and edited a name, since that can reorder the list.
function travellerKey(g: { firstName: string; lastName: string; dateOfBirth?: string }): string {
  return `${g.firstName.trim().toLowerCase()}|${g.lastName.trim().toLowerCase()}|${g.dateOfBirth ?? ""}`;
}

// The six flight inputs, extracted so the shared party flight and each
// individual traveller's override are literally the same control -- they
// have to accept exactly the same data, and two hand-maintained copies of
// six inputs would drift.
//
// Split into two captioned legs rather than one flat 3x2 grid: a bare grid
// of six boxes gave no clue which row was arrival and which was departure
// (the date/time inputs show only "dd/mm/yyyy" and "--:--", so the flight
// number placeholder was the sole hint), and that ambiguity gets worse now
// that this same block can appear four or five times down one step.
const FLIGHT_INPUT_CLASS =
  "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none";

// ---------------------------------------------------------------------------
// Flight time/date entry (Decision 150, third pass)
//
// `<input type="time">` renders in the BROWSER's locale, so on this machine
// it demands an AM/PM segment and yields "" until one is picked -- the agent
// types 09:00, sees "09:00 --", and the value silently stays empty. Worse,
// a partially-entered native time/date is `badInput`, which makes the whole
// wizard <form> invalid and blocks Submit with no visible reason ("пока не
// добавишь время PM или AM дальше не идёт").
//
// Flight times are stored as plain `String(5)` text ("08:45", "14:20" -- the
// real values already in the database), so a text field is not a workaround
// here, it is the closer fit: 24-hour, locale-independent, always yields a
// value, and no AM/PM exists to forget.
// ---------------------------------------------------------------------------

export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Empty counts as valid: a flight time is optional everywhere.
export function isValidTimeValue(value: string): boolean {
  if (!value) return true;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

// A flight date typed with a slipped keystroke ("122029" for 2029) is what
// produced the real 422 behind the "[object Object]" error. The bounds are
// deliberately wide -- this only catches nonsense, it is not a business rule
// about how far ahead a flight may be.
export function isValidFlightDateValue(value: string): boolean {
  if (!value) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 2000 && year <= 2100;
}

export function firstInvalidFlightField(f: FlightDetails): "time" | "date" | null {
  if (!isValidTimeValue(f.arrivalFlightTime) || !isValidTimeValue(f.departureFlightTime)) return "time";
  if (!isValidFlightDateValue(f.arrivalFlightDate) || !isValidFlightDateValue(f.departureFlightDate)) return "date";
  return null;
}

// Decision 153. The BACKEND is what actually refuses an impossible flight
// date (more than a year from the stay, or a return before the outbound) --
// booking/validators.py's validate_flight_dates, applied on every write path.
// These two mirror it so the agent finds out while typing instead of losing
// a filled-in wizard to a 400 on submit; the server remains the authority.
const FLIGHT_DATE_MAX_DAYS_FROM_STAY = 365;
// Owner decision (2026-08-15, superseding this file's first attempt): warn on
// ANY difference at all, 1 day upward. The original 3-day grace assumed a
// night arrival the day before check-in is so normal it isn't worth
// mentioning; the owner wants it mentioned anyway, since a one-day slip is
// also exactly what a typo looks like. It is still only a warning, so being
// told about a legitimate itinerary costs nothing.
const FLIGHT_DATE_WARN_DAYS = 0;

function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

/** Impossible — must not be submitted. Mirrors validate_flight_dates. */
export function flightDatesImpossible(
  f: FlightDetails,
  arrivalDate: string,
  departureDate: string
): { reason: "too_far" | "reversed"; days?: number } | null {
  if (f.arrivalFlightDate && arrivalDate) {
    const gap = daysApart(f.arrivalFlightDate, arrivalDate);
    if (gap > FLIGHT_DATE_MAX_DAYS_FROM_STAY) return { reason: "too_far", days: gap };
  }
  if (f.departureFlightDate && departureDate) {
    const gap = daysApart(f.departureFlightDate, departureDate);
    if (gap > FLIGHT_DATE_MAX_DAYS_FROM_STAY) return { reason: "too_far", days: gap };
  }
  if (f.arrivalFlightDate && f.departureFlightDate && f.departureFlightDate < f.arrivalFlightDate) {
    return { reason: "reversed" };
  }
  return null;
}

/** Suspicious but allowed — surfaced, never blocked. */
export function flightDatesSuspicious(
  f: FlightDetails,
  arrivalDate: string,
  departureDate: string
): number | null {
  let worst: number | null = null;
  if (f.arrivalFlightDate && arrivalDate) {
    const gap = daysApart(f.arrivalFlightDate, arrivalDate);
    if (gap > FLIGHT_DATE_WARN_DAYS && gap <= FLIGHT_DATE_MAX_DAYS_FROM_STAY) worst = gap;
  }
  if (f.departureFlightDate && departureDate) {
    const gap = daysApart(f.departureFlightDate, departureDate);
    if (gap > FLIGHT_DATE_WARN_DAYS && gap <= FLIGHT_DATE_MAX_DAYS_FROM_STAY) {
      worst = worst === null ? gap : Math.max(worst, gap);
    }
  }
  return worst;
}

// One component for both notices, used under EVERY set of flight fields —
// the common flight and each traveller's own override alike. The first
// version of this only appeared under the common block, so a per-guest
// flight could be days off the stay and say nothing at all (found by the
// owner, not by review).
//
// Amber for something inside the accepted range but worth a second look;
// red for what the server is going to refuse outright, shown here so the
// agent sees it while typing instead of on submit.
function FlightDateNotice({
  flight,
  arrivalDate,
  departureDate,
}: {
  flight: FlightDetails;
  arrivalDate: string;
  departureDate: string;
}) {
  const { t } = useTranslation("hotelSearch");
  if (!arrivalDate || !departureDate) return null;

  const impossible = flightDatesImpossible(flight, arrivalDate, departureDate);
  if (impossible) {
    return (
      <p className="mt-2.5 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
        {impossible.reason === "reversed"
          ? t("cart.flightReversed")
          : t("cart.flightTooFarFromStay", { days: impossible.days })}
      </p>
    );
  }

  const off = flightDatesSuspicious(flight, arrivalDate, departureDate);
  if (off === null) return null;
  return (
    <p className="mt-2.5 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
      {t("cart.flightFarFromStayWarning", { days: off })}
    </p>
  );
}

function TimeField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation("hotelSearch");
  // Only a COMPLETE but impossible value ("25:70") is flagged. Half-typed
  // input ("09:3" on the way to "09:30") is normal and must not turn red
  // under the cursor -- the submit-time check still catches it if the agent
  // walks away mid-entry.
  const invalid = value.length === 5 && !isValidTimeValue(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      placeholder={t("cart.timePlaceholder")}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(formatTimeInput(e.target.value))}
      className={`${FLIGHT_INPUT_CLASS} ${invalid ? "border-danger focus:border-danger" : ""}`}
    />
  );
}

function FlightLegRow({
  icon,
  label,
  numberValue,
  dateValue,
  timeValue,
  numberPlaceholder,
  onNumber,
  onDate,
  onTime,
}: {
  icon: React.ReactNode;
  label: string;
  numberValue: string;
  dateValue: string;
  timeValue: string;
  numberPlaceholder: string;
  onNumber: (v: string) => void;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate/55">
        <span className="text-gold-deep">{icon}</span>
        {label}
      </p>
      {/* Explicit column ratio, not three equal thirds: a flight number
          needs the room, a time input barely any. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.3fr_1fr_0.75fr]">
        <input
          type="text"
          placeholder={numberPlaceholder}
          value={numberValue}
          onChange={(e) => onNumber(e.target.value)}
          className={FLIGHT_INPUT_CLASS}
        />
        <input
          type="date"
          // Bounds so a slipped keystroke can't produce a six-digit year.
          // Native validation is off on this form (see the <form noValidate>
          // note), so these are a hint to the browser's own date UI; the
          // authoritative check is firstInvalidFlightField at submit.
          min="2000-01-01"
          max="2100-12-31"
          aria-label={t("cart.flightDateAria", { leg: label })}
          value={dateValue}
          onChange={(e) => onDate(e.target.value)}
          className={`${FLIGHT_INPUT_CLASS} ${
            dateValue && !isValidFlightDateValue(dateValue) ? "border-danger focus:border-danger" : ""
          }`}
        />
        <TimeField
          value={timeValue}
          onChange={onTime}
          ariaLabel={t("cart.flightTimeAria", { leg: label })}
        />
      </div>
    </div>
  );
}

function FlightFieldsGrid({
  value,
  onChange,
}: {
  value: FlightDetails;
  onChange: <K extends keyof FlightDetails>(field: K, next: string) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  return (
    <div className="flex flex-col gap-3">
      <FlightLegRow
        icon={<IconPlaneArrival />}
        label={t("cart.arrivalLeg")}
        numberPlaceholder={t("guestDetailsForm.arrivalFlightNumberPlaceholder")}
        numberValue={value.arrivalFlightNumber}
        dateValue={value.arrivalFlightDate}
        timeValue={value.arrivalFlightTime}
        onNumber={(v) => onChange("arrivalFlightNumber", v)}
        onDate={(v) => onChange("arrivalFlightDate", v)}
        onTime={(v) => onChange("arrivalFlightTime", v)}
      />
      <FlightLegRow
        icon={<IconPlaneDeparture />}
        label={t("cart.departureLeg")}
        numberPlaceholder={t("guestDetailsForm.departureFlightNumberPlaceholder")}
        numberValue={value.departureFlightNumber}
        dateValue={value.departureFlightDate}
        timeValue={value.departureFlightTime}
        onNumber={(v) => onChange("departureFlightNumber", v)}
        onDate={(v) => onChange("departureFlightDate", v)}
        onTime={(v) => onChange("departureFlightTime", v)}
      />
    </div>
  );
}

// Initials, for the per-traveller rows. Purely to give each row a fixed
// visual anchor so a list of 5 travellers scans as a list rather than as a
// wall of near-identical boxes.
function travellerInitials(firstName: string, lastName: string): string {
  const a = firstName.trim()[0] ?? "";
  const b = lastName.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

// One saved leg, read-only: "SU120 · 21 авг 2026 · 02:01". Missing pieces
// are simply left out rather than shown as "—", because a saved flight
// with only a number is a normal, valid state (the guest has the flight
// but not the exact time yet).
function FlightLegSummary({
  icon,
  label,
  number,
  date,
  time,
  lang,
}: {
  icon: React.ReactNode;
  label: string;
  number: string;
  date: string;
  time: string;
  lang: string;
}) {
  const { t } = useTranslation("hotelSearch");
  const parts = [
    number.trim(),
    date ? parseISODate(date).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short", year: "numeric" }) : "",
    time,
  ].filter(Boolean);
  return (
    <p className="flex items-center gap-2 text-xs text-ink">
      <span className="text-gold-deep">{icon}</span>
      <span className="font-medium uppercase tracking-wide text-slate/50">{label}</span>
      <span className="font-mono font-semibold">{parts.length ? parts.join(" · ") : t("cart.legNotFilled")}</span>
    </p>
  );
}

function ApplicationCheckoutForm({
  cart,
  agentId,
  onClose,
  onSuccess,
}: {
  cart: CartRoom[];
  agentId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t, i18n: i18nInstance } = useTranslation("hotelSearch");

  const [roomGuests, setRoomGuests] = useState<Record<string, RoomGuestEntry>>(() => {
    const initial: Record<string, RoomGuestEntry> = {};
    for (const room of cart) {
      initial[room.key] = {
        adults: Array.from({ length: room.adults }, () => ({
          firstName: "",
          lastName: "",
          nationality: "",
          passportNumber: "",
          passportExpiry: "",
        })),
        children: Array.from({ length: room.children }, () => ({
          firstName: "",
          lastName: "",
          dateOfBirth: "",
          nationality: "",
          passportNumber: "",
          passportExpiry: "",
        })),
      };
    }
    return initial;
  });

  const [flight, setFlight] = useState<FlightDetails>({ ...EMPTY_FLIGHT });

  function setFlightField<K extends keyof FlightDetails>(key: K, value: string) {
    setFlight((prev) => ({ ...prev, [key]: value }));
  }

  // Decision 150. "shared" is the pre-existing behaviour and stays the
  // default: one flight for the whole party, written to the application.
  // "perGuest" keeps that same common flight AND lets individual
  // travellers override it -- deliberately not "every guest must now be
  // filled in separately", because the real case is a mix (most of the
  // party together, one or two arriving on their own), and an agent
  // shouldn't have to retype the same flight five times to express it.
  // A traveller left without an override simply travels on the common
  // flight, which is exactly what a NULL guest row means server-side.
  const [flightMode, setFlightMode] = useState<"shared" | "perGuest">("shared");
  const [guestFlights, setGuestFlights] = useState<Record<string, FlightDetails>>({});
  // Which travellers' flight forms are currently OPEN. A traveller with an
  // override is either being edited (fields) or saved (a read-only summary
  // line) -- without that second state, five travellers meant five
  // permanently-open six-field forms and no way to see at a glance what had
  // actually been entered for whom.
  //
  // Purely a display state: an override that is still open when the
  // application is submitted is sent exactly the same as a saved one.
  // Deliberately so -- making Submit ignore unsaved fields would silently
  // discard work an agent could plainly see on screen.
  const [openGuestFlights, setOpenGuestFlights] = useState<Record<string, boolean>>({});

  function setGuestFlightField<K extends keyof FlightDetails>(key: string, field: K, value: string) {
    setGuestFlights((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_FLIGHT), [field]: value },
    }));
  }

  function addGuestOwnFlight(key: string) {
    setGuestFlights((prev) => ({ ...prev, [key]: prev[key] ?? { ...EMPTY_FLIGHT } }));
    setOpenGuestFlights((prev) => ({ ...prev, [key]: true }));
  }

  function removeGuestOwnFlight(key: string) {
    setGuestFlights((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOpenGuestFlights((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function saveGuestOwnFlight(key: string) {
    setOpenGuestFlights((prev) => ({ ...prev, [key]: false }));
  }

  function editGuestOwnFlight(key: string) {
    setOpenGuestFlights((prev) => ({ ...prev, [key]: true }));
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bookingNumber: string;
    rooms: { sequenceNumber: number; hotelName: string; status: string; rejectionReason: string | null }[];
  } | null>(null);

  function updateAdult(
    roomKey: string,
    index: number,
    field: "firstName" | "lastName" | "nationality" | "passportNumber" | "passportExpiry",
    value: string
  ) {
    setRoomGuests((prev) => ({
      ...prev,
      [roomKey]: {
        ...prev[roomKey],
        adults: prev[roomKey].adults.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
      },
    }));
  }

  function updateChild(
    roomKey: string,
    index: number,
    field: "firstName" | "lastName" | "dateOfBirth" | "nationality" | "passportNumber" | "passportExpiry",
    value: string
  ) {
    setRoomGuests((prev) => ({
      ...prev,
      [roomKey]: {
        ...prev[roomKey],
        children: prev[roomKey].children.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
      },
    }));
  }

  // "Copy from" guest list -- UX improvement (2026-07-29 analysis:
  // Apple HIG's "reuse previously entered data" + the real, daily-use
  // pain point of a family of 4+ split across 2 rooms, where an agent
  // was re-typing the same surname/nationality for every single
  // traveler). Deliberately copies ONLY lastName + nationality --
  // passportNumber/passportExpiry are per-person unique identifiers,
  // never safe to copy (would silently create two guests sharing one
  // passport number). Cross-room by design: iterates the whole cart, not
  // just the current room, since a family booking two rooms is the
  // exact case this exists for. Recomputed on every keystroke (cheap --
  // this list is at most a few dozen entries) so a guest becomes
  // copyable the moment their name is filled in, from anywhere else in
  // the form.
  const copyableGuests = useMemo(() => {
    const list: { key: string; label: string; lastName: string; nationality: string }[] = [];
    for (const room of cart) {
      const entry = roomGuests[room.key];
      if (!entry) continue;
      entry.adults.forEach((a, i) => {
        if (a.firstName.trim() && a.lastName.trim()) {
          list.push({
            key: `${room.key}:adult:${i}`,
            label: `${a.firstName.trim()} ${a.lastName.trim()}`,
            lastName: a.lastName,
            nationality: a.nationality,
          });
        }
      });
      entry.children.forEach((c, i) => {
        if (c.firstName.trim() && c.lastName.trim()) {
          list.push({
            key: `${room.key}:child:${i}`,
            label: `${c.firstName.trim()} ${c.lastName.trim()}`,
            lastName: c.lastName,
            nationality: c.nationality,
          });
        }
      });
    }
    return list;
  }, [cart, roomGuests]);

  function CopyFromSelect({ ownKey }: { ownKey: string }) {
    const options = copyableGuests.filter((o) => o.key !== ownKey);
    if (options.length === 0) return null;
    return (
      <select
        value=""
        onChange={(e) => {
          const opt = copyableGuests.find((o) => o.key === e.target.value);
          if (!opt) return;
          const [roomKey, type, idxStr] = ownKey.split(":");
          const idx = Number(idxStr);
          if (type === "adult") {
            updateAdult(roomKey, idx, "lastName", opt.lastName);
            if (opt.nationality) updateAdult(roomKey, idx, "nationality", opt.nationality);
          } else {
            updateChild(roomKey, idx, "lastName", opt.lastName);
            if (opt.nationality) updateChild(roomKey, idx, "nationality", opt.nationality);
          }
        }}
        className="rounded-md border border-ink/15 bg-white px-1.5 py-0.5 text-[11px] text-slate/70 focus:border-gold focus:outline-none"
      >
        <option value="">{t("cart.copyFromPlaceholder")}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // Returns an error message if this child's entered date of birth
  // doesn't reconcile with the exact age this room was priced at during
  // search -- null if it matches (or nothing's been entered yet).
  function childAgeError(room: CartRoom, index: number, dateOfBirth: string): string | null {
    if (!dateOfBirth) return null;
    const expected = room.childAges[index];
    if (expected == null) return null;
    const actual = ageAtDate(dateOfBirth, room.arrivalDate);
    if (actual !== expected) {
      return t("cart.childAgeMismatch", { expected, actual });
    }
    return null;
  }

  // UX pass (2026-07-29, item 4 -- Apple HIG's "verify values as soon as
  // people enter them, provide feedback immediately" principle,
  // researched this session): passport expiry was never validated at
  // all before this -- an already-expired passport (relative to the
  // room's own arrival date, not just "today") would silently pass
  // straight through to submission. Same shape/precedent as
  // childAgeError above (compute an inline message, null = no error),
  // deliberately not a hard requirement -- passport is still optional
  // overall, this only fires once a date is actually entered.
  function passportExpiryError(room: CartRoom, expiry: string): string | null {
    if (!expiry) return null;
    if (expiry < room.arrivalDate) {
      return t("cart.passportExpired");
    }
    return null;
  }

  // Shared by canSubmit (whole cart) and the stepped form's per-room
  // "Next" gating below -- one room's guest fields are complete/valid.
  function roomIsValid(room: CartRoom): boolean {
    const entry = roomGuests[room.key];
    if (!entry) return false;
    const adultsOk = entry.adults.every(
      (a) => a.firstName.trim() && a.lastName.trim() && !passportExpiryError(room, a.passportExpiry)
    );
    const childrenOk = entry.children.every(
      (c, i) =>
        c.firstName.trim() &&
        c.lastName.trim() &&
        c.dateOfBirth &&
        !childAgeError(room, i, c.dateOfBirth) &&
        !passportExpiryError(room, c.passportExpiry)
    );
    return adultsOk && childrenOk;
  }

  // Immediate, human-readable reason the current room isn't valid yet --
  // shown right next to "Next"/"Submit" instead of leaving an agent to
  // guess why the button is greyed out (same principle as above: give
  // feedback as soon as it's knowable, not just a silent disabled state).
  // Returns the FIRST real problem found, not an exhaustive list --
  // fixing one at a time and re-checking matches how the per-field
  // inline errors already guide the agent through the same room.
  function roomValidationMessage(room: CartRoom): string | null {
    const entry = roomGuests[room.key];
    if (!entry) return null;
    if (entry.adults.some((a) => !a.firstName.trim() || !a.lastName.trim())) {
      return t("cart.missingGuestNames");
    }
    if (entry.children.some((c) => !c.firstName.trim() || !c.lastName.trim())) {
      return t("cart.missingGuestNames");
    }
    if (entry.children.some((c) => !c.dateOfBirth)) {
      return t("cart.missingChildDateOfBirth");
    }
    for (const a of entry.adults) {
      if (passportExpiryError(room, a.passportExpiry)) return t("cart.passportExpired");
    }
    for (let i = 0; i < entry.children.length; i++) {
      if (childAgeError(room, i, entry.children[i].dateOfBirth)) return t("cart.fixChildAge");
      if (passportExpiryError(room, entry.children[i].passportExpiry)) return t("cart.passportExpired");
    }
    return null;
  }

  const canSubmit = cart.every(roomIsValid);

  // UX pass (2026-07-29, item 3 -- Booking.com/Agoda's "break complex,
  // high-error-risk steps into stages" principle, researched this
  // session): one step per room's guest entry, plus a final flight-
  // details step, instead of every room's full adult/child/passport
  // field set scrolling past all at once. `currentStep` indexes into
  // `[...cart rooms..., flightStep]` -- totalSteps = cart.length + 1.
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = cart.length + 1;
  const isFlightStep = currentStep === totalSteps - 1;
  const currentRoom = isFlightStep ? null : cart[currentStep];

  // Real, reproduced bug (Decision 131): "Next" and "Submit" occupy the
  // exact same on-screen position (same primary-button slot), so a fast
  // double-click -- normal human behavior, especially while testing --
  // lands its first click on "Next" and its second click, a moment
  // later, on whatever NOW renders in that same spot: "Submit" on the
  // newly-advanced step. The isFlightStep guard in handleSubmit doesn't
  // catch this because by the time the second click fires, the step
  // genuinely has advanced -- this isn't a bypassed step, it's a real
  // step transition happening faster than a human can visually register
  // it. Brief cooldown after any step change makes the primary button
  // un-clickable for a moment, so a reflexive second click can't land
  // on the newly-revealed element at all.
  const [navCooldown, setNavCooldown] = useState(false);
  function goToStep(updater: (step: number) => number) {
    setCurrentStep(updater);
    setNavCooldown(true);
    setTimeout(() => setNavCooldown(false), 400);
  }

  // Flattens every room's own guest entries into one list for the API
  // (Guest belongs to the application, not the room -- see
  // BookingApplicationCreate), deduping by exact first+last name (and,
  // for children, date of birth too) so the same real traveler entered
  // in more than one room becomes exactly one Guest row assigned to both,
  // never two duplicate rows.
  function buildGuestsPayload() {
    type FlatGuest = {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      nationality?: string;
      passportNumber?: string;
      passportExpiry?: string;
    };
    const flat: FlatGuest[] = [];
    const roomIndices: Record<string, number[]> = {};

    function findOrAdd(entry: FlatGuest): number {
      const existing = flat.findIndex(
        (g) =>
          g.firstName.trim().toLowerCase() === entry.firstName.trim().toLowerCase() &&
          g.lastName.trim().toLowerCase() === entry.lastName.trim().toLowerCase() &&
          (g.dateOfBirth ?? "") === (entry.dateOfBirth ?? "")
      );
      if (existing >= 0) return existing;
      flat.push(entry);
      return flat.length - 1;
    }

    for (const room of cart) {
      const entry = roomGuests[room.key];
      const indices: number[] = [];
      for (const a of entry.adults) {
        indices.push(
          findOrAdd({
            firstName: a.firstName,
            lastName: a.lastName,
            nationality: a.nationality,
            passportNumber: a.passportNumber,
            passportExpiry: a.passportExpiry,
          })
        );
      }
      for (const c of entry.children) {
        indices.push(
          findOrAdd({
            firstName: c.firstName,
            lastName: c.lastName,
            dateOfBirth: c.dateOfBirth,
            nationality: c.nationality,
            passportNumber: c.passportNumber,
            passportExpiry: c.passportExpiry,
          })
        );
      }
      roomIndices[room.key] = indices;
    }

    return { flat, roomIndices };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Hard guard, independent of which button/step triggered this --
    // real project-owner report (2026-07-29): an application was
    // created (BK-000069, real row, empty flight fields) after only the
    // room step was filled, confirmed the flight step never even
    // rendered. The room step's "Next" is `type="button"` (never
    // submits) and the actual `type="submit"` button only exists in the
    // DOM on the flight step -- but the native <form> still has its own
    // implicit-submission behavior on Enter in a text field, which some
    // browsers trigger even without a submit button present. Rather
    // than chase that browser-specific quirk, this makes premature
    // submission structurally impossible: any submit event firing
    // before the flight step is reached is a no-op, regardless of what
    // triggered it.
    if (!isFlightStep) return;
    // Decision 131: also refuses a submit that lands during the
    // post-step-change cooldown -- the disabled attribute on the
    // Submit button already blocks this in a spec-compliant browser,
    // but this makes it true regardless of how the event actually fired.
    if (navCooldown) return;
    if (!canSubmit) return;

    // Flight details are optional at the field level (arranging a
    // transfer without a confirmed flight is a real, valid scenario --
    // e.g. the guest hasn't booked their flight yet), but leaving via
    // Submit with ALL of them still blank is easy to do by accident on
    // a fast click-through of the wizard. One explicit confirmation,
    // same window.confirm pattern AdminPanel.tsx already uses for
    // approve/reject -- not a blocking requirement, just a deliberate
    // "are you sure" so an agent can't submit with no flight info
    // without ever having been asked.
    // Decision 150 (third pass): catch a malformed time/date HERE, with a
    // message naming what is wrong, instead of letting it reach the backend
    // as a 422 the agent can do nothing with. A six-digit year typed by
    // accident is exactly what produced the real "[object Object]" failure.
    // Decision 153: the stay this application is actually for. Multi-room
    // applications are one trip for one guest set, and the Booking row takes
    // the FIRST room's dates (create_booking_application's "representative"
    // snapshot), so that is what the server will validate against too.
    const stayArrival = cart[0]?.arrivalDate ?? "";
    const stayDeparture = cart[0]?.departureDate ?? "";

    const badCommon = firstInvalidFlightField(flight);
    if (badCommon) {
      setSubmitError(badCommon === "time" ? t("cart.invalidTime") : t("cart.invalidFlightDate"));
      return;
    }
    const impossibleCommon = flightDatesImpossible(flight, stayArrival, stayDeparture);
    if (impossibleCommon) {
      setSubmitError(
        impossibleCommon.reason === "reversed"
          ? t("cart.flightReversed")
          : t("cart.flightTooFarFromStay", { days: impossibleCommon.days })
      );
      return;
    }
    for (const [key, own] of Object.entries(guestFlights)) {
      const impossible = flightDatesImpossible(own, stayArrival, stayDeparture);
      if (impossible) {
        setSubmitError(
          impossible.reason === "reversed"
            ? t("cart.flightReversed")
            : t("cart.flightTooFarFromStay", { days: impossible.days })
        );
        setOpenGuestFlights((prev) => ({ ...prev, [key]: true }));
        return;
      }
      const bad = firstInvalidFlightField(own);
      if (bad) {
        setSubmitError(bad === "time" ? t("cart.invalidTime") : t("cart.invalidFlightDate"));
        // Reopen that traveller's form -- an error about fields the agent
        // can't see is worse than no error at all.
        setOpenGuestFlights((prev) => ({ ...prev, [key]: true }));
        return;
      }
    }

    // Decision 150: a per-guest override counts as flight info too, so an
    // application where only the individually-flying travellers are filled
    // in doesn't get warned as if nothing had been entered.
    const anyFlightEntered =
      hasAnyFlightDetail(flight) ||
      (flightMode === "perGuest" && Object.values(guestFlights).some(hasAnyFlightDetail));
    if (!anyFlightEntered && !window.confirm(t("cart.confirmNoFlightDetails"))) {
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    const { flat, roomIndices } = buildGuestsPayload();

    setSubmitting(true);
    setSubmitError(null);
    try {
      const application = await fetchJson<{
        booking_number: string;
        rooms: { sequence_number: number; hotel_id: number; status: string; rejection_reason: string | null }[];
      }>("/booking-engine/applications", token, {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          guests: flat.map((g, i) => {
            // Decision 150: only a traveller who actually has an override
            // sends flight fields at all. Everyone else sends nothing, so
            // their row stays NULL server-side, which is what "travels on
            // the application's flight" means. In "shared" mode no guest
            // ever sends them, making that path byte-identical to before.
            const own = flightMode === "perGuest" ? guestFlights[travellerKey(g)] : undefined;
            return {
              first_name: g.firstName,
              last_name: g.lastName,
              date_of_birth: g.dateOfBirth || null,
              nationality: g.nationality || null,
              passport_number: g.passportNumber || null,
              passport_expiry: g.passportExpiry || null,
              is_lead_guest: i === 0,
              ...(own && hasAnyFlightDetail(own)
                ? {
                    arrival_flight_number: own.arrivalFlightNumber || null,
                    arrival_flight_date: own.arrivalFlightDate || null,
                    arrival_flight_time: own.arrivalFlightTime || null,
                    departure_flight_number: own.departureFlightNumber || null,
                    departure_flight_date: own.departureFlightDate || null,
                    departure_flight_time: own.departureFlightTime || null,
                  }
                : {}),
            };
          }),
          rooms: cart.map((room) => ({
            hotel_id: room.hotelId,
            room_type_id: room.roomTypeId,
            meal_plan: room.mealPlan,
            arrival_date: room.arrivalDate,
            departure_date: room.departureDate,
            adults: room.adults,
            children: room.children,
            infants: room.infants,
            transfer_type: room.transferType,
            guest_indices: roomIndices[room.key] ?? [],
          })),
          arrival_flight_number: flight.arrivalFlightNumber || null,
          arrival_flight_date: flight.arrivalFlightDate || null,
          arrival_flight_time: flight.arrivalFlightTime || null,
          departure_flight_number: flight.departureFlightNumber || null,
          departure_flight_date: flight.departureFlightDate || null,
          departure_flight_time: flight.departureFlightTime || null,
        }),
      });

      setResult({
        bookingNumber: application.booking_number,
        rooms: application.rooms.map((r) => ({
          sequenceNumber: r.sequence_number,
          hotelName: cart.find((c) => c.hotelId === r.hotel_id)?.hotelName ?? String(r.hotel_id),
          status: r.status,
          rejectionReason: r.rejection_reason,
        })),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("cart.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Design System v1.0, block C: the shared overlay shell from
    // components/ui/Modal.tsx instead of another hand-rolled copy.
    // closeOnBackdrop={false} preserves this form's original behavior
    // exactly and matters here more than anywhere else in the app -- a
    // stray click beside a wizard already filled with guest passports,
    // dates of birth and flight numbers must not discard all of it.
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      maxWidth="max-w-2xl"
      panelClassName="max-h-[90vh] overflow-y-auto p-6"
    >
      <div>
        {result ? (
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              {t("cart.applicationCreated", { number: result.bookingNumber })}
            </h3>
            <div className="mt-4 space-y-2">
              {result.rooms.map((r) => (
                <div
                  key={r.sequenceNumber}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{r.hotelName}</p>
                    {r.rejectionReason && <p className="text-xs text-danger">{r.rejectionReason}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.status === "Rejected" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                    }`}
                  >
                    {r.status === "Rejected" ? t("cart.statusRejected") : t("cart.statusPending")}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onSuccess}
              className="mt-5 w-full rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5"
            >
              {t("cart.done")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* noValidate: this wizard does its own validation, and the
                native kind was actively harmful here -- a half-typed date
                or time input is `badInput`, which makes the whole form
                invalid and blocks Submit with no message anywhere on
                screen ("пока не добавишь время PM или AM дальше не идёт"). */}
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">{t("cart.checkoutTitle")}</h3>
              <button
                type="button"
                onClick={onClose}
                className="appearance-none rounded-lg border-0 bg-transparent p-1 text-slate/50 hover:text-ink"
              >
                {t("cart.close")}
              </button>
            </div>

            {/* ===== Step indicator -- one segment per room + one for
                flights, current/completed filled, upcoming outlined.
                Each segment is directly clickable (free navigation
                between steps already visited or reachable) -- submit
                itself still re-validates the whole cart via canSubmit,
                so jumping around can never bypass a required field. */}
            <div className="mt-4 flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToStep(() => i)}
                  aria-label={i < cart.length ? t("cart.stepRoom", { number: i + 1 }) : t("cart.stepFlights")}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= currentStep ? "bg-gold" : "bg-ink/10 hover:bg-ink/20"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs font-medium text-slate/50">
              {isFlightStep
                ? t("cart.stepFlights")
                : t("cart.stepRoomOf", { current: currentStep + 1, total: cart.length })}
            </p>

            <div className="mt-4 space-y-5">
              {!isFlightStep && currentRoom && (() => {
                const room = currentRoom;
                const roomIndex = currentStep;
                const entry = roomGuests[room.key];
                return (
                  <div key={room.key} className="rounded-xl border border-ink/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-deep">
                      {t("cart.roomNumber", { number: roomIndex + 1 })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink">{room.hotelName}</p>
                    <p className="text-xs text-slate/60">
                      {room.roomTypeName} · {room.mealPlanLabel}
                      {room.transferName ? ` · ${room.transferName}` : ""}
                      {room.transferDeclined ? ` · ${t("roomTypeCard.noTransfer")}` : ""}
                    </p>
                    <p className="text-xs text-slate/50">
                      {room.arrivalDate} – {room.departureDate} · {formatCartOccupancy(t, room)}
                    </p>
                    {room.grandTotal != null && (
                      <p className="mt-0.5 font-mono text-xs font-semibold text-ink">
                        {room.currency} {room.grandTotal.toLocaleString()}
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t("cart.adultsHeading")}
                      </p>
                      {entry.adults.map((a, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-slate/60">
                              {t("cart.touristLabel", { number: i + 1 })}
                            </p>
                            <CopyFromSelect ownKey={`${room.key}:adult:${i}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.firstNamePlaceholder")}
                              value={a.firstName}
                              onChange={(e) => updateAdult(room.key, i, "firstName", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.lastNamePlaceholder")}
                              value={a.lastName}
                              onChange={(e) => updateAdult(room.key, i, "lastName", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.nationalityPlaceholder")}
                              value={a.nationality}
                              onChange={(e) => updateAdult(room.key, i, "nationality", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.passportNumberPlaceholder")}
                              value={a.passportNumber}
                              onChange={(e) => updateAdult(room.key, i, "passportNumber", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="date"
                              placeholder={t("guestDetailsForm.passportExpiryPlaceholder")}
                              value={a.passportExpiry}
                              onChange={(e) => updateAdult(room.key, i, "passportExpiry", e.target.value)}
                              className={`w-36 rounded-lg border bg-white px-3 py-2 text-sm text-slate focus:outline-none ${
                                passportExpiryError(room, a.passportExpiry)
                                  ? "border-danger"
                                  : "border-ink/15 focus:border-gold"
                              }`}
                            />
                          </div>
                          {passportExpiryError(room, a.passportExpiry) && (
                            <p className="text-xs font-medium text-danger">{passportExpiryError(room, a.passportExpiry)}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {entry.children.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                          {t("cart.childrenHeading")}
                        </p>
                        {entry.children.map((c, i) => {
                          const error = childAgeError(room, i, c.dateOfBirth);
                          return (
                            <div key={i} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-slate/60">
                                  {t("cart.childLabel", { number: i + 1 })}
                                </p>
                                <CopyFromSelect ownKey={`${room.key}:child:${i}`} />
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.firstNamePlaceholder")}
                                  value={c.firstName}
                                  onChange={(e) => updateChild(room.key, i, "firstName", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.lastNamePlaceholder")}
                                  value={c.lastName}
                                  onChange={(e) => updateChild(room.key, i, "lastName", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                                />
                                <input
                                  type="date"
                                  value={c.dateOfBirth}
                                  onChange={(e) => updateChild(room.key, i, "dateOfBirth", e.target.value)}
                                  className={`w-36 rounded-lg border bg-white px-3 py-2 text-sm text-slate focus:outline-none ${
                                    error ? "border-danger" : "border-ink/15 focus:border-gold"
                                  }`}
                                />
                              </div>
                              <p className="text-[11px] text-slate/50">
                                {t("cart.expectedChildAge", { age: room.childAges[i] })}
                              </p>
                              {error && <p className="mt-0.5 text-xs font-medium text-danger">{error}</p>}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.nationalityPlaceholder")}
                                  value={c.nationality}
                                  onChange={(e) => updateChild(room.key, i, "nationality", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.passportNumberPlaceholder")}
                                  value={c.passportNumber}
                                  onChange={(e) => updateChild(room.key, i, "passportNumber", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none"
                                />
                                <input
                                  type="date"
                                  placeholder={t("guestDetailsForm.passportExpiryPlaceholder")}
                                  value={c.passportExpiry}
                                  onChange={(e) => updateChild(room.key, i, "passportExpiry", e.target.value)}
                                  className={`w-36 rounded-lg border bg-white px-3 py-2 text-sm text-slate focus:outline-none ${
                                    passportExpiryError(room, c.passportExpiry)
                                      ? "border-danger"
                                      : "border-ink/15 focus:border-gold"
                                  }`}
                                />
                              </div>
                              {passportExpiryError(room, c.passportExpiry) && (
                                <p className="text-xs font-medium text-danger">{passportExpiryError(room, c.passportExpiry)}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {isFlightStep && (() => {
                // Decision 150: the traveller list is derived from the room
                // steps already completed, using the same dedupe the submit
                // payload itself uses -- so the names offered here are
                // exactly the guest rows that will be created, never a
                // separately-maintained second list.
                const travellers = buildGuestsPayload().flat;
                const ownCount =
                  flightMode === "perGuest"
                    ? travellers.filter((g) => guestFlights[travellerKey(g)]).length
                    : 0;
                const commonCount = travellers.length - ownCount;

                // Deliberately buttons, not native radios/checkboxes. This
                // project's legacy stylesheet applies `width:100%` +
                // `padding:14px 16px` + a border to EVERY `input`, radios
                // and checkboxes included -- which is what stretched the
                // first version of this step across the dialog. Real
                // selectable cards are both the better control here and
                // immune to that rule; see CLAUDE.md's note on it.
                const modeCard = (active: boolean) =>
                  `flex-1 appearance-none rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? "border-ink bg-ink/[0.04] shadow-sm"
                      : "border-ink/12 bg-white hover:border-ink/35 hover:bg-sand/40"
                  }`;

                return (
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate/55">
                        <IconUsers className="h-3.5 w-3.5" />
                        {t("cart.flightModeHeading")}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {([
                          {
                            mode: "shared" as const,
                            title: t("cart.flightModeShared"),
                            hint: t("cart.flightModeSharedHint"),
                          },
                          {
                            mode: "perGuest" as const,
                            title: t("cart.flightModePerGuest"),
                            hint: t("cart.flightModePerGuestHint"),
                          },
                        ]).map((opt) => {
                          const active = flightMode === opt.mode;
                          return (
                            <button
                              key={opt.mode}
                              type="button"
                              onClick={() => setFlightMode(opt.mode)}
                              aria-pressed={active}
                              className={modeCard(active)}
                            >
                              <span className="flex items-start gap-2.5">
                                {/* Hand-drawn radio dot -- a real one would
                                    be stretched by the legacy input rule. */}
                                <span
                                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                                    active ? "border-ink" : "border-slate/35"
                                  }`}
                                >
                                  {active && <span className="h-2 w-2 rounded-full bg-ink" />}
                                </span>
                                <span className="min-w-0">
                                  <span className={`block text-sm font-semibold ${active ? "text-ink" : "text-slate"}`}>
                                    {opt.title}
                                  </span>
                                  <span className="mt-0.5 block text-xs leading-snug text-slate/60">{opt.hint}</span>
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-ink/12 bg-sand/25 p-4">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate/55">
                          {flightMode === "perGuest" ? t("cart.flightCommonHeading") : t("cart.flightHeading")}
                        </p>
                        {/* Says who this block actually covers -- in
                            per-guest mode "common flight" is otherwise a
                            claim the agent has to work out for themselves. */}
                        {flightMode === "perGuest" && (
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate/70">
                            {commonCount > 0
                              ? t("cart.appliesToCount", { count: commonCount, total: travellers.length })
                              : t("cart.appliesToNobody")}
                          </span>
                        )}
                      </div>
                      <FlightFieldsGrid value={flight} onChange={setFlightField} />
                      <FlightDateNotice
                        flight={flight}
                        arrivalDate={cart[0]?.arrivalDate ?? ""}
                        departureDate={cart[0]?.departureDate ?? ""}
                      />
                    </div>

                    {flightMode === "perGuest" && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate/55">
                          {t("cart.travellersHeading", { count: travellers.length })}
                        </p>
                        {travellers.map((g, i) => {
                          const key = travellerKey(g);
                          const own = guestFlights[key];
                          const editing = Boolean(own) && (openGuestFlights[key] ?? true);
                          const filled = Boolean(own) && hasAnyFlightDetail(own);
                          const name = `${g.firstName} ${g.lastName}`.trim();
                          return (
                            <div
                              key={key || i}
                              className={`rounded-xl border p-3.5 transition-colors ${
                                own ? "border-gold/45 bg-gold/[0.04]" : "border-ink/12 bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                      own ? "bg-gold/20 text-gold-deep" : "bg-sand text-slate/70"
                                    }`}
                                  >
                                    {travellerInitials(g.firstName, g.lastName)}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-ink">
                                      {name || t("cart.travellerFallbackName", { number: i + 1 })}
                                    </span>
                                    {!own && (
                                      <span className="block text-xs text-slate/55">{t("cart.usesCommonFlight")}</span>
                                    )}
                                    {own && !editing && (
                                      <span className="block text-xs font-medium text-gold-deep">
                                        {t("cart.ownFlightSaved")}
                                      </span>
                                    )}
                                  </span>
                                </span>

                                {/* Three distinct actions instead of one
                                    toggle that both added and silently
                                    discarded a filled-in flight. */}
                                {!own ? (
                                  <button
                                    type="button"
                                    onClick={() => addGuestOwnFlight(key)}
                                    className="shrink-0 appearance-none whitespace-nowrap rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
                                  >
                                    {t("cart.ownFlightToggle")}
                                  </button>
                                ) : (
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    {!editing && (
                                      <button
                                        type="button"
                                        onClick={() => editGuestOwnFlight(key)}
                                        className="appearance-none whitespace-nowrap rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
                                      >
                                        {t("cart.ownFlightEdit")}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeGuestOwnFlight(key)}
                                      className="appearance-none whitespace-nowrap rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-slate/70 transition-colors hover:border-danger hover:text-danger"
                                    >
                                      {t("cart.ownFlightRemove")}
                                    </button>
                                  </span>
                                )}
                              </div>

                              {own && editing && (
                                <div className="mt-3 border-t border-gold/25 pt-3">
                                  <FlightFieldsGrid
                                    value={own}
                                    onChange={(field, next) => setGuestFlightField(key, field, next)}
                                  />
                                  {/* Was missing entirely until the owner
                                      reported it: a traveller's own flight
                                      could sit days off the stay in silence. */}
                                  <FlightDateNotice
                                    flight={own}
                                    arrivalDate={cart[0]?.arrivalDate ?? ""}
                                    departureDate={cart[0]?.departureDate ?? ""}
                                  />
                                  <div className="mt-3 flex items-center justify-end gap-2">
                                    {!filled && (
                                      <span className="mr-auto text-xs text-slate/55">{t("cart.ownFlightEmptyHint")}</span>
                                    )}
                                    <button
                                      type="button"
                                      disabled={!filled}
                                      onClick={() => saveGuestOwnFlight(key)}
                                      className="appearance-none rounded-full border-0 bg-ink px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/25"
                                    >
                                      {t("cart.ownFlightSave")}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Saved state: the actual chosen flight, read
                                  back at a glance instead of six input boxes
                                  the agent has to re-read to know what is set. */}
                              {own && !editing && (
                                <div className="mt-2.5 flex flex-col gap-1 border-t border-gold/25 pt-2.5">
                                  <FlightLegSummary
                                    icon={<IconPlaneArrival />}
                                    label={t("cart.arrivalLeg")}
                                    number={own.arrivalFlightNumber}
                                    date={own.arrivalFlightDate}
                                    time={own.arrivalFlightTime}
                                    lang={i18nInstance.language}
                                  />
                                  <FlightLegSummary
                                    icon={<IconPlaneDeparture />}
                                    label={t("cart.departureLeg")}
                                    number={own.departureFlightNumber}
                                    date={own.departureFlightDate}
                                    time={own.departureFlightTime}
                                    lang={i18nInstance.language}
                                  />
                                  {/* Also on the SAVED summary — otherwise
                                      pressing "Сохранить рейс" would make the
                                      warning disappear without the date
                                      having changed. */}
                                  <FlightDateNotice
                                    flight={own}
                                    arrivalDate={cart[0]?.arrivalDate ?? ""}
                                    departureDate={cart[0]?.departureDate ?? ""}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {submitError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                <IconAlert className="w-3.5 h-3.5" />
                {submitError}
              </div>
            )}

            {/* UX pass, item 4: an immediate, human-readable reason
                "Next" is greyed out -- a plain hint, not styled as an
                error (that's what the red inline field messages above
                are for), since this shows before any mistake was
                actually made, just what's still needed. */}
            {!isFlightStep && currentRoom && roomValidationMessage(currentRoom) && (
              <p className="mt-3 text-xs text-slate/50">{roomValidationMessage(currentRoom)}</p>
            )}

            <div className="mt-5 flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={() => goToStep((s) => s - 1)}
                  disabled={submitting || navCooldown}
                  className="rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("cart.back")}
                </button>
              )}
              {!isFlightStep ? (
                <button
                  type="button"
                  onClick={() => goToStep((s) => s + 1)}
                  disabled={!currentRoom || !roomIsValid(currentRoom) || navCooldown}
                  className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {t("cart.next")}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSubmit || submitting || navCooldown}
                  className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {submitting ? t("cart.submitting") : t("cart.submit")}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("cart.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Carries an optional destination hint (e.g. clicking a featured hotel on
// AgentDashboard_v2.tsx) over to this page's own, full search form --
// pre-fills only, never auto-submits, so this page's own handleSearch
// (already verified, untouched) remains the single place a real search
// actually executes. Hotel search itself lives only on this page.
export interface InitialSearch {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
}

function HotelSearch() {
  const { t } = useTranslation("hotelSearch");
  const location = useLocation();
  // Routing fix (2026-07-29): the destination hint AgentDashboard_v2.tsx's
  // featured-hotel cards used to pass as a prop now arrives as router
  // state (navigate("/hotel-search", { state: { destination } })) --
  // same InitialSearch shape, just carried by the router instead of a
  // prop threaded down from App.tsx's page-state render.
  const initialSearch = (location.state as InitialSearch | null) ?? undefined;
  const [user, setUser] = useState<SessionUser | null>(null);

  // Routing fix (2026-07-29): the token/role guard that used to live here
  // (identical to AgentDashboard_v2.tsx's own copy) is now RequireAuth's
  // job, applied once in router.tsx -- this component is simply never
  // mounted unless that guard already passed. Only the user-data read stays.
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const [destination, setDestination] = useState(initialSearch?.destination ?? "");
  const [checkIn, setCheckIn] = useState(initialSearch?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(initialSearch?.checkOut ?? "");
  const [adults, setAdults] = useState(initialSearch?.adults ?? 2);
  const [childAges, setChildAges] = useState<number[]>([]);
  const occupancy = deriveOccupancy(adults, childAges);
  // Same 2-11 bucket deriveOccupancy itself uses for occupancy.children --
  // kept as the real ages (not just a count) so a cart room can remember
  // exactly which ages were used to price it, and the checkout form can
  // require each child guest's real date of birth to match (see
  // ApplicationCheckoutForm's own docstring for why this matters).
  const childBucketAges = childAges.filter((a) => a >= 2 && a < 12);

  // Stage 5 (multi-room booking applications) -- the shared trip cart.
  // Purely client-side: nothing is written to the backend until
  // ApplicationCheckoutForm submits the whole thing at once via
  // POST /booking-engine/applications. checkoutOpen controls the
  // guest-assignment step; applicationResult shows the outcome afterward.
  const [cart, setCart] = useState<CartRoom[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  function addToCart(room: CartRoom): { ok: boolean; error?: string } {
    // Same destination/country constraint the backend enforces
    // authoritatively (service.create_booking_application) -- checked
    // here too purely so the agent gets instant feedback instead of a
    // wasted round trip at submit time. A plain data comparison against
    // the room's own country field, never a hardcoded hotel/destination
    // list -- holds identically whether the cart has 2 rooms or 20
    // (Decision 116/117's formula principle).
    const existingCountry = cart[0]?.country;
    if (existingCountry && room.country !== existingCountry) {
      return {
        ok: false,
        error: t("cart.destinationMismatch", { existing: existingCountry, attempted: room.country }),
      };
    }
    setCart((prev) => [...prev, room]);
    return { ok: true };
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((r) => r.key !== key));
  }

  // Full hotel catalog, loaded once on mount and reused by both the
  // destination autocomplete dropdown below and handleSearch's own
  // filtering -- avoids a second identical fetch at submit time. If this
  // load hasn't finished (or failed) by the time the agent submits,
  // handleSearch falls back to fetching it fresh itself, so a slow/failed
  // background load never breaks a real search.
  const [catalogHotels, setCatalogHotels] = useState<Hotel[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token)
      .then(setCatalogHotels)
      .catch(() => {})
      .finally(() => setCatalogLoaded(true));
  }, []);

  // Debounced purely to avoid dropdown-content flicker on fast typing --
  // there is no network round-trip per keystroke to justify a debounce for
  // cost reasons, since matchesDestination filters an already-loaded,
  // in-memory array (see its own docstring: this is a genuine, data-size-
  // independent formula, not a fixed-for-today's-2-hotels special case).
  const [debouncedDestination, setDebouncedDestination] = useState(destination);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedDestination(destination), 150);
    return () => clearTimeout(handle);
  }, [destination]);

  const [destinationDropdownOpen, setDestinationDropdownOpen] = useState(false);

  // Multi-hotel search (project owner, 2026-08-03): at a real catalog size a
  // free-text destination match can return hundreds of hotels, and no left-
  // hand list can honestly present those. So the agent picks the hotels
  // outright -- between one and five -- and the picked set, not a text
  // match, is what gets searched. One hotel means there is nothing to choose
  // between, so the list column disappears entirely and the single result
  // gets the full width (see MAX_PICKED_HOTELS' use in the layout below).
  const MAX_PICKED_HOTELS = 5;
  const [pickedHotels, setPickedHotels] = useState<{ id: number; hotel_name: string }[]>([]);
  const pickedIds = pickedHotels.map((h) => h.id);

  function addPickedHotel(hotel: Hotel) {
    setPickedHotels((prev) =>
      prev.length >= MAX_PICKED_HOTELS || prev.some((p) => p.id === hotel.id)
        ? prev
        : [...prev, { id: hotel.id, hotel_name: hotel.hotel_name }]
    );
    setDestination("");
    setDestinationDropdownOpen(false);
  }

  function removePickedHotel(id: number) {
    setPickedHotels((prev) => prev.filter((p) => p.id !== id));
  }

  const destinationSuggestions =
    debouncedDestination.trim().length >= 2
      ? catalogHotels
          .filter((h) => matchesDestination(h, debouncedDestination) && !pickedIds.includes(h.id))
          .slice(0, 8)
      : [];

  function handleChildCountChange(newCount: number) {
    setChildAges((prev) =>
      newCount > prev.length
        ? [...prev, ...Array(newCount - prev.length).fill(8)]
        : prev.slice(0, newCount)
    );
  }

  function updateChildAge(index: number, rawAge: number) {
    const age = Number.isNaN(rawAge) ? 0 : Math.min(17, Math.max(0, rawAge));
    setChildAges((prev) => prev.map((a, i) => (i === index ? age : a)));
  }

  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<HotelResult[]>([]);
  // The search bar stays under the top navigation while scrolling (sm+),
  // tinted while it floats; things that stick below it use `belowBar`.
  const [searchBarEl, setSearchBarEl] = useState<HTMLFormElement | null>(null);
  const [barTop, setBarTop] = useState(0);
  const [barStuck, setBarStuck] = useState(false);
  const [belowBar, setBelowBar] = useState(16);
  useEffect(() => {
    if (!searchBarEl) return;
    const measure = () => {
      const nav = document.querySelector("header");
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      const sticky = getComputedStyle(searchBarEl).position === "sticky";
      setBarTop(navH);
      setBarStuck(sticky && searchBarEl.getBoundingClientRect().top <= navH + 1);
      setBelowBar(sticky ? navH + searchBarEl.offsetHeight + 12 : 16);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(searchBarEl);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [searchBarEl]);
  // The guests and dates the results on screen were priced for. Cards, the
  // trip cart and the copied offer read the party from HERE, never from the
  // live form -- editing the form after a search must not relabel prices
  // computed for another party (reported: searched 2+1, added children
  // without searching, the cards read "2 adults, 7 children" beside the
  // 2+1 prices).
  const [searched, setSearched] = useState<{
    checkIn: string;
    checkOut: string;
    baseAdults: number;
    childAges: number[];
  } | null>(null);
  const resultsParty = searched ? deriveOccupancy(searched.baseAdults, searched.childAges) : occupancy;
  const resultsChildAges = searched ? searched.childAges.filter((a) => a >= 2 && a < 12) : childBucketAges;
  const resultsStale =
    searched !== null &&
    (searched.checkIn !== checkIn ||
      searched.checkOut !== checkOut ||
      searched.baseAdults !== adults ||
      searched.childAges.join(",") !== childAges.join(","));
  // Block A: which hotel the centre column is showing. Only the left column
  // writes it; below lg (where there is no left column) it is simply unused,
  // and the original stacked list of every hotel renders instead.
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);

  // Decision 149 -- flexible dates. `flexible` non-null IS flexible mode
  // (the picker derives its active tab from exactly this). scanCfg is the
  // config the currently-displayed strip was actually produced with, kept
  // separate so editing the config afterwards doesn't silently relabel a
  // strip that was scanned with different settings.
  const [flexible, setFlexible] = useState<FlexibleDatesConfig | null>(null);
  const [scanCfg, setScanCfg] = useState<FlexibleDatesConfig | null>(null);
  const [scanCandidates, setScanCandidates] = useState<string[]>([]);
  const [scanRows, setScanRows] = useState<DateScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  // One "unit" is one (hotel, date) pair, the same unit the backend caps at
  // service.MAX_SCAN_UNITS = 40. The request chunk is deliberately far
  // smaller than that cap: a full scan is real pricing work (~0.3-0.5s per
  // unit), so sending it in small batches lets the strip fill in
  // progressively instead of leaving the agent on a dead spinner -- and
  // keeps any single request well clear of a timeout. Measured on real
  // data: a whole-month scan of one hotel is ~14s total, which at this
  // chunk size arrives as ~8 visible updates rather than one long freeze.
  const SCAN_CHUNK_UNITS = 4;

  async function runFlexibleScan(cfg: FlexibleDatesConfig) {
    const candidates = buildScanCandidates(cfg);
    if (candidates.length === 0) {
      setFormError(t("page.flexMonthPast"));
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;
    if (!user) return;
    const agentId = user.id;

    setScanning(true);
    setScanError(null);
    setScanRows([]);
    setScannedCount(0);
    setScanCandidates(candidates);
    setScanCfg(cfg);
    // A scan replaces whatever exact-date results were on screen -- leaving
    // them would show prices for dates the agent is in the middle of
    // reconsidering.
    setResults([]);
    setHasSearched(false);
    setSearchError(null);

    try {
      const allHotels = catalogLoaded
        ? catalogHotels
        : await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);
      const hotels = resolveSearchHotels(allHotels);
      if (hotels.length === 0) {
        setScanError(t("page.noHotelsFound"));
        return;
      }

      const chunkSize = Math.max(1, Math.floor(SCAN_CHUNK_UNITS / hotels.length));
      for (let i = 0; i < candidates.length; i += chunkSize) {
        const chunk = candidates.slice(i, i + chunkSize);
        const params = new URLSearchParams({
          agent_id: String(agentId),
          nights: String(cfg.nights),
          adults: String(occupancy.adults),
          children: String(occupancy.children),
          infants: String(occupancy.infants),
        });
        hotels.forEach((h) => params.append("hotel_ids", String(h.id)));
        chunk.forEach((d) => params.append("check_ins", d));
        const rows = await fetchJson<DateScanRow[]>(
          `/pricing-engine/date-scan?${params.toString()}`,
          token
        );
        setScanRows((prev) => [...prev, ...rows]);
        setScannedCount(i + chunk.length);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : t("page.hotelsLoadFailed"));
    } finally {
      setScanning(false);
    }
  }

  // Picking a date out of the strip is what ENDS flexible mode: it commits
  // real check-in/check-out dates and immediately runs the ordinary
  // exact-date search against them, so everything downstream stays the
  // single, already-verified booking path.
  function handlePickScanDate(pickedCheckIn: string, pickedCheckOut: string) {
    setCheckIn(pickedCheckIn);
    setCheckOut(pickedCheckOut);
    setFlexible(null);
    setScanCfg(null);
    setScanRows([]);
    setScanCandidates([]);
    void runExactSearch(pickedCheckIn, pickedCheckOut);
  }

  // Picked hotels win over the typed text, and keep the order they were
  // picked in. The free-text branch stays as the fallback for someone who
  // types a destination and hits Search without picking anything -- it is
  // the same matcher as before, just no longer the primary path. Shared by
  // the exact-date search and the flexible-date scan (Decision 149) so the
  // two can never disagree about which hotels a search covers.
  function resolveSearchHotels(allHotels: Hotel[]): Hotel[] {
    return pickedHotels.length > 0
      ? pickedHotels
          .map((p) => allHotels.find((h) => h.id === p.id))
          .filter((h): h is Hotel => Boolean(h))
      : allHotels.filter((h) => matchesDestination(h, destination));
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setDestinationDropdownOpen(false);

    // An empty search used to mean "every hotel in the catalog", which is
    // exactly the case the owner flagged: harmless with two hotels, useless
    // and unpresentable with a thousand. Either pick hotels or name a
    // destination -- both bound the result set to something a person can
    // actually read.
    if (pickedHotels.length === 0 && !destination.trim()) {
      setFormError(t("page.hotelRequired"));
      return;
    }

    // Decision 149: in flexible mode the agent hasn't chosen a stay yet --
    // the whole point of the scan is to find out which check-in date to
    // choose -- so the exact-date validation below doesn't apply.
    if (flexible) {
      await runFlexibleScan(flexible);
      return;
    }

    if (!checkIn || !checkOut) {
      setFormError(t("page.datesRequired"));
      return;
    }
    if (checkOut <= checkIn) {
      setFormError(t("page.checkoutAfterCheckin"));
      return;
    }
    await runExactSearch(checkIn, checkOut);
  }

  // checkIn/checkOut are parameters that deliberately shadow the state of
  // the same name: picking a date out of the flexible-date strip needs to
  // search those exact dates immediately, without waiting a render for the
  // state write to land.
  async function runExactSearch(checkIn: string, checkOut: string) {
    const token = localStorage.getItem("token");
    if (!token) return; // guarded above; satisfies TypeScript below
    if (!user) return; // guarded by the render-time check below; narrows for TypeScript here
    const agentId = user.id;

    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSearched({ checkIn, checkOut, baseAdults: adults, childAges: [...childAges] });

    try {
      const allHotels = catalogLoaded
        ? catalogHotels
        : await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);
      const hotels = resolveSearchHotels(allHotels);

      const withRooms = await Promise.all(
        hotels.map(async (hotel): Promise<HotelResult> => {
          let roomTypes: RoomType[] = [];
          try {
            roomTypes = await fetchJson<RoomType[]>(
              `/hotel-engine/hotels/${hotel.id}/room-types`,
              token
            );
          } catch {
            roomTypes = [];
          }
          // Decision 211: one request per hotel for every room's occupancy
          // options (sleeping places). Best-effort: without them the card
          // simply says nothing about beds.
          let occupancyOptions: OccupancyOption[] = [];
          try {
            occupancyOptions = await fetchJson<OccupancyOption[]>(
              `/hotel-engine/hotels/${hotel.id}/occupancy-options?active_only=true`,
              token
            );
          } catch {
            occupancyOptions = [];
          }
          const beddingFor = (roomTypeId: number) =>
            pickBedding(
              occupancyOptions.filter((o) => o.room_type_id === roomTypeId),
              occupancy.adults,
              occupancy.children,
            );

          let contractId: number | undefined;
          let transferRequired = false;
          let transferCurrency: string | null = null;
          try {
            const contract = await fetchJson<Contract | null>(
              `/contract-engine/hotels/${hotel.id}/active-contract?check_in=${checkIn}`,
              token
            );
            contractId = contract?.id;
            transferRequired = contract?.transfer_required ?? false;
            transferCurrency = contract?.currency ?? null;
          } catch {
            contractId = undefined;
          }

          let transferOptions: PricedTransferOption[] = [];
          // Decision 197: how many Active options exist that this party is
          // too large for. Kept so the UI can say so rather than showing an
          // empty transfer block.
          let transfersTooSmall = 0;
          if (contractId) {
            try {
              // Decision 197: fetch the whole Active list in ONE request and
              // split it here, rather than asking the endpoint to filter.
              // The page needs BOTH halves: the options that fit, and how
              // many exist but are too small -- otherwise a family of five on
              // a contract selling only four-seat cars would see the transfer
              // block vanish with no explanation. The endpoint's own `guests`
              // filter stays as the protection for any other caller.
              const guests = occupancy.adults + occupancy.children + occupancy.infants;
              // Decision 198: both limits, independently. `occupancy.adults`
              // already includes anyone 12 or over (deriveOccupancy promotes
              // them), which is exactly what an adult seat means here.
              const fits = (o: TransferOption) =>
                (o.max_passengers === null || o.max_passengers >= guests) &&
                (o.max_adults === null || o.max_adults >= occupancy.adults);
              const allOptions = await fetchJson<TransferOption[]>(
                `/contract-engine/contracts/${contractId}/transfer-options/available`,
                token
              );
              const rawOptions = allOptions.filter(fits);
              transfersTooSmall = allOptions.length - rawOptions.length;
              // Price each option via the discount-aware endpoint (applies
              // any active SpecialOfferTransferDiscount, e.g. Kandima's
              // KM26_03 50%/25% off) instead of the naive
              // price_adult*adults+... multiplication this used to do
              // client-side, which silently ignored those discounts.
              transferOptions = await Promise.all(
                rawOptions.map(async (option): Promise<PricedTransferOption> => {
                  try {
                    const priceQuery = new URLSearchParams({
                      transfer_type: option.transfer_type,
                      check_in: checkIn,
                      check_out: checkOut,
                      adults: String(occupancy.adults),
                      children: String(occupancy.children),
                      infants: String(occupancy.infants),
                    });
                    const price = await fetchJson<TransferPrice>(
                      `/contract-engine/contracts/${contractId}/transfer-price?${priceQuery.toString()}`,
                      token
                    );
                    return { option, price };
                  } catch (err) {
                    return { option, priceError: err instanceof Error ? err.message : t("page.priceUnavailable") };
                  }
                })
              );
            } catch {
              transferOptions = [];
            }
          }

          // Decision 212: special offers for this stay -- one request per hotel.
          let applicableOffers: ApplicableOffer[] = [];
          if (contractId) {
            try {
              applicableOffers = await fetchJson<ApplicableOffer[]>(
                `/contract-engine/contracts/${contractId}/special-offers/applicable?check_in=${checkIn}&check_out=${checkOut}`,
                token
              );
            } catch {
              applicableOffers = [];
            }
          }

          let mandatoryTax: MandatoryTax | undefined;
          if (contractId) {
            try {
              const nights = Math.round(
                (parseISODate(checkOut).getTime() - parseISODate(checkIn).getTime()) / (1000 * 60 * 60 * 24)
              );
              const taxQuery = new URLSearchParams({
                nights: String(nights),
                adults: String(occupancy.adults),
                children: String(occupancy.children),
              });
              const tax = await fetchJson<MandatoryTax>(
                `/contract-engine/contracts/${contractId}/mandatory-tax?${taxQuery.toString()}`,
                token
              );
              if (tax.total > 0) mandatoryTax = tax;
            } catch {
              mandatoryTax = undefined;
            }
          }

          const roomTypeResults = await Promise.all(
            roomTypes.map(async (rt): Promise<RoomTypeResult> => {
              if (!contractId) {
                return { ...rt, options: [], priceError: t("page.noActiveContract"), bedding: beddingFor(rt.id) };
              }
              try {
                const mealPlans = await fetchJson<ContractMealPlan[]>(
                  `/contract-engine/contracts/${contractId}/room-types/${rt.id}/meal-plans`,
                  token
                );
                if (mealPlans.length === 0) {
                  return { ...rt, options: [], priceError: t("page.noMealPlansAvailable"), bedding: beddingFor(rt.id) };
                }

                const options = await Promise.all(
                  mealPlans.map(async (mp): Promise<MealPlanOption> => {
                    try {
                      const priceQuery = new URLSearchParams({
                        check_in: checkIn,
                        check_out: checkOut,
                        meal_plan: mp.meal_code,
                        adults: String(occupancy.adults),
                        children: String(occupancy.children),
                        infants: String(occupancy.infants),
                      });
                      const price = await fetchJson<RoomPrice>(
                        `/contract-engine/contracts/${contractId}/room-types/${rt.id}/price?${priceQuery.toString()}`,
                        token
                      );
                      // Decision 070: the raw Contract Engine net total (price
                      // above) is never shown to the agent directly -- this
                      // call must also succeed (same function create_booking
                      // uses server-side) so the search preview can never
                      // diverge from what a real booking would actually
                      // charge. If it fails, the whole option falls through
                      // to the catch block below, same as a price fetch
                      // failure -- never display net alone.
                      const agentPriceQuery = new URLSearchParams({
                        agent_id: String(agentId),
                        contract_id: String(contractId),
                        room_net_total: String(price.final_total),
                        nights: String(price.nights),
                        room_type_id: String(rt.id),
                        meal_plan_id: String(price.meal_plan_id),
                        check_in: checkIn,
                        check_out: checkOut,
                      });
                      const agentPrice = await fetchJson<AgentPrice>(
                        `/pricing-engine/agent-price?${agentPriceQuery.toString()}`,
                        token
                      );
                      return { mealCode: mp.meal_code, mealName: mp.meal_name, price, agentPrice };
                    } catch (err) {
                      return {
                        mealCode: mp.meal_code,
                        mealName: mp.meal_name,
                        priceError: err instanceof Error ? err.message : t("page.priceUnavailable"),
                      };
                    }
                  })
                );

                return { ...rt, options, bedding: beddingFor(rt.id), offers: offersForRoom(applicableOffers, rt.id) };
              } catch (err) {
                return {
                  ...rt,
                  bedding: beddingFor(rt.id),
                  options: [],
                  priceError: err instanceof Error ? err.message : t("page.ratesLoadFailed"),
                };
              }
            })
          );

          return {
            ...hotel,
            contractId,
            transferRequired,
            transferOptions,
            transfersTooSmall,
            transferCurrency,
            mandatoryTax,
            roomTypes: roomTypeResults,
          };
        })
      );

      setResults(withRooms);
      // Block A: a fresh result set always starts on its first hotel, so the
      // centre column is never empty and never left pointing at a hotel from
      // the previous search.
      setSelectedHotelId(withRooms[0]?.id ?? null);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t("page.hotelsLoadFailed"));
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }

  if (!user) {
    return <div className="min-h-screen bg-sand" />;
  }

  // Pinned right-column cart only makes sense once there are real results
  // to sit alongside, and never while the checkout form has replaced this
  // whole view -- same guard the floating cart already implicitly had via
  // its own cart.length>0/!checkoutOpen conditions, just evaluated once
  // and shared by both the grid wrapper and the results column below.
  const showPinnedCart = hasSearched && results.length > 0 && !checkoutOpen;

  // Block A: the hotel-list column exists only when there is genuinely a
  // choice to make -- two or more results. A single-hotel search (the common
  // case now that hotels are picked outright) has nothing to list, so the
  // column is not rendered at all and its width goes to the result itself,
  // shown as the full standard card rather than a narrowed centre column.
  // Both cases keep the cart; the whole area still requires a completed
  // search and no open checkout, exactly as the pinned cart already did.
  const showHotelList = showPinnedCart && results.length > 1;
  const showColumns = showPinnedCart;
  const selectedHotel = results.find((h) => h.id === selectedHotelId) ?? results[0] ?? null;

  return (
    <div className="min-h-screen bg-sand font-sans text-slate">
      {/* Shared top nav (Phase 1 design system) -- replaces this page's own
          previously-separate top bar, and the generic Header.tsx App.tsx
          used to render above it (removed there; see App.tsx's own
          comment). Same component AgentDashboard_v2.tsx now uses. */}
      <AgentTopNav user={user} active="search" />

      {/* Hero band -- reuses the existing ink/gold gradient already used
          elsewhere in this file (HotelCard's own image-placeholder
          gradients), standing in for a photo since this project has no
          photo-asset pipeline anywhere. The search card below overlaps
          its bottom edge via negative margin, matching the reference
          layout's prominence. */}
      <div className="bg-gradient-to-br from-ink via-ink to-gold/30 px-4 py-16 text-center sm:px-8 sm:py-24">
        <p className="text-xs font-semibold tracking-widest text-gold">{t("page.heroTag")}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-5xl">{t("page.heroTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">{t("page.heroSubtitle")}</p>
      </div>

      {/* Requested live: the search + results area used to cap at
          max-w-6xl (1152px), leaving roughly a third of a normal 1920
          screen as dead margin on either side. Widened to 96rem
          (1536px) so both the search panel and the hotel cards actually
          use the screen. Tailwind v4 dropped max-w-screen-2xl, hence the
          explicit rem value rather than the old named utility. */}
      <main className="mx-auto max-w-[96rem] px-4 pb-8 sm:px-8">
        {/* Block A: the search bar now spans the full width above all three
            columns instead of sharing a grid cell with the results. One
            search governs every column, so it reads as the page's own
            header rather than as the left column's first item -- and the
            hotel list, the room detail and the cart all start on the same
            line beneath it. */}
        <form
          ref={setSearchBarEl}
          onSubmit={handleSearch}
          style={{ top: barTop }}
          className={`-mt-10 rounded-2xl border shadow-xl transition-colors duration-200 sm:sticky sm:z-30 sm:-mt-12 sm:rounded-[2.5rem] ${
            barStuck ? "border-gold/40 bg-[#fbf6ee]" : "border-ink/10 bg-white"
          }`}
        >
          {/* Decision (fix): sm:rounded-full previously computed a
              border-radius of min(width, height)/2 -- fine for the fields
              row alone, but this form's height genuinely varies (child-age
              inputs, the "dates required" error banner below), and at
              greater height that formula turns the whole card into a
              stretched oval/blob rather than a stadium shape. A fixed large
              radius keeps the same rounded, premium look at any height. */}
          {/* Decision (search-panel restyle): the old divide-x/divide-y
              utilities drew a full-height border between every field.
              Replaced with explicit inset divider elements (self-stretch +
              vertical margin shrinks the visible line to shorter than the
              field's own height, "not a full border") plus extra gap
              spacing as the primary separator -- the outer panel's own
              border/shadow (on the form element itself) is untouched. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
            <div className="relative flex min-w-0 flex-1 flex-col gap-2.5 px-8 py-6 sm:py-8">
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate/50">
                {t("page.destinationLabel")}
                <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-slate/40">
                  {t("page.multiHotelHint")}
                </span>
              </label>

              {/* Picked hotels sit INSIDE the field as compact chips, so the
                  destination field keeps the same single-row height as Dates
                  and Guests and the whole bar stays level (owner: the chip
                  row above the input pushed it out of line). Several hotels
                  scroll sideways inside the field instead of growing it. */}
              <div className="flex h-14 items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 transition-colors hover:border-gold/60 focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/20">
                <IconPin className="h-5 w-5 shrink-0 text-gold-deep" />
                {pickedHotels.length > 0 && (
                  <div className="flex min-w-0 shrink items-center gap-1.5 overflow-x-auto">
                    {pickedHotels.map((h) => (
                      <span
                        key={h.id}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gold/15 py-0.5 pl-2.5 pr-1 text-sm font-medium text-ink"
                      >
                        {h.hotel_name}
                        <button
                          type="button"
                          onClick={() => removePickedHotel(h.id)}
                          aria-label={t("page.removeHotel")}
                          className="flex h-5 w-5 appearance-none items-center justify-center rounded-full border-0 bg-transparent text-ink/50 transition-colors hover:bg-ink/10 hover:text-ink"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={destination}
                  disabled={pickedHotels.length >= MAX_PICKED_HOTELS}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setDestinationDropdownOpen(true);
                  }}
                  onFocus={() => setDestinationDropdownOpen(true)}
                  placeholder={
                    pickedHotels.length >= MAX_PICKED_HOTELS
                      ? t("page.maxHotelsReached")
                      : pickedHotels.length > 0
                        ? t("page.addAnotherHotel")
                        : t("page.destinationPlaceholder")
                  }
                  className={`min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-base text-ink shadow-none placeholder:text-slate/40 focus:border-0 focus:shadow-none focus:outline-none disabled:cursor-not-allowed ${
                    pickedHotels.length > 0 ? "min-w-[7rem] placeholder:text-sm" : "w-full"
                  }`}
                />
              </div>
              {/* Live suggestions -- same dropdown/debounce pattern as
                  financeShared.tsx's AgentSearchSelect, adapted for an
                  already-loaded in-memory catalog instead of a per-
                  keystroke server search (unnecessary at real hotel-catalog
                  scale, see catalogHotels above). matchesDestination is the
                  same generic, data-size-independent formula the submitted
                  search itself uses -- narrowing to 500 hotels across 10
                  destinations needs no code change here, only real data. */}
              {destinationDropdownOpen && destination.trim().length >= 2 && (
                <div className="absolute left-7 right-7 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-lg">
                  {!catalogLoaded ? (
                    <p className="px-4 py-3 text-sm text-slate/50">{t("page.destinationSuggestionsLoading")}</p>
                  ) : destinationSuggestions.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate/50">{t("page.destinationNoSuggestions")}</p>
                  ) : (
                    destinationSuggestions.map((hotel) => (
                      <button
                        key={hotel.id}
                        type="button"
                        onClick={() => addPickedHotel(hotel)}
                        className="block w-full appearance-none border-0 border-b border-ink/5 bg-white px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-sand/40"
                      >
                        <span className="font-medium text-ink">{hotel.hotel_name}</span>
                        <span className="ml-2 text-slate/60">
                          {[hotel.city, hotel.country].filter(Boolean).join(", ")}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex flex-col gap-2.5 px-8 pt-2 sm:w-64 sm:shrink-0 sm:px-5 sm:py-8 xl:w-80">
              <label className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("page.datesLabel")}</label>
              <DateRangePicker
                checkIn={checkIn}
                checkOut={checkOut}
                onChange={(ci, co) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                }}
                size="lg"
                flexible={flexible}
                onFlexibleChange={(cfg) => {
                  setFlexible(cfg);
                  setFormError(null);
                  // Leaving flexible mode drops the strip with it -- a
                  // stale strip next to exact dates would be two different
                  // answers to the same question on one screen.
                  if (!cfg) {
                    setScanCfg(null);
                    setScanRows([]);
                    setScanCandidates([]);
                    setScanError(null);
                  }
                }}
              />
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex flex-col gap-2.5 px-8 pt-2 sm:w-64 sm:shrink-0 sm:px-5 sm:py-8 xl:w-80">
              <label className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("page.guestsLabel")}</label>
              <GuestsPicker
                adults={adults}
                childAges={childAges}
                onAdultsChange={setAdults}
                onChildCountChange={handleChildCountChange}
                onChildAgeChange={updateChildAge}
              />
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex items-end px-8 pb-6 pt-4 sm:shrink-0 sm:px-5 sm:py-8">
              <button
                type="submit"
                disabled={searching || scanning}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
              >
                <IconSearch className="h-4 w-4" />
                {scanning
                  ? t("page.scanning")
                  : searching
                    ? t("page.searching")
                    : flexible
                      ? t("page.findDatesButton")
                      : t("page.searchButton")}
              </button>
            </div>
          </div>

          {formError && (
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">
              <IconAlert />
              {formError}
            </div>
          )}
        </form>

        {/* Decision 149: the flexible-date price strip sits between the
            search bar and the results, because that is exactly its role --
            a date-choosing step that ENDS by producing ordinary exact
            dates, not a parallel kind of search result. */}
        {scanCfg && (
          <FlexibleResultsPanel
            cfg={scanCfg}
            candidates={scanCandidates}
            rows={scanRows}
            scanning={scanning}
            scannedCount={scannedCount}
            error={scanError}
            multiHotel={new Set(scanRows.map((r) => r.hotel_id)).size > 1}
            onPick={handlePickScanDate}
          />
        )}

        {searchError && (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-danger/10 px-5 py-4 text-sm font-medium text-danger">
            <IconAlert />
            {t("page.searchErrorPrefix")} {searchError}
          </div>
        )}

        {!searching && hasSearched && !searchError && results.length === 0 && (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-warning/10 px-5 py-4 text-sm font-medium text-warning">
            <IconAlert />
            {t("page.noHotelsFound")}
          </div>
        )}

        {/* Block A -- the three-column working area: choose a hotel on the
            left, configure the room/meal/transfer in the middle, watch the
            trip build up on the right, with no scrolling between the three.
            Columns are explicit widths rather than equal fractions: the
            hotel list and the cart each need a fixed, modest width, and
            every remaining pixel belongs to the centre, which carries the
            actual decisions.

            Below lg the whole thing collapses to exactly the original
            layout -- every hotel stacked in one column with the floating
            cart -- so a laptop/tablet/phone keeps the behaviour that has
            been verified in real use. That fallback is done with CSS
            (`lg:hidden` on the non-selected cards) rather than by
            re-rendering a different tree, so each HotelCard keeps its own
            expanded-room-type state across a resize instead of silently
            resetting it. */}
        <div
          className={
            !showColumns
              ? "mt-6"
              : showHotelList
                ? "mt-6 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)_290px] xl:grid-cols-[280px_minmax(0,1fr)_340px] xl:gap-8"
                : // Single hotel: two columns only, so the result keeps the
                  // full standard width instead of sitting in a narrowed
                  // centre lane with an empty list column beside it.
                  "mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px] xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8"
          }
        >
          {showHotelList && (
            <aside className="hidden lg:block lg:sticky" style={{ top: belowBar }}>
              <div className="rounded-2xl border border-ink/10 bg-white p-2 shadow-card">
                <p className="px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-slate/50">
                  {t("hotelList.found", { count: results.length })}
                </p>
                <div className="max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto">
                  {results.map((hotel, i) => (
                    <HotelListRow
                      key={hotel.id}
                      hotel={hotel}
                      gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]}
                      selected={selectedHotel?.id === hotel.id}
                      onSelect={() => setSelectedHotelId(hotel.id)}
                    />
                  ))}
                </div>
              </div>
            </aside>
          )}

          <div className={showHotelList ? "space-y-5 lg:space-y-0" : "space-y-5"}>
            {resultsStale && results.length > 0 && (
              <div
                role="status"
                style={{ top: belowBar }}
                className="sticky z-10 flex min-h-[40px] items-center gap-2 rounded-lg border border-warning/40 bg-[#fdf6ec] px-4 py-1.5 text-sm font-medium leading-snug text-warning shadow-sm lg:mb-4"
              >
                <IconAlert className="h-4 w-4 shrink-0" />
                <span>{t("page.resultsStale")}</span>
              </div>
            )}
            {results.map((hotel, i) => (
              <div
                key={hotel.id}
                className={showHotelList && selectedHotel?.id !== hotel.id ? "lg:hidden" : ""}
              >
                <HotelCard
                  hotel={hotel}
                  gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]}
                  adults={resultsParty.adults}
                  childrenCount={resultsParty.children}
                  infants={resultsParty.infants}
                  childAges={resultsChildAges}
                  agentId={user.id}
                  checkIn={searched?.checkIn ?? checkIn}
                  checkOut={searched?.checkOut ?? checkOut}
                  onAddToTrip={addToCart}
                  inColumnLayout={showHotelList}
                  stale={resultsStale}
                />
              </div>
            ))}
          </div>

          {/* Requested live (Decision 139/140): the cart is permanently
              visible and sticky, not a bubble that only appears once
              something is in it. Now simply the third column. */}
          {showColumns && (
            <div className="hidden lg:sticky lg:block" style={{ top: belowBar }}>
              <CartPanel
                cart={cart}
                onRemove={removeFromCart}
                onCheckout={() => setCheckoutOpen(true)}
                variant="pinned"
              />
            </div>
          )}
        </div>

        {/* Floating trip-cart summary -- below lg only now (the lg+ case
            is the pinned column above), same original "only once
            something's in it" gating. */}
        {cart.length > 0 && !checkoutOpen && (
          <div className="lg:hidden">
            <CartPanel cart={cart} onRemove={removeFromCart} onCheckout={() => setCheckoutOpen(true)} />
          </div>
        )}

        {checkoutOpen && (
          <ApplicationCheckoutForm
            cart={cart}
            agentId={user.id}
            onClose={() => setCheckoutOpen(false)}
            onSuccess={() => {
              setCart([]);
              setCheckoutOpen(false);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default HotelSearch;
