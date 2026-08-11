import { PagePrintView } from "@/components/pages/page-print-view";

/**
 * La vue d'IMPRESSION d'une page (MIN-283) — ce qui fait le PDF.
 *
 * `?scope=branch` imprime la page ET ses sous-pages, une par page de papier.
 *
 * **Pourquoi `pages-print/` et pas `pages/[pageId]/print`** : le segment
 * `pages/` porte un layout qui monte la barre secondaire et l'arbre du projet
 * (app/(app)/projects/[id]/pages/layout.tsx). Une vue d'impression n'a rien à
 * faire dedans — elle s'ouvre dans un onglet, appelle `window.print()` et se
 * ferme. La sortir du segment coûte un mot dans l'URL et évite de monter tout
 * un meuble pour l'imprimer aussitôt.
 *
 * Le chemin reste sous `/projects`, qui est protégé (lib/protected-prefixes.ts) :
 * imprimer une page demande d'y avoir accès, comme la lire.
 */
export default async function PagePrintRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pageId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const [{ id, pageId }, { scope }] = await Promise.all([params, searchParams]);
  return <PagePrintView projectId={id} pageId={pageId} branch={scope === "branch"} />;
}
