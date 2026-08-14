import "server-only";

import type { JSONContent } from "@tiptap/core";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { pageBodyToMarkdownServer } from "@/lib/server/pages-projection";
import type { PageSearchHit } from "@/lib/types";

export type { PageSearchHit };

/**
 * La colonne DÉRIVÉE qui rend le wiki fouillable (MIN-276).
 *
 * `pages.search_text` est la projection markdown du corps ProseMirror, et
 * `pages.search_tsv` — générée — en tire l'index que Postgres interroge. Le
 * texte sert aussi l'EXTRAIT (`ts_headline`), c'est-à-dire la phrase qui dit
 * pourquoi une page sort ; c'est ce double emploi qui justifie une colonne
 * texte plutôt qu'un seul `tsvector`.
 *
 * Deux règles la tiennent honnête :
 *
 * 1. **le client ne l'écrit jamais.** Une colonne dérivée que l'appelant
 *    fournit est une colonne qui ment le jour où un client est vieux, ou celui
 *    où un chemin d'écriture oublie de la remplir. Elle se calcule ici, à
 *    partir de ce qui est EN BASE.
 * 2. **elle est RELUE avant d'être écrite** (`syncPagesSearchText` recharge le
 *    corps). Ça coûte une requête, et ça achète l'idempotence : rejouer la
 *    projection sur une page ne peut pas la faire diverger, quel que soit
 *    l'ordre dans lequel deux écritures concurrentes se rattrapent.
 *
 * Et elle sort du chemin critique. La sauvegarde de l'éditeur est déjà
 * debouncée à la seconde ; y ajouter le montage d'un tiptap serveur allongerait
 * chaque enregistrement pour un texte que personne n'attend. `afterOrNow` la
 * pousse après la réponse — et retombe sur une exécution immédiate hors
 * requête (le MCP en cascade, un script de rattrapage).
 */

type Service = ReturnType<typeof getServiceClient>;

/** Le texte indexé d'un corps de page : sa projection markdown, rien d'autre. */
export async function pageSearchText(content: unknown): Promise<string> {
  const markdown = await pageBodyToMarkdownServer(
    (content as JSONContent | null) ?? null
  );
  return markdown.trim();
}

/**
 * Recalcule `search_text` pour ces pages, depuis leur corps en base.
 *
 * L'écriture est CIBLÉE sur la colonne dérivée : ni `content`, ni `version`.
 * Repasser par le corps rejouerait la garde de version de MIN-271 contre
 * elle-même — l'écriture de rattrapage se ferait refuser par celle qu'elle
 * suit, ou pire, écraserait une sauvegarde partie entre les deux.
 */
export async function syncPagesSearchText(
  service: Service,
  pageIds: string[]
): Promise<void> {
  if (pageIds.length === 0) return;

  const { data, error } = await service
    .from("pages")
    .select("id, content")
    .in("id", pageIds);
  if (error) {
    console.error("[pages] search text read failed:", error.message);
    return;
  }

  for (const row of (data ?? []) as { id: string; content: unknown }[]) {
    const text = await pageSearchText(row.content);
    const { error: writeError } = await service
      .from("pages")
      .update({ search_text: text })
      .eq("id", row.id);
    if (writeError) {
      console.error("[pages] search text write failed:", writeError.message);
    }
  }
}

/** La même chose, après la réponse. Le seul appelant des chemins d'écriture. */
export function queueSearchText(service: Service, pageIds: string[]): void {
  if (pageIds.length === 0) return;
  afterOrNow(() => syncPagesSearchText(service, pageIds));
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** Ce que rend la fonction SQL, avant nettoyage de l'extrait. */
type RawHit = Omit<PageSearchHit, "excerpt"> & { excerpt: string | null };

/**
 * L'extrait, tel qu'on l'affiche. `ts_headline` travaille sur le MARKDOWN de la
 * page : ses puces, ses dièses et ses retours à la ligne n'ont aucun sens dans
 * une ligne de palette ou dans un résultat d'outil. On les aplatit ici plutôt
 * qu'à l'indexation — le texte indexé, lui, doit rester celui de la page.
 */
function cleanExcerpt(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/```[a-z]*|\[\[page:[^\]]*\]\]/gi, " ")
    .replace(/^[\s>#*_-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La recherche, sans contrôle d'accès — il vit chez les appelants.
 *
 * Deux clients l'appellent, et la différence n'est pas cosmétique : au client de
 * SESSION la fonction est filtrée par `pages_select`, donc par les projets de
 * l'utilisateur (c'est la recherche cross-projet de ⌘K) ; au client SERVICE elle
 * ne l'est pas, et `projectId` est alors obligatoire — la garde a été faite
 * avant, en TypeScript.
 */
/**
 * Le plafond de la chaîne cherchée (MIN-348).
 *
 * Elle part vers `websearch_to_tsquery` PUIS vers `ts_headline`, qui compare
 * chaque lexème de la requête à chaque page candidate : le coût monte avec la
 * longueur de ce qu'on tape, et rien ne bornait ce qu'un client peut envoyer.
 * Deux cents caractères, c'est déjà plus long que toute recherche humaine — on
 * TRONQUE plutôt que de refuser, parce qu'un collage accidentel doit rendre des
 * résultats, pas une erreur.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/** Le plafond du nombre de résultats — c'est le « 1–50 » que l'outil MCP
    ANNONCE, et que son schéma ne faisait pas respecter (MIN-348). */
export const MAX_SEARCH_LIMIT = 50;

export async function runPageSearch(
  client: {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  {
    query,
    projectId = null,
    limit = 20,
  }: { query: string; projectId?: string | null; limit?: number }
): Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  const { data, error } = await client.rpc("search_pages", {
    p_query: query.slice(0, MAX_SEARCH_QUERY_LENGTH),
    p_project_id: projectId,
    p_limit: Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_SEARCH_LIMIT),
  });
  if (error) {
    console.error("[pages] search failed:", error.message);
    return { ok: false };
  }
  const hits = ((data ?? []) as RawHit[]).map((hit) => ({
    ...hit,
    excerpt: cleanExcerpt(hit.excerpt),
  }));
  return { ok: true, hits };
}
