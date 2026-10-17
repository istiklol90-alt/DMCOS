import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import HeroSlider from "../components/ui/HeroSlider";
import WelcomeBonusModal from "../components/ui/WelcomeBonusModal";
import SiteFooter from "../components/layout/SiteFooter";
import { useGoToSection } from "../components/layout/siteSections";
import { IconCheck, IconChevronRight } from "../components/ui/icons";

// Public site home page. Texts: common.json -> site.* (RU/EN). Company
// texts describe only what the platform actually does; there are no
// invented figures, contacts or hotel names here -- the owner can extend
// them in the catalogs.

const WHY = ["contract", "offer", "manager", "docs", "rooms", "changes", "transfer", "markup"] as const;
const PROMISES = ["expertise", "care", "quality"] as const;
// Sections sit under the floating header.
const SCROLL = "scroll-mt-[98px] sm:scroll-mt-[131px]";

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
            onClick={() => goToSection("about")}
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

      {/* Who we are -- one centred statement, the way a luxury DMC opens */}
      <section id="about" className={`${SCROLL} bg-[#efe9df] px-5 py-24 sm:px-10`}>
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-deep">{t("site.about.tag")}</p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink sm:text-5xl">{t("site.about.title")}</h2>
          <span className="mx-auto mt-6 block h-px w-16 bg-gold" />
          <p className="mt-6 text-lg font-light leading-relaxed text-slate/80">{t("site.about.p1")}</p>
          <p className="mt-4 text-lg font-light leading-relaxed text-slate/80">{t("site.about.p2")}</p>
        </Reveal>
      </section>

      {/* Destinations -- navy band */}
      <section id="destinations" className={`${SCROLL} bg-ink px-5 py-24 sm:px-10`}>
        <Reveal>
          <SectionHeading tag={t("site.destinations.tag")} title={t("site.destinations.title")} light />
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.key} delay={i * 120} className="group relative overflow-hidden rounded-2xl">
              <img
                src={d.src}
                alt=""
                className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-display text-2xl font-semibold text-sand">{t(`site.destinations.${d.key}.title`)}</h3>
                <p className="mt-1 text-sm text-sand/80">{t(`site.destinations.${d.key}.text`)}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/destinations/${d.key}`)}
                  className="mt-4 inline-flex appearance-none items-center gap-1.5 border border-sand/50 bg-transparent px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sand transition-colors after:absolute after:inset-0 after:content-[''] hover:border-gold hover:bg-gold"
                >
                  {t("site.dest.more")} <IconChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Our promise to your clients -- three photo-led promises */}
      <section id="services" className={`${SCROLL} bg-[#efe9df] px-5 py-24 sm:px-10`}>
        <Reveal>
          <SectionHeading tag={t("site.promise.tag")} title={t("site.promise.title")} />
          <p className="mx-auto mt-5 max-w-2xl text-center text-lg font-light leading-relaxed text-slate/75">{t("site.promise.lead")}</p>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-6xl gap-8 md:grid-cols-3">
          {PROMISES.map((k, i) => (
            <Reveal key={k} delay={i * 120} className="text-center">
              <div className="overflow-hidden">
                <img src={`/site/promise-${k}.jpg`} alt="" className="aspect-[4/3] w-full object-cover transition-transform duration-700 hover:scale-105" />
              </div>
              <h3 className="mt-6 font-display text-2xl text-ink">{t(`site.promise.${k}.title`)}</h3>
              <p className="mx-auto mt-3 max-w-xs font-light leading-relaxed text-slate/75">{t(`site.promise.${k}.text`)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why agencies work with us -- eight photo cards */}
      <section id="why-us" className={`${SCROLL} bg-[#e6dfd3] px-5 py-24 sm:px-10`}>
        <Reveal>
          <SectionHeading tag={t("site.why.tag")} title={t("site.why.title")} />
          <p className="mx-auto mt-5 max-w-2xl text-center text-lg font-light leading-relaxed text-slate/75">{t("site.why.lead")}</p>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-[88rem] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((k, i) => (
            <Reveal key={k} delay={(i % 4) * 100} className="flex flex-col bg-white shadow-sm">
              <div className="overflow-hidden">
                <img src={`/site/why-${k}.jpg`} alt="" className="aspect-[16/10] w-full object-cover transition-transform duration-700 hover:scale-105" />
              </div>
              <div className="flex flex-1 flex-col items-center px-7 pb-10 pt-8 text-center">
                <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-gold-deep">{t(`site.why.${k}.title`)}</h3>
                <p className="mt-4 font-light leading-relaxed text-slate/75">{t(`site.why.${k}.text`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12 text-center">
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="appearance-none border border-ink/40 bg-transparent px-8 py-3.5 text-xs font-medium uppercase tracking-[0.25em] text-ink transition-colors hover:bg-ink hover:text-sand"
          >
            {t("site.how.cta")}
          </button>
        </Reveal>
      </section>

      {/* Our principle -- a single quiet statement */}
      <section className="bg-ink px-5 py-24 sm:px-10">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">{t("site.principle.tag")}</p>
          <p className="mt-6 font-display text-2xl font-light italic leading-relaxed text-sand sm:text-4xl">
            “{t("site.principle.quote")}”
          </p>
          <span className="mx-auto mt-8 block h-px w-16 bg-gold" />
        </Reveal>
      </section>

      {/* The agent cabinet -- our platform, image + text */}
      <section className="bg-[#efe9df] px-5 py-24 sm:px-10">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <Reveal className="relative overflow-hidden">
            <img src="/hero/mauritius.jpg" alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute bottom-0 left-0 h-1.5 w-1/3 bg-gold" />
          </Reveal>
          <Reveal delay={150}>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-deep">{t("site.platform.tag")}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">{t("site.platform.title")}</h2>
            <p className="mt-3 text-lg font-light text-slate/70">{t("site.platform.sub")}</p>
            <p className="mt-5 font-light leading-relaxed text-slate/80">{t("site.platform.text")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="appearance-none border-0 bg-ink px-7 py-3.5 text-xs font-medium uppercase tracking-[0.25em] text-sand transition-colors hover:bg-gold"
              >
                {t("site.auth.register")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="appearance-none border border-ink/40 bg-transparent px-7 py-3.5 text-xs font-medium uppercase tracking-[0.25em] text-ink transition-colors hover:bg-ink hover:text-sand"
              >
                {t("site.auth.agentLogin")}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How to start */}
      <section id="how-it-works" className={`${SCROLL} px-5 py-24 sm:px-10`}>
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
