import type { ButtonHTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Full rebuild -- the previous Button.tsx
// rendered "btn"/"btn-{variant}" classes that don't exist anywhere in the
// CSS (confirmed: no .btn rule in any stylesheet), so it was effectively
// unstyled. It also had zero reachable consumers: Header.tsx's import is
// already an unused-import baseline error (TS6133), and its only real
// consumer, CounteragentToolbar.tsx, lives under components/counteragents/,
// which is itself never imported by App.tsx/router.tsx. Safe to redesign the
// API cleanly rather than preserve a shape nothing live depends on.
//
// Variants mirror the hand-rolled button conventions already dominant
// across real pages (confirmed by survey: coral solid = primary CTA in
// HotelSearch.tsx/Reservations.tsx/Invoices.tsx; ink solid = a stronger
// "confirm/done" action; bordered white = the universal cancel/secondary
// pattern; ghost = the plain text-link pattern used for Reset-style
// actions) -- formalizing what's already the de facto convention, not
// inventing a new one.
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "dark" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

// Each variant owns its own border state explicitly (border-0 vs. border
// border-ink/15) rather than a shared base class -- border-0 and border in
// the same className string target the same CSS property, and which one
// wins depends on generated-stylesheet order, not string order, so they
// must never both be handed to the same button.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border-0 bg-coral text-white shadow-sm shadow-coral/30 hover:-translate-y-0.5",
  dark: "border-0 bg-ink text-white hover:bg-ink/90",
  secondary: "border border-ink/15 bg-white text-ink hover:bg-sand",
  danger: "border-0 bg-danger text-white hover:bg-danger/90",
  ghost: "border-0 bg-transparent p-0 text-slate/60 hover:text-ink hover:underline",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-8 py-3.5 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
  ...rest
}: ButtonProps) {
  // Ghost never takes the size/shape treatment -- it's a text link, not a
  // button shape, same as the pre-existing "Reset" link pattern.
  const shape = variant === "ghost" ? "" : `rounded-lg font-medium transition-transform ${SIZE_CLASSES[size]}`;
  const transition = variant === "ghost" ? "transition-colors" : "";

  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "appearance-none",
        shape,
        transition,
        VARIANT_CLASSES[variant],
        disabled ? "cursor-not-allowed opacity-60 hover:translate-y-0" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
