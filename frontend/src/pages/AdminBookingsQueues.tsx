import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";
import type { AdminQueue, AdminQueueBarCtx, BookingsListState } from "./Reservations";
import { fetchJson } from "./financeShared";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import ViewTabs, { type ViewTab } from "../components/ui/ViewTabs";

// ---------------------------------------------------------------------------
// Decision 200 -- the admin booking screen's header and work queues.
// Admin-only: rendered through AdminBookingExtensions.renderQueueBar.
//
// Where each number comes from, because a queue that miscounts is worse than
// no queue:
//
//   * The SELECTED tab shows the list's own total (ctx.total) -- the figure
//     the pagination footer prints. A tab and the rows under it are therefore
//     one number, not two requests that should agree.
//   * All / No manager / My bookings, when not selected, each come from
//     GET /booking-engine/bookings/count, called with exactly the filter
//     string the list itself would send for that queue: the status / hotel /
//     agent / search filters AND the date range. The server computes it with
//     the same filter function the list uses, over the whole database --
//     never from the page on screen. (It used to be /bookings/queue-counts,
//     which takes no dates; the queues did not have a date scope then.)
//   * Needs attention is the length of the complete urgent list the parent
//     already holds, which is also the list that queue displays.
//
// A count that could not be loaded is shown as no number at all, with a way
// to retry -- never as a 0, which would say "nothing is waiting".
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The Bookings controls -- title and view switch, queues, filters, dates --
// are tucked away, and the table gets the screen.
//
// Owner's brief (second version, 2026-10-13): the block is hidden; when the
// pointer comes up to it, it opens; when the pointer leaves it, it closes by
// itself -- no click needed.
//
// What is left in its place is a slim bar (BookingsControlsHandle) that says
// what the hidden controls are currently set to -- a filter nobody can see is
// how a list ends up "missing" bookings -- and is the thing to point at.
//
// Three phases rather than open/closed, for one reason: while the block is
// growing it has to be clipped (or its contents spill over the table for the
// length of the animation), but once open it must NOT be clipped, because
// the date picker opens a calendar that hangs below the filter bar.
// ---------------------------------------------------------------------------

export type ControlsPhase = "collapsed" | "opening" | "open";

// Kept in step with the durations in styles/tailwind.css (`.admin-bookings-list`).
const REVEAL_MS = 250;
// Long enough that crossing the bar on the way to something else opens nothing.
const HOVER_OPEN_DELAY_MS = 120;
// How long the pointer may be outside before the block folds. The three
// blocks have gaps between them and the pointer crosses those; without a
// pause the block would flicker shut on the way from the queues to a filter.
const LEAVE_CLOSE_DELAY_MS = 280;

// Everything that counts as "inside the controls": the handle, the queue bar,
// the filter bar and the line of explanation under it. The last two are
// rendered by the shared booking list, so they are found by position rather
// than by a class of their own -- the same selectors the stylesheet uses.
const CONTROLS_SELECTOR =
  ":scope > .admin-bk-handle, :scope > div > .admin-bk-queuebar, :scope > div > div.sticky, :scope > div > div.sticky + p";

export function useBookingsControlsReveal(wrapRef: RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<ControlsPhase>("collapsed");
  const hoverTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  function clear(timer: { current: number | null }) {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function open() {
    clear(hoverTimer);
    clear(settleTimer);
    setPhase("opening");
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setPhase("open");
    }, REVEAL_MS + 20);
  }

  function close() {
    clear(hoverTimer);
    clear(settleTimer);
    clear(leaveTimer);
    setPhase("collapsed");
  }

  function controlElements(): Element[] {
    return wrapRef.current ? [...wrapRef.current.querySelectorAll(CONTROLS_SELECTOR)] : [];
  }

  // Is this point "on the controls"? Judged by the band of screen they occupy
  // -- from the top of the bar to the bottom of the last block, the full
  // width -- so the gaps between the blocks count as inside. Anything that
  // belongs to a control but hangs outside that band (the date calendar)
  // counts too, by being inside one of the blocks in the document.
  function pointerIsOnControls(x: number, y: number, target: EventTarget | null): boolean {
    const wrap = wrapRef.current;
    if (!wrap) return false;
    const els = controlElements();
    if (target instanceof Node && els.some((el) => el.contains(target))) return true;
    const band = wrap.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    return x >= band.left && x <= band.right && y >= top - 4 && y <= bottom + 6;
  }

  // Someone typing in the search box has not left, wherever the mouse drifted.
  function typingInControls(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && controlElements().some((el) => el.contains(active));
  }

  const isOpen = phase !== "collapsed";

  // One click anywhere outside the controls puts them away. A click inside --
  // choosing a status, a queue, a date -- never does: setting three filters
  // must not take three trips. The click is not swallowed: clicking a booking
  // closes the controls AND opens that booking, which is what was asked for
  // by clicking it.
  useEffect(() => {
    if (!isOpen) return;
    function onDocumentClick(e: MouseEvent) {
      const wrap = wrapRef.current;
      const target = e.target as Node | null;
      if (!wrap || !target) return;
      // A control that removed itself while handling this very click (a
      // calendar day, a cleared filter) is no longer in the page; that was
      // still a click inside.
      if (!document.contains(target)) return;
      for (const el of wrap.querySelectorAll(CONTROLS_SELECTOR)) {
        if (el.contains(target)) return;
      }
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    // The pointer leaving is what closes the block. Followed by its movement
    // over the whole page rather than by "left this element" events: the
    // controls are several separate blocks, and a native dropdown's list is
    // not part of the page at all -- while one is open the page receives no
    // movement, so choosing a status cannot be mistaken for leaving.
    function onPointerMove(e: globalThis.PointerEvent) {
      if (e.pointerType !== "mouse") return;
      if (pointerIsOnControls(e.clientX, e.clientY, e.target)) {
        clear(leaveTimer);
      } else if (leaveTimer.current === null && !typingInControls()) {
        leaveTimer.current = window.setTimeout(() => {
          leaveTimer.current = null;
          if (!typingInControls()) close();
        }, LEAVE_CLOSE_DELAY_MS);
      }
    }
    // Out of the browser window altogether (up to the address bar, say).
    function onPointerLeaveWindow(e: globalThis.PointerEvent) {
      if (e.pointerType !== "mouse" || leaveTimer.current !== null) return;
      // An open dropdown list also reports this; the dropdown still has focus.
      const active = document.activeElement;
      if (active instanceof HTMLSelectElement && controlElements().some((el) => el.contains(active))) return;
      if (typingInControls()) return;
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = null;
        close();
      }, LEAVE_CLOSE_DELAY_MS);
    }
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointermove", onPointerMove);
    document.documentElement.addEventListener("pointerleave", onPointerLeaveWindow);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeaveWindow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(
    () => () => {
      clear(hoverTimer);
      clear(settleTimer);
      clear(leaveTimer);
    },
    [],
  );

  return {
    phase,
    handleProps: {
      // Hover opens for a mouse only. On a touch screen "pointer entered" is
      // part of the tap and is followed at once by its click -- honouring
      // both would open the block and shut it again in one tap.
      onPointerEnter: (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || isOpen) return;
        clear(hoverTimer);
        hoverTimer.current = window.setTimeout(() => {
          hoverTimer.current = null;
          open();
        }, HOVER_OPEN_DELAY_MS);
      },
      // Leaving the bar before it opened cancels the opening. Closing an open
      // block is the page-wide pointer tracking's job, above.
      onPointerLeave: () => clear(hoverTimer),
      onClick: () => (isOpen ? close() : open()),
    },
  };
}

const QUEUE_LABEL: Record<AdminQueue, string> = {
  all: "All",
  unassigned: "No manager",
  mine: "My bookings",
  attention: "Changes to review",
};

const DATE_VIEW_LABEL: Record<BookingsListState["dateModeView"], string> = {
  staying: "Stay dates",
  created: "Booking date",
  cancellations: "Cancelled arrivals",
};

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// What the hidden controls are set to, in one line.
function describeControls(state: BookingsListState | null): string[] {
  if (!state) return [];
  const parts = [`Queue: ${QUEUE_LABEL[state.queue]}`];
  if (state.queue === "attention") return parts;
  if (state.searchQuery.trim()) {
    parts.push(`Search “${state.searchQuery.trim()}”`);
  } else if (state.dateTo) {
    const range = state.dateFrom === state.dateTo ? shortDate(state.dateFrom) : `${shortDate(state.dateFrom)} – ${shortDate(state.dateTo)}`;
    parts.push(`${DATE_VIEW_LABEL[state.dateModeView]}: ${range}`);
  }
  const filters = [state.statusFilter, state.hotelFilter, state.agentFilter, state.ownerFilter].filter((v) => v !== "all").length;
  parts.push(filters === 0 ? "No filters" : filters === 1 ? "1 filter on" : `${filters} filters on`);
  return parts;
}

export function BookingsControlsHandle({
  phase,
  listState,
  handleProps,
}: {
  phase: ControlsPhase;
  listState: BookingsListState | null;
  handleProps: ReturnType<typeof useBookingsControlsReveal>["handleProps"];
}) {
  const isOpen = phase !== "collapsed";
  const filtersOn =
    listState !== null &&
    listState.queue !== "attention" &&
    [listState.statusFilter, listState.hotelFilter, listState.agentFilter, listState.ownerFilter].some((v) => v !== "all");
  return (
    // The brand's own two colours: navy for the bar, gold for the one thing
    // on it that asks to be noticed (filters that are narrowing the list, and
    // the cue to open it). The bar is the heading of the block it opens --
    // square-bottomed while open so the two read as one panel.
    <button
      type="button"
      aria-expanded={isOpen}
      {...handleProps}
      className={`admin-bk-handle flex w-full appearance-none items-center justify-between gap-3 border-0 bg-ink px-4 py-2 text-left text-xs text-white transition-[border-radius] duration-[250ms] ${
        isOpen ? "rounded-t-lg" : "rounded-lg"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 pr-1 text-base font-semibold text-white">Bookings</span>
        {describeControls(listState).map((part, i) => {
          const isFilterChip = /filters? on$/.test(part);
          return (
            <span
              key={i}
              className={`truncate rounded-full px-2.5 py-0.5 font-medium ${
                isFilterChip && filtersOn ? "bg-gold text-ink" : "bg-white/12 text-white/85"
              }`}
            >
              {part}
            </span>
          );
        })}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-gold">
        Queues & filters
        <span aria-hidden="true" className={`text-[10px] transition-transform duration-[250ms] ${isOpen ? "rotate-180" : ""}`}>
          ▾
        </span>
      </span>
    </button>
  );
}

interface QueueCounts {
  unassigned: number;
  mine: number;
}

export default function AdminQueueBar({
  ctx,
  attentionCount,
  summary,
  heading,
}: {
  ctx: AdminQueueBarCtx;
  // The screen title and view switch, supplied by the page. Falls back to a
  // plain title so the bar still stands on its own.
  heading?: ReactNode;
  // undefined while the urgent list has not loaded (or failed to).
  attentionCount: number | undefined;
  // Page-level figures (cancelled, profit) for the header's right-hand side.
  summary?: ReactNode;
}) {
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // The scope every queue shares: filters, search and dates -- everything in
  // the All queue's request except its own "which manager" filter, which
  // belongs to that queue alone.
  const scopeQuery = (() => {
    const p = new URLSearchParams(ctx.allQuery);
    p.delete("claimed_by");
    return p.toString();
  })();

  useEffect(() => {
    let stale = false;
    const token = localStorage.getItem("token") || "";
    const count = (queueParam: string) =>
      fetchJson<{ total: number }>(
        `/booking-engine/bookings/count?${scopeQuery ? scopeQuery + "&" : ""}${queueParam}`,
        token,
      ).then((r) => r.total);
    Promise.all([count("unassigned=true"), count("mine=true")])
      .then(([unassigned, mine]) => {
        if (stale) return;
        setCounts({ unassigned, mine });
        setFailed(false);
      })
      .catch(() => {
        if (stale) return;
        setCounts(null);
        setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [scopeQuery, ctx.mutationTick, retryTick]);

  useEffect(() => {
    let stale = false;
    const token = localStorage.getItem("token") || "";
    const qs = ctx.allQuery ? `?${ctx.allQuery}` : "";
    fetchJson<{ total: number }>(`/booking-engine/bookings/count${qs}`, token)
      .then((c) => !stale && setAllCount(c.total))
      .catch(() => !stale && setAllCount(null));
    return () => {
      stale = true;
    };
  }, [ctx.allQuery, ctx.mutationTick, retryTick]);

  // When each of the two date exceptions is in effect -- read from the same
  // request the list sends, so the note and the list cannot disagree.
  const scope = new URLSearchParams(ctx.allQuery);
  const searching = scope.has("search");
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  // The server carries unowned bookings forward only into a "booking date"
  // range that contains its today, and only My bookings can never show one.
  const carriesForward =
    !searching &&
    ctx.queue !== "mine" &&
    scope.get("date_view") === "created" &&
    (scope.get("date_from") ?? "") <= today &&
    today <= (scope.get("date_to") ?? "");

  // The selected queue's number is the list's own total once it has loaded.
  const selected = (queue: AdminQueue, fetched: number | undefined) =>
    ctx.queue === queue && !ctx.loading ? ctx.total : fetched;

  const tabs: ViewTab[] = [
    // Labels say what is in the queue. "Changes to review" rather than
    // "changed after invoice": the list also holds cancellations and changes
    // to bookings that were never invoiced.
    { key: "all", label: "All", count: selected("all", allCount ?? undefined) },
    { key: "unassigned", label: "No manager", count: selected("unassigned", counts?.unassigned), tone: "attention" },
    { key: "mine", label: "My bookings", count: selected("mine", counts?.mine) },
    { key: "attention", label: "Changes to review", count: attentionCount, tone: "attention" },
  ];

  return (
    <div className="admin-bk-queuebar mb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        {/* The title is on the navy bar above; this row is for the page's own
            figures, and for anything a caller wants beside them. */}
        {heading ?? <span />}
        {ctx.queue !== "attention" && summary}
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <ViewTabs
          className="min-w-0 flex-1"
          tabs={tabs}
          activeKey={ctx.queue}
          onSelect={(key) => ctx.onQueueChange(key as AdminQueue)}
        />
        {/* Decision 205: also on "Changes to review", so each manager can
            see the returned invoices and changes on their own bookings. */}
        {(ctx.queue === "all" || ctx.queue === "attention") && (
          <label className="flex items-center gap-2 pb-1 text-xs font-medium text-slate/70">
            Manager
            <Select
              value={ctx.ownerFilter}
              onChange={(e) => ctx.onOwnerFilterChange(e.target.value)}
              className="w-auto"
            >
              <option value="all">Anyone</option>
              {ctx.managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {ctx.queue === "attention" && (
        <p className="mt-1.5 text-xs text-slate/70">
          Every change and returned invoice still waiting, whenever it happened — this list is not narrowed by the
          dates, only by the manager you choose.
        </p>
      )}

      {/* The two standing exceptions to "everything here is under the chosen
          dates" (owner, 2026-10-13). Both are deliberate, so both are said
          out loud: a row from outside the range with no explanation looks
          like a broken filter. */}
      {ctx.queue !== "attention" && searching && (
        <p className="mt-1.5 text-xs text-slate/70">
          Searching by booking number looks through all dates — the date range is not applied while you search.
        </p>
      )}
      {ctx.queue !== "attention" && carriesForward && (
        <p className="mt-1.5 text-xs text-slate/70">
          Today's list also includes earlier bookings that still have no manager. They stay here until someone takes them.
        </p>
      )}

      {failed && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-danger">
          Queue counts could not be loaded. The list below is unaffected.
          <Button variant="outline" size="sm" onClick={() => setRetryTick((n) => n + 1)}>
            Retry
          </Button>
        </p>
      )}
    </div>
  );
}
