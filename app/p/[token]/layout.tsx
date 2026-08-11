import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";

/**
 * Page du wiki publiée en lecture (MIN-283). Même raison d'être que le layout
 * de la vue partagée : le root layout ne diffuse que les quatre namespaces du
 * site marketing (MIN-100), et cette route monte le VRAI éditeur de page —
 * placeholders, menu des blocs, libellés du dépliant, blocs image et fichier.
 */
export default function PublicPageLayout({ children }: { children: ReactNode }) {
  return <FullCatalogMessages>{children}</FullCatalogMessages>;
}
