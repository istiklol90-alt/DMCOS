import { useEffect, useState } from "react";
import type { Invoice, AgentOption } from "./financeShared";
import { DateRangePicker } from "./HotelSearch";
import { useFeedback } from "../components/ui/Feedback";
import {
  TableShell,
  TableHeadRow,
  TableHeadCell,
  TableRow,
  TableCell,
  TableNumericCell,
  TableEmptyState,
} from "../components/ui/Table";
import {
  flagKind,
  invoiceOnCancelledBooking,
  flagAmountDelta,
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

// Decision 185: csvEscape and normalizeBookingNumber went with the section
// they served. The client-side CSV of one agent's search results is gone --
// the real .xlsx agent statement (Decision 086) lives on the Balance tab and
// is unaffected. Booking numbers no longer need normalizing: the server
// matches "BK-000040", "000040" or any substring of either number directly.


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
  // Decision 186: with the separate "Needs attention" table gone, ordering
  // is what replaces it. Three tiers, most urgent first: a real money
  // difference, then anything else flagged or unsent, then the rest. Within
  // a tier the server's own order (newest first) is preserved -- sort() is
  // stable in every engine this runs on.
  const attentionRank = (inv: Invoice): number => {
    if (isUrgentFlag(inv) && flagKind(inv) === "money") return 0;
    if (isUrgentFlag(inv) || inv.status === "Draft" || inv.status === READY) return 1;
    return 2;
  };
  const sorted = [...invoices].sort((a, b) => attentionRank(a) - attentionRank(b));

  return (
    // Decision 187: the Bookings list's ruled grid (Decision 176), not a
    // hand-rolled table. This file was one of the seven copies Table.tsx was
    // extracted from and had never adopted it -- so the two money screens in
    // the same admin panel read as two different products.
    <TableShell density="grid" minWidth="1080px">
      <TableHeadRow>
        <TableHeadCell>Invoice #</TableHeadCell>
        <TableHeadCell>Booking</TableHeadCell>
        <TableHeadCell>Hotel</TableHeadCell>
        <TableHeadCell>Date</TableHeadCell>
        <TableHeadCell>Amount</TableHeadCell>
        <TableHeadCell>Status</TableHeadCell>
        <TableHeadCell>Email</TableHeadCell>
        <TableHeadCell>{null}</TableHeadCell>
      </TableHeadRow>
        <tbody>
          {sorted.length === 0 ? (
            <TableEmptyState colSpan={8}>No invoices yet</TableEmptyState>
          ) : (
            sorted.map((inv) => (
              <TableRow
                key={inv.id}
                // Decision 182: red is reserved for a real money difference. A
                // booking that changed without moving the amount gets amber --
                // still flagged, still needs a look, but no longer
                // indistinguishable from an invoice that is short.
                className={`border-b border-ink/5 last:border-b-0 ${
                  // Decision 183: a Draft is money nobody has sent. It stays
                  // red for as long as that is true, whatever else is or
                  // isn't flagged on it -- the owner's rule, and the reason
                  // it also refuses to leave today's list.
                  // Decision 202: so is one waiting with accounting -- still
                  // money the agent has not been sent.
                  inv.status === "Draft" || inv.status === READY
                    ? "border-l-8 border-l-red-600 bg-red-500/20 hover:bg-red-500/30"
                    : !isUrgentFlag(inv)
                      ? "hover:bg-sand/40"
                      : flagKind(inv) === "money"
                        ? "border-l-8 border-l-red-600 bg-red-500/20 hover:bg-red-500/30"
                        : "border-l-8 border-l-warning bg-warning/10 hover:bg-warning/20"
                }`}
              >
                <TableCell className="font-medium text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    {inv.invoice_number}
                    {inv.status === "Draft" && (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Not sent
                      </span>
                    )}
                    {/* Decision 202: handed over by reservations -- this is
                        accounting's to check and post. */}
                    {inv.status === READY && (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        To post
                      </span>
                    )}
                    {inv.status === "Draft" && inv.return_note && (
                      <span
                        className="cursor-help rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        title={`Returned to reservations: ${inv.return_note}`}
                      >
                        Returned
                      </span>
                    )}
                    {isUrgentFlag(inv) && (() => {
                      const kind = flagKind(inv);
                      const delta = flagAmountDelta(inv);
                      return (
                        <span
                          className={`cursor-help rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                            kind === "money" ? "bg-red-600" : "bg-warning"
                          }`}
                          title={formatReviewNotes(inv.review_notes, inv.currency) || undefined}
                        >
                          {invoiceOnCancelledBooking(inv)
                            ? "Booking cancelled — invoice still live"
                            : kind === "money" && delta !== null
                              ? `Amount ${delta > 0 ? "+" : ""}${formatMoney(delta, inv.currency)}`
                              : "Changed, same amount"}
                        </span>
                      );
                    })()}
                  </span>
                </TableCell>
                {/* Decision 182: the booking number and the hotel's name,
                    resolved server-side in bulk. These were "#29" and "#2" --
                    nobody knows a hotel by its row id. The raw id remains the
                    fallback if a booking or hotel was deleted. */}
                <TableCell>{inv.booking_number ?? `#${inv.booking_id}`}</TableCell>
                <TableCell>{inv.hotel_name ?? `#${inv.hotel_id}`}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(inv.issue_date)}</TableCell>
                <TableNumericCell className="font-medium text-ink">
                  {formatMoney(inv.total, inv.currency)}
                </TableNumericCell>
                <TableCell>
                  <StatusBadge status={inv.status} label={inv.status === "Void" ? voidLabel(null) : undefined} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {inv.email_sent_at ? (
                    new Date(inv.email_sent_at).toLocaleString("en-US")
                  ) : (
                    <span className="text-slate/40">not sent</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onDetail(inv)}
                      className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand"
                    >
                      Details
                    </button>
                    {/* Decision 202: a Draft is still with reservations --
                        accounting posts only what the manager sent over. */}
                    {inv.status === "Draft" && (
                      <span className="self-center whitespace-nowrap text-xs text-slate/50">With reservations</span>
                    )}
                    {/* Decision 205: Return lives inside Details, where the
                        figures it is about are on screen. */}
                    {inv.status === READY && (
                      <button
                        type="button"
                        onClick={() => onApprove(inv)}
                        disabled={approvingId === inv.id}
                        className="appearance-none rounded-lg border-0 bg-teal px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {approvingId === inv.id ? "..." : "Post & send to agent"}
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
                </TableCell>
              </TableRow>
            ))
          )}
        </tbody>
    </TableShell>
  );
}

// Decision 202: the reservations manager has handed the invoice over.
const READY = "Ready for posting";

// Local so this page doesn't reach into Reservations.tsx for one helper.
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LIST_PAGE_SIZE = 25;
const ALL_STATUS_TABS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  // Decision 202: accounting's own to-do -- what reservations has sent over.
  { label: "Ready for posting", value: READY },
  // Draft first after All: these are the ones nobody has sent yet, which is
  // the only state on this screen where money is actually waiting.
  { label: "Draft", value: "Draft" },
  { label: "Issued", value: "Issued" },
  { label: "Void", value: "Void" },
];

const Invoices = () => {

  // Decision 182: the all-invoices list.
  const [listInvoices, setListInvoices] = useState<Invoice[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listCounts, setListCounts] = useState<Record<string, number>>({});
  const [listStatus, setListStatus] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  // Decision 183: date-scoped like the Bookings list. Opens on today, which
  // with the Draft carry-forward means "today's work plus everything still
  // unsent" -- the only two things a person opening this screen needs.
  const [listFrom, setListFrom] = useState(todayStr());
  const [listTo, setListTo] = useState(todayStr());
  const [listPage, setListPage] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Bumped after any write (void / approve / acknowledge) so the list
  // reflects it without the caller having to remember to refresh.
  const [listRefresh, setListRefresh] = useState(0);

  // Decision 185: the agent is now a FILTER on the one list, not a separate
  // search with its own results table. null = every agent.
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);

  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const { confirm, toast } = useFeedback();


  // Decision 182: the all-invoices list. Debounced on the search box so
  // typing an invoice number is one request per pause, not per keystroke.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("skip", String(listPage * LIST_PAGE_SIZE));
    params.set("limit", String(LIST_PAGE_SIZE));
    if (listStatus) params.set("status", listStatus);
    if (listSearch.trim()) params.set("search", listSearch.trim());
    params.set("date_from", listFrom);
    params.set("date_to", listTo);
    if (selectedAgent) params.set("agent_id", String(selectedAgent.id));
    const countParams = new URLSearchParams();
    if (listStatus) countParams.set("status", listStatus);
    if (listSearch.trim()) countParams.set("search", listSearch.trim());
    countParams.set("date_from", listFrom);
    countParams.set("date_to", listTo);
    if (selectedAgent) countParams.set("agent_id", String(selectedAgent.id));

    const timer = setTimeout(() => {
      setListLoading(true);
      setListError(null);
      Promise.all([
        fetchJson<Invoice[]>(`/finance-engine/invoices?${params.toString()}`, token),
        fetchJson<{ total: number }>(`/finance-engine/invoices/count?${countParams.toString()}`, token),
      ])
        .then(([rows, count]) => {
          if (cancelled) return;
          setListInvoices(rows);
          setListTotal(count.total);
        })
        .catch((err) => {
          if (!cancelled) setListError(err.message);
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
    }, listSearch.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listStatus, listSearch, listFrom, listTo, selectedAgent, listPage, listRefresh]);

  // The per-status counts on the tabs. Deliberately independent of the
  // current filter -- a tab has to say how many are in it, not how many
  // survive the filter you are already inside.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    let cancelled = false;
    Promise.all(
      ALL_STATUS_TABS.map((tab) =>
        fetchJson<{ total: number }>(
          `/finance-engine/invoices/count?date_from=${listFrom}&date_to=${listTo}` +
            (tab.value ? `&status=${encodeURIComponent(tab.value)}` : "") +
            (selectedAgent ? `&agent_id=${selectedAgent.id}` : ""),
          token,
        ).then((r) => [tab.value ?? "all", r.total] as const),
      ),
    )
      .then((pairs) => {
        if (!cancelled) setListCounts(Object.fromEntries(pairs));
      })
      .catch(() => {
        // Counts are decoration on the tabs; the list itself still works.
      });
    return () => {
      cancelled = true;
    };
  }, [listRefresh, listFrom, listTo, selectedAgent]);



  // Decision 186: one list, so one refresh.
  async function refreshBoth() {
    // Decision 182: the all-invoices list is on the same screen, so a void
    // or an approve must land there too -- otherwise the row a manager just
    // acted on keeps showing its old status right under the one that moved.
    setListRefresh((n) => n + 1);
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

  // Decision 202: accounting's final step -- only for an invoice the
  // reservations manager has sent over (the server refuses anything else).
  async function handleApproveAndSend(invoice: Invoice) {
    const ok = await confirm({
      title: `Post ${invoice.invoice_number} and send it to the agent?`,
      message: (
        <div className="space-y-2">
          <p>
            Amount: <strong className="text-ink">{formatMoney(invoice.total, invoice.currency)}</strong>
            {invoice.booking_number ? <> · {invoice.booking_number}</> : null}
          </p>
          <p>The agent receives the invoice by email and can download it from their panel from now on.</p>
          {isUrgentFlag(invoice) && (
            <p className="whitespace-pre-line rounded-md bg-warning/10 px-2.5 py-2 text-warning">
              The booking changed after this invoice was created:
              {"\n"}
              {formatReviewNotes(invoice.review_notes, invoice.currency)}
            </p>
          )}
        </div>
      ),
      confirmLabel: "Post & send to agent",
    });
    if (!ok) return;
    const token = localStorage.getItem("token") || "";
    try {
      setApprovingId(invoice.id);
      await fetchJson<Invoice>(`/finance-engine/invoices/${invoice.id}/approve-and-send`, token, { method: "POST" });
      toast(`${invoice.invoice_number} posted and sent to the agent`, "success");
      await refreshBoth();
    } catch (err: any) {
      toast(err.message || "Failed to post the invoice", "error");
    } finally {
      setApprovingId(null);
    }
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
      {/* Decision 186: the separate "Needs attention" table is gone. It and
          the list below were both red and both demanded attention, and an
          invoice appeared in BOTH -- INV-AA2FF204A259 was on screen twice,
          two rows apart, with the same buttons. The owner's own proposal:
          one list.

          It is now genuinely one list, not a hidden one. The reason a
          separate panel existed was that the list is date-scoped and a
          flagged invoice from July would fall out of today's window -- so
          flagged invoices carry forward into today exactly as Drafts already
          did (Decision 183). Verified: all 3 flagged invoices are in today's
          window, and the counts still agree. Rows that need attention sort
          to the top, so the panel's job is done by ordering rather than by a
          second table. */}

      {/* Decision 182: the list that was missing. Before this the page had
          only "Needs attention" plus a search that required already knowing
          an agent's name or a booking number -- 39 of 53 invoices were
          reachable by neither, and all 12 Drafts (created, never approved,
          never sent, one of them for 9,609.00) could not appear in the
          flagged panel at all because a Draft has no change note. The
          "Approve & send" button existed in this very table and had no way
          to be reached.

          Filtered, sorted and paginated on the SERVER (Decision 152's rule):
          at 100 bookings a day this list is 3,000 rows a month, and
          filtering a loaded page in the browser silently answers "within
          what happens to be loaded". */}
      {/* Decision 188: no "All invoices" heading. The open tab in the top bar
          already says Invoices; a page titling itself again, one line below,
          is the same word twice for no reader. */}
      <div>
        {/* Decision 185: every control on one bar, in one row -- status,
            dates, agent, number. They used to be split between a cramped
            strip beside the heading and a whole separate section further
            down the page. Same bordered-bar treatment as the Bookings
            toolbar, so the two screens are filtered the same way. */}
        {/* Decision 188: pinned. On a long list the filters scrolled away, so
            changing a status or a date meant scrolling back up first. z-30
            clears the table's own header; -mx/px keeps the bar flush with
            the page padding while its background covers the full width, or
            rows would show through beside it as they pass underneath. */}
        <div className="sticky top-0 z-30 -mx-5 flex flex-wrap items-center gap-2 border-b border-ink/10 bg-sand px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white p-0.5">
              {ALL_STATUS_TABS.map((tab) => (
                <button
                  key={tab.value ?? "all"}
                  type="button"
                  onClick={() => {
                    setListStatus(tab.value);
                    setListPage(0);
                  }}
                  className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                    listStatus === tab.value ? "bg-ink text-white" : "text-slate/70 hover:bg-white"
                  }`}
                >
                  {tab.label}
                  {listCounts[tab.value ?? "all"] !== undefined && (
                    <span className={listStatus === tab.value ? "ml-1.5 text-xs text-white/60" : "ml-1.5 text-xs text-slate/40"}>
                      {listCounts[tab.value ?? "all"]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-ink/10 sm:block" />
            {/* Decision 188: the picker renders an unframed button, so the
                frame is the caller's job -- same border, radius and
                background as the two inputs beside it, or it reads as a
                different kind of control. */}
            <div
              className={`rounded-lg border border-ink/15 bg-white ${
                // Decision 189: a search ignores the dates, so the date
                // control must not keep looking applied while it is.
                listSearch.trim() ? "opacity-40" : ""
              }`}
            >
            {/* Decision 183: the same picker the Bookings list uses, forced
                to English like every other admin surface (Decision 109). */}
            <DateRangePicker
              checkIn={listFrom}
              checkOut={listTo}
              onChange={(from, to) => {
                setListFrom(from);
                setListTo(to);
                setListPage(0);
              }}
              allowPast
              forceLang="en"
            />
            </div>
            {/* Decision 186: no width wrapper. AgentSearchSelect carries its
                own min-w-[280px]; boxing it in a w-56 (224px) made it overflow
                and sit on top of the search field next to it -- min-width wins
                over a parent's width, it does not shrink to fit. */}
            <AgentSearchSelect
              selected={selectedAgent}
              onSelect={(a) => {
                setSelectedAgent(a);
                setListPage(0);
              }}
            />
            <input
              type="text"
              value={listSearch}
              onChange={(e) => {
                setListSearch(e.target.value);
                setListPage(0);
              }}
              placeholder="Invoice or booking #…"
              className="w-64 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate/40 focus:border-gold focus:outline-none"
            />
          </div>
        </div>

        {listError && <p className="mt-3 text-sm text-red-600">{listError}</p>}
        {listLoading && listInvoices.length === 0 ? (
          <p className="mt-3 text-sm text-slate/60">Loading...</p>
        ) : (
          <div className={`mt-3 transition-opacity ${listLoading ? "opacity-50" : ""}`}>
            <InvoiceTable
              invoices={listInvoices}
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate/60">
          <span>
            {listSearch.trim() && (
              <span className="mr-2 text-ink/70">Searching all dates —</span>
            )}
            {listTotal === 0
              ? "Nothing matches"
              : `${listPage * LIST_PAGE_SIZE + 1}–${Math.min((listPage + 1) * LIST_PAGE_SIZE, listTotal)} of ${listTotal}`}
          </span>
          {listTotal > LIST_PAGE_SIZE && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={listPage === 0 || listLoading}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(listPage + 1) * LIST_PAGE_SIZE >= listTotal || listLoading}
                onClick={() => setListPage((p) => p + 1)}
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Decision 185: the separate "Search invoices" section that used to
          sit here is gone. It carried a By-agent / By-booking-number toggle
          and its own results table, so the same question -- "show me these
          invoices" -- was answered by two different lists on one screen,
          with the controls for one of them below the results of the other.
          Both are now filters on the single list above: the agent picker,
          and one search box that matches an invoice number OR a booking
          number (nobody should have to know which field to type it into). */}

      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onAcknowledged={async () => {
            setDetailInvoice(null);
            await refreshBoth();
          }}
          onReturned={async () => {
            toast(`${detailInvoice.invoice_number} returned to reservations`, "success");
            setDetailInvoice(null);
            await refreshBoth();
          }}
        />
      )}
    </div>
  );
};

export default Invoices;
