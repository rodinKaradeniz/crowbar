"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function BusinessRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { meContext, isLoading } = useAuth();
  const isOnboarding = pathname.startsWith("/business/onboarding");
  const needsOnboarding = meContext?.business.onboardingComplete === false;

  useEffect(() => {
    if (!isLoading && needsOnboarding && !isOnboarding) {
      router.replace("/business/onboarding");
    }
  }, [isLoading, isOnboarding, needsOnboarding, router]);

  if (!isOnboarding && (isLoading || needsOnboarding)) {
    return (
      <div className="page-pad text-sm text-muted-foreground" role="status">
        Loading workspace…
      </div>
    );
  }

  return children;
}
