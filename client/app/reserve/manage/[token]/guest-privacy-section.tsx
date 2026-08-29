"use client";

import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  clientCreateGuestPrivacyRequest,
  clientGetGuestPrivacyState,
  type GuestPrivacyState,
} from "@/lib/client-api";

/**
 * What the guest can do about their own data, on the page they already have.
 *
 * Deliberately attached to the reservation-management link rather than given
 * its own login: the guest proves who they are by holding a link the venue
 * issued them, and adding a second identity mechanism would mean a second thing
 * to get wrong.
 *
 * It fails quiet. A guest whose link no longer resolves is already being told
 * so by the page around this; repeating it here would be noise, and there is
 * nothing they could do about it from here anyway.
 */
export function GuestPrivacySection() {
  const [state, setState] = useState<GuestPrivacyState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void clientGetGuestPrivacyState()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (!state) return null;

  const consented = Object.entries(state.marketingConsent).filter(
    ([, value]) => value,
  );

  async function run(kind: "withdraw_consent" | "export" | "deletion") {
    setBusy(kind);
    setError(null);
    try {
      const response = await clientCreateGuestPrivacyRequest(kind);
      setResult(response.message);
      if (kind === "withdraw_consent") {
        setState(await clientGetGuestPrivacyState());
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That could not be recorded. Please contact the venue.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="font-semibold">Your data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This venue is responsible for the information it holds about you.
      </p>

      <p className="mt-4 text-sm">
        {consented.length > 0 ? (
          <>
            You currently receive marketing from this venue by{" "}
            <strong>{consented.map(([channel]) => channel).join(" and ")}</strong>.
          </>
        ) : (
          "You do not receive marketing from this venue."
        )}
      </p>

      {result && (
        <p className="mt-3 flex items-start gap-2 border-l-2 border-primary bg-brand-wash-2 p-3 text-[length:var(--ui-size)] text-primary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 border-l-2 border-critical-fill bg-critical-tint p-3 text-[length:var(--ui-size)] text-critical-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {consented.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void run("withdraw_consent")}
          >
            {busy === "withdraw_consent" ? "Saving…" : "Stop marketing messages"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void run("export")}
        >
          {busy === "export" ? "Sending…" : "Request a copy of my data"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void run("deletion")}
        >
          {busy === "deletion" ? "Sending…" : "Request deletion"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Stopping marketing takes effect straight away. Copies and deletions are
        actioned by the venue, so they are not instant — you will hear back from
        them directly. Messages about a booking you made are not marketing and
        will still be sent.
      </p>

      {(state.privacyContact || state.privacyPolicyUrl) && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Mail className="size-3.5 shrink-0" aria-hidden />
          {state.privacyContact && <span>{state.privacyContact}</span>}
          {state.privacyPolicyUrl && (
            <a
              href={state.privacyPolicyUrl}
              className="underline underline-offset-2"
              target="_blank"
              rel="noreferrer noopener"
            >
              Privacy policy
            </a>
          )}
        </p>
      )}
    </section>
  );
}
