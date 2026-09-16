import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspaceNotInDemo } from "@/components/not-in-demo";
import { IS_DEMO } from "@/lib/demo/mode";

export const metadata: Metadata = { title: "Not in the demo · Crowbar" };

export default function WorkspaceNotInDemoPage() {
  if (!IS_DEMO) notFound();
  return <WorkspaceNotInDemo />;
}
