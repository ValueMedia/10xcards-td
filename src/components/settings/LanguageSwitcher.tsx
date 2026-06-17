import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/lib/i18n/constants";
import type { SupportedLocale } from "@/lib/i18n/constants";

function setLocaleCookie(locale: SupportedLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

interface Props {
  currentLocale: SupportedLocale;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const { t } = useTranslation("settings");
  const [pending, setPending] = useState(false);

  async function handleSwitch(locale: SupportedLocale) {
    if (locale === currentLocale || pending) return;
    setPending(true);
    try {
      await fetch("/api/user/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch {
      // Network error — continue with cookie-only locale
    }
    setLocaleCookie(locale);
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-2">
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          onClick={() => void handleSwitch(locale)}
          data-testid={`lang-${locale}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            locale === currentLocale
              ? "bg-purple-600 text-white"
              : "border border-white/10 bg-white/5 text-blue-100/60 hover:bg-white/10"
          }`}
        >
          {locale === "en" ? t("settings.english") : t("settings.polish")}
        </button>
      ))}
    </div>
  );
}
