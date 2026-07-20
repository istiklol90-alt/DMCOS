import { useEffect, useState } from "react";
import { API_URL } from "../config";
import type { Invoice, AgentOption } from "./financeShared";
import { fetchJson, formatMoney, AgentSearchSelect, invoiceProfit } from "./financeShared";

// ---------------------------------------------------------------------------
// "Баланс" -- Decision 088 restructure. Search-first agent + date-range
// summary, plus the .xlsx export (Decision 086) now using AgentSearchSelect
// instead of a full agent dropdown. Deliberately NOT AgentStatement
// (Decision 077/078's locked net/sale/profit rollup, still no frontend) --
// this is a simpler on-screen summary + raw invoice export, same
// distinction already logged in Decision 086.
// ---------------------------------------------------------------------------

const Balance = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAgent || !startDate || !endDate) {
      setInvoices([]);
      return;
    }
    const token = localStorage.getItem("token") || "";
    setLoading(true);
    setError(null);
    fetchJson<Invoice[]>(
      `/finance-engine/agents/${selectedAgent.id}/invoices?start_date=${startDate}&end_date=${endDate}`,
      token
    )
      .then(setInvoices)
      .catch((err: any) => setError(err.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [selectedAgent, startDate, endDate]);

  async function handleExportXlsx() {
    if (!selectedAgent || !startDate || !endDate) {
      setExportError("Выберите агента и период");
      return;
    }
    const token = localStorage.getItem("token") || "";
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch(
        `${API_URL}/finance-engine/agents/${selectedAgent.id}/invoices/export?start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agent_${selectedAgent.id}_invoices_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message || "Не удалось скачать отчёт");
    } finally {
      setExporting(false);
    }
  }

  const currency = invoices[0]?.currency ?? "USD";
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0);
  // Decision 101: not-computed invoices (pre-Decision-069) contribute 0
  // to this aggregate -- same precedent generate_agent_statement's own
  // total_profit already uses on the backend (distinct from a single
  // invoice's own null, which stays "—" wherever shown individually).
  const totalProfit = invoices.reduce((sum, inv) => sum + (invoiceProfit(inv) ?? 0), 0);
  const byStatus: Record<string, number> = {};
  invoices.forEach((inv) => {
    byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
  });

  return (
    <div className="pb-10">
      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Баланс агента за период</p>
        <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
          <AgentSearchSelect selected={selectedAgent} onSelect={setSelectedAgent} />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          <span className="text-sm text-slate/50">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={exporting || !selectedAgent || !startDate || !endDate}
            className="appearance-none rounded-lg border-0 bg-coral px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {exporting ? "Скачивание..." : "Скачать Excel"}
          </button>
        </div>
        {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
      </div>

      {!selectedAgent && (
        <p className="mt-6 rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
          Найдите агента и укажите период, чтобы увидеть баланс
        </p>
      )}
      {selectedAgent && (!startDate || !endDate) && (
        <p className="mt-6 rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
          Укажите период (даты выставления счетов)
        </p>
      )}
      {selectedAgent && startDate && endDate && loading && (
        <p className="mt-6 text-center text-sm text-slate/60">Загрузка...</p>
      )}
      {selectedAgent && startDate && endDate && error && (
        <p className="mt-6 text-center text-sm text-red-600">Ошибка: {error}</p>
      )}
      {selectedAgent && startDate && endDate && !loading && !error && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Счетов</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{invoices.length}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Сумма</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {invoices.length > 0 ? formatMoney(totalAmount, currency) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Прибыль</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {invoices.length > 0 ? formatMoney(totalProfit, currency) : "—"}
            </p>
          </div>
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{status}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Balance;
