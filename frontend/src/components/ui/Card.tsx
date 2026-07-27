import type { HTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Formalizes the single most-repeated visual
// pattern in the whole frontend: the literal string
// "rounded-2xl border border-ink/10 bg-white" appears hand-copy-pasted 48
// times across 16 page files (confirmed by grep during scoping) -- every
// card, panel, table wrapper, and modal in the app independently rewrites
// the exact same three classes. One component now owns that shape.
//
// `shadow="card"` opts into the new --shadow-card token (a soft,
// barely-there elevation, Stripe-dashboard style) for panels that want to
// visually lift off the page background; most inline cards sitting directly
// on a page don't need it (the border alone is enough), so it defaults to
// off rather than applying a shadow everywhere unconditionally.
// ---------------------------------------------------------------------------

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  shadow?: "none" | "card" | "xl";
  className?: string;
}

const PADDING_CLASSES: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const SHADOW_CLASSES: Record<NonNullable<CardProps["shadow"]>, string> = {
  none: "",
  card: "shadow-card",
  xl: "shadow-xl",
};

export default function Card({
  children,
  padding = "md",
  shadow = "none",
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-ink/10 bg-white",
        PADDING_CLASSES[padding],
        SHADOW_CLASSES[shadow],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
