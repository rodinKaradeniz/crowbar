import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel, type StaffRole } from "@/lib/permissions";

interface RoleRestrictedProps {
  /** What the page is, in the operator's words — "Cost control", "Staff". */
  surface: string;
  /** The role the signed-in user actually holds. */
  role: StaffRole | string | null | undefined;
}

/**
 * Shown when a page exists and its module is on, but this role does not cover
 * it. Deliberately distinct from `ModuleDisabled`: "your venue has not bought
 * this" and "your job does not include this" are different answers, and telling
 * an operator the wrong one sends them to a settings page that cannot help.
 *
 * The server enforces the same boundary; this only saves the round trip.
 */
export function RoleRestricted({ surface, role }: RoleRestrictedProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-3">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Not part of your role</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{surface}</span> is not
            available to the{" "}
            <span className="font-medium text-foreground">{roleLabel(role)}</span>{" "}
            role. Ask an owner or manager if you need access.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/business/overview">Back to Overview</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
