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
import { Clock, CheckCircle2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getReservationTypesByVenueId,
  getReservationTypeById,
  getDefaultReservationTypeId,
} from "@/mock-data";
import { PaymentStep } from "./payment-step";

interface ReservationFormProps {
  venueId: string;
}

export function ReservationForm({ venueId }: ReservationFormProps) {
  const [step, setStep] = useState<
    "datetime" | "type" | "info" | "payment" | "confirmation" | "success"
  >("datetime");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [timePicker, setTimePicker] = useState<string>("12:00");
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [reservationTypeId, setReservationTypeId] = useState<string>("");

  // Customer info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Get reservation types for this venue
  const reservationTypes = getReservationTypesByVenueId(venueId);
  const selectedReservationType = reservationTypeId
    ? getReservationTypeById(reservationTypeId)
    : null;

  // Determine if payment is required
  const requiresPayment =
    selectedReservationType?.requiresPayment && selectedReservationType?.amount;

  // Round time to nearest 15 minutes
  const roundTo15Minutes = (timeString: string) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    const rounded = roundToNearestMinutes(date, { nearestTo: 15 });
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
    // Generate 4 slots before and 4 slots after
    for (let i = -4; i <= 4; i++) {
      const slotTime = addMinutes(baseDate, i * 15);
      slots.push(format(slotTime, "HH:mm"));
    }
    return slots;
  };

  const timeSlots = timePicker ? generateTimeSlots(timePicker) : [];

  const handleDateTimeContinue = () => {
    if (date && selectedTime && guests) {
      // If no types exist, skip to info. Otherwise go to type selection
      if (reservationTypes.length === 0) {
        setReservationTypeId(getDefaultReservationTypeId(venueId) || "");
        setStep("info");
      } else {
        setStep("type");
      }
    }
  };

  const handleTypeContinue = () => {
    if (reservationTypeId) {
      setStep("info");
    }
  };

  const handleInfoContinue = () => {
    if (firstName && lastName && phone && email) {
      // If payment is required, go to payment step. Otherwise go to confirmation
      if (requiresPayment) {
        setStep("payment");
      } else {
        setStep("confirmation");
      }
    }
  };

  const handlePaymentSuccess = () => {
    // After successful payment, proceed to confirmation
    setStep("confirmation");
  };

  const handleSubmit = () => {
    // In real app, submit to API here
    // Include: reservationTypeId, payment info if applicable
    setStep("success");
  };

  if (step === "success") {
    return (
      <div className="flex flex-col gap-6 p-6 items-center text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <div>
          <h2 className="text-2xl font-bold mb-2">Reservation Successful!</h2>
          <p className="text-muted-foreground">
            Your reservation has been confirmed. You'll receive a confirmation
            email shortly.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} className="w-full">
          Make Another Reservation
        </Button>
      </div>
    );
  }

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
          {selectedReservationType && (
            <div>
              <p className="text-sm text-muted-foreground">Reservation Type</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: selectedReservationType.color }}
                />
                <p className="font-medium">{selectedReservationType.name}</p>
                {requiresPayment && (
                  <p className="text-muted-foreground">
                    - ${selectedReservationType.amount?.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium">
              {firstName} {lastName}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{phone}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{email}</p>
          </div>
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

        <div className="flex gap-3">
          <Button
            onClick={() =>
              setStep(requiresPayment ? "payment" : "info")
            }
            variant="outline"
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={!termsAgreed}
          >
            Submit Reservation
          </Button>
        </div>
      </div>
    );
  }

  if (step === "payment") {
    return (
      <PaymentStep
        amount={selectedReservationType?.amount || 0}
        onSuccess={handlePaymentSuccess}
        onBack={() => setStep("info")}
      />
    );
  }

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

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setStep("type")}
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

  if (step === "type") {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleTypeContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold mb-2">Select Reservation Type</h2>
            <p className="text-sm text-muted-foreground">
              Choose the type of reservation you'd like
            </p>
          </div>

          <Field>
            <FieldLabel>Reservation Type</FieldLabel>
            <Select
              value={reservationTypeId}
              onValueChange={setReservationTypeId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reservation type" />
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
                          (${type.amount.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReservationType?.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {selectedReservationType.description}
              </p>
            )}
            {selectedReservationType?.requiresPayment &&
              selectedReservationType?.amount && (
                <p className="text-sm font-medium mt-2 text-primary">
                  Payment required: ${selectedReservationType.amount.toFixed(2)}
                </p>
              )}
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
              disabled={!reservationTypeId}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  // Step 1: Date/Time Selection
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
            Choose when you'd like to visit
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
                  disabled={(date) => date < new Date()}
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