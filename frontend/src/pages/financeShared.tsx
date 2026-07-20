import { useEffect, useState } from "react";
import { API_URL } from "../config";

// ---------------------------------------------------------------------------
// Shared across the Финансы feature cluster (Счета / Баланс / Кэшбэк,
// each its own top-level AdminPanel tab as of the Decision 088 restructure
// -- previously one "Финансы" tab crammed everything together, which
// doesn't scale to a realistic 100 agents x 100 bookings volume). This
// module holds the genuinely-shared, must-stay-identical logic
// (InvoiceDetailModal, isUrgentFlag, AgentSearchSelect) rather than
// duplicating it across three page files, unlike this codebase's usual
// per-page-self-contained convention -- justified here because these
// three pages are facets of one restructured feature built together, not
// unrelated pages that happen to share a few small utils.
// ---------------------------------------------------------------------------

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
  review_flag: string | null;
  flag_acknowledged_at: string | null;
  flag_acknowledged_by: number | null;
  created_by: number;
  approved_by: number | null;
  approved_at: string | null;
  voided_by: number | null;
  voided_at: string | null;
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
    let detail = `Ошибка запроса (${response.status})`;
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
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU");
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

// A flagged invoice only counts as "urgent" (red row, sort-to-top, badge)
// while it's still unacknowledged AND not Void -- both approval (via
// flag_acknowledged_at) and voiding exit urgent, without ever clearing
// review_flag's own text, which stays as permanent history either way.
export function isUrgentFlag(inv: Invoice): boolean {
  return Boolean(inv.review_flag) && !inv.flag_acknowledged_at && inv.status !== "Void";
}

// "Void" (Invoice) and "Cancelled" (Booking) are deliberately NOT
// unified into one word -- an invoice can be voided for reasons
// unrelated to the booking (e.g. a data-entry correction on an
// otherwise-valid booking). The label stays "Аннулирован" always, with
// a qualifier appended only when the linked booking is actually
// terminal too.
export function voidLabel(bookingStatus: string | null): string {
  if (bookingStatus === "Cancelled") return "Аннулирован (бронь отменена)";
  if (bookingStatus === "Rejected") return "Аннулирован (бронь отклонена отелем)";
  return "Аннулирован";
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
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-[280px]">
      <input
        type="text"
        placeholder="Введите имя агента (мин. 2 символа)..."
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
            <p className="px-4 py-3 text-sm text-slate/50">Поиск...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate/50">Агенты не найдены</p>
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
      alert(err.message || "Не удалось отметить как проверено");
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
      .catch((err: any) => setError(err.message || "Не удалось загрузить детали бронирования"))
      .finally(() => setLoading(false));
  }, [invoice.booking_id]);

  const liveTotal = booking
    ? booking.total_amount + (booking.transfer_total || 0) + (booking.mandatory_tax_total || 0)
    : null;
  const mismatch = liveTotal !== null && Math.abs(liveTotal - invoice.total) > 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            Счёт {invoice.invoice_number}
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
            Закрыть
          </button>
        </div>

        <div className="mt-3 space-y-0.5 text-xs text-slate/50">
          <p>Создано: {actorNames[invoice.created_by] ?? `#${invoice.created_by}`}, {formatDate(invoice.issue_date)}</p>
          {invoice.approved_by !== null && invoice.approved_at && (
            <p>Одобрено: {actorNames[invoice.approved_by] ?? `#${invoice.approved_by}`}, {formatDate(invoice.approved_at)}</p>
          )}
          {invoice.voided_by !== null && invoice.voided_at && (
            <p>Аннулировано: {actorNames[invoice.voided_by] ?? `#${invoice.voided_by}`}, {formatDate(invoice.voided_at)}</p>
          )}
        </div>

        {invoice.review_flag && (
          isUrgentFlag(invoice) ? (
            <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
              <div>⚠ {invoice.review_flag}</div>
              {invoice.status === "Issued" && (
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="mt-2 appearance-none rounded-lg border-0 bg-coral px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {acknowledging ? "..." : "Отметить как проверено"}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-xs text-slate/60">
              {invoice.flag_acknowledged_at
                ? `Изменено (проверено ${
                    invoice.flag_acknowledged_by !== null
                      ? actorNames[invoice.flag_acknowledged_by] ?? `#${invoice.flag_acknowledged_by}`
                      : "—"
                  }, ${formatDate(invoice.flag_acknowledged_at)}): ${invoice.review_flag}`
                : invoice.review_flag}
            </div>
          )
        )}

        {invoice.review_flag && !loading && !error && liveTotal !== null && (
          <div className="mt-3 rounded-lg border border-ink/10 bg-sand/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate/70">
                Было: <strong className="text-ink">{formatMoney(invoice.total, invoice.currency)}</strong>{" "}
                <span className="text-slate/50">(зафиксировано {formatDate(invoice.issue_date)})</span>
              </span>
              <span className="text-slate/40">→</span>
              <span className="text-slate/70">
                Стало: <strong className="text-ink">{formatMoney(liveTotal, invoice.currency)}</strong>{" "}
                <span className="text-slate/50">(сейчас)</span>
              </span>
            </div>
            <div className="mt-1">
              {Math.abs(liveTotal - invoice.total) <= 0.01 ? (
                <span className="text-slate/50">Без изменений в сумме</span>
              ) : (
                <span className={liveTotal > invoice.total ? "font-medium text-coral" : "font-medium text-teal"}>
                  Разница: {liveTotal > invoice.total ? "+" : ""}
                  {formatMoney(liveTotal - invoice.total, invoice.currency)}
                </span>
              )}
            </div>
          </div>
        )}

        {loading && <p className="mt-6 text-center text-sm text-slate/60">Загрузка...</p>}
        {error && <p className="mt-6 text-center text-sm text-red-600">Ошибка: {error}</p>}

        {!loading && !error && booking && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate/70">
              <span>Бронирование: <strong className="text-ink">{booking.booking_number}</strong></span>
              <span>Тип номера: <strong className="text-ink">{roomTypeName}</strong></span>
              <span>
                Даты: <strong className="text-ink">{formatDate(booking.arrival_date)} — {formatDate(booking.departure_date)} ({booking.nights} ноч.)</strong>
              </span>
              <span>План питания: <strong className="text-ink">{mealPlanLabel}</strong></span>
              <span>Гости: <strong className="text-ink">{booking.adults} взр. / {booking.children} дет. / {booking.infants} млад.</strong></span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Зафиксировано в счёте</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate/60">Сумма номера (нетто+трансфер)</span><span className="text-ink">{formatMoney(invoice.subtotal, invoice.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Скидка</span><span className="text-ink">{invoice.discount !== null ? formatMoney(invoice.discount, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Комиссия</span><span className="text-ink">{invoice.commission !== null ? formatMoney(invoice.commission, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate/60">Налог</span><span className="text-ink">{invoice.tax !== null ? formatMoney(invoice.tax, invoice.currency) : "—"}</span></div>
                  <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Итого</span><span className="text-ink">{formatMoney(invoice.total, invoice.currency)}</span></div>
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${mismatch ? "border-coral/40 bg-coral/5" : "border-ink/10"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Текущее состояние брони</p>
                {roomBreakdown && booking && (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate/60">Базовая ставка (нетто)</span><span className="text-ink">{formatMoney(roomBreakdown.base_total, roomBreakdown.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Надбавки</span><span className="text-ink">{formatMoney(roomBreakdown.supplements_total, roomBreakdown.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Скидка</span><span className="text-ink">{booking.agent_exclusive_discount_amount !== null ? formatMoney(booking.agent_exclusive_discount_amount, booking.currency) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-slate/60">Комиссия</span><span className="text-ink">{booking.agent_markup_amount !== null ? formatMoney(booking.agent_markup_amount, booking.currency) : "—"}</span></div>
                    {transferBreakdown && (
                      <div className="flex justify-between"><span className="text-slate/60">Трансфер ({transferBreakdown.transfer_name})</span><span className="text-ink">{formatMoney(transferBreakdown.total, transferBreakdown.currency)}</span></div>
                    )}
                    {taxBreakdown && (
                      <div className="flex justify-between"><span className="text-slate/60">{taxBreakdown.label || "Налог"}</span><span className="text-ink">{formatMoney(taxBreakdown.total, taxBreakdown.currency)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-ink/10 pt-1 font-medium"><span className="text-ink">Итого сейчас</span><span className="text-ink">{liveTotal !== null ? formatMoney(liveTotal, booking.currency) : "—"}</span></div>
                  </div>
                )}
              </div>
            </div>

            {mismatch && (
              <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
                ⚠ Текущая цена бронирования отличается от зафиксированной в счёте — проверьте перед одобрением.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
