import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { removeStorageObjects } from "@/lib/server/attachments";

/**
 * La corbeille (MIN-133).
 *
 * Supprimer un ticket, un objectif, un feedback ou un projet ne détruit plus
 * rien : la ligne est marquée (`deleted_at` / `deleted_by`) et sort de l'app par
 * la RLS pour les deux premiers, par un filtre explicite pour les deux autres.
 * Elle reste visible ici 30 jours, restaurable à l'identique — commentaires,
 * pièces jointes, sous-tickets et liens compris, puisque rien n'a été détaché.
 * Passé ce délai, le balayage nocturne (lib/server/retention.ts) fait la vraie
 * suppression, celle qui cascade.
 *
 * TOUT passe par le client service, RLS contournée, et les contrôles d'accès
 * vivent donc ici : la liste ne sort pas des projets auxquels l'appelant a
 * accès, et chaque restauration/purge repasse par `getProjectAccess`. C'est
 * aussi la raison pour laquelle la suppression elle-même a déménagé ici plutôt
 * que de rester un `update` sur le client authentifié : PostgREST rend la ligne
 * modifiée via un RETURNING, auquel la policy SELECT s'applique — la ligne
 * fraîchement corbeillée n'y passerait plus, et la route croirait à un 404.
 */

export { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";

/** Garde-fou de lecture : la corbeille d'un mois n'est jamais si longue. */
const LIST_LIMIT = 200;

export type TrashType = "issue" | "project" | "objective" | "feedback";

export const TRASH_TYPES: TrashType[] = ["issue", "project", "objective", "feedback"];

export function isTrashType(value: string): value is TrashType {
  return (TRASH_TYPES as string[]).includes(value);
}

/** La table portant chaque type — la seule endroit où la correspondance vit. */
const TABLE: Record<TrashType, string> = {
  issue: "issues",
  project: "projects",
  objective: "objectives",
  feedback: "feedback_posts",
};

export interface TrashActor {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_seed: string;
}

export interface TrashItem {
  type: TrashType;
  id: string;
  /** Titre du ticket / du feedback, nom du projet ou de l'objectif. */
  title: string;
  /** « MIN-42 » pour un ticket, sinon null. */
  identifier: string | null;
  /** Projet parent — null quand l'élément EST le projet. */
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  deleted_at: string;
  /** Qui a supprimé. Null si le compte a disparu depuis. */
  deleted_by: TrashActor | null;
}

export type TrashResult =
  | { ok: true }
  | { ok: false; status: number; errorKey: TrashErrorKey };

type TrashErrorKey =
  | "issueNotFound"
  | "projectNotFound"
  | "objectiveNotFound"
  | "feedbackNotFound"
  | "ownerOnly"
  | "projectKeyAlreadyUsed"
  | "databaseError";

const NOT_FOUND: Record<TrashType, TrashErrorKey> = {
  issue: "issueNotFound",
  project: "projectNotFound",
  objective: "objectiveNotFound",
  feedback: "feedbackNotFound",
};

/* ─── Suppression ──────────────────────────────────────────────────────────── */

/**
 * Marque un élément comme supprimé, après contrôle d'accès.
 *
 * Un projet n'est supprimable que par son propriétaire ; le reste, par tout
 * membre du projet — la corbeille étant partagée, l'erreur d'un membre reste
 * rattrapable par un autre.
 */
export async function softDeleteItem(
  type: TrashType,
  id: string,
  actorId: string
): Promise<TrashResult> {
  const service = getServiceClient();

  if (type === "project") {
    // Pas de `.is("deleted_at", null)` ici : le contrôle porte sur le
    // PROPRIÉTAIRE, qui ne change pas quand le projet passe à la corbeille.
    // Le filtrer ferait répondre « projet introuvable » à un second appel.
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
    if (project.owner_id !== actorId) {
      return { ok: false, status: 403, errorKey: "ownerOnly" };
    }
  } else {
    const owner = await resolveProjectId(service, type, id);
    if (!owner) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    if (!(await getProjectAccess(actorId, owner))) {
      return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    }
  }

  const { error } = await service
    .from(TABLE[type])
    .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[trash] soft delete ${type} failed:`, error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  // Aucune ligne mise à jour ne veut PAS dire « introuvable » : l'existence et
  // l'accès viennent d'être vérifiés juste au-dessus, donc la seule façon de ne
  // rien toucher est que la ligne soit DÉJÀ en corbeille. L'intention de
  // l'appelant est satisfaite (double clic, rejeu d'une requête) — un 404
  // l'induirait en erreur.
  return { ok: true };
}

/** Le projet auquel appartient un élément corbeillé ou non, ou null. */
async function resolveProjectId(
  service: SupabaseClient,
  type: Exclude<TrashType, "project">,
  id: string
): Promise<string | null> {
  const { data } = await service
    .from(TABLE[type])
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  return (data?.project_id as string | undefined) ?? null;
}

/* ─── Liste ────────────────────────────────────────────────────────────────── */

/**
 * Ce que l'appelant peut rattraper : les éléments supprimés de ses projets
 * VIVANTS, plus ses propres projets supprimés.
 *
 * Les tickets d'un projet lui-même en corbeille n'y figurent pas : restaurer le
 * projet les y ramène, et les lister deux fois ferait de la corbeille l'inverse
 * de ce qu'elle doit être — une liste courte de choses qu'on peut récupérer
 * d'un clic.
 *
 * `userSupabase` (client de session) sert à décider quels projets sont les
 * miens : le périmètre vient de la RLS, jamais du rôle service.
 */
export async function listTrash(
  userId: string,
  userSupabase: SupabaseClient
): Promise<TrashItem[]> {
  const service = getServiceClient();

  const { data: liveProjects } = await userSupabase
    .from("projects")
    .select("id, name, key, color")
    .is("deleted_at", null);

  const projectIds = (liveProjects ?? []).map((p) => p.id as string);
  const projectById = new Map(
    (liveProjects ?? []).map((p) => [
      p.id as string,
      {
        name: p.name as string,
        key: p.key as string,
        color: (p.color as string | null) ?? null,
      },
    ])
  );

  /** Les trois types portés par un projet se lisent tous de la même façon. */
  const inProjects = async (table: string, columns: string): Promise<TrashRow[]> => {
    if (projectIds.length === 0) return [];
    const { data } = await service
      .from(table)
      .select(columns)
      .in("project_id", projectIds)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(LIST_LIMIT);
    return (data ?? []) as unknown as TrashRow[];
  };

  const [issueRows, objectiveRows, feedbackRows, projectRows] = await Promise.all([
    inProjects("issues", "id, project_id, deleted_at, deleted_by, number, title"),
    inProjects("objectives", "id, project_id, deleted_at, deleted_by, name"),
    inProjects("feedback_posts", "id, project_id, deleted_at, deleted_by, title"),
    service
      .from("projects")
      .select("id, name, key, color, deleted_at, deleted_by")
      .eq("owner_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(LIST_LIMIT)
      .then(({ data }) => (data ?? []) as unknown as TrashRow[]),
  ]);

  const actors = await resolveActors(service, [
    ...issueRows,
    ...objectiveRows,
    ...feedbackRows,
    ...projectRows,
  ]);

  /** Ce qu'un type a en commun : le parent, l'horodatage, l'auteur. */
  const base = (row: TrashRow) => ({
    id: row.id,
    project_id: row.project_id ?? null,
    project_name: row.project_id ? projectById.get(row.project_id)?.name ?? null : null,
    project_color: row.project_id
      ? projectById.get(row.project_id)?.color ?? null
      : null,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by ? actors.get(row.deleted_by) ?? null : null,
  });

  const items: TrashItem[] = [
    ...issueRows.map((row) => ({
      ...base(row),
      type: "issue" as const,
      title: row.title ?? "",
      // « MIN-42 » : la clé vient du projet parent, forcément vivant ici.
      identifier: row.project_id
        ? `${projectById.get(row.project_id)?.key ?? ""}-${row.number}`
        : null,
    })),
    ...objectiveRows.map((row) => ({
      ...base(row),
      type: "objective" as const,
      title: row.name ?? "",
      identifier: null,
    })),
    ...feedbackRows.map((row) => ({
      ...base(row),
      type: "feedback" as const,
      title: row.title ?? "",
      identifier: null,
    })),
    ...projectRows.map((row) => ({
      ...base(row),
      type: "project" as const,
      title: row.name ?? "",
      identifier: row.key ?? null,
    })),
  ];

  return items.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
}

/** Une ligne corbeillée, quelle que soit sa table (colonnes en union). */
interface TrashRow {
  id: string;
  project_id?: string | null;
  deleted_at: string;
  deleted_by: string | null;
  title?: string;
  name?: string;
  key?: string;
  number?: number;
  color?: string | null;
}

async function resolveActors(
  service: SupabaseClient,
  rows: TrashRow[]
): Promise<Map<string, TrashActor>> {
  const unique = [
    ...new Set(rows.map((r) => r.deleted_by).filter((id): id is string => !!id)),
  ];
  if (unique.length === 0) return new Map();

  const [usersById, seeds] = await Promise.all([
    fetchAuthUsersById(service, unique),
    fetchAvatarSeeds(service, unique),
  ]);

  const actors = new Map<string, TrashActor>();
  for (const id of unique) {
    const user = usersById.get(id);
    if (!user) continue;
    actors.set(id, {
      user_id: id,
      ...toNamed(user),
      avatar_seed: seeds.get(id) ?? id,
    });
  }
  return actors;
}

/* ─── Restauration ─────────────────────────────────────────────────────────── */

/**
 * Remet un élément en circulation. L'accès se contrôle sur le projet VIVANT :
 * `getProjectAccess` filtre déjà les projets corbeillés, donc restaurer un
 * ticket sous un projet lui-même en corbeille échoue naturellement — il faut
 * d'abord restaurer le projet, ce que la corbeille propose juste au-dessus.
 */
export async function restoreItem(
  type: TrashType,
  id: string,
  actorId: string
): Promise<TrashResult> {
  const service = getServiceClient();

  if (type === "project") {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
    if (project.owner_id !== actorId) {
      return { ok: false, status: 403, errorKey: "ownerOnly" };
    }
  } else {
    const projectId = await resolveProjectId(service, type, id);
    if (!projectId) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    if (!(await getProjectAccess(actorId, projectId))) {
      return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    }
  }

  const { data, error } = await service
    .from(TABLE[type])
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (error) {
    // Supprimer un projet libère sa clé (index unique partiel sur les projets
    // vivants) : si l'utilisateur en a recréé un avec la même depuis, la
    // restauration ne peut pas passer. Le dire, plutôt qu'un « erreur serveur ».
    if (error.code === "23505") {
      return { ok: false, status: 409, errorKey: "projectKeyAlreadyUsed" };
    }
    console.error(`[trash] restore ${type} failed:`, error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
  return { ok: true };
}

/* ─── Purge ────────────────────────────────────────────────────────────────── */

/**
 * Supprime pour de bon. C'est le `delete` d'avant MIN-133 : il cascade sur les
 * commentaires, l'activité, les pièces jointes, les relations, et détache les
 * sous-tickets. Les objets du storage, eux, ne cascadent pas — ils sont relevés
 * avant, puis effacés une fois la ligne partie.
 */
export async function purgeItem(
  type: TrashType,
  id: string,
  actorId: string
): Promise<TrashResult> {
  const service = getServiceClient();

  if (type === "project") {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
    if (project.owner_id !== actorId) {
      return { ok: false, status: 403, errorKey: "ownerOnly" };
    }
  } else {
    const projectId = await resolveProjectId(service, type, id);
    if (!projectId) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    if (!(await getProjectAccess(actorId, projectId))) {
      return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
    }
  }

  const paths = await attachmentPaths(service, type, [id]);

  const { data, error } = await service
    .from(TABLE[type])
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[trash] purge ${type} failed:`, error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };

  await removeStorageObjects(service, paths);
  return { ok: true };
}

/**
 * La colonne d'`attachments` qui rattache un fichier à chaque type. Une pièce
 * jointe pend d'EXACTEMENT un parent — `attachments_parent_ck` l'impose sur
 * `issue_id` / `objective_id` / `feedback_post_id` (20260731090000) — et porte
 * en plus le `project_id`, qui ramasse tout le projet d'un coup.
 */
const ATTACHMENT_PARENT: Record<TrashType, string> = {
  issue: "issue_id",
  objective: "objective_id",
  feedback: "feedback_post_id",
  project: "project_id",
};

/**
 * Chemins storage à effacer avec ces lignes. Les QUATRE types en portent : un
 * objectif et un feedback ont leurs propres fichiers depuis 20260728091000 et
 * 20260731090000. Les oublier laisserait les objets orphelins dans le bucket,
 * la ligne `attachments` partie en cascade — invisibles, et impossibles à
 * rattraper ensuite. Les ressources de type LIEN n'ont pas d'objet : filtrées
 * ici, sinon la liste porterait des nulls que `remove()` refuse.
 */
export async function attachmentPaths(
  service: SupabaseClient,
  type: TrashType,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await service
    .from("attachments")
    .select("storage_path")
    .in(ATTACHMENT_PARENT[type], ids)
    .not("storage_path", "is", null);
  return (data ?? []).map((a) => a.storage_path as string);
}

/** Vide toute la corbeille de l'appelant, élément par élément. */
export async function emptyTrash(
  userId: string,
  userSupabase: SupabaseClient
): Promise<{ purged: number }> {
  const items = await listTrash(userId, userSupabase);
  let purged = 0;
  for (const item of items) {
    const result = await purgeItem(item.type, item.id, userId);
    if (result.ok) purged += 1;
  }
  return { purged };
}
