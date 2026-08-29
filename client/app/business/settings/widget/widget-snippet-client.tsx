"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Code2, ExternalLink } from "lucide-react";

interface WidgetSnippetClientProps {
  slug: string;
}

export default function WidgetSnippetClient({ slug }: WidgetSnippetClientProps) {
  const [copied, setCopied] = useState(false);

  const widgetBaseUrl =
    process.env.NEXT_PUBLIC_WIDGET_BASE_URL || "https://crowbar.example";
  const snippet = `<script src="${widgetBaseUrl}/widget.js" data-business="${slug}"></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard
      const el = document.createElement("textarea");
      el.value = snippet;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
      <div>
        <h1 className="type-t1">Booking Widget</h1>
        <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
          Embed your booking form on any website with a single line of code
        </p>
      </div>

      {/* Preview */}
      <div className="rounded-lg border p-6 bg-card space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Embed snippet</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste this script tag anywhere on your website where you want the &quot;Book Now&quot; button to appear.
        </p>
        <div className="relative">
          <pre className="rounded-md bg-muted px-4 py-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {snippet}
          </pre>
          <Button
            size="filter"
            variant="secondary"
            className="absolute top-2 right-2"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border p-6 bg-card space-y-4">
        <h2 className="font-medium text-sm">How it works</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Copy the snippet above and paste it into your website&apos;s HTML.</li>
          <li>A &quot;Book Now&quot; button will appear where you placed the script tag.</li>
          <li>Clicking the button opens your booking form in a modal overlay.</li>
          <li>Customers can complete the reservation without leaving your website.</li>
        </ol>
      </div>

      {/* Preview link */}
      <div className="rounded-lg border p-4 bg-muted/30 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Preview your booking page</p>
          <p className="text-xs text-muted-foreground mt-0.5">See how customers experience your public profile</p>
        </div>
        <a href={`/reserve/${slug}`} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="filter">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open preview
          </Button>
        </a>
      </div>
    </div>
  );
}
