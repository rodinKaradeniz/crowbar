/**
 * What the guest is agreeing to, opened in place on the review step.
 *
 * IT WAS A `Dialog`, AND THAT WAS THE WRONG PRIMITIVE. docs/DESIGN.md reserves
 * the dialog for "decisions that end a shift or cannot be undone" at 330–420px;
 * this is four sections of policy prose, and it shipped at `max-w-2xl`. It also
 * put an overlay in the middle of the one step whose entire job is letting the
 * guest read before they tick a box.
 *
 * A native `<details>`, for the same reasons the landing FAQ is one: it is
 * keyboard operable and announced as expandable with no state to hold, and the
 * content stays in the flow of the step rather than covering it.
 *
 * THE COPY IS COMPLIANCE TEXT AND IS UNCHANGED. It states the controller /
 * processor split, separates operational messages from marketing consent, and
 * claims no universal retention period — see docs/PRODUCT.md and
 * `write-crowbar-operational-copy`. Edit it there, not here.
 */
export function BookingPrivacyDisclosure() {
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-[var(--space-8)] py-[var(--space-12)] text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        {/* One glyph rotated off the parent's open state — no second icon to
            keep in sync, and nothing to track in React. */}
        <svg
          className="size-3 shrink-0 transition-transform group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
          aria-hidden
        >
          <path d="M4.5 2.5L8 6l-3.5 3.5" />
        </svg>
        <span className="type-label">What you are agreeing to</span>
      </summary>

      <div className="space-y-[var(--space-16)] pb-[var(--space-16)]">
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
    </details>
  );
}
