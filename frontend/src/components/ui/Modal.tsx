import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system. Pure extraction of the identical overlay+panel
// markup that was hand-rolled byte-for-byte three times independently
// (Cashback.tsx, Counteragents.tsx, financeShared.tsx's InvoiceDetailModal)
// -- confirmed via direct comparison before extracting, not assumed.
// Deliberately no new behavior: no focus trap, no Escape-key handling,
// since none of the three original instances had that either. Click on
// the dark overlay closes (matches all three originals); click inside the
// panel is stopped from bubbling to the overlay's onClick, same as before.
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, children, maxWidth = "max-w-md" }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
