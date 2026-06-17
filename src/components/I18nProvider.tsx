import { useEffect, useRef } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import type { SupportedLocale } from "@/lib/i18n/constants";

interface I18nProviderProps {
  locale: SupportedLocale;
  children: React.ReactNode;
}

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const initialized = useRef(false);
  if (!initialized.current) {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    initialized.current = true;
  }

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
  }, [locale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
