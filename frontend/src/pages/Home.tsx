import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import HeroSlider from "../components/ui/HeroSlider";
import WelcomeBonusModal from "../components/ui/WelcomeBonusModal";
import SiteFooter from "../components/layout/SiteFooter";
import { SITE_SECTIONS, useGoToSection } from "../components/layout/siteSections";
import { IconCalendar, IconCheck, IconChevronRight, IconPin, IconSearch, IconSparkle } from "../components/ui/icons";

// Public site home page. Texts: common.json -> site.* (RU/EN). Company
// texts describe only what the platform actually does; there are no
// invented figures, contacts or hotel names here -- the owner can extend
// them in the catalogs.

const WHY = ["contract", "copy", "manager", "docs", "rooms", "changes"] as const;

const DESTINATIONS = [
  { key: "maldives", src: "/hero/maldives.jpg" },
  { key: "seychelles", src: "/hero/seychelles.jpg" },
  { key: "mauritius", src: "/hero/mauritius.jpg" },
] as const;

// Fades and lifts a block in the first time it scrolls into view, so the
// page opens screen by screen instead of all at once. Without
// IntersectionObserver, or with reduced motion, it is simply visible.
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(
    () =>
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({ tag, title, light = false }: { tag: string; title: string; light?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-gold">{tag}</p>
      <h2 className={`mt-2 font-display text-3xl font-semibold sm:text-4xl ${light ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
    </div>
  );
}

function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const goToSection = useGoToSection();

  // Routing fix (2026-07-29): App.tsx used to do this same check in its
  // own mount effect (reading a stale `role` from localStorage and
  // auto-selecting a page state) -- relocated here, the only place it's
  // actually needed now that App is a thin layout with no page state of
  // its own. Someone with a valid session landing on "/" (a bookmark, a
  // browser reopening to its last tab) still lands on their real
  // dashboard instead of the marketing home page.
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if (!token || !role) return;
    if (role === "admin") navigate("/admin-panel", { replace: true });
    else if (role === "manager") navigate("/manager-dashboard", { replace: true });
    else if (role === "agent") navigate("/agent-dashboard", { replace: true });
  }, [navigate]);

  // Arriving from the menu on another page ("/#destinations").
  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const services = [
    { key: "hotels", icon: <IconPin className="h-5 w-5" /> },
    { key: "bookings", icon: <IconCalendar className="h-5 w-5" /> },
    { key: "prices", icon: <IconSearch className="h-5 w-5" /> },
    { key: "ai", icon: <IconSparkle className="h-5 w-5" /> },
  ];
  const steps = ["s1", "s2", "s3", "s4"];

  return (
    <div className="bg-sand font-sans text-slate">
      <WelcomeBonusModal />
      {/* One full-width photo behind the first screen (shared HeroSlider:
          destination photos now, paid hotel promotions later). Our own
          block sits on the left in a navy glass panel; the promotion card
          sits on the right, so the two never read as one. */}
      <div className="-mt-[98px] sm:-mt-[131px]">
      <HeroSlider
        padding="flex min-h-[100svh] flex-col justify-center pb-32 pt-[calc(98px+2rem)] sm:pt-[calc(131px+3rem)]"
        cardFrom="xl"
        cardPlacement="middle"
        bottom={
          <button
            type="button"
            onClick={() => goToSection(SITE_SECTIONS[0])}
            aria-label={t("site.hero.scroll")}
            className="flex appearance-none flex-col items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium text-sand/85 [text-shadow:0_1px_6px_rgba(27,35,64,0.7)] hover:text-sand"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/10"
              style={{ animation: "scroll-cue 1.8s ease-in-out infinite" }}
            >
              <IconChevronRight className="h-4 w-4 rotate-90" />
            </span>
          </button>
        }
      >
        <div className="mx-auto max-w-[96rem] xl:pr-[22rem] 2xl:pr-[28rem]">
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/15 bg-ink/20 px-6 py-9 shadow-xl shadow-black/10 backdrop-blur-[2px] sm:px-10 [text-shadow:0_1px_8px_rgba(27,35,64,0.6)] xl:ml-6 xl:text-left">
            <p className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-widest text-gold xl:justify-start">
              <span className="h-px w-8 bg-gold/70" />
              {t("site.hero.tag")}
            </p>
            <h1 className="mt-3 font-display text-5xl font-semibold text-sand sm:text-7xl">DMC OS</h1>
            <p className="mt-4 text-base leading-relaxed text-sand/90 sm:text-lg">{t("site.hero.subtitle")}</p>
            <ul className="mt-6 flex list-none flex-col gap-2 p-0 text-left text-sm text-sand/90 sm:items-start">
              {["point1", "point2", "point3"].map((k) => (
                <li key={k} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-white">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  {t(`site.hero.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </HeroSlider>
      </div>

      {/* About */}
      <section id={SITE_SECTIONS[0]} className="scroll-mt-[98px] sm:scroll-mt-[131px] px-5 py-20 sm:px-10">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t("site.about.tag")}</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{t("site.about.title")}</h2>
            <p className="mt-5 text-base leading-relaxed text-slate/80">{t("site.about.p1")}</p>
            <p className="mt-4 text-base leading-relaxed text-slate/80">{t("site.about.p2")}</p>
          </Reveal>
          <Reveal delay={150} className="relative overflow-hidden rounded-3xl shadow-xl">
            <img src="/hero/seychelles.jpg" alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gold" />
          </Reveal>
        </div>
      </section>

      {/* What we do -- white band, navy + gold cards */}
      <section id={SITE_SECTIONS[1]} className="scroll-mt-[98px] sm:scroll-mt-[131px] bg-white px-5 py-20 sm:px-10">
        <Reveal>
          <SectionHeading tag={t("site.services.tag")} title={t("site.services.title")} />
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <Reveal key={s.key} delay={i * 100}>
            <div
              className="group h-full rounded-2xl border border-ink/10 bg-sand/60 p-6 transition-all hover:-translate-y-1 hover:border-gold/40 hover:shadow-lg"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-gold">{s.icon}</span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">{t(`site.services.${s.key}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate/70">{t(`site.services.${s.key}.text`)}</p>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why us -- only what the platform really does */}
      <section id={SITE_SECTIONS[2]} className="scroll-mt-[98px] sm:scroll-mt-[131px] px-5 py-20 sm:px-10">
        <Reveal>
          <SectionHeading tag={t("site.why.tag")} title={t("site.why.title")} />
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-6xl gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((k, i) => (
            <Reveal key={k} delay={(i % 3) * 100} className="flex gap-4">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-base font-semibold text-gold-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">{t(`site.why.${k}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate/70">{t(`site.why.${k}.text`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Destinations -- navy band */}
      <section id={SITE_SECTIONS[3]} className="scroll-mt-[98px] sm:scroll-mt-[131px] bg-ink px-5 py-20 sm:px-10">
        <Reveal>
          <SectionHeading tag={t("site.destinations.tag")} title={t("site.destinations.title")} light />
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.key} delay={i * 120} className="group relative overflow-hidden rounded-2xl">
              <img
                src={d.src}
                alt=""
                className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-display text-2xl font-semibold text-white">{t(`site.destinations.${d.key}.title`)}</h3>
                <p className="mt-1 text-sm text-white/80">{t(`site.destinations.${d.key}.text`)}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/destinations/${d.key}`)}
                  className="mt-4 inline-flex appearance-none items-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors after:absolute after:inset-0 after:content-[''] hover:bg-gold hover:border-gold"
                >
                  {t("site.dest.more")} <IconChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How to start */}
      <section id={SITE_SECTIONS[4]} className="scroll-mt-[98px] sm:scroll-mt-[131px] px-5 py-20 sm:px-10">
        <Reveal>
          <SectionHeading tag={t("site.how.tag")} title={t("site.how.title")} />
        </Reveal>
        <ol className="mx-auto mt-12 grid list-none p-0 max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s}>
              <Reveal delay={i * 100} className="h-full rounded-2xl border border-ink/10 bg-white p-6 shadow-card">
              <span className="font-display text-4xl font-semibold text-gold">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{t(`site.how.${s}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate/70">{t(`site.how.${s}.text`)}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal className="mt-10 text-center">
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="appearance-none rounded-full border-0 bg-gold px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gold/30 transition-transform hover:-translate-y-0.5 hover:bg-gold-deep"
          >
            {t("site.how.cta")}
          </button>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

export default Home;
