import ManageReservationClient from "./manage-reservation-client";

export default async function ManageReservationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManageReservationClient token={token} />;
}
