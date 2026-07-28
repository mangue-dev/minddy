import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";

/**
 * Vue partagée par lien (board en lecture seule). Ce layout n'existe que pour
 * lui servir le catalogue i18n complet : le root layout ne diffuse que les
 * quatre namespaces du site marketing (MIN-100), et cette page rend le vrai
 * board — statuts, priorités, champs, pièces jointes, quatorze namespaces à
 * elle seule.
 */
export default function PublicShareLayout({ children }: { children: ReactNode }) {
  return <FullCatalogMessages>{children}</FullCatalogMessages>;
}
