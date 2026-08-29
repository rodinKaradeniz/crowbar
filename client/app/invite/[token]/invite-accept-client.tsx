"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  AuthField,
  AuthNotice,
  RevealToggle,
} from "@/components/auth/auth-field";
import {
  AuthMark,
  AuthPage,
  AuthPanel,
  AuthSplit,
} from "@/components/auth/auth-shell";
import {
  gradePassword,
  PASSWORD_MIN_LENGTH,
  PasswordStrength,
} from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { capabilitiesFor, roleLabel } from "@/lib/permissions";

interface Props {
  invite: {
    email: string;
    role: string;
    business_name: string;
  };
}

/**
 * Accept a staff invitation — §03 of the Auth canvas.
 *
 * THE ONLY PRE-SIGN-IN SCREEN THAT MAY NAME A VENUE. The tokenised link carries
 * it, so showing it is not a leak; every other auth screen says nothing about
 * any tenant.
 *
 * The panel lists what the role opens. Those areas come from the real
 * capability matrix in `lib/permissions.ts`, not from a fixed list: the canvas
 * shows a bartender with three areas, and the real `bar_kitchen` role holds
 * more than that. Telling someone their workspace is smaller than it is would
 * be its own kind of wrong.
 */
export default function InviteAcceptClient({ invite }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verdict = gradePassword(password);
  const canSubmit =
    !isSubmitting &&
    name.trim().length > 0 &&
    password.length >= PASSWORD_MIN_LENGTH;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(inviteFailureMessage(data.code, data.error));
        return;
      }

      router.push("/business/overview");
    } catch {
      setError(
        "Crowbar is not answering from this device. Your account was not created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage>
      <AuthSplit
        panel={
          <AuthPanel>
            <AuthMark />

            <div>
              <p className="mkt-kicker mb-4 tracking-[0.14em] text-primary">
                Invitation
              </p>
              <h1 className="auth-panel-h-sm mb-[18px]">
                You were added to
                <br />
                {invite.business_name}.
              </h1>
              <div className="flex flex-wrap gap-2">
                <span className="mkt-chip rounded-[var(--radius-2)] border border-surface-raised px-2.5 py-1.5 text-text-on-ink-2">
                  Role · {roleLabel(invite.role)}
                </span>
              </div>
            </div>

            <p className="max-w-[34ch] text-[length:var(--ui-size)] text-text-on-ink-faint">
              {workspaceSummary(invite.role)}
            </p>
          </AuthPanel>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="auth-title-sm mb-2">Pick a password</h2>
          <p className="mb-7 text-[14.5px] text-text-secondary">
            Signing in as{" "}
            <strong className="font-semibold">{invite.email}</strong>
          </p>

          {error ? (
            <AuthNotice>
              <p className="text-[13.5px] leading-[1.45]">{error}</p>
            </AuthNotice>
          ) : null}

          <AuthField
            label="Your name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            hint="What the rest of the team will see on the boards."
            className="mb-4"
          />

          <div className="mb-6">
            <AuthField
              label="New password"
              type={revealed ? "text" : "password"}
              autoComplete="new-password"
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
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
            <PasswordStrength verdict={verdict} />
          </div>

          <Button
            type="submit"
            size="auth"
            className="w-full text-[15.5px] font-semibold"
            disabled={!canSubmit}
          >
            {isSubmitting ? "Joining" : `Join ${invite.business_name}`}
          </Button>

          <p className="mt-[18px] text-[13px] text-text-muted">
            This link works once and expires 72 hours after it was sent.
          </p>
        </form>
      </AuthSplit>
    </AuthPage>
  );
}

/** Says what the role actually opens, from the real capability matrix. */
function workspaceSummary(role: string): string {
  const capabilities: readonly string[] = capabilitiesFor(role);
  const areas = [
    capabilities.includes("orders.view") && "the boards",
    capabilities.includes("tabs.view") && "tabs",
    capabilities.includes("floor.view") && "the floor map",
    capabilities.includes("queue.view") && "the walk-in queue",
    capabilities.includes("reservations.view") && "reservations",
    capabilities.includes("inventory.view") && "stock",
    capabilities.includes("purchasing.view") && "purchasing",
    capabilities.includes("reports.cost") && "the money reports",
  ].filter(Boolean) as string[];

  if (areas.length === 0) {
    return "Your manager will set up what you can open before your first shift.";
  }

  const list =
    areas.length === 1
      ? areas[0]
      : `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`;

  const withoutCosts = !capabilities.includes("inventory.cost.view")
    ? " Cost prices stay with owners and managers."
    : "";

  return `Your workspace opens ${list}.${withoutCosts}`;
}

function inviteFailureMessage(code: unknown, fallback: unknown): string {
  if (code === "EMAIL_EXISTS") {
    return "There is already an account on this email. Sign in instead — the invitation is already attached to it.";
  }
  if (code === "INVITATION_EXPIRED") {
    return "This invitation has run out. Ask whoever invited you to send a new one from Staff → Invitations.";
  }
  if (code === "INVITATION_USED") {
    return "This invitation has already been accepted. Sign in with the password you set.";
  }
  return typeof fallback === "string"
    ? fallback
    : "Crowbar could not accept this invitation. Ask for a new link.";
}
