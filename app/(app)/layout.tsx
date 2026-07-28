import type { Metadata } from "next";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { AppProviders } from "./app-providers";

/**
 * Segment de l'app authentifiée. Composant SERVEUR, qui ne fait rien d'autre
 * que porter ce `metadata` et monter l'arbre de providers clients
 * (`app-providers.tsx`) — une page cliente ne peut pas exporter de métadonnées,
 * or c'est exactement ce qu'il fallait ici.
 *
 * `noindex, nofollow` sur tout ce qui est derrière l'authentification (MIN-88).
 * Ceinture et bretelles : le `Disallow` du robots.txt demande poliment de ne pas
 * crawler, l'en-tête et cette balise interdisent d'indexer ce qui aurait quand
 * même été atteint — par un lien externe, une URL collée quelque part, ou un
 * robot qui ignore robots.txt. Même règle que `app/(app)/admin/layout.tsx`, qui
 * la portait déjà pour lui seul.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      <AppProviders>{children}</AppProviders>
    </FullCatalogMessages>
  );
}
