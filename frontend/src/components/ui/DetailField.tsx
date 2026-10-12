import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, block C. One "label above value" pair, the unit every
// detail panel in this project is built out of. Reservations.tsx's booking
// detail alone hand-wrote this exact three-element shape twelve times, each
// copy free to drift in label size, weight, tracking or the gap between the
// two lines -- which is how a panel ends up looking assembled rather than
// designed.
//
// The label styling here IS tailwind.css's documented "Label" convention
// (font-medium, uppercase, tracking-wide, text-xs, text-slate/50), so
// adopting this component is also how a page stops restating that rule by
// hand. `hint` is the optional quiet third line some fields carry (night
// count under a date range, flight date/time under a flight number).
// ---------------------------------------------------------------------------

export default function DetailField({
  label,
  children,
  hint,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{label}</p>
      {/* Decision 156B: values outrank their labels -- both used to sit at
          the same small size, which is what made whole panels read flat. */}
      <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{children}</p>
      {hint ? <p className="text-xs text-slate/50">{hint}</p> : null}
    </div>
  );
}
