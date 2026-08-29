"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // The Label step: 10.5 mono uppercase, .14em. Sits ABOVE the field —
        // the system has no floating placeholder.
        "flex items-center gap-2 select-none",
        "font-mono uppercase font-medium text-muted-foreground",
        "text-[length:var(--label-size)] leading-[var(--label-lh)] tracking-[var(--label-ls)]",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
