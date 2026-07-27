import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Formalizes the table shell hand-rolled
// independently in BookingsSubViews.tsx, Reservations.tsx, Invoices.tsx,
// Balance.tsx, Cashback.tsx, Contracts.tsx, and ContractsAI.tsx -- all seven
// build the same "rounded-2xl border card wrapping a border-collapse table
// with an uppercase muted header row" shape by hand. This owns that outer
// shape; each page still supplies its own <thead>/<tbody> content (column
// sets genuinely differ per table), so no business/column logic moves here.
// ---------------------------------------------------------------------------

export function TableShell({ children, minWidth }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
      <table
        className="w-full border-collapse text-left text-sm"
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeadRow({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">{children}</tr>
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
  return (
    <th
      onClick={onClick}
      className={["px-4 py-3 font-medium", onClick ? "cursor-pointer select-none" : "", className]
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
  return (
    <tr
      onClick={onClick}
      className={[
        "border-b border-ink/5 last:border-b-0",
        onClick ? "cursor-pointer hover:bg-sand/40" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={["px-4 py-3.5 text-slate/80", className].filter(Boolean).join(" ")}>{children}</td>;
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
