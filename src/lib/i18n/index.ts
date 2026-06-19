import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enSettings from "./locales/en/settings.json";
import enDashboard from "./locales/en/dashboard.json";
import enLookup from "./locales/en/lookup.json";
import plCommon from "./locales/pl/common.json";
import plAuth from "./locales/pl/auth.json";
import plSettings from "./locales/pl/settings.json";
import plDashboard from "./locales/pl/dashboard.json";
import plLookup from "./locales/pl/lookup.json";

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    settings: enSettings,
    dashboard: enDashboard,
    lookup: enLookup,
  },
  pl: {
    common: plCommon,
    auth: plAuth,
    settings: plSettings,
    dashboard: plDashboard,
    lookup: plLookup,
  },
};

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  fallbackNS: "common",
  ns: ["common", "auth", "settings", "dashboard", "lookup"],
  defaultNS: "common",
  resources,
  keySeparator: false,
  nsSeparator: false,
  initImmediate: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
