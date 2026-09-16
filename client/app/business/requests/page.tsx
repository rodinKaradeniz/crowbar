import { redirect } from "next/navigation";

/**
 * Requests is a tab of the reservations workspace now, not a route of its own —
 * it was always the same rows as the book in a different status, sharing the
 * table, the filter and the reschedule dialog with it.
 *
 * The redirect stays rather than the directory being deleted outright: this
 * path is in operators' bookmarks and in the "Booking settings" link on the
 * requests empty state, and a 404 is a worse answer than the tab they wanted.
 */
export default function RequestsPage() {
  redirect("/business/reservations?tab=requests");
}
