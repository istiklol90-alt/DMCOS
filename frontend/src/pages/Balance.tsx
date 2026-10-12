import { useEffect, useState } from "react";
import { API_URL } from "../config";
import type { Invoice, AgentOption } from "./financeShared";
import { fetchJson, formatMoney, AgentSearchSelect, invoiceProfit } from "./financeShared";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

// ---------------------------------------------------------------------------
// "Balance" -- Decision 088 restructure. Search-first agent + date-range
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
      .catch((err: any) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [selectedAgent, startDate, endDate]);

  async function handleExportXlsx() {
    if (!selectedAgent || !startDate || !endDate) {
      setExportError("Select an agent and a period");
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
        let detail = `Request error (${response.status})`;
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
      setExportError(err.message || "Failed to download report");
    } finally {
      setExporting(false);
    }
  }

  // Decision 193: totalled PER CURRENCY. It used to sum every invoice into
  // one number and label it with the FIRST invoice's currency -- fine while
  // every contract was in USD, and silently wrong the moment a EUR contract
  // exists: EUR and USD would have been added together and stamped "USD".
  // No conversion is involved and none is wanted; each currency is its own
  // line, which is the honest answer without exchange rates.
  //
  // Decision 101: not-computed invoices (pre-Decision-069) contribute 0
  // to this aggregate -- same precedent generate_agent_statement's own
  // total_profit already uses on the backend (distinct from a single
  // invoice's own null, which stays "—" wherever shown individually).
  const amountByCurrency: Record<string, number> = {};
  const profitByCurrency: Record<string, number> = {};
  invoices.forEach((inv) => {
    amountByCurrency[inv.currency] = (amountByCurrency[inv.currency] ?? 0) + inv.total;
    profitByCurrency[inv.currency] = (profitByCurrency[inv.currency] ?? 0) + (invoiceProfit(inv) ?? 0);
  });
  const amountEntries = Object.entries(amountByCurrency).sort(([a], [b]) => a.localeCompare(b));
  const profitEntries = Object.entries(profitByCurrency).sort(([a], [b]) => a.localeCompare(b));
  const byStatus: Record<string, number> = {};
  invoices.forEach((inv) => {
    byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
  });

  return (
    <div className="pb-10">
      <Card padding="sm" className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">Agent balance for period</p>
        <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
          <AgentSearchSelect selected={selectedAgent} onSelect={setSelectedAgent} />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} scale="lg" />
          <span className="text-sm text-slate/50">—</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} scale="lg" />
          <Button onClick={handleExportXlsx} disabled={exporting || !selectedAgent || !startDate || !endDate}>
            {exporting ? "Downloading..." : "Download Excel"}
          </Button>
        </div>
        {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
      </Card>

      {/* padding="none" -- Card's own padding utility and this custom
          px-5/py-10 both target the padding property; combining them
          would fight over Tailwind's generated-stylesheet order, not
          string order (the same class of bug fixed in Decision 124). */}
      {!selectedAgent && (
        <Card padding="none" className="mt-6 px-5 py-10 text-center text-sm text-slate/50">
          Search for an agent and specify a period to see the balance
        </Card>
      )}
      {selectedAgent && (!startDate || !endDate) && (
        <Card padding="none" className="mt-6 px-5 py-10 text-center text-sm text-slate/50">
          Specify a period (invoice issue dates)
        </Card>
      )}
      {selectedAgent && startDate && endDate && loading && (
        <p className="mt-6 text-center text-sm text-slate/60">Loading...</p>
      )}
      {selectedAgent && startDate && endDate && error && (
        <p className="mt-6 text-center text-sm text-red-600">Error: {error}</p>
      )}
      {selectedAgent && startDate && endDate && !loading && !error && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card padding="none" className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Invoices</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{invoices.length}</p>
          </Card>
          <Card padding="none" className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Amount</p>
            {amountEntries.length === 0 ? (
              <p className="mt-1 font-display text-2xl font-semibold text-ink">—</p>
            ) : (
              amountEntries.map(([cur, amount]) => (
                <p key={cur} className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatMoney(amount, cur)}
                </p>
              ))
            )}
          </Card>
          <Card padding="none" className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Profit</p>
            {profitEntries.length === 0 ? (
              <p className="mt-1 font-display text-2xl font-semibold text-ink">—</p>
            ) : (
              profitEntries.map(([cur, amount]) => (
                <p key={cur} className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatMoney(amount, cur)}
                </p>
              ))
            )}
          </Card>
          {Object.entries(byStatus).map(([status, count]) => (
            <Card key={status} padding="none" className="px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{status}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{count}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Balance;
