import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// Shared by the search page and the agent home page. Texts live in the
// hotelSearch namespace (page.heroSlides.*), loaded globally.
// Search page hero: a slow cross-fading slideshow behind the title -- the
// place for destination photos now and paid hotel promotions later. Slides
// are plain data: adding or swapping one (a hotel's own photo + caption) is
// an entry in HERO_SLIDES, never a layout change. The photos are free
// Unsplash images of the destinations we sell (Unsplash License); they are
// captioned by destination only, never as a specific hotel. A dark overlay
// keeps the title readable on any photo.
// Each slide is a promotion card: a destination today, a paying hotel later.
// `sponsored` marks a paid placement (labelled "Реклама" -- advertising must
// say so); `href` adds a call-to-action button when it has somewhere to go.
type HeroSlide = {
  src: string;
  key: string; // page.heroSlides.<key>.title / .text (/ .cta with href)
  credit: string;
  sponsored?: boolean;
  href?: string;
};
const HERO_SLIDES: HeroSlide[] = [
  { src: "/hero/maldives.jpg", key: "maldives", credit: "Unsplash" },
  { src: "/hero/seychelles.jpg", key: "seychelles", credit: "Iain Stettler / Unsplash" },
  { src: "/hero/mauritius.jpg", key: "mauritius", credit: "Stephan van de Schootbrugge / Unsplash" },
];
const HERO_INTERVAL_MS = 7000;

export default function HeroSlider({
  children,
  padding = "pb-24 pt-16 sm:pb-32 sm:pt-20 lg:pb-36 lg:pt-24",
  cardFrom = "xl",
  cardPlacement = "top",
  bottom,
}: {
  children: ReactNode;
  // Vertical padding of the hero (each page sizes its own band).
  padding?: string;
  // From which width the promotion card appears: "2xl" on pages whose
  // title is too wide to leave room beside it at 1280px.
  cardFrom?: "xl" | "2xl";
  // "middle": vertically centred, for a tall hero whose content sits left.
  cardPlacement?: "top" | "middle";
  // Pinned to the bottom centre of the hero (e.g. a "scroll down" cue).
  bottom?: ReactNode;
}) {
  const { t } = useTranslation("hotelSearch");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const count = HERO_SLIDES.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  // One timer per slide (restarted on every change), so a manual pick gets
  // its full display time and the progress bar below stays in step.
  useEffect(() => {
    if (paused || reducedMotion || count < 2) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), HERO_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, reducedMotion, count]);
  const slide = HERO_SLIDES[index];
  const pad = (n: number) => String(n).padStart(2, "0");
  const arrow =
    "flex h-8 w-8 appearance-none items-center justify-center rounded-full border border-white/25 bg-white/10 p-0 text-lg leading-none text-sand transition-colors hover:bg-white/25";

  return (
    <div
      className={`relative overflow-hidden bg-ink px-4 text-center sm:px-8 ${padding}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {HERO_SLIDES.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt=""
          aria-hidden="true"
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1600ms] ease-out ${
            i === index ? "scale-100 opacity-100" : "scale-105 opacity-0"
          }`}
        />
      ))}
      {/* Readability: navy wash, darker behind the title and along the
          bottom where the promotion card and the search bar sit. */}
      <div className="absolute inset-0 bg-ink/45" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(27,35,64,0.6)_0%,rgba(27,35,64,0)_60%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink/70 to-transparent" />

      <div className="relative">{children}</div>
      {bottom && <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center">{bottom}</div>}

      {/* Promotion card: glass panel, large serif title, text, optional
          call to action and the slide controls. xl+ only -- below that there
          is no room beside the page title; the dots underneath remain. */}
      <div className={`absolute right-10 z-10 hidden w-[18rem] text-left ${cardPlacement === "middle" ? "top-1/2 -translate-y-1/2" : "top-10"} ${cardFrom === "xl" ? "xl:block 2xl:w-[24rem]" : "2xl:block min-[1800px]:w-[24rem]"}`}>
        <div className="rounded-2xl border border-white/15 bg-ink/20 p-5 shadow-xl shadow-black/10 backdrop-blur-[2px] [text-shadow:0_1px_8px_rgba(27,35,64,0.6)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
              {slide.sponsored ? t("page.heroTagSponsored") : t("page.heroTagDestination")}
            </span>
            <span className="font-mono text-xs text-sand/60">
              <span className="text-sand">{pad(index + 1)}</span> / {pad(count)}
            </span>
          </div>
          <h2 className={`mt-3 font-display text-2xl font-semibold leading-tight text-sand ${cardFrom === "xl" ? "2xl:text-3xl" : "min-[1800px]:text-3xl"}`}>
            {t(`page.heroSlides.${slide.key}.title`)}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-sand/85">{t(`page.heroSlides.${slide.key}.text`)}</p>
          {slide.href && (
            <a
              href={slide.href}
              className="mt-4 inline-flex items-center rounded-full bg-gold px-4 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-gold-deep"
            >
              {t(`page.heroSlides.${slide.key}.cta`)}
            </a>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`${t("page.heroSlideLabel")} ${i + 1}`}
                  aria-current={i === index}
                  className="relative h-1 flex-1 appearance-none overflow-hidden rounded-full border-0 bg-white/25 p-0"
                >
                  <span
                    key={i === index ? `on-${index}` : `off-${i}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-gold"
                    style={
                      i < index || (i === index && reducedMotion)
                        ? { width: "100%" }
                        : i === index
                          ? {
                              width: "0%",
                              animation: `hero-progress ${HERO_INTERVAL_MS}ms linear forwards`,
                              animationPlayState: paused ? "paused" : "running",
                            }
                          : { width: "0%" }
                    }
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => go(index - 1)} aria-label={t("page.heroPrev")} className={arrow}>
                ‹
              </button>
              <button type="button" onClick={() => go(index + 1)} aria-label={t("page.heroNext")} className={arrow}>
                ›
              </button>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-right text-[10px] text-white/40">
          {t("page.heroPhoto")}: {slide.credit}
        </p>
      </div>

      {/* Narrow screens: caption and dots only. */}
      <div className={`absolute bottom-16 left-0 right-0 flex items-center justify-center gap-3 ${cardFrom === "xl" ? "xl:hidden" : "2xl:hidden"}`}>
        <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-sand backdrop-blur-sm">
          {t(`page.heroSlides.${slide.key}.title`)}
        </span>
        <div className="flex gap-1.5">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => go(i)}
              aria-label={`${t("page.heroSlideLabel")} ${i + 1}`}
              className={`h-1.5 appearance-none rounded-full border-0 p-0 transition-all ${
                i === index ? "w-6 bg-gold" : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
