// Synthetic APIContext factory for invoking route handlers directly in tests.
//
// Handlers read auth exclusively from `context.locals` and (for writes) from
// `context.request.json()`, so injecting a real RLS-scoped Supabase client into
// `locals.supabase` exercises the true authorization path without a server.
// Generalizes the local `makeContext` pattern from src/pages/api/dict/[word].test.ts.
import type { APIContext } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MakeContextOpts {
  user: { id: string; email?: string } | null;
  supabase: SupabaseClient | null;
  params?: Record<string, string | undefined>;
  body?: unknown;
  request?: Request;
  locale?: string;
}

export function makeApiContext(opts: MakeContextOpts): APIContext {
  const request =
    opts.request ??
    new Request("http://localhost/api/test", {
      method: opts.body !== undefined ? "POST" : "GET",
      ...(opts.body !== undefined
        ? { body: JSON.stringify(opts.body), headers: { "Content-Type": "application/json" } }
        : {}),
    });

  return {
    params: opts.params ?? {},
    locals: { user: opts.user, supabase: opts.supabase, locale: opts.locale ?? "en" },
    request,
  } as unknown as APIContext;
}
