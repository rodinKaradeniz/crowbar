"use client";

import { useEffect, useState } from "react";

import { AuthCard, AuthMark, AuthPage, BackToSignIn } from "@/components/auth/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import { clientExchangePublicCapability, clientGetInvite } from "@/lib/client-api";
import InviteAcceptClient from "./[token]/invite-accept-client";

type Invite = { email: string; role: string; business_name: string };

export default function InvitePage() {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = consumeCapabilityFragment();
    const exchange = token
      ? clientExchangePublicCapability("staff_invite", token)
      : Promise.resolve();
    void exchange
      .then(() => clientGetInvite())
      .then(setInvite)
      .catch(() => setInvite(null))
      .finally(() => setLoading(false));
  }, []);

  // The loading state mirrors the shape it is about to become, so the card does
  // not jump when the invitation resolves.
  if (loading) {
    return (
      <AuthPage>
        <div className="mx-auto w-full max-w-[440px]">
          <AuthCard>
            <AuthMark tone="brand" size="sm" />
            <Skeleton className="mt-9 h-[1em] w-24" />
            <Skeleton className="mt-4 h-[1.6em] w-3/4" index={1} />
            <Skeleton className="mt-3 h-[1em] w-full" index={2} />
            <Skeleton className="mt-8 h-12 w-full" index={3} />
            <span className="sr-only">Checking this invitation</span>
          </AuthCard>
        </div>
      </AuthPage>
    );
  }

  /**
   * §05 of the canvas — a dead link, on ink. The mark turns critical because
   * the whole subject of the screen is a thing that is broken now.
   */
  if (!invite) {
    return (
      <AuthPage>
        <div className="mx-auto w-full max-w-[440px]">
          <AuthCard ground="ink">
            <AuthMark tone="critical" size="sm" />
            <p className="type-label mt-9 mb-3.5 text-critical-text">
              Link expired · 72 h
            </p>
            <h1 className="auth-title-sm mb-3">
              This invitation has already been used or has run out.
            </h1>
            <p className="mb-6 max-w-[40ch] text-[14.5px] text-muted-foreground">
              Ask whoever invited you to send a new one from Staff →
              Invitations. It takes them ten seconds.
            </p>
            <BackToSignIn label="Sign in instead" />
          </AuthCard>
        </div>
      </AuthPage>
    );
  }

  return <InviteAcceptClient invite={invite} />;
}
