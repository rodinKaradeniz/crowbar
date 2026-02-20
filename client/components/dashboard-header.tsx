"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const routeLabels: Record<string, string> = {
  // Business routes
  business: "Business",
  overview: "Overview",
  reservations: "Reservations",
  requests: "Requests",
  schedule: "Schedule",
  customers: "Customers",
  staff: "Staff",
  profile: "Business Profile",
  settings: "Settings",
  info: "Info",
  booking: "Booking",
  hours: "Hours",
  types: "Types",
  account: "Account",
  // Customer routes
  customer: "Customer",
};

interface DashboardHeaderProps {
  /** Optional element rendered before the breadcrumbs (e.g. sidebar trigger) */
  leading?: React.ReactNode;
}

export function DashboardHeader({ leading }: DashboardHeaderProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items
  const breadcrumbItems = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    const isLast = index === segments.length - 1;

    return { href, label, isLast };
  });

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      {leading}
      {leading && <Separator orientation="vertical" className="mr-1 h-4" />}
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbItems.map((item, index) => (
            <span key={item.href} className="flex items-center gap-2">
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
