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
  Video,
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
import { Reservation, ServiceType } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
// Service type lookup is now done via the serviceTypes prop

interface ReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    reservation: Omit<Reservation, "createdAt" | "updatedAt">
  ) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  serviceTypes: ServiceType[];
  isNew?: boolean;
}

export function ReservationDialog({
  reservation,
  open,
  onOpenChange,
  onSave,
  onDelete,
  serviceTypes,
  isNew = false,
}: ReservationDialogProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [serviceTypeId, setServiceTypeId] = useState<string>("");
  const [status, setStatus] = useState<Reservation["status"]>("pending");
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPaymentPaid = reservation?.paymentStatus === "paid";
  const selectedServiceType = serviceTypeId
    ? serviceTypes.find((st) => st.id === serviceTypeId) || null
    : null;

  useEffect(() => {
    if (reservation) {
      const reservationDate = parseISO(reservation.time);
      setDate(reservationDate);
      setTime(format(reservationDate, "HH:mm"));
      setPhone(reservation.phone);
      setEmail(reservation.email);
      setGuests(reservation.guests.toString());
      setServiceTypeId(reservation.serviceTypeId);
      setStatus(reservation.status);
      setNote(reservation.note || "");
    } else {
      setDate(undefined);
      setTime("");
      setPhone("");
      setEmail("");
      setGuests("");
      setServiceTypeId("");
      setStatus("pending");
      setNote("");
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
        serviceTypeId,
        status,
        note: note || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error saving reservation");
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
      toast.error(error instanceof Error ? error.message : "Error deleting reservation");
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
                    <Label htmlFor="serviceType">Service Type</Label>
                    <Select
                      value={serviceTypeId}
                      onValueChange={setServiceTypeId}
                      disabled={isPaymentPaid}
                      required
                    >
                      <SelectTrigger id="serviceType">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceTypes.map((serviceType) => (
                          <SelectItem key={serviceType.id} value={serviceType.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: serviceType.color }}
                              />
                              <span>{serviceType.name}</span>
                              <span className="text-muted-foreground text-xs">
                                (Capacity: {serviceType.capacity})
                              </span>
                              {serviceType.requiresPayment && serviceType.amount && (
                                <span className="text-muted-foreground ml-1">
                                  - ${serviceType.amount}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isPaymentPaid && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Service type cannot be changed after payment is completed.
                      </p>
                    )}
                    {selectedServiceType?.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedServiceType.description}
                      </p>
                    )}
                  </div>
                </div>
              </FieldContent>
            </Field>

            {/* Meeting Link (Display Only for online reservations) */}
            {reservation?.meetingLink && (
              <Field>
                <FieldLabel>Online Meeting</FieldLabel>
                <FieldContent>
                  <a
                    href={reservation.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    <Video className="h-4 w-4" />
                    Join Google Meet
                  </a>
                </FieldContent>
              </Field>
            )}

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

            {/* Custom Fields (read-only display) */}
            {reservation?.customFields &&
              Object.keys(reservation.customFields).length > 0 && (
                <Field>
                  <FieldLabel>Additional Information</FieldLabel>
                  <FieldContent>
                    <div className="space-y-2 p-3 bg-muted rounded-md">
                      {Object.entries(reservation.customFields).map(
                        ([fieldId, value]) => {
                          const fieldDef = selectedServiceType?.formFields?.find(
                            (f) => f.id === fieldId
                          );
                          const label = fieldDef?.label || fieldId;
                          const displayValue =
                            typeof value === "boolean"
                              ? value
                                ? "Yes"
                                : "No"
                              : String(value ?? "—");

                          return (
                            <div key={fieldId} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="font-medium">{displayValue}</span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </FieldContent>
                </Field>
              )}
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