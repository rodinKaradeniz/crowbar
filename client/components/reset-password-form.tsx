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

const PASSWORD_MIN_LENGTH = 12;

export function ResetPasswordForm({
  token,
  className,
  ...props
}: React.ComponentProps<"form"> & { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("This password reset link is incomplete.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/backend/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.detail === "string" ? body.detail : "This reset link is invalid or expired.");
        return;
      }
      setComplete(true);
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
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm text-balance">Choose a new password for your staff account.</p>
        </div>
        {complete ? (
          <p className="rounded-md bg-primary/10 p-3 text-sm" role="status">Your password has been updated. All earlier sessions were signed out.</p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input id="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <FieldDescription>Use {PASSWORD_MIN_LENGTH}–128 characters.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
              <Input id="confirmPassword" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
            </Field>
          </>
        )}
        {error && <p className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">{error}</p>}
        {!complete && <Field><Button type="submit" className="w-full" disabled={submitting || !token}>{submitting ? "Resetting…" : "Reset password"}</Button></Field>}
        <FieldDescription className="text-center"><Link href="/auth/login" className="underline underline-offset-4">Back to login</Link></FieldDescription>
      </FieldGroup>
    </form>
  );
}
