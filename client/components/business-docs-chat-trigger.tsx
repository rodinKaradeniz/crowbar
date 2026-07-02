"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, BookOpen, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { DocsMarkdown } from "@/components/docs-markdown";

type Role = "user" | "assistant";

type Msg = { role: Role; content: string };

function TypingDots() {
  return (
    <div
      className="flex items-center gap-1.5 py-1"
      role="status"
      aria-label="Assistant is typing"
    >
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/45 [animation-delay:-0.2s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/45 [animation-delay:-0.1s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/45" />
    </div>
  );
}

interface BusinessDocsChatTriggerProps {
  /** When provided the sheet becomes a controlled component (e.g. opened from a carousel). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the icon-button trigger — useful when opened programmatically from elsewhere. */
  hideTrigger?: boolean;
}

export function BusinessDocsChatTrigger({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: BusinessDocsChatTriggerProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/business-docs-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : res.statusText,
        );
      }
      if (typeof data.reply !== "string") {
        throw new Error("Invalid response");
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Open documentation assistant"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Ask how to use Crowbar (docs assistant)
          </TooltipContent>
        </Tooltip>
      )}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l bg-background p-0 shadow-xl sm:max-w-md"
      >
        <SheetHeader className="space-y-1 border-b px-4 py-4 text-left">
          <SheetTitle className="text-xl font-semibold tracking-tight">
            Documentation assistant
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed text-muted-foreground">
            Answers come only from in-app business documentation. Open{" "}
            <strong className="font-medium text-foreground/80">Docs</strong> in
            the sidebar for full guides.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !loading && (
              <div className="flex gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/30 p-4">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Ask where to find something or how to do a task—e.g. accepting
                  requests, connecting Google for Meet, or running{" "}
                  <span className="font-medium text-foreground/90">
                    Insights
                  </span>
                  .
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 flex justify-end"
                    : "mr-6 flex justify-start"
                }
              >
                {m.role === "user" ? (
                  <div className="max-w-[min(100%,20rem)] rounded-2xl bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                    <p className="whitespace-pre-wrap wrap-break-word">
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-full rounded-2xl bg-card px-3.5 py-2.5 text-foreground shadow-sm ring-1 ring-border">
                    <DocsMarkdown source={m.content} variant="chat" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-6 flex justify-start">
                <div className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                  <TypingDots />
                </div>
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Ask about using the dashboard…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={2}
                className="min-h-[44px] flex-1 resize-none"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
