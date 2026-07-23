"use client";

import Link from "next/link";
import { Check, Calendar, Users2, ShoppingCart, Package, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
      <DialogContent className="max-w-5xl overflow-y-auto max-h-[92svh] p-8 md:p-12 gap-8">
        <DialogHeader className="gap-3">
          <p className="eyebrow text-brass-deep">Pricing</p>
          <DialogTitle className="font-display font-normal text-3xl md:text-4xl tracking-tight leading-none">
            Simple, transparent pricing
          </DialogTitle>
          <DialogDescription className="text-base">
            All five modules included in every plan — choose by scale.
          </DialogDescription>
        </DialogHeader>

        <div className="rule-double" aria-hidden />

        {/* Module ribbon */}
        <div className="flex flex-wrap gap-2">
          {modules.map(({ icon: Icon, name }) => (
            <div
              key={name}
              className="flex items-center gap-2 rounded-full border border-border/80 px-3.5 py-1.5 text-xs font-medium"
            >
              <Icon className="h-3.5 w-3.5 text-brass-deep" />
              {name}
              <Check className="h-3 w-3 text-brass-deep" aria-hidden />
            </div>
          ))}
        </div>

        {/* Pricing grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative rounded-xl border p-7 flex flex-col gap-5 bg-card",
                tier.popular ? "border-2 border-primary shadow-md" : "border-border/60",
              )}
            >
              {tier.popular && (
                <span className="eyebrow absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-lager px-3 py-1 text-[#2B2016]">
                  Most popular
                </span>
              )}
              {/* Name ····· price — the house dot leader */}
              <div>
                <div className="flex items-baseline gap-3">
                  <h3 className="eyebrow text-foreground">{tier.name}</h3>
                  <span className="leader-dots text-brass" aria-hidden />
                  <span className="figures text-3xl">${tier.price}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 text-right">
                  per month
                </p>
              </div>
              <div className="h-px bg-border" aria-hidden />
              <ul className="flex flex-col gap-2.5 flex-1">
                {tier.limits.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-4 w-4 text-brass-deep mt-0.5 shrink-0" />
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
