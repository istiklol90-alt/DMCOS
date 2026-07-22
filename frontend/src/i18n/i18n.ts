import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import reservationsRu from "./locales/ru/reservations.json";
import reservationsEn from "./locales/en/reservations.json";
import hotelSearchRu from "./locales/ru/hotelSearch.json";
import hotelSearchEn from "./locales/en/hotelSearch.json";
import agentDashboardRu from "./locales/ru/agentDashboard.json";
import agentDashboardEn from "./locales/en/agentDashboard.json";
import commonRu from "./locales/ru/common.json";
import commonEn from "./locales/en/common.json";

// Same flat, unprefixed localStorage-key convention this project already
// uses for "token"/"role"/"user" (no wrapper/hook exists around
// localStorage anywhere in this codebase -- confirmed during research).
// Default "ru" matches the app's current always-Russian behavior exactly,
// so an existing agent sees zero change until they explicitly switch.
const STORAGE_KEY = "lang";
const storedLang = localStorage.getItem(STORAGE_KEY);
const initialLang = storedLang === "en" || storedLang === "ru" ? storedLang : "ru";

i18n.use(initReactI18next).init({
  lng: initialLang,
  fallbackLng: "ru",
  ns: ["common", "reservations", "hotelSearch", "agentDashboard"],
  defaultNS: "common",
  resources: {
    ru: { common: commonRu, reservations: reservationsRu, hotelSearch: hotelSearchRu, agentDashboard: agentDashboardRu },
    en: { common: commonEn, reservations: reservationsEn, hotelSearch: hotelSearchEn, agentDashboard: agentDashboardEn },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
