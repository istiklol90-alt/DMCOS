import { useEffect, useState } from "react";
import type { Invoice, AgentOption } from "./financeShared";
import {
  fetchJson,
  formatMoney,
  formatDate,
  StatusBadge,
  isUrgentFlag,
  voidLabel,
  AgentSearchSelect,
  InvoiceDetailModal,
} from "./financeShared";

// ---------------------------------------------------------------------------
// "Счета" -- Decision 088 restructure. Two sections: (1) a small, always-
// loaded "Требует внимания" panel (GET /finance-engine/invoices/urgent,
// server-filtered, safe at real scale by construction -- an unacknowledged
// flagged Draft should be rare, not proportional to total invoice count),
// and (2) a search-first agent picker -- the full invoice list for ANY
// agent is never loaded until a specific one is selected via
// AgentSearchSelect, which itself never loads the full agent list either.
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportInvoicesCsv(invoices: Invoice[], agentLabel: string) {
  const headers = ["№ счёта", "Booking", "Отель", "Дата", "Сумма", "Валюта", "Статус", "Email отправлен", "Флаг"];
  const rows = invoices.map((inv) => [
    inv.invoice_number,
    `#${inv.booking_id}`,
    `#${inv.hotel_id}`,
    inv.issue_date,
    String(inv.total),
    inv.currency,
    inv.status,
    inv.email_sent_at ? new Date(inv.email_sent_at).toLocaleString("ru-RU") : "не отправлено",
    inv.review_flag ?? "",
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
            <th className="px-5 py-3 font-medium">№ счёта</th>
            <th className="px-5 py-3 font-medium">Booking</th>
            <th className="px-5 py-3 font-medium">Отель</th>
            <th className="px-5 py-3 font-medium">Дата</th>
            <th className="px-5 py-3 font-medium">Сумма</th>
            <th className="px-5 py-3 font-medium">Статус</th>
            <th className="px-5 py-3 font-medium">Email</th>
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate/50">
                Счетов пока нет
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
                        title={inv.review_flag ?? undefined}
                      >
                        Требует внимания
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
                    new Date(inv.email_sent_at).toLocaleString("ru-RU")
                  ) : (
                    <span className="text-slate/40">не отправлено</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onDetail(inv)}
                      className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
                    >
                      Подробнее
                    </button>
                    {inv.status === "Draft" && (
                      <button
                        type="button"
                        onClick={() => onApprove(inv)}
                        disabled={approvingId === inv.id}
                        className="appearance-none rounded-lg border-0 bg-teal px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {approvingId === inv.id ? "..." : "Одобрить и отправить"}
                      </button>
                    )}
                    {inv.status === "Issued" && isUrgentFlag(inv) && (
                      <button
                        type="button"
                        onClick={() => onAcknowledge(inv)}
                        disabled={acknowledgingId === inv.id}
                        className="appearance-none rounded-lg border-0 bg-coral px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {acknowledgingId === inv.id ? "..." : "Отметить как проверено"}
                      </button>
                    )}
                    {inv.status !== "Void" && (
                      <button
                        type="button"
                        onClick={() => onVoid(inv.id)}
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
  );
}

const Invoices = () => {
  const [urgent, setUrgent] = useState<Invoice[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);

  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [agentInvoices, setAgentInvoices] = useState<Invoice[]>([]);
  const [agentInvoicesLoading, setAgentInvoicesLoading] = useState(false);
  const [agentInvoicesError, setAgentInvoicesError] = useState<string | null>(null);

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
      setAgentInvoicesError(err.message || "Ошибка загрузки счетов");
    } finally {
      setAgentInvoicesLoading(false);
    }
  }

  useEffect(() => {
    if (selectedAgent) loadAgentInvoices(selectedAgent.id);
    else setAgentInvoices([]);
  }, [selectedAgent]);

  async function refreshBoth() {
    await loadUrgent();
    if (selectedAgent) await loadAgentInvoices(selectedAgent.id);
  }

  async function handleVoid(id: number) {
    if (!window.confirm("Аннулировать счёт?")) return;
    const token = localStorage.getItem("token") || "";
    try {
      setVoidingId(id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${id}/void`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Не удалось аннулировать счёт");
    } finally {
      setVoidingId(null);
    }
  }

  async function handleApproveAndSend(invoice: Invoice) {
    const confirmMessage = invoice.review_flag
      ? `⚠ ВНИМАНИЕ: ${invoice.review_flag}\n\nОдобрить и отправить счёт агенту всё равно?`
      : "Одобрить и отправить счёт агенту?";
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setApprovingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/approve-and-send`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Не удалось одобрить и отправить счёт");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleAcknowledge(invoice: Invoice) {
    const confirmMessage = `⚠ ${invoice.review_flag}\n\nОтметить как проверено? Счёт останется Issued без повторной отправки агенту.`;
    if (!window.confirm(confirmMessage)) return;
    const token = localStorage.getItem("token") || "";
    try {
      setAcknowledgingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/acknowledge-flag`, token, { method: "POST" });
      await refreshBoth();
    } catch (err: any) {
      alert(err.message || "Не удалось отметить счёт как проверенный");
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="pb-10">
      {/* Always-loaded, always-small: the one place triage doesn't require
          already knowing which agent to search for. */}
      <div className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Требует внимания</h3>
        {urgentLoading ? (
          <p className="mt-3 text-sm text-slate/60">Загрузка...</p>
        ) : urgent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white px-5 py-6 text-center text-sm text-slate/50">
            Нет счетов, требующих внимания
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
          fetched until that one agent is explicitly selected. */}
      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold text-ink">Счета по агенту</h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <AgentSearchSelect selected={selectedAgent} onSelect={setSelectedAgent} />
          {selectedAgent && (
            <button
              type="button"
              onClick={() => exportInvoicesCsv(agentInvoices, selectedAgent.name)}
              disabled={agentInvoices.length === 0}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
            >
              Экспорт CSV
            </button>
          )}
        </div>

        {!selectedAgent && (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
            Найдите и выберите агента, чтобы увидеть его счета
          </p>
        )}
        {selectedAgent && agentInvoicesLoading && (
          <p className="mt-4 text-center text-sm text-slate/60">Загрузка...</p>
        )}
        {selectedAgent && agentInvoicesError && (
          <p className="mt-4 text-center text-sm text-red-600">Ошибка: {agentInvoicesError}</p>
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
