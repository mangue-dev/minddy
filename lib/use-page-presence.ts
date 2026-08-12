"use client";

// Le hook de PRÉSENCE des pages (MIN-271) — la moitié React de
// lib/page-presence.ts, et rien de plus.
//
// Il est monté UNE fois, par la coquille des pages, et pas par chaque page
// ouverte : le canal est celui du projet, et l'arbre a besoin de l'état complet
// pour poser ses pastilles. Ouvrir une autre page ne rejoint donc rien — c'est
// un `track` de plus sur le canal déjà là.

import { useEffect, useRef, useState } from "react";

import { useAuth } from "./auth-context";
import {
  openPagePresence,
  type PagePresenceHandle,
  type PagePresenceMap,
} from "./page-presence";

const EMPTY: PagePresenceMap = new Map();

/**
 * Qui d'AUTRE regarde quoi dans ce projet — `pageId` → les ids des présents.
 * Jamais moi, pas même depuis un autre onglet : le tri se fait à la source
 * (lib/page-presence.ts).
 */
export function usePagePresence(
  projectId: string | null,
  pageId: string | null
): PagePresenceMap {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [present, setPresent] = useState<PagePresenceMap>(EMPTY);
  const handle = useRef<PagePresenceHandle | null>(null);
  // La page ouverte, LUE à l'ouverture du canal plutôt que capturée : elle ne
  // fait pas partie de ce qui décide de rejoindre.
  const open = useRef(pageId);
  open.current = pageId;

  // Le canal ne dépend PAS de la page : le rejoindre à chaque navigation ferait
  // un aller-retour de socket par clic dans l'arbre, et l'avatar clignoterait
  // chez tout le monde à chaque fois. `on` vaut « une page est ouverte » — sur
  // la liste, il n'y a personne à déclarer et rien à afficher.
  const on = !!projectId && !!userId && !!pageId;
  useEffect(() => {
    if (!on || !projectId || !userId || !open.current) {
      setPresent(EMPTY);
      return;
    }
    const opened = openPagePresence({
      projectId,
      userId,
      pageId: open.current,
      onChange: setPresent,
    });
    handle.current = opened;
    return () => {
      handle.current = null;
      opened.close();
      setPresent(EMPTY);
    };
  }, [on, projectId, userId]);

  useEffect(() => {
    if (pageId) handle.current?.move(pageId);
  }, [pageId]);

  return present;
}
