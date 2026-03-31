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
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";

type UserType = "customer" | "business";

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

  // Business fields
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPassword, setBusinessPassword] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessConfirmPassword, setBusinessConfirmPassword] = useState("");

  // Password validation errors
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  useAuth();

  const handleSlugChange = (value: string) => {
    const slugValue = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setBusinessSlug(slugValue);
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
    setApiError(null);

    // Validate passwords based on user type
    if (userType === "customer") {
      if (!validatePasswords(customerPassword, customerConfirmPassword)) {
        return;
      }
    } else {
      if (!validatePasswords(businessPassword, businessConfirmPassword)) {
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let body: Record<string, unknown>;

      if (userType === "customer") {
        body = {
          userType: "customer",
          name: customerName,
          email: customerEmail,
          phone: customerPhone || null,
          password: customerPassword,
        };
      } else {
        body = {
          userType: "business",
          name: businessName, // owner name = business name for now
          email: businessEmail,
          phone: businessPhone,
          password: businessPassword,
          businessName: businessName,
          businessSlug: businessSlug,
          businessAddress: businessAddress || null,
          businessDescription: businessDescription || null,
        };
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Registration failed");
      }

      toast.success("Account created successfully!");

      // Redirect based on user type
      if (userType === "customer") {
        router.push("/customer/overview");
      } else {
        // New business accounts always start with onboarding
        router.push("/business/onboarding");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      setApiError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
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
            // Reset business fields
            setBusinessName("");
            setBusinessSlug("");
            setBusinessEmail("");
            setBusinessPhone("");
            setBusinessAddress("");
            setBusinessDescription("");
            setBusinessPassword("");
            setBusinessConfirmPassword("");
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
            setUserType("business");
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
            userType === "business"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          Business
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">
              {userType === "customer"
                ? "Create your account"
                : "Register your business"}
            </h1>
            <p className="text-muted-foreground text-sm text-balance">
              {userType === "customer"
                ? "Sign up to start making reservations"
                : "Create an account to start managing reservations"}
            </p>
          </div>

          {/* Error Display */}
          {(passwordError || apiError) && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {passwordError || apiError}
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

          {/* Business Registration Fields */}
          {userType === "business" && (
            <>
              <Field>
                <FieldLabel htmlFor="business-name">Business Name</FieldLabel>
                <Input
                  id="business-name"
                  type="text"
                  placeholder="The Iron Horse"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    handleSlugChange(e.target.value);
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-slug">URL Slug</FieldLabel>
                <Input
                  id="business-slug"
                  type="text"
                  placeholder="the-iron-horse"
                  value={businessSlug}
                  onChange={(e) => setBusinessSlug(e.target.value)}
                  required
                />
                <FieldDescription>
                  This will be used in your reservation page URL: /reserve/
                  {businessSlug || "your-slug"}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="business-email">Email</FieldLabel>
                <Input
                  id="business-email"
                  type="email"
                  placeholder="contact@business.com"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-phone">Phone Number</FieldLabel>
                <Input
                  id="business-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-address">Address</FieldLabel>
                <Input
                  id="business-address"
                  type="text"
                  placeholder="123 Main St, City, State 12345"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-description">Description</FieldLabel>
                <Textarea
                  id="business-description"
                  placeholder="Tell customers about your business..."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  rows={4}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-password">Password</FieldLabel>
                <Input
                  id="business-password"
                  type="password"
                  placeholder="********"
                  value={businessPassword}
                  onChange={(e) => {
                    setBusinessPassword(e.target.value);
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
                <FieldLabel htmlFor="business-confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input
                  id="business-confirm-password"
                  type="password"
                  placeholder="********"
                  value={businessConfirmPassword}
                  onChange={(e) => {
                    setBusinessConfirmPassword(e.target.value);
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
                : "Register Business"}
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
