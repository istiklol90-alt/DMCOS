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

// Design System v1.0: "cancelled" is new -- a dedicated tone for
// Cancelled statuses, deliberately not reusing "danger" (Rejected's own
// tone). See tailwind.css's --color-cancelled comment for the full
// reasoning: Cancelled/Rejected are different facts a manager needs to
// tell apart at a glance, so they can never share one tone.
// "info" (admin design system): work that is in someone else's hands --
// waiting on a hotel -- which is neither a warning nor a success.
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "cancelled" | "coral" | "ink" | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  // A leading dot in the tone's own color, so a status is carried by a
  // shape as well as a hue. Off by default: no existing badge changes.
  dot?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate/10 text-slate",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  cancelled: "bg-cancelled/15 text-cancelled",
  coral: "bg-coral/15 text-coral",
  ink: "bg-ink/10 text-ink",
  info: "bg-info/10 text-info",
};

export default function Badge({ children, tone = "neutral", dot = false, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        // Slightly shorter inside the admin panel, where badges sit in
        // 36-44px table rows rather than on roomy cards.
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium admin:whitespace-nowrap admin:py-0.5",
        dot ? "gap-1.5" : "",
        TONE_CLASSES[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
