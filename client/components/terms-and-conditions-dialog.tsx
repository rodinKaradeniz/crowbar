"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TermsAndConditionsDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Venue booking and privacy information</DialogTitle>
          <DialogDescription>
            The venue&apos;s configured policy governs this public booking flow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm text-muted-foreground">
          <section>
            <h3 className="mb-2 font-semibold text-foreground">Who handles your data</h3>
            <p>
              The venue is the data controller. Crowbar acts as its software
              processor for reservations and related venue operations. Use the
              venue privacy contact or policy shown on its public page for data
              rights requests and policy details.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-foreground">Operational messages</h3>
            <p>
              Contact details may be used for confirmations, reminders, queue
              calls, and material booking updates. These operational messages
              are not marketing consent. Optional email and SMS marketing
              choices are recorded separately and can be declined.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-foreground">Venue policies</h3>
            <p>
              Availability, confirmation, arrival, cancellation, and service
              decisions belong to the venue. Contact the venue if a booking has
              started or a private management link is no longer valid.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-foreground">Retention</h3>
            <p>
              Personal data is retained or anonymised according to the venue&apos;s
              configured retention policy and any applicable obligations. This
              screen does not claim a universal retention period.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
