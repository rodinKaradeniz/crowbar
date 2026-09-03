"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * The way out of the workspace.
 *
 * The mechanism already existed and had no door: `logout()` has been on the
 * auth context since the beginning, but the only callers were the account
 * settings screen's three "you must sign in again" flows. There was no way for
 * an operator to sign out on purpose — on a laptop shared by a whole shift.
 *
 * NO CONFIRMATION. The system's confirm rule is for destructive or
 * shift-ending actions ("Close the night"), and this is neither: nothing is
 * lost, no service state changes, and the way back is the sign-in form that
 * this very button lands you on. A dialog here would be a second tap on the
 * safest control in the workspace.
 *
 * IT NAVIGATES EVEN IF THE REQUEST FAILS. `logout()` swallows its own errors,
 * so the local session is already cleared by the time this resolves; leaving
 * the operator standing in a workspace they believe they have left is the
 * worse of the two failures. The cookie is httpOnly and cleared server-side by
 * the route handler, so a failed call is a network problem, not an open
 * session — and signing in again reissues it either way.
 */
export function SignOutButton({ className }: { className?: string }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    await logout();
    router.push("/auth/login");
  };

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={signingOut}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-3)]",
        "text-[length:var(--ui-size)] text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
        "disabled:pointer-events-none disabled:text-control-disabled-foreground",
        className,
      )}
    >
      <LogOut aria-hidden className="size-4 shrink-0" />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
