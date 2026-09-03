"use client";

import { Bell, BookOpen, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Identity } from "@/components/account-menu";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { isNavItemActive, type NavGroup, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The phone navigation — below `--bp-phone` only.
 *
 * THE PHONE IS THE THIRD SHAPE OF ONE NAVIGATION, not a third navigation.
 * Desktop has a 228px rail, tablet a 76px bottom bar, and both take their
 * entries from `useWorkspaceNav`; this takes the same `groups`, so all three
 * agree about what an operator may open. What changes is the shape, and the
 * shape changes because the device does: a bottom bar with five fixed slots is
 * a tablet answer — 1024px of width to spend and a thumb resting at the bottom
 * edge — and on a 390px phone the same five slots are 78px each.
 *
 * It comes from the LEFT, where the rail is on a wide screen. The notification
 * panel and every other sheet in the workspace come from the right, so the side
 * is what distinguishes "where am I going" from "what is happening".
 *
 * SEARCH AND NOTIFICATIONS ARE ROWS HERE, not header buttons. On a phone the
 * header is one line — venue name and service clock on the left, this menu on
 * the right — and there is no room for a search field, a bell and a name
 * without wrapping to two. Neither row owns its panel: both call back to the
 * topbar, which closes this sheet and opens the panel, because a sheet unmounts
 * its own contents and would take a nested panel down with it.
 *
 * The nav is flat — every group, every entry, no second disclosure. The sheet
 * is already the disclosure, and nesting one inside it costs two taps to reach
 * one page on the device where taps are most expensive. That is the same rule
 * the bottom bar's "More" sheet follows.
 */
export function BusinessMobileNav({
  open,
  onOpenChange,
  groups,
  queueCount,
  onOpenSearch,
  onOpenNotifications,
  unreadCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  queueCount: number | null;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const { user, meContext } = useAuth();
  const currentRole =
    meContext?.role ?? (user?.type === "staff" ? user.role : undefined);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[min(320px,86vw)] flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-[9px]">
            <span className="mkt-logo-mark block bg-primary" aria-hidden />
            <span className="font-display text-[17px] font-extrabold tracking-[-0.035em]">
              CROWBAR
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col border-b border-border">
          <SheetRow
            icon={<Search aria-hidden className="size-4 shrink-0" />}
            label="Search"
            onClick={onOpenSearch}
          />
          <SheetRow
            icon={<Bell aria-hidden className="size-4 shrink-0" />}
            label="Notifications"
            onClick={onOpenNotifications}
            trailing={
              unreadCount > 0 ? (
                <Badge tone="neutral">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              ) : null
            }
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Workspace">
          {groups.map((group) => (
            <div key={group.label} className="px-4 pt-5 pb-1 last:pb-4">
              <p className="type-micro mb-1 text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-col">
                {group.items.map((item) => (
                  <MobileNavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    queueCount={queueCount}
                    onNavigate={() => onOpenChange(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Who is signed in, and what belongs to them — pinned to the foot,
            furthest from the entries, the same order the desktop rail uses.

            Settings and Docs are LISTED here rather than hidden behind a
            second menu. On the rail they sit in a popover because the rail is
            permanent and its foot is one line; this sheet is already the
            disclosure, and nesting a menu inside it would cost two taps on the
            device where taps are most expensive — the same rule the nav above
            follows. */}
        <div className="shrink-0 border-t border-border p-4">
          {user?.name ? (
            <div className="mb-2 flex items-center gap-2.5">
              <Identity name={user.name} role={currentRole} />
            </div>
          ) : null}

          <FootLink
            href="/business/settings/profile"
            icon={<Settings aria-hidden className="size-4 shrink-0" />}
            label="Settings"
            onNavigate={() => onOpenChange(false)}
          />
          <FootLink
            href="/business/docs"
            icon={<BookOpen aria-hidden className="size-4 shrink-0" />}
            label="Docs"
            onNavigate={() => onOpenChange(false)}
          />
          <SignOutButton className="min-h-[var(--control-tablet-min)] w-full px-2" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Search and Notifications: a control, not a destination — so not a <Link>. */
function SheetRow({
  icon,
  label,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[var(--control-tablet-min)] items-center gap-2.5 px-4 text-left text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

/**
 * One entry, and any entry that belongs to it.
 *
 * `--control-tablet-min` is the row height, not the desktop 44: this list is
 * only ever touched. Children are indented behind a hairline rather than hidden
 * behind a disclosure — the same call the rail makes, for the same reason.
 */
function MobileNavItem({
  item,
  pathname,
  queueCount,
  onNavigate,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  queueCount: number | null;
  onNavigate: () => void;
  nested?: boolean;
}) {
  const active = isNavItemActive(item, pathname);

  return (
    <>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[var(--control-tablet-min)] items-center gap-2.5",
          "rounded-[var(--radius-3)] px-2 text-[length:var(--ui-size)]",
          active
            ? "bg-accent font-semibold text-foreground shadow-[inset_2px_0_0_var(--primary)]"
            : "text-muted-foreground",
        )}
      >
        {item.label}
        {item.badge === "queue" && queueCount ? (
          <Badge className="ml-auto" tone="neutral">
            {queueCount > 99 ? "99+" : queueCount}
          </Badge>
        ) : null}
      </Link>

      {item.children?.length && !nested ? (
        <div className="ml-2 flex flex-col border-l border-border pl-1.5">
          {item.children.map((child) => (
            <MobileNavItem
              key={child.href}
              item={child}
              pathname={pathname}
              queueCount={queueCount}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Settings / Docs at the foot: destinations, so a <Link>, not a SheetRow. */
function FootLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-[var(--control-tablet-min)] items-center gap-2.5 rounded-[var(--radius-3)] px-2 text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
