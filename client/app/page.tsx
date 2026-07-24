import Link from "next/link";
import Image from "next/image";
import { ArrowRight, GalleryVerticalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactDialog } from "@/components/contact-dialog";
import { FooterContactForm } from "@/components/footer-contact-form";
import { BusinessesCarouselSection } from "@/components/businesses-carousel-section";
import { LandingNavbar } from "@/components/landing-navbar";
import { LandingHero } from "@/components/landing-hero";
import { PricingModal } from "@/components/pricing-modal";
import { PhotoPanelGroup, PhotoPanelSection } from "@/components/photo-panel-section";
import { FeatureStack, type StackFeature } from "@/components/feature-stack";
import { FaqSection, type FaqItem } from "@/components/faq-section";
import { Reveal } from "@/components/reveal";
import { fetchBusinesses } from "@/lib/api";
import beerTapPhoto from "@/assets/beer-tap.jpg";
import inventoryPhoto from "@/assets/inventory.jpg";
import cocktailPhoto from "@/assets/cocktail.jpg";

// The business carousel comes from FastAPI at request time. Railway's private
// API is not available while the frontend image is being built.
export const dynamic = "force-dynamic";

// The five modules — shown as a sticky fanning deck (see FeatureStack).
const features: StackFeature[] = [
  {
    name: "Reservations",
    motto: "Online booking, reminders, a public booking page",
    description:
      "Guests book from your public page or the embeddable widget, and every reservation lands on one schedule. Automated SMS and email reminders cut down on no-shows before they happen.",
    bullets: [
      "Unlimited bookings",
      "SMS & email reminders",
      "Embeddable booking widget",
    ],
  },
  {
    name: "Queue",
    motto: "The clipboard, retired — walk-ins join by QR",
    description:
      "Walk-ins scan a QR at the door and hold their place in line without an app or a clipboard. Staff call, seat, or remove parties from a live board, and guests get a text the moment they're up.",
    bullets: ["No app required", "Live staff board", "SMS when a seat opens"],
  },
  {
    name: "Ordering",
    motto: "QR self-ordering, straight to the ticket board",
    description:
      "A QR menu takes guests from browsing to a placed order in seconds, and tickets stream onto the kitchen and bar boards in real time. Tabs keep every round of the night on one running total until close-out.",
    bullets: [
      "Kitchen & bar stations",
      "Live ticket statuses",
      "Tabs with running totals",
    ],
  },
  {
    name: "Inventory",
    motto: "Pours in ml, recipes that deduct themselves",
    description:
      "Spirits and kegs are tracked to the millilitre, garnishes to the piece. Recipes deduct stock the moment a drink is served, and par-level alerts warn you before the well runs dry.",
    bullets: [
      "Par-level alerts",
      "Waste tracking",
      "Bottle & keg volumes in ml",
    ],
  },
  {
    name: "Insights",
    motto: "Know Friday will be busy before it is",
    description:
      "A seven-day demand forecast tells you which nights will be busy before they are. Cancellation-risk flags and live KPIs across the other modules keep staffing and stocking decisions grounded in your own numbers.",
    bullets: [
      "7-day demand forecast",
      "Cancellation risk flags",
      "Operational KPIs",
    ],
  },
];

// DRAFT COPY — grounded in shipped functionality, but review before publishing.
const faqItems: FaqItem[] = [
  {
    question: "What do I get with Crowbar?",
    answer:
      "Five modules that share one dashboard: table and seat reservations, a walk-in queue, QR ordering with a kitchen-and-bar ticket board, pour-level inventory, and demand insights. Each module can be switched on or off independently, so you only run what your venue actually uses.",
  },
  {
    question: "Do my guests need to download an app?",
    answer:
      "No. Everything guest-facing works from a QR code in a normal browser — booking a table, joining the walk-in queue, browsing the menu, and placing an order. Guests get an SMS when their seat is called; nobody creates an account.",
  },
  {
    question: "How does pour tracking actually work?",
    answer:
      "Spirits, wine, and kegs are tracked in millilitres, countable stock by the piece. You give each drink a recipe once, and every serve deducts the exact pour from stock automatically. Par-level alerts warn you before a bottle runs dry, and a drink comes off the menu the moment an ingredient hits zero.",
  },
  {
    question: "Can we run tabs?",
    answer:
      "Yes. Open a tab, add rounds to it through the night — from the guest's QR order or entered by staff — and close it out with one running total. Crowbar records how a tab was settled (cash, card, or comp), but card processing itself isn't built in yet.",
  },
  {
    question: "Does it handle happy hour?",
    answer:
      "Yes. Set happy-hour windows by day of week and time — overnight windows past midnight included — in your bar's own timezone. Items you've opted in show their discounted price on the guest menu and are charged at it automatically while a window is active.",
  },
  {
    question: "What do the insights actually tell me?",
    answer:
      "A seven-day demand forecast so you can staff the rush before it arrives, flags on reservations that look likely to cancel, and live KPIs across reservations, ordering, and inventory — all drawn from your venue's own data.",
  },
];

export default async function Home() {
  const businesses = await fetchBusinesses();

  return (
    <div className="flex flex-col bg-background">
      <LandingNavbar />

      {/* ── Hero — photo behind type, both scroll-linked ───────────────── */}
      <LandingHero />

      {/* ── Info sections — one shared gradient panel, 3-layer parallax ── */}
      <PhotoPanelGroup>
        <PhotoPanelSection
          eyebrow="Service"
          title="Never lose a round"
          body="Guests order from a QR at the table; tickets land on the kitchen and bar boards in real time, and tabs keep every round on one running total."
          rows={[
            ["QR ordering", "menu to ticket board, live"],
            ["Tabs", "one running total per table"],
            ["Queue", "SMS when their seat is ready"],
          ]}
          photo={beerTapPhoto}
          photoAlt="Beer being drawn from a tap"
          on="lager"
        />

        <PhotoPanelSection
          eyebrow="The back bar"
          title="Every pour, accounted for"
          body="Recipes deduct inventory the moment a drink is served — spirits tracked to the millilitre, garnishes to the piece — with par alerts before the well runs dry."
          rows={[
            ["Recipes", "auto-deduct on serve"],
            ["Pours", "tracked in ml, bottle or keg"],
            ["Forecast", "staff up before the rush"],
          ]}
          photo={inventoryPhoto}
          photoAlt="Back-bar shelves of bottles"
          on="dubbel"
          flip
        />
      </PhotoPanelGroup>

      {/* ── The modules — sticky fanning deck ──────────────────────────── */}
      <FeatureStack features={features} />
      <div className="text-center pb-24 -mt-[10vh]">
        <PricingModal>
          <button className="text-sm text-primary hover:underline font-medium">
            View pricing →
          </button>
        </PricingModal>
      </div>

      {/* ── Social proof ───────────────────────────────────────────────── */}
      <section className="py-16 md:py-24 bg-muted/40">
        <div className="container mx-auto px-6">
          <Reveal className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl mb-3">
              Trusted by businesses like these
            </h2>
            <p className="text-muted-foreground">
              Venues use Crowbar to run their nights, from reservations to
              real-time orders.
            </p>
          </Reveal>
          <BusinessesCarouselSection businesses={businesses} />
        </div>
      </section>

      {/* ── FAQ — giant-numeral rail + numbered accordion ──────────────── */}
      <FaqSection
        eyebrow="Questions"
        title="Asked at the bar"
        intro="Straight answers before you commit to a trial. Anything we missed, ask us directly below."
        items={faqItems}
      />

      {/* ── Last call — merged CTA + footer, after dark ────────────────── */}
      <footer className="theme-night relative overflow-hidden bg-background text-foreground">
        {/* Photograph settled into the porter ground */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <Image
            src={cocktailPhoto}
            alt=""
            fill
            placeholder="blur"
            sizes="100vw"
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-linear-to-b from-background/60 via-transparent to-background/80" />
        </div>

        <div className="relative container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-14 lg:gap-24 py-24">
            {/* CTA + brand — left-aligned */}
            <Reveal>
              <p className="eyebrow text-brass mb-4">Last call</p>
              <h2 className="font-display text-4xl md:text-5xl mb-5 tracking-tight">
                Ready to run a smoother night?
              </h2>
              <p className="text-muted-foreground mb-10 max-w-xl">
                Join businesses already using Crowbar to reduce no-shows, keep
                tickets moving, and never 86 a drink by surprise.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg">
                  <Link href="/auth/register" className="flex items-center gap-2">
                    Start free trial
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <ContactDialog>
                  <Button variant="outline" size="lg">
                    Talk to us
                  </Button>
                </ContactDialog>
              </div>

              <div className="mt-16">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                    <GalleryVerticalEnd className="size-4" />
                  </div>
                  <span className="font-semibold">Crowbar</span>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  The all-in-one platform for bar operations. Reservations,
                  queues, ordering, inventory, and insights — built to work
                  together.
                </p>
              </div>
            </Reveal>

            {/* Contact form — in place, no dialog */}
            <Reveal delay={120}>
              <p className="eyebrow mb-4">Get in Touch</p>
              <p className="text-sm text-muted-foreground mb-6">
                Have questions? We&apos;d love to hear from you.
              </p>
              <FooterContactForm />
            </Reveal>
          </div>

          <div className="rule-double" aria-hidden />

          {/* Bottom line — set with the signature dot leader */}
          <div className="flex items-baseline gap-3 py-10 text-sm text-muted-foreground">
            <span className="font-display">Crowbar</span>
            <span className="leader-dots text-brass" aria-hidden />
            <span className="figures">
              © {new Date().getFullYear()} All rights reserved
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
