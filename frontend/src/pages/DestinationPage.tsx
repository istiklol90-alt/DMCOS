import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import SiteFooter from "../components/layout/SiteFooter";
import { useGoToSection } from "../components/layout/siteSections";
import { IconCheck, IconChevronLeft } from "../components/ui/icons";

// Public page for one destination (/destinations/:slug). Texts are general
// facts about the place (common.json -> site.dest.<slug>); nothing here
// names hotels, prices or offers.
const PAGES = {
  maldives: "/hero/maldives.jpg",
  seychelles: "/hero/seychelles.jpg",
  mauritius: "/hero/mauritius.jpg",
} as const;
type Slug = keyof typeof PAGES;

export default function DestinationPage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goToSection = useGoToSection();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!slug || !(slug in PAGES)) return <Navigate to="/" replace />;
  const key = slug as Slug;
  const others = (Object.keys(PAGES) as Slug[]).filter((s) => s !== key);

  return (
    <div className="bg-sand font-sans text-slate">
      <div className="relative -mt-[98px] overflow-hidden bg-ink sm:-mt-[131px]">
        <img src={PAGES[key]} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
        <div className="relative mx-auto flex min-h-[70svh] max-w-6xl flex-col justify-end px-5 pb-14 pt-[calc(98px+1.5rem)] sm:px-10 sm:pt-[calc(131px+2rem)]">
          <button
            type="button"
            onClick={() => goToSection("destinations")}
            className="mb-auto inline-flex w-fit appearance-none items-center gap-1 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <IconChevronLeft className="h-3.5 w-3.5" /> {t("site.dest.back")}
          </button>
          <p className="mt-10 text-xs font-semibold uppercase tracking-widest text-gold">{t("site.destinations.tag")}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white [text-shadow:0_2px_12px_rgba(27,35,64,0.6)] sm:text-6xl">
            {t(`site.destinations.${key}.title`)}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90 [text-shadow:0_1px_8px_rgba(27,35,64,0.6)] sm:text-lg">
            {t(`site.dest.${key}.lead`)}
          </p>
        </div>
      </div>

      <section className="px-5 py-16 sm:px-10">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink/10 bg-white p-7 shadow-card">
            <h2 className="font-display text-2xl font-semibold text-ink">{t("site.dest.facts")}</h2>
            <ul className="mt-5 list-none space-y-4 p-0">
              {["f1", "f2", "f3"].map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-relaxed text-slate/80">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  {t(`site.dest.${key}.${f}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-ink p-7 text-white shadow-card">
            <h2 className="font-display text-2xl font-semibold">{t("site.dest.forAgents")}</h2>
            <ul className="mt-5 list-none space-y-4 p-0">
              {["agents1", "agents2"].map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-relaxed text-white/80">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-white">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  {t(`site.dest.${f}`)}
                </li>
              ))}
            </ul>
            <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="font-display text-lg font-semibold">{t("site.dest.ctaTitle")}</p>
              <p className="mt-1 text-sm text-white/70">{t("site.dest.ctaText")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="appearance-none rounded-full border-0 bg-gold px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-deep"
                >
                  {t("site.auth.register")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="appearance-none rounded-full border border-white/30 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  {t("site.auth.agentLogin")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t("site.destinations.tag")}</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {others.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => navigate(`/destinations/${s}`)}
                className="group relative h-48 appearance-none overflow-hidden rounded-2xl border-0 p-0 text-left"
              >
                <img src={PAGES[s]} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="font-display text-2xl font-semibold text-white">{t(`site.destinations.${s}.title`)}</p>
                  <p className="mt-1 text-sm text-white/80">{t(`site.destinations.${s}.text`)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
