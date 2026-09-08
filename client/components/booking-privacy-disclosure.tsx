import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * What the guest is agreeing to, read in a dialog over the review step.
 *
 * IT WAS A `Dialog`, THEN A NATIVE `<details>`, AND IT IS A DIALOG AGAIN. The
 * de-modaling was correct against the contract as it then stood — docs/DESIGN.md
 * reserved the dialog for "decisions that end a shift or cannot be undone" — and
 * it was reversed by owner decision. The contract now carries the second,
 * narrower use this is: a READING dialog, for policy or reference text someone
 * must be able to read without losing their place in the flow behind it. It runs
 * wider than the 330–420px decision dialog, capped at a reading measure; it
 * scrolls internally; its only action is dismissal; it carries no decision. The
 * decision to agree stays on the checkbox behind it.
 *
 * The trigger is the phrase itself: the "terms and conditions" inside the
 * agreement sentence, underlined the way inline prose links are elsewhere. It
 * replaced a chevroned summary row below the checkbox, which read as a
 * disclosure dropdown and named the policy a second time. It sits OUTSIDE the
 * checkbox's `<label>` — a button inside a label toggles the box on the way to
 * opening the dialog.
 *
 * THE COPY IS COMPLIANCE TEXT AND IS UNCHANGED. It states the controller /
 * processor split, separates operational messages from marketing consent, and
 * claims no universal retention period — see docs/PRODUCT.md and
 * `write-crowbar-operational-copy`. Edit it there, not here.
 */
export function BookingPrivacyDisclosure() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cursor-pointer underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          terms and conditions
        </button>
      </DialogTrigger>

      {/* The reading measure, not a width literal and not a `--grid-*` page
          width: 1024 would run this prose at about 150 characters a line. The
          same device the venue panel already uses to bound its description. */}
      <DialogContent
        className="max-w-[min(100%,58ch)]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>What you are agreeing to</DialogTitle>
        </DialogHeader>

        {/* The scroller is HERE and not on the content: the close button is
            positioned inside the content, and scrolling that would carry the
            one way out of the dialog off the top of it. */}
        <div className="max-h-[60svh] space-y-[var(--space-16)] overflow-y-auto">
          <section>
            <h3 className="type-label text-muted-foreground">Who handles your data</h3>
            <p className="mt-[var(--space-4)] text-sm leading-relaxed text-muted-foreground">
              The venue is the data controller. Crowbar acts as its software
              processor for reservations and related venue operations. Use the
              venue privacy contact or policy shown on its public page for data
              rights requests and policy details.
            </p>
          </section>
          <section>
            <h3 className="type-label text-muted-foreground">Operational messages</h3>
            <p className="mt-[var(--space-4)] text-sm leading-relaxed text-muted-foreground">
              Contact details may be used for confirmations, reminders, queue
              calls, and material booking updates. These operational messages are
              not marketing consent. Optional email and SMS marketing choices are
              recorded separately and can be declined.
            </p>
          </section>
          <section>
            <h3 className="type-label text-muted-foreground">Venue policies</h3>
            <p className="mt-[var(--space-4)] text-sm leading-relaxed text-muted-foreground">
              Availability, confirmation, arrival, cancellation, and service
              decisions belong to the venue. Contact the venue if a booking has
              started or a private management link is no longer valid.
            </p>
          </section>
          <section>
            <h3 className="type-label text-muted-foreground">Retention</h3>
            <p className="mt-[var(--space-4)] text-sm leading-relaxed text-muted-foreground">
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
