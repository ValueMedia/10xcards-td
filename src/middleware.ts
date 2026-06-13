import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_PAGE_ROUTES = ["/dashboard", "/sets"];
const PROTECTED_API_ROUTES = ["/api/sets", "/api/flashcards"];

function isProtected(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(route + "/"));
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
