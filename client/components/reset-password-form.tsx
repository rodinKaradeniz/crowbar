"use client";

import { useEffect, useState } from "react";

import {
  AuthField,
  AuthNotice,
  RevealToggle,
} from "@/components/auth/auth-field";
import { AuthCard, AuthMark, BackToSignIn } from "@/components/auth/auth-shell";
import {
  gradePassword,
  PASSWORD_MIN_LENGTH,
  PasswordStrength,
} from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import { clientExchangePublicCapability } from "@/lib/client-api";

/**
 * Set a new password — §06 of the Auth canvas.
 *
 * The minimum is 12, not the canvas's 10: `PASSWORD_MIN_LENGTH` is what the
 * server actually enforces, and a form that promises a laxer rule than the API
 * fails the operator at submit rather than at the field.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  // The strength meter must not call a password invalid before the person
  // has finished typing it. See components/auth/password-strength.tsx.
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const [capabilityReady, setCapabilityReady] = useState(false);

  useEffect(() => {
    const token = consumeCapabilityFragment();
    if (!token) {
      setLinkDead(true);
      return;
    }
    void clientExchangePublicCapability("password_reset", token)
      .then(() => setCapabilityReady(true))
      .catch(() => setLinkDead(true));
  }, []);

  const verdict = gradePassword(password);
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSubmit =
    capabilityReady &&
    !submitting &&
    password.length >= PASSWORD_MIN_LENGTH &&
    confirmation === password;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/backend/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(
          typeof body.detail === "string"
            ? body.detail
            : "This link has already been used or has run out. Ask for a new one.",
        );
        return;
      }
      setComplete(true);
    } catch {
      setError(
        "Crowbar is not answering from this device. Your password was not changed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (linkDead) {
    return (
      <AuthCard ground="ink">
        <AuthMark tone="critical" size="sm" />
        <p className="type-label mt-9 mb-3.5 text-critical-text">
          Link expired
        </p>
        <h1 className="auth-title-sm mb-3">
          This reset link has already been used or has run out.
        </h1>
        <p className="mb-6 max-w-[40ch] text-[14.5px] text-muted-foreground">
          Ask for a new one from the sign-in screen. It takes a few seconds and
          the new link works for an hour.
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-3">
          <Button asChild size="tablet">
            <a href="/auth/forgot-password">Request a new link</a>
          </Button>
          <BackToSignIn label="Sign in instead" />
        </div>
      </AuthCard>
    );
  }

  if (complete) {
    return (
      <AuthCard ground="brand">
        <AuthMark tone="paper" size="sm" />
        <p className="type-label mt-9 mb-3.5 text-[var(--brand-lit-soft)]">
          Password saved
        </p>
        <h1 className="mb-3 font-display text-[clamp(26px,2.6vw,34px)] font-extrabold leading-none tracking-[-0.032em]">
          You&apos;re in.
        </h1>
        <p className="mb-7 max-w-[34ch] text-[15px] text-[var(--brand-lit-faint)]">
          Every other device signed in as you was signed out. Open the workspace
          and carry on.
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-3">
          <Button
            asChild
            size="tablet"
            className="border-paper bg-paper text-primary hover:bg-[var(--white)]"
          >
            <a href="/auth/login">Sign in</a>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form onSubmit={handleSubmit} noValidate>
        <AuthMark tone="brand" size="sm" />
        <h1 className="auth-title-sm mt-8 mb-5">Set a new password</h1>

        {error ? (
          <AuthNotice>
            <p className="text-[13.5px] leading-[1.45]">{error}</p>
          </AuthNotice>
        ) : null}

        <div className="mb-4">
          <AuthField
            label="New password"
            type={revealed ? "text" : "password"}
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setPasswordTouched(true)}
            required
            maxLength={128}
            disabled={submitting || !capabilityReady}
            invalid={verdict.tone === "invalid"}
            trailing={
              password.length > 0 ? (
                <RevealToggle
                  shown={revealed}
                  onToggle={() => setRevealed((shown) => !shown)}
                />
              ) : undefined
            }
          />
          <PasswordStrength verdict={verdict} touched={passwordTouched} />
        </div>

        <AuthField
          label="Confirm"
          type={revealed ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat it"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          maxLength={128}
          disabled={submitting || !capabilityReady}
          invalid={mismatch}
          hint={mismatch ? "The two don't match yet." : undefined}
          className="mb-[22px]"
        />

        <Button
          type="submit"
          size="auth"
          className="w-full text-[15.5px] font-semibold"
          disabled={!canSubmit}
        >
          {submitting ? "Saving" : "Save and sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
