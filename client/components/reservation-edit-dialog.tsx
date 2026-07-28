"use client";

import { useEffect, useState } from "react";
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
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Reservation } from "@/types";

export interface ReservationEditValues {
  phone: string;
  email: string;
  status: Reservation["status"];
  note?: string;
}

interface ReservationEditDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ReservationEditValues) => void | Promise<void>;
}

export function ReservationEditDialog({
  reservation,
  open,
  onOpenChange,
  onSave,
}: ReservationEditDialogProps) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Reservation["status"]>("pending");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!reservation || !open) return;
    setPhone(reservation.phone);
    setEmail(reservation.email);
    setStatus(reservation.status);
    setNote(reservation.note ?? "");
  }, [open, reservation]);

  if (!reservation) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSave({
        phone,
        email,
        status,
        note: note || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update reservation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit reservation details</DialogTitle>
          <DialogDescription>
            Update contact information, notes, or status. Use Reschedule to change allocation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-reservation-phone">Phone</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-reservation-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-reservation-email">Email</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-reservation-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-reservation-status">Status</FieldLabel>
              <FieldContent>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as Reservation["status"])
                  }
                >
                  <SelectTrigger id="edit-reservation-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-reservation-note">Special notes</FieldLabel>
              <FieldContent>
                <Textarea
                  id="edit-reservation-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
