import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiGetMe } from "@/lib/api-client";
import {
  ensureChunkEmbeddings,
  embedQuery,
  retrieveTopK,
  chatWithContext,
  getChunksLength,
} from "@/lib/business-docs-rag";

const TOKEN_COOKIE = "rk-token";
const TOP_K = 5;
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT = 10;

const requestBuckets = new Map<string, { startedAt: number; count: number }>();

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  if (process.env.DOCS_ASSISTANT_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Docs assistant is not configured (missing OPENAI_API_KEY on the server).",
      },
      { status: 503 },
    );
  }

  if (getChunksLength() === 0) {
    return NextResponse.json(
      { error: "Documentation index is empty. Run npm run build-doc-chunks." },
      { status: 503 },
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user;
  try {
    user = await apiGetMe(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.user_type !== "staff" || !user.business_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const bucket = requestBuckets.get(user.id);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    requestBuckets.set(user.id, { startedAt: now, count: 1 });
  } else if (bucket.count >= RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1_000));
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  } else {
    bucket.count += 1;
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = body.messages?.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string",
  );
  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }
  if (messages.length !== body.messages?.length) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }
  if (
    messages.length > 12 ||
    messages.some((message) => message.content.length > 4_000) ||
    messages.reduce((total, message) => total + message.content.length, 0) > 12_000
  ) {
    return NextResponse.json({ error: "Conversation is too large" }, { status: 413 });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json(
      { error: "Include at least one user message" },
      { status: 400 },
    );
  }

  try {
    await ensureChunkEmbeddings(apiKey);
    const qVec = await embedQuery(apiKey, lastUser.content);
    const top = retrieveTopK(qVec, TOP_K);
    const contextExcerpts = top
      .map(
        (t, i) =>
          `--- Excerpt ${i + 1} (source: ${t.chunk.source}) ---\n${t.chunk.text}`,
      )
      .join("\n\n");

    const reply = await chatWithContext(apiKey, messages, contextExcerpts);
    return NextResponse.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Assistant error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
