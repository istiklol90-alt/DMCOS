import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type PromoSlide = {
  id: string;
  hotel: string;
  location: string;
  gradient: string;
  headline: string;
};

const promoSlides: PromoSlide[] = [
  {
    id: "soneva-fushi",
    hotel: "Soneva Fushi",
    location: "Baa Atoll, Мальдивы",
    gradient: "from-ink to-gold",
    headline: "Скидка 20% на виллы этим летом",
  },
  {
    id: "rixos-belek",
    hotel: "Rixos Premium Belek",
    location: "Анталия, Турция",
    gradient: "from-gold to-ink",
    headline: "Всё включено + перелёт в подарок",
  },
  {
    id: "velaa-private-island",
    hotel: "Velaa Private Island",
    location: "Noonu Atoll, Мальдивы",
    gradient: "from-ink to-gold/70",
    headline: "Раннее бронирование: −15% до конца месяца",
  },
];

function PromoCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((i) => (i + 1) % promoSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const slide = promoSlides[active];

  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-col sm:flex-row">
        <div className={`h-40 w-full shrink-0 bg-gradient-to-br sm:h-auto sm:w-64 ${slide.gradient}`} />
        <div className="flex flex-1 flex-col justify-center gap-2 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-deep">{slide.location}</p>
          <h3 className="font-display text-2xl font-semibold text-ink">{slide.hotel}</h3>
          <p className="text-sm text-slate/70">{slide.headline}</p>
          <button
            type="button"
            className="mt-2 w-fit appearance-none rounded-lg border-0 bg-ink px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Подробнее
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-4">
        {promoSlides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Слайд ${i + 1}: ${s.hotel}`}
            className={`h-2 appearance-none rounded-full border-0 transition-all ${
              i === active ? "w-5 bg-gold" : "w-2 bg-ink/15 hover:bg-ink/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();

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

  return (
    <div className="mx-auto max-w-6xl bg-sand px-5 py-10 font-sans text-slate">
      <div className="rounded-2xl bg-ink px-5 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">
          B2B платформа для туристических агентств
        </p>
        <h1 className="mt-3 font-display text-5xl font-semibold text-white">DMC OS</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70">
          Отели, контракты, бронирования, цены и AI автоматизация в одной платформе
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button
            onClick={() => navigate("/register")}
            className="appearance-none rounded-xl border-0 bg-gold px-8 py-3.5 text-sm font-semibold text-white shadow-sm shadow-gold/30 transition-transform hover:-translate-y-0.5"
          >
            Регистрация
          </button>
          <button
            onClick={() => navigate("/login")}
            className="appearance-none rounded-xl border border-white/30 bg-transparent px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Вход для агентов
          </button>
          <button
            onClick={() => navigate("/login")}
            className="appearance-none rounded-xl border border-white/25 bg-transparent px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Админ
          </button>
        </div>
      </div>

      <PromoCarousel />

      <section className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center">
          <h3 className="font-display text-xl font-semibold text-ink">Отели</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate/70">
            Контракты, цены, наличие и спецпредложения
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center">
          <h3 className="font-display text-xl font-semibold text-ink">Бронирования</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate/70">
            Быстрое создание, подтверждение и управление
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center">
          <h3 className="font-display text-xl font-semibold text-ink">Цены</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate/70">
            Актуальные цены и скидки от партнеров
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center">
          <h3 className="font-display text-xl font-semibold text-ink">AI Ассистент</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate/70">
            Умные рекомендации и автоматизация
          </p>
        </div>
      </section>
    </div>
  );
}

export default Home;
