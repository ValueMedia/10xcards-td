import { useState, useCallback } from "react";
import { toast } from "sonner";
import { State } from "@/types";
import type { Flashcard, FlashcardSet } from "@/types";
import { FlashcardList } from "@/components/sets/FlashcardList";
import { CreateFlashcardDialog } from "@/components/sets/CreateFlashcardDialog";
import { EditFlashcardDialog } from "@/components/sets/EditFlashcardDialog";
import { DeleteFlashcardDialog } from "@/components/sets/DeleteFlashcardDialog";
import { ImportCsvDialog } from "@/components/sets/ImportCsvDialog";
import { ShareSetModal } from "@/components/sets/ShareSetModal";
import { Button } from "@/components/ui/button";

interface Props {
  initialData: string;
}

interface ParsedData {
  set: FlashcardSet | null;
  flashcards: Flashcard[];
}

export default function SetDetailPage({ initialData }: Props) {
  const [state, setState] = useState<ParsedData>(() => {
    try {
      const parsed = JSON.parse(initialData) as ParsedData;
      if (!parsed.set || typeof parsed.set.id !== "string") {
        throw new Error("Invalid set data");
      }
      return parsed;
    } catch {
      return { set: null, flashcards: [] };
    }
  });
  const { set, flashcards } = state;

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Flashcard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Flashcard | null>(null);

  const handleCreate = useCallback((flashcard: Flashcard) => {
    setState((prev) => ({
      ...prev,
      flashcards: [flashcard, ...prev.flashcards],
    }));
    setCreateOpen(false);
    toast.success("Flashcard created");
  }, []);

  const handleUpdate = useCallback((flashcard: Flashcard) => {
    setState((prev) => ({
      ...prev,
      flashcards: prev.flashcards.map((f) => (f.id === flashcard.id ? flashcard : f)),
    }));
    setEditTarget(null);
    toast.success("Flashcard updated");
  }, []);

  const handleDelete = useCallback((flashcardId: string) => {
    setState((prev) => ({
      ...prev,
      flashcards: prev.flashcards.filter((f) => f.id !== flashcardId),
    }));
    setDeleteTarget(null);
    toast.success("Flashcard deleted");
  }, []);

  const handleImport = useCallback((imported: Flashcard[], skippedCount: number) => {
    setState((prev) => ({ ...prev, flashcards: [...imported, ...prev.flashcards] }));
    setImportOpen(false);
    const skippedNote = skippedCount > 0 ? ` · ${skippedCount} lines skipped` : "";
    toast.success(`Imported ${imported.length} flashcard${imported.length !== 1 ? "s" : ""}${skippedNote}`);
  }, []);

  if (!set) {
    return (
      <div className="bg-cosmic min-h-screen p-4 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold text-red-300">Failed to load set</h1>
          <p className="mt-2 text-sm text-blue-100/60">The set data is missing or invalid.</p>
          <a
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-1 text-sm text-blue-100/50 hover:text-blue-100/80"
          >
            <BackIcon /> Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cosmic min-h-screen p-4 text-white">
      <div className="mx-auto max-w-3xl">
        <a
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-blue-100/50 transition-colors hover:text-blue-100/80"
        >
          <BackIcon />
          Back to dashboard
        </a>

        <div className="mb-8 flex flex-col gap-3">
          <div>
            <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
              {set.name}
            </h1>
            <p className="mt-2 text-sm text-blue-100/50">
              {flashcards.length}&nbsp;{flashcards.length === 1 ? "card" : "cards"}
              &nbsp;·&nbsp;{flashcards.filter((f) => f.state === State.Review).length}&nbsp;learned
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {flashcards.length > 0 ? (
              <a
                href={`/sets/${set.id}/browse`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-teal-600 sm:h-9 sm:py-2"
              >
                <EyeIcon />
                Browse
              </a>
            ) : (
              <button
                disabled
                title="Add flashcards first"
                className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white opacity-50 shadow-xs sm:h-9 sm:py-2"
              >
                <EyeIcon />
                Browse
              </button>
            )}
            <a
              href={`/sets/${set.id}/review`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-purple-600 sm:h-9 sm:py-2"
            >
              <span className="sm:hidden">Learn</span>
              <span className="hidden sm:inline">Start learn session</span>
            </a>
            <a
              href={`/generate?setId=${set.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-500 sm:h-9 sm:py-2"
            >
              <SparklesIcon />
              <span className="sm:hidden">Build with AI</span>
              <span className="hidden sm:inline">Generate with AI</span>
            </a>
            <Button
              type="button"
              onClick={() => {
                setShareOpen(true);
              }}
              variant="outline"
              className="h-11 w-full border-white/10 bg-white/5 text-white hover:bg-white/10 sm:h-9"
            >
              <ShareIcon />
              Share
            </Button>
            <Button
              type="button"
              onClick={() => {
                setImportOpen(true);
              }}
              variant="outline"
              className="h-11 w-full border-white/10 bg-white/5 text-white hover:bg-white/10 sm:h-9"
            >
              <UploadIcon />
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import CSV</span>
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
              className="h-11 w-full bg-purple-600 hover:bg-purple-500 sm:h-9"
            >
              <PlusIcon />
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">New flashcard</span>
            </Button>
          </div>
        </div>

        <FlashcardList flashcards={flashcards} onEdit={setEditTarget} onDelete={setDeleteTarget} />
      </div>

      <ShareSetModal
        setId={set.id}
        shareToken={state.set?.share_token ?? null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onTokenGenerated={(token) => {
          setState((prev) => ({ ...prev, set: prev.set ? { ...prev.set, share_token: token } : prev.set }));
        }}
      />

      <CreateFlashcardDialog open={createOpen} onOpenChange={setCreateOpen} setId={set.id} onCreate={handleCreate} />

      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} setId={set.id} onImport={handleImport} />

      <EditFlashcardDialog
        key={editTarget?.id ?? "empty"}
        flashcard={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onUpdate={handleUpdate}
      />

      <DeleteFlashcardDialog
        flashcard={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onDelete={handleDelete}
      />
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

function PlusIcon() {
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
      <path d="M5 12h14" />
      <path d="M12 5v14" />
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

function ShareIcon() {
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
      className="mr-1"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function EyeIcon() {
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
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
