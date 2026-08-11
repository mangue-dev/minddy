import type { Metadata } from "next";
import { PublishedPage, publishedPageMetadata } from "./published-page";

// Cookie de déverrouillage et état de publication lus à chaque requête.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/** `/p/[token]` — la page que le lien de publication désigne (MIN-283). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  return publishedPageMetadata(token);
}

export default async function PublishedRootPage({ params }: PageProps) {
  const { token } = await params;
  return <PublishedPage token={token} />;
}
