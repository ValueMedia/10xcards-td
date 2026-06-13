import { z } from "zod";

const MAX_INPUT_LENGTH = 8000;
const MAX_SIDE_LENGTH = 1000;
const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;
const DEFAULT_MODEL = "google/gemini-flash-1.5";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 25_000;

export type AiServiceError =
  | { kind: "unconfigured"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "parseError"; message: string }
  | { kind: "apiError"; message: string }
  | { kind: "noProposals"; message: string };

export interface FlashcardProposal {
  front: string;
  back: string;
}

export interface GenerateInput {
  text: string;
  count?: number;
}

export const generateInputSchema = z.object({
  text: z.string().min(10, "Text must be at least 10 characters").max(MAX_INPUT_LENGTH, "Text is too long"),
  count: z.number().int().min(1).max(MAX_COUNT).default(DEFAULT_COUNT),
});

const openRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ),
});

const proposalsResponseSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string().min(1).max(MAX_SIDE_LENGTH),
      back: z.string().min(1).max(MAX_SIDE_LENGTH),
    }),
  ),
});

const HTTP_STATUS_BY_ERROR_KIND: Record<AiServiceError["kind"], number> = {
  unconfigured: 500,
  apiError: 502,
  timeout: 504,
  parseError: 422,
  noProposals: 422,
};

export function getAiErrorHttpStatus(error: AiServiceError): number {
  return HTTP_STATUS_BY_ERROR_KIND[error.kind];
}

export function isAiServiceError(value: unknown): value is AiServiceError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    ["unconfigured", "timeout", "parseError", "apiError", "noProposals"].includes((value as { kind: string }).kind)
  );
}

export function errorMessage(error: AiServiceError): string {
  return error.message;
}

export function errorKind(error: AiServiceError): AiServiceError["kind"] {
  return error.kind;
}

function buildPrompt(text: string, count: number): string {
  return `You are a helpful assistant that creates concise flashcards from a source text.

Extract up to ${count} important facts or concepts from the text below and return them as a JSON object with this exact shape:

{"flashcards":[{"front":"Question or concept","back":"Short answer or explanation"}]}

Rules:
- Each flashcard must have non-empty "front" and "back" fields.
- Keep fronts and backs short (ideally under 200 characters each, but no more than 1000).
- Use the source language.
- Return ONLY raw JSON. Do not wrap it in markdown code fences or add any other text.

Source text:
${text}`;
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const withoutOpening = trimmed.replace(/^```[a-zA-Z0-9]*\n?/, "");
    const withoutClosing = withoutOpening.replace(/\n?```$/, "");
    return withoutClosing.trim();
  }
  return trimmed;
}

export function parseProposals(rawContent: string): { data: FlashcardProposal[]; error: AiServiceError | null } {
  const cleaned = stripMarkdownFences(rawContent);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { data: [], error: { kind: "parseError", message: "Failed to parse AI response as JSON" } };
  }

  const validation = proposalsResponseSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      data: [],
      error: { kind: "parseError", message: "AI response did not match expected format" },
    };
  }

  if (validation.data.flashcards.length === 0) {
    return { data: [], error: { kind: "noProposals", message: "No flashcards were generated" } };
  }

  return { data: validation.data.flashcards, error: null };
}

export async function generateFlashcardProposals(input: GenerateInput): Promise<{
  data: FlashcardProposal[];
  error: AiServiceError | null;
}> {
  const parsedInput = generateInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const message = parsedInput.error.issues.map((issue) => issue.message).join("; ");
    return { data: [], error: { kind: "parseError", message } };
  }

  const { text, count } = parsedInput.data;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { data: [], error: { kind: "unconfigured", message: "OpenRouter API key is not configured" } };
  }

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "https://10xcards.app",
        "X-Title": "10xCards",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(text, count) }],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text();
      return {
        data: [],
        error: {
          kind: "apiError",
          message: `OpenRouter request failed (${response.status}): ${bodyText.slice(0, 200)}`,
        },
      };
    }

    const raw = await response.json();
    const parsedResponse = openRouterResponseSchema.safeParse(raw);
    if (!parsedResponse.success || parsedResponse.data.choices.length === 0) {
      return {
        data: [],
        error: { kind: "apiError", message: "OpenRouter returned an unexpected response format" },
      };
    }

    const content = parsedResponse.data.choices[0].message.content;
    return parseProposals(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { data: [], error: { kind: "timeout", message: "AI generation timed out" } };
    }
    return {
      data: [],
      error: {
        kind: "apiError",
        message: error instanceof Error ? error.message : "Unknown error calling OpenRouter",
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
