import { createContext, useContext } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Density. "comfortable" is the original look and stays the default, so no
// existing caller moves. "grid" is the ruled, spreadsheet-style variant first
// built by hand for the Commercial breakdown -- dark text, bold headers in
// normal case, every cell ruled, tighter rows.
//
// Passed by context rather than as a prop on all six components: a caller
// would otherwise have to thread the same value through fourteen cells per
// row, and the one it forgot would be the one that looks wrong.
//
// Deliberately opt-in. TableShell is shared with the agent-facing bookings
// list, and changing the default would restyle a screen nobody asked about.
// ---------------------------------------------------------------------------

export type TableDensity = "comfortable" | "grid";

const DensityContext = createContext<TableDensity>("comfortable");

function useDensity(): TableDensity {
  return useContext(DensityContext);
}

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Formalizes the table shell hand-rolled
// independently in BookingsSubViews.tsx, Reservations.tsx, Invoices.tsx,
// Balance.tsx, Cashback.tsx, Contracts.tsx, and ContractsAI.tsx -- all seven
// build the same "rounded-2xl border card wrapping a border-collapse table
// with an uppercase muted header row" shape by hand. This owns that outer
// shape; each page still supplies its own <thead>/<tbody> content (column
// sets genuinely differ per table), so no business/column logic moves here.
// ---------------------------------------------------------------------------

export function TableShell({
  children,
  minWidth,
  className = "",
  density = "comfortable",
}: {
  children: ReactNode;
  minWidth?: string;
  // Appended to the wrapper, for per-table state the shell itself has no
  // business knowing about (Reservations.tsx dims its whole table during a
  // background refresh). Never used to restyle the shell's own shape.
  className?: string;
  density?: TableDensity;
}) {
  const grid = density === "grid";
  return (
    <DensityContext.Provider value={density}>
      <div
        className={[
          "mt-4 overflow-x-auto bg-white",
          // A grid needs a frame heavy enough to read as one. ink/10 is
          // rgb(232,233,236) on white -- effectively invisible, which is
          // exactly how the first hand-built version of this failed.
          grid ? "rounded-lg border border-ink/25" : "rounded-2xl border border-ink/10",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <table
          className="w-full border-collapse text-left text-sm"
          style={minWidth ? { minWidth } : undefined}
        >
          {children}
        </table>
      </div>
    </DensityContext.Provider>
  );
}

export function TableHeadRow({ children }: { children: ReactNode }) {
  const grid = useDensity() === "grid";
  return (
    <thead>
      <tr
        className={
          grid
            ? "text-ink"
            : // Admin: the header is the one line every row is read against,
              // so it gets real contrast and a faint band instead of the
              // 50%-grey label style (roughly 3:1 on white).
              "border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50 admin:bg-sand/70 admin:text-slate/75"
        }
      >
        {children}
      </tr>
    </thead>
  );
}

export function TableHeadCell({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const grid = useDensity() === "grid";
  return (
    <th
      onClick={onClick}
      className={[
        // The rule under the head is heavier than the row rules, so the head
        // reads as a head rather than as one more row.
        grid
          ? "border-b-2 border-r border-ink/25 px-3 py-2.5 font-semibold"
          : "px-4 py-3 font-medium admin:px-3 admin:py-2.5 admin:font-semibold",
        onClick ? "cursor-pointer select-none" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </th>
  );
}

export function TableRow({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  // Same reasoning as TableCell's text color below: a row that carries its
  // own hover treatment (Reservations.tsx's "needs attention" row deepens
  // its red on hover instead of washing out to the neutral sand) must not
  // also receive the default one -- two hover background utilities in one
  // class list are resolved by stylesheet order, not by this array's order.
  const hasOwnHover = /(^|\s)hover:bg-/.test(className);
  const grid = useDensity() === "grid";
  return (
    <tr
      onClick={onClick}
      className={[
        // In grid mode the cells carry the rules, so the row must not draw a
        // second, lighter one underneath them.
        grid ? "" : "border-b border-ink/5 last:border-b-0",
        onClick ? (hasOwnHover ? "cursor-pointer" : "cursor-pointer hover:bg-sand/40") : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </tr>
  );
}

// A caller-supplied text color must actually win. Emitting the default
// `text-slate/80` alongside e.g. `text-slate/50` puts two utilities for the
// same property in one class list, where the winner is decided by the
// stylesheet's own order, not by the order of the strings here -- so the
// call site's intent silently may or may not apply (real, recurring bug
// class in this project). The default is therefore dropped whenever the
// caller sets any text color of its own.
const TEXT_COLOR_CLASS = /(^|\s)text-(slate|ink|white|gold|gold-deep|danger|warning|success|cancelled|info)\b/;
// Same rule for vertical padding: the admin row height below is a default,
// and a caller that sets its own `py-*` keeps it.
const PADDING_Y_CLASS = /(^|\s)py-/;

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  const grid = useDensity() === "grid";
  // Comfortable rows are ~52px, sized for the agent's short lists. Inside
  // the admin panel the same density drops to ~44px: still two-line
  // capable, but a third more rows per screen.
  const comfortable = PADDING_Y_CLASS.test(className)
    ? "px-4 py-3.5 admin:px-3"
    : "px-4 py-3.5 admin:px-3 admin:py-2.5";
  const padding = grid ? "border-b border-r border-ink/20 px-3 py-2" : comfortable;
  // Grid mode reads at near-black by default (the reference the owner
  // supplied), comfortable mode keeps its muted slate. Either way the
  // caller's own colour still wins -- see TEXT_COLOR_CLASS above.
  const defaultColor = grid ? "text-ink" : "text-slate/80";
  const base = TEXT_COLOR_CLASS.test(className) ? padding : `${padding} ${defaultColor}`;
  return <td className={[base, className].filter(Boolean).join(" ")}>{children}</td>;
}

// Money/counts: lining figures so digits stack in a column instead of
// jittering per row. Alignment deliberately left as-is for now -- several
// tables append further numeric columns after this one, and moving them all
// to right-alignment together belongs to the admin-side pass, not here.
export function TableNumericCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Grid mode right-aligns money, which is the whole reason the breakdown
  // became readable: digits stack against a common edge instead of drifting
  // with the width of each figure. Comfortable mode keeps its existing
  // left alignment -- several tables append further numeric columns after
  // this one and moving them all is its own pass, as noted before.
  const grid = useDensity() === "grid";
  return (
    <TableCell
      className={["whitespace-nowrap tabular-nums", grid ? "text-right" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </TableCell>
  );
}

export function TableEmptyState({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate/50">
        {children}
      </td>
    </tr>
  );
}

// Same shape as TableEmptyState, danger-toned: "the request failed" is not
// the same fact as "there is nothing here", and every table that has both
// was styling them by hand.
export function TableErrorState({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-danger">
        {children}
      </td>
    </tr>
  );
}
