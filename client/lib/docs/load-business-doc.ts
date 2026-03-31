import fs from "fs";
import path from "path";

const DOCS_ROOT = path.join(process.cwd(), "content", "docs");

export type ParsedDoc = {
  title: string;
  description?: string;
  bodyMarkdown: string;
};

function parseFrontmatter(raw: string): {
  title?: string;
  description?: string;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { body: raw.trim() };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { body: raw.trim() };
  }
  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const title = fmBlock.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const description = fmBlock.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return {
    title: title?.replace(/^["']|["']$/g, ""),
    description: description?.replace(/^["']|["']$/g, ""),
    body,
  };
}

/** Turn legacy MDX Callout tags into markdown blockquotes. */
function preprocessBody(body: string): string {
  return body.replace(
    /<Callout\s+type="(info|warn)">\s*([\s\S]*?)\s*<\/Callout>/gi,
    (_m, type: string, inner: string) => {
      const label = type === "warn" ? "**Warning:**" : "**Note:**";
      const text = inner.trim().replace(/\s+/g, " ");
      return `\n\n> ${label} ${text}\n\n`;
    },
  );
}

function allowedSlugs(): Set<string> {
  const set = new Set<string>();
  const businesses = JSON.parse(
    fs.readFileSync(
      path.join(DOCS_ROOT, "businesses", "meta.json"),
      "utf8",
    ),
  ) as { pages: string[] };
  const general = JSON.parse(
    fs.readFileSync(path.join(DOCS_ROOT, "general", "meta.json"), "utf8"),
  ) as { pages: string[] };
  for (const p of businesses.pages) {
    set.add(`businesses/${p}`);
  }
  for (const p of general.pages) {
    set.add(`general/${p}`);
  }
  return set;
}

const allowed = allowedSlugs();

export function getAllBusinessDocSlugArrays(): string[][] {
  return [...allowed].map((k) => k.split("/"));
}

export function loadBusinessDoc(slug: string[]): ParsedDoc | null {
  if (slug.length !== 2) return null;
  const key = `${slug[0]}/${slug[1]}`;
  if (!allowed.has(key)) return null;
  const filePath = path.join(DOCS_ROOT, `${key}.mdx`);
  if (!filePath.startsWith(DOCS_ROOT)) return null;
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { title, description, body } = parseFrontmatter(raw);
  let bodyMarkdown = preprocessBody(body);
  // Page template already renders title from frontmatter; drop duplicate # heading
  bodyMarkdown = bodyMarkdown.replace(/^#\s+[^\n]+\n+/, "").trim();
  return {
    title: title || slug[1],
    description,
    bodyMarkdown,
  };
}
