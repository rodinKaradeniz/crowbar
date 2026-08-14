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
  Code2,
  ChefHat,
  ClipboardList,
  Package,
  Puzzle,
  ListOrdered,
  Receipt,
  Users,
  Wine,
  Armchair,
  Landmark,
} from "lucide-react";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useMounted } from "@/hooks/use-mounted";
import { clientGetBusiness, clientGetQueueActiveCount } from "@/lib/client-api";
import { hasModule as _hasModule, ModuleKey } from "@/lib/modules";
import { useEffect, useRef, useState } from "react";
import { Business } from "@/types";

/**
 * Shared business sidebar content — used in both the inset sidebar and the floating sidebar.
 */
function BusinessSidebarContentInner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, meContext, logout } = useAuth();
  const currentRole = meContext?.role ?? (user?.type === "staff" ? user.role : undefined);
  const canManageBusiness = currentRole === "owner" || currentRole === "manager";

  // Default to showing all items while meContext is still loading
  const hasModule = (m: ModuleKey) =>
    !meContext || _hasModule(meContext.enabledModules, m);
  const [business, setBusiness] = useState<Business | null>(null);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const queuePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user?.type === "staff" && user.businessId) {
      clientGetBusiness(user.businessId).then((data) => {
        if (data) setBusiness(data);
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.type !== "staff" || !hasModule("queue")) return;
    const businessId = user.businessId;

    const refresh = () => {
      clientGetQueueActiveCount(businessId)
        .then(setQueueCount)
        .catch(() => {});
    };

    refresh();
    queuePollRef.current = setInterval(refresh, 30_000);
    return () => {
      if (queuePollRef.current) clearInterval(queuePollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  const businessSubItems = [
    { title: "Info", url: "/business/profile/info", icon: Info },
    { title: "Booking", url: "/business/profile/booking", icon: CalendarCog },
    { title: "Hours", url: "/business/profile/hours", icon: Clock },
    { title: "Types", url: "/business/profile/types", icon: Tag },
  ];

  const settingsSubItems = [
    { title: "Profile", url: "/business/settings/profile", icon: User },
    { title: "Account", url: "/business/settings/account", icon: ShieldCheck },
    ...(canManageBusiness
      ? [
          { title: "Modules", url: "/business/settings/modules", icon: Puzzle },
          { title: "Region & tax", url: "/business/settings/region-tax", icon: Landmark },
          { title: "Widget", url: "/business/settings/widget", icon: Code2 },
        ]
      : []),
  ];

  const isBusinessActive = pathname.startsWith("/business/profile");
  const isSettingsActive = pathname.startsWith("/business/settings");

  return (
    <>
      <SidebarHeader>
        {business && (
          <div className="p-4 border-b group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-full overflow-hidden bg-muted shrink-0">
                {business.image ? (
                  <Image
                    src={business.image}
                    alt={business.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <span className="text-lg font-medium">
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
      </SidebarHeader>

      <SidebarContent>
        {/* Overview */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/business/overview"}
                  tooltip="Overview"
                >
                  <Link href="/business/overview">
                    <LayoutDashboard />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reservations — guarded by "reservations" module */}
        {hasModule("reservations") && (
          <SidebarGroup>
            <SidebarGroupLabel>Reservations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { title: "Reservations", url: "/business/reservations", icon: Calendar },
                  { title: "Requests", url: "/business/requests", icon: Bell },
                  { title: "Schedule", url: "/business/schedule", icon: Clock },
                ].map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Floor — shared operational board for reservation, queue, and ordering work */}
        {(hasModule("reservations") || hasModule("queue") || hasModule("ordering")) && (
          <SidebarGroup>
            <SidebarGroupLabel>Service</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/floor"}
                    tooltip="Floor"
                  >
                    <Link href="/business/floor">
                      <Armchair />
                      <span>Floor</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Queue — guarded by "queue" module */}
        {hasModule("queue") && (
          <SidebarGroup>
            <SidebarGroupLabel>Queue</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/queue"}
                    tooltip="Queue"
                  >
                    <Link href="/business/queue">
                      <ListOrdered />
                      <span>Queue</span>
                      {queueCount !== null && queueCount > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {queueCount > 99 ? "99+" : queueCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Ordering — guarded by "ordering" module */}
        {hasModule("ordering") && (
          <SidebarGroup>
            <SidebarGroupLabel>Ordering</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/orders"}
                    tooltip="Orders"
                  >
                    <Link href="/business/orders">
                      <ClipboardList />
                      <span>Orders</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/tabs"}
                    tooltip="Tabs"
                  >
                    <Link href="/business/tabs">
                      <Receipt />
                      <span>Tabs</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/menu"}
                    tooltip="Menu"
                  >
                    <Link href="/business/menu">
                      <ChefHat />
                      <span>Menu</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/happy-hour"}
                    tooltip="Happy Hour"
                  >
                    <Link href="/business/happy-hour">
                      <Wine />
                      <span>Happy Hour</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Inventory — guarded by "inventory" module */}
        {hasModule("inventory") && (
          <SidebarGroup>
            <SidebarGroupLabel>Inventory</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/inventory"}
                    tooltip="Stock"
                  >
                    <Link href="/business/inventory">
                      <Package />
                      <span>Stock</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Insights — guarded by "insights" module */}
        {hasModule("insights") && (
          <SidebarGroup>
            <SidebarGroupLabel>Insights</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/business/insights"}
                    tooltip="Insights"
                  >
                    <Link href="/business/insights">
                      <BrainCircuit />
                      <span>Insights</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Workspace — always visible */}
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/business/staff"}
                  tooltip="Staff"
                >
                  <Link href="/business/staff">
                    <Users />
                    <span>Staff</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/business/customers"}
                  tooltip="Customers"
                >
                  <Link href="/business/customers">
                    <UserCircle />
                    <span>Customers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/business/docs")}
                  tooltip="Docs"
                >
                  <Link href="/business/docs">
                    <BookOpen />
                    <span>Docs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Collapsible Business Menu */}
              {canManageBusiness && <Collapsible
                defaultOpen={isBusinessActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isBusinessActive}
                      tooltip="Business"
                    >
                      <Building2 />
                      <span>Business</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {businessSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === item.url}
                          >
                            <Link href={item.url}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>}

              {/* Collapsible Settings Menu */}
              <Collapsible
                defaultOpen={isSettingsActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isSettingsActive}
                      tooltip="Settings"
                    >
                      <Settings />
                      <span>Settings</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {settingsSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === item.url}
                          >
                            <Link href={item.url}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* Expanded: user info row + logout */}
        <div className="group-data-[collapsible=icon]:hidden">
          <Separator />
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="relative h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.name || "User"}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <span className="text-sm font-medium">
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
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Collapsed icon mode */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Log out">
                <LogOut />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </>
  );
}

/** Radix (Tooltip, Collapsible) ids can mismatch SSR vs hydration — render after mount. */
function BusinessSidebarHydrationFallback() {
  return (
    <>
      <SidebarHeader>
        <div
          className="h-16 shrink-0 border-b border-sidebar-border bg-sidebar-accent/30"
          aria-hidden
        />
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col gap-2 p-2" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-sidebar-accent/40" />
          ))}
        </div>
      </SidebarContent>
    </>
  );
}

export function BusinessSidebarContent() {
  const mounted = useMounted();
  if (!mounted) {
    return <BusinessSidebarHydrationFallback />;
  }
  return <BusinessSidebarContentInner />;
}
