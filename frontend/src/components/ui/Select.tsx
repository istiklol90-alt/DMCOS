import type { SelectHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system. Same visual language as Input.tsx (border/focus/
// tone), kept as a separate component rather than folded into Input --
// a <select>'s children are <option>s, not a value/onChange text field,
// so sharing InputProps would be a false abstraction. Every one of the
// design-system rollout's remaining target files uses a raw <select>
// today (confirmed during scoping), so this closes a real, repeated gap,
// not a speculative one.
// ---------------------------------------------------------------------------

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  tone?: "white" | "sand";
  scale?: "sm" | "lg";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<SelectProps["tone"]>, string> = {
  white: "bg-white",
  sand: "bg-sand/40",
};

const SCALE_CLASSES: Record<NonNullable<SelectProps["scale"]>, string> = {
  sm: "px-3 py-2",
  lg: "px-4 py-3",
};

export default function Select({ tone = "white", scale = "sm", className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={[
        "appearance-none rounded-lg border border-ink/15 text-sm text-slate",
        "focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30",
        TONE_CLASSES[tone],
        SCALE_CLASSES[scale],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </select>
  );
}
