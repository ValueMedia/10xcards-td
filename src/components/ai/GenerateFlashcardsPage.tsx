import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import FlashcardProposalCard from "@/components/ai/FlashcardProposalCard";
import type { FlashcardProposal } from "@/lib/services/ai";
import { flashcardContentSchema } from "@/lib/services/flashcards";

interface Props {
  setId: string;
  setName: string;
}

interface GenerateResponse {
  flashcards: FlashcardProposal[];
  error?: string;
  kind?: string;
}

interface SaveResponse {
  count: number;
  error?: string;
}

const MIN_INPUT_LENGTH = 10;
const MAX_INPUT_LENGTH = 8000;

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  timeout: "AI generation timed out. Please try again with a shorter text.",
  apiError: "AI service temporarily unavailable. Please try again in a moment.",
  unconfigured: "AI generation is not configured. Contact support.",
  parseError: "AI returned an unexpected response. Try a different text.",
  noProposals: "No flashcards could be generated. Try a longer or clearer text.",
  rateLimit: "Too many AI requests. Please wait an hour before trying again.",
};

function friendlyErrorMessage(error: string | undefined, kind: string | undefined): string {
  if (kind && kind in FRIENDLY_ERROR_MESSAGES) {
    return FRIENDLY_ERROR_MESSAGES[kind];
  }
  return error ?? "Something went wrong";
}

export default function GenerateFlashcardsPage({ setId, setName }: Props) {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposals, setProposals] = useState<FlashcardProposal[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputTooShort = text.trim().length < MIN_INPUT_LENGTH;
  const inputTooLong = text.length > MAX_INPUT_LENGTH;
  const canGenerate = !inputTooShort && !inputTooLong && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setErrorMessage(null);
    toast.info("Generation may take a few seconds");

    try {
      const response = await fetch(`/api/sets/${setId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, count: 5 }),
      });

      const result: GenerateResponse = await response.json();

      if (!response.ok) {
        const message = friendlyErrorMessage(result.error, result.kind);
        throw new Error(message);
      }

      const cards = result.flashcards;
      if (cards.length === 0) {
        setErrorMessage("No flashcards were generated. Try a longer or clearer text.");
        return;
      }

      setProposals(cards);
      toast.success(`${cards.length} flashcard proposals ready`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      setErrorMessage(message);
      toast.error(`Generation failed: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProposalChange = (index: number, updated: FlashcardProposal) => {
    setProposals((prev) => prev.map((p, i) => (i === index ? updated : p)));
  };

  const handleProposalDelete = (index: number) => {
    setProposals((prev) => prev.filter((_, i) => i !== index));
  };

  const validProposals = proposals.filter((p) => {
    const parsed = flashcardContentSchema.safeParse(p);
    return parsed.success;
  });

  const handleSave = async () => {
    if (validProposals.length === 0) {
      toast.error("No valid flashcards to save");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/sets/${setId}/flashcards/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcards: validProposals }),
      });

      const result: SaveResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `Save failed (${response.status})`);
      }

      const count = result.count;
      toast.success(`${count} flashcard${count === 1 ? "" : "s"} saved to ${setName}`);
      window.location.href = `/sets/${setId}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setErrorMessage(message);
      toast.error(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-cosmic min-h-screen p-4 text-white">
      <div className="mx-auto max-w-3xl">
        <a
          href={`/sets/${setId}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-blue-100/50 transition-colors hover:text-blue-100/80"
        >
          <BackIcon />
          Back to {setName}
        </a>

        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          Generate with AI
        </h1>
        <p className="mt-2 text-sm text-blue-100/50">
          Paste source text and let AI create flashcard proposals for{" "}
          <span className="font-medium text-blue-100">{setName}</span>.
        </p>

        <Card className="mt-6 border-white/10 bg-white/5">
          <CardContent className="space-y-4">
            <label htmlFor="source-text" className="block text-sm font-medium text-blue-100/80">
              Source text
            </label>
            <Textarea
              id="source-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData("text");
                const target = e.currentTarget;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const updated = `${text.slice(0, start)}${pasted}${text.slice(end)}`;
                setText(updated);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Paste up to ~1000 words of educational text..."
              rows={8}
              disabled={isGenerating}
              className="bg-white/5 text-white placeholder:text-blue-100/30"
              maxLength={MAX_INPUT_LENGTH}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn("text-xs", inputTooLong ? "text-red-400" : "text-blue-100/40")}>
                {text.length}/{MAX_INPUT_LENGTH} characters
                {inputTooShort && text.length > 0 && " · at least 10 characters required"}
              </p>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Spinner />
                    Generating...
                  </>
                ) : (
                  <>
                    <SparklesIcon />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {errorMessage}
            {proposals.length === 0 && (
              <button type="button" onClick={handleGenerate} className="ml-2 underline hover:text-white">
                Retry
              </button>
            )}
          </div>
        )}

        {isGenerating && proposals.length === 0 && (
          <div className="mt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
                <div className="mb-3 h-4 w-24 animate-pulse rounded bg-white/10" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                    <div className="h-20 animate-pulse rounded bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                    <div className="h-20 animate-pulse rounded bg-white/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {proposals.length > 0 && !isGenerating && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">
                {proposals.length} proposal{proposals.length === 1 ? "" : "s"}
              </h2>
              <p className="text-xs text-blue-100/40">
                {validProposals.length} ready to save · {proposals.length - validProposals.length} invalid
              </p>
            </div>

            <div className="space-y-4">
              {proposals.map((proposal, index) => (
                <FlashcardProposalCard
                  key={`${proposal.front}-${index}`}
                  index={index}
                  proposal={proposal}
                  onChange={handleProposalChange}
                  onDelete={handleProposalDelete}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setProposals([]);
                  setErrorMessage(null);
                }}
                disabled={isSaving}
                className="border-white/10 bg-transparent text-white hover:bg-white/10"
              >
                Discard all
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || validProposals.length === 0}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Spinner />
                    Saving...
                  </>
                ) : (
                  <>
                    Save {validProposals.length} flashcard{validProposals.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
