"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The side panel — the detail surface for every screen.
 *
 * 400px (`--side-panel`), full height, right edge, E1, 180ms slide. Scrim 55%;
 * click-outside and Esc close. Under 440px it goes full width (§06).
 *
 * It always has the same structure, and screens should not invent another:
 *   header (kind + name + close) → a two-cell figure band → a definition list
 *   → history → actions in a bordered footer.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "overlay-enter fixed inset-0 z-50 bg-scrim",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  overlayClassName,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  /** Merged onto `SheetOverlay` (e.g. `bg-transparent` to remove dimming). */
  overlayClassName?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-card text-card-foreground fixed z-50 flex flex-col shadow-e1",
          
          "duration-[var(--dur-enter)] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          side === "right" &&
            // `panel:` is --breakpoint-panel (440px) in globals.css.
            "panel-enter-right inset-y-0 right-0 h-full w-full border-l panel:w-[var(--side-panel)]",
          side === "left" &&
            "panel-enter-left inset-y-0 left-0 h-full w-full border-r panel:w-[var(--side-panel)]",
          side === "top" &&
            "panel-enter-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "panel-enter-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-[var(--space-4)] border-b p-[var(--space-16)]",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      // Actions live in a bordered footer, always.
      className={cn(
        "mt-auto flex flex-col gap-[var(--space-8)] border-t p-[var(--space-16)]",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        // T1 — the panel names the kind and the thing.
        "text-foreground font-display text-[length:var(--t1-size)] leading-[var(--t1-lh)] tracking-[var(--t1-ls)] font-bold",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
