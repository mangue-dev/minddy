"use client";

// La recherche dans le CONTENU des pages, pour ⌘K (MIN-276).
//
// Les titres, eux, sont déjà dans le navigateur : `/api/me/search-index` les
// charge une fois par onglet, et la palette les filtre à la frappe sans un
// aller-retour. Les CORPS ne peuvent pas suivre ce chemin — envoyer le wiki de
// tous mes projets pour pouvoir le fouiller côté client, c'est payer le wiki
// entier à chaque ouverture d'onglet.
//
// Alors ils se cherchent côté serveur, et tout le soin est dans le rythme :
//
// - la requête suit la frappe avec un temps de retard (DEBOUNCE_MS) : la ligne
//   par titre, elle, apparaît immédiatement — c'est l'ordre qu'il faut, la
//   recherche par contenu ENRICHIT une liste déjà utile plutôt que de la faire
//   attendre ;
// - en dessous de MIN_QUERY caractères, rien ne part : « a » ramènerait la
//   moitié du wiki pour une frappe qui n'est pas encore une question ;
// - le résultat est mis en cache par requête (react-query), donc effacer un
//   caractère puis le retaper ne redemande rien.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePaletteStore } from "@/lib/command-palette";

import type { PageSearchHit } from "./types";

/** Sous ce seuil, une frappe n'est pas encore une question. */
const MIN_QUERY = 2;
/** Le retard sur la frappe. Assez pour ne pas tirer à chaque lettre, assez peu
 *  pour que le résultat arrive pendant qu'on lit la liste des titres. */
const DEBOUNCE_MS = 220;

async function fetchPageSearch(query: string): Promise<PageSearchHit[]> {
  const response = await fetch(`/api/me/pages/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) return [];
  const data: unknown = await response.json();
  return Array.isArray(data) ? (data as PageSearchHit[]) : [];
}

/**
 * Les pages dont le CONTENU répond à ce qui est tapé dans ⌘K, tous projets
 * confondus. Vide tant que la palette est fermée : elle ne rend rien, et la
 * requête n'aurait personne à servir.
 */
export function usePageContentSearch(enabled: boolean): PageSearchHit[] {
  // La palette possède la frappe (son store) ; on s'y abonne plutôt que de la
  // dupliquer, sinon deux champs diraient deux choses.
  const query = usePaletteStore((s) => s.query);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDebounced("");
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setDebounced("");
      return;
    }
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, enabled]);

  const { data } = useQuery({
    queryKey: ["me", "pages", "search", debounced],
    queryFn: () => fetchPageSearch(debounced),
    enabled: enabled && debounced.length >= MIN_QUERY,
    staleTime: 30_000,
  });

  return data ?? [];
}
