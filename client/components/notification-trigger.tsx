"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  Briefcase,
  User2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  clientGetNotifications,
  clientGetUnreadNotificationCount,
  clientMarkAllNotificationsRead,
  clientMarkNotificationRead,
} from "@/lib/client-api";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function getDayLabel(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (itemDay.getTime() === today.getTime()) return "Today";
  if (itemDay.getTime() === yesterday.getTime()) return "Yesterday";
  return "Earlier";
}

function groupByDay(items: Notification[]) {
  const order: ("Today" | "Yesterday" | "Earlier")[] = [
    "Today",
    "Yesterday",
    "Earlier",
  ];
  const groups: Record<string, Notification[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  for (const n of items) {
    groups[getDayLabel(n.createdAt)].push(n);
  }
  return order.filter((k) => groups[k].length > 0).map((k) => ({ label: k, items: groups[k] }));
}

function kindIcon(kind: string) {
  if (kind === "queue_join") {
    return <Users className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  if (kind === "queue_leave") {
    return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />;
  }
  if (kind === "queue_called") {
    return <Bell className="h-4 w-4 shrink-0 text-amber-500" />;
  }
  if (kind === "queue_accepted") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (kind.includes("reservation") || kind.includes("booking")) {
    return <Calendar className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  if (kind.includes("confirmed") || kind.includes("approved")) {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (kind.includes("cancel") || kind.includes("rejected") || kind.includes("declined")) {
    return <XCircle className="h-4 w-4 shrink-0 text-rose-500" />;
  }
  if (kind.includes("remind") || kind.includes("upcoming")) {
    return <Clock className="h-4 w-4 shrink-0 text-amber-500" />;
  }
  return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

// ─── skeleton ────────────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div
              className="h-3.5 rounded bg-muted animate-pulse"
              style={{ width: `${65 + i * 10}%` }}
            />
            <div className="h-3 rounded bg-muted animate-pulse w-4/5" />
            <div className="h-3 rounded bg-muted animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function NotificationTrigger() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track which notification IDs we've already seen so we can detect truly new ones
  const knownIdsRef = useRef<Set<string>>(new Set());
  const prevUnreadRef = useRef<number>(0);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  const fetchAndToastNewNotifications = useCallback(async () => {
    try {
      const list = await clientGetNotifications();
      const newOnes = list.filter(
        (n) => !n.readAt && !knownIdsRef.current.has(n.id),
      );
      // Update known IDs
      list.forEach((n) => knownIdsRef.current.add(n.id));

      // Fire a toast for each new unread notification
      for (const n of newOnes) {
        toast(n.title, { description: n.body });
      }

      // If panel is open, refresh the displayed list too
      if (openRef.current) {
        setItems(list);
        setUnread(list.filter((n) => !n.readAt).length);
      }

      return list.filter((n) => !n.readAt).length;
    } catch {
      return null;
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const c = await clientGetUnreadNotificationCount();
      const prev = prevUnreadRef.current;
      prevUnreadRef.current = c;
      setUnread(c);

      // If count increased and the tab is visible, surface the new ones as toasts
      if (c > prev && document.visibilityState === "visible") {
        await fetchAndToastNewNotifications();
      }
    } catch {
      /* unauthenticated or network */
    }
  }, [fetchAndToastNewNotifications]);

  useEffect(() => {
    refreshUnread();
    const interval = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshUnread]);

  useEffect(() => {
    const onFocus = () => void refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    setLoadError(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await clientGetNotifications();
        if (!cancelled) {
          // Seed known IDs so background poll won't re-toast these
          list.forEach((n) => knownIdsRef.current.add(n.id));
          setItems(list);
          setUnread(list.filter((n) => !n.readAt).length);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load notifications.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onMarkAllRead = async () => {
    try {
      await clientMarkAllNotificationsRead();
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnread(0);
    } catch {
      toast.error("Couldn't mark all as read.");
    }
  };

  const onCardClick = async (n: Notification) => {
    if (n.readAt) return;
    try {
      await clientMarkNotificationRead(n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  };

  const badge =
    unread > 0 ? (
      <span
        className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        aria-hidden
      >
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  const groups = groupByDay(items);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Bell className="h-5 w-5" />
            {badge}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Notifications
        </TooltipContent>
      </Tooltip>

      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 border-l bg-background p-0 shadow-xl sm:max-w-sm"
      >
        <SheetTitle className="sr-only">Notifications</SheetTitle>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void onMarkAllRead()}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loadError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <XCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
          ) : loading ? (
            <NotificationSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No notifications yet.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(({ label, items: groupItems }) => (
                <div key={label}>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <div className="space-y-2">
                    {groupItems.map((n) => (
                      <NotificationCard
                        key={n.id}
                        n={n}
                        onClick={() => void onCardClick(n)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── card ─────────────────────────────────────────────────────────────────────

function NotificationCard({
  n,
  onClick,
}: {
  n: Notification;
  onClick: () => void;
}) {
  const isUnread = !n.readAt;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-xl border bg-card text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isUnread
          ? "border-l-[3px] border-l-primary border-border/60"
          : "border-border/50",
      )}
    >
      <div className="flex gap-3 px-4 py-3">
        {/* icon */}
        <div className="mt-0.5 shrink-0">{kindIcon(n.kind)}</div>

        {/* content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "text-sm leading-snug",
                isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
              )}
            >
              {n.title}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatWhen(n.createdAt)}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {n.body}
          </p>

          {/* source badge */}
          {n.sourceType && (
            <div className="pt-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  n.sourceType === "staff"
                    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
                    : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
                )}
              >
                {n.sourceType === "staff" ? (
                  <Briefcase className="h-2.5 w-2.5" />
                ) : (
                  <User2 className="h-2.5 w-2.5" />
                )}
                {n.sourceType === "staff" ? "As business" : "As customer"}
              </span>
            </div>
          )}
        </div>

        {/* unread dot */}
        {isUnread && (
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </div>
    </button>
  );
}
