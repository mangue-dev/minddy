"use client";

// Ce qu'un bloc « sous-page » a besoin de savoir du monde extérieur, et rien de
// plus : comment lire le titre et l'icône d'une page, et comment en créer une.
//
// Le nœud ne stocke que le `pageId` (cf. blocks/subpage.ts) — le titre affiché
// est TOUJOURS résolu à la lecture, sinon renommer une page laisserait son
// ancien nom dans le corps de tous ses parents. Le cache réel des pages du
// projet arrive avec MIN-266/MIN-270 ; ici on ne pose que le branchement, pour
// que le bloc existe déjà quand il arrivera.

import { createContext, useContext, type ReactNode } from "react";

export interface PageSummary {
  id: string;
  title: string;
  /** L'emoji de la page, ou `null` — l'icône par défaut est alors posée par la vue. */
  icon: string | null;
}

export interface PagesLookup {
  /** `undefined` = pas (encore) dans le cache : la vue montre son état d'attente,
      elle ne montre pas « page supprimée ». */
  get: (pageId: string) => PageSummary | undefined;
  /** Créer une page enfant et rendre son id — câblé par MIN-272. Absent : le
      menu « / » pose un bloc vide, que l'on peut supprimer. */
  create?: () => Promise<string | null>;
}

const Context = createContext<PagesLookup | null>(null);

export function PagesLookupProvider({
  value,
  children,
}: {
  value: PagesLookup;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePagesLookup(): PagesLookup | null {
  return useContext(Context);
}
