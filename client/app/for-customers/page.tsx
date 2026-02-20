import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Bell,
  Settings,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function ForCustomersPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center overflow-hidden bg-muted">
        <div className="container mx-auto px-6 py-16 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="page-title-xl mb-6">
                Book Reservations Made Simple
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Reserve your table in minutes. Get notified about special
                events, happy hours, and exclusive deals. Manage all your
                reservations from one place.
              </p>
              <Button asChild size="lg">
                <Link href="/auth/login" className="flex items-center gap-2">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative h-[400px] lg:h-[500px]">
              <Image
                src="/website-img-2.jpg"
                alt="Customer booking"
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
            <h2 className="page-title-lg mb-4">Everything You Need</h2>
            <p className="text-muted-foreground">
              All the features you need to manage your reservations effortlessly
            </p>
          </div>
          <div className="flex flex-col gap-8">
            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Easy Booking Process</h3>
                <p className="text-muted-foreground">
                  Book your reservation in just a few clicks. Select your date,
                  time, number of guests, and you're done. Get instant
                  confirmation and reminders.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Stay in the Loop</h3>
                <p className="text-muted-foreground">
                  Receive notifications about special events, happy hours,
                  exclusive deals, and promotions from your favorite businesses.
                  Never miss out on great offers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Settings className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Manage Your Reservations</h3>
                <p className="text-muted-foreground">
                  View all your upcoming and past reservations in one place.
                  Update or cancel reservations anytime with just a few clicks.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-6 rounded-lg border bg-card">
              <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="section-title mb-2">Quick Access</h3>
                <p className="text-muted-foreground">
                  Access your reservation history, view business details, and
                  manage your profile all from your personal dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="page-title-lg mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">
              Everything you need to know about using our platform
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                Is it free to create an account?
              </AccordionTrigger>
              <AccordionContent>
                Yes! Creating an account and making reservations is completely
                free for customers. There are no hidden fees or subscription
                costs.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How do I make a reservation?</AccordionTrigger>
              <AccordionContent>
                Simply visit a business's reservation page, select your preferred
                date and time, enter the number of guests, and provide your
                contact information. You'll receive a confirmation once your
                reservation is approved.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>
                Can I cancel or modify my reservation?
              </AccordionTrigger>
              <AccordionContent>
                Yes, you can view, modify, or cancel your reservations at any
                time from your dashboard. Simply go to your reservations page
                and use the edit or cancel options.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>
                Will I receive reminders about my reservations?
              </AccordionTrigger>
              <AccordionContent>
                Yes, you'll receive notifications about your upcoming
                reservations, as well as updates on special events and deals
                from businesses you've booked with.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>
                What information do I need to provide?
              </AccordionTrigger>
              <AccordionContent>
                You'll need to provide your name, email address, and phone
                number. This information helps businesses contact you if needed and
                send you important updates about your reservation.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-6 max-w-2xl text-center">
          <h2 className="page-title-lg mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8">
            Join thousands of customers who are already using our platform to
            book their reservations.
          </p>
          <Button asChild size="lg">
            <Link href="/auth/register" className="flex items-center gap-2">
              Create Your Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
