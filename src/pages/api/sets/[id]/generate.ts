import type { APIRoute } from "astro";
import { z } from "zod";
import { generateFlashcardProposals, generateInputSchema, getAiErrorHttpStatus, errorMessage } from "@/lib/services/ai";
import { checkRateLimit } from "@/lib/services/ai-rate-limit";
import { getSecret } from "astro:env/server";

export const prerender = false;

const paramsSchema = generateInputSchema.omit({ count: true, apiKey: true, model: true, appUrl: true }).extend({
  count: z.number().int().min(1).max(20).optional(),
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

  const setId = context.params.id;
  if (!setId) {
    return new Response(JSON.stringify({ error: "Set ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const setResult = await supabase.from("sets").select("id").eq("id", setId).eq("user_id", user.id).maybeSingle();
  if (setResult.error) {
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!setResult.data) {
    return new Response(JSON.stringify({ error: "Set not found" }), {
      status: 404,
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

  const parsed = paramsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => i.message),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const kv = context.locals.runtime?.env?.AI_RATE_LIMIT ?? null;
  const rateLimit = await checkRateLimit(kv, user.id);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "3600" },
    });
  }

  const apiKey = getSecret("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI generation is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const model = getSecret("OPENROUTER_MODEL") ?? undefined;
  const appUrl = new URL(context.request.url).origin;

  const { data, error } = await generateFlashcardProposals({
    text: parsed.data.text,
    count: parsed.data.count,
    apiKey,
    model,
    appUrl,
  });

  if (error) {
    const status = getAiErrorHttpStatus(error);
    return new Response(JSON.stringify({ error: errorMessage(error), kind: error.kind }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ flashcards: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
