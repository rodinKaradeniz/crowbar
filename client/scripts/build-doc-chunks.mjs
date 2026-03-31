/**
 * Builds plain-text chunks from business + general docs (no API calls).
 * Run: node scripts/build-doc-chunks.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.join(__dirname, "..");
const DOCS = path.join(CLIENT_ROOT, "content", "docs");
const OUT = path.join(CLIENT_ROOT, "lib", "doc-chunks.json");

const MAX_CHUNK = 900;

function stripFrontmatter(raw) {
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) return raw.slice(end + 4).trim();
  }
  return raw.trim();
}

function chunkText(text, source) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t.length > 40) chunks.push({ source, text: t });
    buf = "";
  };
  for (const p of paragraphs) {
    const line = p.trim();
    if (!line) continue;
    if ((buf + "\n\n" + line).length > MAX_CHUNK && buf) {
      flush();
    }
    buf = buf ? `${buf}\n\n${line}` : line;
  }
  flush();
  return chunks;
}

function walkMdx(dir, relBase) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkMdx(full, path.join(relBase, name)));
    } else if (name.endsWith(".mdx") || name.endsWith(".md")) {
      const raw = fs.readFileSync(full, "utf8");
      const body = stripFrontmatter(raw);
      const source = path.join(relBase, name).replace(/\\/g, "/");
      out.push(...chunkText(body, source));
    }
  }
  return out;
}

const subdirs = ["businesses", "general"];
const all = [];
let id = 0;
for (const sub of subdirs) {
  const dir = path.join(DOCS, sub);
  for (const c of walkMdx(dir, sub)) {
    all.push({ id: String(id++), ...c });
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all, null, 0), "utf8");
console.log(`Wrote ${all.length} chunks to lib/doc-chunks.json`);
