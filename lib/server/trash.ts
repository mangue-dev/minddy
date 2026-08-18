import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { removeStorageObjects } from "@/lib/server/attachments";
import {
  pageFilePathsForPages,
  pageFilePathsForProjects,
} from "@/lib/server/page-files";
import {
  forgeAttachmentPathsForProjects,
  projectIconPaths,
  removeProjectSideBuckets,
} from "@/lib/server/project-storage";
import { restorePage, trashPage, type PageErrorKey } from "@/lib/server/pages";
import type { PageWriteKind } from "@/lib/pages";

/**
 * The basket (MIN-133).
 *
 * Deleting a ticket, goal, feedback, routine or project does not
 * destroys nothing: the line is marked (`deleted_at` / `deleted_by`) and exits
 * of the app by the RLS for tickets and objectives, by an explicit filter
 * for others. It remains visible here for 30 days, can be restored identically —
 * comments, attachments, sub-posts, links and agent passages included,
 * since nothing was detached. After this period, night scanning
 * (lib/server/retention.ts) does the real deletion, the one that cascades.
 *
 * EVERYTHING goes through customer service, EPIRB bypass, and access controls
 * therefore live here: the list does not go beyond the projects to which the caller has
 * access, and each restore/purge goes through `getProjectAccess`. It is
 * also the reason why the deletion itself moved here instead
 * than to remain a `update` on the authenticated client: PostgREST renders the line
 * modified via a RETURNING, to which the SELECT policy applies — the line
 * freshly trashed would no longer pass there, and the road would look like a 404.
 */

export { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";

/** Reading safeguard: a month's bin is never that long. */
const LIST_LIMIT = 200;

export type TrashType =
  | "issue"
  | "project"
  | "objective"
  | "feedback"
  | "routine"
  | "page";

export const TRASH_TYPES: TrashType[] = [
  "issue",
  "project",
  "objective",
  "feedback",
  "routine",
  "page",
];

export function isTrashType(value: string): value is TrashType {
  return (TRASH_TYPES as string[]).includes(value);
}

/** The table bearing each type — the only place where the correspondence lives. */
const TABLE: Record<TrashType, string> = {
  issue: "issues",
  project: "projects",
  objective: "objectives",
  feedback: "feedback_posts",
  routine: "agent_routines",
  page: "pages",
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
  /** Title of ticket/feedback/routine, name of project or objective. */
  title: string;
  /** “MIN-42” for a ticket, otherwise null. */
  identifier: string | null;
  /** Parent project — null when the element IS the project. */
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  deleted_at: string;
  /** Who deleted. Null if the account has since disappeared. */
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
  | "routineNotFound"
  | "pageNotFound"
  | "ownerOnly"
  | "projectKeyAlreadyUsed"
  | "databaseError";

const NOT_FOUND: Record<TrashType, TrashErrorKey> = {
  issue: "issueNotFound",
  project: "projectNotFound",
  objective: "objectiveNotFound",
  feedback: "feedbackNotFound",
  routine: "routineNotFound",
  page: "pageNotFound",
};

/* ─── Access control ─────────────────────────── ──────────────────────────── */

/**
 * Who has the right to do what, for the THREE actions — delete, restore,
 * purge. One place: three copies of the same control end up
 * diverge, and it is the one we look at least that lets it pass.
 *
 * A project only responds to its owner. A ROUTINE either: it involves
 * a budget every Monday morning without anyone clicking, and it's already there
 * factory custody (`lib/server/routines.ts`) — the trash must not
 * offer a side path to a member. The rest (tickets, goals, returns)
 * belongs to any member of the project: the trash being shared, the error of
 * l'un reste rattrapable par l'autre.
 *
 * `mustBeTrashed`: restore and purge only concern a line ALREADY at the
 * trash, where delete concerns a living line — but we do not filter it
 * not for a project, the control of which concerns the owner, who does not
 * does not change: filtering it would cause a second call to respond “not found”.
 */
async function authorize(
  service: SupabaseClient,
  type: TrashType,
  id: string,
  actorId: string,
  mustBeTrashed: boolean
): Promise<Extract<TrashResult, { ok: false }> | null> {
  if (type === "project") {
    const query = service.from("projects").select("owner_id").eq("id", id);
    if (mustBeTrashed) query.not("deleted_at", "is", null);
    const { data: project } = await query.maybeSingle();
    if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
    if (project.owner_id !== actorId) {
      return { ok: false, status: 403, errorKey: "ownerOnly" };
    }
    return null;
  }

  const projectId = await resolveProjectId(service, type, id);
  if (!projectId) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: NOT_FOUND[type] };
  if (type === "routine" && !access.isOwner) {
    return { ok: false, status: 403, errorKey: "ownerOnly" };
  }
  return null;
}

/**
 * A refusal from `lib/server/pages.ts` (the only module whose trash
 * delegates gestures) rendered in the vocabulary here. Its error keys are
 * finer than those in the basket — a parent not found, a cycle — and
 * do not occur on these paths: they fall back on “not found”.
 */
function toTrashResult(result: {
  status: number;
  errorKey: PageErrorKey;
}): Extract<TrashResult, { ok: false }> {
  const errorKey: TrashErrorKey =
    result.errorKey === "databaseError" ? "databaseError" : "pageNotFound";
  return { ok: false, status: result.status, errorKey };
}

/* ─── Suppression ──────────────────────────────────────────────────────────── */

/** Marks an element as deleted, after access control (see `authorize`). */
export async function softDeleteItem(
  type: TrashType,
  id: string,
  actorId: string,
  /** The NATURE of the gesture (MIN-278), which only serves the pages: they are the
      alone to carry a line of activity, and without this word this would name
      the human from a basket requested from Numo. */
  kind: PageWriteKind = "human"
): Promise<TrashResult> {
  const service = getServiceClient();

  // A PAGE carries its subpages (MIN-266): the operation is not an update
  // of a line but of a subtree, and it carries its own access control.
  if (type === "page") {
    const result = await trashPage(id, actorId, kind);
    return result.ok ? { ok: true } : toTrashResult(result);
  }

  const refusal = await authorize(service, type, id, actorId, false);
  if (refusal) return refusal;

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
  // No updated line does NOT mean “not found”: the existence and
  // access have just been checked just above, so the only way to do
  // nothing to touch is that the line is ALREADY trashed. The intention of
  // the caller is satisfied (double click, replay of a request) — a 404
  // would mislead him.
  return { ok: true };
}

/** The project to which an element belongs, trashed or not, or null. */
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
 * What the caller can make up: items deleted from their projects
 * ALIVE, plus his own projects deleted.
 *
 * The tickets for a project itself in the trash are not there: restore the
 * project brings them back there, and listing them twice would make the trash the opposite
 * of what it should be — a short list of things that can be salvaged
 * d'un clic.
 *
 * ROUTINES are an exception to “all my projects”: only the owner of the
 * project can restore one (`authorize`), so only he sees them here. THE
 * showing a member would ask them a “Restore” button that responds 403.
 *
 * `userSupabase` (session client) is used to decide which projects are the
 * mine: the scope comes from the RLS, never from the service role.
 */
export async function listTrash(
  userId: string,
  userSupabase: SupabaseClient
): Promise<TrashItem[]> {
  const service = getServiceClient();

  const { data: liveProjects } = await userSupabase
    .from("projects")
    .select("id, name, key, color, owner_id")
    .is("deleted_at", null);

  const projectIds = (liveProjects ?? []).map((p) => p.id as string);
  const ownedProjectIds = (liveProjects ?? [])
    .filter((p) => p.owner_id === userId)
    .map((p) => p.id as string);
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

  /** The five types carried by a project all read the same way. */
  const inProjects = async (
    table: string,
    columns: string,
    ids: string[] = projectIds,
    /** Column to be required zero in addition — the subpages, cf. `pageRows`. */
    nullColumn?: string
  ): Promise<TrashRow[]> => {
    if (ids.length === 0) return [];
    const query = service
      .from(table)
      .select(columns)
      .in("project_id", ids)
      .not("deleted_at", "is", null);
    if (nullColumn) query.is(nullColumn, null);
    const { data } = await query
      .order("deleted_at", { ascending: false })
      .limit(LIST_LIMIT);
    return (data ?? []) as unknown as TrashRow[];
  };

  const [issueRows, objectiveRows, feedbackRows, routineRows, pageRows, projectRows] =
    await Promise.all([
      inProjects("issues", "id, project_id, deleted_at, deleted_by, number, title"),
      inProjects("objectives", "id, project_id, deleted_at, deleted_by, name"),
      inProjects("feedback_posts", "id, project_id, deleted_at, deleted_by, title"),
      inProjects(
        "agent_routines",
        "id, project_id, deleted_at, deleted_by, title",
        ownedProjectIds
      ),
      // Only deletion ROOTS (`deleted_root_id is null`): one
      // page and its twenty subpages make ONE line to restore, not twenty.
      inProjects(
        "pages",
        "id, project_id, deleted_at, deleted_by, title, deleted_root_id",
        projectIds,
        "deleted_root_id"
      ),
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
    ...routineRows,
    ...pageRows,
    ...projectRows,
  ]);

  /** What a type has in common: parent, timestamp, author. */
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
      // “MIN-42”: the key comes from the parent project, obviously living here.
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
    ...routineRows.map((row) => ({
      ...base(row),
      type: "routine" as const,
      title: row.title ?? "",
      identifier: null,
    })),
    ...pageRows.map((row) => ({
      ...base(row),
      type: "page" as const,
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

/** A basketed row, whatever its table (columns in union). */
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
 * Returns an item to circulation. Access is controlled on the VIVANT project:
 * `getProjectAccess` already filters trashed projects, so restore a
 * ticket under a project itself in trash naturally fails — you have to
 * first restore the project, which is what the trash offers just above.
 */
export async function restoreItem(
  type: TrashType,
  id: string,
  actorId: string,
  /** Cf. `softDeleteItem`: the nature of the gesture, for the line of activity of the
      page restored. */
  kind: PageWriteKind = "human"
): Promise<TrashResult> {
  const service = getServiceClient();

  // A PAGE returns with everything that left with it, and goes back to the
  // root if its parent is still trashed (MIN-266).
  if (type === "page") {
    const result = await restorePage(id, actorId, kind);
    return result.ok ? { ok: true } : toTrashResult(result);
  }

  const refusal = await authorize(service, type, id, actorId, true);
  if (refusal) return refusal;

  const { data, error } = await service
    .from(TABLE[type])
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (error) {
    // Deleting a project releases its key (partial unique index on projects
    // alive): if the user has recreated one with the same one since then, the
    // restoration cannot pass. Say it, rather than a “server error”.
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
 * Delete for good. This is the `delete` before MIN-133: it cascades over the
 * comments, activity, attachments, relationships, passages
 * agent of a routine, and detaches the sub-tickets. The storage objects
 * do not cascade — they are raised before, then erased once the line
 * partie.
 */
export async function purgeItem(
  type: TrashType,
  id: string,
  actorId: string
): Promise<TrashResult> {
  const service = getServiceClient();

  const refusal = await authorize(service, type, id, actorId, true);
  if (refusal) return refusal;

  const paths = await attachmentPaths(service, type, [id]);

  // A PROJECT also carries objects outside the `attachments` bucket: its icon and
  // the attachments of the comments of his pull requests, in two buckets
  // AUDIENCE in reading (MIN-296). Noted here, before the delete which takes the
  // lines from which they are deduced; deleted afterwards.
  const sideBuckets =
    type === "project"
      ? {
          icons: await projectIconPaths(service, [id]),
          forge: await forgeAttachmentPathsForProjects(service, [id]),
        }
      : null;

  // A purged page takes the subpages gone with it: they no longer have
  // of root to return to, and `parent_id` being `on delete set null`, nothing
  // would take them away — they would reappear at the root of the trash.
  if (type === "page") {
    // The files of the WHOLE FAMILY, noted before deletion: `paths`
    // above only knows the root, and the subpages carried away carry
    // theirs (MIN-280). This is the subject trap — the SQL cascade erases the
    // lines of `page_files`, never the bytes of the bucket.
    const { data: descendants } = await service
      .from("pages")
      .select("id")
      .eq("deleted_root_id", id);
    const familyIds = [id, ...((descendants ?? []) as { id: string }[]).map((p) => p.id)];
    const familyPaths = await pageFilePathsForPages(service, familyIds);

    const { data: family, error: familyError } = await service
      .from("pages")
      .delete()
      .or(`id.eq.${id},deleted_root_id.eq.${id}`)
      .not("deleted_at", "is", null)
      .select("id");
    if (familyError) {
      console.error("[trash] purge page failed:", familyError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    if (!family || family.length === 0) {
      return { ok: false, status: 404, errorKey: "pageNotFound" };
    }
    await removeStorageObjects(service, familyPaths);
    return { ok: true };
  }

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
  if (sideBuckets) {
    const { errors } = await removeProjectSideBuckets(service, sideBuckets);
    for (const message of errors) console.error(`[trash] purge project: ${message}`);
  }
  return { ok: true };
}

/**
 * The `attachments` column that attaches a file to each type. One piece
 * attached depends on EXACTLY one parent — `attachments_parent_ck` imposes it on
 * `issue_id` / `objective_id` / `feedback_post_id` (20260731090000) — and door
 * in addition the `project_id`, which takes over the entire project at once.
 *
 * `null` for a ROUTINE: it has no surface on which to place a file —
 * no comments, no resources —, and inventing a column for it would
 * Fail the purge on a column that does not exist. Also null for a PAGE,
 * but for an opposite reason: since MIN-280 it has indeed worn
 * files, only they live in `page_files` and not in `attachments`
 * (two lifetimes, two tables — see migration). They are just raised
 * below, in the same function.
 */
const ATTACHMENT_PARENT: Record<TrashType, string | null> = {
  issue: "issue_id",
  objective: "objective_id",
  feedback: "feedback_post_id",
  project: "project_id",
  routine: null,
  page: null,
};

/**
 * Storage paths to clear with these lines. FOUR of the five guys wear them:
 * a goal and feedback have their own files since 20260728091000 and
 * 20260731090000. Forgetting them would leave the objects orphaned in the bucket,
 * the `attachments` line cascades — invisible, and impossible to
 * catch up afterwards. LINK type resources have no object: filtered
 * here, otherwise the list would carry nulls that `remove()` refuses.
 */
export async function attachmentPaths(
  service: SupabaseClient,
  type: TrashType,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];

  // Files PLACED IN a page body (MIN-280): another table, therefore
  // one more query, but the same rule — the paths are noted before the
  // delete, otherwise the cascade takes away the lines and leaves the bytes. One page
  // only has these; a project has both, its pages leaving with it.
  const pageFiles =
    type === "page"
      ? await pageFilePathsForPages(service, ids)
      : type === "project"
        ? await pageFilePathsForProjects(service, ids)
        : [];

  const parent = ATTACHMENT_PARENT[type];
  if (!parent) return pageFiles;
  const { data } = await service
    .from("attachments")
    .select("storage_path")
    .in(parent, ids)
    .not("storage_path", "is", null);
  return [...pageFiles, ...(data ?? []).map((a) => a.storage_path as string)];
}

/** Empties the caller's entire trash, item by item. */
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
