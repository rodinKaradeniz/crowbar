"use client";

import Link from "next/link";
import { CheckCircle2, Calendar, Users2, ShoppingCart, Package, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PricingModalProps {
  children: React.ReactNode;
}

const modules = [
  { icon: Calendar, name: "Reservations" },
  { icon: Users2, name: "Queue" },
  { icon: ShoppingCart, name: "Ordering" },
  { icon: Package, name: "Inventory" },
  { icon: BarChart3, name: "Insights" },
];

const tiers = [
  {
    name: "Starter",
    price: 29,
    popular: false,
    limits: [
      "Up to 200 reservations/month",
      "2 staff accounts",
      "1 location",
      "Email reminders",
      "All 5 modules included",
      "Email support",
    ],
  },
  {
    name: "Professional",
    price: 79,
    popular: true,
    limits: [
      "Up to 1,000 reservations/month",
      "10 staff accounts",
      "3 locations",
      "SMS + email reminders",
      "All 5 modules included",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: 199,
    popular: false,
    limits: [
      "Unlimited reservations",
      "Unlimited staff accounts",
      "Unlimited locations",
      "SMS + email + webhooks",
      "All 5 modules included",
      "Dedicated account manager",
      "API access",
    ],
  },
];

export function PricingModal({ children }: PricingModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl overflow-y-auto max-h-[90svh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Simple, transparent pricing</DialogTitle>
          <DialogDescription>
            All 5 modules included in every plan. Choose based on scale.
          </DialogDescription>
        </DialogHeader>

        {/* Module ribbon */}
        <div className="flex flex-wrap gap-2 py-2">
          {modules.map(({ icon: Icon, name }) => (
            <div
              key={name}
              className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium"
            >
              <Icon className="h-3.5 w-3.5 text-primary" />
              {name}
              <span className="text-emerald-600 font-semibold">✓</span>
            </div>
          ))}
        </div>

        {/* Pricing grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 flex flex-col gap-4 ${
                tier.popular ? "border-2 border-primary shadow-md" : ""
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </span>
              )}
              <div>
                <h3 className="font-semibold text-lg">{tier.name}</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">${tier.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2 flex-1">
                {tier.limits.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full mt-2" variant={tier.popular ? "default" : "outline"}>
                <Link href="/auth/register">Get started</Link>
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
