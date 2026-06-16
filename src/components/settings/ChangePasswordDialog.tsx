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

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
    onOpenChange(newOpen);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (res.ok) {
        toast.success("Password changed successfully");
        handleOpenChange(false);
      } else {
        const body: { error?: string } = await res.json();
        setError(body.error ?? "Failed to change password");
        toast.error(body.error ?? "Failed to change password");
      }
    } catch {
      setError("Network error. Please try again.");
      toast.error("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#0f1529] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription className="text-blue-100/50">
            Enter your new password below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm text-blue-100/70">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={pending}
                className="border-white/10 bg-white/5 text-white placeholder:text-blue-100/30"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-sm text-blue-100/70">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={pending}
                className="border-white/10 bg-white/5 text-white placeholder:text-blue-100/30"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={pending}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {pending ? "Changing..." : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}