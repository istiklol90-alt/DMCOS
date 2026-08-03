import type { InputHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 0. Consolidates the near-duplicated input
// className strings found in Login.tsx, HotelSearch.tsx, and Reservations.tsx
// -- the latter two were byte-identical to each other but independently
// hand-written; Login's diverged in background tint (bg-sand/40 vs.
// bg-white) and padding (px-4 py-3 vs. px-3 py-2), with no real reason for
// either difference. `tone` and `scale` expose those two genuine variation
// points instead of leaving every page to reinvent them. Padding is a
// dedicated `scale` prop rather than a className override, same reasoning as
// Button's size prop: two padding utilities targeting the same property in
// one className string fight over generated-stylesheet order, not string
// order, so the base component must own its own padding outright. Named
// `scale`, not `size` -- `size` is already a native <input> HTML attribute
// (visible character width, a number), and colliding with it broke the
// type extension (`Omit<InputHTMLAttributes<...>, "className">` still
// inherits the native `size?: number`).
// ---------------------------------------------------------------------------

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  tone?: "white" | "sand";
  scale?: "sm" | "lg";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<InputProps["tone"]>, string> = {
  white: "bg-white",
  sand: "bg-sand/40",
};

const SCALE_CLASSES: Record<NonNullable<InputProps["scale"]>, string> = {
  sm: "px-3 py-2",
  lg: "px-4 py-3",
};

export default function Input({ tone = "white", scale = "sm", className = "", ...rest }: InputProps) {
  return (
    <input
      className={[
        "appearance-none rounded-lg border border-ink/15 text-sm text-slate",
        "placeholder:text-slate/40 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30",
        TONE_CLASSES[tone],
        SCALE_CLASSES[scale],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
