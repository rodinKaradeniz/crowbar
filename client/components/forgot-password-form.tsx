"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/backend/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many requests. Try again later." : "Could not request a reset link.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not reach Crowbar. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Enter your staff email. If an active account exists, we will send a single-use reset link.
          </p>
        </div>
        {submitted ? (
          <p className="rounded-md bg-primary/10 p-3 text-sm" role="status">
            Check your inbox if that address belongs to an active staff account.
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
        )}
        {error && <p className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">{error}</p>}
        {!submitted && (
          <Field>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Requesting…" : "Send reset link"}
            </Button>
          </Field>
        )}
        <FieldDescription className="text-center">
          <Link href="/auth/login" className="underline underline-offset-4">Back to login</Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
