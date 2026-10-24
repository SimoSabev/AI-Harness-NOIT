import type { Metadata } from "next";
import { DOCS, DOC_SLUGS, docPath } from "../../../../../lib/docs";
import type { DocSlug } from "../../../../../lib/docs";
import { DocPage } from "../../../../../views/doc-page";
import { pageMetadata } from "../../../../../views/meta";

// E9g B step 7 (D-378): one page per docs slug, all made at build time (static export).
export const dynamicParams = false;
export function generateStaticParams(): { slug: DocSlug }[] {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: DocSlug }> }): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata("bg", docPath(slug), DOCS[slug].title);
}

export default async function Page({ params }: { params: Promise<{ slug: DocSlug }> }) {
  const { slug } = await params;
  return <DocPage lang="bg" slug={slug} />;
}
