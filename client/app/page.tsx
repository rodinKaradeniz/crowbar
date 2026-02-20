import Image from "next/image";
import Link from "next/link";
import {
  GalleryVerticalEnd,
  ArrowRight,
  Calendar,
  Users,
  Clock,
  Bell,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewsletterForm } from "@/components/newsletter-form";
import { ContactDialog } from "@/components/contact-dialog";
import { BusinessesCarouselSection } from "@/components/businesses-carousel-section";
import { fetchBusinesses } from "@/lib/api";

export const dynamic = "force-dynamic";

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
    className: "relative col-start-2 col-span-1 row-start-2 row-span-1",
  },
  {
    src: "/business8.jpg",
    alt: "Business 8",
    className: "relative col-start-4 col-span-1 row-start-2 row-span-2",
  },
  {
    src: "/business9.jpg",
    alt: "Business 9",
    className: "relative col-span-1 row-span-1",
  },
];

export default async function Home() {
  const businesses = await fetchBusinesses();
  return (
    <div className="flex flex-col bg-background">
      {/* Hero Section */}
      <section className="relative h-svh flex items-center overflow-hidden">
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
        <div className="relative z-10 size-full">
          <div className="absolute bottom-[10%] left-[5%]">
            <p className="text-lg text-white mb-8 max-w-xl">
            Streamline Your Reservations
            </p>
            <h1 className="page-title-xl mb-6 text-white">
              RK Reservations
            </h1>
          </div>

          <div className="absolute top-[40%] right-[10%] flex flex-col items-end text-right">
            <p className="text-lg text-white mb-8 max-w-xl">
              The all-in-one platform for businesses and customers to manage
              reservations effortlessly. From booking to scheduling, we make it
              simple.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/auth" className="flex items-center gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <ContactDialog>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Contact Us
                </Button>
              </ContactDialog>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section 1 - Businesses */}
      <section className="flex min-h-[80vh] w-full">
        <div className="relative hidden w-1/2 items-center justify-center bg-muted lg:flex">
          <div className="relative h-full w-full">
            <Image
              src="/website-img-1.jpg"
              alt="Business management"
              fill
              className="object-cover"
            />
          </div>
        </div>
        <div className="flex w-full flex-col gap-4 p-6 md:w-1/2 md:p-10 lg:p-16 items-center justify-center">
          <div className="w-full max-w-md">
            <h2 className="page-title-lg mb-4">Powerful Tools for Businesses</h2>
            <p className="text-muted-foreground mb-8">
              Manage your reservations with ease. Accept or reject requests,
              view your schedule at a glance, and keep track of all your
              customers—all from one intuitive dashboard.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Schedule Management</h3>
                  <p className="text-sm text-muted-foreground">
                    Visual timeline view of all reservations organized by table
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Request Management</h3>
                  <p className="text-sm text-muted-foreground">
                    Review and respond to pending reservation requests quickly
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Customer Insights</h3>
                  <p className="text-sm text-muted-foreground">
                    Track all people who have made reservations with detailed
                    history
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Button asChild variant="outline" size="lg">
                <Link href="/for-businesses" className="flex items-center gap-2">
                  Learn More for Businesses
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section 2 - Customers */}
      <section className="flex min-h-[80vh] w-full">
        <div className="flex w-full flex-col gap-4 p-6 md:w-1/2 md:p-10 lg:p-16 items-center justify-center order-2 lg:order-1">
          <div className="w-full max-w-md">
            <h2 className="page-title-lg mb-4">
              Seamless Booking for Customers
            </h2>
            <p className="text-muted-foreground mb-8">
              Book your reservations in minutes. View your upcoming
              reservations, receive updates on special events and deals, and
              manage everything from one place.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Easy Booking</h3>
                  <p className="text-sm text-muted-foreground">
                    Simple, step-by-step reservation process with instant
                    confirmation
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Stay Updated</h3>
                  <p className="text-sm text-muted-foreground">
                    Get notified about events, happy hours, and special deals
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Settings className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Manage Reservations</h3>
                  <p className="text-sm text-muted-foreground">
                    View, update, or cancel your reservations anytime
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Button asChild variant="outline" size="lg">
                <Link href="/for-customers" className="flex items-center gap-2">
                  Learn More for Customers
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="relative hidden w-1/2 items-center justify-center bg-muted lg:flex order-1 lg:order-2">
          <div className="relative h-full w-full">
            <Image
              src="/website-img-2.jpg"
              alt="Customer booking"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Businesses Carousel Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="page-title-lg mb-4">Our Partner Businesses</h2>
            <p className="text-lg text-muted-foreground">
              Discover amazing businesses that trust us with their reservations.
              From cozy cafes to professional consultants, find the perfect match for your
              next appointment.
            </p>
          </div>
          <BusinessesCarouselSection businesses={businesses} />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted border-t">
        <div className="container mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {/* About Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <span className="font-semibold">RK Reservations</span>
              </div>
              <h3 className="font-semibold mb-2">Making Reservations Simple</h3>
              <p className="text-sm text-muted-foreground">
                We connect businesses and customers through an intuitive platform
                that simplifies the entire reservation process.
              </p>
            </div>

            {/* Newsletter Section */}
            <div>
              <h3 className="font-semibold mb-4">Stay Updated</h3>
              <NewsletterForm />
            </div>

            {/* Contact Section */}
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
          <div className="pt-8 border-t text-center text-sm text-muted-foreground">
            <p>
              &copy; {new Date().getFullYear()} RK Reservations. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
