import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pending, setPending] = useState(false);
  const isConfirmed = confirmation === "DELETE" && currentPassword.length >= 6;

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setConfirmation("");
      setCurrentPassword("");
    }
    onOpenChange(newOpen);
  }

  async function handleDelete() {
    setPending(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE", currentPassword }),
      });

      if (res.ok) {
        window.location.href = "/";
      } else {
        const body: { error?: string } = await res.json();
        toast.error(body.error ?? "Failed to delete account");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#0f1529] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription className="text-blue-100/50">
            This will permanently delete your account and all associated data, including all flashcard sets and learning progress. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="delete-current-password" className="text-sm text-blue-100/70">
              Current password
            </label>
            <Input
              id="delete-current-password"
              type="password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={pending}
              className="border-white/10 bg-white/5 text-white placeholder:text-blue-100/30"
            />
          </div>
          <label htmlFor="delete-confirmation" className="text-sm text-blue-100/70">
            Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
          </label>
          <Input
            id="delete-confirmation"
            placeholder="DELETE"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={pending}
            className="border-white/10 bg-white/5 text-white placeholder:text-blue-100/30"
          />
        </div>
        <DialogFooter className="mt-4">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || pending}
          >
            {pending ? "Deleting..." : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}