import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enSettings from "./locales/en/settings.json";
import enDashboard from "./locales/en/dashboard.json";
import plCommon from "./locales/pl/common.json";
import plAuth from "./locales/pl/auth.json";
import plSettings from "./locales/pl/settings.json";
import plDashboard from "./locales/pl/dashboard.json";

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  ns: ["common", "auth", "settings", "dashboard"],
  defaultNS: "common",
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      settings: enSettings,
      dashboard: enDashboard,
    },
    pl: {
      common: plCommon,
      auth: plAuth,
      settings: plSettings,
      dashboard: plDashboard,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
