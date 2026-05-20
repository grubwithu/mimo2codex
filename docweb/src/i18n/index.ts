import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en-US/common.json";
import enLanding from "./locales/en-US/landing.json";
import enDocs from "./locales/en-US/docs.json";
import zhCommon from "./locales/zh-CN/common.json";
import zhLanding from "./locales/zh-CN/landing.json";
import zhDocs from "./locales/zh-CN/docs.json";

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, landing: enLanding, docs: enDocs },
    zh: { common: zhCommon, landing: zhLanding, docs: zhDocs },
  },
  lng: "zh",
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "landing", "docs"],
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
