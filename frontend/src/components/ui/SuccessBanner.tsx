import type { ReactNode } from "react";
import { IconCheck } from "./icons";

// A clearly visible confirmation after an admin adds or changes something
// ("Flight SZ105 has been added"), in the project palette. Owner, 2026-10-17:
// a small grey line under a button is too easy to miss.
export default function SuccessBanner({ title, children, onClose }: { title: string; children?: ReactNode; onClose?: () => void }) {
  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <IconCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-success">{title}</p>
        {children && <div className="mt-0.5 text-sm text-ink/80">{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="appearance-none border-0 bg-transparent p-0 text-lg leading-none text-ink/40 hover:text-ink">
          ×
        </button>
      )}
    </div>
  );
}
