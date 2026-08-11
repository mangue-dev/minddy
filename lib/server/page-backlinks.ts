import "server-only";

import { issueIdentifier } from "@/lib/issue-constants";
import type { PageBacklink } from "@/lib/types";

export type { PageBacklink };

/**
 * QUI cite cette page — la lecture, par ses deux chemins (MIN-279).
 *
 * Deux origines, et elles n'ont rien en commun sauf le résultat :
 *
 *  • la RESSOURCE de genre `page` (MIN-275) — une vraie clé étrangère,
 *    `attachments.page_id`, dont l'index avait été posé pour ce jour-ci ;
 *  • la MENTION — du texte, donc rien à interroger, d'où la table dérivée
 *    `page_links` que `lib/server/page-links.ts` réécrit à chaque écriture.
 *
 * Les deux se FONDENT : une source qui cite la page des deux façons est une
 * ligne, pas deux. Le panneau répond à « qui s'appuie sur cette page ? » ;
 * comment la citation est écrite n'est pas la question.
 *
 * Écrit une fois parce que deux surfaces le lisent, et qu'elles doivent
 * répondre la même chose : la route du panneau, et `minddy_get_page` — l'agent
 * qui ouvre une spec doit voir les tickets qui en dépendent sans les chercher.
 *
 * Le CLIENT est celui de l'appelant, et c'est ce qui porte le contrôle d'accès.
 * Au client de session, les quatre lectures sont filtrées par la RLS ; au client
 * service (le MCP), elles ne le sont pas — et la garde a été faite avant, en
 * TypeScript, par le noyau des pages.
 */

type Rows = { data: unknown; error: { message: string } | null };

/**
 * Le strict minimum de PostgREST dont ce module a besoin — quatre `select` avec
 * un filtre chacun.
 *
 * Décrit à la main, et les appelants passent leur client par un `as unknown as` :
 * sans types de schéma générés, laisser TypeScript inférer `from()` sur un vrai
 * `SupabaseClient` à travers cette frontière fait exploser l'instanciation
 * (TS2589), et le typage rendu n'est de toute façon qu'un `any` déguisé.
 */
export interface BacklinkQueryable {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => PromiseLike<Rows>;
      in: (column: string, values: unknown[]) => PromiseLike<Rows>;
    };
  };
}

/** Une source, avant qu'on sache la nommer. */
interface RawSource {
  kind: PageBacklink["kind"];
  id: string;
  at: string;
}

/** L'ordre des genres, du plus concret au plus large. */
const KIND_ORDER: Record<PageBacklink["kind"], number> = {
  issue: 0,
  objective: 1,
  page: 2,
};

export async function pageBacklinks(
  client: BacklinkQueryable,
  { pageId, projectKey }: { pageId: string; projectKey: string }
): Promise<PageBacklink[]> {
  const [links, resources] = (await Promise.all([
    client.from("page_links").select("source_kind, source_id, created_at").eq("page_id", pageId),
    client
      .from("attachments")
      .select("issue_id, objective_id, created_at")
      .eq("page_id", pageId),
  ])) as [Rows, Rows];

  if (links.error) console.error("[page-backlinks] links failed:", links.error.message);
  if (resources.error) {
    console.error("[page-backlinks] resources failed:", resources.error.message);
  }

  const raw: RawSource[] = [];
  for (const row of (links.data ?? []) as {
    source_kind: PageBacklink["kind"];
    source_id: string;
    created_at: string;
  }[]) {
    raw.push({ kind: row.source_kind, id: row.source_id, at: row.created_at });
  }
  for (const row of (resources.data ?? []) as {
    issue_id: string | null;
    objective_id: string | null;
    created_at: string;
  }[]) {
    // Une ressource pend à un ticket OU à un objectif, jamais aux deux
    // (`attachments_parent_ck`). Une page n'en porte pas encore — le jour où
    // elle en portera, ce sera une branche de plus ici et rien d'autre.
    if (row.issue_id) raw.push({ kind: "issue", id: row.issue_id, at: row.created_at });
    else if (row.objective_id) {
      raw.push({ kind: "objective", id: row.objective_id, at: row.created_at });
    }
  }

  // La FUSION des deux origines. La plus ANCIENNE des deux dates gagne : c'est
  // le moment où cette source a commencé à s'appuyer sur la page, et ajouter la
  // ressource d'un ticket qui la mentionnait déjà ne doit pas le faire remonter
  // en tête comme une nouveauté.
  const merged = new Map<string, RawSource>();
  for (const source of raw) {
    const key = `${source.kind}:${source.id}`;
    const seen = merged.get(key);
    if (!seen || source.at < seen.at) merged.set(key, source);
  }
  if (merged.size === 0) return [];

  const idsOf = (kind: PageBacklink["kind"]) =>
    [...merged.values()].filter((s) => s.kind === kind).map((s) => s.id);

  const [issues, objectives, pages] = (await Promise.all([
    fetchIn(client, "issues", "id, number, title, deleted_at", idsOf("issue")),
    fetchIn(client, "objectives", "id, name, color, deleted_at", idsOf("objective")),
    fetchIn(client, "pages", "id, title, icon, deleted_at", idsOf("page")),
  ])) as [Rows, Rows, Rows];

  const named = new Map<string, Omit<PageBacklink, "at">>();
  for (const row of (issues.data ?? []) as {
    id: string;
    number: number;
    title: string;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`issue:${row.id}`, {
      kind: "issue",
      id: row.id,
      identifier: issueIdentifier(projectKey, row.number),
      title: row.title,
      icon: null,
      color: null,
    });
  }
  for (const row of (objectives.data ?? []) as {
    id: string;
    name: string;
    color: string | null;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`objective:${row.id}`, {
      kind: "objective",
      id: row.id,
      identifier: null,
      title: row.name,
      icon: null,
      color: row.color,
    });
  }
  for (const row of (pages.data ?? []) as {
    id: string;
    title: string;
    icon: string | null;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`page:${row.id}`, {
      kind: "page",
      id: row.id,
      identifier: null,
      title: row.title,
      icon: row.icon,
      color: null,
    });
  }

  // Ce qui ne se résout plus est SILENCIEUSEMENT abandonné : une source
  // corbeillée (le ticket est parti à la poubelle, on n'en parle plus), ou
  // purgée — `page_links.source_id` ne porte pas de clé étrangère, la ligne
  // survit à sa source, et c'est ici qu'elle cesse d'exister.
  return [...merged.values()]
    .flatMap((source) => {
      const entry = named.get(`${source.kind}:${source.id}`);
      return entry ? [{ ...entry, at: source.at }] : [];
    })
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)
    );
}

/** `.in(…)` sur une liste vide interroge pour rien — on court-circuite. */
function fetchIn(
  client: BacklinkQueryable,
  table: string,
  columns: string,
  ids: string[]
): unknown {
  if (ids.length === 0) return Promise.resolve({ data: [], error: null });
  return client.from(table).select(columns).in("id", ids);
}
