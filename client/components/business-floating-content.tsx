"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  User,
  Settings,
  LogOut,
  Bell,
  Users,
  Clock,
  Tag,
  ChevronRight,
  Building2,
  ShieldCheck,
  Info,
  CalendarCog,
  UserCircle,
  BrainCircuit,
  BookOpen,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { clientGetBusiness } from "@/lib/client-api";
import { useEffect, useState } from "react";
import { Business } from "@/types";
import { cn } from "@/lib/utils";

export function BusinessFloatingContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    if (user?.type === "staff" && user.businessId) {
      clientGetBusiness(user.businessId).then((data) => {
        if (data) setBusiness(data);
      });
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  const operationsItems = [
    { title: "Reservations", url: "/business/reservations", icon: Calendar },
    { title: "Requests", url: "/business/requests", icon: Bell },
    { title: "Schedule", url: "/business/schedule", icon: Clock },
    { title: "Customers", url: "/business/customers", icon: UserCircle },
  ];

  const businessSubItems = [
    { title: "Info", url: "/business/profile/info", icon: Info },
    { title: "Booking", url: "/business/profile/booking", icon: CalendarCog },
    { title: "Hours", url: "/business/profile/hours", icon: Clock },
    { title: "Types", url: "/business/profile/types", icon: Tag },
  ];

  const settingsSubItems = [
    { title: "Profile", url: "/business/settings/profile", icon: User },
    { title: "Account", url: "/business/settings/account", icon: ShieldCheck },
  ];

  const isBusinessActive = pathname.startsWith("/business/profile");
  const isSettingsActive = pathname.startsWith("/business/settings");

  return (
    <>
      {/* Header */}
      {business && (
        <div className="p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted shrink-0">
              {business.image ? (
                <Image
                  src={business.image}
                  alt={business.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {business.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{business.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {business.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto py-2">
        {/* Overview */}
        <div className="px-2 py-1">
          <nav className="flex flex-col gap-1">
            <Link
              href="/business/overview"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                pathname === "/business/overview" &&
                  "bg-accent font-medium"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Overview</span>
            </Link>
            <Link
              href="/business/insights"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                pathname === "/business/insights" && "bg-accent font-medium"
              )}
            >
              <BrainCircuit className="h-4 w-4" />
              <span>Insights</span>
            </Link>
            <Link
              href="/business/docs"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                pathname.startsWith("/business/docs") &&
                  "bg-accent font-medium"
              )}
            >
              <BookOpen className="h-4 w-4" />
              <span>Docs</span>
            </Link>
          </nav>
        </div>

        {/* Operations */}
        <div className="px-2 py-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Operations
          </p>
          <nav className="flex flex-col gap-1">
            {operationsItems.map((item) => (
              <Link
                key={item.title}
                href={item.url}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                  pathname === item.url && "bg-accent font-medium"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Management */}
        <div className="px-2 py-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Management
          </p>
          <nav className="flex flex-col gap-1">
            <Link
              href="/business/staff"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                pathname === "/business/staff" && "bg-accent font-medium"
              )}
            >
              <Users className="h-4 w-4" />
              <span>Staff</span>
            </Link>

            {/* Business collapsible */}
            <Collapsible
              defaultOpen={isBusinessActive}
              className="group/collapsible"
            >
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                  isBusinessActive && "bg-accent font-medium"
                )}
              >
                <Building2 className="h-4 w-4" />
                <span>Business</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 mt-1 flex flex-col gap-1 border-l pl-2">
                  {businessSubItems.map((item) => (
                    <Link
                      key={item.title}
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                        pathname === item.url && "bg-accent font-medium"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Settings collapsible */}
            <Collapsible
              defaultOpen={isSettingsActive}
              className="group/collapsible"
            >
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                  isSettingsActive && "bg-accent font-medium"
                )}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 mt-1 flex flex-col gap-1 border-l pl-2">
                  {settingsSubItems.map((item) => (
                    <Link
                      key={item.title}
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                        pathname === item.url && "bg-accent font-medium"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t">
        <button
          className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="relative h-8 w-8 rounded-full overflow-hidden bg-muted shrink-0">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.name || "User"}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <span className="text-xs font-medium">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || "User Name"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || "staff@business.com"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
