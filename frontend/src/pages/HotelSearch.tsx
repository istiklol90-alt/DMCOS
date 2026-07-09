import { useEffect, useRef, useState } from "react";
import { API_URL } from "../config";

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

type MealPlanOption = {
  mealCode: string;
  mealName: string | null;
  price?: RoomPrice;
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
    if (opt.price && (best === null || opt.price.final_total < best.price!.final_total)) {
      best = opt;
    }
  }
  return best;
}

function cheapestOptionPrice(rt: RoomTypeResult): number | null {
  return cheapestOption(rt)?.price?.final_total ?? null;
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Russian plural forms for the transfer price breakdown — count-driven,
// since the actual searched party composition (not a generic per-person
// rate) is what needs to read naturally in any of 1 / 2-4 / 5+ shapes.
function pluralAdults(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "взрослый";
  return "взрослых";
}

function pluralChildren(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "ребёнок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "ребёнка";
  return "детей";
}

function pluralInfants(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "младенец";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "младенца";
  return "младенцев";
}

// Real Maldives contracts (verified against Kandima's PDF) price a guest
// aged 12+ as an adult, 2-11.99 as a child, 0-1.99 as an infant — the exact
// buckets get_room_price/get_transfer_price already use. The search form
// only takes each child's age directly; adults/children/infants sent to
// every API call are derived from that, never entered as separate raw
// counts for children/infants.
function deriveOccupancy(
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
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate/70">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Уменьшить: ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconMinus />
        </button>
        <span className="w-4 text-center text-sm font-medium text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`Увеличить: ${label}`}
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

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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

function formatDateRangeLabel(checkIn: string, checkOut: string): string {
  if (!checkIn && !checkOut) return "Выберите даты";
  const fmt = (iso: string) => parseISODate(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (checkIn && checkOut) return `${fmt(checkIn)} – ${fmt(checkOut)}`;
  return `${fmt(checkIn || checkOut)} – ?`;
}

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (checkIn ? parseISODate(checkIn) : new Date()));
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
  const cells = buildMonthGrid(year, month);
  const monthLabel = viewDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
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
          {formatDateRangeLabel(checkIn, checkOut)}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-ink/10 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label="Предыдущий месяц"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-sand"
            >
              <IconChevronLeft />
            </button>
            <span className="text-sm font-medium capitalize text-ink">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label="Следующий месяц"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-sand"
            >
              <IconChevronRight />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-slate/40">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-sm">
            {cells.map((day, i) => {
              if (!day) return <span key={i} />;

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isPast = day < today;
              const isCheckIn = checkInDate && isSameDate(day, checkInDate);
              const isCheckOut = checkOutDate && isSameDate(day, checkOutDate);
              const isInRange =
                checkInDate && checkOutDate && day > checkInDate && day < checkOutDate;

              return (
                <button
                  key={i}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleDayClick(day)}
                  className={[
                    "mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
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
        Данные ведущего гостя
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Имя *"
          value={values.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          required
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder="Фамилия *"
          value={values.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          required
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder="Гражданство"
          value={values.nationality}
          onChange={(e) => set("nationality", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          placeholder="Дата рождения"
          value={values.dateOfBirth}
          onChange={(e) => set("dateOfBirth", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder="Номер паспорта"
          value={values.passportNumber}
          onChange={(e) => set("passportNumber", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="date"
          placeholder="Срок действия паспорта"
          value={values.passportExpiry}
          onChange={(e) => set("passportExpiry", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder="Номер рейса прилёта"
          value={values.arrivalFlightNumber}
          onChange={(e) => set("arrivalFlightNumber", e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
        />
        <input
          type="text"
          placeholder="Номер рейса вылета"
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
          {submitting ? "Отправка..." : "Подтвердить бронирование"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Отмена
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
  const [selectedMealCode, setSelectedMealCode] = useState<string | null>(null);
  const [selectedTransferType, setSelectedTransferType] = useState<string | null>(null);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<{
    bookingNumber: string;
    guestWarning: string | null;
  } | null>(null);

  const cheapest = cheapestOption(rt);
  const cheapestPerNight = cheapest?.price ? cheapest.price.final_total / cheapest.price.nights : null;

  const selectedMeal = rt.options.find((o) => o.mealCode === selectedMealCode) ?? null;
  const selectedTransfer = transferOptions.find((o) => o.option.transfer_type === selectedTransferType) ?? null;
  const selectedTransferTotal = selectedTransfer?.price?.total ?? null;
  const grandTotal =
    selectedMeal?.price
      ? selectedMeal.price.final_total + (selectedTransferTotal ?? 0) + (mandatoryTax?.total ?? 0)
      : null;

  async function handleBookingSubmit(guest: GuestFormValues) {
    const token = localStorage.getItem("token");
    if (!token || !selectedMealCode) return;
    if (transferRequired && transferOptions.length === 0) {
      setSubmitError(
        "Контракт требует трансфер, но ни один вариант трансфера не настроен — обратитесь к администратору контракта."
      );
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
            : "Не удалось сохранить данные гостя";
      }

      setBookingResult({ bookingNumber: booking.booking_number, guestWarning });
      setBookingFormOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось создать бронирование");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-ink">{rt.room_name}</h4>
          <p className="mt-0.5 text-xs text-slate/50">До {rt.max_occupancy} гостей</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {rt.priceError ? (
            <span className="text-xs font-medium text-slate/50">{rt.priceError}</span>
          ) : cheapest?.price && cheapestPerNight != null ? (
            <p className="text-right">
              <span className="text-xs text-slate/50">от</span>{" "}
              <span className="font-mono text-base font-semibold text-ink">
                {cheapest.price.currency}{" "}
                {cheapestPerNight.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              </span>{" "}
              <span className="text-xs text-slate/50">/ночь</span>
            </p>
          ) : (
            <span className="text-xs font-medium text-slate/50">Цены недоступны</span>
          )}

          {!rt.priceError && rt.options.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand"
            >
              {expanded ? "Скрыть тариф" : "Показать тариф"}
            </button>
          )}
        </div>
      </div>

      {expanded && !rt.priceError && (
        <>
          <div className="divide-y divide-ink/5 border-t border-ink/5 px-4">
            {rt.options.map((opt) => {
              const perNight = opt.price ? opt.price.final_total / opt.price.nights : null;
              const isSelected = selectedMealCode === opt.mealCode;
              return (
                <div
                  key={opt.mealCode}
                  className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${
                    isSelected ? "rounded-lg bg-coral/5 px-2" : ""
                  }`}
                >
                  <span className="text-sm font-medium text-ink">{opt.mealName ?? opt.mealCode}</span>

                  <div className="flex shrink-0 items-center gap-3">
                    {opt.price ? (
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-ink">
                          {opt.price.currency}{" "}
                          {perNight!.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
                          <span className="ml-1 text-xs font-normal text-slate/50">/ ночь</span>
                        </p>
                        <p className="text-[11px] text-slate/50">
                          Итого за {opt.price.nights} ноч.: {opt.price.currency}{" "}
                          {opt.price.final_total.toLocaleString("ru-RU")}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate/50">
                        {opt.priceError ?? "Цена недоступна"}
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
                      {isSelected ? "Выбрано" : "Выбрать"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {transferOptions.length > 0 && (
            <div className="border-t border-ink/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate/50">Трансфер</span>
                {transferRequired && (
                  <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-medium text-coral">
                    Обязательный выбор
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-2.5">
                {transferOptions.map((opt) => {
                  const adultTotal = opt.option.price_adult * adults;
                  const childTotal = opt.option.price_child * childrenCount;
                  const infantTotal = (opt.option.price_infant ?? 0) * infants;
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
                          <span className="font-mono text-xs font-semibold text-ink">
                            {transferCurrency} {opt.price.total.toLocaleString("ru-RU")}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate/50">
                            {opt.priceError ?? "Цена недоступна"}
                          </span>
                        )}
                      </label>
                      <p className="pl-6 text-[11px] leading-relaxed text-slate/50">
                        {adults} {pluralAdults(adults)} × {transferCurrency}{" "}
                        {opt.option.price_adult.toLocaleString("ru-RU")} = {transferCurrency}{" "}
                        {adultTotal.toLocaleString("ru-RU")}
                        {childrenCount > 0 && (
                          <>
                            <br />
                            {childrenCount} {pluralChildren(childrenCount)} × {transferCurrency}{" "}
                            {opt.option.price_child.toLocaleString("ru-RU")} = {transferCurrency}{" "}
                            {childTotal.toLocaleString("ru-RU")}
                          </>
                        )}
                        {infants > 0 && opt.option.price_infant != null && (
                          <>
                            <br />
                            {infants} {pluralInfants(infants)} × {transferCurrency}{" "}
                            {opt.option.price_infant.toLocaleString("ru-RU")} = {transferCurrency}{" "}
                            {infantTotal.toLocaleString("ru-RU")}
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
                <span className="text-xs font-medium text-slate/50">{mandatoryTax.label ?? "Обязательный налог"}</span>
                <span className="font-mono text-xs font-semibold text-ink">
                  {mandatoryTax.currency} {mandatoryTax.total.toLocaleString("ru-RU")}
                </span>
              </div>
              <p className="pl-0 text-[11px] leading-relaxed text-slate/50">
                {mandatoryTax.chargeable_guests} чел. × {mandatoryTax.currency}{" "}
                {mandatoryTax.rate_per_person_per_night.toLocaleString("ru-RU")}/ночь × {mandatoryTax.nights} ноч.
              </p>
            </div>
          )}

          {grandTotal != null && (
            <div className="border-t border-ink/10 bg-sand/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">
                  Итого (проживание + трансфер{mandatoryTax ? " + налог" : ""})
                </span>
                <span className="font-mono text-base font-semibold text-ink">
                  {selectedMeal!.price!.currency} {grandTotal.toLocaleString("ru-RU")}
                </span>
              </div>

              {bookingResult ? (
                <div className="mt-3 rounded-lg bg-teal/10 px-3 py-2.5 text-sm text-teal">
                  <p className="font-medium">Бронирование создано: № {bookingResult.bookingNumber}</p>
                  {bookingResult.guestWarning && (
                    <p className="mt-1 text-xs font-medium text-coral">
                      Данные гостя не сохранены: {bookingResult.guestWarning}. Пожалуйста, добавьте
                      гостя вручную.
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
                  Забронировать
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
                Нет активного контракта
              </span>
            )}
          </div>

          {hotel.roomTypes.length === 0 ? (
            <p className="mt-4 text-sm text-slate/50">Нет доступных типов номеров.</p>
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

type HotelSearchProps = {
  onBack?: () => void;
};

function HotelSearch({ onBack }: HotelSearchProps) {
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
      alert("⛔ Доступ запрещен! Только для агентов.");
      window.location.href = "/";
      return;
    }

    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setCheckingAuth(false);
  }, []);

  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
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
      setFormError("Укажите даты заезда и выезда.");
      return;
    }
    if (checkOut <= checkIn) {
      setFormError("Дата выезда должна быть позже даты заезда.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return; // guarded above; satisfies TypeScript below

    setSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const hotels = await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);

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
                    return { option, priceError: err instanceof Error ? err.message : "Цена недоступна" };
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
                return { ...rt, options: [], priceError: "Нет активного контракта" };
              }
              try {
                const mealPlans = await fetchJson<ContractMealPlan[]>(
                  `/contract-engine/contracts/${contractId}/room-types/${rt.id}/meal-plans`,
                  token
                );
                if (mealPlans.length === 0) {
                  return { ...rt, options: [], priceError: "Нет доступных тарифов для этого номера" };
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
                      return { mealCode: mp.meal_code, mealName: mp.meal_name, price };
                    } catch (err) {
                      return {
                        mealCode: mp.meal_code,
                        mealName: mp.meal_name,
                        priceError: err instanceof Error ? err.message : "Цена недоступна",
                      };
                    }
                  })
                );

                return { ...rt, options };
              } catch (err) {
                return {
                  ...rt,
                  options: [],
                  priceError: err instanceof Error ? err.message : "Не удалось загрузить тарифы",
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
      setSearchError(err instanceof Error ? err.message : "Не удалось загрузить список отелей.");
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
      <div className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-coral to-teal" />
            <span className="font-display text-lg font-semibold text-ink">DMC OS</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate/60 sm:inline">
              {getInitials(user.name)} · {user.name}
            </span>
            <button
              type="button"
              onClick={() => (onBack ? onBack() : (window.location.href = "/agent-dashboard"))}
              className="text-sm font-medium text-teal hover:underline"
            >
              ← Назад к дашборду
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <p className="text-xs font-semibold tracking-widest text-coral">ПОИСК И БРОНИРОВАНИЕ</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">Найти отель</h1>

        <form
          onSubmit={handleSearch}
          className="mt-6 rounded-2xl border border-ink/10 bg-white shadow-sm"
        >
          <div className="flex flex-col divide-y divide-ink/10 sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
            <div className="flex flex-1 flex-col gap-1 px-4 py-3">
              <label className="text-xs font-medium text-slate/50">Направление / отель</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Мальдивы, Rixos..."
                className="w-full bg-transparent text-sm text-slate placeholder:text-slate/40 focus:outline-none"
              />
              <p className="text-[11px] text-slate/40">
                Поиск по названию пока не поддерживается Hotel Engine — показаны все отели.
              </p>
            </div>

            <div className="flex flex-col gap-1 pt-3 sm:w-56 sm:shrink-0">
              <label className="px-4 text-xs font-medium text-slate/50">Даты</label>
              <DateRangePicker
                checkIn={checkIn}
                checkOut={checkOut}
                onChange={(ci, co) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                }}
              />
            </div>

            <div className="flex flex-col gap-1 px-4 py-3 sm:w-56 sm:shrink-0">
              <label className="text-xs font-medium text-slate/50">Гости</label>
              <div className="flex flex-col gap-2">
                <Counter label="Взрослые" value={adults} min={1} onChange={setAdults} />
                <Counter label="Дети" value={childAges.length} min={0} onChange={handleChildCountChange} />
                {childAges.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-2">
                    {childAges.map((age, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate/70">Возраст ребёнка {i + 1}</span>
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

            <div className="flex items-center px-4 py-3 sm:shrink-0">
              <button
                type="submit"
                disabled={searching}
                className="w-full rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
              >
                {searching ? "Ищем..." : "Найти"}
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
            Не удалось загрузить данные: {searchError}
          </div>
        )}

        {!searching && hasSearched && !searchError && results.length === 0 && (
          <p className="mt-6 text-sm text-slate/60">Отели не найдены.</p>
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
