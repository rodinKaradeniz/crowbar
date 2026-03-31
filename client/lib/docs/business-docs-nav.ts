import fs from "fs";
import path from "path";

const DOCS_ROOT = path.join(process.cwd(), "content", "docs");

function titleFromFile(relPath: string): string {
  const full = path.join(DOCS_ROOT, relPath);
  const raw = fs.readFileSync(full, "utf8");
  if (!raw.startsWith("---")) {
    return relPath;
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return relPath;
  const fm = raw.slice(3, end);
  const m = fm.match(/^title:\s*(.+)$/m);
  const t = m?.[1]?.trim()?.replace(/^["']|["']$/g, "");
  return t || relPath;
}

export type BusinessDocsNavItem = {
  href: string;
  title: string;
};

export type BusinessDocsNavSection = {
  label: string;
  items: BusinessDocsNavItem[];
};

export function getBusinessDocsNav(): BusinessDocsNavSection[] {
  const businessesMeta = JSON.parse(
    fs.readFileSync(
      path.join(DOCS_ROOT, "businesses", "meta.json"),
      "utf8",
    ),
  ) as { title: string; pages: string[] };
  const generalMeta = JSON.parse(
    fs.readFileSync(path.join(DOCS_ROOT, "general", "meta.json"), "utf8"),
  ) as { title: string; pages: string[] };

  const businessItems: BusinessDocsNavItem[] = businessesMeta.pages.map(
    (page) => {
      const rel = `businesses/${page}.mdx`;
      return {
        href: `/business/docs/businesses/${page}`,
        title: titleFromFile(rel),
      };
    },
  );

  const generalItems: BusinessDocsNavItem[] = generalMeta.pages.map(
    (page) => {
      const rel = `general/${page}.mdx`;
      return {
        href: `/business/docs/general/${page}`,
        title: titleFromFile(rel),
      };
    },
  );

  return [
    { label: businessesMeta.title, items: businessItems },
    { label: generalMeta.title, items: generalItems },
  ];
}
