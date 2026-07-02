"use client";

import { useState } from "react";
import { format, addMinutes, roundToNearestMinutes } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { TermsAndConditionsDialog } from "@/components/terms-and-conditions-dialog";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceType } from "@/types";
import { clientCreatePublicReservation } from "@/lib/client-api";
import { toast } from "sonner";

interface ReservationFormProps {
  businessId: string;
  serviceTypes?: ServiceType[];
  preselectedServiceTypeId?: string;
  onSuccess?: () => void;
}

export function ReservationForm({ businessId, serviceTypes: propServiceTypes, preselectedServiceTypeId, onSuccess }: ReservationFormProps) {
  const [step, setStep] = useState<
    "type" | "datetime" | "info" | "confirmation" | "success"
  >(preselectedServiceTypeId ? "datetime" : "type");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [timePicker, setTimePicker] = useState<string>("12:00");
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [serviceTypeId, setServiceTypeId] = useState<string>(preselectedServiceTypeId ?? "");

  // Customer info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const serviceTypes = propServiceTypes || [];
  const selectedServiceType = serviceTypeId
    ? serviceTypes.find((st) => st.id === serviceTypeId) || null
    : null;

  // Round time to nearest 15 minutes
  const roundTo15Minutes = (timeString: string) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    const rounded = roundToNearestMinutes(d, { nearestTo: 15 });
    return format(rounded, "HH:mm");
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rounded = roundTo15Minutes(e.target.value);
    setTimePicker(rounded);
  };

  // Generate time slots (15 min intervals) around selected time
  const generateTimeSlots = (baseTime: string) => {
    const [hours, minutes] = baseTime.split(":").map(Number);
    const baseDate = new Date();
    baseDate.setHours(hours, minutes, 0, 0);

    const slots: string[] = [];
    for (let i = -4; i <= 4; i++) {
      const slotTime = addMinutes(baseDate, i * 15);
      slots.push(format(slotTime, "HH:mm"));
    }
    return slots;
  };

  const timeSlots = timePicker ? generateTimeSlots(timePicker) : [];

  const handleTypeSelected = () => {
    if (!serviceTypeId) return;
    setStep("datetime");
  };

  const handleDateTimeContinue = () => {
    if (date && selectedTime && guests) {
      setStep("info");
    }
  };

  const handleInfoContinue = () => {
    if (firstName && lastName && phone && email) {
      setStep("confirmation");
    }
  };

  const handleSubmit = async () => {
    if (!date) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const [hours, minutes] = (selectedTime || "12:00").split(":").map(Number);
      const reservationDateTime = new Date(date);
      reservationDateTime.setHours(hours, minutes, 0, 0);

      await clientCreatePublicReservation({
        businessId,
        serviceTypeId: serviceTypeId || "",
        time: reservationDateTime.toISOString(),
        name: `${firstName} ${lastName}`,
        phone: phone || "N/A",
        email: email || "guest@example.com",
        guests: parseInt(guests, 10) || 1,
        note: note || undefined,
      });
      toast.success("Reservation submitted successfully!");
      setStep("success");
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit reservation";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── RENDER: Success ───────────────────────────────────────────────────────

  if (step === "success") {
    return (
      <div className="flex flex-col gap-6 p-6 items-center text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <div>
          <h2 className="text-2xl font-bold mb-2">Reservation Submitted!</h2>
          <p className="text-muted-foreground">
            You&apos;ll receive a confirmation email shortly.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} className="w-full">
          Make Another Reservation
        </Button>
      </div>
    );
  }

  // ─── RENDER: Confirmation ──────────────────────────────────────────────────

  if (step === "confirmation") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Review Your Reservation</h2>
          <p className="text-muted-foreground">
            Please confirm your details before submitting
          </p>
        </div>
        <div className="space-y-4 p-4 bg-muted rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Date & Time</p>
            <p className="font-medium">
              {date && format(date, "EEEE, MMMM d, yyyy")} at {selectedTime}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Guests</p>
            <p className="font-medium">
              {guests} {guests === "1" ? "guest" : "guests"}
            </p>
          </div>
          {selectedServiceType && (
            <div>
              <p className="text-sm text-muted-foreground">Booking Type</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: selectedServiceType.color }}
                />
                <p className="font-medium">{selectedServiceType.name}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium">{firstName} {lastName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{phone}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{email}</p>
          </div>
          {note && (
            <div>
              <p className="text-sm text-muted-foreground">Note</p>
              <p className="font-medium">{note}</p>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="terms"
            checked={termsAgreed}
            onCheckedChange={(checked) => setTermsAgreed(checked === true)}
          />
          <label
            htmlFor="terms"
            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I agree to the{" "}
            <TermsAndConditionsDialog>
              <button
                type="button"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                terms and conditions
              </button>
            </TermsAndConditionsDialog>
          </label>
        </div>

        {submitError && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => setStep("info")}
            variant="outline"
            className="flex-1"
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={!termsAgreed || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Reservation"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── RENDER: Info step ─────────────────────────────────────────────────────

  if (step === "info") {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleInfoContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold mb-2">Your Information</h2>
            <p className="text-sm text-muted-foreground">
              Please provide your contact details
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>First Name</FieldLabel>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
            </Field>
            <Field>
              <FieldLabel>Last Name</FieldLabel>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                required
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Phone Number</FieldLabel>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              required
            />
          </Field>

          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required
            />
          </Field>

          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any special requests or notes"
            />
          </Field>

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setStep("datetime")}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={!firstName || !lastName || !phone || !email}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  // ─── RENDER: Datetime step ─────────────────────────────────────────────────

  if (step === "datetime") {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleDateTimeContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold mb-2">Select Date & Time</h2>
            <p className="text-sm text-muted-foreground">
              Choose when you&apos;d like to visit
            </p>
          </div>

          <Field>
            <FieldLabel>Number of Guests</FieldLabel>
            <Select value={guests} onValueChange={setGuests}>
              <SelectTrigger>
                <SelectValue placeholder="Select guests" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, i) => i + 1).map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num} {num === 1 ? "guest" : "guests"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Date</FieldLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field>
              <FieldLabel>Time</FieldLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full justify-start text-left font-normal"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {timePicker || "Pick a time"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3">
                    <input
                      type="time"
                      value={timePicker}
                      onChange={handleTimeChange}
                      step="900"
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Times are rounded to 15-minute intervals
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </Field>
          </div>

          {date && timePicker && (
            <Field>
              <FieldLabel>Available Time Slots</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {timeSlots.map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    variant={selectedTime === slot ? "default" : "outline"}
                    onClick={() => setSelectedTime(slot)}
                    className="w-full"
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            </Field>
          )}

          <Button
            type="submit"
            disabled={!date || !selectedTime || !guests}
            className="w-full"
          >
            Continue
          </Button>
        </FieldGroup>
      </form>
    );
  }

  // ─── RENDER: Service type selection ───────────────────────────────────────

  return (
    <form
      className="flex flex-col gap-6 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        handleTypeSelected();
      }}
    >
      <FieldGroup>
        <div className="text-center mb-4">
          <h2 className="text-xl font-semibold mb-2">Select Booking Type</h2>
          <p className="text-sm text-muted-foreground">
            Choose the type of reservation you&apos;d like to make
          </p>
        </div>

        {serviceTypes.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No booking types available for this business.</p>
          </div>
        ) : serviceTypes.length === 1 ? (
          (() => {
            if (!serviceTypeId && serviceTypes[0]) {
              setTimeout(() => {
                setServiceTypeId(serviceTypes[0].id);
              }, 0);
            }
            return (
              <div className="p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: serviceTypes[0].color }}
                  />
                  <h3 className="font-medium">{serviceTypes[0].name}</h3>
                </div>
                {serviceTypes[0].description && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {serviceTypes[0].description}
                  </p>
                )}
              </div>
            );
          })()
        ) : (
          <Field>
            <FieldLabel>Booking Type</FieldLabel>
            <Select
              value={serviceTypeId}
              onValueChange={setServiceTypeId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a booking type" />
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
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServiceType?.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {selectedServiceType.description}
              </p>
            )}
          </Field>
        )}

        <Button
          type="submit"
          disabled={!serviceTypeId}
          className="w-full"
        >
          Continue
        </Button>
      </FieldGroup>
    </form>
  );
}
