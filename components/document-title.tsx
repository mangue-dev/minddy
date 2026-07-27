"use client";

import { useEffect, useRef } from "react";

/**
 * Pose `document.title` tant qu'il est monté, puis rend la main (MIN-95).
 *
 * Un ticket n'a pas d'URL à lui : il s'ouvre en panneau, sur `?issue=<id>`.
 * Aucun `generateMetadata` ne peut donc le nommer — les paramètres de recherche
 * n'atteignent pas les layouts, et les pages de tableau sont des composants
 * clients. Le titre d'onglet reste pourtant la seule façon de retrouver le bon
 * ticket parmi cinq onglets ouverts, d'où ce détour par le DOM.
 *
 * Au démontage, le titre d'origine revient — fermer le panneau n'est pas une
 * navigation, personne d'autre ne le reposera. Sauf si quelqu'un l'a changé
 * entre-temps : c'est alors que Next a rendu le titre d'une NOUVELLE page,
 * qu'on se garderait bien d'écraser.
 */
export function DocumentTitle({ title }: { title: string }) {
  const original = useRef<string | null>(null);
  const applied = useRef<string | null>(null);

  useEffect(() => {
    original.current ??= document.title;
    document.title = title;
    applied.current = title;
  }, [title]);

  // Dépendances vides : ce nettoyage ne doit courir qu'au démontage, pas à
  // chaque changement de titre (il restaurerait le titre du ticket précédent).
  useEffect(
    () => () => {
      if (original.current !== null && document.title === applied.current) {
        document.title = original.current;
      }
    },
    [],
  );

  return null;
}
