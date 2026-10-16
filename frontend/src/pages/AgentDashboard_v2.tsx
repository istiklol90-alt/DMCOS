import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import BookingsList, { StatusBadge } from "./Reservations";
import AgentTopNav from "../components/layout/AgentTopNav";
import AgentAccount from "./AgentAccount";
import HeroSlider from "../components/ui/HeroSlider";
import type { SessionUser } from "../components/layout/AgentTopNav";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import { IconCalendar, IconChevronRight, IconClock, IconPin, IconSearch, IconCheck } from "../components/ui/icons";

// ---------------------------------------------------------------------------
// Agent home + "My bookings" (owner, 2026-10-14).
//
// Three screens on the one /agent-dashboard route, told apart by ?view=:
//   /agent-dashboard                 home
//   /agent-dashboard?view=bookings   the agent's full bookings list
//   /agent-dashboard?view=account    the agent's own account: details + client markup (Decision 215)
// A query parameter rather than a new route, so router.tsx (shared with the
// admin panel) does not change.
//
// The bookings list used to be rendered at the foot of the home page, always
// loading every booking under the hero and featured hotels. Owner: it belongs
// only in "My bookings". The home page now shows a short, real summary
// instead -- counts and the next arrivals, each from the server, never a
// made-up figure (the original redesign's rule, kept).
//
// Removed from home: the four "trust" badges ("Best rate guarantee",
// "Transfer included", "Secure payments", "24/7 support"). They were
// decorative claims with nothing behind them, and two were untrue for this
// system (transfers are not always included; there are no online payments).
// ---------------------------------------------------------------------------

interface HotelSummary {
  id: number;
  hotel_name: string;
  country: string;
  city: string;
  island?: string | null;
  star_rating: number | null;
}

interface BookingSummary {
  id: number;
  booking_number: string;
  hotel_id: number;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  infants: number;
  status: string;
}

const CLOSED_STATUSES = ["Cancelled", "Rejected", "Cancellation Requested"];
const UPCOMING_DAYS = 30;

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  // A 30-minute token simply expires while a tab sits open; every request
  // then fails with 401 "Invalid token". Handled once, centrally, instead of
  // each panel rendering that raw string or hanging on a spinner forever.
  if (response.status === 401) {
    handleSessionExpired();
    throw new Error("Session expired");
  }
  if (!response.ok) throw new Error(`Request error (${response.status})`);
  return response.json() as Promise<T>;
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Local calendar date -- never toISOString(), which is the UTC date and is
// "yesterday" for the first hours of every day east of Greenwich.
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Le Morne, Mauritius", never "Mauritius, Le Morne, Mauritius" -- the
// island is often the country itself.
function placeOf(h: HotelSummary): string {
  const parts = [h.island, h.city, h.country].filter((p): p is string => !!p);
  return parts.filter((p, i) => parts.lastIndexOf(p) === i).join(", ");
}

function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

const BOOKINGS_PERMISSIONS = {
  canChangeDates: true,
  canEditGuestDetails: true,
  canEditFlights: true,
  canCancel: true,
  canClaim: false,
  canConfirmWithHotel: false,
};

function AgentDashboard_v2() {
  const { t, i18n } = useTranslation("agentDashboard");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const view = rawView === "bookings" ? "bookings" : rawView === "account" ? "account" : "home";
  const [user, setUser] = useState<SessionUser | null>(null);

  // Routing fix (2026-07-29): the token/role guard is RequireAuth's job,
  // applied once in router.tsx -- only the user-data read stays here.
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  if (!user) {
    return <div className="min-h-screen bg-sand" />;
  }

  const openBookings = () => navigate("/agent-dashboard?view=bookings");

  return (
    <div className="min-h-screen bg-sand font-sans text-slate">
      <AgentTopNav user={user} active={view === "bookings" ? "bookings" : "home"} />
      {view === "bookings" ? (
        <main className="mx-auto max-w-[96rem] px-4 pb-12 pt-8 sm:px-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => navigate("/agent-dashboard")}
                className="appearance-none border-0 bg-transparent p-0 text-xs font-medium text-gold-deep hover:text-ink"
              >
                ← {t("bookingsPage.back")}
              </button>
              <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{t("bookingsPage.title")}</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate("/hotel-search")}
              className="inline-flex appearance-none items-center gap-2 rounded-full border-0 bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5"
            >
              <IconSearch className="h-4 w-4 text-gold" />
              {t("hero.searchButton")}
            </button>
          </div>
          {/* Scoped to this agent only. */}
          <BookingsList scope={{ type: "agent", agentId: user.id }} permissions={BOOKINGS_PERMISSIONS} />
        </main>
      ) : view === "account" ? (
        <main className="mx-auto max-w-[96rem] px-4 pb-12 pt-8 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/agent-dashboard")}
            className="appearance-none border-0 bg-transparent p-0 text-xs font-medium text-gold-deep hover:text-ink"
          >
            ← {t("account.back")}
          </button>
          <h1 className="mb-5 mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{t("account.title")}</h1>
          <AgentAccount />
        </main>
      ) : (
        <Home user={user} lang={i18n.language} onOpenBookings={openBookings} />
      )}
    </div>
  );
}

function Home({ user, lang, onOpenBookings }: { user: SessionUser; lang: string; onOpenBookings: () => void }) {
  const { t } = useTranslation("agentDashboard");
  const navigate = useNavigate();
  const locale = lang === "en" ? "en-GB" : "ru-RU";

  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<BookingSummary[] | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);

  // Real hotel catalog (name/location/stars only, no pricing calls).
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchJson<HotelSummary[]>("/hotel-engine/hotels", token)
      .then(setHotels)
      .catch(() => setHotels([]))
      .finally(() => setHotelsLoading(false));
  }, []);

  // The agent's own summary, counted by the server. Arrivals are bounded to
  // the next 30 days, so the request stays small however many bookings the
  // agent has in total.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const agent = `agent_id=${user.id}`;
    const today = isoDay();
    const until = isoDay(UPCOMING_DAYS);
    Promise.all([
      fetchJson<BookingSummary[]>(
        `/booking-engine/bookings?${agent}&arrival_from=${today}&arrival_to=${until}&sort_by=arrival_date&sort_dir=asc&limit=200`,
        token,
      ),
      fetchJson<{ total: number }>(`/booking-engine/bookings/count?${agent}&status=Pending`, token),
      fetchJson<{ total: number }>(`/booking-engine/bookings/count?${agent}&status=Confirmed&arrival_from=${today}`, token),
    ])
      .then(([list, pending, confirmed]) => {
        setUpcoming(list.filter((b) => !CLOSED_STATUSES.includes(b.status)));
        setPendingCount(pending.total);
        setConfirmedCount(confirmed.total);
      })
      .catch(() => setSummaryFailed(true));
  }, [user.id]);

  const hotelName = (id: number) => hotels.find((h) => h.id === id)?.hotel_name ?? `#${id}`;
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "short" });

  const stats = [
    { key: "arrivals", value: upcoming?.length ?? null, label: t("stats.arrivals", { days: UPCOMING_DAYS }), icon: <IconCalendar className="h-4 w-4" /> },
    { key: "pending", value: pendingCount, label: t("stats.pending"), icon: <IconClock className="h-4 w-4" /> },
    { key: "confirmed", value: confirmedCount, label: t("stats.confirmed"), icon: <IconCheck className="h-4 w-4" /> },
  ];

  return (
    <>
      {/* Hero -- the same photo slider and promotion card as the search
          page (HeroSlider). The two actions live here. */}
      <HeroSlider padding="pb-28 pt-14 sm:pt-16" cardFrom="2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t("hero.title")}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white drop-shadow sm:text-5xl">
          {t("hero.greeting", { name: getFirstName(user.name) })}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 drop-shadow sm:text-base">{t("hero.subtitle")}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/hotel-search")}
            className="inline-flex w-full appearance-none items-center justify-center gap-2 rounded-full border-0 bg-gold px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-ink/30 transition-transform hover:-translate-y-0.5 hover:bg-gold-deep sm:w-auto"
          >
            <IconSearch className="h-4 w-4" />
            {t("hero.searchButton")}
          </button>
          <button
            type="button"
            onClick={onOpenBookings}
            className="inline-flex w-full appearance-none items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 text-base font-medium text-white transition-colors hover:bg-white/15 sm:w-auto"
          >
            {t("hero.bookingsButton")}
          </button>
        </div>
      </HeroSlider>

      <main className="relative z-10 mx-auto -mt-14 max-w-[96rem] px-4 pb-14 sm:px-8">
        {/* Real figures, each a way into the bookings list. */}
        {!summaryFailed && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={onOpenBookings}
                className="group flex appearance-none items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5 text-left shadow-card transition-transform hover:-translate-y-0.5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  {s.value === null ? (
                    <span className="block h-7 w-10 animate-pulse rounded bg-ink/5" />
                  ) : (
                    <span className="block font-display text-2xl font-semibold leading-none text-ink">{s.value}</span>
                  )}
                  <span className="mt-1 block text-xs text-slate/60">{s.label}</span>
                </span>
                <IconChevronRight className="h-4 w-4 shrink-0 text-slate/30 transition-colors group-hover:text-gold-deep" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Next arrivals -- the agent's own, within 30 days. */}
          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">{t("upcoming.title")}</h2>
              <button
                type="button"
                onClick={onOpenBookings}
                className="appearance-none border-0 bg-transparent p-0 text-xs font-medium text-gold-deep hover:text-ink"
              >
                {t("upcoming.viewAll")} →
              </button>
            </div>
            {summaryFailed ? (
              <p className="mt-4 text-sm text-slate/50">{t("upcoming.failed")}</p>
            ) : upcoming === null ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/5" />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="mt-4 rounded-xl bg-sand/60 px-4 py-6 text-center">
                <p className="text-sm text-slate/60">{t("upcoming.empty", { days: UPCOMING_DAYS })}</p>
                <button
                  type="button"
                  onClick={() => navigate("/hotel-search")}
                  className="mt-3 appearance-none rounded-full border-0 bg-ink px-5 py-2 text-sm font-medium text-white"
                >
                  {t("hero.searchButton")}
                </button>
              </div>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-ink/5 p-0">
                {upcoming.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={onOpenBookings}
                      className="flex w-full appearance-none items-center gap-4 border-0 bg-transparent py-3 text-left transition-colors hover:bg-sand/40"
                    >
                      <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-ink px-2 py-1.5 text-white">
                        <span className="text-[10px] uppercase tracking-wide text-gold">{fmtDay(b.arrival_date).split(" ")[1] ?? ""}</span>
                        <span className="font-display text-lg font-semibold leading-tight">{fmtDay(b.arrival_date).split(" ")[0]}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{hotelName(b.hotel_id)}</span>
                        <span className="block truncate text-xs text-slate/60">
                          {b.booking_number} · {t("upcoming.nights", { count: nightsBetween(b.arrival_date, b.departure_date) })} ·{" "}
                          {t("upcoming.guests", { count: b.adults + b.children + b.infants })}
                        </span>
                      </span>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {upcoming && upcoming.length > 5 && (
              <p className="mt-2 text-xs text-slate/50">{t("upcoming.more", { count: upcoming.length - 5 })}</p>
            )}
          </section>

          {/* Quick actions -- every one leads somewhere real. */}
          <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-card">
            <h2 className="font-display text-lg font-semibold text-ink">{t("quickActions.title")}</h2>
            <div className="mt-3 space-y-2">
              {[
                { label: t("quickActions.createBooking"), hint: t("quickActions.createBookingHint"), onClick: () => navigate("/hotel-search") },
                { label: t("quickActions.myBookings"), hint: t("quickActions.myBookingsHint"), onClick: onOpenBookings },
                // Invoices and vouchers live inside each booking's own detail
                // (Decision 102) -- there is no separate documents page yet.
                { label: t("quickActions.documents"), hint: t("quickActions.documentsHint"), onClick: onOpenBookings },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className="group flex w-full appearance-none items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-left transition-colors hover:border-gold/50 hover:bg-sand/40"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{a.label}</span>
                    <span className="block truncate text-xs text-slate/55">{a.hint}</span>
                  </span>
                  <IconChevronRight className="h-4 w-4 shrink-0 text-slate/30 transition-colors group-hover:text-gold-deep" />
                </button>
              ))}
              {/* Reports are not built yet -- said honestly. */}
              <div className="flex w-full items-center justify-between rounded-xl bg-slate/5 px-4 py-3 text-sm font-medium text-slate/40">
                {t("quickActions.downloadReports")}
                <span className="rounded-full bg-slate/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate/40">
                  {t("quickActions.comingSoon")}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Hotels -- clicking one opens search with it filled in. */}
        <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-semibold text-ink">{t("featured.title")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hotelsLoading ? (
              [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-ink/5" />)
            ) : (
              hotels.map((hotel, i) => (
                <button
                  key={hotel.id}
                  type="button"
                  onClick={() => navigate("/hotel-search", { state: { destination: hotel.hotel_name } })}
                  className={`group relative flex h-32 flex-col justify-end overflow-hidden rounded-xl border-0 bg-gradient-to-br p-4 text-left transition-transform hover:-translate-y-0.5 ${
                    // Same ink/gold pair as the search page's hotel cards.
                    i % 2 === 0 ? "from-ink to-gold" : "from-gold to-ink"
                  }`}
                >
                  {hotel.star_rating != null && (
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">
                      {"★".repeat(hotel.star_rating)}
                    </span>
                  )}
                  <span className="font-display text-base font-semibold text-white">{hotel.hotel_name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-white/75">
                    <IconPin className="h-3 w-3" />
                    {placeOf(hotel)}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-white/90 group-hover:text-white">
                    {t("featured.cta")} <IconChevronRight className="h-3 w-3" />
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default AgentDashboard_v2;
