import { useEffect } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// DMC OS design system. Pure extraction of the identical overlay+panel
// markup that was hand-rolled byte-for-byte three times independently
// (Cashback.tsx, Counteragents.tsx, financeShared.tsx's InvoiceDetailModal)
// -- confirmed via direct comparison before extracting, not assumed.
// Click on the dark overlay closes (matches all three originals); click
// inside the panel is stopped from bubbling to the overlay's onClick, same
// as before.
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  // "top" scrolls a tall panel with the page instead of centering it and
  // letting it overflow the viewport -- what Reservations.tsx's booking
  // detail (a full working surface, not a dialog) has always done by hand.
  align?: "center" | "top";
  // A form the user has already typed into must not be destroyed by a
  // stray click on the backdrop. HotelSearch.tsx's checkout wizard never
  // closed that way; anything wrapped here keeps its original behavior
  // rather than silently inheriting click-to-dismiss.
  closeOnBackdrop?: boolean;
  // Escape closes the dialog. Opt-in, default off, for the same reason as
  // closeOnBackdrop above: every existing caller -- the checkout wizard in
  // particular -- was built with no Escape handling, and gaining one
  // silently would let a single keypress discard a half-filled form.
  closeOnEscape?: boolean;
  // Replaces (not extends) the panel's own padding/extras, so a caller can
  // set p-8 or a max-height without two competing padding utilities landing
  // in one class list.
  panelClassName?: string;
}

export default function Modal({
  open,
  onClose,
  children,
  maxWidth = "max-w-md",
  align = "center",
  closeOnBackdrop = true,
  closeOnEscape = false,
  panelClassName = "p-5",
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;
  const overlay =
    align === "top"
      ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 sm:px-6"
      : "fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4";
  return (
    <div className={overlay} onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${maxWidth} rounded-2xl bg-white shadow-xl ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
