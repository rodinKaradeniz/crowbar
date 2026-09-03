"use client";

import { BookOpen, ChevronsUpDown, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { roleLabel } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Who is signed in, and the three things that belong to the person rather than
 * to the venue: their settings, the manual, and the way out.
 *
 * WHY THESE THREE LEFT THE NAV. The rail's "Business" group had grown to six
 * entries — Reports, Insights, Staff, Venue, Settings, Docs — of which the
 * last two are not places you go during service. Settings is your own account
 * and Docs is the manual; neither is a working surface, and both were sitting
 * in the same list as the reports a manager reads nightly. Behind the identity
 * block they are one click away from where a person already looks for
 * themselves, and the nav is down to the four entries that are about the
 * business.
 *
 * Sign-out lives here with them because it is the same category — an action on
 * the account, not on the venue — and because a destructive-adjacent control
 * is better one deliberate click in than sitting permanently under the cursor
 * at the bottom of the rail.
 */
export function AccountMenu({
  name,
  role,
  className,
}: {
  name: string;
  role: string | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[var(--radius-3)] p-1.5 text-left",
          "transition-colors hover:bg-secondary",
          "data-[state=open]:bg-secondary",
          className,
        )}
        aria-label={`${name} — account menu`}
      >
        <Identity name={name} role={role} />
        <ChevronsUpDown
          aria-hidden
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>

      {/* Above the trigger, aligned to the rail's own edge: the block is
          pinned to the bottom of the screen, so a menu below it has nowhere
          to go. */}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[calc(var(--rail)-24px)] p-1.5"
      >
        <MenuLink
          href="/business/settings/profile"
          icon={<Settings aria-hidden className="size-4 shrink-0" />}
          label="Settings"
          active={pathname.startsWith("/business/settings")}
          onNavigate={() => setOpen(false)}
        />
        <MenuLink
          href="/business/docs"
          icon={<BookOpen aria-hidden className="size-4 shrink-0" />}
          label="Docs"
          active={pathname.startsWith("/business/docs")}
          onNavigate={() => setOpen(false)}
        />
        <div className="my-1.5 border-t border-border" />
        <SignOutButton className="min-h-[var(--control-desktop-min)] w-full px-2" />
      </PopoverContent>
    </Popover>
  );
}

/** The same block the trigger shows, reused by the phone sheet's foot. */
export function Identity({
  name,
  role,
}: {
  name: string;
  role: string | null | undefined;
}) {
  return (
    <>
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-surface-raised font-mono text-[11px] font-semibold text-text-on-ink-2">
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="type-micro block text-muted-foreground">
          {roleLabel(role)}
        </span>
      </span>
    </>
  );
}

function MenuLink({
  href,
  icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[var(--control-desktop-min)] items-center gap-2.5",
        "rounded-[var(--radius-3)] px-2 text-[length:var(--ui-size)]",
        "transition-colors hover:bg-secondary hover:text-foreground",
        active ? "bg-accent font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
