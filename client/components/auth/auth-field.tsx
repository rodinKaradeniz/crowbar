"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label above, 48px field, message below. Never a floating placeholder.
 *
 * `invalid` uses the form-validation channel (`--field-invalid`), which is OFF
 * the severity ladder on purpose: "Too short — 12 characters minimum" is a form
 * state, not something a bartender must handle before the night ends.
 */
export function AuthField({
  label,
  hint,
  invalid,
  className,
  inputClassName,
  trailing,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  /** Says what to do next. Rendered in the invalid colour when `invalid`. */
  hint?: React.ReactNode;
  invalid?: boolean;
  /** Goes on the wrapper — this is where callers set field spacing. */
  className?: string;
  /** Goes on the `<input>` itself, for the rare per-field override. */
  inputClassName?: string;
  /** A control inside the field row — the show/hide password toggle. */
  trailing?: React.ReactNode;
}) {
  const generated = useId();
  const id = props.id ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("block", className)}>
      <Label htmlFor={id} className="mb-[7px]">
        {label}
      </Label>

      <div className="relative">
        <Input
          {...props}
          id={id}
          inputSize="auth"
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className={cn(trailing && "pr-[68px]", inputClassName)}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-[6px] flex items-center">
            {trailing}
          </div>
        ) : null}
      </div>

      {hint ? (
        <p
          id={hintId}
          className={cn(
            "auth-hint",
            // Resolves per ground — this primitive may end up on an ink panel.
            invalid ? "text-field-invalid" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The failure block above a form: a washed panel with a 2px rule down its left
 * edge, in the form-validation colour. Carries what happened and a way out.
 */
export function AuthNotice({
  children,
  tone = "invalid",
}: {
  children: React.ReactNode;
  tone?: "invalid" | "brand";
}) {
  return (
    <div
      role="alert"
      className={cn(
        "mb-[18px] flex flex-col gap-2 border-l-2 px-[13px] py-3",
        tone === "invalid"
          ? "border-field-invalid bg-field-invalid-wash text-field-invalid"
          : "border-primary bg-brand-wash-2 text-primary",
      )}
    >
      {children}
    </div>
  );
}

/** Reveals the password after a failed attempt. 44px target, mono label. */
export function RevealToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mkt-chip flex h-9 items-center rounded-[var(--radius-2)] px-2.5 text-muted-foreground hover:text-foreground"
    >
      {shown ? "Hide" : "Show"}
    </button>
  );
}
