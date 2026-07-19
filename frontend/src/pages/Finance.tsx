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
  total: number;
  status: string;
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses[status] ?? "bg-slate/10 text-slate"}`}>
      {status}
    </span>
  );
}

const Finance = () => {
  const [subTab, setSubTab] = useState<SubTab>("invoices");

  // ===== Invoices =====
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);

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
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
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
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate/50">
                        Счетов пока нет
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-ink/5 last:border-b-0">
                        <td className="px-5 py-3.5 font-medium text-ink">{inv.invoice_number}</td>
                        <td className="px-5 py-3.5 text-slate/80">#{inv.booking_id}</td>
                        <td className="px-5 py-3.5 text-slate/80">#{inv.agent_id}</td>
                        <td className="px-5 py-3.5 text-slate/80">#{inv.hotel_id}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">{formatDate(inv.issue_date)}</td>
                        <td className="px-5 py-3.5 font-medium text-ink">{formatMoney(inv.total, inv.currency)}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
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
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
    </div>
  );
};

export default Finance;
