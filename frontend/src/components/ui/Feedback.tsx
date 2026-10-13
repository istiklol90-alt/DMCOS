import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Modal from "./Modal";
import Button from "./Button";

// ---------------------------------------------------------------------------
// Admin design system: in-app replacements for window.confirm / prompt /
// alert, which the admin pages call 26 times between them.
//
// The browser's own dialogs cannot be styled, block the whole tab, carry the
// site's origin instead of a title, and -- for prompt() -- offer a one-line
// box with no validation, which is how a registration rejection reason was
// being collected.
//
// Promise-based on purpose, so a call site changes shape as little as
// possible:
//
//     if (!window.confirm("Approve?")) return;
//     if (!(await confirm({ title: "Approve?" }))) return;
//
// Mounted by AdminPanel.tsx only. Nothing on the agent side renders this
// provider, so useFeedback() is unavailable there by construction.
// ---------------------------------------------------------------------------

type Tone = "default" | "danger";

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface PromptOptions extends ConfirmOptions {
  inputLabel: string;
  placeholder?: string;
  // An empty answer is refused in the dialog rather than returned, so the
  // caller never has to re-validate what it asked to be required.
  required?: boolean;
}

type ToastTone = "success" | "error" | "info";

interface FeedbackApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // Resolves to the entered text, or null if the dialog was dismissed.
  promptText: (options: PromptOptions) => Promise<string | null>;
  toast: (message: string, tone?: ToastTone) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return api;
}

type DialogState =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_MS = 4500;

const TOAST_ACCENT: Record<ToastTone, string> = {
  success: "border-l-success",
  error: "border-l-danger",
  info: "border-l-info",
};

export function FeedbackProvider({
  children,
  // The dialog and toast layers render as siblings of `children`, so they
  // sit outside whatever themed root the children establish. The caller
  // names the theme class to put on those layers.
  layerClassName = "",
}: {
  children: ReactNode;
  layerClassName?: string;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [text, setText] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setDialog({ kind: "confirm", options, resolve })),
    [],
  );

  const promptText = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setText("");
        setDialog({ kind: "prompt", options, resolve });
      }),
    [],
  );

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  useEffect(() => {
    if (dialog?.kind === "prompt") inputRef.current?.focus();
  }, [dialog]);

  function dismiss() {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(false);
    else dialog.resolve(null);
    setDialog(null);
  }

  function accept() {
    if (!dialog) return;
    if (dialog.kind === "confirm") {
      dialog.resolve(true);
    } else {
      const value = text.trim();
      if (dialog.options.required !== false && !value) return;
      dialog.resolve(value);
    }
    setDialog(null);
  }

  const options = dialog?.options;
  const promptOptions = dialog?.kind === "prompt" ? dialog.options : null;
  const acceptBlocked = promptOptions !== null && promptOptions.required !== false && !text.trim();

  return (
    <FeedbackContext.Provider value={{ confirm, promptText, toast }}>
      {children}

      <div className={layerClassName}>
        <Modal open={dialog !== null} onClose={dismiss} closeOnEscape maxWidth="max-w-md" panelClassName="p-5">
          {options && (
            <>
              <h2 className="text-base font-semibold text-ink">{options.title}</h2>
              {options.message && <div className="mt-1.5 text-sm text-slate/75">{options.message}</div>}

              {promptOptions && (
                <label className="mt-4 block">
                  <span className="text-xs font-medium text-slate/75">{promptOptions.inputLabel}</span>
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={promptOptions.placeholder}
                    rows={3}
                    className="mt-1 block w-full resize-y appearance-none rounded-lg font-sans border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-ink/50 focus:outline-none focus:ring-2 focus:ring-ink/15"
                  />
                </label>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={dismiss}>
                  {options.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={options.tone === "danger" ? "danger" : "primary"}
                  onClick={accept}
                  disabled={acceptBlocked}
                  autoFocus={!promptOptions}
                >
                  {options.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </>
          )}
        </Modal>

        {toasts.length > 0 && (
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto rounded-lg border border-l-4 border-ink/10 bg-white px-3.5 py-2.5 text-sm text-ink shadow-xl ${TOAST_ACCENT[t.tone]}`}
              >
                {t.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
