import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { categoryKey, resolveCategoryIdsByName } from "@/lib/server/categories";
import { insertAttachmentsFor } from "@/lib/server/attachments";
import { insertEvents, stampForgeSync, type EventRow } from "@/lib/server/issue-events";
import { normalizeToken } from "@/lib/import/normalize";
import type { ImportedIssue, ImportSource } from "@/lib/import/types";

/**
 * Bulk-insert core of the CSV importers (MIN-45). Deliberately NOT a loop over
 * createIssueForProject: an import must not fire per-issue side effects (stats
 * ledger, Smart Assign, webhooks, sub_issue_added events) nor pay N sequential
 * round-trips. Issues get one `imported` timeline event instead of `created` —
 * a type the webhook dispatcher doesn't map, so nothing is delivered outside. :
 *
 * 1. The identifiers are taken HERE (`randomUUID`), not returned by the base.
 * So a ticket knows the id of its parent BEFORE being inserted: more
 * second pass of links (it was an UPDATE by subticket), more de
 * table number → id to rebuild. Categories and events are built in the same vein.
 * 2. Numbers are reserved in ONE call (`next_issue_numbers`), not one per
 * ticket. This was the dominant position: 1,000 tickets = 1,000 RPC.
 *
 * An import of 1,000 tickets now takes a dozen round trips,
 * all in batches, instead of a good thousand.
 *
 * Callers MUST have verified the actor's access beforehand (writes bypass RLS).
 *
 * Not transactional: a failure mid-way leaves the already-inserted chunks in
 * place (visible, deleteable) and unused reserved numbers become plain gaps in
 * the KEY numbering — both harmless, so no compensation logic.
 */

export interface ImportOutcome {
  created: number;
  categoriesCreated: number;
  subIssuesLinked: number;
  /** Tickets returned to a project member — what reconciliation saved. */
  assigned: number;
}

export type ImportCommitResult =
  | { ok: true; result: ImportOutcome }
  | { ok: false; status: number; errorKey: "databaseError" };

const dbError = (step: string, message: string): ImportCommitResult => {
  console.error(`[import-issues] ${step} failed:`, message);
  return { ok: false, status: 500, errorKey: "databaseError" };
};

/** Rows by INSERT. Beyond that, the request becomes cumbersome to serialize without
 * saving network time. */
const INSERT_CHUNK = 200;
/** Rows by INSERT for join tables, narrower. */
const LINK_CHUNK = 1000;

export async function importIssuesIntoProject({
  projectId,
  actorId,
  issues,
  source,
}: {
  projectId: string;
  actorId: string;
  issues: ImportedIssue[];
  source: ImportSource;
}): Promise<ImportCommitResult> {
  const service = getServiceClient();
  if (issues.length === 0) {
    return {
      ok: true,
      result: { created: 0, categoriesCreated: 0, subIssuesLinked: 0, assigned: 0 },
    };
  }

  // ── Categories: match existing labels case-insensitively, create the rest ──
  // The fine reconciliation (“Bugs” → the “Bug” category of the project) has already been
  // place the mapping: what happens here is the DESIRED name. `resolveCategoryIdsByName`
  // does the rest — and it's the SAME pass as that of syncing a repository
  // linked, so that the backfill and the webhooks that follow it are not created
  // not two “Bug” categories.
  const resolved = await resolveCategoryIdsByName(
    projectId,
    issues.flatMap((issue) => issue.labels)
  );
  if (!resolved) return dbError("categories resolve", "see [categories] log");
  const { idByKey: categoryIdByKey, created: categoriesCreated } = resolved;

  // ── Numbers: one RPC reserves the whole range, atomically. ──
  const { data: firstNumber, error: numberError } = await service.rpc(
    "next_issue_numbers",
    { p_project_id: projectId, p_count: issues.length }
  );
  if (numberError || typeof firstNumber !== "number") {
    return dbError("number reservation", numberError?.message ?? "no number");
  }

  // ── Identity first: ids are ours, so every link is known before insert. ──
  const ids = issues.map(() => randomUUID());
  const idByExternalKey = new Map<string, string>();
  issues.forEach((issue, i) => {
    for (const key of issue.externalKeys) idByExternalKey.set(normalizeToken(key), ids[i]);
  });

  const positionBase = Date.now();
  let subIssuesLinked = 0;
  let assigned = 0;

  const rows = issues.map((issue, i) => {
    // The links have been validated against the batch during analysis (parent present, a
    // single level): all that remains is to resolve the key by identifier.
    const parentId = issue.parentExternalKey
      ? (idByExternalKey.get(normalizeToken(issue.parentExternalKey)) ?? null)
      : null;
    if (parentId && parentId !== ids[i]) subIssuesLinked += 1;
    if (issue.assigneeId) assigned += 1;

    const row: Record<string, unknown> = {
      id: ids[i],
      project_id: projectId,
      number: firstNumber + i,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      // The caller has verified that the assignee is a member of the project
      // (`sanitizeMapping`): the column carries an FK to auth.users.
      assignee_id: issue.assigneeId,
      due_date: issue.dueDate,
      // The objective is a real id, created and validated by the caller (primed by
      // brief, MIN-172): nothing to resolve here.
      objective_id: issue.objectiveId ?? null,
      parent_id: parentId && parentId !== ids[i] ? parentId : null,
      created_by: actorId,
      position: positionBase + i,
    };
    if (issue.createdAt) row.created_at = issue.createdAt;
    // Backfill of a linked repository (MIN-97): the remote identity travels with the
    // line, the partial UNIQUE index guarantees that it is only imported once.
    if (issue.remote) {
      row.remote_provider = issue.remote.provider;
      row.remote_repo_id = issue.remote.repoId;
      row.remote_number = issue.remote.number;
      row.remote_url = issue.remote.url;
    }
    if (issue.status === "done") {
      row.completed_at =
        issue.completedAt ?? issue.createdAt ?? new Date().toISOString();
    }
    return row;
  });

  // Parents first: a child inserted before his parent would violate CF
  // `parent_id`, and the order of the file does not guarantee anything.
  const order = rows
    .map((_, i) => i)
    .sort((a, b) => Number(rows[a].parent_id != null) - Number(rows[b].parent_id != null));
  const ordered = order.map((i) => rows[i]);

  for (let i = 0; i < ordered.length; i += INSERT_CHUNK) {
    const { error } = await service.from("issues").insert(ordered.slice(i, i + INSERT_CHUNK));
    if (error) return dbError("issues insert", error.message);
  }

  // ── Categories on issues (best-effort: the issues exist from here on) ──
  const categoryRows: { issue_id: string; category_id: string }[] = [];
  issues.forEach((issue, i) => {
    const seen = new Set<string>();
    for (const label of issue.labels) {
      const categoryId = categoryIdByKey.get(categoryKey(label));
      if (categoryId && !seen.has(categoryId)) {
        seen.add(categoryId);
        categoryRows.push({ issue_id: ids[i], category_id: categoryId });
      }
    }
  });
  for (let i = 0; i < categoryRows.length; i += LINK_CHUNK) {
    const { error } = await service
      .from("issue_categories")
      .insert(categoryRows.slice(i, i + LINK_CHUNK));
    if (error) console.error("[import-issues] categories attach failed:", error.message);
  }

  // ── Resources (best-effort, like categories: tickets exist) ──
  // The backfill of a linked repository places the LINK of the remote issue there — a link,
  // so no storage objects to clean up if the insert fails. By batch as
  // all the rest of the module: each ticket has its parent, but only one INSERT.
  const resourceEntries = issues.flatMap((issue, i) =>
    (issue.resources ?? []).map((resource) => ({
      parent: { projectId, issueId: ids[i], createdBy: actorId },
      resource,
    }))
  );
  for (let i = 0; i < resourceEntries.length; i += LINK_CHUNK) {
    try {
      await insertAttachmentsFor(service, resourceEntries.slice(i, i + LINK_CHUNK));
    } catch (e) {
      console.error("[import-issues] resources attach failed:", (e as Error).message);
    }
  }

  // ── Timeline: one `imported` event per issue (to_value = source) ──
  // Backfill of a linked repository (MIN-97): the event is stamped forge so that
  // the timeline credits GitHub/GitLab, not the owner who activated the sync.
  const forge = source === "github" || source === "gitlab" ? source : null;
  const events: EventRow[] = ids.map((id) => ({
    issue_id: id,
    actor_id: actorId,
    type: "imported",
    to_value: source,
  }));
  for (let i = 0; i < events.length; i += LINK_CHUNK) {
    await insertEvents(service, stampForgeSync(events.slice(i, i + LINK_CHUNK), forge));
  }

  return {
    ok: true,
    result: { created: ids.length, categoriesCreated, subIssuesLinked, assigned },
  };
}
