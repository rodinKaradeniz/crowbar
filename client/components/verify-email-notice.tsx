"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { clientResendVerification } from "@/lib/client-api";

const DISMISS_KEY = "crowbar.verify-email-dismissed";

/**
 * Asks an owner to confirm their email address, and says so once they have
 * asked to move to a new one.
 *
 * NEUTRAL, DELIBERATELY. An unverified address is not one of the four critical
 * cases, so this is not `--critical-fill` and not a pinned header band — that
 * placement is critical-only, and the offline bar is the one alarm in the
 * system. This is the brand-wash left-rule notice, the same object as
 * `AuthNotice tone="brand"`, on the ink ground the workspace uses.
 *
 * A PROMPT, NOT A WALL. Login is not gated on verification: email delivery is
 * not dependable enough in the pilot environment to risk locking an owner out
 * of their own venue over an undelivered message. Pressure, not a lock.
 *
 * Dismissal lasts the browser session, so it stops nagging across a shift but
 * returns at the next sign-in. It is per-browser and never leaves the device;
 * the account state that matters lives on the user row.
 */
export function VerifyEmailNotice() {
  const { meContext } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [sending, setSending] = useState(false);

  // Read after mount: sessionStorage does not exist during the server render,
  // and starting dismissed means the notice fades in rather than flashing out.
  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const user = meContext?.user;
  if (!user) return null;

  const pending = user.pendingEmail;
  if (user.emailVerified && !pending) return null;
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // A browser refusing storage still gets the notice dismissed for this
      // view; it simply returns on the next navigation. Not worth an error.
    }
  };

  const resend = async () => {
    setSending(true);
    try {
      await clientResendVerification();
      toast.success(`Confirmation link sent to ${pending ?? user.email}.`);
    } catch {
      toast.error("Crowbar could not send the link. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-[var(--space-12)] border-l-2 border-primary bg-secondary px-[var(--space-16)] py-[var(--space-12)]"
      role="status"
    >
      <span className="type-label shrink-0 text-primary">
        {pending ? "Change pending" : "Unconfirmed address"}
      </span>

      <span className="min-w-0 text-[length:var(--ui-size)] text-foreground">
        {pending
          ? `Confirm ${pending} to finish moving your account. It still uses ${user.email} until you do.`
          : `Confirm ${user.email} so it can be used to recover this account.`}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-[var(--space-8)]">
        <Button
          variant="secondary"
          size="filter"
          onClick={resend}
          disabled={sending}
        >
          {sending ? "Sending" : "Send the link again"}
        </Button>
        <Button variant="ghost" size="filter" onClick={dismiss}>
          Not now
        </Button>
      </span>
    </div>
  );
}
