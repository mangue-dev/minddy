"use client";

// Ce qu'un bloc « sous-page » a besoin de savoir du monde extérieur, et rien de
// plus : comment lire le titre et l'icône d'une page, où mène son lien, comment
// en créer une, et comment en ressortir une de la corbeille.
//
// Le nœud ne stocke que le `pageId` (cf. blocks/subpage.ts) — le titre affiché
// est TOUJOURS résolu à la lecture, sinon renommer une page laisserait son
// ancien nom dans le corps de tous ses parents. Le cache réel est celui du
// projet (lib/use-pages-query.ts), branché par components/pages/page-view.tsx :
// la sidebar, le fil d'Ariane et ce bloc lisent donc la même chose.

import { createContext, useContext, type ReactNode } from "react";

export interface PageSummary {
  id: string;
  title: string;
  /** L'emoji de la page, ou `null` — l'icône par défaut est alors posée par la vue. */
  icon: string | null;
}

export interface PagesLookup {
  /** `undefined` = la page n'est pas dans le cache. Ce que ça VEUT DIRE dépend
      de `ready` : tant que le cache charge, c'est une attente ; une fois chargé,
      c'est une page absente — corbeillée, purgée, ou d'un autre projet. */
  get: (pageId: string) => PageSummary | undefined;
  /**
   * Le cache du projet est-il chargé ?
   *
   * Sans ce booléen, la vue du bloc n'a aucun moyen de distinguer « je ne sais
   * pas encore » de « cette page n'existe plus », et elle annoncerait donc
   * l'un des deux à tort — soit un clignotement « page supprimée » sur chaque
   * chargement, soit un bloc éternellement vide sur une page vraiment partie.
   */
  ready?: boolean;
  /** Où mène le bloc. Absent : le bloc se rend, mais ne se clique pas. */
  href?: (pageId: string) => string;
  /**
   * Ouvrir la page, dans l'onglet courant.
   *
   * Séparé de `href` parce que les deux répondent à des questions différentes :
   * `href` donne l'adresse — d'où le ⌘-clic, le clic du milieu et le menu
   * contextuel du navigateur —, `navigate` fait la navigation d'APPLICATION du
   * clic ordinaire. Sans lui, l'ancre rechargerait la page entière.
   */
  navigate?: (pageId: string) => void;
  /** Créer une page enfant et rendre son id. Absent : le menu « / » pose un
      bloc vide, que l'on peut supprimer. */
  create?: () => Promise<string | null>;
  /** La page créée dont le bloc vient d'être posé : enregistrer le parent, puis
      l'ouvrir. C'est l'appelant qui tient l'autosave, donc lui seul peut le
      faire dans cet ordre. */
  opened?: (pageId: string) => void;
  /**
   * Copier une page ET sa descendance, et rendre l'id de la copie (`null` si
   * elle a échoué). C'est ce que « dupliquer » fait du menu ⋯ sur un bloc
   * sous-page : copier le BLOC donnerait deux liens vers le même document.
   */
  duplicate?: (pageId: string) => Promise<string | null>;
  /** Ressortir de la corbeille la page d'un bloc orphelin. Rend `true` si elle
      est revenue. */
  restore?: (pageId: string) => Promise<boolean>;
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
