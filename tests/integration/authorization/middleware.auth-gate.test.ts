// Risk #1 — the authentication gate itself.
//
// An unauthenticated request to a PROTECTED_API_ROUTES path must be blocked by
// the middleware with 401 BEFORE any handler runs (next() is never called).
// Exercises the real `onRequest` with a cookie-less synthetic context; relies on
// the astro:env/server + astro:middleware stubs wired in vitest.config.ts.
import { describe, it, expect, vi } from "vitest";
import type { APIContext } from "astro";
import { hasSupabaseEnv } from "../helpers/env";
import { onRequest } from "@/middleware";

describe.skipIf(!hasSupabaseEnv)("middleware auth gate", () => {
  function cookielessContext(pathname: string): APIContext {
    const url = new URL(`http://localhost${pathname}`);
    return {
      request: new Request(url), // no Cookie header → no session
      url,
      cookies: {
        get: () => undefined,
        set: () => undefined,
      },
      locals: {},
      redirect: (path: string) =>
        new Response(null, { status: 302, headers: { Location: path } }),
    } as unknown as APIContext;
  }

  it("anon → protected API route → 401, handler never reached", async () => {
    const next = vi.fn(() => Promise.resolve(new Response("SHOULD_NOT_REACH", { status: 200 })));

    const res = await onRequest(cookielessContext("/api/sets"), next as never);

    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
  });
});
