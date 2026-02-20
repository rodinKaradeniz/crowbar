"use client";

import { useState, useMemo } from "react";
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
import { ServiceType, FormFieldDefinition } from "@/types";
import { PaymentStep } from "./payment-step";
import { DynamicField } from "./dynamic-field";
import { clientCreatePublicReservation } from "@/lib/client-api";
import { toast } from "sonner";

interface ReservationFormProps {
  businessId: string;
  serviceTypes?: ServiceType[];
}

export function ReservationForm({ businessId, serviceTypes: propServiceTypes }: ReservationFormProps) {
  const [step, setStep] = useState<
    "type" | "datetime" | "info" | "custom" | "payment" | "confirmation" | "success"
  >("type");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [timePicker, setTimePicker] = useState<string>("12:00");
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [serviceTypeId, setServiceTypeId] = useState<string>("");

  // Customer info (default form)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Custom field values (for dynamic forms)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Get service types for this business
  const serviceTypes = propServiceTypes || [];
  const selectedServiceType = serviceTypeId
    ? serviceTypes.find((st) => st.id === serviceTypeId) || null
    : null;

  // Check if the selected service type has a custom form
  const hasCustomForm = selectedServiceType?.formFields && selectedServiceType.formFields.length > 0;
  const sortedFormFields = useMemo(() => {
    if (!selectedServiceType?.formFields) return [];
    return [...selectedServiceType.formFields].sort((a, b) => a.order - b.order);
  }, [selectedServiceType?.formFields]);

  // Split form fields into system and custom
  const systemFields = useMemo(() => sortedFormFields.filter((f) => f.system), [sortedFormFields]);
  const customFields = useMemo(() => sortedFormFields.filter((f) => !f.system), [sortedFormFields]);

  // Determine if payment is required
  const requiresPayment =
    selectedServiceType?.requiresPayment && selectedServiceType?.amount;

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

  // ─── Step flow logic ──────────────────────────────────────────────────────

  const handleTypeSelected = () => {
    if (!serviceTypeId) return;
    // If custom form, go to "custom" step which handles everything
    // If no custom form, go to datetime → info flow
    if (hasCustomForm) {
      setStep("custom");
    } else {
      setStep("datetime");
    }
  };

  const handleDateTimeContinue = () => {
    if (date && selectedTime && guests) {
      setStep("info");
    }
  };

  const handleInfoContinue = () => {
    if (firstName && lastName && phone && email) {
      if (requiresPayment) {
        setStep("payment");
      } else {
        setStep("confirmation");
      }
    }
  };

  const handleCustomFormContinue = () => {
    // Validate required fields
    for (const field of sortedFormFields) {
      const val = getFieldValue(field);
      if (field.required && (val === undefined || val === null || val === "")) {
        toast.error(`"${field.label}" is required`);
        return;
      }
    }

    if (requiresPayment) {
      setStep("payment");
    } else {
      setStep("confirmation");
    }
  };

  const handlePaymentSuccess = () => {
    setStep("confirmation");
  };

  // ─── Helpers for system/custom field values ────────────────────────────────

  function getFieldValue(field: FormFieldDefinition): unknown {
    if (field.system) {
      switch (field.id) {
        case "sys_date":
          return date ? date.toISOString() : undefined;
        case "sys_time":
          return selectedTime || undefined;
        case "sys_guests":
          return guests ? parseInt(guests, 10) : undefined;
        case "sys_name":
          return firstName && lastName ? `${firstName} ${lastName}` : (customFieldValues[field.id] as string) || "";
        case "sys_email":
          return email || (customFieldValues[field.id] as string) || "";
        case "sys_phone":
          return phone || (customFieldValues[field.id] as string) || "";
        default:
          return customFieldValues[field.id];
      }
    }
    return customFieldValues[field.id];
  }

  function setFieldValue(field: FormFieldDefinition, value: unknown) {
    if (field.system) {
      switch (field.id) {
        case "sys_date":
          setDate(value ? new Date(value as string) : undefined);
          return;
        case "sys_time":
          setSelectedTime(value as string);
          return;
        case "sys_guests":
          setGuests(value !== undefined ? String(value) : "");
          return;
        case "sys_name":
          // For the custom form, store as a single value
          setCustomFieldValues((prev) => ({ ...prev, [field.id]: value }));
          // Also try to split into first/last for submission
          const nameStr = (value as string) || "";
          const parts = nameStr.trim().split(/\s+/);
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
          return;
        case "sys_email":
          setEmail(value as string);
          return;
        case "sys_phone":
          setPhone(value as string);
          return;
      }
    }
    setCustomFieldValues((prev) => ({ ...prev, [field.id]: value }));
  }

  // Get display value for confirmation
  function getDisplayValue(field: FormFieldDefinition): string {
    const val = getFieldValue(field);
    if (val === undefined || val === null || val === "") return "—";
    if (field.type === "date" && typeof val === "string") {
      try {
        return format(new Date(val), "EEEE, MMMM d, yyyy");
      } catch {
        return val;
      }
    }
    if (field.type === "checkbox") return val ? "Yes" : "No";
    return String(val);
  }

  // ─── Build submission data ─────────────────────────────────────────────────

  const buildSubmissionData = () => {
    // Collect custom (non-system) field values
    const customData: Record<string, unknown> = {};
    for (const field of sortedFormFields) {
      if (!field.system) {
        const val = customFieldValues[field.id];
        if (val !== undefined && val !== null && val !== "") {
          customData[field.id] = val;
        }
      }
    }

    const [hours, minutes] = (selectedTime || "12:00").split(":").map(Number);
    const reservationDateTime = new Date(date || new Date());
    reservationDateTime.setHours(hours, minutes, 0, 0);

    const name = firstName && lastName
      ? `${firstName} ${lastName}`
      : (customFieldValues["sys_name"] as string) || "Guest";

    return {
      businessId,
      serviceTypeId: serviceTypeId || "",
      time: reservationDateTime.toISOString(),
      name,
      phone: phone || "N/A",
      email: email || "guest@example.com",
      guests: parseInt(guests, 10) || 1,
      customFields: Object.keys(customData).length > 0 ? customData : undefined,
    };
  };

  const handleSubmit = async () => {
    if (!date && !hasCustomForm) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const data = buildSubmissionData();
      await clientCreatePublicReservation(data);
      toast.success("Reservation submitted successfully!");
      setStep("success");
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
          <h2 className="text-2xl font-bold mb-2">Reservation Successful!</h2>
          <p className="text-muted-foreground">
            Your reservation has been confirmed. You&apos;ll receive a confirmation
            email shortly.
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
          {hasCustomForm ? (
            // Dynamic form confirmation
            <>
              {selectedServiceType && (
                <div>
                  <p className="text-sm text-muted-foreground">Service Type</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedServiceType.color }}
                    />
                    <p className="font-medium">{selectedServiceType.name}</p>
                    {requiresPayment && (
                      <p className="text-muted-foreground">
                        - ${selectedServiceType.amount?.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {sortedFormFields.map((field) => (
                <div key={field.id}>
                  <p className="text-sm text-muted-foreground">{field.label}</p>
                  <p className="font-medium">{getDisplayValue(field)}</p>
                </div>
              ))}
              {/* Show any custom fields not in the form definition */}
              {customFields.map((field) => {
                const val = customFieldValues[field.id];
                if (val === undefined || val === null || val === "") return null;
                return (
                  <div key={field.id}>
                    <p className="text-sm text-muted-foreground">{field.label}</p>
                    <p className="font-medium">{String(val)}</p>
                  </div>
                );
              })}
            </>
          ) : (
            // Default form confirmation
            <>
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
                  <p className="text-sm text-muted-foreground">Service Type</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedServiceType.color }}
                    />
                    <p className="font-medium">{selectedServiceType.name}</p>
                    {requiresPayment && (
                      <p className="text-muted-foreground">
                        - ${selectedServiceType.amount?.toFixed(2)}
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
            </>
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
            onClick={() =>
              hasCustomForm
                ? setStep("custom")
                : setStep(requiresPayment ? "payment" : "info")
            }
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

  // ─── RENDER: Payment ───────────────────────────────────────────────────────

  if (step === "payment") {
    return (
      <PaymentStep
        amount={selectedServiceType?.amount || 0}
        onSuccess={handlePaymentSuccess}
        onBack={() => setStep(hasCustomForm ? "custom" : "info")}
      />
    );
  }

  // ─── RENDER: Custom form (dynamic fields) ──────────────────────────────────

  if (step === "custom" && hasCustomForm) {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleCustomFormContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold mb-2">
              {selectedServiceType?.name}
            </h2>
            {selectedServiceType?.description && (
              <p className="text-sm text-muted-foreground">
                {selectedServiceType.description}
              </p>
            )}
          </div>

          {sortedFormFields.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              value={getFieldValue(field)}
              onChange={(val) => setFieldValue(field, val)}
            />
          ))}

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setStep("type")}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button type="submit" className="flex-1">
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  // ─── RENDER: Default info step ─────────────────────────────────────────────

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

  // ─── RENDER: Default datetime step ─────────────────────────────────────────

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

  // ─── RENDER: Service type selection (first step) ───────────────────────────

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
          <h2 className="text-xl font-semibold mb-2">Select Service Type</h2>
          <p className="text-sm text-muted-foreground">
            Choose the service you&apos;d like to book
          </p>
        </div>

        {serviceTypes.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No service types available for this business.</p>
          </div>
        ) : serviceTypes.length === 1 ? (
          // Auto-select if only one service type
          (() => {
            if (!serviceTypeId && serviceTypes[0]) {
              // Use effect-like pattern: set and continue
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
                {serviceTypes[0].requiresPayment && serviceTypes[0].amount && (
                  <p className="text-sm font-medium text-primary">
                    ${serviceTypes[0].amount.toFixed(2)}
                  </p>
                )}
              </div>
            );
          })()
        ) : (
          <Field>
            <FieldLabel>Service Type</FieldLabel>
            <Select
              value={serviceTypeId}
              onValueChange={setServiceTypeId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a service type" />
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
                          - ${serviceType.amount.toFixed(2)}
                        </span>
                      )}
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
            {selectedServiceType?.requiresPayment &&
              selectedServiceType?.amount && (
                <p className="text-sm font-medium mt-2 text-primary">
                  Payment required: ${selectedServiceType.amount.toFixed(2)}
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
