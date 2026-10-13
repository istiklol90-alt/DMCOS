import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { AdminListFlag, AdminListTableCtx, Booking } from "./Reservations";
import { fetchJson, formatDate } from "./financeShared";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { SkeletonRow } from "../components/ui/Skeleton";
import { useFeedback } from "../components/ui/Feedback";
import { useTranslation } from "react-i18next";
import {
  TableShell,
  TableHeadRow,
  TableHeadCell,
  TableCell,
  TableEmptyState,
  TableErrorState,
} from "../components/ui/Table";

// ---------------------------------------------------------------------------
// The admin booking queue's table. Admin-only: rendered through
// AdminBookingExtensions.renderTable, so the agent's list (Reservations.tsx's
// own table) never loads or reaches this file.
//
// What it changes against the table it replaces:
//
//   * A booking's STATUS and the REASON it needs someone are two separate
//     columns. They used to be fused into the row itself -- a red row, a red
//     chip and a pulsing red button all meaning "nobody has taken this" --
//     so a queue of new bookings was one solid block of red and nothing in
//     it could be ranked.
//   * Related facts share a cell (hotel over room type, dates over nights
//     and party, profit over the net cost it was computed from) instead of
//     each taking a column: twelve columns and a horizontal scrollbar became
//     nine that fit a laptop with the sidebar open.
//   * Taking a booking asks first. A claim cannot be released from this
//     screen and it creates a draft invoice, so one stray click on a pulsing
//     button was a permanent, wrong owner.
//
// Everything here is derived from the row it is drawn on, so every cell is
// true regardless of pagination. Counts ACROSS bookings are a different
// matter and are deliberately not attempted in this file.
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ["Cancelled", "Rejected", "Completed"];

// One tone per stage. Waiting Hotel is its own colour (the ball is in the
// hotel's court) rather than sharing Pending's amber, and Completed is
// neutral rather than sharing Confirmed's green -- finished is not the same
// fact as agreed.
const STATUS_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Pending: "warning",
  "Waiting Hotel": "info",
  "Partially Confirmed": "success",
  Confirmed: "success",
  "Cancellation Requested": "cancelled",
  Cancelled: "cancelled",
  Rejected: "danger",
  Completed: "ink",
};

// Status VALUE -> the catalog key holding its label. The label comes from the
// same place the filter dropdown and the booking detail take theirs
// (reservations:statusBadge.*, with the admin wording layered on in
// i18nAdmin.ts), so one status never reads three different ways on one
// screen. The value itself is untouched -- it is what the server stores.
const STATUS_LABEL_KEY: Record<string, string> = {
  Draft: "draft",
  Pending: "pending",
  "Waiting Hotel": "waitingHotel",
  "Partially Confirmed": "partiallyConfirmed",
  Confirmed: "confirmed",
  "Cancellation Requested": "cancellationRequested",
  Cancelled: "cancelled",
  Rejected: "rejected",
  Completed: "completed",
};

function StatusCell({ status }: { status: string }) {
  const { t } = useTranslation("reservations");
  const labelKey = STATUS_LABEL_KEY[status];
  // The dot marks a status that is still open; a closed one is a plain pill.
  const open = !TERMINAL_STATUSES.includes(status);
  return (
    <Badge
      tone={STATUS_TONE[status] ?? "neutral"}
      dot={open}
      className={status === "Cancelled" ? "line-through decoration-cancelled/40" : ""}
    >
      {labelKey ? t(`statusBadge.${labelKey}`) : status}
    </Badge>
  );
}

type Severity = "urgent" | "attention";

interface Reason {
  severity: Severity;
  text: string;
  detail?: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function flagReason(flag: AdminListFlag): Reason {
  if (flag.kind === "pending_soon") {
    const d = flag.daysUntilArrival;
    const when = d < 0 ? `arrival was ${plural(-d, "day")} ago` : d === 0 ? "arrives today" : `arrives in ${plural(d, "day")}`;
    return { severity: "urgent", text: `Still pending — ${when}` };
  }
  return {
    severity: "urgent",
    text: `Cancellation terms tighten in ${plural(flag.daysUntilCross, "day")}`,
    detail: `A penalty starts applying ${plural(flag.nextThreshold, "day")} before arrival.`,
  };
}

// Most pressing first. Dated, external deadlines outrank internal
// housekeeping: a hotel's penalty date does not move, an unowned booking can
// be picked up in a second.
function reasonsFor(
  booking: Booking,
  flags: AdminListFlag[],
  changeNote: string | undefined,
): Reason[] {
  const reasons: Reason[] = flags.map(flagReason);
  if (booking.status === "Cancellation Requested") {
    reasons.push({ severity: "attention", text: "Cancellation awaiting hotel" });
  }
  if (changeNote) {
    reasons.push({ severity: "attention", text: "Changed — review invoice", detail: changeNote });
  }
  if (booking.claimed_by === null && !TERMINAL_STATUSES.includes(booking.status)) {
    const age = daysSince(booking.created_at);
    reasons.push({
      severity: "attention",
      text: age === 0 ? "No manager · new today" : `No manager · ${plural(age, "day")}`,
    });
  }
  return reasons;
}

// The row's leading edge. An inset shadow rather than a border: a left border
// on a <td> in a border-collapse table shifts that one cell's content.
const EDGE: Record<Severity, string> = {
  urgent: "shadow-[inset_3px_0_0_0_var(--color-danger)]",
  attention: "shadow-[inset_3px_0_0_0_var(--color-warning)]",
};

function ReasonCell({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return <span className="text-slate/35">—</span>;
  const [first, ...rest] = reasons;
  const title = reasons.map((r) => (r.detail ? `${r.text}\n${r.detail}` : r.text)).join("\n\n");
  return (
    // Wraps onto the row's second line rather than widening the column: the
    // longest reasons ("Still pending — arrival was 12 days ago") would
    // otherwise push the money columns off a 1440px screen.
    <span title={title} className="inline-flex max-w-[7.25rem] items-baseline gap-1.5 leading-snug">
      <span className={first.severity === "urgent" ? "font-medium text-danger" : "font-medium text-warning"}>
        {first.text}
      </span>
      {rest.length > 0 && <span className="text-xs text-slate/60">+{rest.length}</span>}
    </span>
  );
}

const numberFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function saleTotal(b: Booking): number {
  if (b.application_total != null) return b.application_total;
  return b.total_amount + (b.transfer_total ?? 0) + (b.mandatory_tax_total ?? 0);
}

function partyText(b: Booking): string {
  const parts = [plural(b.adults, "adult")];
  if (b.children > 0) parts.push(`${b.children} child${b.children === 1 ? "" : "ren"}`);
  if (b.infants > 0) parts.push(plural(b.infants, "infant"));
  return parts.join(", ");
}

const SUB = "mt-0.5 block text-xs text-slate/65";

export default function AdminBookingsTable({
  ctx,
  changeNoteFor,
  financialsFor,
}: {
  ctx: AdminListTableCtx;
  // The latest "booking changed after it was invoiced" note for a booking,
  // already formatted, or undefined when there is nothing to review.
  changeNoteFor: (bookingId: number) => string | undefined;
  // Net cost and profit for a booking. profit is null when it was never
  // computed (a booking older than the Pricing Engine) -- shown as a dash,
  // never as zero, which would read as a real zero-margin sale.
  financialsFor: (booking: Booking) => { netTotal: number; profit: number | null; adjusted: boolean };
}) {
  const { confirm, toast } = useFeedback();
  const [takingId, setTakingId] = useState<number | null>(null);
  const columnCount = 9;

  async function take(e: MouseEvent, booking: Booking) {
    // The row opens the booking on click; taking it must not also do that.
    e.stopPropagation();
    if (takingId !== null) return;
    const ok = await confirm({
      title: `Assign ${booking.booking_number} to yourself?`,
      message:
        "You become the responsible manager for this booking and a draft invoice is created for it. This cannot be undone from this screen.",
      confirmLabel: "Assign to me",
    });
    if (!ok) return;
    setTakingId(booking.id);
    try {
      const token = localStorage.getItem("token") || "";
      const updated = await fetchJson<Booking>(`/booking-engine/bookings/${booking.id}/claim`, token, {
        method: "POST",
      });
      ctx.onClaimed(updated);
      toast(`${booking.booking_number} is now assigned to you`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not assign the booking", "error");
    } finally {
      setTakingId(null);
    }
  }

  function openOnKey(e: KeyboardEvent, booking: Booking) {
    if (e.target !== e.currentTarget) return; // a key pressed on the Take button is the button's
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ctx.onOpen(booking);
    }
  }

  const arrow = (key: AdminListTableCtx["sortKey"]) =>
    ctx.sortKey === key ? (ctx.sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <TableShell
      minWidth="1040px"
      // 13px body text: the size dense operational tables settle on -- a
      // step below the 14px used for forms and prose, still well above the
      // 9-11px labels this screen used to lean on.
      className={`[&_td]:text-[13px] transition-opacity ${ctx.isBackgroundRefresh ? "pointer-events-none opacity-50" : ""}`}
    >
      <TableHeadRow>
        <TableHeadCell onClick={() => ctx.onSort("created_at")}>Booking{arrow("created_at")}</TableHeadCell>
        <TableHeadCell>Agent</TableHeadCell>
        <TableHeadCell>Hotel / room</TableHeadCell>
        <TableHeadCell onClick={() => ctx.onSort("arrival_date")}>Stay{arrow("arrival_date")}</TableHeadCell>
        <TableHeadCell onClick={() => ctx.onSort("status")}>Status{arrow("status")}</TableHeadCell>
        <TableHeadCell>Manager</TableHeadCell>
        <TableHeadCell>Needs action</TableHeadCell>
        <TableHeadCell className="text-right">Sale</TableHeadCell>
        <TableHeadCell className="text-right">Profit</TableHeadCell>
      </TableHeadRow>
      <tbody>
        {ctx.isFirstLoad ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} columns={columnCount} />)
        ) : ctx.error ? (
          <TableErrorState colSpan={columnCount}>Error: {ctx.error}</TableErrorState>
        ) : ctx.bookings.length === 0 ? (
          <TableEmptyState colSpan={columnCount}>No bookings match these filters</TableEmptyState>
        ) : (
          ctx.bookings.map((b) => {
            const reasons = reasonsFor(b, ctx.flagsByBooking[b.id] ?? [], changeNoteFor(b.id));
            const severity: Severity | null = reasons.some((r) => r.severity === "urgent")
              ? "urgent"
              : reasons.length > 0
                ? "attention"
                : null;
            const open = !TERMINAL_STATUSES.includes(b.status);
            const company = ctx.companyNames[b.agent_id];
            const money = financialsFor(b);
            return (
              <tr
                key={b.id}
                tabIndex={0}
                onClick={() => ctx.onOpen(b)}
                onKeyDown={(e) => openOnKey(e, b)}
                className="cursor-pointer border-b border-ink/5 align-top last:border-b-0 hover:bg-sand/60 focus-visible:bg-sand/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40"
              >
                <TableCell className={`whitespace-nowrap ${severity ? EDGE[severity] : ""}`}>
                  <span className="font-semibold text-ink">{b.booking_number}</span>
                  <span className={SUB}>{formatDate(b.created_at)}</span>
                </TableCell>
                <TableCell>
                  <span className="text-ink">{ctx.userNames[b.agent_id] ?? `#${b.agent_id}`}</span>
                  {company && <span className={SUB}>{company}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="block max-w-[8.5rem] truncate text-ink" title={ctx.hotels[b.hotel_id]}>
                    {ctx.hotels[b.hotel_id] ?? `#${b.hotel_id}`}
                  </span>
                  <span className={`${SUB} max-w-[8.5rem] truncate`} title={ctx.roomTypes[b.room_type_id]}>
                    {ctx.roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="tabular-nums text-ink">
                    {formatDate(b.arrival_date)} – {formatDate(b.departure_date)}
                  </span>
                  <span className={SUB}>
                    {plural(b.nights, "night")} · {partyText(b)}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusCell status={b.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {b.claimed_by !== null ? (
                    <span
                      className="block max-w-[6.5rem] truncate text-ink"
                      title={ctx.userNames[b.claimed_by] ?? undefined}
                    >
                      {ctx.userNames[b.claimed_by] ?? `#${b.claimed_by}`}
                    </span>
                  ) : open && ctx.canClaim ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => take(e, b)}
                      disabled={takingId !== null}
                    >
                      {takingId === b.id ? "Assigning…" : "Assign to me"}
                    </Button>
                  ) : (
                    <span className="text-slate/35">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ReasonCell reasons={reasons} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  <span className="font-medium text-ink">{numberFormat.format(saleTotal(b))}</span>
                  <span className={SUB}>{b.currency}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {money.profit !== null ? (
                    <span className={`font-medium ${money.profit < 0 ? "text-danger" : "text-ink"}`}>
                      {numberFormat.format(money.profit)}
                    </span>
                  ) : (
                    <span
                      className="cursor-help text-slate/35"
                      title="Not computed — this booking was created before the Pricing Engine"
                    >
                      —
                    </span>
                  )}
                  <span
                    className={SUB}
                    title={money.adjusted ? "Our cost includes a manual correction from the commercial ledger" : "What this booking costs us"}
                  >
                    cost {numberFormat.format(money.netTotal)}
                    {money.adjusted && <span className="ml-1 text-warning">✎</span>}
                  </span>
                </TableCell>
              </tr>
            );
          })
        )}
      </tbody>
    </TableShell>
  );
}
