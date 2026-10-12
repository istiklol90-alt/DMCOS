import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import BookingsList from "./Reservations";
import AgentTopNav from "../components/layout/AgentTopNav";
import type { SessionUser } from "../components/layout/AgentTopNav";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 1. Full restructure -- sidebar layout replaced
// with the shared AgentTopNav + a Marriott-Bonvoy-style hero/quick-actions
// home page, per the project owner's explicit reference structure.
//
// Removed entirely, not carried forward: the KPI cards ("128 active
// bookings", "$184,320 revenue" etc.), the AI-assistant chat transcript, and
// the approval checklist -- all three were 100% fabricated numbers/
// conversations (confirmed: no fetch, no real data source, ever), not part
// of the requested reference structure, and keeping them would directly
// contradict the explicit "never with fake data" instruction this redesign
// was built under.
//
// Corrected per explicit follow-up instruction: this page originally also
// embedded a full destination/dates/guests quick-search form in the hero,
// mirroring HotelSearch.tsx's own form. Clarified requirement: hotel search
// must live in exactly ONE place (the "Search" nav item/page) -- the
// embedded form here was a real duplicate of that, not just a visual
// echo, so it's been replaced with a single CTA button that navigates to
// the real search page (via useNavigate("/hotel-search"), optionally with
// a destination hint passed as router state -- see the featured-hotel
// cards below), just with no criteria to pre-fill since there's no
// longer a local form to
// source them from).
// ---------------------------------------------------------------------------

interface FeaturedHotel {
  id: number;
  hotel_name: string;
  country: string;
  city: string;
  star_rating: number | null;
}

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

function AgentDashboard_v2() {
  const { t } = useTranslation("agentDashboard");
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(null);

  // Routing fix (2026-07-29): the token/role guard that used to live here
  // (identical to HotelSearch.tsx's own copy) is now RequireAuth's job,
  // applied once in router.tsx -- this component is simply never mounted
  // unless that guard already passed. Only the user-data read stays.
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Real hotel catalog (name/location/star rating only, no pricing calls) --
  // the same GET /hotel-engine/hotels endpoint BookingsList/HotelSearch.tsx
  // already use elsewhere, not a new backend surface. Both of the system's
  // 2 real hotels are shown; clicking one pre-fills the search by name.
  const [featuredHotels, setFeaturedHotels] = useState<FeaturedHotel[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchJson<FeaturedHotel[]>("/hotel-engine/hotels", token)
      .then(setFeaturedHotels)
      .catch(() => setFeaturedHotels([]))
      .finally(() => setFeaturedLoading(false));
  }, []);

  const bookingsRef = useRef<HTMLDivElement>(null);
  function scrollToBookings() {
    bookingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!user) {
    return <div className="min-h-screen bg-sand" />;
  }

  return (
    <div className="min-h-screen bg-sand font-sans text-slate">
      <AgentTopNav user={user} active="dashboard" />

      {/* Hero -- byte-identical gradient/accent to HotelSearch.tsx's own
          hero band, so entering the panel and searching read as the same
          product rather than two differently-lit pages (reported live: the
          two screens had visibly different light). Design System v1.0
          ink/gold; no stock-photo pipeline exists in this project. */}
      <div className="bg-gradient-to-br from-ink via-ink to-gold/30 px-4 py-14 text-center sm:px-8 sm:py-16">
        <p className="text-xs font-semibold tracking-widest text-gold">{t("hero.title")}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-5xl">
          {t("hero.greeting", { name: getFirstName(user.name) })}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">{t("hero.subtitle")}</p>
      </div>

      {/* Same 96rem container HotelSearch.tsx now uses -- two agent pages
          capping their content at different widths read as two different
          layouts even when the palette matches. */}
      <main className="mx-auto max-w-[96rem] px-4 pb-12 sm:px-8">
        {/* Single CTA -- search itself lives only on the Search page/nav
            item now (see file header comment); this just gets an agent
            there, it doesn't re-implement the form. */}
        <div className="-mt-8 flex justify-center rounded-2xl border border-ink/10 bg-white p-6 shadow-card sm:-mt-10">
          <button
            type="button"
            onClick={() => navigate("/hotel-search")}
            className="flex w-full appearance-none items-center justify-center gap-2 rounded-full border-0 bg-ink px-8 py-3.5 text-base font-medium text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            {t("search.searchButton")}
          </button>
        </div>

        {/* Trust badges -- decorative/marketing copy, no data behind it. */}
        <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[t("trust.bestRate"), t("trust.freeTransfers"), t("trust.securePayments"), t("trust.support")].map((label) => (
            <div key={label} className="rounded-xl border border-ink/10 bg-white px-3 py-3 text-xs font-medium text-slate/70">
              {label}
            </div>
          ))}
        </div>

        {/* Quick actions + featured hotels */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-ink/10 bg-white p-5">
            <h2 className="font-display text-lg font-semibold text-ink">{t("quickActions.title")}</h2>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => navigate("/hotel-search")}
                className="flex w-full appearance-none items-center justify-between rounded-lg border-0 bg-sand/60 px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-sand"
              >
                {t("quickActions.createBooking")}
              </button>
              <button
                type="button"
                onClick={scrollToBookings}
                className="flex w-full appearance-none items-center justify-between rounded-lg border-0 bg-sand/60 px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-sand"
              >
                {t("quickActions.myBookings")}
              </button>
              {/* Outstanding Invoices / Agent Statement both route to the
                  same real "My bookings" list: Decision 102's per-booking
                  invoice/voucher downloads are the only real, existing
                  agent-facing document access today, and they live inside
                  each booking's own detail view -- there is no separate
                  aggregate page for either, and inventing one would be a
                  fake destination. */}
              <button
                type="button"
                onClick={scrollToBookings}
                className="flex w-full appearance-none items-center justify-between rounded-lg border-0 bg-sand/60 px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-sand"
              >
                {t("quickActions.outstandingInvoices")}
              </button>
              <button
                type="button"
                onClick={scrollToBookings}
                className="flex w-full appearance-none items-center justify-between rounded-lg border-0 bg-sand/60 px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-sand"
              >
                {t("quickActions.agentStatement")}
              </button>
              {/* Reports (01_Modules_List.md's Reports module) isn't built
                  anywhere in this project yet -- shown disabled with an
                  honest "Coming soon" label, not a fake working button. */}
              <div className="flex w-full items-center justify-between rounded-lg bg-slate/5 px-4 py-3 text-left text-sm font-medium text-slate/40">
                {t("quickActions.downloadReports")}
                <span className="rounded-full bg-slate/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate/40">
                  {t("quickActions.comingSoon")}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white p-5">
            <h2 className="font-display text-lg font-semibold text-ink">{t("featured.title")}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {featuredLoading ? (
                <>
                  <div className="h-24 animate-pulse rounded-xl bg-ink/5" />
                  <div className="h-24 animate-pulse rounded-xl bg-ink/5" />
                </>
              ) : (
                featuredHotels.map((hotel, i) => (
                  <button
                    key={hotel.id}
                    type="button"
                    onClick={() => navigate("/hotel-search", { state: { destination: hotel.hotel_name } })}
                    className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br p-4 text-left transition-transform hover:-translate-y-0.5 ${
                      // Same ink/gold pair HotelSearch.tsx's own
                      // CARD_GRADIENTS uses, so a hotel tile here and a
                      // hotel card there belong to one palette.
                      i % 2 === 0 ? "from-ink to-gold" : "from-gold to-ink"
                    }`}
                  >
                    <p className="font-display text-base font-semibold text-white">{hotel.hotel_name}</p>
                    <p className="mt-1 text-xs text-white/70">
                      {[hotel.city, hotel.country].filter(Boolean).join(", ")}
                    </p>
                    {hotel.star_rating != null && (
                      <p className="mt-2 text-xs text-white/90">{"★".repeat(hotel.star_rating)}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Real bookings — scoped to this agent only, via GET /agents/{id}/bookings */}
        <div ref={bookingsRef} className="mt-8 scroll-mt-24">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t("bookingsSection.title")}</h2>
          <BookingsList
            scope={{ type: "agent", agentId: user.id }}
            permissions={{ canChangeDates: true, canEditGuestDetails: true, canEditFlights: true, canCancel: true, canClaim: false, canConfirmWithHotel: false }}
          />
        </div>
      </main>
    </div>
  );
}

export default AgentDashboard_v2;
