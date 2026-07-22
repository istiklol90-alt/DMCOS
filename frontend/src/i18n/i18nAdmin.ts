import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import reservationsEn from "./locales/en/reservations.json";
import hotelSearchEn from "./locales/en/hotelSearch.json";
import commonEn from "./locales/en/common.json";

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
const adminI18n = i18next.createInstance();

adminI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["common", "reservations", "hotelSearch"],
  defaultNS: "common",
  resources: {
    en: { common: commonEn, reservations: reservationsEn, hotelSearch: hotelSearchEn },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default adminI18n;
