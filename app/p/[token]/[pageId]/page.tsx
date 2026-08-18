import type { Metadata } from "next";
import { PublishedPage, publishedPageMetadata } from "../published-page";

// Unlock cookie and publication status read on each request.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string; pageId: string }> };

/**
 * `/p/[token]/[pageId]` — a published BRANCH page (MIN-283).
 *
 * No second token: the publication of a branch is a single link, and
 * this is what allows it to be revoked with a single gesture. A page out of the
 * branch (or an unpublished branch) responds 404 as an unknown token — the
 * visitor does not learn that it exists.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, pageId } = await params;
  return publishedPageMetadata(token, pageId);
}

export default async function PublishedSubPage({ params }: PageProps) {
  const { token, pageId } = await params;
  return <PublishedPage token={token} pageId={pageId} />;
}
