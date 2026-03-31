import Link from "next/link";
import {
  CalendarDays,
  BarChart3,
  ShoppingCart,
  Package,
  Users2,
  Check,
  GalleryVerticalEnd,
} from "lucide-react";

const modules = [
  {
    icon: CalendarDays,
    name: "Reservations",
    description:
      "Accept and manage bookings from customers. Customizable service types, operating hours, and booking forms. Google Calendar sync included.",
    price: "Included",
    available: true,
    highlights: [
      "Unlimited reservations",
      "Custom service types",
      "SMS & email notifications",
      "Google Calendar sync",
      "Public booking page",
      "Embeddable widget",
    ],
  },
  {
    icon: BarChart3,
    name: "Insights",
    description:
      "Analytics and demand forecasting powered by machine learning. Understand your peak hours, customer segments, and revenue trends.",
    price: "Coming soon",
    available: false,
    highlights: [
      "Demand forecasting",
      "Customer segmentation",
      "Revenue analytics",
      "Peak hour detection",
    ],
  },
  {
    icon: Users2,
    name: "Queue",
    description:
      "Virtual queue management for walk-in customers. Let guests join a digital waitlist from their phone and get notified when it's their turn.",
    price: "Coming soon",
    available: false,
    highlights: ["Digital waitlist", "SMS notifications", "Live queue status"],
  },
  {
    icon: ShoppingCart,
    name: "Ordering",
    description:
      "Table-side and delivery ordering for restaurants and cafes. QR code menus, order management, and kitchen display integration.",
    price: "Coming soon",
    available: false,
    highlights: ["QR code menus", "Order management", "Kitchen display"],
  },
  {
    icon: Package,
    name: "Inventory",
    description:
      "Stock and inventory tracking for businesses that sell products or manage supplies. Low-stock alerts and usage reports.",
    price: "Coming soon",
    available: false,
    highlights: ["Stock tracking", "Low-stock alerts", "Usage reports"],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Slotera
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link
              href="/auth/register"
              className="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Get started for free. The Reservations module is available now. More modules are on the way — unlock them as your business grows.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <Check className="w-4 h-4" /> Free during beta — no credit card required
        </div>
      </div>

      {/* Module cards */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.name}
                className={`rounded-xl border p-6 flex flex-col gap-4 ${
                  mod.available
                    ? "bg-card shadow-sm ring-1 ring-primary/20"
                    : "bg-muted/30 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`p-2 rounded-lg ${mod.available ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`w-5 h-5 ${mod.available ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      mod.available
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {mod.price}
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-base">{mod.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
                </div>

                <ul className="space-y-1.5 mt-auto">
                  {mod.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-sm">
                      <Check className={`w-3.5 h-3.5 shrink-0 ${mod.available ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={mod.available ? "" : "text-muted-foreground"}>{h}</span>
                    </li>
                  ))}
                </ul>

                {mod.available && (
                  <Link
                    href="/auth/register"
                    className="mt-2 block text-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Get started free
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center border rounded-xl p-10 bg-muted/30">
          <h2 className="text-2xl font-bold mb-2">Ready to streamline your bookings?</h2>
          <p className="text-muted-foreground mb-6">
            Join businesses already using Slotera to manage reservations and delight customers.
          </p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Start for free <CalendarDays className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
