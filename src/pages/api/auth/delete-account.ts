import type { APIRoute } from "astro";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";
import { deleteUserAccount } from "@/lib/services/user-settings";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const schema = z.object({
  confirmation: z.literal("DELETE"),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = context.locals.supabase;
  if (!user?.id || !supabase) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await deleteUserAccount(adminClient, user.id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await supabase.auth.signOut();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};