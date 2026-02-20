"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  User,
  Settings,
  LogOut,
  Bell,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function CustomerFloatingContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  const reservationsItems = [
    { title: "Reservations", url: "/customer/reservations", icon: Calendar },
    { title: "Requests", url: "/customer/requests", icon: Bell },
  ];

  const settingsSubItems = [
    { title: "Profile", url: "/customer/settings/profile", icon: User },
    { title: "Account", url: "/customer/settings/account", icon: ShieldCheck },
  ];

  const isSettingsActive = pathname.startsWith("/customer/settings");

  return (
    <>
      {/* Content */}
      <div className="flex-1 overflow-auto py-2">
        {/* Overview */}
        <div className="px-2 py-1">
          <nav className="flex flex-col gap-1">
            <Link
              href="/customer/overview"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                pathname === "/customer/overview" &&
                  "bg-accent font-medium"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Overview</span>
            </Link>
          </nav>
        </div>

        {/* Reservations */}
        <div className="px-2 py-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Reservations
          </p>
          <nav className="flex flex-col gap-1">
            {reservationsItems.map((item) => (
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

        {/* Account */}
        <div className="px-2 py-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Account
          </p>
          <nav className="flex flex-col gap-1">
            <Collapsible
              defaultOpen={isSettingsActive}
              className="group/collapsible"
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors">
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
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-xs font-medium">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || "User Name"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || "user@example.com"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
