import type { Metadata } from "next";
import { PublishedPage, publishedPageMetadata } from "./published-page";

// Unlock cookie and publication status read on each request.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/** `/p/[token]` — the page that the post link points to (MIN-283). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  return publishedPageMetadata(token);
}

export default async function PublishedRootPage({ params }: PageProps) {
  const { token } = await params;
  return <PublishedPage token={token} />;
}
