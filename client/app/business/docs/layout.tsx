import { BusinessDocsShell } from "@/components/business-docs-shell";
import { getBusinessDocsNav } from "@/lib/docs/business-docs-nav";

export default function BusinessDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav = getBusinessDocsNav();
  return <BusinessDocsShell nav={nav}>{children}</BusinessDocsShell>;
}
