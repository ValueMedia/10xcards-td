import type { APIRoute } from "astro";
import { isValidLocale, LOCALE_COOKIE, DEFAULT_LOCALE } from "@/lib/i18n/constants";
import type { SupportedLocale } from "@/lib/i18n/constants";
import { upsertUserLocale } from "@/lib/services/user-settings";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const locale = context.url.searchParams.get("locale") ?? "";
  const redirect = context.url.searchParams.get("redirect") ?? "/settings";

  const safeLocale: SupportedLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;

  context.cookies.set(LOCALE_COOKIE, safeLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
  });

  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (user?.id && supabase) {
    await upsertUserLocale(supabase, user.id, safeLocale).catch((_err: unknown) => {
      // ignore — cookie already set
    });
  }

  return context.redirect(redirect);
};
