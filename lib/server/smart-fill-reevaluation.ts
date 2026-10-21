import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { issueStore } from "@/lib/server/issue-store";
import { decodeProjectName } from "@/lib/server/project-content";
import { runSmartFill, type SmartFillPatch } from "@/lib/server/smart-fill";
import { updateIssueFields } from "@/lib/server/update-issue";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { resolveSmartFillReevaluation } from "@/lib/smart-fill";

/**
 * SMART FILL RE-EVALUATION (MIN-750) — an issue whose title or description
 * changed is read again, once the edits have rested.
 *
 * Creation is the only moment Smart Fill used to read an issue, yet its scope
 * often settles in the minutes that follow: the author completes the
 * description, rewrites the title. This pass answers again on the new text,
 * under three rules.
 *
 *   1. ONLY WHAT NOBODY SET. `issue_smart_fill.fields` lists the properties
 *      Smart Fill owns: left empty by the author at creation, never changed
 *      by hand since. Any other write of that property (the panel, Numo, MCP,
 *      a forge label) removes it from the list for good. An issue without a
 *      row — created before this feature or with Smart Fill off — is never
 *      re-evaluated.
 *   2. ONE PASS PER BURST OF EDITS. Each title or description write pushes
 *      `reevaluate_at` five minutes ahead; the scheduled worker runs the
 *      rows that are due. Twenty description saves in a minute cost one pass.
 *   3. SAID ONLY WHEN SOMETHING CHANGED. The changes go through the ordinary
 *      write paths, as the latest editor, stamped `via_smart_fill`: the
 *      timeline names Smart-fill on the issue (and on the objectives an issue
 *      leaves or joins). A pass that changes nothing writes nothing.
 *
 * The latest editor pays, and their `smart_fill_reevaluate` preference is read
 * when the pass runs, so turning it off cancels what is still waiting.
 */

/** Passes one worker run takes on; each one is a model call. */
const BATCH_SIZE = 10;

export interface ReevaluationState {
  priority: string;
  effort: string | null;
  objective_id: string | null;
  category_ids: readonly string[];
}

export interface ReevaluationChanges {
  /** Scalar fields for `updateIssueFields`, empty when none changes. */
  fields: Partial<Pick<ReevaluationState, "priority" | "effort" | "objective_id">>;
  /** The new category set, or `null` to leave categories alone. */
  categoryIds: string[] | null;
}

/**
 * What the pass may write: the patch, restricted to the owned fields and to
 * values that differ from the issue's. Pure.
 *
 * Two answers are kept apart from the others. An effort of `null` ("nothing
 * estimable") is a real answer and may clear an effort Smart Fill set. An
 * objective, by contrast, is never cleared: the patch cannot tell "no
 * objective" from "not sure", and the creation pass only ever adds one.
 * Categories are replaced only by a non-empty answer, for the same reason.
 */
export function reevaluationChanges(
  current: ReevaluationState,
  owned: ReadonlySet<string>,
  patch: SmartFillPatch,
): ReevaluationChanges {
  const fields: ReevaluationChanges["fields"] = {};
  if (owned.has("priority") && patch.priority && patch.priority !== current.priority) {
    fields.priority = patch.priority;
  }
  if (owned.has("effort") && patch.effort !== undefined && patch.effort !== (current.effort ?? null)) {
    fields.effort = patch.effort;
  }
  if (owned.has("objective_id") && patch.objective_id && patch.objective_id !== current.objective_id) {
    fields.objective_id = patch.objective_id;
  }
  let categoryIds: string[] | null = null;
  if (owned.has("category_ids") && patch.category_ids?.length) {
    const before = new Set(current.category_ids);
    const sameSet =
      before.size === patch.category_ids.length && patch.category_ids.every((id) => before.has(id));
    if (!sameSet) categoryIds = patch.category_ids;
  }
  return { fields, categoryIds };
}

type DueRow = {
  issue_id: string;
  project_id: string;
  fields: string[];
  reevaluate_at: string;
  reevaluate_by: string | null;
};

export type ReevaluationOutcome =
  | "applied"
  | "unchanged"
  | "no_editor"
  | "nothing_owned"
  | "disabled"
  | "issue_unavailable"
  | "requeued"
  | "write_failed";

/**
 * The scheduled worker: claims the passes that are due, then runs them one by
 * one. A claim clears `reevaluate_at` only if it still holds the value read,
 * so an edit arriving meanwhile keeps its own, later, pass.
 */
export async function runDueSmartFillReevaluations(
  limit = BATCH_SIZE,
): Promise<{ due: number; outcomes: Partial<Record<ReevaluationOutcome, number>> }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("issue_smart_fill")
    .select("issue_id, project_id, fields, reevaluate_at, reevaluate_by")
    .lte("reevaluate_at", new Date().toISOString())
    .order("reevaluate_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Unable to read due Smart Fill re-evaluations");
  const rows = (data ?? []) as DueRow[];
  const outcomes: Partial<Record<ReevaluationOutcome, number>> = {};
  for (const row of rows) {
    const { data: claimed, error: claimError } = await service
      .from("issue_smart_fill")
      .update({ reevaluate_at: null })
      .eq("issue_id", row.issue_id)
      .eq("reevaluate_at", row.reevaluate_at)
      .select("issue_id");
    if (claimError || !claimed?.length) continue;
    const outcome = await reevaluateIssue(service, row).catch((): ReevaluationOutcome => {
      console.error("[smart-fill-reevaluation] pass failed: unexpected_error");
      return "write_failed";
    });
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { due: rows.length, outcomes };
}

async function reevaluateIssue(service: SupabaseClient, row: DueRow): Promise<ReevaluationOutcome> {
  const editorId = row.reevaluate_by;
  if (!editorId) return "no_editor";
  const owned = new Set(row.fields);
  if (owned.size === 0) return "nothing_owned";

  const { data: account, error: accountError } = await service.auth.admin.getUserById(editorId);
  if (accountError || !account.user) return "no_editor";
  if (!resolveSmartFillReevaluation((account.user.user_metadata ?? {}) as Record<string, unknown>)) {
    return "disabled";
  }

  const issue = await readState(service, row.issue_id, row.project_id, editorId);
  if (!issue) return "issue_unavailable";

  const patch = await runSmartFill({
    projectId: row.project_id,
    projectName: issue.projectName,
    billToUserId: editorId,
    title: issue.title,
    description: issue.description,
  });
  const changes = reevaluationChanges(issue.state, owned, patch);
  const hasFields = Object.keys(changes.fields).length > 0;
  if (!hasFields && !changes.categoryIds) return "unchanged";

  // The answer is about the text read above. Any write since — usually one
  // more edit, which already queued its own pass — makes it stale.
  if (hasFields) {
    const result = await updateIssueFields({
      issueId: row.issue_id,
      actorId: editorId,
      input: changes.fields,
      viaSmartFill: true,
      expectedUpdatedAt: issue.updatedAt,
    });
    if (!result.ok) {
      if (result.status === 409) return requeue(service, row.issue_id);
      return "write_failed";
    }
  } else {
    const fresh = await readUpdatedAt(service, row.issue_id);
    if (fresh !== issue.updatedAt) return requeue(service, row.issue_id);
  }
  if (changes.categoryIds) {
    const result = await setIssueCategories({
      issueId: row.issue_id,
      actorId: editorId,
      categoryIds: changes.categoryIds,
      viaSmartFill: true,
    });
    if (!result.ok) return "write_failed";
  }
  return "applied";
}

/** Run the pass again on the next tick, unless an edit already queued one. */
async function requeue(service: SupabaseClient, issueId: string): Promise<ReevaluationOutcome> {
  await service
    .from("issue_smart_fill")
    .update({ reevaluate_at: new Date().toISOString() })
    .eq("issue_id", issueId)
    .is("reevaluate_at", null);
  return "requeued";
}

async function readUpdatedAt(service: SupabaseClient, issueId: string): Promise<string | null> {
  const { data } = await issueStore(service)
    .select("id, updated_at")
    .eq("id", issueId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.updated_at as string | undefined) ?? null;
}

async function readState(
  service: SupabaseClient,
  issueId: string,
  projectId: string,
  editorId: string,
): Promise<{
  title: string;
  description: string | null;
  updatedAt: string;
  projectName: string;
  state: ReevaluationState;
} | null> {
  const [{ data: issue, error: issueError }, { data: categories, error: categoryError }, { data: project }] =
    await Promise.all([
      issueStore(service, editorId)
        .select("id, title, description, priority, effort, objective_id, updated_at")
        .eq("id", issueId)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .maybeSingle(),
      service.from("issue_categories").select("category_id").eq("issue_id", issueId),
      service
        .from("projects")
        .select("id, name, encrypted_content, encryption_version, deleted_at")
        .eq("id", projectId)
        .maybeSingle(),
    ]);
  if (issueError || categoryError || !issue || !project || project.deleted_at) return null;
  const projectName = await decodeProjectName(project, editorId).catch(() => "this project");
  return {
    title: issue.title as string,
    description: (issue.description as string | null) ?? null,
    updatedAt: issue.updated_at as string,
    projectName,
    state: {
      priority: issue.priority as string,
      effort: (issue.effort as string | null) ?? null,
      objective_id: (issue.objective_id as string | null) ?? null,
      category_ids: (categories ?? []).map((c) => c.category_id as string),
    },
  };
}
