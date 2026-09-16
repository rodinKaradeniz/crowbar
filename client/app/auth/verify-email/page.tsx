"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { AuthCard, AuthPage, BackToSignIn } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import { clientExchangePublicCapability } from "@/lib/client-api";

type Outcome =
  | { state: "working" }
  | { state: "confirmed"; email: string }
  | { state: "dead" }
  | { state: "taken" };

/**
 * Confirms the address a verification link was mailed to.
 *
 * Confirms on open rather than behind a button. The raw token lives in the URL
 * FRAGMENT, so it never reaches a server log or a Referer header, and reading
 * it needs JavaScript — which is also what stops a mail scanner following the
 * link from confirming the address on the recipient's behalf.
 *
 * Two steps, both invisible: exchange the fragment token for a short-lived
 * httpOnly cookie, then POST the confirmation with no token in the body. Same
 * shape as /auth/reset-password and /invite.
 *
 * This screen never names the venue. The tokenised invitation link is the one
 * pre-sign-in screen allowed to do that; this one is about an address.
 */
export default function VerifyEmailPage() {
  const [outcome, setOutcome] = useState<Outcome>({ state: "working" });

  useEffect(() => {
    const token = consumeCapabilityFragment();
    void (async () => {
      try {
        // A link with no fragment is a link that was mangled in transit or
        // already opened once — the same dead end as an expired token.
        if (!token) {
          setOutcome({ state: "dead" });
          return;
        }
        await clientExchangePublicCapability("email_verify", token);
        const response = await fetch("/api/backend/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const code =
            typeof body.detail === "object" && body.detail !== null
              ? (body.detail as { code?: unknown }).code
              : undefined;
          setOutcome({ state: code === "EMAIL_EXISTS" ? "taken" : "dead" });
          return;
        }
        const body = (await response.json()) as { email: string };
        setOutcome({ state: "confirmed", email: body.email });
      } catch {
        setOutcome({ state: "dead" });
      }
    })();
  }, []);

  // Mirrors the shape it is about to become, so the card does not jump.
  if (outcome.state === "working") {
    return (
      <AuthPage>
        <div className="mx-auto w-full max-w-[440px]">
          <AuthCard>
            <BrandMark tone="brand" size="sm" />
            <Skeleton className="mt-9 h-[1em] w-24" />
            <Skeleton className="mt-4 h-[1.6em] w-3/4" index={1} />
            <Skeleton className="mt-3 h-[1em] w-full" index={2} />
            <Skeleton className="mt-8 h-12 w-full" index={3} />
            <span className="sr-only">Confirming this address</span>
          </AuthCard>
        </div>
      </AuthPage>
    );
  }

  // A link that is broken right now — critical, on ink, with a route out.
  if (outcome.state === "dead") {
    return (
      <AuthPage>
        <div className="mx-auto w-full max-w-[440px]">
          <AuthCard ground="ink">
            <BrandMark tone="critical" size="sm" />
            <p className="type-label mt-9 mb-3.5 text-critical-text">
              Link expired · 24 h
            </p>
            <h1 className="auth-title-sm mb-3">
              This confirmation link has already been used or has run out.
            </h1>
            <p className="mb-6 max-w-[40ch] text-[14.5px] text-muted-foreground">
              Sign in and ask for a new one from Settings → Account. Your
              account still works in the meantime.
            </p>
            <BackToSignIn label="Sign in" />
          </AuthCard>
        </div>
      </AuthPage>
    );
  }

  // The address was free when the change was asked for and is not any more.
  // Nothing changed, and saying so is the whole job of this state.
  if (outcome.state === "taken") {
    return (
      <AuthPage>
        <div className="mx-auto w-full max-w-[440px]">
          <AuthCard ground="ink">
            <BrandMark tone="critical" size="sm" />
            <p className="type-label mt-9 mb-3.5 text-critical-text">
              Address taken
            </p>
            <h1 className="auth-title-sm mb-3">
              Another account has since claimed that address.
            </h1>
            <p className="mb-6 max-w-[40ch] text-[14.5px] text-muted-foreground">
              Your account was not changed and still uses the address it had.
              Sign in and try a different one from Settings → Account.
            </p>
            <BackToSignIn label="Sign in" />
          </AuthCard>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <div className="mx-auto w-full max-w-[440px]">
        <AuthCard ground="brand">
          <BrandMark tone="paper" size="sm" />
          <p className="type-label mt-9 mb-3.5 text-[var(--brand-lit-soft)]">
            Address confirmed
          </p>
          <h1 className="mb-3 font-display text-[clamp(26px,2.6vw,34px)] font-extrabold leading-none tracking-[-0.032em]">
            You&apos;re confirmed.
          </h1>
          <p className="mb-7 max-w-[34ch] text-[15px] text-[var(--brand-lit-faint)]">
            {outcome.email} can now be used to recover this account.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="tablet"
              className="border-paper bg-paper text-primary hover:bg-[var(--white)]"
            >
              <a href="/business/overview">Open the workspace</a>
            </Button>
          </div>
        </AuthCard>
      </div>
    </AuthPage>
  );
}
