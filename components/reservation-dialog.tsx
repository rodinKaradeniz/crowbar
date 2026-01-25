"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  MapPin,
  User,
  Mail,
  Phone,
  CreditCard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldContent,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Reservation, Table } from "@/types";
import { cn } from "@/lib/utils";
import {
  getReservationTypesByVenueId,
  getReservationTypeById,
  getDefaultReservationTypeId,
} from "@/mock-data";

interface ReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    reservation: Omit<Reservation, "createdAt" | "updatedAt">
  ) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  tables: Table[];
  isNew?: boolean;
}

export function ReservationDialog({
  reservation,
  open,
  onOpenChange,
  onSave,
  onDelete,
  tables,
  isNew = false,
}: ReservationDialogProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [tableId, setTableId] = useState<string>("");
  const [status, setStatus] = useState<Reservation["status"]>("pending");
  const [note, setNote] = useState<string>("");
  const [reservationTypeId, setReservationTypeId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get reservation types for this venue
  const venueId = reservation?.venueId || "";
  const reservationTypes = venueId
    ? getReservationTypesByVenueId(venueId)
    : [];

  // Check if reservation type can be changed (not if payment is paid)
  const isPaymentPaid = reservation?.paymentStatus === "paid";
  const selectedReservationType = reservationTypeId
    ? getReservationTypeById(reservationTypeId)
    : null;

  useEffect(() => {
    if (reservation) {
      const reservationDate = parseISO(reservation.time);
      setDate(reservationDate);
      setTime(format(reservationDate, "HH:mm"));
      setPhone(reservation.phone);
      setEmail(reservation.email);
      setGuests(reservation.guests.toString());
      setTableId(reservation.tableId);
      setStatus(reservation.status);
      setNote(reservation.note || "");
      // Set reservation type or default
      setReservationTypeId(
        reservation.reservationTypeId ||
          getDefaultReservationTypeId(reservation.venueId) ||
          ""
      );
    } else {
      // Reset for new reservation
      setDate(undefined);
      setTime("");
      setPhone("");
      setEmail("");
      setGuests("");
      setTableId("");
      setStatus("pending");
      setNote("");
      setReservationTypeId("");
    }
  }, [reservation, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation || !date || !time) return;

    setIsSubmitting(true);
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const reservationDateTime = new Date(date);
      reservationDateTime.setHours(hours, minutes, 0, 0);

      await onSave({
        ...reservation,
        time: reservationDateTime.toISOString(),
        phone,
        email,
        guests: parseInt(guests, 10),
        tableId,
        status,
        note: note || undefined,
        reservationTypeId: reservationTypeId || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving reservation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!reservation || !onDelete) return;
    if (!confirm("Are you sure you want to delete this reservation?")) return;

    setIsSubmitting(true);
    try {
      await onDelete(reservation.id);
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting reservation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New Reservation" : "Edit Reservation"}
          </DialogTitle>
          <DialogDescription>
            {isNew ? "Create a new reservation" : "Update reservation details"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Date & Time</FieldLabel>
              <FieldContent>
                <div className="flex gap-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                    className="flex-1"
                  />
                </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Contact Information</FieldLabel>
              <FieldContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Reservation Details</FieldLabel>
              <FieldContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guests">Number of Guests</Label>
                    <Input
                      id="guests"
                      type="number"
                      min="1"
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="table">Table</Label>
                    <Select value={tableId} onValueChange={setTableId} required>
                      <SelectTrigger id="table">
                        <SelectValue placeholder="Select table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={table.id}>
                            {table.number} (Capacity: {table.capacity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Reservation Type</FieldLabel>
              <FieldContent>
                <Select
                  value={reservationTypeId}
                  onValueChange={setReservationTypeId}
                  disabled={isPaymentPaid}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reservation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reservationTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                          <span>{type.name}</span>
                          {type.requiresPayment && type.amount && (
                            <span className="text-muted-foreground ml-1">
                              (${type.amount})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPaymentPaid && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Reservation type cannot be changed after payment is completed.
                  </p>
                )}
                {selectedReservationType?.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedReservationType.description}
                  </p>
                )}
              </FieldContent>
            </Field>

            {/* Payment Information (Display Only) */}
            {reservation?.paymentStatus && (
              <Field>
                <FieldLabel>Payment Information</FieldLabel>
                <FieldContent>
                  <div className="space-y-2 p-3 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Status:</span>
                      <span
                        className={cn(
                          "text-sm px-2 py-1 rounded-full capitalize",
                          reservation.paymentStatus === "paid"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : reservation.paymentStatus === "pending"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        )}
                      >
                        {reservation.paymentStatus}
                      </span>
                    </div>
                    {reservation.paymentAmount && (
                      <div className="text-sm text-muted-foreground">
                        Amount: ${reservation.paymentAmount.toFixed(2)}
                      </div>
                    )}
                    {reservation.stripePaymentIntentId && (
                      <div className="text-sm text-muted-foreground">
                        Payment ID: {reservation.stripePaymentIntentId}
                      </div>
                    )}
                  </div>
                </FieldContent>
              </Field>
            )}

            <Field>
              <FieldLabel>Status</FieldLabel>
              <FieldContent>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as Reservation["status"])}
                >
                  <SelectTrigger>
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
              <FieldLabel htmlFor="note">Special Notes (Optional)</FieldLabel>
              <FieldContent>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            {!isNew && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}