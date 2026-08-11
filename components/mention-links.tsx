"use client";

// Où mène une mention, pour la surface qui la rend — et rien de plus.
//
// Même découpage que le lookup des sous-pages (components/pages/pages-lookup) :
// la pilule est rendue par une vue de nœud, tout en bas de l'éditeur, et elle
// n'a aucun moyen d'aller chercher elle-même le projet d'un ticket cité. Elle le
// DEMANDE, à qui tient déjà les sources des mentions (lib/use-mention-sources).
//
// La règle des URL, elle, n'est pas ici : elle est dans lib/mention-target.ts,
// module pur, partagé avec les autres entrées vers les mêmes écrans.

import { createContext, useContext, type ReactNode } from "react";
import type { MentionTargetType } from "@/lib/mention-target";

export interface MentionLinks {
  /**
   * L'adresse d'une mention, ou `null` — soit qu'elle ne mène nulle part (une
   * personne), soit que l'élément cité ne soit pas (encore) résolu. La pilule
   * reste alors du texte : mieux que d'ouvrir une URL fausse.
   */
  href: (type: MentionTargetType, id: string) => string | null;
  /**
   * Y aller, dans l'onglet courant. Séparé de `href` pour la même raison que
   * dans le lookup des sous-pages : `href` donne l'adresse — d'où le ⌘-clic, le
   * clic du milieu et le menu contextuel du navigateur —, `navigate` fait la
   * navigation d'APPLICATION du clic ordinaire. Sans lui, l'ancre rechargerait
   * la page entière.
   */
  navigate: (type: MentionTargetType, id: string) => void;
}

const Context = createContext<MentionLinks | null>(null);

export function MentionLinksProvider({
  value,
  children,
}: {
  value: MentionLinks | null;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** `null` = surface sans destinations : les pilules s'y rendent, elles ne s'y
    cliquent pas. */
export function useMentionLinks(): MentionLinks | null {
  return useContext(Context);
}
