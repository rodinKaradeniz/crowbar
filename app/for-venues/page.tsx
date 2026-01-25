import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Bell,
  Users,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function ForVenuesPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center overflow-hidden bg-muted">
        <div className="container mx-auto px-6 py-16 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="page-title-xl mb-6">
                Manage Your Reservations Like a Pro
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Streamline your reservation management with powerful tools
                designed for venues. Accept requests, view schedules, and track
                customers—all from one dashboard.
              </p>
              <Button asChild size="lg">
                <Link href="/auth/register" className="flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative h-[400px] lg:h-[500px]">
              <Image
                src="/venue3.jpg"
                alt="Venue management"
                fill
                className="object-cover rounded-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="page-title-lg mb-4">
              Powerful Features for Your Venue
            </h2>
            <p className="text-muted-foreground">
              Everything you need to manage reservations efficiently
            </p>
          </div>
          <div className="flex flex-col gap-8">
            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Visual Schedule Timeline</h3>
                <p className="text-muted-foreground">
                  See all your reservations at a glance with our intuitive
                  timeline view. Organized by table, you can quickly identify
                  availability and manage your schedule.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Request Management</h3>
                <p className="text-muted-foreground">
                  Review and respond to pending reservation requests quickly.
                  Accept or reject with one click, and keep your schedule
                  organized.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Customer Management</h3>
                <p className="text-muted-foreground">
                  Track all people who have made reservations with detailed
                  history. View reservation patterns and build better
                  relationships with your customers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Insights & Analytics</h3>
                <p className="text-muted-foreground">
                  Get valuable insights into your reservation patterns, popular
                  times, and customer behavior to optimize your operations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="page-title-lg mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground">
              Choose the plan that works best for your venue
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Starter Plan */}
            <div className="rounded-lg border bg-card p-6 flex flex-col">
              <h3 className="text-xl font-semibold mb-2">Starter</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold">$29</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Up to 100 reservations/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Schedule timeline view</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Request management</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Customer database</span>
                </li>
              </ul>
              <Button asChild className="w-full">
                <Link href="/auth/register">Register</Link>
              </Button>
            </div>

            {/* Professional Plan */}
            <div className="rounded-lg border-2 border-primary bg-card p-6 flex flex-col relative">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 rounded-bl-lg rounded-tr-lg text-xs font-semibold">
                POPULAR
              </div>
              <h3 className="text-xl font-semibold mb-2">Professional</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold">$79</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Up to 500 reservations/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">All Starter features</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Advanced analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Priority support</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Custom integrations</span>
                </li>
              </ul>
              <Button asChild className="w-full">
                <Link href="/auth/register">Register</Link>
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className="rounded-lg border bg-card p-6 flex flex-col">
              <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold">$199</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited reservations</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">All Professional features</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Dedicated account manager</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Custom reporting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">API access</span>
                </li>
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/register">Register</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="page-title-lg mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">
              Everything you need to know about our platform
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                What's included in the free trial?
              </AccordionTrigger>
              <AccordionContent>
                You get full access to all features for 14 days. No credit card
                required. After the trial, choose the plan that best fits your
                needs.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can I change plans later?</AccordionTrigger>
              <AccordionContent>
                Yes, you can upgrade or downgrade your plan at any time. Changes
                take effect immediately, and we'll prorate any charges.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>
                Is it free for customers to create accounts?
              </AccordionTrigger>
              <AccordionContent>
                Yes! Customers can create accounts and make reservations
                completely free. There are no fees for customers to use the
                platform.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>
                What payment methods do you accept?
              </AccordionTrigger>
              <AccordionContent>
                We accept all major credit cards and ACH transfers. All payments
                are processed securely through our payment partners.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>Do you offer support?</AccordionTrigger>
              <AccordionContent>
                Yes! All plans include email support. Professional and
                Enterprise plans include priority support with faster response
                times. Enterprise customers get a dedicated account manager.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>
                Can I integrate with my existing systems?
              </AccordionTrigger>
              <AccordionContent>
                Professional and Enterprise plans include integration options.
                Enterprise customers get full API access and custom
                integrations. Contact us to discuss your specific needs.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-6 max-w-2xl text-center">
          <h2 className="page-title-lg mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8">
            Join hundreds of venues already using our platform to manage their
            reservations.
          </p>
          <Button asChild size="lg">
            <Link href="/auth/register" className="flex items-center gap-2">
              Start Your Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
