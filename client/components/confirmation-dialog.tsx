"use client";

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
  onConfirm: () => void;
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
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {/* Filled: staying put. */}
          <Button onClick={() => onOpenChange(false)}>{cancelLabel}</Button>

          {/* Quiet: going ahead. */}
          <Button
            variant={variant === "destructive" ? "destructive-quiet" : "secondary"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
