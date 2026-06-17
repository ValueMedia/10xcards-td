import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES } from "@/lib/i18n/constants";
import type { SupportedLocale } from "@/lib/i18n/constants";

interface Props {
  currentLocale: SupportedLocale;
  redirectTo?: string;
}

export function LanguageSwitcher({ currentLocale, redirectTo = "/settings" }: Props) {
  const { t } = useTranslation("settings");

  return (
    <div className="flex items-center gap-2">
      {SUPPORTED_LOCALES.map((locale) => (
        <a
          key={locale}
          href={`/api/locale-switch?locale=${locale}&redirect=${encodeURIComponent(redirectTo)}`}
          data-testid={`lang-${locale}`}
          aria-current={locale === currentLocale ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
            locale === currentLocale
              ? "pointer-events-none bg-purple-600 text-white"
              : "border border-white/10 bg-white/5 text-blue-100/60 hover:bg-white/10"
          }`}
        >
          {locale === "en" ? t("settings.english") : t("settings.polish")}
        </a>
      ))}
    </div>
  );
}
