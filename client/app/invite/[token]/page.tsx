import { clientGetInvite } from "@/lib/client-api";
import InviteAcceptClient from "./invite-accept-client";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const invite = await clientGetInvite(token);

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-8 text-center border rounded-lg bg-card">
          <h1 className="text-xl font-semibold mb-2">Invitation not found</h1>
          <p className="text-muted-foreground">
            This invitation link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  return <InviteAcceptClient token={token} invite={invite} />;
}
