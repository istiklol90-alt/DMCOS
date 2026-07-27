// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Replaces the plain "Loading..."/
// "Loading bookings..." text scattered across every page's loading state
// (confirmed during scoping: every list/table/detail view in the app shows
// bare loading text today, no skeleton anywhere) with a pulsing placeholder
// shape -- the base primitive plus the two shapes needed most often
// (a text line, and a table row) once real screens start adopting it.
// Pure CSS (Tailwind's built-in `animate-pulse`), no new dependency.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={["animate-pulse rounded-md bg-ink/10", className].filter(Boolean).join(" ")} style={style} />;
}

export function SkeletonText({ width = "100%", className = "" }: { width?: string; className?: string }) {
  return <Skeleton className={["h-4", className].filter(Boolean).join(" ")} style={{ width }} />;
}

export function SkeletonRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-ink/5 last:border-b-0">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton className="h-4 w-full max-w-[140px]" />
        </td>
      ))}
    </tr>
  );
}
