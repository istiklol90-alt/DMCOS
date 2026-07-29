import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "../i18n/i18n";
import { API_URL } from "../config";
import AgentTopNav from "../components/layout/AgentTopNav";
import { IconPin, IconSearch } from "../components/ui/icons";

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
  total: number;
};

type PricedTransferOption = {
  option: TransferOption;
  price?: TransferPrice;
  priceError?: string;
};

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
  currency: string | null;
  grandTotal: number | null;
};

type ContractMealPlan = {
  id: number;
  contract_id: number;
  meal_code: string;
  meal_name: string | null;
};

type RoomPrice = {
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

type RoomTypeResult = RoomType & {
  options: MealPlanOption[];
  priceError?: string;
};

type HotelResult = Hotel & {
  contractId?: number;
  transferRequired: boolean;
  transferOptions: PricedTransferOption[];
  transferCurrency: string | null;
  mandatoryTax?: MandatoryTax;
  roomTypes: RoomTypeResult[];
};

const CARD_GRADIENTS = [
  "from-teal to-ink",
  "from-coral to-ink",
  "from-ink to-teal",
  "from-teal to-coral",
  "from-coral to-teal",
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
      if (body?.detail) detail = body.detail;
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

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate/70">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={t("counter.decreaseAriaLabel", { label })}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconMinus />
        </button>
        <span className="w-4 text-center text-sm font-medium text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={t("counter.increaseAriaLabel", { label })}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-sand"
        >
          <IconPlus />
        </button>
      </div>
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
    <div className="w-56">
      <p className="text-center text-base font-semibold capitalize text-ink">{monthLabel}</p>
      <div className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-slate/40">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center text-xs">
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
            <div key={i} className={isInRangeInclusive ? "bg-coral/10" : ""}>
              <button
                type="button"
                disabled={isPast}
                onClick={() => onDayClick(day)}
                className={[
                  "mx-auto flex h-7 w-7 appearance-none items-center justify-center rounded-full border-0 transition-colors",
                  // isPast/isEndpoint/default each own their own
                  // background+text pair outright, never combined with a
                  // separately-listed bg-transparent/text-ink -- two
                  // utilities targeting the same CSS property fight over
                  // Tailwind's generated-stylesheet order, not the order
                  // they appear in this string (same class of bug
                  // Button.tsx's own VARIANT_CLASSES comment documents).
                  // That's exactly what made a selected day render
                  // white-on-white/invisible here: bg-transparent was
                  // silently winning over bg-coral.
                  isPast
                    ? "cursor-not-allowed bg-transparent text-slate/20"
                    : isEndpoint
                      ? "bg-coral text-white hover:bg-coral"
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
}) {
  const { t: ambientT, i18n: i18nInstance } = useTranslation("hotelSearch");
  const lang = forceLang ?? i18nInstance.language;
  const t = forceLang ? i18n.getFixedT(forceLang, "hotelSearch") : ambientT;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (checkIn ? parseISODate(checkIn) : new Date()));
  // Visual-only tab, per explicit scope -- no flexible-date search exists
  // (backend only ever takes exact check_in/check_out dates). Selecting
  // "Flexible Dates" just changes which pill is active; the calendar below
  // keeps behaving identically either way.
  const [dateMode, setDateMode] = useState<"specific" | "flexible">("specific");
  const containerRef = useRef<HTMLDivElement>(null);

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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          size === "lg"
            ? "flex w-full items-center gap-2.5 px-7 py-1 text-left text-lg text-slate sm:text-xl"
            : "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate"
        }
      >
        <IconCalendar className={size === "lg" ? "w-5 h-5 shrink-0 text-slate/50" : "w-4 h-4 shrink-0 text-slate/50"} />
        <span className={checkIn || checkOut ? "text-slate" : "text-slate/40"}>
          {formatDateRangeLabel(t, lang, checkIn, checkOut)}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-fit rounded-2xl border border-ink/10 bg-white p-3 shadow-lg">
          {/* Marriott-style segmented control: a light gray track with the
              active tab rendered as a raised white pill, not a solid-filled
              tab against a transparent track. */}
          <div className="mb-4 flex items-center gap-1 rounded-full bg-sand p-1">
            <button
              type="button"
              onClick={() => setDateMode("specific")}
              className={`flex-1 appearance-none rounded-full border-0 px-4 py-2 text-xs font-semibold transition-colors ${
                dateMode === "specific" ? "bg-white text-ink shadow-sm" : "bg-transparent text-slate/50 hover:text-ink"
              }`}
            >
              {t("dateRangePicker.specificDates")}
            </button>
            <button
              type="button"
              onClick={() => setDateMode("flexible")}
              className={`flex-1 appearance-none rounded-full border-0 px-4 py-2 text-xs font-semibold transition-colors ${
                dateMode === "flexible" ? "bg-white text-ink shadow-sm" : "bg-transparent text-slate/50 hover:text-ink"
              }`}
            >
              {t("dateRangePicker.flexibleDates")}
            </button>
          </div>

          <div className="flex items-start gap-1.5">
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
// Hotel result card
// ---------------------------------------------------------------------------

function RoomTypeCard({
  rt,
  expanded,
  onToggle,
  transferOptions,
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
  onAddToTrip,
}: {
  rt: RoomTypeResult;
  expanded: boolean;
  onToggle: () => void;
  transferOptions: PricedTransferOption[];
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
  function handleAddToTrip() {
    setAddToTripError(null);
    if (!selectedMeal?.price) return;
    if (transferRequired && !selectedTransferType) {
      setAddToTripError(t("roomTypeCard.selectTransferFirst"));
      return;
    }

    const room: CartRoom = {
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
      currency: selectedMeal.price.currency,
      grandTotal,
    };

    const result = onAddToTrip(room);
    if (result.ok) {
      setAddedToTripAt(Date.now());
    } else {
      setAddToTripError(result.error ?? null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-ink">{rt.room_name}</h4>
          <p className="mt-0.5 text-xs text-slate/50">{t("roomTypeCard.maxGuests", { count: rt.max_occupancy })}</p>
          {rt.bed_type && (
            <p className="mt-0.5 text-xs text-slate/50">{rt.bed_type}</p>
          )}
          <p className="mt-0.5 text-xs font-medium text-coral">
            {formatSearchOccupancy(t, { adults, children: childrenCount, infants }, childAges)}
          </p>
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
                      isSelected ? "rounded-lg bg-coral/5 px-2 py-1" : ""
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
                          isSelected ? "bg-coral text-white" : "bg-ink text-white"
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
                        className="appearance-none border-0 bg-transparent p-0 text-xs font-medium text-teal underline decoration-dotted hover:text-teal/70"
                      >
                        {isNightlyOpen ? t("roomTypeCard.hideNightlyPrices") : t("roomTypeCard.showNightlyPrices")}
                      </button>

                      {isNightlyOpen && (
                        <div className="mt-1.5 rounded-lg border border-ink/10 bg-sand/30 p-2.5">
                          {nightlyLoading[opt.mealCode] && (
                            <p className="text-xs text-slate/50">{t("roomTypeCard.loading")}</p>
                          )}
                          {nightlyError[opt.mealCode] && (
                            <p className="text-xs text-red-600">{nightlyError[opt.mealCode]}</p>
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
                                      <span className="ml-1.5 inline-flex items-center rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-medium text-teal">
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

          {transferOptions.length > 0 && (
            <div className="border-t border-ink/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate/50">{t("roomTypeCard.transfer")}</span>
                {transferRequired && (
                  <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-medium text-coral">
                    {t("roomTypeCard.mandatoryChoice")}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-2.5">
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
                            className="h-4 w-4 accent-coral disabled:cursor-not-allowed"
                          />
                          <span className="text-ink">{opt.option.transfer_name ?? opt.option.transfer_type}</span>
                        </span>
                        {opt.price ? (
                          opt.price.total === 0 ? (
                            // A special-offer transfer discount can reach 100% (e.g.
                            // Siyam World's SWJ26 free-seaplane tier at 7+ nights) —
                            // $0 must never look like "no price computed" or be
                            // confused with the priceError branch below, so it gets
                            // its own explicit "included free" badge instead of a
                            // bare "USD 0" that's easy to misread as a glitch.
                            <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-medium text-coral">
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
                      </p>
                    </div>
                  );
                })}
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
                <span className="text-sm font-medium text-ink">
                  {t("roomTypeCard.grandTotalLabel", {
                    taxSuffix: mandatoryTax ? t("roomTypeCard.taxSuffix") : "",
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
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleAddToTrip}
                  className="w-full rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5"
                >
                  {addedToTripAt ? t("roomTypeCard.addedToTrip") : t("roomTypeCard.addToTrip")}
                </button>
              </div>
              {addToTripError && (
                <p className="mt-2 text-xs font-medium text-coral">{addToTripError}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
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
}: {
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
}) {
  const { t } = useTranslation("hotelSearch");
  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Set<number>>(new Set());
  const location = [hotel.island, hotel.city, hotel.country].filter(Boolean).join(", ");

  function toggleRoomType(id: number) {
    setExpandedRoomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-col sm:flex-row">
        <div className={`relative h-36 shrink-0 bg-gradient-to-br sm:h-auto sm:w-56 ${gradient}`}>
          {hotel.star_rating != null && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink">
              {"★".repeat(hotel.star_rating)} {hotel.star_rating}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-xl font-semibold text-ink">{hotel.hotel_name}</h3>
              <p className="mt-0.5 truncate text-sm text-slate/60">{location || "—"}</p>
            </div>
            {!hotel.contractId && (
              <span className="shrink-0 rounded-full bg-slate/10 px-2.5 py-1 text-xs font-medium text-slate/60">
                {t("hotelCard.noActiveContract")}
              </span>
            )}
          </div>

          {hotel.roomTypes.length === 0 ? (
            <p className="mt-4 text-sm text-slate/50">{t("hotelCard.noRoomTypes")}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {sortRoomTypesByPrice(hotel.roomTypes).map((rt) => (
                <RoomTypeCard
                  key={rt.id}
                  rt={rt}
                  expanded={expandedRoomTypes.has(rt.id)}
                  onToggle={() => toggleRoomType(rt.id)}
                  transferOptions={hotel.transferOptions}
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
                  onAddToTrip={onAddToTrip}
                />
              ))}
            </div>
          )}
        </div>
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
}: {
  cart: CartRoom[];
  onRemove: (key: string) => void;
  onCheckout: () => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[calc(100%-2rem)] max-w-sm sm:right-6 sm:bottom-6">
      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full appearance-none items-center justify-between border-0 bg-ink px-5 py-3.5 text-left text-white"
        >
          <span className="text-sm font-medium">{t("cart.title", { count: cart.length })}</span>
          <span className="text-xs text-white/70">{open ? t("cart.hide") : t("cart.show")}</span>
        </button>

        {open && (
          <div className="max-h-72 overflow-y-auto divide-y divide-ink/5">
            {cart.map((room) => (
              <div key={room.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{room.hotelName}</p>
                  <p className="text-xs text-slate/60">
                    {room.roomTypeName} · {room.mealPlanLabel}
                    {room.transferName ? ` · ${room.transferName}` : ""}
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
                  className="shrink-0 appearance-none rounded-md border-0 bg-transparent p-1 text-slate/40 transition-colors hover:bg-sand hover:text-coral"
                >
                  <IconMinus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-ink/10 p-3">
          <button
            type="button"
            onClick={onCheckout}
            className="w-full rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5"
          >
            {t("cart.checkout")}
          </button>
        </div>
      </div>
    </div>
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
  const { t } = useTranslation("hotelSearch");

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

  const [flight, setFlight] = useState<FlightDetails>({
    arrivalFlightNumber: "",
    arrivalFlightDate: "",
    arrivalFlightTime: "",
    departureFlightNumber: "",
    departureFlightDate: "",
    departureFlightTime: "",
  });

  function setFlightField<K extends keyof FlightDetails>(key: K, value: string) {
    setFlight((prev) => ({ ...prev, [key]: value }));
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

  const canSubmit = cart.every((room) => {
    const entry = roomGuests[room.key];
    if (!entry) return false;
    const adultsOk = entry.adults.every((a) => a.firstName.trim() && a.lastName.trim());
    const childrenOk = entry.children.every(
      (c, i) =>
        c.firstName.trim() &&
        c.lastName.trim() &&
        c.dateOfBirth &&
        !childAgeError(room, i, c.dateOfBirth)
    );
    return adultsOk && childrenOk;
  });

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
    if (!canSubmit) return;
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
          guests: flat.map((g, i) => ({
            first_name: g.firstName,
            last_name: g.lastName,
            date_of_birth: g.dateOfBirth || null,
            nationality: g.nationality || null,
            passport_number: g.passportNumber || null,
            passport_expiry: g.passportExpiry || null,
            is_lead_guest: i === 0,
          })),
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
                    {r.rejectionReason && <p className="text-xs text-coral">{r.rejectionReason}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.status === "Rejected" ? "bg-coral/10 text-coral" : "bg-teal/10 text-teal"
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
              className="mt-5 w-full rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5"
            >
              {t("cart.done")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
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

            <div className="mt-4 space-y-5">
              {cart.map((room, roomIndex) => {
                const entry = roomGuests[room.key];
                return (
                  <div key={room.key} className="rounded-xl border border-ink/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-coral">
                      {t("cart.roomNumber", { number: roomIndex + 1 })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink">{room.hotelName}</p>
                    <p className="text-xs text-slate/60">
                      {room.roomTypeName} · {room.mealPlanLabel}
                      {room.transferName ? ` · ${room.transferName}` : ""}
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
                          <p className="text-[11px] font-semibold text-slate/60">
                            {t("cart.touristLabel", { number: i + 1 })}
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.firstNamePlaceholder")}
                              value={a.firstName}
                              onChange={(e) => updateAdult(room.key, i, "firstName", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.lastNamePlaceholder")}
                              value={a.lastName}
                              onChange={(e) => updateAdult(room.key, i, "lastName", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.nationalityPlaceholder")}
                              value={a.nationality}
                              onChange={(e) => updateAdult(room.key, i, "nationality", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder={t("guestDetailsForm.passportNumberPlaceholder")}
                              value={a.passportNumber}
                              onChange={(e) => updateAdult(room.key, i, "passportNumber", e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                            />
                            <input
                              type="date"
                              placeholder={t("guestDetailsForm.passportExpiryPlaceholder")}
                              value={a.passportExpiry}
                              onChange={(e) => updateAdult(room.key, i, "passportExpiry", e.target.value)}
                              className="w-36 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                            />
                          </div>
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
                              <p className="text-[11px] font-semibold text-slate/60">
                                {t("cart.childLabel", { number: i + 1 })}
                              </p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.firstNamePlaceholder")}
                                  value={c.firstName}
                                  onChange={(e) => updateChild(room.key, i, "firstName", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.lastNamePlaceholder")}
                                  value={c.lastName}
                                  onChange={(e) => updateChild(room.key, i, "lastName", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                                />
                                <input
                                  type="date"
                                  value={c.dateOfBirth}
                                  onChange={(e) => updateChild(room.key, i, "dateOfBirth", e.target.value)}
                                  className={`w-36 rounded-lg border bg-white px-3 py-2 text-sm text-slate focus:outline-none ${
                                    error ? "border-coral" : "border-ink/15 focus:border-coral"
                                  }`}
                                />
                              </div>
                              <p className="text-[11px] text-slate/50">
                                {t("cart.expectedChildAge", { age: room.childAges[i] })}
                              </p>
                              {error && <p className="mt-0.5 text-xs font-medium text-coral">{error}</p>}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.nationalityPlaceholder")}
                                  value={c.nationality}
                                  onChange={(e) => updateChild(room.key, i, "nationality", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder={t("guestDetailsForm.passportNumberPlaceholder")}
                                  value={c.passportNumber}
                                  onChange={(e) => updateChild(room.key, i, "passportNumber", e.target.value)}
                                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                                />
                                <input
                                  type="date"
                                  placeholder={t("guestDetailsForm.passportExpiryPlaceholder")}
                                  value={c.passportExpiry}
                                  onChange={(e) => updateChild(room.key, i, "passportExpiry", e.target.value)}
                                  className="w-36 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-ink/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
                {t("cart.flightHeading")}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <input
                  type="text"
                  placeholder={t("guestDetailsForm.arrivalFlightNumberPlaceholder")}
                  value={flight.arrivalFlightNumber}
                  onChange={(e) => setFlightField("arrivalFlightNumber", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                />
                <input
                  type="date"
                  placeholder={t("cart.arrivalFlightDatePlaceholder")}
                  value={flight.arrivalFlightDate}
                  onChange={(e) => setFlightField("arrivalFlightDate", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                />
                <input
                  type="time"
                  placeholder={t("cart.arrivalFlightTimePlaceholder")}
                  value={flight.arrivalFlightTime}
                  onChange={(e) => setFlightField("arrivalFlightTime", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={t("guestDetailsForm.departureFlightNumberPlaceholder")}
                  value={flight.departureFlightNumber}
                  onChange={(e) => setFlightField("departureFlightNumber", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                />
                <input
                  type="date"
                  placeholder={t("cart.departureFlightDatePlaceholder")}
                  value={flight.departureFlightDate}
                  onChange={(e) => setFlightField("departureFlightDate", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                />
                <input
                  type="time"
                  placeholder={t("cart.departureFlightTimePlaceholder")}
                  value={flight.departureFlightTime}
                  onChange={(e) => setFlightField("departureFlightTime", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
                />
              </div>
            </div>

            {submitError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
                <IconAlert className="w-3.5 h-3.5" />
                {submitError}
              </div>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {submitting ? t("cart.submitting") : t("cart.submit")}
              </button>
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
    </div>
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

type HotelSearchProps = {
  onBack?: () => void;
  initialSearch?: InitialSearch;
};

function HotelSearch({ onBack, initialSearch }: HotelSearchProps) {
  const { t } = useTranslation("hotelSearch");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Same auth guard pattern as AgentDashboard_v2.tsx: check token first,
    // clear stale localStorage before redirecting so App's mount effect
    // doesn't read a leftover "role" and route straight back here.
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token) {
      localStorage.clear();
      window.location.href = "/login";
      return;
    }

    if (role !== "Agent" && role !== "agent") {
      alert(t("page.accessDenied"));
      window.location.href = "/";
      return;
    }

    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setCheckingAuth(false);
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
  const destinationSuggestions =
    debouncedDestination.trim().length >= 2
      ? catalogHotels.filter((h) => matchesDestination(h, debouncedDestination)).slice(0, 8)
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

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setDestinationDropdownOpen(false);

    if (!checkIn || !checkOut) {
      setFormError(t("page.datesRequired"));
      return;
    }
    if (checkOut <= checkIn) {
      setFormError(t("page.checkoutAfterCheckin"));
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return; // guarded above; satisfies TypeScript below
    if (!user) return; // guarded by the render-time check below; narrows for TypeScript here
    const agentId = user.id;

    setSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const allHotels = catalogLoaded
        ? catalogHotels
        : await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);
      const hotels = allHotels.filter((h) => matchesDestination(h, destination));

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
          if (contractId) {
            try {
              const rawOptions = await fetchJson<TransferOption[]>(
                `/contract-engine/contracts/${contractId}/transfer-options/available`,
                token
              );
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
                return { ...rt, options: [], priceError: t("page.noActiveContract") };
              }
              try {
                const mealPlans = await fetchJson<ContractMealPlan[]>(
                  `/contract-engine/contracts/${contractId}/room-types/${rt.id}/meal-plans`,
                  token
                );
                if (mealPlans.length === 0) {
                  return { ...rt, options: [], priceError: t("page.noMealPlansAvailable") };
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

                return { ...rt, options };
              } catch (err) {
                return {
                  ...rt,
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
            transferCurrency,
            mandatoryTax,
            roomTypes: roomTypeResults,
          };
        })
      );

      setResults(withRooms);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t("page.hotelsLoadFailed"));
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }

  if (checkingAuth || !user) {
    return <div className="min-h-screen bg-sand" />;
  }

  return (
    <div className="min-h-screen bg-sand font-sans text-slate">
      {/* Shared top nav (Phase 1 design system) -- replaces this page's own
          previously-separate top bar, and the generic Header.tsx App.tsx
          used to render above it (removed there; see App.tsx's own
          comment). Same component AgentDashboard_v2.tsx now uses. */}
      <AgentTopNav
        user={user}
        active="search"
        onNavigateSearch={() => {}}
        onNavigateDashboard={() => (onBack ? onBack() : (window.location.href = "/agent-dashboard"))}
      />

      {/* Hero band -- reuses the existing ink/coral/teal gradient already
          used elsewhere in this file (HotelCard's own image-placeholder
          gradients), standing in for a photo since this project has no
          photo-asset pipeline anywhere. The search card below overlaps
          its bottom edge via negative margin, matching the reference
          layout's prominence. */}
      <div className="bg-gradient-to-br from-ink via-ink to-coral/40 px-4 py-14 text-center sm:px-8 sm:py-20">
        <p className="text-xs font-semibold tracking-widest text-coral">{t("page.heroTag")}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-5xl">{t("page.heroTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">{t("page.heroSubtitle")}</p>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-8">
        <form
          onSubmit={handleSearch}
          className="-mt-10 rounded-2xl border border-ink/10 bg-white shadow-xl sm:-mt-12 sm:rounded-[2.5rem]"
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
            <div className="relative flex flex-1 flex-col gap-2 px-7 py-5 sm:py-7">
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate/50">
                <IconPin className="h-3.5 w-3.5 text-coral" />
                {t("page.destinationLabel")}
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestinationDropdownOpen(true);
                }}
                onFocus={() => setDestinationDropdownOpen(true)}
                placeholder={t("page.destinationPlaceholder")}
                className="w-full bg-transparent text-lg text-slate placeholder:text-slate/40 focus:outline-none sm:text-xl"
              />
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
                        onClick={() => {
                          setDestination(hotel.hotel_name);
                          setDestinationDropdownOpen(false);
                        }}
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

            <div className="flex flex-col gap-2 pt-5 sm:w-72 sm:shrink-0 sm:py-7">
              <label className="px-7 text-xs font-medium uppercase tracking-wide text-slate/50">{t("page.datesLabel")}</label>
              <DateRangePicker
                checkIn={checkIn}
                checkOut={checkOut}
                onChange={(ci, co) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                }}
                size="lg"
              />
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex flex-col gap-2 px-7 py-5 sm:w-64 sm:shrink-0 sm:py-7">
              <label className="text-xs font-medium uppercase tracking-wide text-slate/50">{t("page.guestsLabel")}</label>
              <div className="flex flex-col gap-2">
                <Counter label={t("page.adultsLabel")} value={adults} min={1} onChange={setAdults} />
                <Counter label={t("page.childrenLabel")} value={childAges.length} min={0} onChange={handleChildCountChange} />
                {childAges.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-2">
                    {childAges.map((age, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate/70">{t("page.childAgeLabel", { index: i + 1 })}</span>
                        <input
                          type="number"
                          min={0}
                          max={17}
                          value={age}
                          onChange={(e) => updateChildAge(i, Number(e.target.value))}
                          className="w-14 rounded-md border border-ink/15 bg-white px-2 py-1 text-center text-sm text-ink focus:border-coral focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex items-center px-5 py-4 sm:py-3 sm:pl-3 sm:pr-3 sm:shrink-0">
              <button
                type="submit"
                disabled={searching}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-coral px-8 py-3.5 text-base font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
              >
                <IconSearch className="h-4 w-4" />
                {searching ? t("page.searching") : t("page.searchButton")}
              </button>
            </div>
          </div>

          {formError && (
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-coral/10 px-4 py-2.5 text-sm font-medium text-coral">
              <IconAlert />
              {formError}
            </div>
          )}
        </form>

        {searchError && (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-coral/10 px-5 py-4 text-sm font-medium text-coral">
            <IconAlert />
            {t("page.searchErrorPrefix")} {searchError}
          </div>
        )}

        {!searching && hasSearched && !searchError && results.length === 0 && (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-coral/10 px-5 py-4 text-sm font-medium text-coral">
            <IconAlert />
            {t("page.noHotelsFound")}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {results.map((hotel, i) => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
              gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]}
              adults={occupancy.adults}
              childrenCount={occupancy.children}
              infants={occupancy.infants}
              childAges={childBucketAges}
              agentId={user.id}
              checkIn={checkIn}
              checkOut={checkOut}
              onAddToTrip={addToCart}
            />
          ))}
        </div>

        {/* Stage 5 -- floating trip-cart summary, only visible once at
            least one room has been added. Fully separate from the
            single-room "Забронировать" flow above. */}
        {cart.length > 0 && !checkoutOpen && (
          <CartPanel cart={cart} onRemove={removeFromCart} onCheckout={() => setCheckoutOpen(true)} />
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
