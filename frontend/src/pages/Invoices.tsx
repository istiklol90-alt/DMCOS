import { useEffect, useState } from "react";
import type { Invoice, AgentOption } from "./financeShared";
import {
  fetchJson,
  formatMoney,
  formatDate,
  formatReviewNotes,
  StatusBadge,
  isUrgentFlag,
  voidLabel,
  AgentSearchSelect,
  InvoiceDetailModal,
} from "./financeShared";

// ---------------------------------------------------------------------------
// "Invoices" -- Decision 088 restructure. Two sections: (1) a small, always-
// loaded "Needs attention" panel (GET /finance-engine/invoices/urgent,
// server-filtered, safe at real scale by construction -- an unacknowledged
// flagged Draft should be rare, not proportional to total invoice count),
// and (2) a search-first agent picker -- the full invoice list for ANY
// agent is never loaded until a specific one is selected via
// AgentSearchSelect, which itself never loads the full agent list either.
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Decision 092: accepts a bare number ("21") as well as the full BK-000021
// form -- strips any BK-/bk- prefix, keeps only digits, zero-pads to 6.
function normalizeBookingNumber(raw: string): string {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.toUpperCase().startsWith("BK-") ? trimmed.slice(3) : trimmed;
  const digits = withoutPrefix.replace(/\D/g, "");
  return digits ? `BK-${digits.padStart(6, "0")}` : trimmed.toUpperCase();
}

function exportInvoicesCsv(invoices: Invoice[], agentLabel: string) {
  const headers = ["Invoice #", "Booking", "Hotel", "Date", "Amount", "Currency", "Status", "Email sent", "Flag"];
  const rows = invoices.map((inv) => [
    inv.invoice_number,
    `#${inv.booking_id}`,
    `#${inv.hotel_id}`,
    inv.issue_date,
    String(inv.total),
    inv.currency,
    inv.status,
    inv.email_sent_at ? new Date(inv.email_sent_at).toLocaleString("en-US") : "not sent",
    formatReviewNotes(inv.review_notes, inv.currency),
  ]);
  const bom = String.fromCharCode(0xfeff);
  const csvContent = bom + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoices_${agentLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function InvoiceTable({
  invoices,
  onVoid,
  onApprove,
  onDetail,
  onAcknowledge,
  voidingId,
  approvingId,
  acknowledgingId,
}: {
  invoices: Invoice[];
  onVoid: (id: number) => void;
  onApprove: (inv: Invoice) => void;
  onDetail: (inv: Invoice) => void;
  onAcknowledge: (inv: Invoice) => void;
  voidingId: number | null;
  approvingId: number | null;
  acknowledgingId: number | null;
}) {
  const sorted = [...invoices].sort((a, b) => (isUrgentFlag(b) ? 1 : 0) - (isUrgentFlag(a) ? 1 : 0));

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
            <th className="px-5 py-3 font-medium">Invoice #</th>
            <th className="px-5 py-3 font-medium">Booking</th>
            <th className="px-5 py-3 font-medium">Hotel</th>
            <th className="px-5 py-3 font-medium">Date</th>
            <th className="px-5 py-3 font-medium">Amount</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Email</th>
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate/50">
                No invoices yet
              </td>
            </tr>
          ) : (
            sorted.map((inv) => (
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
                        title={formatReviewNotes(inv.review_notes, inv.currency) || undefined}
                      >
                        Needs attention
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate/80">#{inv.booking_id}</td>
                <td className="px-5 py-3.5 text-slate/80">#{inv.hotel_id}</td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">{formatDate(inv.issue_date)}</td>
                <td className="px-5 py-3.5 font-medium text-ink">{formatMoney(inv.total, inv.currency)}</td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={inv.status} label={inv.status === "Void" ? voidLabel(null) : undefined} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">
                  {inv.email_sent_at ? (
                    new Date(inv.email_sent_at).toLocaleString("en-US")
                  ) : (
                    <span className="text-slate/40">not sent</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onDetail(inv)}
                      className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
                    >
                      Details
                    </button>
                    {inv.status === "Draft" && (
                      <button
                        type="button"
                        onClick={() => onApprove(inv)}
                        disabled={approvingId === inv.id}
                        className="appearance-none rounded-lg border-0 bg-teal px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {approvingId === inv.id ? "..." : "Approve & send"}
                      </button>
                    )}
                    {inv.status === "Issued" && isUrgentFlag(inv) && (
                      <button
                        type="button"
                        onClick={() => onAcknowledge(inv)}
                        disabled={acknowledgingId === inv.id}
                        className="appearance-none rounded-lg border-0 bg-coral px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {acknowledgingId === inv.id ? "..." : "Mark as reviewed"}
                      </button>
                    )}
                    {inv.status !== "Void" && (
                      <button
                        type="button"
                        onClick={() => onVoid(inv.id)}
                        disabled={voidingId === inv.id}
                        className="appearance-none rounded-lg border border-coral/40 bg-transparent px-3.5 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                      >
                        {voidingId === inv.id ? "..." : "Void"}
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
  );
}

const Invoices = () => {
  const [urgent, setUrgent] = useState<Invoice[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);

  const [searchMode, setSearchMode] = useState<"agent" | "booking">("agent");

  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [agentInvoices, setAgentInvoices] = useState<Invoice[]>([]);
  const [agentInvoicesLoading, setAgentInvoicesLoading] = useState(false);
  const [agentInvoicesError, setAgentInvoicesError] = useState<string | null>(null);

  const [bookingNumberQuery, setBookingNumberQuery] = useState("");
  const [bookingSearchLoading, setBookingSearchLoading] = useState(false);
  const [bookingSearchError, setBookingSearchError] = useState<string | null>(null);
  const [bookingSearchResults, setBookingSearchResults] = useState<Invoice[]>([]);

  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  async function loadUrgent() {
    const token = localStorage.getItem("token") || "";
    try {
      setUrgentLoading(true);
      setUrgent(await fetchJson<Invoice[]>("/finance-engine/invoices/urgent", token));
    } catch {
      setUrgent([]);
    } finally {
      setUrgentLoading(false);
    }
  }

  useEffect(() => {
    loadUrgent();
  }, []);

  async function loadAgentInvoices(agentId: number) {
    const token = localStorage.getItem("token") || "";
    try {
      setAgentInvoicesLoading(true);
      setAgentInvoicesError(null);
      setAgentInvoices(await fetchJson<Invoice[]>(`/finance-engine/agents/${agentId}/invoices`, token));
    } catch (err: any) {
      setAgentInvoicesError(err.message || "Failed to load invoices");
    } finally {
      setAgentInvoicesLoading(false);
    }
  }

  useEffect(() => {
    if (selectedAgent) loadAgentInvoices(selectedAgent.id);
    else setAgentInvoices([]);
  }, [selectedAgent]);

  async function refreshBookingSearchResults() {
    if (bookingSearchResults.length === 0) return;
    const token = localStorage.getItem("token") || "";
    try {
      const refreshed = await Promise.all(
        bookingSearchResults.map((inv) => fetchJson<Invoice>(`/finance-engine/invoices/${inv.id}`, token))
      );
      setBookingSearchResults(refreshed);
    } catch {
      // best-effort refresh -- keep showing the stale-but-still-valid rows rather than clearing them
    }
  }

  async function refreshBoth() {
    await loadUrgent();
    if (selectedAgent) await loadAgentInvoices(selectedAgent.id);
    await refreshBookingSearchResults();
  }

  async function handleVoid(id: number) {
    if (!window.confirm("Void this invoice?")) return;
    const token = localStorage.getItem("token") || "";
    try {
      setVoidingId(id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${id}/void`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Failed to void invoice");
    } finally {
      setVoidingId(null);
    }
  }

  async function handleApproveAndSend(invoice: Invoice) {
    const confirmMessage = isUrgentFlag(invoice)
      ? `⚠ WARNING:\n${formatReviewNotes(invoice.review_notes, invoice.currency)}\n\nApprove and send the invoice to the agent anyway?`
      : "Approve and send the invoice to the agent?";
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setApprovingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/approve-and-send`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Failed to approve and send invoice");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleBookingNumberSearch() {
    const tokens = bookingNumberQuery
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      setBookingSearchError("Enter a booking number");
      return;
    }
    const token = localStorage.getItem("token") || "";
    setBookingSearchLoading(true);
    setBookingSearchError(null);
    setBookingSearchResults([]);

    const found: Invoice[] = [];
    const problems: string[] = [];

    for (const raw of tokens) {
      const number = normalizeBookingNumber(raw);
      try {
        const booking = await fetchJson<{ id: number; booking_number: string }>(
          `/booking-engine/bookings/by-number/${encodeURIComponent(number)}`,
          token
        );
        try {
          const invoice = await fetchJson<Invoice>(`/finance-engine/bookings/${booking.id}/invoice`, token);
          found.push(invoice);
        } catch {
          problems.push(`${booking.booking_number}: no invoice yet`);
        }
      } catch {
        problems.push(`${number}: not found`);
      }
    }

    setBookingSearchResults(found);
    setBookingSearchError(problems.length > 0 ? problems.join("; ") : null);
    setBookingSearchLoading(false);
  }

  async function handleAcknowledge(invoice: Invoice) {
    const confirmMessage = `⚠\n${formatReviewNotes(invoice.review_notes, invoice.currency)}\n\nMark as reviewed? The invoice will remain Issued without being re-sent to the agent.`;
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setAcknowledgingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/acknowledge-flag`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Failed to mark invoice as reviewed");
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="pb-10">
      {/* Always-loaded, always-small: the one place triage doesn't require
          already knowing which agent to search for. */}
      <div className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Needs attention</h3>
        {urgentLoading ? (
          <p className="mt-3 text-sm text-slate/60">Loading...</p>
        ) : urgent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white px-5 py-6 text-center text-sm text-slate/50">
            No invoices need attention
          </p>
        ) : (
          <div className="mt-3">
            <InvoiceTable
              invoices={urgent}
              onVoid={handleVoid}
              onApprove={handleApproveAndSend}
              onDetail={setDetailInvoice}
              onAcknowledge={handleAcknowledge}
              voidingId={voidingId}
              approvingId={approvingId}
              acknowledgingId={acknowledgingId}
            />
          </div>
        )}
      </div>

      {/* Search-first -- the full invoice list for a given agent is never
          fetched until that one agent is explicitly selected. Two search
          modes (Decision 091): "By agent" (browse an agent's whole
          list) vs "By booking number" (jump directly to one known
          booking's invoice) -- a toggle, not one smart auto-detecting
          field, since the two are different interaction shapes
          (select-from-autocomplete vs type-and-submit-to-jump). */}
      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold text-ink">Search invoices</h3>

        <div className="mt-3 flex gap-1 border-b border-ink/10">
          <button
            type="button"
            onClick={() => setSearchMode("agent")}
            className={`appearance-none border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium transition-colors ${
              searchMode === "agent" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            By agent
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("booking")}
            className={`appearance-none border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium transition-colors ${
              searchMode === "booking" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            By booking number
          </button>
        </div>

        {searchMode === "booking" && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={bookingNumberQuery}
                onChange={(e) => setBookingNumberQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBookingNumberSearch();
                }}
                placeholder="E.g.: 21 or 21, 22"
                className="min-w-[260px] appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
              <button
                type="button"
                onClick={handleBookingNumberSearch}
                disabled={bookingSearchLoading}
                className="appearance-none rounded-lg border-0 bg-coral px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {bookingSearchLoading ? "..." : "Search"}
              </button>
            </div>
            {bookingSearchError && <p className="mt-3 text-sm text-red-600">{bookingSearchError}</p>}
            {bookingSearchResults.length > 0 && (
              <div className="mt-4">
                <InvoiceTable
                  invoices={bookingSearchResults}
                  onVoid={handleVoid}
                  onApprove={handleApproveAndSend}
                  onDetail={setDetailInvoice}
                  onAcknowledge={handleAcknowledge}
                  voidingId={voidingId}
                  approvingId={approvingId}
                  acknowledgingId={acknowledgingId}
                />
              </div>
            )}
          </div>
        )}

        {searchMode === "agent" && (
          <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <AgentSearchSelect selected={selectedAgent} onSelect={setSelectedAgent} />
          {selectedAgent && (
            <button
              type="button"
              onClick={() => exportInvoicesCsv(agentInvoices, selectedAgent.name)}
              disabled={agentInvoices.length === 0}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
          )}
        </div>

        {!selectedAgent && (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
            Search for and select an agent to see their invoices
          </p>
        )}
        {selectedAgent && agentInvoicesLoading && (
          <p className="mt-4 text-center text-sm text-slate/60">Loading...</p>
        )}
        {selectedAgent && agentInvoicesError && (
          <p className="mt-4 text-center text-sm text-red-600">Error: {agentInvoicesError}</p>
        )}
        {selectedAgent && !agentInvoicesLoading && !agentInvoicesError && (
          <div className="mt-4">
            <InvoiceTable
              invoices={agentInvoices}
              onVoid={handleVoid}
              onApprove={handleApproveAndSend}
              onDetail={setDetailInvoice}
              onAcknowledge={handleAcknowledge}
              voidingId={voidingId}
              approvingId={approvingId}
              acknowledgingId={acknowledgingId}
            />
          </div>
        )}
          </>
        )}
      </div>

      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onAcknowledged={async () => {
            setDetailInvoice(null);
            await refreshBoth();
          }}
        />
      )}
    </div>
  );
};

export default Invoices;
