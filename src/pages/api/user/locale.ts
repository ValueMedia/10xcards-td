import type { APIRoute } from "astro";
import { z } from "zod";
import { upsertUserLocale } from "@/lib/services/user-settings";
import { SUPPORTED_LOCALES, LOCALE_COOKIE } from "@/lib/i18n/constants";
import type { SupportedLocale } from "@/lib/i18n/constants";

export const prerender = false;

const putSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES as unknown as [string, ...string[]]),
});

export const PUT: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (!user?.id || !supabase) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "INVALID_JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "VALIDATION_FAILED",
        details: parsed.error.issues.map((i) => i.message),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const locale = parsed.data.locale as SupportedLocale;

  const { data, error } = await upsertUserLocale(supabase, user.id, locale);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  context.cookies.set(LOCALE_COOKIE, data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
  });

  return new Response(JSON.stringify({ locale: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
