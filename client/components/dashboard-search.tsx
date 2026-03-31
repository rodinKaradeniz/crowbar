"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Calendar,
  Bell,
  User,
  Settings,
  ShieldCheck,
  Users,
  Clock,
  Tag,
  Building2,
  Info,
  CalendarCog,
  UserCircle,
  BookOpen,
  BrainCircuit,
  type LucideIcon,
} from "lucide-react";

interface SearchItem {
  title: string;
  url: string;
  icon: LucideIcon;
  group: string;
  keywords?: string[];
}

const customerSearchItems: SearchItem[] = [
  {
    title: "Overview",
    url: "/customer/overview",
    icon: LayoutDashboard,
    group: "Navigation",
    keywords: ["dashboard", "home"],
  },
  {
    title: "Reservations",
    url: "/customer/reservations",
    icon: Calendar,
    group: "Navigation",
    keywords: ["bookings", "appointments"],
  },
  {
    title: "Requests",
    url: "/customer/requests",
    icon: Bell,
    group: "Navigation",
    keywords: ["pending", "notifications"],
  },
  {
    title: "Profile Settings",
    url: "/customer/settings/profile",
    icon: User,
    group: "Settings",
    keywords: ["name", "avatar", "personal"],
  },
  {
    title: "Account Settings",
    url: "/customer/settings/account",
    icon: ShieldCheck,
    group: "Settings",
    keywords: ["password", "email", "security"],
  },
  {
    title: "For customers",
    url: "/for-customers",
    icon: BookOpen,
    group: "Help",
    keywords: ["help", "guide", "how to", "docs", "documentation"],
  },
];

const businessSearchItems: SearchItem[] = [
  {
    title: "Overview",
    url: "/business/overview",
    icon: LayoutDashboard,
    group: "Navigation",
    keywords: ["dashboard", "home"],
  },
  {
    title: "Insights",
    url: "/business/insights",
    icon: BrainCircuit,
    group: "Navigation",
    keywords: ["ml", "machine learning", "predictions", "analytics", "forecast", "segmentation"],
  },
  {
    title: "Docs",
    url: "/business/docs",
    icon: BookOpen,
    group: "Navigation",
    keywords: ["help", "guide", "how to", "documentation", "manual"],
  },
  {
    title: "Reservations",
    url: "/business/reservations",
    icon: Calendar,
    group: "Operations",
    keywords: ["bookings", "appointments"],
  },
  {
    title: "Requests",
    url: "/business/requests",
    icon: Bell,
    group: "Operations",
    keywords: ["pending", "notifications"],
  },
  {
    title: "Schedule",
    url: "/business/schedule",
    icon: Clock,
    group: "Operations",
    keywords: ["calendar", "availability", "timetable"],
  },
  {
    title: "Customers",
    url: "/business/customers",
    icon: UserCircle,
    group: "Operations",
    keywords: ["clients", "users"],
  },
  {
    title: "Staff",
    url: "/business/staff",
    icon: Users,
    group: "Management",
    keywords: ["team", "employees"],
  },
  {
    title: "Business Info",
    url: "/business/profile/info",
    icon: Info,
    group: "Management",
    keywords: ["name", "description", "details"],
  },
  {
    title: "Booking Settings",
    url: "/business/profile/booking",
    icon: CalendarCog,
    group: "Management",
    keywords: ["reservation settings", "configuration"],
  },
  {
    title: "Business Hours",
    url: "/business/profile/hours",
    icon: Clock,
    group: "Management",
    keywords: ["schedule", "open", "close", "availability"],
  },
  {
    title: "Service Types",
    url: "/business/profile/types",
    icon: Tag,
    group: "Management",
    keywords: ["services", "categories"],
  },
  {
    title: "Profile Settings",
    url: "/business/settings/profile",
    icon: User,
    group: "Settings",
    keywords: ["personal", "name", "avatar"],
  },
  {
    title: "Account Settings",
    url: "/business/settings/account",
    icon: ShieldCheck,
    group: "Settings",
    keywords: ["password", "email", "security"],
  },
];

interface DashboardSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "customer" | "business";
}

export function DashboardSearch({
  open,
  onOpenChange,
  variant,
}: DashboardSearchProps) {
  const router = useRouter();
  const items =
    variant === "customer" ? customerSearchItems : businessSearchItems;

  // Group items by their group
  const groups = React.useMemo(() => {
    const map = new Map<string, SearchItem[]>();
    for (const item of items) {
      const group = map.get(item.group) || [];
      group.push(item);
      map.set(item.group, group);
    }
    return map;
  }, [items]);

  const handleSelect = React.useCallback(
    (url: string) => {
      onOpenChange(false);
      router.push(url);
    },
    [router, onOpenChange]
  );

  // Keyboard shortcut to open search
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Array.from(groups).map(([groupName, groupItems]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.url}
                value={`${item.title} ${item.keywords?.join(" ") || ""}`}
                onSelect={() => handleSelect(item.url)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
