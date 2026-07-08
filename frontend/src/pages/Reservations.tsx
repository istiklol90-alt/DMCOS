import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";

// ---------------------------------------------------------------------------
// Types (only the fields this screen actually reads)
// ---------------------------------------------------------------------------

interface Booking {
  id: number;
  booking_number: string;
  agent_id: number;
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
  status: string;
  currency: string;
  total_amount: number;
  transfer_type: string | null;
  transfer_total: number | null;
  special_requests: string | null;
  arrival_flight_number: string | null;
  departure_flight_number: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancellation_fee: number | null;
  created_at: string;
}

interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  is_lead_guest: boolean;
}

interface Hotel {
  id: number;
  hotel_name: string;
}

interface RoomType {
  id: number;
  room_name: string;
}

interface MealPlanInfo {
  meal_code: string;
  meal_name: string | null;
}

interface UserRecord {
  id: number;
  name: string;
}

interface CancellationPolicy {
  id: number;
  contract_id: number;
  days_before_arrival: number;
  penalty_type: string;
  penalty_value: number;
  currency: string | null;
  description: string | null;
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

type SortKey = "created_at" | "arrival_date" | "status" | "net";
type SortDir = "asc" | "desc";

const TERMINAL_STATUSES = ["Cancelled", "Rejected", "Completed"];

// ---------------------------------------------------------------------------
// Fetch helper — same pattern as HotelSearch.tsx's fetchJson
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<string, string> = {
  Draft: "Черновик",
  Pending: "В ожидании",
  Confirmed: "Подтверждено",
  Cancelled: "Отменено",
  Rejected: "Отклонено",
  Completed: "Завершено",
};

const STATUS_CLASSES: Record<string, string> = {
  Draft: "bg-slate/10 text-slate",
  Pending: "bg-coral/15 text-coral",
  Confirmed: "bg-teal/15 text-teal",
  Cancelled: "bg-slate/10 text-slate",
  Rejected: "bg-red-500/15 text-red-600",
  Completed: "bg-teal/15 text-teal",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_CLASSES[status] ?? "bg-slate/10 text-slate"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  return `${amount.toFixed(2)} ${currency}`;
}

function formatNumber(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return amount.toFixed(2);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU");
}

// ---------------------------------------------------------------------------
// AI insight strip — rule-based only (plain threshold checks below), NOT an
// LLM call. "AI" here means Level-1-Advisor style surfacing of patterns
// already present in stored data, no automated actions taken.
// ---------------------------------------------------------------------------

type AIFlag =
  | { kind: "pending_soon"; booking: Booking; daysUntilArrival: number }
  | { kind: "cancellation_deadline"; booking: Booking; nextThreshold: number; daysUntilCross: number };

function computePendingSoonFlags(bookings: Booking[]): AIFlag[] {
  const today = todayStr();
  return bookings
    .filter((b) => b.status === "Pending")
    .map((b) => ({ booking: b, daysUntilArrival: daysBetween(today, b.arrival_date) }))
    .filter((x) => x.daysUntilArrival <= 7)
    .map((x) => ({ kind: "pending_soon" as const, booking: x.booking, daysUntilArrival: x.daysUntilArrival }));
}

function computeCancellationDeadlineFlags(
  bookings: Booking[],
  tiersByKey: Record<string, CancellationPolicy[]>
): AIFlag[] {
  const today = todayStr();
  const flags: AIFlag[] = [];
  for (const b of bookings) {
    if (TERMINAL_STATUSES.includes(b.status)) continue;
    const daysUntilArrival = daysBetween(today, b.arrival_date);
    if (daysUntilArrival <= 0) continue; // already arrived — no future deadline to approach
    const key = `${b.contract_id}|${b.arrival_date}`;
    const tiers = tiersByKey[key];
    if (!tiers || tiers.length === 0) continue;

    // A tier's penalty applies once actual notice drops below its
    // days_before_arrival threshold. Flag the soonest threshold that
    // hasn't been crossed yet but will be within the next 3 days.
    let best: { threshold: number; gap: number } | null = null;
    for (const tier of tiers) {
      const gap = daysUntilArrival - tier.days_before_arrival;
      if (gap > 0 && gap <= 3) {
        if (!best || gap < best.gap) best = { threshold: tier.days_before_arrival, gap };
      }
    }
    if (best) {
      flags.push({
        kind: "cancellation_deadline",
        booking: b,
        nextThreshold: best.threshold,
        daysUntilCross: best.gap,
      });
    }
  }
  return flags;
}

function flagText(flag: AIFlag, hotelName: string): string {
  if (flag.kind === "pending_soon") {
    const days = flag.daysUntilArrival;
    const when =
      days < 0
        ? `заезд уже прошёл ${Math.abs(days)} дн. назад`
        : days === 0
          ? "заезд сегодня"
          : `заезд через ${days} дн.`;
    return `${flag.booking.booking_number} (${hotelName}) всё ещё "В ожидании" — ${when}`;
  }
  return `${flag.booking.booking_number} (${hotelName}) — через ${flag.daysUntilCross} дн. ужесточаются условия отмены (штраф начинает действовать за ${flag.nextThreshold} дн. до заезда)`;
}

function IconSparkle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5c.3 3.2 1.2 5.4 2.8 7 1.6 1.6 3.8 2.5 7 2.8-3.2.3-5.4 1.2-7 2.8-1.6 1.6-2.5 3.8-2.8 7-.3-3.2-1.2-5.4-2.8-7-1.6-1.6-3.8-2.5-7-2.8 3.2-.3 5.4-1.2 7-2.8 1.6-1.6 2.5-3.8 2.8-7Z" />
    </svg>
  );
}

function AIInsightStrip({ flags, hotels }: { flags: AIFlag[]; hotels: Record<number, string> }) {
  const [expanded, setExpanded] = useState(false);

  if (flags.length === 0) return null;

  const first = flags[0];
  const firstHotelName = hotels[first.booking.hotel_id] ?? `#${first.booking.hotel_id}`;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-ink px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral/20 text-coral">
          <IconSparkle className="w-4 h-4" />
        </span>
        <div className="text-sm leading-relaxed text-white/90">
          <p>
            <span className="font-medium text-white">AI заметил:</span> {flagText(first, firstHotelName)}
            {flags.length > 1 && <span className="text-white/60"> (и ещё {flags.length - 1})</span>}
          </p>
          {expanded && flags.length > 1 && (
            <ul className="mt-2 space-y-1 text-white/70">
              {flags.slice(1).map((f, i) => (
                <li key={i}>— {flagText(f, hotels[f.booking.hotel_id] ?? `#${f.booking.hotel_id}`)}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-white/40">
            Правила на основе пороговых значений, вычисляются на лету — не вызов LLM.
          </p>
        </div>
      </div>
      {flags.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 self-start rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 sm:self-auto"
        >
          {expanded ? "Свернуть" : "Посмотреть детали"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — guests, meal plan, transfer, cancellation info, and an
// on-demand re-derived price breakdown for one booking
// ---------------------------------------------------------------------------

function BookingDetail({
  booking,
  hotelName,
  roomTypeName,
  mealPlanInfo,
  onClose,
}: {
  booking: Booking;
  hotelName: string;
  roomTypeName: string;
  mealPlanInfo: MealPlanInfo | undefined;
  onClose: () => void;
}) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [roomBreakdown, setRoomBreakdown] = useState<RoomPriceBreakdown | null>(null);
  const [transferBreakdown, setTransferBreakdown] = useState<TransferPriceBreakdown | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Guest[]>(`/booking-engine/bookings/${booking.id}/guests`, token)
      .then(setGuests)
      .catch((err) => setGuestsError(err.message));
  }, [booking.id]);

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

    const promises: Promise<void>[] = [
      fetchJson<RoomPriceBreakdown>(
        `/contract-engine/contracts/${booking.contract_id}/room-types/${booking.room_type_id}/price?${roomPriceParams}`,
        token
      )
        .then(setRoomBreakdown)
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
  }, [booking, mealPlanInfo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">{booking.booking_number}</h3>
            <p className="mt-1 text-sm text-slate/70">{hotelName} — {roomTypeName}</p>
          </div>
          <button
            onClick={onClose}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-slate/70 hover:bg-sand/60"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4">
          <StatusBadge status={booking.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-slate/50">Дата брони: </span>
            <span className="text-ink">{formatDate(booking.created_at)}</span>
          </div>
          <div>
            <span className="text-slate/50">Даты: </span>
            <span className="text-ink">{formatDate(booking.arrival_date)} — {formatDate(booking.departure_date)} ({booking.nights} ноч.)</span>
          </div>
          <div>
            <span className="text-slate/50">Гости: </span>
            <span className="text-ink">{booking.adults} взр. / {booking.children} дет. / {booking.infants} млад.</span>
          </div>
          <div>
            <span className="text-slate/50">Питание: </span>
            <span className="text-ink">{mealPlanInfo?.meal_name || mealPlanInfo?.meal_code || `#${booking.meal_plan_id}`}</span>
          </div>
          {booking.arrival_flight_number && (
            <div>
              <span className="text-slate/50">Рейс прилёта: </span>
              <span className="text-ink">{booking.arrival_flight_number}</span>
            </div>
          )}
          {booking.departure_flight_number && (
            <div>
              <span className="text-slate/50">Рейс вылета: </span>
              <span className="text-ink">{booking.departure_flight_number}</span>
            </div>
          )}
          {booking.special_requests && (
            <div className="col-span-2">
              <span className="text-slate/50">Пожелания: </span>
              <span className="text-ink">{booking.special_requests}</span>
            </div>
          )}
        </div>

        {/* ===== Net / Sale / Profit ===== */}
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-sand/50 p-3 text-sm">
          <div>
            <p className="text-slate/50">Net cost</p>
            <p className="font-medium text-ink">
              {formatMoney((booking.total_amount || 0) + (booking.transfer_total || 0), booking.currency)}
            </p>
          </div>
          <div>
            <p className="text-slate/50">Sale price</p>
            <p className="font-medium text-ink">
              {formatMoney((booking.total_amount || 0) + (booking.transfer_total || 0), booking.currency)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-slate/50">
              Profit
              <span
                className="cursor-help text-slate/40"
                title="Наценка агента ещё не реализована — Pricing Engine (Decision 009)"
              >
                ⓘ
              </span>
            </p>
            <p className="font-medium text-ink">—</p>
          </div>
        </div>

        {/* ===== Re-derived price breakdown ===== */}
        <div className="mt-4 rounded-lg border border-ink/10 p-3 text-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium uppercase tracking-wide text-slate/50">Разбивка стоимости</h4>
          </div>
          <p className="mt-1 text-xs text-slate/50">
            Расчёт на текущих условиях контракта — может отличаться, если цены изменились после бронирования.
          </p>
          {breakdownLoading && <p className="mt-2 text-slate/50">Пересчёт...</p>}
          {breakdownError && <p className="mt-2 text-red-600">{breakdownError}</p>}
          {roomBreakdown && (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              <div><span className="text-slate/50">База: </span><span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">Доплаты: </span><span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">До промо: </span><span className="text-ink">{formatMoney(roomBreakdown.price_before_promotions, roomBreakdown.currency)}</span></div>
              <div><span className="text-slate/50">Итог проживания: </span><span className="text-ink">{formatMoney(roomBreakdown.final_total, roomBreakdown.currency)}</span></div>
            </div>
          )}
          {transferBreakdown && (
            <div className="mt-2 border-t border-ink/5 pt-2">
              <p className="text-slate/50">Трансфер ({transferBreakdown.transfer_name}): <span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span></p>
            </div>
          )}
        </div>

        {booking.status === "Cancelled" && (
          <div className="mt-4 rounded-lg bg-slate/5 p-3 text-sm">
            <p className="font-medium text-ink">Отмена</p>
            <p className="mt-1 text-slate/70">Причина: {booking.cancellation_reason || "—"}</p>
            <p className="text-slate/70">Дата отмены: {booking.cancelled_at ? formatDate(booking.cancelled_at) : "—"}</p>
            <p className="text-slate/70">Штраф: {formatMoney(booking.cancellation_fee, booking.currency)}</p>
          </div>
        )}

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate/50">Гости</h4>
          {guestsError && <p className="text-sm text-red-600">{guestsError}</p>}
          {!guests && !guestsError && <p className="text-sm text-slate/50">Загрузка...</p>}
          {guests && guests.length === 0 && <p className="text-sm text-slate/50">Гости не добавлены</p>}
          {guests && guests.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center gap-2 rounded-lg bg-sand/50 px-3 py-2">
                  <span className="font-medium text-ink">{g.first_name} {g.last_name}</span>
                  {g.is_lead_guest && (
                    <span className="rounded-full bg-coral/15 px-2 py-0.5 text-xs text-coral">Основной</span>
                  )}
                  {g.nationality && <span className="text-slate/60">· {g.nationality}</span>}
                  {g.date_of_birth && <span className="text-slate/60">· {formatDate(g.date_of_birth)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Reservations screen
// ---------------------------------------------------------------------------

const Reservations = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [roomTypes, setRoomTypes] = useState<Record<number, string>>({});
  const [mealPlans, setMealPlans] = useState<Record<number, MealPlanInfo>>({});
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  const [cancellationTiers, setCancellationTiers] = useState<Record<string, CancellationPolicy[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);

        const bookingsData = await fetchJson<Booking[]>("/booking-engine/bookings?limit=500", token);
        setBookings(bookingsData);

        const hotelsData = await fetchJson<Hotel[]>("/hotel-engine/hotels", token);
        const hotelMap: Record<number, string> = {};
        hotelsData.forEach((h) => (hotelMap[h.id] = h.hotel_name));
        setHotels(hotelMap);

        const usersData = await fetchJson<UserRecord[]>("/users", token);
        const userMap: Record<number, string> = {};
        usersData.forEach((u) => (userMap[u.id] = u.name));
        setAgentNames(userMap);

        const uniqueHotelIds = Array.from(new Set(bookingsData.map((b) => b.hotel_id)));
        const roomTypeMap: Record<number, string> = {};
        await Promise.all(
          uniqueHotelIds.map(async (hotelId) => {
            const roomTypesData = await fetchJson<RoomType[]>(
              `/hotel-engine/hotels/${hotelId}/room-types`,
              token
            );
            roomTypesData.forEach((rt) => (roomTypeMap[rt.id] = rt.room_name));
          })
        );
        setRoomTypes(roomTypeMap);

        const uniqueContractIds = Array.from(new Set(bookingsData.map((b) => b.contract_id)));
        const mealPlanMap: Record<number, MealPlanInfo> = {};
        await Promise.all(
          uniqueContractIds.map(async (contractId) => {
            const mealPlansData = await fetchJson<
              { id: number; meal_code: string; meal_name: string | null }[]
            >(`/contract-engine/contracts/${contractId}/meal-plans`, token);
            mealPlansData.forEach((mp) => (mealPlanMap[mp.id] = { meal_code: mp.meal_code, meal_name: mp.meal_name }));
          })
        );
        setMealPlans(mealPlanMap);

        // Cancellation tiers — only for non-terminal bookings with a future
        // check-in, one call per unique (contract_id, arrival_date) pair.
        const today = todayStr();
        const nonTerminalFuture = bookingsData.filter(
          (b) => !TERMINAL_STATUSES.includes(b.status) && b.arrival_date > today
        );
        const uniqueKeys = Array.from(
          new Set(nonTerminalFuture.map((b) => `${b.contract_id}|${b.arrival_date}`))
        );
        const tiersMap: Record<string, CancellationPolicy[]> = {};
        await Promise.all(
          uniqueKeys.map(async (key) => {
            const [contractId, checkIn] = key.split("|");
            const tiers = await fetchJson<CancellationPolicy[]>(
              `/contract-engine/contracts/${contractId}/cancellation-policies?check_in=${checkIn}`,
              token
            );
            tiersMap[key] = tiers;
          })
        );
        setCancellationTiers(tiersMap);
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки бронирований");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const aiFlags = useMemo(() => {
    return [
      ...computePendingSoonFlags(bookings),
      ...computeCancellationDeadlineFlags(bookings, cancellationTiers),
    ];
  }, [bookings, cancellationTiers]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.status))).sort(),
    [bookings]
  );

  const netOf = (b: Booking) => (b.total_amount || 0) + (b.transfer_total || 0);

  const filteredSorted = useMemo(() => {
    let list = bookings;
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    if (hotelFilter !== "all") list = list.filter((b) => String(b.hotel_id) === hotelFilter);

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === "arrival_date") cmp = a.arrival_date.localeCompare(b.arrival_date);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "net") cmp = netOf(a) - netOf(b);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [bookings, statusFilter, hotelFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  if (loading) {
    return <p className="mt-10 text-center text-sm text-slate/60">Загрузка бронирований...</p>;
  }

  if (error) {
    return <p className="mt-10 text-center text-sm text-red-600">Ошибка: {error}</p>;
  }

  return (
    <div>
      <AIInsightStrip flags={aiFlags} hotels={hotels} />

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        >
          <option value="all">Все статусы</option>
          {availableStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>

        <select
          value={hotelFilter}
          onChange={(e) => setHotelFilter(e.target.value)}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        >
          <option value="all">Все отели</option>
          {Object.entries(hotels).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        {(statusFilter !== "all" || hotelFilter !== "all") && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setHotelFilter("all");
            }}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("created_at")}
              >
                Дата брони{sortArrow("created_at")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("arrival_date")}
              >
                Заезд → Выезд{sortArrow("arrival_date")}
              </th>
              <th className="px-4 py-3 font-medium">Агент</th>
              <th className="px-4 py-3 font-medium">Отель</th>
              <th className="px-4 py-3 font-medium">Тип номера</th>
              <th className="px-4 py-3 font-medium">№ брони</th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("status")}
              >
                Статус{sortArrow("status")}
              </th>
              <th className="px-4 py-3 font-medium">Валюта</th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium"
                onClick={() => toggleSort("net")}
              >
                Net cost{sortArrow("net")}
              </th>
              <th className="px-4 py-3 font-medium">Sale price</th>
              <th className="px-4 py-3 font-medium">Profit</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate/50">
                  Бронирования не найдены
                </td>
              </tr>
            ) : (
              filteredSorted.map((b) => {
                const net = netOf(b);
                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="cursor-pointer border-b border-ink/5 last:border-b-0 hover:bg-sand/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">{formatDate(b.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                      {formatDate(b.arrival_date)} → {formatDate(b.departure_date)}
                    </td>
                    <td className="px-4 py-3.5 text-slate/80">{agentNames[b.agent_id] ?? `#${b.agent_id}`}</td>
                    <td className="px-4 py-3.5 text-slate/80">{hotels[b.hotel_id] ?? `#${b.hotel_id}`}</td>
                    <td className="px-4 py-3.5 text-slate/80">{roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}</td>
                    <td className="px-4 py-3.5 font-medium text-ink">{b.booking_number}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3.5 text-slate/70">{b.currency}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(net)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{formatNumber(net)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className="cursor-help text-slate/40"
                        title="Наценка агента ещё не реализована — Pricing Engine (Decision 009)"
                      >
                        —
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-slate/60">
        Всего: <strong className="text-ink">{filteredSorted.length}</strong> бронирований
      </div>

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          hotelName={hotels[selectedBooking.hotel_id] ?? `#${selectedBooking.hotel_id}`}
          roomTypeName={roomTypes[selectedBooking.room_type_id] ?? `#${selectedBooking.room_type_id}`}
          mealPlanInfo={mealPlans[selectedBooking.meal_plan_id]}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  );
};

export default Reservations;
