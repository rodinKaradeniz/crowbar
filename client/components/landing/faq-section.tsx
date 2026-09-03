import Link from "next/link";

type Faq = {
  question: string;
  /** Two paragraphs where the answer needs them; the register answer does. */
  answer: string[];
  /** The register question leads, and is tinted so it reads first. */
  lead?: boolean;
};

/**
 * The practical questions, from the Landing canvas.
 *
 * FOUR ANSWERS DIVERGE FROM THE CANVAS, all for the same reason the role names
 * were corrected: a marketing page may not claim a capability the product does
 * not have. Each is noted at the item.
 */
const FAQS: Faq[] = [
  {
    question: "Does this replace my register?",
    lead: true,
    answer: [
      "No. Crowbar does not take money, run a till, or produce any fiscal document. Your register stays the payment and fiscal authority, exactly as it is today.",
      "What Crowbar does is keep the tab — what the table ordered and what it comes to — and record that a member of staff marked it settled externally, with their name and the time. Your register does the settling; Crowbar knows the table is done and free.",
    ],
  },
  {
    // CORRECTED. The canvas answered "Staff devices keep taking orders and
    // seating tables, and sync the moment the connection returns." There is no
    // offline outbox in this client — nothing is queued locally when the socket
    // drops — which is the same reason the offline bar omits a held count. The
    // claim is removed rather than softened.
    question: "What happens when the internet drops?",
    answer: [
      "Every live board that loses contact says so in a way you cannot miss — a board that quietly stops updating is worse than no board. Staff keep serving from what is on screen, and the boards catch up the moment the connection returns. Taking orders on a device with no connection is not something Crowbar does yet.",
    ],
  },
  {
    question: "Do guests have to download an app?",
    answer: [
      "No. Booking, the queue and the menu are ordinary web pages behind a QR code.",
    ],
  },
  {
    // CORRECTED. The canvas said "Upload the menu as a spreadsheet." There is
    // no import endpoint; the menu is entered in the menu editor.
    question: "How long does setup take?",
    answer: [
      "An afternoon. Set your hours, draw your floor, enter the menu and give your drinks their recipes. We'll sit with you for the first one.",
    ],
  },
  {
    // CORRECTED. The canvas said "Ticket printers still work if you want them."
    // There is no printer integration anywhere in the product.
    question: "Do I need to buy hardware?",
    answer: [
      "A laptop behind the bar and a tablet in the room — whatever you already own. Nothing to buy, and nothing to install on either.",
    ],
  },
  {
    question: "My menu changes daily.",
    answer: [
      "Then you'll live in the menu editor. 86 an item in two taps; the QR menu updates before the next guest scans it.",
    ],
  },
  {
    // CORRECTED. The canvas named "owner, manager, bartender, server, host" and
    // said a bartender sees "nothing else". The real matrix in
    // `lib/permissions.ts` has different names, and bar / kitchen also holds
    // floor, queue, reservations, customers and menu.
    question: "Who on my team sees what?",
    answer: [
      "Five roles — owner, manager, host / server, bar / kitchen, and inventory operator. Each opens the screens that job needs: a bar / kitchen workspace runs the boards, the tabs and the stock, and never shows what an item costs. Cost prices and the money reports stay with owners and managers.",
    ],
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      className="mkt-anchor mkt-sec-faq ground-ink bg-background text-foreground"
    >
      {/* Full-bleed band, `.mkt-shell` content — see the note on `.mkt-shell`. */}
      <div className="mkt-shell mkt-gap-faq flex flex-wrap">
        <div className="settle min-w-[min(100%,280px)] flex-[0_1_320px]">
          <h2 className="mkt-d2-faq mb-3.5">
            The practical
            <br />
            questions.
          </h2>
          <p className="mkt-body-sm text-muted-foreground">
            Anything else, ask a person:{" "}
            <Link
              href="mailto:hallo@crowbar.co"
              className="border-b border-border-strong"
            >
              hallo@crowbar.co
            </Link>
          </p>
        </div>

        {/*
          Seven questions with every answer open is a very long column at any
          width — on a phone the section outruns the rest of the page. Each
          item is a native `<details>`, closed by default, AT EVERY WIDTH.

          It was a phone-only accordion at first, with a media query restoring
          the old two-column row above --bp-phone. That was wrong in a way you
          could see: the row hid the +, so a desktop reader got an element that
          collapsed when clicked and gave no sign it could. One behaviour now,
          one affordance, every width.

          `<details>` rather than a client accordion: this page ships no
          JavaScript at all, and the element is already keyboard operable and
          announced as expandable. The trade is that the markup stops being a
          `<dl>` — a `<details>` is not a permitted child of one — which costs
          the description-list semantics and buys a disclosure that works with
          scripting off. On this page that is the better half of the trade.
        */}
        <div className="mkt-faq-list settle-2 min-w-[min(100%,320px)] flex-[1_1_520px] border-t border-border-strong">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className={
                faq.lead
                  ? "mkt-faq-item mkt-faq-item-lead border-b border-border bg-surface"
                  : "mkt-faq-item border-b border-border"
              }
            >
              <summary className="mkt-faq-summary">
                <span className="mkt-faq-q">{faq.question}</span>
                <span className="mkt-faq-sign" aria-hidden />
              </summary>

              <div className="mkt-faq-answer">
                {faq.answer.map((paragraph, index) => (
                  <p
                    key={index}
                    className={
                      index === 0
                        ? faq.lead
                          ? "mkt-body-sm mb-2.5 text-text-on-ink-2"
                          : "mkt-body-sm text-muted-foreground"
                        : "mkt-body-sm text-text-on-ink-2"
                    }
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
