import { useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/services/ai-prompt";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { PromptPreview } from "@/components/settings/PromptPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  email: string;
  initialPrompt: string | null;
  initialFlashcardCount: number | null;
}

type PromptMode = "default" | "custom";

export function SettingsPage({ email, initialPrompt, initialFlashcardCount }: Props) {
  const initialMode: PromptMode = initialPrompt ? "custom" : "default";
  const [promptMode, setPromptMode] = useState<PromptMode>(initialMode);
  const [customPrompt, setCustomPrompt] = useState(initialPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const [flashcardCount, setFlashcardCount] = useState(initialFlashcardCount ?? 5);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);

  async function handleSave() {
    const trimmed = customPrompt.trim();
    if (!trimmed) {
      toast.error("Prompt cannot be empty");
      return;
    }
    if (flashcardCount < 1 || flashcardCount > 20) {
      toast.error("Flashcards per generation must be between 1 and 20");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/user-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, flashcard_count: flashcardCount }),
      });

      if (res.ok) {
        toast.success("AI prompt saved");
      } else {
        const body: { error?: string } = await res.json();
        toast.error(body.error ?? "Failed to save prompt");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSwitchToDefault() {
    setSwitchConfirmOpen(false);
    setSaving(true);
    try {
      const res = await fetch("/api/user-prompt", { method: "DELETE" });
      if (res.ok) {
        setPromptMode("default");
        setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
        setFlashcardCount(5);
        setShowPreview(false);
        toast.success("Switched to default prompt");
      } else {
        const body: { error?: string } = await res.json();
        toast.error(body.error ?? "Failed to switch to default prompt");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  function handleModeSwitch(mode: PromptMode) {
    if (mode === "default" && promptMode === "custom") {
      setSwitchConfirmOpen(true);
    } else {
      setPromptMode(mode);
      if (mode === "default") {
        setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
        setFlashcardCount(5);
        setShowPreview(false);
      }
    }
  }

  return (
    <div className="bg-cosmic flex min-h-screen items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Settings
        </h1>

        {/* AI Prompt Section */}
        <Card className="border-white/10 bg-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">AI Prompt — for building flashcard purposes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  promptMode === "default"
                    ? "bg-purple-600 text-white"
                    : "border border-white/10 bg-white/5 text-blue-100/60 hover:bg-white/10"
                }`}
                onClick={() => handleModeSwitch("default")}
              >
                Default
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  promptMode === "custom"
                    ? "bg-purple-600 text-white"
                    : "border border-white/10 bg-white/5 text-blue-100/60 hover:bg-white/10"
                }`}
                onClick={() => setPromptMode("custom")}
              >
                Custom
              </button>
            </div>

            {promptMode === "default" ? (
              <>
                <Textarea
                  value={DEFAULT_SYSTEM_PROMPT}
                  disabled
                  className="min-h-40 border-white/10 bg-white/5 text-blue-100/50"
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm text-blue-100/70">Flashcards per generation</label>
                  <Input
                    type="number"
                    value={5}
                    disabled
                    className="w-24 border-white/10 bg-white/5 text-white opacity-50"
                  />
                </div>
              </>
            ) : (
              <>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter your custom AI prompt..."
                  className="min-h-40 border-white/10 bg-white/5 text-white placeholder:text-blue-100/30"
                />
                <div className="flex items-center gap-3">
                  <label htmlFor="flashcard-count" className="text-sm text-blue-100/70">
                    Flashcards per generation (1–20)
                  </label>
                  <Input
                    id="flashcard-count"
                    type="number"
                    min={1}
                    max={20}
                    value={flashcardCount}
                    onChange={(e) => setFlashcardCount(Number(e.target.value))}
                    className="w-24 border-white/10 bg-white/5 text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-purple-600 hover:bg-purple-500"
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? "Hide preview" : "Preview"}
                  </Button>
                </div>
                {showPreview && (
                  <PromptPreview prompt={customPrompt} count={flashcardCount} />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Language Section */}
        <Card className="border-white/10 bg-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Language</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white"
                disabled
              >
                EN
              </button>
              <button
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-blue-100/40 transition-colors hover:bg-white/10"
                disabled
              >
                PL
              </button>
            </div>
            <p className="text-xs text-blue-100/30">Coming soon</p>
          </CardContent>
        </Card>

        {/* Account Section */}
        <Card className="border-white/10 bg-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-blue-100/50">Email</p>
              <p className="text-white">{email}</p>
            </div>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setPasswordOpen(true)}
            >
              Change password
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-500/30 bg-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-red-400">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>

        <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
        <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />

        <Dialog open={switchConfirmOpen} onOpenChange={setSwitchConfirmOpen}>
          <DialogContent className="border-white/10 bg-[#0f1529] text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Switch to default prompt?</DialogTitle>
              <DialogDescription className="text-blue-100/50">
                This will delete your custom prompt. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setSwitchConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleSwitchToDefault}>
                Switch to default
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}