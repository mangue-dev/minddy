import type { Metadata } from "next";
import { PublishedPage, publishedPageMetadata } from "../published-page";

// Cookie de déverrouillage et état de publication lus à chaque requête.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string; pageId: string }> };

/**
 * `/p/[token]/[pageId]` — une page de la BRANCHE publiée (MIN-283).
 *
 * Pas de second token : la publication d'une branche est un seul lien, et
 * c'est ce qui permet de la révoquer d'un seul geste. Une page hors de la
 * branche (ou une branche non publiée) répond 404 comme un token inconnu — le
 * visiteur n'apprend pas qu'elle existe.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, pageId } = await params;
  return publishedPageMetadata(token, pageId);
}

export default async function PublishedSubPage({ params }: PageProps) {
  const { token, pageId } = await params;
  return <PublishedPage token={token} pageId={pageId} />;
}
