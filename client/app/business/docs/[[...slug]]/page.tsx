import { notFound, redirect } from "next/navigation";
import { loadBusinessDoc, getAllBusinessDocSlugArrays } from "@/lib/docs/load-business-doc";
import { DocsMarkdown } from "@/components/docs-markdown";

export default async function BusinessDocPage(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug;
  if (!slug?.length) {
    redirect("/business/docs/businesses/getting-started");
  }

  const doc = loadBusinessDoc(slug);
  if (!doc) {
    notFound();
  }

  return (
    <article className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-8">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="page-title text-foreground">
          {doc.title}
        </h1>
        {doc.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{doc.description}</p>
        ) : null}
      </header>
      <DocsMarkdown source={doc.bodyMarkdown} />
    </article>
  );
}

export function generateStaticParams() {
  return getAllBusinessDocSlugArrays().map((slug) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug;
  if (!slug?.length) {
    return { title: "Docs" };
  }
  const doc = loadBusinessDoc(slug);
  if (!doc) {
    return { title: "Docs" };
  }
  return {
    title: `${doc.title} · Docs`,
    description: doc.description,
  };
}
