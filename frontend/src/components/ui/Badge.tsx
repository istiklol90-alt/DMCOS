import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Generalizes the ad-hoc status-pill pattern
// already duplicated per-page (Reservations.tsx's StatusBadge,
// financeShared.tsx's own StatusBadge, Contracts.tsx's ContractStatusBadge,
// ContractsAI.tsx's own status pill, AdminBookingFinance.tsx's
// NeedsAttentionBadge -- five independent implementations of the same
// "colored pill with text" shape). Each of those keeps its own domain-
// specific status->label mapping (that's real business logic, out of scope
// for a presentation-only pass) -- this is just the shared visual shell
// they can all render through, using the new semantic danger/warning/
// success tokens instead of each page's own raw red-500/amber-500 picks.
// ---------------------------------------------------------------------------

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "coral" | "ink";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate/10 text-slate",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  coral: "bg-coral/15 text-coral",
  ink: "bg-ink/10 text-ink",
};

export default function Badge({ children, tone = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
