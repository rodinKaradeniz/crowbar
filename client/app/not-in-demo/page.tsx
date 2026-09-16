import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicNotInDemo } from "@/components/not-in-demo";
import { IS_DEMO } from "@/lib/demo/mode";

export const metadata: Metadata = {
  title: "Not in the demo · Crowbar",
  robots: { index: false, follow: false },
};

export default function PublicNotInDemoPage() {
  if (!IS_DEMO) notFound();
  return <PublicNotInDemo />;
}
