// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Two shapes, matching the two divider
// patterns already hand-built this session: a full-width horizontal rule
// (the common section-separator), and the inset vertical line introduced
// in HotelSearch.tsx's search panel restyle (self-stretch + vertical margin,
// shorter than the container's full height -- "a subtle line, not a full
// border" between fields laid out in a row). `inset` only applies to the
// vertical orientation; a horizontal rule spanning the full row width is
// the norm for that orientation.
// ---------------------------------------------------------------------------

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export default function Divider({ orientation = "horizontal", className = "" }: DividerProps) {
  if (orientation === "vertical") {
    return <div className={["w-px self-stretch bg-ink/10 my-5", className].filter(Boolean).join(" ")} />;
  }
  return <div className={["h-px w-full bg-ink/10", className].filter(Boolean).join(" ")} />;
}
