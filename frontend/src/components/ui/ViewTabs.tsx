// ---------------------------------------------------------------------------
// Admin design system: a row of named views, each with the number of rows
// behind it ("All 128 · Unassigned 12 · Mine 5").
//
// Replaces the grid-of-stat-cards-that-are-secretly-filters pattern: the
// same information and the same click, in one 36px line instead of a band
// of seven cards. The count is supplied by the caller and must describe the
// whole dataset behind that view, never the rows currently on screen.
// ---------------------------------------------------------------------------

export interface ViewTab {
  key: string;
  label: string;
  // Omit while unknown -- a view with no number is honest, a "0" that later
  // turns into "12" is not.
  count?: number;
  // "attention" tints the count when it is non-zero: something is waiting.
  tone?: "default" | "attention";
}

export default function ViewTabs({
  tabs,
  activeKey,
  onSelect,
  className = "",
}: {
  tabs: ViewTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      // overflow-y is pinned shut: `overflow-x: auto` alone makes the other
      // axis scrollable too, and the 1px the active tab's underline hangs
      // below the strip was enough to draw a vertical scrollbar beside it.
      className={`flex items-stretch gap-1 overflow-x-auto overflow-y-hidden border-b border-ink/15 ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const waiting = tab.tone === "attention" && (tab.count ?? 0) > 0;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            className={`inline-flex shrink-0 appearance-none items-center gap-2 border-0 border-b-[3px] bg-transparent px-3 py-2 text-sm transition-colors ${
              active
                ? "border-b-gold font-semibold text-ink"
                : "border-b-transparent font-medium text-slate/75 hover:border-b-ink/15 hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  waiting ? "bg-warning/15 text-warning" : active ? "bg-ink text-white" : "bg-ink/8 text-slate/75"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
