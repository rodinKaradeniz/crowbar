"use client";

import { useEffect, useState } from "react";
import { clientExchangePublicCapability, clientGetInvite } from "@/lib/client-api";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
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

  if (loading) {
    return <main className="grid min-h-screen place-items-center">Checking invitation…</main>;
  }
  if (!invite) {
    return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md text-center"><h1 className="text-xl font-semibold">Invitation unavailable</h1><p className="mt-2 text-muted-foreground">This invitation is invalid, expired, or already used.</p></div></main>;
  }
  return <InviteAcceptClient invite={invite} />;
}
