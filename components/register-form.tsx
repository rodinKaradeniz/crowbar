"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

type UserType = "customer" | "venue";

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [userType, setUserType] = useState<UserType>("customer");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Customer fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerConfirmPassword, setCustomerConfirmPassword] = useState("");

  // Venue fields
  const [venueName, setVenueName] = useState("");
  const [venueSlug, setVenueSlug] = useState("");
  const [venueEmail, setVenueEmail] = useState("");
  const [venuePassword, setVenuePassword] = useState("");
  const [venuePhone, setVenuePhone] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueDescription, setVenueDescription] = useState("");
  const [venueConfirmPassword, setVenueConfirmPassword] = useState("");

  // Password validation errors
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSlugChange = (value: string) => {
    const slugValue = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setVenueSlug(slugValue);
  };

  const validatePasswords = (
    password: string,
    confirmPassword: string
  ): boolean => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      return false;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    // Validate passwords based on user type
    if (userType === "customer") {
      if (!validatePasswords(customerPassword, customerConfirmPassword)) {
        return;
      }
    } else {
      if (!validatePasswords(venuePassword, venueConfirmPassword)) {
        return;
      }
    }

    setIsSubmitting(true);

    // TODO: Implement registration logic
    if (userType === "customer") {
      console.log("Register customer:", {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        password: customerPassword, // Only submit password, not confirmPassword
      });
    } else {
      console.log("Register venue:", {
        name: venueName,
        slug: venueSlug,
        email: venueEmail,
        phone: venuePhone,
        address: venueAddress,
        description: venueDescription,
        password: venuePassword, // Only submit password, not confirmPassword
      });
    }

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitting(false);

    // Redirect to login
    router.push("/auth/login");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {/* User Type Toggle */}
      <div className="flex gap-2 rounded-lg border p-1">
        <button
          type="button"
          onClick={() => {
            setUserType("customer");
            setPasswordError(null);
            // Reset venue fields
            setVenueName("");
            setVenueSlug("");
            setVenueEmail("");
            setVenuePhone("");
            setVenueAddress("");
            setVenueDescription("");
            setVenuePassword("");
            setVenueConfirmPassword("");
          }}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            userType === "customer"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          Customer
        </button>
        <button
          type="button"
          onClick={() => {
            setUserType("venue");
            setPasswordError(null);
            // Reset customer fields
            setCustomerName("");
            setCustomerEmail("");
            setCustomerPhone("");
            setCustomerPassword("");
            setCustomerConfirmPassword("");
          }}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            userType === "venue"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          Venue
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">
              {userType === "customer"
                ? "Create your account"
                : "Register your venue"}
            </h1>
            <p className="text-muted-foreground text-sm text-balance">
              {userType === "customer"
                ? "Sign up to start making reservations"
                : "Create an account to start managing reservations"}
            </p>
          </div>

          {/* Password Error Display */}
          {passwordError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {passwordError}
            </div>
          )}

          {/* Customer Registration Fields */}
          {userType === "customer" && (
            <>
              <Field>
                <FieldLabel htmlFor="customer-name">Full Name</FieldLabel>
                <Input
                  id="customer-name"
                  type="text"
                  placeholder="John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-email">Email</FieldLabel>
                <Input
                  id="customer-email"
                  type="email"
                  placeholder="john@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-phone">Phone Number</FieldLabel>
                <Input
                  id="customer-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <FieldDescription>
                  We'll use this to send you reservation confirmations
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-password">Password</FieldLabel>
                <Input
                  id="customer-password"
                  type="password"
                  placeholder="********"
                  value={customerPassword}
                  onChange={(e) => {
                    setCustomerPassword(e.target.value);
                    // Clear error when user starts typing
                    if (passwordError) setPasswordError(null);
                  }}
                  required
                />
                <FieldDescription>
                  Must be at least 8 characters long
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input
                  id="customer-confirm-password"
                  type="password"
                  placeholder="********"
                  value={customerConfirmPassword}
                  onChange={(e) => {
                    setCustomerConfirmPassword(e.target.value);
                    // Clear error when user starts typing
                    if (passwordError) setPasswordError(null);
                  }}
                  required
                />
              </Field>
            </>
          )}

          {/* Venue Registration Fields */}
          {userType === "venue" && (
            <>
              <Field>
                <FieldLabel htmlFor="venue-name">Venue Name</FieldLabel>
                <Input
                  id="venue-name"
                  type="text"
                  placeholder="The Iron Horse"
                  value={venueName}
                  onChange={(e) => {
                    setVenueName(e.target.value);
                    handleSlugChange(e.target.value);
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-slug">URL Slug</FieldLabel>
                <Input
                  id="venue-slug"
                  type="text"
                  placeholder="the-iron-horse"
                  value={venueSlug}
                  onChange={(e) => setVenueSlug(e.target.value)}
                  required
                />
                <FieldDescription>
                  This will be used in your reservation page URL: /reserve/
                  {venueSlug || "your-slug"}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-email">Email</FieldLabel>
                <Input
                  id="venue-email"
                  type="email"
                  placeholder="contact@venue.com"
                  value={venueEmail}
                  onChange={(e) => setVenueEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-phone">Phone Number</FieldLabel>
                <Input
                  id="venue-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={venuePhone}
                  onChange={(e) => setVenuePhone(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-address">Address</FieldLabel>
                <Input
                  id="venue-address"
                  type="text"
                  placeholder="123 Main St, City, State 12345"
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-description">Description</FieldLabel>
                <Textarea
                  id="venue-description"
                  placeholder="Tell customers about your venue..."
                  value={venueDescription}
                  onChange={(e) => setVenueDescription(e.target.value)}
                  rows={4}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-password">Password</FieldLabel>
                <Input
                  id="venue-password"
                  type="password"
                  placeholder="********"
                  value={venuePassword}
                  onChange={(e) => {
                    setVenuePassword(e.target.value);
                    // Clear error when user starts typing
                    if (passwordError) setPasswordError(null);
                  }}
                  required
                />
                <FieldDescription>
                  Must be at least 8 characters long
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="venue-confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input
                  id="venue-confirm-password"
                  type="password"
                  placeholder="********"
                  value={venueConfirmPassword}
                  onChange={(e) => {
                    setVenueConfirmPassword(e.target.value);
                    // Clear error when user starts typing
                    if (passwordError) setPasswordError(null);
                  }}
                  required
                />
              </Field>
            </>
          )}

          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? "Creating Account..."
                : userType === "customer"
                ? "Create Account"
                : "Register Venue"}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            Already have an account?{" "}
            <Link href="/auth/login" className="underline underline-offset-4">
              Login
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  );
}
