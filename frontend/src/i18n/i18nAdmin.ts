import i18next from "i18next";

import reservationsEn from "./locales/en/reservations.json";
import hotelSearchEn from "./locales/en/hotelSearch.json";
import commonEn from "./locales/en/common.json";
import reservationsAdmin from "./locales/admin/reservations.json";

// A second, independent i18next instance -- deliberately NOT the shared
// singleton in ./i18n.ts. AdminPanel.tsx renders Reservations.tsx's shared
// BookingsList/BookingDetail (via AdminBookingFinance.tsx), which call
// useTranslation("reservations") bound to the ambient i18n instance. The
// admin panel never renders Header.tsx (App.tsx explicitly skips it on the
// "admin-panel" page), so there is no RU/EN toggle available there, and the
// ambient instance defaults to "ru" -- meaning that shared subtree would be
// permanently stuck showing Russian to every admin with no way to switch it.
//
// Forcing it by calling i18n.changeLanguage("en") on the shared singleton
// would fix the symptom but corrupt state: i18n.ts's own "languageChanged"
// listener persists to the same localStorage["lang"] key an agent's own
// session relies on, so an admin visiting the page would silently overwrite
// the agent's saved language preference. A separate instance avoids this
// entirely -- it never touches localStorage["lang"] and never calls
// changeLanguage, so it can't leak into or be leaked into by the agent-side
// singleton.
//
// English-only resources: admin never needs the "ru" bundle or the
// agentDashboard namespace (AgentDashboard_v2.tsx is never rendered inside
// AdminPanel).
//
// Decision (bug fix): deliberately does NOT call .use(initReactI18next).
// That plugin's ONLY job is registering this instance as react-i18next's
// shared, module-level "default" fallback (setI18n(instance) in
// react-i18next's own context.js) that every useTranslation() call with no
// explicit i18n prop and no wrapping I18nextProvider falls back to via
// getI18n(). Confirmed directly against react-i18next's source
// (node_modules/react-i18next/src/i18nInstance.js): that fallback is a
// single shared variable, last-write-wins, GLOBAL ACROSS EVERY i18next
// instance in the same JS runtime -- not scoped per-instance. Since
// AdminPanel.tsx is unconditionally imported by App.tsx (no code-splitting),
// this module's side effect ran on every page load regardless of role, and
// because it happened to execute AFTER i18n.ts's own setI18n(i18n) call
// (App.tsx imports AdminPanel before AgentDashboard_v2/HotelSearch, and
// main.tsx imports i18n.ts before router.tsx/App.tsx), it silently
// overwrote the real ambient default for the ENTIRE app -- every
// unwrapped useTranslation() call anywhere (Header.tsx, AgentTopNav,
// AgentDashboard_v2, HotelSearch, Reservations' BookingsList, all of it)
// was actually resolving against THIS English-only, no-"agentDashboard"-
// namespace instance instead of the real bilingual one, which is exactly
// why raw keys like "nav.search"/"hero.subtitle" (a namespace this
// instance never registers at all) rendered literally. I18nextProvider
// (confirmed via its own source) has zero dependency on the wrapped
// instance having used this plugin -- it just passes the instance through
// context -- so removing it here fixes the leak with no loss of function
// for AdminPanel.tsx's own subtree.
// Admin-only wording, layered over the shared English catalog.
//
// The same components render in the agent panel from the same
// reservations.json, so changing a label there would change what agents read.
// This instance is used by AdminPanel.tsx alone, so a word a manager needs
// ("Assign to me", "Awaiting hotel reply") can differ here without the shared
// file -- or the agent's screen -- changing at all. Labels only: no key
// carries a status VALUE, which is still the string the server stores.
//
// Built as a NEW object, never merged into the imported one. i18next keeps
// the very object it is handed, and reservationsEn is the same module object
// the agent's own instance (i18n.ts) holds -- so the obvious
// adminI18n.addResourceBundle(..., deep, overwrite) mutates it in place and
// silently rewrites the agent's English too. That is exactly what the first
// version of this did; caught by the agent-panel screenshot comparison, where
// the English booking detail and date views came back changed.
type Catalog = { [key: string]: string | Catalog };

function withOverrides(base: Catalog, overrides: Catalog): Catalog {
  const out: Catalog = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const existing = out[key];
    out[key] =
      typeof value === "object" && typeof existing === "object" ? withOverrides(existing, value) : value;
  }
  return out;
}

const reservationsForAdmin = withOverrides(reservationsEn as Catalog, reservationsAdmin as Catalog);

const adminI18n = i18next.createInstance();

adminI18n.init({
  lng: "en",
  fallbackLng: "en",
  ns: ["common", "reservations", "hotelSearch"],
  defaultNS: "common",
  resources: {
    en: { common: commonEn, reservations: reservationsForAdmin, hotelSearch: hotelSearchEn },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default adminI18n;
