import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Flashcard } from "@/types";
import { parseCSV } from "@/lib/services/csv-parser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  onImport: (flashcards: Flashcard[], skippedCount: number) => void;
}

interface Proposal {
  _key: string;
  front: string;
  back: string;
}

type Step = "upload" | "preview" | "importing";

function INITIAL_STATE() {
  return { step: "upload" as Step, proposals: [] as Proposal[], parseSkippedCount: 0, error: null as string | null };
}

export function ImportCsvDialog({ open, onOpenChange, setId, onImport }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [parseSkippedCount, setParseSkippedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    const s = INITIAL_STATE();
    setStep(s.step);
    setProposals(s.proposals);
    setParseSkippedCount(s.parseSkippedCount);
    setError(s.error);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetState();
    onOpenChange(next);
  }

  function handleFileButtonClick() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input value so the same file can be re-selected after going Back
    e.target.value = "";
    if (!file) return;

    if (file.size > 1_000_000) {
      setError("File too large (max 1 MB)");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { valid, skippedCount } = parseCSV(text);
      if (valid.length === 0) {
        setError("No valid flashcards found in this file");
        return;
      }
      setProposals(valid.map((c) => ({ _key: crypto.randomUUID(), ...c })));
      setParseSkippedCount(skippedCount);
      setError(null);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleDeleteProposal(key: string) {
    setProposals((prev) => prev.filter((p) => p._key !== key));
  }

  function handleBack() {
    setProposals([]);
    setParseSkippedCount(0);
    setError(null);
    setStep("upload");
  }

  async function handleImport() {
    if (proposals.length === 0) return;
    setStep("importing");
    setError(null);

    const CHUNK_SIZE = 50;
    const allCreated: Flashcard[] = [];
    let chunkIndex = 0;

    while (chunkIndex * CHUNK_SIZE < proposals.length) {
      const chunk = proposals.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
      let res: Response;
      try {
        res = await fetch(`/api/sets/${setId}/flashcards/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flashcards: chunk.map(({ front, back }) => ({ front, back })) }),
        });
      } catch {
        const committedCount = chunkIndex * CHUNK_SIZE;
        setProposals((prev) => prev.slice(committedCount));
        setError("Network error — retry will import remaining cards");
        setStep("preview");
        toast.error("Import interrupted — retry to continue");
        return;
      }

      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        const committedCount = chunkIndex * CHUNK_SIZE;
        setProposals((prev) => prev.slice(committedCount));
        setError(body.error ?? `Import failed (HTTP ${res.status}) — retry will import remaining cards`);
        setStep("preview");
        toast.error("Import interrupted — retry to continue");
        return;
      }

      const data: { data: Flashcard[] } = await res.json();
      allCreated.push(...data.data);
      chunkIndex++;
    }

    onImport(allCreated, parseSkippedCount);
  }

  const isImporting = step === "importing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#0f1529] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from CSV / TXT</DialogTitle>
          <DialogDescription className="text-blue-100/50">
            {step === "upload"
              ? "Upload a CSV or TXT file in Anki format — one card per line, front and back separated by semicolon, tab, or dash."
              : `Found ${proposals.length} card${proposals.length !== 1 ? "s" : ""} · ${parseSkippedCount} line${parseSkippedCount !== 1 ? "s" : ""} skipped`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
            <Button
              type="button"
              onClick={handleFileButtonClick}
              className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
              variant="outline"
            >
              <UploadIcon />
              Select file
            </Button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {(step === "preview" || step === "importing") && (
          <div className="space-y-3">
            {proposals.length > 0 ? (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {proposals.map((p) => (
                  <li
                    key={p._key}
                    className="flex items-start justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{p.front}</p>
                      <p className="truncate text-blue-100/60">{p.back}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteProposal(p._key);
                      }}
                      disabled={isImporting}
                      className="mt-0.5 shrink-0 text-blue-100/40 transition-colors hover:text-red-400 disabled:opacity-40"
                      aria-label="Remove card"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-blue-100/40">
                All cards removed — go back to select a different file.
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2">
          {step !== "upload" && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isImporting}
              className="text-sm text-blue-100/50 transition-colors hover:text-blue-100/80 disabled:opacity-40"
            >
              ← Back
            </button>
          )}
          {step === "upload" && <span />}
          {step !== "upload" && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={proposals.length === 0 || isImporting}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {isImporting ? "Importing…" : `Import ${proposals.length} card${proposals.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadIcon() {
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
      className="mr-2 size-4"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
