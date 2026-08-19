import ManageWaitlistClient from "./manage-waitlist-client";

export default async function ManageWaitlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManageWaitlistClient token={token} />;
}
