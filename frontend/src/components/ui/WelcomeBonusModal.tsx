import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

// Welcome offer shown once per browser session when a visitor opens the
// public home page: photo on top, offer panel below, register button.
// The bonus itself is an owner's promise, not something the system credits
// -- nothing here records or pays it.
const SEEN_KEY = "dmc.welcomeBonus.seen";
const SHOW_DELAY_MS = 900;

export default function WelcomeBonusModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage blocked: still show it once for this page view */
    }
    if (seen) return;
    const id = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-bonus-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40"
        style={{ animation: "bonus-pop 0.35s ease-out" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("site.bonus.close")}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 appearance-none items-center justify-center rounded-full border-0 bg-white/90 p-0 text-xl leading-none text-ink shadow transition-colors hover:bg-white"
        >
          ×
        </button>

        <div className="relative h-44 sm:h-52">
          <img src="/hero/maldives.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
          <div className="absolute bottom-4 left-5 flex items-end gap-1 text-white">
            <span className="font-display text-6xl font-semibold leading-none [text-shadow:0_2px_12px_rgba(0,0,0,0.4)]">
              100
            </span>
            <span className="mb-1.5 text-lg font-semibold text-gold">USD</span>
          </div>
        </div>

        <div className="bg-ink px-6 pb-6 pt-5">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              {t("site.bonus.badgeNew")}
            </span>
            <span className="rounded-full border border-white/25 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/85">
              {t("site.bonus.badgeFirst")}
            </span>
          </div>
          <h2 id="welcome-bonus-title" className="mt-3 font-display text-2xl font-semibold leading-snug text-white">
            {t("site.bonus.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{t("site.bonus.text")}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                close();
                navigate("/register");
              }}
              className="flex-1 appearance-none rounded-full border-0 bg-gold px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-colors hover:bg-gold-deep"
            >
              {t("site.bonus.cta")}
            </button>
            <button
              type="button"
              onClick={close}
              className="appearance-none rounded-full border border-white/25 bg-transparent px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
            >
              {t("site.bonus.later")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
