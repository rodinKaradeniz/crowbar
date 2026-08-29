"use client";

import { useState } from "react";
import Link from "next/link";

import { AuthField, AuthNotice } from "@/components/auth/auth-field";
import { AuthMark, BackToSignIn } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

/**
 * Forgot password → link sent. Two states in one screen.
 *
 * The canvas's sent state names the address and both times ("Check
 * marisol@zureiche.de · The link expires at 20:24"). The address is real — the
 * operator just typed it. The expiry is NOT returned by the API, so the copy
 * says the window rather than a wall-clock time it cannot know.
 *
 * The response is deliberately the same whether or not the address belongs to
 * an account: telling a stranger which emails are staff accounts is a leak.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
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
        setError(
          response.status === 429
            ? "Too many requests from here. Wait a few minutes, then try once more."
            : "Crowbar could not send the link. Try again in a moment.",
        );
        return;
      }
      setSentTo(email);
    } catch {
      setError(
        "Crowbar is not answering from this device. Check the connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <>
        <AuthMark tone="brand" size="sm" />

        <div className="mt-9 mb-6 border-l-2 border-primary bg-brand-wash-2 px-4 py-3.5">
          <p className="type-label text-primary">Link sent</p>
        </div>

        <h1 className="auth-title-sm mb-2.5">Check {sentTo}</h1>
        <p className="mb-6 max-w-[40ch] text-[14.5px] text-text-secondary">
          The link works once and expires an hour after it was sent. If it
          hasn&apos;t arrived in two minutes, look in spam, then try again.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="tablet"
            variant="secondary"
            onClick={() => setSentTo(null)}
          >
            Send again
          </Button>
          <BackToSignIn label="Back to sign in" />
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
      <AuthMark tone="brand" size="sm" />

      <h1 className="auth-title-sm mt-9 mb-2.5">Reset your password</h1>
      <p className="mb-6 max-w-[38ch] text-[14.5px] text-text-secondary">
        We&apos;ll send a link that works for one hour. Use the address you use
        for the venue.
      </p>

      {error ? (
        <AuthNotice>
          <p className="text-[13.5px] leading-[1.45]">{error}</p>
        </AuthNotice>
      ) : null}

      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="du@lokal.de"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={submitting}
        className="mb-5"
      />

      <Button
        type="submit"
        size="auth"
        className="w-full text-[15.5px] font-semibold"
        disabled={submitting}
      >
        {submitting ? "Sending" : "Send the link"}
      </Button>

      <Link
        href="/auth/login"
        className="mt-auto inline-flex h-11 items-center pt-6 text-[length:var(--ui-size)] text-text-secondary hover:text-primary"
      >
        ← Back to sign in
      </Link>
    </form>
  );
}
