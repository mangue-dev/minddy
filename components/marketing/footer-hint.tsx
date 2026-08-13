"use client";

import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * L'infobulle des deux gestes de l'adresse de contact du pied de page : copier,
 * écrire.
 *
 * Elle vit dans SON fichier pour une seule raison : une infobulle Radix tire le
 * positionneur flottant, et le pied de page est rendu par les SIX pages
 * publiques. Importée depuis [marketing-footer.tsx](marketing-footer.tsx), elle
 * partirait dans leur bundle initial à toutes — exactement ce que MIN-100 a
 * passé son temps à en retirer. Isolée ici, elle devient un `dynamic()` que le
 * pied de page ne monte qu'à son approche, comme le sélecteur de langue.
 *
 * D'où la forme « enveloppe » plutôt qu'un composant complet : l'élément
 * enveloppé — le lien `mailto:` — reste écrit dans le pied de page, donc rendu
 * côté serveur et lisible sans JavaScript. L'infobulle ne fait que se poser
 * dessus quand elle arrive.
 */
export function FooterHint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
