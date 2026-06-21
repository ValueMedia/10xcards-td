import type { APIRoute } from "astro";
import { z } from "zod";
import {
  generateFlashcardProposals,
  generateInputSchema,
  getAiErrorHttpStatus,
  errorMessage,
  type ToolDefinition,
} from "@/lib/services/ai";
import { checkDuplicateFronts } from "@/lib/services/flashcards";
import { checkRateLimit } from "@/lib/services/ai-rate-limit";
import { getUserPrompt } from "@/lib/services/user-settings";
import { lookupWord } from "@/lib/services/dictionary";
import { getSecret } from "astro:env/server";
import { env } from "cloudflare:workers";

export const prerender = false;

const DICTIONARY_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "lookup_word",
    description:
      "Look up an English word in the Cambridge Dictionary. Returns definitions, part of speech, CEFR level (A1-C2), usage labels (formal/informal), and up to 2 example sentences per definition. Use this when you need to understand a word's meaning or find example sentences for flashcards.",
    parameters: {
      type: "object",
      properties: { word: { type: "string", description: "The English word to look up" } },
      required: ["word"],
    },
  },
};

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  if (name !== "lookup_word") return JSON.stringify({ error: "Unknown tool" });
  const word = typeof args.word === "string" ? args.word : "";
  if (!word) return JSON.stringify({ error: "Missing word argument" });
  try {
    const entries = await lookupWord(word);
    return JSON.stringify(entries);
  } catch {
    return JSON.stringify({ error: "Dictionary lookup failed" });
  }
}

const paramsSchema = generateInputSchema
  .omit({ count: true, apiKey: true, model: true, appUrl: true, systemPromptOverride: true })
  .extend({
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

  const kv = env.AI_RATE_LIMIT as KVNamespace | undefined;
  const rateLimit = await checkRateLimit(kv ?? null, user.id);
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
  const envPromptOverride = getSecret("OPENROUTER_SYSTEM_PROMPT") ?? undefined;
  const appUrl = new URL(context.request.url).origin;
  const hourlyLimit = getSecret("AI_RATE_LIMIT_HOURLY");
  if (hourlyLimit !== undefined) {
    process.env.AI_RATE_LIMIT_HOURLY = hourlyLimit;
  }

  const userPromptResult = await getUserPrompt(supabase, user.id);
  const systemPromptOverride = userPromptResult.data?.prompt ?? envPromptOverride;
  const count = userPromptResult.data?.flashcard_count ?? parsed.data.count;

  const { data, error } = await generateFlashcardProposals({
    text: parsed.data.text,
    count,
    apiKey,
    model,
    appUrl,
    systemPromptOverride,
    tools: [DICTIONARY_TOOL],
    onToolCall: handleToolCall,
  });

  if (error) {
    const status = getAiErrorHttpStatus(error);
    return new Response(JSON.stringify({ error: errorMessage(error), kind: error.kind }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { normalizedFronts, error: duplicateError } = await checkDuplicateFronts(supabase, setId);

  let uniqueProposals = data;
  let removedCount = 0;
  let removedFronts: string[] = [];

  if (!duplicateError) {
    removedFronts = [];
    uniqueProposals = data.filter((proposal) => {
      if (normalizedFronts.has(proposal.front.trim().toLowerCase())) {
        removedFronts.push(proposal.front);
        return false;
      }
      return true;
    });
    removedCount = data.length - uniqueProposals.length;
  }

  return new Response(JSON.stringify({ flashcards: uniqueProposals, removedCount, removedFronts }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
