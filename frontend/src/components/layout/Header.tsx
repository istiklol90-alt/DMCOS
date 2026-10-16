import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useGoToSection } from "./siteSections";

// Public site header: a navy bar that floats a little below the top edge,
// detached from the page, with MENU on the left, our logo in the centre and
// registration, agent login and RU/EN on the right. Accents in the header
// are a soft "linen" white instead of gold. The logo drifts slowly, like a
// boat on a calm sea, and the drift picks up gently with the scroll. MENU
// opens a navy panel below the bar. Closes on a link, Esc, a click outside
// or a route change. A signed-in user sees only the logo and RU/EN.

const LINEN = "#f3eee4"; // = the site background (--color-sand)

const DEST_PAGES = [
  { key: "maldives", src: "/hero/maldives.jpg" },
  { key: "seychelles", src: "/hero/seychelles.jpg" },
  { key: "mauritius", src: "/hero/mauritius.jpg" },
] as const;

function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const goToSection = useGoToSection();
  const [open, setOpen] = useState(false);
  const signedIn = !!localStorage.getItem("token");
  const logoRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The whole bar rides the scroll like a slow swell: each scroll gives it
  // a small push, and a soft spring (one sway every ~4.5 s, gently damped)
  // rocks it back to rest -- at most 6 px and a fraction of a degree.
  // Visual only; off for reduced motion.
  useEffect(() => {
    const el = barRef.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const k = ((Math.PI * 2) / 4.5) ** 2;
    const c = 0.7;
    let pos = 0;
    let vel = 0;
    let frame = 0;
    let last = 0;
    let lastScroll = window.scrollY;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      vel += (-k * pos - c * vel) * dt;
      pos = Math.max(-6, Math.min(6, pos + vel * dt));
      el.style.transform = `translateY(${pos.toFixed(2)}px) rotate(${(pos * 0.05).toFixed(3)}deg)`;
      if (Math.abs(pos) < 0.02 && Math.abs(vel) < 0.02) {
        el.style.transform = "";
        frame = 0;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      const delta = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      vel += Math.max(-60, Math.min(60, delta)) * 0.05;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Calm-sea drift: a slow swell of at most ~1.5 px and half a degree.
  // Off for reduced motion.
  useEffect(() => {
    const el = logoRef.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last = performance.now();
    let lastScroll = window.scrollY;
    let phase = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      // Base swell: one slow cycle every ~9 s. Scrolling may quicken it by
      // at most a third, however hard the page is flung -- the sea doesn't
      // hurry.
      const scrolled = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      const base = (Math.PI * 2) / 9;
      const extra = Math.max(-base / 3, Math.min(base / 3, (scrolled / 400) * base));
      phase += (base + Math.abs(extra)) * dt;
      const y = Math.sin(phase) * 1.5;
      const r = Math.sin(phase * 0.7 + 1) * 0.5;
      el.style.transform = `translateY(${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  // Menu panel typography: serif column titles, small spaced capitals for
  // the links, large serif links in the last column.
  const link =
    "block appearance-none border-0 bg-transparent p-0 py-2 text-left text-sm uppercase tracking-[0.14em] text-ink/75 transition-colors hover:text-gold-deep";
  const heading = (label: string) => <p className="font-display text-2xl text-ink">{label}</p>;
  const bigLink =
    "block appearance-none border-0 bg-transparent p-0 py-3 text-left font-display text-2xl text-ink transition-colors hover:text-gold-deep";

  return (
    <header className="pointer-events-none sticky top-0 z-50 w-full px-3 pt-3 sm:px-6 sm:pt-4">
      <div ref={barRef} className="pointer-events-auto relative mx-auto max-w-[96rem] overflow-hidden rounded-2xl will-change-transform border border-white/10 bg-ink/95 shadow-xl shadow-black/25 backdrop-blur-md">
        <div className="grid h-[86px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:h-[115px] sm:px-8">
          {/* Left: MENU */}
          <div className="flex items-center">
            {!signedIn && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls="site-menu"
                aria-label={open ? t("site.nav.close") : t("site.nav.menu")}
                className="flex appearance-none items-center gap-3 border-0 bg-transparent p-0 text-sand/85 transition-colors hover:text-sand"
                style={open ? { color: LINEN } : undefined}
              >
                <span className="relative block h-4 w-7" aria-hidden="true">
                  <span className={`absolute left-0 top-0 h-px w-7 bg-current transition-transform duration-300 ${open ? "translate-y-2 rotate-45" : ""}`} />
                  <span className={`absolute left-0 top-2 h-px w-5 bg-current transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
                  <span className={`absolute left-0 top-4 h-px w-7 bg-current transition-transform duration-300 ${open ? "-translate-y-2 -rotate-45" : ""}`} />
                </span>
                <span className="hidden text-xs font-medium uppercase tracking-[0.25em] sm:inline">
                  {open ? t("site.nav.close") : t("site.nav.menu")}
                </span>
              </button>
            )}
          </div>

          {/* Centre: logo */}
          <button
            type="button"
            onClick={go(() => navigate("/"))}
            className="flex appearance-none items-center border-0 bg-transparent p-0 transition-opacity hover:opacity-85"
          >
            <span ref={logoRef} className="flex items-center gap-3 will-change-transform">
              <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-gold to-gold-deep shadow-md shadow-black/30 sm:h-[52px] sm:w-[52px]" />
              <span className="whitespace-nowrap font-display text-[1.8rem] font-semibold tracking-[0.08em] text-sand sm:text-[2.7rem]">
                DMC OS
              </span>
            </span>
          </button>

          {/* Right: registration, agent login, RU/EN */}
          <div className="flex items-center justify-end gap-3 sm:gap-6">
            {!signedIn && (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="hidden appearance-none border-0 bg-transparent p-0 text-xs font-medium uppercase tracking-[0.2em] text-sand/85 transition-colors hover:text-sand lg:inline"
                >
                  {t("site.auth.register")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="hidden appearance-none whitespace-nowrap border border-sand/50 bg-transparent px-6 py-3 text-xs font-medium uppercase tracking-[0.2em] text-sand transition-colors hover:bg-sand hover:text-ink md:inline-block"
                >
                  {t("site.auth.agentLogin")}
                </button>
              </>
            )}
            <div className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5">
              {(["ru", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-medium transition-colors ${
                    i18n.language === lang ? "bg-sand text-ink" : "bg-transparent text-sand/70 hover:text-sand"
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* thin linen rule that grows when the menu opens */}
        <span
          className={`absolute inset-x-0 bottom-0 h-0.5 origin-left bg-sand transition-transform duration-500 ${open ? "scale-x-100" : "scale-x-0"}`}
          aria-hidden="true"
        />
      </div>

      {!signedIn && (
        <>
          <div
            className={`fixed inset-0 -z-10 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
              open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="site-menu"
            className={`absolute inset-x-0 top-full mt-3 px-3 transition-all duration-300 ease-out sm:px-6 ${
              open ? "pointer-events-auto visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
            }`}
          >
            <div className="mx-auto max-h-[calc(100svh-150px)] max-w-[96rem] overflow-y-auto rounded-2xl border border-ink/10 bg-sand px-6 py-10 shadow-2xl shadow-black/30 sm:px-12 lg:py-16">
              <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.7fr] lg:gap-12">
                <div>
                  {heading(t("site.nav.company"))}
                  <div className="mt-8">
                    {(
                      [
                        ["about", "site.nav.about"],
                        ["services", "site.nav.services"],
                        ["why-us", "site.nav.why"],
                        ["how-it-works", "site.nav.howItWorks"],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} type="button" onClick={go(() => goToSection(id))} className={link}>
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  {heading(t("site.nav.destinations"))}
                  <div className="mt-8">
                    {DEST_PAGES.map((d) => (
                      <button key={d.key} type="button" onClick={go(() => navigate(`/destinations/${d.key}`))} className={link}>
                        {t(`site.destinations.${d.key}.title`)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={go(() => goToSection("destinations"))}
                      className={link.replace("text-ink/75", "text-gold-deep")}
                    >
                      {t("site.nav.allDestinations")} →
                    </button>
                  </div>
                </div>

                <div>
                  <button type="button" onClick={go(() => navigate("/register"))} className={bigLink}>
                    {t("site.auth.register")}
                  </button>
                  <button type="button" onClick={go(() => navigate("/login"))} className={bigLink}>
                    {t("site.auth.agentLogin")}
                  </button>
                  <button type="button" onClick={go(() => navigate("/login"))} className={bigLink}>
                    {t("site.auth.admin")}
                  </button>
                </div>

                {/* Our welcome offer instead of a decorative photo. */}
                <div className="relative hidden overflow-hidden rounded-xl lg:block">
                  <img src="/hero/mauritius.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
                  <div className="relative flex h-full min-h-72 flex-col justify-end p-7">
                    <span className="w-fit rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink">
                      {t("site.bonus.badgeNew")}
                    </span>
                    <p className="mt-3 font-display text-2xl font-semibold leading-snug text-sand">{t("site.bonus.title")}</p>
                    <button
                      type="button"
                      onClick={go(() => navigate("/register"))}
                      className="mt-4 w-fit appearance-none rounded-full border-0 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-sand"
                    >
                      {t("site.bonus.cta")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

export default Header;
