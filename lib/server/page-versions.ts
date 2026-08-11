import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import { SITE_NAME } from "@/lib/site";
import { updatePage, type PageErrorKey } from "@/lib/server/pages";
import type { Page, PageVersion, PageWriteKind } from "@/lib/pages";

/**
 * L'HISTORIQUE d'une page (MIN-277) : lire les états antérieurs, en revenir un.
 *
 * Le filet de l'agent, et c'est bien à ça qu'il sert : six outils d'écriture
 * sont ouverts à Numo, au MCP et à l'agent de code, et sans ce module la seule
 * réponse possible à « l'agent a écrasé ma page » serait « on ne peut rien
 * faire ».
 *
 * Ce que la table contient est décidé ailleurs — `stampPageWrite`, dans
 * lib/server/pages.ts, archive l'état que chaque écriture RECOUVRE. Ici on ne
 * fait que le rendre, et le remettre en place.
 *
 * Deux choix qui se lisent dans les signatures :
 *
 * 1. **une page corbeillée garde son historique consultable.** La lecture
 *    n'exclut pas `deleted_at` (la policy non plus, cf. la migration) : « ça a
 *    disparu, remonte à avant » est le geste d'après l'incident, pas un cas
 *    tordu.
 * 2. **restaurer est une ÉCRITURE comme une autre.** Elle repasse par
 *    `updatePage`, donc par la garde d'accès, le compteur de `version`, la
 *    projection de recherche et l'archivage — l'état d'avant la restauration
 *    est donc lui-même archivé, et une restauration se défait.
 */

type Service = ReturnType<typeof getServiceClient>;

/** Les colonnes de la LISTE : tout sauf le corps, pour la même raison que
    `LIST_COLUMNS` côté pages — vingt documents ProseMirror pour une liste de
    dates seraient la requête la plus lourde de l'écran. */
const VERSION_COLUMNS =
  "id, page_id, version, title, icon, author_id, author_kind, author_api_key_id, created_at";

export type PageVersionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errorKey: PageErrorKey };

/** La page (corbeillée comprise) si l'acteur y a accès, sinon rien. */
async function reachable(
  service: Service,
  pageId: string,
  actorId: string
): Promise<Page | null> {
  const { data } = await service
    .from("pages")
    .select("id, project_id, title, icon, version, deleted_at")
    .eq("id", pageId)
    .maybeSingle();
  const page = (data as Page | null) ?? null;
  if (!page) return null;
  if (!(await getProjectAccess(actorId, page.project_id))) return null;
  return page;
}

type VersionRow = {
  id: string;
  page_id: string;
  version: number;
  title: string;
  icon: string | null;
  content?: unknown;
  author_id: string | null;
  author_kind: PageWriteKind;
  author_api_key_id?: string | null;
  created_at: string;
};

/**
 * Le NOM d'un auteur de version, et c'est là que se joue la règle d'identité de
 * minddy : geste humain = nom de l'humain, geste automatisé = nom de minddy.
 *
 * Une écriture d'agent porte pourtant bien un `author_id` — celui du compte qui
 * l'a permise. On ne le lit pas : afficher ce nom-là ferait passer pour sien un
 * texte que personne n'a écrit, ce qui est exactement l'incident de confiance
 * que cet historique existe pour éviter.
 */
async function resolveAuthors(
  service: Service,
  rows: VersionRow[]
): Promise<Map<string, string>> {
  const humanIds = rows
    .filter((row) => row.author_kind !== "agent" && row.author_id)
    .map((row) => row.author_id as string);
  if (humanIds.length === 0) return new Map();

  const users = await fetchAuthUsersById(service, humanIds);
  const names = new Map<string, string>();
  for (const [id, user] of users) names.set(id, displayName(toNamed(user), ""));
  return names;
}

/**
 * QUEL agent, quand c'en est un (MIN-282).
 *
 * Le NOM ne bouge pas — « minddy » dans les deux cas, c'est la règle
 * d'identité. Ce qu'on résout ici est le VISAGE : l'agent canonique porté par
 * la clé (« claude-code », « cursor »…), que la ligne rend en logo. Une version
 * d'avant cette colonne n'en a pas, et retombe sur le visage de Numo — le bon
 * repli, une clé MCP étant l'exception.
 */
async function resolveAgents(rows: VersionRow[]): Promise<Map<string, string | null>> {
  const actors = await resolveApiKeyActors(rows.map((row) => row.author_api_key_id));
  return new Map([...actors].map(([id, actor]) => [id, actor.agent]));
}

function toVersion(
  row: VersionRow,
  names: Map<string, string>,
  agents: Map<string, string | null>
): PageVersion {
  return {
    id: row.id,
    page_id: row.page_id,
    version: row.version,
    title: row.title,
    icon: row.icon,
    ...(row.content !== undefined ? { content: row.content } : {}),
    author_id: row.author_id,
    author_kind: row.author_kind,
    author_name:
      row.author_kind === "agent"
        ? SITE_NAME
        : (row.author_id ? names.get(row.author_id) : "") || "",
    author_agent: row.author_api_key_id
      ? (agents.get(row.author_api_key_id) ?? null)
      : null,
    created_at: row.created_at,
  };
}

/** L'historique d'une page, du plus récent au plus ancien. */
export async function listPageVersions(
  pageId: string,
  actorId: string
): Promise<PageVersionResult<PageVersion[]>> {
  const service = getServiceClient();
  const page = await reachable(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const { data, error } = await service
    .from("page_versions")
    .select(VERSION_COLUMNS)
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[page-versions] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const rows = (data ?? []) as unknown as VersionRow[];
  const [names, agents] = await Promise.all([
    resolveAuthors(service, rows),
    resolveAgents(rows),
  ]);
  return { ok: true, data: rows.map((row) => toVersion(row, names, agents)) };
}

/** UNE version, corps compris — l'aperçu en lecture seule. */
export async function getPageVersion(
  pageId: string,
  versionId: string,
  actorId: string
): Promise<PageVersionResult<PageVersion>> {
  const service = getServiceClient();
  const page = await reachable(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const { data, error } = await service
    .from("page_versions")
    .select(`${VERSION_COLUMNS}, content`)
    // Le `page_id` est dans la condition, et pas seulement dans l'URL : une
    // version d'une AUTRE page (donc peut-être d'un autre projet) ne se lit pas
    // en passant par une page à laquelle on a droit.
    .eq("page_id", pageId)
    .eq("id", versionId)
    .maybeSingle();
  if (error) {
    console.error("[page-versions] read failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "pageVersionNotFound" };

  const row = data as unknown as VersionRow;
  const [names, agents] = await Promise.all([
    resolveAuthors(service, [row]),
    resolveAgents([row]),
  ]);
  return { ok: true, data: toVersion(row, names, agents) };
}

/**
 * REMET une version en place.
 *
 * Une écriture neuve, faite par celui qui clique : elle porte son nom, elle
 * incrémente la `version`, elle rejoue la projection de recherche — et elle
 * archive l'état d'avant elle, `alwaysArchive` court-circuitant la coalescence.
 * C'est ce dernier point qui rend le geste sûr : restaurer par erreur se défait
 * en restaurant la ligne que la restauration vient elle-même de créer.
 *
 * Le titre et l'icône reviennent avec le corps. Ce sont trois champs d'un même
 * état ; en rendre deux sur trois donnerait une page qui n'a jamais existé.
 */
export async function restorePageVersion(
  pageId: string,
  versionId: string,
  actorId: string
): Promise<PageVersionResult<Page>> {
  const found = await getPageVersion(pageId, versionId, actorId);
  if (!found.ok) return found;

  const result = await updatePage({
    pageId,
    actorId,
    kind: "human",
    alwaysArchive: true,
    input: {
      content: found.data.content ?? { type: "doc", content: [] },
      title: found.data.title,
      icon: found.data.icon,
    },
  });
  if (!result.ok) {
    return { ok: false, status: result.status, errorKey: result.errorKey };
  }
  return { ok: true, data: result.page };
}
