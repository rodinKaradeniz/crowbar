"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BusinessDocsNavSection } from "@/lib/docs/business-docs-nav";

export function BusinessDocsShell({
  nav,
  children,
}: {
  nav: BusinessDocsNavSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 p-4 md:flex-row md:gap-8 md:p-6">
      {/* Sticks from --workspace-header, not 0. At `top-0` this pinned itself
          to the viewport top, which is UNDERNEATH the 76px topbar, so the
          section label and the first entries were hidden the moment the page
          scrolled — the defect that prompted this pass. The max-height is the
          same number so the nav can scroll inside whatever is left. */}
      <aside className="w-full shrink-0 md:sticky md:top-[var(--workspace-header)] md:max-h-[calc(100svh-var(--workspace-header))] md:w-56 md:overflow-y-auto">
        <nav className="space-y-6 border border-border bg-card p-3">
          {nav.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                          active &&
                            "bg-accent font-medium text-accent-foreground",
                        )}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
