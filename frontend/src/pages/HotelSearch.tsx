import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "../i18n/i18n";
import { API_URL } from "../config";
import AgentTopNav from "../components/layout/AgentTopNav";

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

// Minimal shapes — only the fields this page actually reads from
// BookingResponse/GuestResponse, not the full Pydantic schemas.
type BookingCreateResult = {
  id: number;
  booking_number: string;
};

type GuestFormValues = {
  firstName: string;
  lastName: string;
  nationality: string;
  dateOfBirth: string;
  passportNumber: string;
  passportExpiry: string;
  arrivalFlightNumber: string;
  departureFlightNumber: string;
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
}: {
  t: TFunction;
  lang: string;
  year: number;
  month: number;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  onDayClick: (day: Date) => void;
}) {
  const cells = buildMonthGrid(year, month);
  const locale = localeOf(lang);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdayLabels = t("dateRangePicker.weekdays", { returnObjects: true }) as string[];

  return (
    <div className="w-56">
      <p className="text-center text-sm font-medium capitalize text-ink">{monthLabel}</p>
      <div className="mt-2.5 grid grid-cols-7 gap-y-0.5 text-center text-[10px] font-medium text-slate/40">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-y-0.5 text-center text-xs">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isPast = day < today;
          const isCheckIn = checkInDate && isSameDate(day, checkInDate);
          const isCheckOut = checkOutDate && isSameDate(day, checkOutDate);
          const isInRange = checkInDate && checkOutDate && day > checkInDate && day < checkOutDate;

          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onDayClick(day)}
              className={[
                "mx-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                isPast ? "cursor-not-allowed text-slate/20" : "text-ink hover:bg-sand",
                isCheckIn || isCheckOut ? "bg-coral text-white hover:bg-coral" : "",
                isInRange ? "bg-coral/10" : "",
              ].join(" ")}
            >
              {day.getDate()}
            </button>
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
    if (day < today) return;

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
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate"
      >
        <IconCalendar className="w-4 h-4 shrink-0 text-slate/50" />
        <span className={checkIn || checkOut ? "text-slate" : "text-slate/40"}>
          {formatDateRangeLabel(t, lang, checkIn, checkOut)}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-fit rounded-2xl border border-ink/10 bg-white p-3 shadow-lg">
          <div className="mb-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDateMode("specific")}
              className={`appearance-none rounded-full border-0 px-4 py-1.5 text-xs font-medium transition-colors ${
                dateMode === "specific" ? "bg-ink text-white" : "bg-transparent text-slate/50 hover:text-ink"
              }`}
            >
              {t("dateRangePicker.specificDates")}
            </button>
            <button
              type="button"
              onClick={() => setDateMode("flexible")}
              className={`appearance-none rounded-full border-0 px-4 py-1.5 text-xs font-medium transition-colors ${
                dateMode === "flexible" ? "bg-ink text-white" : "bg-transparent text-slate/50 hover:text-ink"
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
            />
            <MonthGrid
              t={t}
              lang={lang}
              year={nextMonthDate.getFullYear()}
              month={nextMonthDate.getMonth()}
              checkInDate={checkInDate}
              checkOutDate={checkOutDate}
              onDayClick={handleDayClick}
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
// Guest details form — collects the lead guest only (v1 scope). Shown once
// a room type has both a meal plan and a transfer selected.
// ---------------------------------------------------------------------------

function GuestDetailsForm({
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: GuestFormValues) => void;
}) {
  const { t } = useTranslation("hotelSearch");
  const [values, setValues] = useState<GuestFormValues>({
    firstName: "",
    lastName: "",
    nationality: "",
    dateOfBirth: "",
    passportNumber: "",
    passportExpiry: "",
    arrivalFlightNumber: "",
    departureFlightNumber: "",
  });

  function set<K extends keyof GuestFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.firstName.trim() || !values.lastName.trim()) return;
    onSubmit(values);
  }

  const canSubmit = values.firstName.trim() !== "" && values.lastName.trim() !== "" && !submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-ink/10 bg-sand/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
        {t("guestDetailsForm.title")}
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input
          type="text"
          placeholder={t("guestDetailsForm.firstNamePlaceholder")}
          value={values.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          required
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder={t("guestDetailsForm.lastNamePlaceholder")}
          value={values.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          required
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder={t("guestDetailsForm.nationalityPlaceholder")}
          value={values.nationality}
          onChange={(e) => set("nationality", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          placeholder={t("guestDetailsForm.dateOfBirthPlaceholder")}
          value={values.dateOfBirth}
          onChange={(e) => set("dateOfBirth", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder={t("guestDetailsForm.passportNumberPlaceholder")}
          value={values.passportNumber}
          onChange={(e) => set("passportNumber", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          placeholder={t("guestDetailsForm.passportExpiryPlaceholder")}
          value={values.passportExpiry}
          onChange={(e) => set("passportExpiry", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder={t("guestDetailsForm.arrivalFlightNumberPlaceholder")}
          value={values.arrivalFlightNumber}
          onChange={(e) => set("arrivalFlightNumber", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder={t("guestDetailsForm.departureFlightNumberPlaceholder")}
          value={values.departureFlightNumber}
          onChange={(e) => set("departureFlightNumber", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
          <IconAlert className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-coral px-4 py-2 text-xs font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting ? t("guestDetailsForm.sending") : t("guestDetailsForm.confirmBooking")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("guestDetailsForm.cancel")}
        </button>
      </div>
    </form>
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
  agentId,
  checkIn,
  checkOut,
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
  agentId: number;
  checkIn: string;
  checkOut: string;
}) {
  const { t, i18n: i18nInstance } = useTranslation("hotelSearch");
  const lang = i18nInstance.language;
  const [selectedMealCode, setSelectedMealCode] = useState<string | null>(null);
  const [selectedTransferType, setSelectedTransferType] = useState<string | null>(null);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<{
    bookingNumber: string;
    guestWarning: string | null;
  } | null>(null);

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

  async function handleBookingSubmit(guest: GuestFormValues) {
    const token = localStorage.getItem("token");
    if (!token || !selectedMealCode) return;
    if (transferRequired && transferOptions.length === 0) {
      setSubmitError(t("roomTypeCard.transferRequiredError"));
      return;
    }
    if (transferRequired && !selectedTransferType) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const booking = await fetchJson<BookingCreateResult>("/booking-engine/bookings", token, {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          hotel_id: rt.hotel_id,
          room_type_id: rt.id,
          meal_plan: selectedMealCode,
          arrival_date: checkIn,
          departure_date: checkOut,
          adults,
          children: childrenCount,
          infants,
          transfer_type: selectedTransferType,
          arrival_flight_number: guest.arrivalFlightNumber || null,
          departure_flight_number: guest.departureFlightNumber || null,
        }),
      });

      let guestWarning: string | null = null;
      try {
        await fetchJson("/booking-engine/guests", token, {
          method: "POST",
          body: JSON.stringify({
            booking_id: booking.id,
            first_name: guest.firstName,
            last_name: guest.lastName,
            nationality: guest.nationality || null,
            date_of_birth: guest.dateOfBirth || null,
            passport_number: guest.passportNumber || null,
            passport_expiry: guest.passportExpiry || null,
            is_lead_guest: true,
          }),
        });
      } catch (guestErr) {
        // Booking Engine has no transactional link between a Booking and
        // its Guest rows (same best-effort-not-transactional precedent as
        // Decision 012) — the booking is real and already holds inventory,
        // so we surface it as a success with a warning rather than trying
        // to auto-cancel it.
        guestWarning =
          guestErr instanceof Error
            ? guestErr.message
            : t("roomTypeCard.guestSaveFailed");
      }

      setBookingResult({ bookingNumber: booking.booking_number, guestWarning });
      setBookingFormOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("roomTypeCard.bookingFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-ink">{rt.room_name}</h4>
          <p className="mt-0.5 text-xs text-slate/50">{t("roomTypeCard.maxGuests", { count: rt.max_occupancy })}</p>
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

              {bookingResult ? (
                <div className="mt-3 rounded-lg bg-teal/10 px-3 py-2.5 text-sm text-teal">
                  <p className="font-medium">{t("roomTypeCard.bookingCreated", { number: bookingResult.bookingNumber })}</p>
                  {bookingResult.guestWarning && (
                    <p className="mt-1 text-xs font-medium text-coral">
                      {t("roomTypeCard.guestDataNotSaved", { error: bookingResult.guestWarning })}
                    </p>
                  )}
                </div>
              ) : bookingFormOpen ? (
                <div className="mt-3">
                  <GuestDetailsForm
                    submitting={submitting}
                    error={submitError}
                    onCancel={() => {
                      setBookingFormOpen(false);
                      setSubmitError(null);
                    }}
                    onSubmit={handleBookingSubmit}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setBookingFormOpen(true)}
                  className="mt-3 w-full rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5"
                >
                  {t("roomTypeCard.bookNow")}
                </button>
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
  agentId,
  checkIn,
  checkOut,
}: {
  hotel: HotelResult;
  gradient: string;
  adults: number;
  childrenCount: number;
  infants: number;
  agentId: number;
  checkIn: string;
  checkOut: string;
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
                  agentId={agentId}
                  checkIn={checkIn}
                  checkOut={checkOut}
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
      const allHotels = await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);
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
          className="-mt-10 rounded-2xl border border-ink/10 bg-white shadow-xl sm:-mt-12"
        >
          {/* Decision (search-panel restyle): the old divide-x/divide-y
              utilities drew a full-height border between every field.
              Replaced with explicit inset divider elements (self-stretch +
              vertical margin shrinks the visible line to shorter than the
              field's own height, "not a full border") plus extra gap
              spacing as the primary separator -- the outer panel's own
              border/shadow (on the form element itself) is untouched. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
            <div className="flex flex-1 flex-col gap-1.5 px-5 py-4 sm:py-6">
              <label className="text-xs font-medium text-slate/50">{t("page.destinationLabel")}</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={t("page.destinationPlaceholder")}
                className="w-full bg-transparent text-base text-slate placeholder:text-slate/40 focus:outline-none"
              />
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex flex-col gap-1.5 pt-4 sm:w-64 sm:shrink-0 sm:py-6">
              <label className="px-5 text-xs font-medium text-slate/50">{t("page.datesLabel")}</label>
              <DateRangePicker
                checkIn={checkIn}
                checkOut={checkOut}
                onChange={(ci, co) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                }}
              />
            </div>

            <div className="hidden w-px self-stretch bg-ink/10 sm:my-5 sm:block" />

            <div className="flex flex-col gap-1.5 px-5 py-4 sm:w-64 sm:shrink-0 sm:py-6">
              <label className="text-xs font-medium text-slate/50">{t("page.guestsLabel")}</label>
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

            <div className="flex items-center px-5 py-4 sm:py-6 sm:pl-6 sm:pr-2 sm:shrink-0">
              <button
                type="submit"
                disabled={searching}
                className="w-full rounded-xl bg-coral px-8 py-3.5 text-base font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
              >
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
          <p className="mt-6 text-sm text-slate/60">{t("page.noHotelsFound")}</p>
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
              agentId={user.id}
              checkIn={checkIn}
              checkOut={checkOut}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

export default HotelSearch;
