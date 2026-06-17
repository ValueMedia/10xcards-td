import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { getUserLocale } from "@/lib/services/user-settings";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isValidLocale } from "@/lib/i18n/constants";
import type { SupportedLocale } from "@/lib/i18n/constants";

const PROTECTED_PAGE_ROUTES = ["/dashboard", "/sets", "/generate", "/settings"];
const PROTECTED_API_ROUTES = [
  "/api/sets",
  "/api/flashcards",
  "/api/reviews",
  "/api/share",
  "/api/user-prompt",
  "/api/auth/change-password",
  "/api/auth/delete-account",
];

function isProtected(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

function resolveLocaleFromHeader(header: string | null): SupportedLocale | null {
  if (!header) return null;
  const preferred = header.split(",").map((lang) => lang.split(";")[0].trim().toLowerCase());
  for (const lang of preferred) {
    if (isValidLocale(lang)) return lang;
    const base = lang.split("-")[0];
    if (isValidLocale(base)) return base;
  }
  return null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
    context.locals.supabase = supabase;
  } else {
    context.locals.user = null;
    context.locals.supabase = null;
  }

  let locale: SupportedLocale = DEFAULT_LOCALE;

  const cookieLocale = context.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    locale = cookieLocale;
  } else if (context.locals.user && context.locals.supabase) {
    const { data } = await getUserLocale(context.locals.supabase, context.locals.user.id);
    if (data) {
      locale = data;
    }
  }

  if (locale === DEFAULT_LOCALE && (!cookieLocale || !isValidLocale(cookieLocale))) {
    const headerLocale = resolveLocaleFromHeader(context.request.headers.get("accept-language"));
    if (headerLocale) {
      locale = headerLocale;
    }
  }

  context.locals.locale = locale;

  if (!context.cookies.get(LOCALE_COOKIE)?.value) {
    context.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
      sameSite: "lax",
    });
  }

  if (!context.locals.user) {
    if (isProtected(context.url.pathname, PROTECTED_API_ROUTES)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (isProtected(context.url.pathname, PROTECTED_PAGE_ROUTES)) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
