import { useTranslation } from "react-i18next";
import { I18nProvider } from "@/components/I18nProvider";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedLocale } from "@/lib/i18n/constants";

interface Props {
  setId: string;
  setName: string;
  locale: SupportedLocale;
}

export function LookupWordPage(props: Props) {
  return (
    <I18nProvider locale={props.locale}>
      <LookupWordPageInner {...props} />
    </I18nProvider>
  );
}

function LookupWordPageInner({ setId, setName }: Props) {
  const { t } = useTranslation("lookup");

  return (
    <div className="bg-cosmic flex min-h-screen items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl space-y-6">
        <a
          href={`/sets/${setId}`}
          className="inline-flex items-center gap-1 text-sm text-blue-100/50 transition-colors hover:text-blue-100/80"
        >
          <BackIcon />
          {t("lookup.backToSet")}
        </a>

        <div className="space-y-1">
          <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
            {t("lookup.heading")}
          </h1>
          <p className="text-sm text-blue-100/60">{t("lookup.addingTo", { name: setName })}</p>
        </div>

        <Card className="border-white/10 bg-white/10 backdrop-blur-xl">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-100/70">{t("lookup.intro")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
