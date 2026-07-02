import Image from "next/image";
import Link from "next/link";
import {
  GalleryVerticalEnd,
  ArrowRight,
  Calendar,
  BarChart3,
  ShoppingCart,
  Package,
  Users2,
  CheckCircle2,
  Zap,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewsletterForm } from "@/components/newsletter-form";
import { ContactDialog } from "@/components/contact-dialog";
import { BusinessesCarouselSection } from "@/components/businesses-carousel-section";
import { LandingNavbar } from "@/components/landing-navbar";
import { PricingModal } from "@/components/pricing-modal";
import { fetchBusinesses } from "@/lib/api";

const bgCollage = [
  {
    src: "/website-img-1.jpg",
    alt: "Business 1",
    className: "relative col-start-1 col-span-1 row-start-1 row-span-2",
  },
  {
    src: "/website-img-2.jpg",
    alt: "Business 2",
    className: "relative col-start-2 col-span-1 row-start-1 row-span-1",
  },
  {
    src: "/website-img-3.jpg",
    alt: "Business 3",
    className: "relative col-start-3 col-span-2 row-start-1 row-span-1",
  },
  {
    src: "/website-img-4.jpg",
    alt: "Business 4",
    className: "relative col-start-2 col-span-1 row-start-2 row-span-1",
  },
  {
    src: "/website-img-5.jpg",
    alt: "Business 5",
    className: "relative col-start-1 col-span-2 row-start-3 row-span-1",
  },
  {
    src: "/website-img-6.jpg",
    alt: "Business 6",
    className: "relative col-start-3 col-span-1 row-start-2 row-span-1",
  },
  {
    src: "/website-img-7.jpg",
    alt: "Business 7",
    className: "relative col-start-4 col-span-1 row-start-2 row-span-2",
  },
];

const modules = [
  {
    icon: Calendar,
    name: "Reservations",
    description: "Online booking with calendar sync, reminders, and a public booking page.",
    highlights: [
      "Unlimited bookings",
      "Google Calendar sync",
      "SMS & email reminders",
      "Public booking page + embeddable widget",
    ],
  },
  {
    icon: Users2,
    name: "Queue",
    description: "Replace the clipboard. Customers join a digital waitlist via QR code.",
    highlights: [
      "QR code entry — no app required",
      "Real-time staff board",
      "SMS notification on call",
      "WebSocket live updates",
    ],
  },
  {
    icon: ShoppingCart,
    name: "Ordering",
    description: "QR-based self-ordering from the table, straight to the kitchen.",
    highlights: [
      "QR menu & self-ordering",
      "Kitchen & bar ticket board",
      "Real-time order status",
      "On/off toggle per service",
    ],
  },
  {
    icon: Package,
    name: "Inventory",
    description: "Track stock levels, record movements, and get alerted before you run out.",
    highlights: [
      "Stock tracking & movements",
      "Receive, adjust, waste logging",
      "Par-level low-stock alerts",
      "Cost per unit tracking",
    ],
  },
  {
    icon: BarChart3,
    name: "Insights",
    description: "ML-powered analytics surfaced right in your dashboard.",
    highlights: [
      "7-day demand forecast",
      "Customer segmentation",
      "Cancellation risk prediction",
      "Operational KPIs",
    ],
  },
];

const whyPoints = [
  {
    icon: Zap,
    title: "Setup in minutes",
    body: "Get a live booking page, configure your hours, and start accepting reservations today.",
  },
  {
    icon: Package,
    title: "Replace 5 tools",
    body: "One subscription covers reservations, queues, ordering, inventory, and analytics.",
  },
  {
    icon: TrendingUp,
    title: "Grow with confidence",
    body: "ML forecasting tells you when to staff up before the rush hits.",
  },
];

export default async function Home() {
  const businesses = await fetchBusinesses();

  return (
    <div className="flex flex-col bg-background">
      <LandingNavbar />

      {/* Hero Section */}
      <section className="relative h-svh flex items-end overflow-hidden bg-neutral-950 pt-14">
        {/* Background Image Collage */}
        <div className="absolute inset-0 grid grid-rows-3 grid-cols-4 gap-2 p-2 brightness-30 bg-neutral-950">
          {bgCollage.map((bg, index) => (
            <div
              className={`relative overflow-hidden ${bg.className}`}
              key={index}
            >
              <Image src={bg.src} alt={bg.alt} fill className="object-cover" />
            </div>
          ))}
        </div>

        {/* Foreground Content */}
        <div className="relative z-10 w-full px-6 pb-16 md:px-12 lg:px-20 max-w-3xl">
          <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">
            All-in-one venue operations
          </p>
          <h1 className="page-title-xl mb-6 text-white leading-tight">
            Run your entire venue from one platform.
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-xl">
            Reservations, queues, ordering, inventory, and insights — all
            connected. Start in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg">
              <Link href="/auth/register" className="flex items-center gap-2">
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <PricingModal>
              <Button
                variant="outline"
                size="lg"
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
              >
                See pricing
              </Button>
            </PricingModal>
          </div>
        </div>
      </section>

      {/* Businesses Carousel — social proof */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="page-title-lg mb-4">Trusted by businesses like these</h2>
            <p className="text-lg text-muted-foreground">
              Venues across industries use Crowbar to manage their daily
              operations, from reservations to real-time orders.
            </p>
          </div>
          <BusinessesCarouselSection businesses={businesses} />
        </div>
      </section>

      {/* Module Feature Grid */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="page-title-lg mb-4">One platform, every module you need.</h2>
            <p className="text-lg text-muted-foreground">
              Every tool your venue needs, working together. No patchwork of
              apps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 max-w-6xl mx-auto">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.name}
                  className="rounded-xl border bg-card shadow-sm p-5 flex flex-col gap-3"
                >
                  <div className="p-2.5 rounded-lg bg-primary/10 w-fit">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{mod.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-1.5 mt-auto">
                    {mod.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-10">
            <PricingModal>
              <button className="text-sm text-primary hover:underline font-medium">
                View pricing →
              </button>
            </PricingModal>
          </div>
        </div>
      </section>

      {/* Why Slotera */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {whyPoints.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 w-fit">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-neutral-950 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="page-title-lg mb-4 text-white">
            Ready to streamline your operations?
          </h2>
          <p className="text-white/60 mb-10 max-w-xl mx-auto text-lg">
            Join businesses already using Crowbar to run smoother services,
            reduce no-shows, and delight their customers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/auth/register" className="flex items-center gap-2">
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <ContactDialog>
              <Button
                variant="outline"
                size="lg"
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
              >
                Talk to us
              </Button>
            </ContactDialog>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted border-t">
        <div className="container mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {/* About */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <span className="font-semibold">Crowbar</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The all-in-one platform for venue operations. Reservations,
                queues, ordering, inventory, and insights — built to work
                together.
              </p>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className="font-semibold mb-4">Stay Updated</h3>
              <NewsletterForm />
            </div>

            {/* Contact */}
            <div>
              <h3 className="font-semibold mb-4">Get in Touch</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Have questions? We'd love to hear from you.
              </p>
              <ContactDialog>
                <Button variant="outline" className="w-full sm:w-auto">
                  Contact Us
                </Button>
              </ContactDialog>
            </div>
          </div>

          {/* Demo disclaimer */}
          <div className="pt-6 pb-4 border-t text-center text-sm text-muted-foreground">
            <p>
              <strong>Demo Notice:</strong> All data displayed is mock data for
              demonstration purposes. Images from{" "}
              <a
                href="https://unsplash.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                Unsplash
              </a>
              .
            </p>
          </div>

          <div className="pt-4 border-t text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Crowbar. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
