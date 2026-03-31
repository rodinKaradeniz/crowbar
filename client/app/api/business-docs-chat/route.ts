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

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
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
