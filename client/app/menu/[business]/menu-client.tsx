"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClientApiError,
  clientCreateTableSession,
  clientGetCurrentTableSession,
  clientGetPublicMenus,
  clientGetOrderingSettings,
} from "@/lib/client-api";
import type { Menu, MenuItem, ModifierGroup, SelectedModifier } from "@/types";
import {
  type CartItem,
  addCartEntry,
  cartItemCount,
  cartTotal,
  modifierTotal,
  toggleModifier,
} from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";

interface MenuClientProps {
  businessId: string;
  businessSlug: string;
  businessName: string;
}

export default function MenuClient({ businessId, businessSlug, businessName }: MenuClientProps) {
  const { currencyCode, locale, taxLabel } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableSessionStatus, setTableSessionStatus] = useState<string | null>(null);

  // Which category the guest is currently reading, for the nav. Derived from
  // the page, never from the click: a guest who scrolls past three sections
  // has moved just as surely as one who tapped.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Item detail sheet
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [sheetMods, setSheetMods] = useState<SelectedModifier[]>([]);
  const [sheetNotes, setSheetNotes] = useState("");
  const [sheetQty, setSheetQty] = useState(1);

  useEffect(() => {
    void clientGetOrderingSettings(businessId)
      .then((s) => setIsAcceptingOrders(s.isAcceptingOrders))
      .catch(() => {});

    clientGetPublicMenus(businessId)
      .then(setMenus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  // The bootstrap CREATES a session — a real mutation — so it runs once per
  // business. React StrictMode invokes effects twice in dev: the first pass
  // stripped the fragment and created the session, and the second, now
  // fragment-less, asked for the "current" session, 404'd before the cookie had
  // landed and cleared what the first pass had established. The ref survives
  // the simulated remount; a plain `cancelled` flag did not, it just discarded
  // the successful first pass. Dev-only, but dev is the configuration a demo is
  // given from.
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (bootstrappedFor.current === businessId) return;
    bootstrappedFor.current = businessId;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tableToken = fragment.get("table_token");
    if (tableToken) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const nonceKey = `crowbar-table-browser-${businessId}`;
    let nonce = localStorage.getItem(nonceKey);
    if (!nonce) {
      nonce = crypto.randomUUID();
      localStorage.setItem(nonceKey, nonce);
    }
    const bootstrap = tableToken
      ? clientCreateTableSession(businessId, tableToken, nonce)
      : clientGetCurrentTableSession(businessId);
    void bootstrap
      .then((session) => setTableSessionStatus(session.status))
      // A failed bootstrap IS authoritative: there is no session to show. A
      // rotated QR must not unlock ordering.
      .catch(() => setTableSessionStatus(null));
  }, [businessId]);

  useEffect(() => {
    if (tableSessionStatus !== "pending") return;
    const id = window.setInterval(() => {
      void clientGetCurrentTableSession(businessId)
        .then((session) => setTableSessionStatus(session.status))
        .catch((cause) => {
          // A transient read failure is not evidence the session is gone.
          // Clearing here also clears this effect's own guard, which stops the
          // interval and strands the guest with no recovery but a reload — so
          // only the server's authoritative "no such session" (404) clears it.
          if (cause instanceof ClientApiError && cause.status === 404) {
            setTableSessionStatus(null);
          }
        });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [businessId, tableSessionStatus]);

  function openItem(item: MenuItem) {
    setSelectedItem(item);
    setSheetMods([]);
    setSheetNotes("");
    setSheetQty(1);
  }

  function toggleMod(group: ModifierGroup, mod: { id: string; name: string; priceDelta: number }) {
    setSheetMods((prev) => toggleModifier(prev, group, mod));
  }

  function addToCart() {
    if (!selectedItem) return;
    setCart((prev) =>
      addCartEntry(prev, {
        item: selectedItem,
        quantity: sheetQty,
        selectedModifiers: sheetMods,
        notes: sheetNotes,
      }),
    );
    setSelectedItem(null);
  }

  // Which menus are being served is decided server-side; a menu outside its
  // window never arrives here at all. Categories are flattened only for the
  // sticky nav — the list itself stays grouped, so a guest can see which menu a
  // price belongs to when two are open at once.
  const openMenus = menus.filter((m) => m.categories.some((c) => c.isActive));
  const navCategories = openMenus.flatMap((m) => m.categories.filter((c) => c.isActive));
  // A stable dependency for the observer below: the identities being watched,
  // not the array literal a render happens to have produced.
  const navCategoryKey = navCategories.map((c) => c.id).join(",");

  // How the menu states its prices, taken from the items themselves rather than
  // asserted. Mixed bases (drinks at one rate, food at another) say nothing at
  // all: a menu-wide claim that is true of only half the list is worse than no
  // line. These are the venue's own configured operational rates, not a fiscal
  // statement — see docs/PRODUCT.md on the tax profile boundary.
  const priceBases = new Set(
    openMenus
      .flatMap((m) => m.categories.filter((c) => c.isActive))
      .flatMap((c) => c.items.filter((i) => i.isAvailable))
      .map((i) => i.priceIncludesTax)
      .filter((v) => v !== undefined),
  );
  const priceBasis = priceBases.size === 1 ? [...priceBases][0] : null;

  const totalItems = cartItemCount(cart);
  const totalPrice = cartTotal(cart);

  // Mark the category the guest has scrolled to, and keep it in view in a nav
  // that scrolls sideways on a narrow screen. An IntersectionObserver rather
  // than a scroll listener: it fires when a section crosses the line, not on
  // every frame of the way there.
  useEffect(() => {
    const ids = navCategoryKey ? navCategoryKey.split(",") : [];
    if (ids.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("cat-", "");
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // The first one in menu order that is on screen — the heading a guest
        // reading downwards is under, not whichever crossed most recently.
        setActiveCategoryId(ids.find((id) => visible.has(id)) ?? null);
      },
      // The top edge is the nav's own measured height, so the reading line sits
      // exactly where the guest's first unobstructed row of the menu is; the
      // bottom cut stops a section barely peeking in from claiming to be the
      // one being read.
      { rootMargin: `-${navRef.current?.offsetHeight ?? 0}px 0px -55% 0px` },
    );
    const sections = ids
      .map((id) => document.getElementById(`cat-${id}`))
      .filter((el): el is HTMLElement => el !== null);
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [navCategoryKey]);

  // Only the nav's own scroller moves — `scrollIntoView` would walk every
  // ancestor and fight the page scroll that triggered this in the first place.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeCategoryId) return;
    if (nav.scrollWidth <= nav.clientWidth) return;
    const link = nav.querySelector<HTMLElement>(`[data-category="${activeCategoryId}"]`);
    if (!link) return;
    nav.scrollTo({
      left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [activeCategoryId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-16" role="status" aria-label="Opening the menu">
        <header className="px-6 pt-10 pb-6 text-center">
          <h1 className="type-d3">{businessName}</h1>
          <div className="border-t border-border mt-5 mx-auto max-w-36" />
        </header>
        <div className="border-b border-border">
          <div className="flex justify-center gap-6 px-6 py-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} index={i} className="h-[1em] w-20" />
            ))}
          </div>
        </div>
        {/* The same column, the same heading rule, the same row rhythm the real
            list uses — so nothing moves when the menu lands. */}
        <div className="px-6 mt-8 max-w-xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <Skeleton className="h-[1em] w-24" />
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-4">
                <div className="flex items-baseline gap-3">
                  <Skeleton index={i} className="h-[1em] w-40" />
                  <span className="flex-1" aria-hidden />
                  <Skeleton index={i} className="h-[1em] w-12 shrink-0" />
                </div>
                <Skeleton index={i} className="h-[1em] w-full max-w-64 mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Nothing open is a real answer, not a failure: every menu may simply be
  // outside its window right now. Say that rather than implying the venue
  // never set one up.
  if (openMenus.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {/* No illustration — docs/DESIGN.md § the six states. The masthead stays
            so a guest who has just scanned a code still sees where they are. */}
        <div className="px-6 text-center enter-rise">
          <h1 className="type-d3">{businessName}</h1>
          <div className="border-t border-border mt-5 mb-6 mx-auto max-w-36" />
          <p className="type-t1 font-normal">Nothing is being served right now</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            The menu comes back when the next service opens. A member of staff can tell you when that is.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-background", cart.length > 0 ? "pb-32" : "pb-16")}>

      {/* Masthead — set like the cover of a printed list */}
      <header className="px-6 pt-10 pb-6 text-center enter-rise">
        {tableSessionStatus && <p className="type-label text-muted-foreground mb-2">Table ordering</p>}
        <h1 className="type-d3">{businessName}</h1>
        <div className="border-t border-border mt-5 mx-auto max-w-36" />
      </header>

      {/* Ordering paused.
          NEUTRAL, deliberately: docs/DESIGN.md classifies "ordering paused by a
          manager" as neutral — a deliberate setting is not a failure, and the
          menu itself is still perfectly readable. It is loud by position and
          weight instead. This carried the critical tokens before. */}
      {!isAcceptingOrders && (
        <div className="mx-auto mb-6 max-w-xl px-6">
          <div className="border-y border-border bg-muted/50 px-4 py-3 text-center">
            <p className="type-label text-muted-foreground">Ordering paused</p>
            <p className="text-sm text-muted-foreground mt-1">
              You can still read the menu. Order with a member of staff for now.
            </p>
          </div>
        </div>
      )}

      {/* Category nav — centred while it fits, scrolling sideways when it does
          not. `w-max mx-auto` is what does both: the auto margins collapse to
          zero the moment the row is wider than the rail, so a long menu starts
          at its first category rather than mid-list. */}
      <nav
        aria-label="Menu categories"
        className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border enter-rise"
        style={{ animationDelay: "80ms" }}
      >
        <div ref={navRef} className="overflow-x-auto scrollbar-hide">
          <div className="flex w-max mx-auto gap-6 px-6 py-3">
            {navCategories.map((cat) => {
              const isActive = cat.id === activeCategoryId;
              return (
                <a
                  key={cat.id}
                  href={`#cat-${cat.id}`}
                  data-category={cat.id}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "type-label shrink-0 border-b pb-1 transition-colors",
                    // Brand marks the active nav item — identity, never a rank.
                    isActive
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-primary hover:border-primary/60",
                  )}
                >
                  {cat.name}
                </a>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Menu items, grouped by menu.
          Several menus can be open at once — an always-on one plus a windowed
          one — and the same drink can legitimately appear in both at different
          prices. The menu name above its categories is what tells a guest which
          list a price belongs to. With a single menu open the heading is
          dropped: naming one thing is noise. */}
      <div className="px-6 space-y-10 mt-8 max-w-xl mx-auto">
        {/* The guest projection carries no menu id — a browser never submits
            one, so `PublicMenuResponse` does not send one (server/app/schemas/
            menu.py). Keying on `m.id` was therefore keying on `undefined`,
            which React reads as no key at all. The position in a
            server-ordered list that is never reordered, filtered or edited on
            this page is the honest key. */}
        {openMenus.map((m, menuIndex) => (
          <section key={`menu-${menuIndex}`} className="space-y-10">
            {openMenus.length > 1 && (
              <div className="text-center">
                <h2 className="type-t1 font-normal">{m.name}</h2>
                {m.description && (
                  <p className="text-xs leading-relaxed text-muted-foreground mt-1">
                    {m.description}
                  </p>
                )}
              </div>
            )}
            {m.categories
              .filter((c) => c.isActive)
              .map((cat, catIndex) => (
                <section
                  key={cat.id}
                  id={`cat-${cat.id}`}
                  className="scroll-mt-16 enter-rise"
                  style={{ animationDelay: `${Math.min(catIndex, 4) * 90 + 140}ms` }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <h2 className="type-label text-muted-foreground">{cat.name}</h2>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                  <div className="divide-y divide-border/60">
                    {cat.items
                      .filter((i) => i.isAvailable)
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => openItem(item)}
                          className="group w-full text-left py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {/* The ledger row: name left, price right, the space
                              between them doing the work leader dots do on
                              paper. */}
                          <div className="flex items-baseline gap-3">
                            <span className="min-w-0 font-medium text-sm group-hover:text-primary transition-colors">
                              {item.name}
                            </span>
                            <span className="flex-1" aria-hidden />
                            <span className="type-data shrink-0 group-hover:text-primary transition-colors">
                              {money(item.price)}
                            </span>
                          </div>
                          {/* The inset keeps the description clear of the price
                              column at reading widths; on a phone that gutter
                              costs a whole line, so it starts at 640. */}
                          {item.description && (
                            <p className="text-xs leading-relaxed text-muted-foreground mt-1.5 phone:pr-10 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </button>
                      ))}
                  </div>
                </section>
              ))}
          </section>
        ))}

        {/* The back page of a printed list: how the prices are stated, said
            once. Omitted entirely when the menu mixes bases — a claim true of
            half the list is worse than no line. */}
        {priceBasis !== null && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            {priceBasis ? `Prices include ${taxLabel}` : `Prices exclude ${taxLabel}`}
          </p>
        )}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur">
          <div className="border-t border-border" />
          <div className="p-4 max-w-xl mx-auto">
            {isAcceptingOrders && tableSessionStatus === "approved" ? (
              <Link
                href={`/order/${businessSlug}`}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(cart));
                  }
                }}
              >
                <Button className="w-full" size="md">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  View cart · {totalItems} item{totalItems !== 1 ? "s" : ""} ·{" "}
                  <span className="font-mono tabular-nums">{money(totalPrice)}</span>
                </Button>
              </Link>
            ) : (
              <Button className="w-full" size="md" disabled>
                <ShoppingCart className="h-5 w-5 mr-2" />
                {isAcceptingOrders
                  ? tableSessionStatus === "pending"
                    ? "Waiting for staff approval"
                    : "Scan your table QR to order"
                  : "Ordering unavailable"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Item detail sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="type-t1 font-normal">{selectedItem.name}</SheetTitle>
                {selectedItem.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedItem.description}</p>
                )}
                <p className="type-data">{money(selectedItem.price)}</p>
              </SheetHeader>

              <div className="space-y-5 mt-4 px-[var(--space-16)]">
                {selectedItem.modifierGroups.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="type-label text-muted-foreground">{group.name}</p>
                      {group.required && <Badge tone="neutral" className="text-xs">Required</Badge>}
                    </div>
                    <div className="space-y-2.5">
                      {group.modifiers.filter((m) => m.isAvailable).map((mod) => (
                        <div key={mod.id} className="flex items-center gap-2.5">
                          <Checkbox
                            id={mod.id}
                            checked={sheetMods.some((m) => m.modifierId === mod.id)}
                            onCheckedChange={() =>
                              toggleMod(group, { id: mod.id, name: mod.name, priceDelta: mod.priceDelta })
                            }
                          />
                          <Label htmlFor={mod.id} className="flex-1 text-sm cursor-pointer">
                            {mod.name}
                          </Label>
                          {mod.priceDelta > 0 && (
                            <span className="font-mono tabular-nums text-xs text-muted-foreground">
                              +{money(mod.priceDelta)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <Label className="type-label text-muted-foreground">Special request (optional)</Label>
                  <Textarea
                    className="mt-2"
                    rows={2}
                    value={sheetNotes}
                    onChange={(e) => setSheetNotes(e.target.value)}
                    placeholder="E.g. no onions"
                  />
                </div>
              </div>

              <SheetFooter className="mt-4 flex-col gap-3">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setSheetQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center type-data">{sheetQty}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setSheetQty((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button className="w-full" onClick={addToCart}>
                  Add to cart ·{" "}
                  <span className="font-mono tabular-nums">
                    {money(
                      (selectedItem.price + modifierTotal(sheetMods)) * sheetQty,
                    )}
                  </span>
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
