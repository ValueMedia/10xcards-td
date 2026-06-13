import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateFlashcardProposals, parseProposals, getAiErrorHttpStatus } from "./ai";

function makeOpenRouterResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

describe("parseProposals", () => {
  it("parses raw JSON proposals", () => {
    const raw = JSON.stringify({
      flashcards: [{ front: "What is vitest?", back: "A fast unit test runner." }],
    });
    const { data, error } = parseProposals(raw);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({ front: "What is vitest?", back: "A fast unit test runner." });
  });

  it("strips markdown fences and parses", () => {
    const raw = "```json\n" + JSON.stringify({ flashcards: [{ front: "Q", back: "A" }] }) + "\n```";
    const { data, error } = parseProposals(raw);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("returns parseError for invalid JSON", () => {
    const { data, error } = parseProposals("not-json");
    expect(data).toHaveLength(0);
    expect(error?.kind).toBe("parseError");
  });

  it("returns noProposals for empty flashcards", () => {
    const raw = JSON.stringify({ flashcards: [] });
    const { data, error } = parseProposals(raw);
    expect(data).toHaveLength(0);
    expect(error?.kind).toBe("noProposals");
  });
});

describe("generateFlashcardProposals", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test/model";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns proposals when OpenRouter responds with valid JSON", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeOpenRouterResponse(
            JSON.stringify({
              flashcards: [
                { front: "Front 1", back: "Back 1" },
                { front: "Front 2", back: "Back 2" },
              ],
            }),
          ),
        ),
        { status: 200 },
      ),
    );

    const { data, error } = await generateFlashcardProposals({
      text: "This is a sample text long enough to pass the minimum length validation rule in the service.",
      count: 2,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns apiError on non-ok response", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("Bad request", { status: 400 }));

    const { data, error } = await generateFlashcardProposals({
      text: "This is a sample text long enough to pass the minimum length validation rule in the service.",
      count: 2,
    });
    expect(data).toHaveLength(0);
    expect(error?.kind).toBe("apiError");
  });

  it("returns timeout on AbortError", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortError);

    const { data, error } = await generateFlashcardProposals({
      text: "This is a sample text long enough to pass the minimum length validation rule in the service.",
      count: 2,
    });
    expect(data).toHaveLength(0);
    expect(error?.kind).toBe("timeout");
  });

  it("returns unconfigured when API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { data, error } = await generateFlashcardProposals({
      text: "This is a sample text long enough to pass the minimum length validation rule in the service.",
      count: 2,
    });
    expect(data).toHaveLength(0);
    expect(error?.kind).toBe("unconfigured");
  });
});

describe("getAiErrorHttpStatus", () => {
  it.each([
    [{ kind: "unconfigured", message: "x" }, 500],
    [{ kind: "apiError", message: "x" }, 502],
    [{ kind: "timeout", message: "x" }, 504],
    [{ kind: "parseError", message: "x" }, 422],
    [{ kind: "noProposals", message: "x" }, 422],
  ] as const)("maps %s to status %i", (error, expected) => {
    expect(getAiErrorHttpStatus(error)).toBe(expected);
  });
});
