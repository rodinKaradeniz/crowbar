"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Awaited. Throw to keep the dialog open — a caller that fails should say so
   * over its own still-open dialog, not over a closed one.
   */
  onConfirm: () => void | Promise<void>;
  variant?: "default" | "destructive";
}

/**
 * The confirmation, per §06.
 *
 * A dialog is **only** for a decision that ends a shift or cannot be undone.
 * Its shape is fixed:
 *
 * · The title asks the real question, not "Are you sure?".
 * · The body states the consequence in real terms.
 * · **The safe choice is the filled one.** Keeping things as they are is the
 *   primary button; the operator's hand lands on it by default.
 * · **The risky choice is a quiet outline in red text**, never a filled red
 *   button. A filled destructive is the loudest thing on the screen, and the
 *   loudest thing should not be the one you did not mean to press.
 *
 * The default labels are a fallback, not an example — pass real ones.
 *
 * The confirmation WAITS. `onConfirm` used to be fired and forgotten while the
 * dialog closed in the same tick, so a decision that the server then refused
 * read as a decision that had been taken: the dialog vanished, and whatever
 * the caller toasted landed a second later over nothing. It now holds, with
 * both buttons disabled, until `onConfirm` settles, and closes only if it
 * resolved.
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description = "This cannot be undone.",
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  variant = "default",
}: ConfirmationDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller owns the message; the dialog's job is to stay put so the
      // operator can read it and decide again.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {/* Filled: staying put. */}
          <Button disabled={pending} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>

          {/* Quiet: going ahead. */}
          <Button
            variant={variant === "destructive" ? "destructive-quiet" : "secondary"}
            disabled={pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
