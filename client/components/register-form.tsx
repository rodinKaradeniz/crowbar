"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PASSWORD_MIN_LENGTH = 12;

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBusinessName = (value: string) => {
    setBusinessName(value);
    setBusinessSlug(
      value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ownerName,
          email,
          phone,
          password,
          businessName,
          businessSlug,
          businessAddress: address || null,
          businessDescription: description || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Registration failed");
      toast.success("Business account created");
      router.push("/business/onboarding");
      router.refresh();
    } catch (submissionError) {
      const message = submissionError instanceof Error
        ? submissionError.message
        : "Registration failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Register your venue</h1>
            <p className="text-muted-foreground text-sm text-balance">
              Create the first owner account and start venue setup.
            </p>
          </div>
          {error && <p className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">{error}</p>}
          <Field>
            <FieldLabel htmlFor="owner-name">Owner name</FieldLabel>
            <Input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-name">Business name</FieldLabel>
            <Input id="business-name" value={businessName} onChange={(event) => handleBusinessName(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-slug">Public URL slug</FieldLabel>
            <Input id="business-slug" value={businessSlug} onChange={(event) => setBusinessSlug(event.target.value)} required />
            <FieldDescription>/reserve/{businessSlug || "your-venue"}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="business-email">Staff email</FieldLabel>
            <Input id="business-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-phone">Venue phone</FieldLabel>
            <Input id="business-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-address">Address</FieldLabel>
            <Input id="business-address" autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-description">Description</FieldLabel>
            <Textarea id="business-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </Field>
          <Field>
            <FieldLabel htmlFor="business-password">Password</FieldLabel>
            <Input id="business-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={128} required />
            <FieldDescription>Use {PASSWORD_MIN_LENGTH}–128 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="business-confirm-password">Confirm password</FieldLabel>
            <Input id="business-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={128} required />
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating venue…" : "Register venue"}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            Already have a staff account?{" "}<Link href="/auth/login" className="underline underline-offset-4">Log in</Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  );
}
