import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The panel — a ruled block, not a card.
 *
 * §06 does not list a card among the primitives, and the one idea of the
 * system is "the paper it replaces": structure stays square, which is exactly
 * why nothing here needs a shadow to look like a card. This file arrived as
 * stock shadcn — `rounded-xl border py-6 shadow-sm` — and every surface built
 * on it inherited a 12px radius and a drop shadow the token block never
 * declared.
 *
 * It is kept under its shadcn name because seven surfaces import it, and one
 * conforming implementation is better than seven hand-rolled panels. What it
 * renders now is E0, radius 0, a hairline, and token spacing.
 */

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-[var(--space-16)] border border-border py-[var(--space-16)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-[var(--space-8)] px-[var(--space-16)] has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-[var(--space-16)]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("type-t2", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-[length:var(--ui-size)]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-[var(--space-16)]", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-[var(--space-16)] [.border-t]:pt-[var(--space-16)]", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
