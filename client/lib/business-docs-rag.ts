import docChunks from "@/lib/doc-chunks.json";

export type DocChunk = {
  id: string;
  source: string;
  text: string;
};

const chunks = docChunks as DocChunk[];

const EMBED_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const OPENAI_BASE =
  process.env.OPENAI_API_BASE?.replace(/\/$/, "") ||
  "https://api.openai.com/v1";

let chunkEmbeddingsCache: number[][] | null = null;

function cosine(a: number[], b: number[]) {
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : d / denom;
}

async function openaiEmbeddings(
  apiKey: string,
  inputs: string[],
): Promise<number[][]> {
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embeddings failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  const sorted = [...data.data].sort((x, y) => x.index - y.index);
  return sorted.map((x) => x.embedding);
}

export async function ensureChunkEmbeddings(apiKey: string): Promise<void> {
  if (chunkEmbeddingsCache) return;
  if (chunks.length === 0) {
    chunkEmbeddingsCache = [];
    return;
  }
  const batchSize = 16;
  const all: number[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map((c) => c.text);
    const emb = await openaiEmbeddings(apiKey, batch);
    all.push(...emb);
  }
  chunkEmbeddingsCache = all;
}

export async function embedQuery(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const [v] = await openaiEmbeddings(apiKey, [text]);
  return v;
}

export function retrieveTopK(
  queryVec: number[],
  k: number,
): { chunk: DocChunk; score: number }[] {
  if (!chunkEmbeddingsCache?.length || !chunks.length) return [];
  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosine(queryVec, chunkEmbeddingsCache![i]),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

const SYSTEM = `You are a help assistant for business users of the Crowbar reservation platform.

Output rules (always use GitHub-flavored Markdown):
- Use **bold** for UI labels that appear in the app (e.g. **Requests**, **Profile**, **Types**).
- Put blank lines between sections so the answer is easy to scan—never one dense wall of text.
- Prefer short paragraphs (2–4 sentences max each), bullet lists, or numbered lists.

For "how to", "where do I", or step-style questions:
1. Start with 1–2 sentences summarizing what they will do.
2. Add a **Where:** line with navigation using arrows, e.g. **Sidebar → Requests** or **Profile → Types →** (only paths supported by the excerpts).
3. Add **Steps:** as a numbered list (3–6 steps when it makes sense).

For other questions: still use Markdown (bullets or short paragraphs with blank lines between them). Stay concise (roughly under 150 words unless the user explicitly asks for detail).

Grounding:
- Answer ONLY from the "Documentation excerpts" below. If they are insufficient, say the docs do not cover it and suggest opening **Docs** in the sidebar or rephrasing.
- Do not invent features, URLs, or settings.

Example shape (illustrative—use real content from excerpts only):
Brief summary here.

**Where:** Sidebar → Example → Example

**Steps:**
1. First action
2. Second action
`;

export async function chatWithContext(
  apiKey: string,
  userMessages: { role: "user" | "assistant"; content: string }[],
  contextExcerpts: string,
): Promise<string> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${SYSTEM}\n\nDocumentation excerpts:\n${contextExcerpts}`,
        },
        ...userMessages,
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Chat failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}

export function getChunksLength(): number {
  return chunks.length;
}
