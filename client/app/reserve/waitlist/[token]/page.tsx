import AcceptWaitlistOfferClient from "./accept-waitlist-offer-client";

export default async function AcceptWaitlistOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptWaitlistOfferClient token={token} />;
}
