"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function createMdComponents(variant: "page" | "chat"): Components {
  const chat = variant === "chat";

  return {
    h1: ({ className, ...p }) => (
      <h1
        className={cn(
          chat
            ? "mt-3 scroll-m-20 text-base font-semibold tracking-tight text-foreground first:mt-0"
            : "scroll-m-20 text-2xl font-semibold tracking-tight text-foreground",
          className,
        )}
        {...p}
      />
    ),
    h2: ({ className, ...p }) => (
      <h2
        className={cn(
          chat
            ? "mt-3 scroll-m-20 text-sm font-semibold tracking-tight text-foreground first:mt-0"
            : "mt-8 scroll-m-20 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground first:mt-0",
          className,
        )}
        {...p}
      />
    ),
    h3: ({ className, ...p }) => (
      <h3
        className={cn(
          chat
            ? "mt-3 scroll-m-20 text-sm font-semibold tracking-tight text-foreground first:mt-0"
            : "mt-6 scroll-m-20 text-lg font-semibold tracking-tight text-foreground",
          className,
        )}
        {...p}
      />
    ),
    h4: ({ className, ...p }) => (
      <h4
        className={cn(
          chat
            ? "mt-2 text-sm font-semibold text-foreground first:mt-0"
            : "mt-4 scroll-m-20 text-base font-semibold text-foreground",
          className,
        )}
        {...p}
      />
    ),
    p: ({ className, ...p }) => (
      <p
        className={cn(
          chat
            ? "mt-2 text-sm leading-relaxed text-foreground/90 first:mt-0"
            : "mt-3 leading-7 text-foreground/90 first:mt-0",
          className,
        )}
        {...p}
      />
    ),
    ul: ({ className, ...p }) => (
      <ul
        className={cn(
          chat
            ? "mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90"
            : "mt-3 list-disc pl-6 text-foreground/90",
          className,
        )}
        {...p}
      />
    ),
    ol: ({ className, ...p }) => (
      <ol
        className={cn(
          chat
            ? "mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground/90"
            : "mt-3 list-decimal pl-6 text-foreground/90",
          className,
        )}
        {...p}
      />
    ),
    li: ({ className, ...p }) => (
      <li className={cn(chat ? "leading-relaxed" : "mt-1", className)} {...p} />
    ),
    a: ({ className, href, ...p }) => (
      <a
        href={href}
        className={cn(
          "font-medium text-primary underline underline-offset-4 hover:text-primary/90",
          chat && "text-sm",
          className,
        )}
        {...p}
      />
    ),
    blockquote: ({ className, ...p }) => (
      <blockquote
        className={cn(
          chat
            ? "mt-2 border-l-2 border-primary/40 bg-muted/50 py-1 pl-3 text-xs text-foreground/90"
            : "mt-4 border-l-2 border-primary/40 bg-muted/50 py-1 pl-4 text-sm text-foreground/90",
          className,
        )}
        {...p}
      />
    ),
    code: ({ className, children, ...p }) => {
      const inline = !className;
      if (inline) {
        return (
          <code
            className={cn(
              "rounded bg-muted px-1.5 py-0.5 font-mono text-foreground",
              chat ? "text-xs" : "text-sm",
              className,
            )}
            {...p}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className={cn(
            "font-mono text-foreground",
            chat ? "text-xs" : "text-sm",
            className,
          )}
          {...p}
        >
          {children}
        </code>
      );
    },
    pre: ({ className, ...p }) => (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg bg-muted",
          chat ? "mt-2 p-2 text-xs" : "mt-4 p-3",
          className,
        )}
        {...p}
      />
    ),
    table: ({ className, ...p }) => (
      <div className={cn(chat ? "my-2" : "my-4", "overflow-x-auto")}>
        <table
          className={cn(
            "w-full border-collapse",
            chat ? "text-xs" : "text-sm",
            className,
          )}
          {...p}
        />
      </div>
    ),
    th: ({ className, ...p }) => (
      <th
        className={cn(
          "border border-border bg-muted/80 px-2 py-1.5 text-left font-medium",
          !chat && "px-3 py-2",
          className,
        )}
        {...p}
      />
    ),
    td: ({ className, ...p }) => (
      <td
        className={cn(
          "border border-border px-2 py-1.5",
          !chat && "px-3 py-2",
          className,
        )}
        {...p}
      />
    ),
    hr: ({ className, ...p }) => (
      <hr
        className={cn(chat ? "my-3 border-border" : "my-8 border-border", className)}
        {...p}
      />
    ),
  };
}

export function DocsMarkdown({
  source,
  variant = "page",
}: {
  source: string;
  variant?: "page" | "chat";
}) {
  const components = createMdComponents(variant);
  return (
    <div
      className={cn(
        "docs-markdown",
        variant === "page" && "max-w-3xl",
        variant === "chat" && "space-y-2 text-sm",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
