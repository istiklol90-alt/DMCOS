import { useEffect, useState } from "react";
import { API_URL } from "../config";

// ---------------------------------------------------------------------------
// Admin-only screen for Finance Engine (Decision 078): an admin-wide invoice
// list (with Void), and per-hotel cashback arrangement viewing/creation
// (Decision 009 -- manually-recorded arrangements, never an automatic
// formula). Minimal by design -- Credit Note, Agent Statement, and
// fulfillment-recording UI are deliberately out of scope for this pass.
// ---------------------------------------------------------------------------

interface Invoice {
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
  created_by: number;
  approved_by: number | null;
  approved_at: string | null;
  voided_by: number | null;
  voided_at: string | null;
}

interface Hotel {
  id: number;
  hotel_name: string;
}

interface CashbackArrangement {
  id: number;
  hotel_id: number;
  terms: string;
  rebate_percentage: number | null;
  volume_threshold: number | null;
  currency: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

type SubTab = "invoices" | "cashback";

async function fetchJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
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

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(dateStr: string) {
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

function StatusBadge({ status, label }: { status: string; label?: string }) {
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
function isUrgentFlag(inv: Invoice): boolean {
  return Boolean(inv.review_flag) && !inv.flag_acknowledged_at && inv.status !== "Void";
}

// "Void" (Invoice) and "Cancelled" (Booking) are deliberately NOT
// unified into one word -- an invoice can be voided for reasons
// unrelated to the booking (e.g. a data-entry correction on an
// otherwise-valid booking). The label stays "Аннулирован" always, with
// a qualifier appended only when the linked booking is actually
// terminal too.
function voidLabel(bookingStatus: string | null): string {
  if (bookingStatus === "Cancelled") return "Аннулирован (бронь отменена)";
  if (bookingStatus === "Rejected") return "Аннулирован (бронь отклонена отелем)";
  return "Аннулирован";
}

// ---------------------------------------------------------------------------
// Invoice detail modal (Requirement 1) -- reuses Reservations.tsx's exact
// data sources (same endpoints, same shapes) for the live breakdown, rather
// than any new calculation: the booking's own current room-type/meal-plan/
// dates/occupancy, fed into the same Contract Engine get_room_price/
// get_transfer_price/get_mandatory_tax calls BookingDetail already makes.
// Showing this "live" breakdown alongside the invoice's own frozen totals
// doubles as an on-demand staleness check, complementing the proactive
// review_flag (Requirement 2).
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

function InvoiceDetailModal({
  invoice,
  onClose,
  userNames,
}: {
  invoice: Invoice;
  onClose: () => void;
  userNames: Record<number, string>;
}) {
  const [booking, setBooking] = useState<DetailBooking | null>(null);
  const [roomTypeName, setRoomTypeName] = useState<string>("");
  const [mealPlanLabel, setMealPlanLabel] = useState<string>("");
  const [roomBreakdown, setRoomBreakdown] = useState<RoomPriceBreakdown | null>(null);
  const [transferBreakdown, setTransferBreakdown] = useState<TransferPriceBreakdown | null>(null);
  const [taxBreakdown, setTaxBreakdown] = useState<MandatoryTaxBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Deliberately booking.total_amount, not roomBreakdown.final_total --
  // the breakdown endpoint returns Contract Engine's raw net (pre-
  // Pricing-Engine), which would never match invoice.total (the
  // agent-facing, post-markup/discount price) even for a perfectly
  // fresh invoice. booking.total_amount is already the current
  // agent-facing price (kept fresh on date changes since Decision
  // 082), so it's the only fair comparison against invoice.total.
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

        {/* Requirement (audit trail): who created/approved/voided this
            invoice and when -- previously only ever captured, never
            displayed anywhere. */}
        <div className="mt-3 space-y-0.5 text-xs text-slate/50">
          <p>Создано: {userNames[invoice.created_by] ?? `#${invoice.created_by}`}, {formatDate(invoice.issue_date)}</p>
          {invoice.approved_by !== null && invoice.approved_at && (
            <p>Одобрено: {userNames[invoice.approved_by] ?? `#${invoice.approved_by}`}, {formatDate(invoice.approved_at)}</p>
          )}
          {invoice.voided_by !== null && invoice.voided_at && (
            <p>Аннулировано: {userNames[invoice.voided_by] ?? `#${invoice.voided_by}`}, {formatDate(invoice.voided_at)}</p>
          )}
        </div>

        {/* review_flag's text is never hidden, regardless of status/
            acknowledgment -- only the styling changes: urgent coral
            banner while still actionable, calm historical note once
            approved (with the acknowledgment date) or voided (dead,
            nothing to act on, no acknowledgment date to show). */}
        {invoice.review_flag && (
          isUrgentFlag(invoice) ? (
            <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral">
              ⚠ {invoice.review_flag}
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-xs text-slate/60">
              {invoice.flag_acknowledged_at
                ? `Изменено (одобрено ${formatDate(invoice.flag_acknowledged_at)}): ${invoice.review_flag}`
                : invoice.review_flag}
            </div>
          )
        )}

        {/* Requirement (explicit before/after diff, not just two side-by-side
            numbers) -- shown whenever review_flag is set, regardless of
            whether the amounts actually differ, since "dates changed but
            price happened to stay the same" is itself honest, useful
            information, not something to hide. */}
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

const Finance = () => {
  const [subTab, setSubTab] = useState<SubTab>("invoices");

  // ===== Invoices =====
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  // General user-id -> name lookup -- used for agents (list columns) AND
  // admins (created_by/approved_by/voided_by, resolved via the detail
  // modal), since /users returns every user regardless of role.
  const [userNames, setUserNames] = useState<Record<number, string>>({});

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<{ id: number; name: string }[]>("/users", token)
      .then((users) => {
        const map: Record<number, string> = {};
        users.forEach((u) => (map[u.id] = u.name));
        setUserNames(map);
      })
      .catch(() => setUserNames({}));
  }, []);

  async function loadInvoices() {
    const token = localStorage.getItem("token") || "";
    try {
      setInvoicesLoading(true);
      setInvoicesError(null);
      setInvoices(await fetchJson<Invoice[]>("/finance-engine/invoices", token));
    } catch (err: any) {
      setInvoicesError(err.message || "Ошибка загрузки счетов");
    } finally {
      setInvoicesLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, []);

  async function handleVoid(id: number) {
    if (!window.confirm("Аннулировать счёт?")) return;
    const token = localStorage.getItem("token") || "";
    try {
      setVoidingId(id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${id}/void`, token, { method: "POST" });
      await loadInvoices();
    } catch (err: any) {
      alert(err.message || "Не удалось аннулировать счёт");
    } finally {
      setVoidingId(null);
    }
  }

  async function handleApproveAndSend(invoice: Invoice) {
    // Decision 083 (Requirement 2): a flagged Draft gets an explicit,
    // impossible-to-miss extra confirmation showing the reason --
    // deliberately not a hard backend block (a flag accounting already
    // reviewed and confirmed fine shouldn't get stuck with no recovery
    // path), just a forced acknowledgment at the exact decision point.
    const confirmMessage = invoice.review_flag
      ? `⚠ ВНИМАНИЕ: ${invoice.review_flag}\n\nОдобрить и отправить счёт агенту всё равно?`
      : "Одобрить и отправить счёт агенту?";
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setApprovingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/approve-and-send`, token, { method: "POST" });
      await loadInvoices();
    } catch (err: any) {
      alert(err.message || "Не удалось одобрить и отправить счёт");
    } finally {
      setApprovingId(null);
    }
  }

  // ===== Cashback arrangements =====
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);
  const [arrangements, setArrangements] = useState<CashbackArrangement[]>([]);
  const [arrangementsLoading, setArrangementsLoading] = useState(false);
  const [arrangementsError, setArrangementsError] = useState<string | null>(null);

  const [showAddArrangement, setShowAddArrangement] = useState(false);
  const [termsInput, setTermsInput] = useState("");
  const [currencyInput, setCurrencyInput] = useState("USD");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [rebateInput, setRebateInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingArrangement, setSavingArrangement] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Hotel[]>("/hotel-engine/hotels", token)
      .then((data) => {
        setHotels(data);
        if (data.length > 0) setSelectedHotelId(data[0].id);
      })
      .catch(() => setHotels([]));
  }, []);

  async function loadArrangements(hotelId: number) {
    const token = localStorage.getItem("token") || "";
    try {
      setArrangementsLoading(true);
      setArrangementsError(null);
      setArrangements(
        await fetchJson<CashbackArrangement[]>(`/finance-engine/hotels/${hotelId}/cashback-arrangements`, token)
      );
    } catch (err: any) {
      setArrangementsError(err.message || "Ошибка загрузки договорённостей");
    } finally {
      setArrangementsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedHotelId !== null) loadArrangements(selectedHotelId);
  }, [selectedHotelId]);

  async function handleAddArrangement() {
    if (!termsInput.trim()) {
      setAddError("Укажите условия договорённости");
      return;
    }
    if (!startDateInput) {
      setAddError("Укажите дату начала");
      return;
    }
    if (selectedHotelId === null) return;
    const token = localStorage.getItem("token") || "";
    try {
      setSavingArrangement(true);
      setAddError(null);
      await fetchJson(`/finance-engine/hotels/${selectedHotelId}/cashback-arrangements`, token, {
        method: "POST",
        body: JSON.stringify({
          terms: termsInput,
          currency: currencyInput,
          start_date: startDateInput,
          end_date: endDateInput || null,
          rebate_percentage: rebateInput ? parseFloat(rebateInput) : null,
          volume_threshold: thresholdInput ? parseFloat(thresholdInput) : null,
        }),
      });
      setShowAddArrangement(false);
      setTermsInput("");
      setStartDateInput("");
      setEndDateInput("");
      setRebateInput("");
      setThresholdInput("");
      await loadArrangements(selectedHotelId);
    } catch (err: any) {
      setAddError(err.message || "Не удалось сохранить договорённость");
    } finally {
      setSavingArrangement(false);
    }
  }

  // hotels is already fetched above for the cashback hotel picker --
  // reused here instead of a second network call for the same data.
  const hotelNames: Record<number, string> = {};
  hotels.forEach((h) => (hotelNames[h.id] = h.hotel_name));

  // Urgent rows (isUrgentFlag) always sort to the top, regardless of
  // date -- .sort() is stable (ES2019+), so relative order within each
  // group (urgent / not) is otherwise unchanged. A flagged-but-Void or
  // flagged-but-acknowledged invoice no longer counts as urgent, so it
  // sorts with the rest instead of squatting at the top forever.
  const sortedInvoices = [...invoices].sort((a, b) => (isUrgentFlag(b) ? 1 : 0) - (isUrgentFlag(a) ? 1 : 0));

  function csvEscape(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  function handleExportCsv() {
    const headers = ["№ счёта", "Booking", "Агент", "Отель", "Дата", "Сумма", "Валюта", "Статус", "Email отправлен", "Флаг"];
    const rows = sortedInvoices.map((inv) => [
      inv.invoice_number,
      `#${inv.booking_id}`,
      userNames[inv.agent_id] ?? `#${inv.agent_id}`,
      hotelNames[inv.hotel_id] ?? `#${inv.hotel_id}`,
      inv.issue_date,
      String(inv.total),
      inv.currency,
      inv.status,
      inv.email_sent_at ? new Date(inv.email_sent_at).toLocaleString("ru-RU") : "не отправлено",
      inv.review_flag ?? "",
    ]);
    // Leading BOM so Excel on Windows correctly detects UTF-8 (Cyrillic
    // agent/hotel names and review_flag text would otherwise mojibake).
    const bom = String.fromCharCode(0xfeff);
    const csvContent = bom + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pb-10">
      <div className="mt-6 flex gap-2 border-b border-ink/10">
        <button
          type="button"
          onClick={() => setSubTab("invoices")}
          className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            subTab === "invoices" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
          }`}
        >
          Счета ({invoices.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("cashback")}
          className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            subTab === "cashback" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
          }`}
        >
          Кэшбэк отелей
        </button>
      </div>

      {subTab === "invoices" && (
        <>
          {invoicesLoading && <p className="mt-10 text-center text-sm text-slate/60">Загрузка...</p>}
          {invoicesError && <p className="mt-10 text-center text-sm text-red-600">Ошибка: {invoicesError}</p>}
          {!invoicesLoading && !invoicesError && (
            <>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={sortedInvoices.length === 0}
                  className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Экспорт CSV
                </button>
              </div>
              <div className="mt-2 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                    <th className="px-5 py-3 font-medium">№ счёта</th>
                    <th className="px-5 py-3 font-medium">Booking</th>
                    <th className="px-5 py-3 font-medium">Агент</th>
                    <th className="px-5 py-3 font-medium">Отель</th>
                    <th className="px-5 py-3 font-medium">Дата</th>
                    <th className="px-5 py-3 font-medium">Сумма</th>
                    <th className="px-5 py-3 font-medium">Статус</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate/50">
                        Счетов пока нет
                      </td>
                    </tr>
                  ) : (
                    sortedInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className={`border-b border-ink/5 last:border-b-0 ${
                          isUrgentFlag(inv)
                            ? "border-l-8 border-l-red-600 bg-red-500/20 hover:bg-red-500/30"
                            : "hover:bg-sand/40"
                        }`}
                      >
                        <td className="px-5 py-3.5 font-medium text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            {inv.invoice_number}
                            {isUrgentFlag(inv) && (
                              <span
                                className="cursor-help rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                title={inv.review_flag ?? undefined}
                              >
                                Требует внимания
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate/80">#{inv.booking_id}</td>
                        <td className="px-5 py-3.5 text-slate/80">{userNames[inv.agent_id] ?? `#${inv.agent_id}`}</td>
                        <td className="px-5 py-3.5 text-slate/80">{hotelNames[inv.hotel_id] ?? `#${inv.hotel_id}`}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">{formatDate(inv.issue_date)}</td>
                        <td className="px-5 py-3.5 font-medium text-ink">{formatMoney(inv.total, inv.currency)}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={inv.status} label={inv.status === "Void" ? voidLabel(null) : undefined} />
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">
                          {inv.email_sent_at ? (
                            new Date(inv.email_sent_at).toLocaleString("ru-RU")
                          ) : (
                            <span className="text-slate/40">не отправлено</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailInvoice(inv)}
                              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
                            >
                              Подробнее
                            </button>
                            {inv.status === "Draft" && (
                              <button
                                type="button"
                                onClick={() => handleApproveAndSend(inv)}
                                disabled={approvingId === inv.id}
                                className="appearance-none rounded-lg border-0 bg-teal px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                              >
                                {approvingId === inv.id ? "..." : "Одобрить и отправить"}
                              </button>
                            )}
                            {inv.status !== "Void" && (
                              <button
                                type="button"
                                onClick={() => handleVoid(inv.id)}
                                disabled={voidingId === inv.id}
                                className="appearance-none rounded-lg border border-coral/40 bg-transparent px-3.5 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                              >
                                {voidingId === inv.id ? "..." : "Аннулировать"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}
        </>
      )}

      {subTab === "cashback" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedHotelId ?? ""}
              onChange={(e) => setSelectedHotelId(Number(e.target.value))}
              className="min-w-[240px] appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hotel_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setShowAddArrangement(true);
                setAddError(null);
              }}
              disabled={selectedHotelId === null}
              className="appearance-none rounded-lg border-0 bg-teal px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Добавить договорённость
            </button>
          </div>

          {arrangementsLoading && <p className="mt-6 text-center text-sm text-slate/60">Загрузка...</p>}
          {arrangementsError && <p className="mt-6 text-center text-sm text-red-600">Ошибка: {arrangementsError}</p>}

          {!arrangementsLoading && !arrangementsError && (
            <div className="mt-4 space-y-3">
              {arrangements.length === 0 ? (
                <p className="rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
                  Договорённостей по кэшбэку для этого отеля пока нет
                </p>
              ) : (
                arrangements.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-ink/10 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink">{a.terms}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate/70">
                      {a.rebate_percentage !== null && <span>Ставка: {a.rebate_percentage}%</span>}
                      {a.volume_threshold !== null && (
                        <span>Порог: {formatMoney(a.volume_threshold, a.currency)}</span>
                      )}
                      <span>
                        С {formatDate(a.start_date)}
                        {a.end_date ? ` по ${formatDate(a.end_date)}` : ""}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {showAddArrangement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => setShowAddArrangement(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ink">Новая договорённость по кэшбэку</h3>
            <div className="mt-3 space-y-3">
              <textarea
                placeholder="Условия (например: 5% возврат при обороте $1M)"
                value={termsInput}
                onChange={(e) => setTermsInput(e.target.value)}
                rows={3}
                className="w-full appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
              <div className="flex gap-2.5">
                <input
                  type="number"
                  placeholder="Ставка %"
                  value={rebateInput}
                  onChange={(e) => setRebateInput(e.target.value)}
                  className="w-1/2 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="number"
                  placeholder="Порог оборота"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-1/2 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
              </div>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="Валюта"
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
              </div>
            </div>
            {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={handleAddArrangement}
                disabled={savingArrangement}
                className="flex-1 appearance-none rounded-lg border-0 bg-coral px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {savingArrangement ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddArrangement(false)}
                className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {detailInvoice && (
        <InvoiceDetailModal invoice={detailInvoice} onClose={() => setDetailInvoice(null)} userNames={userNames} />
      )}
    </div>
  );
};

export default Finance;
