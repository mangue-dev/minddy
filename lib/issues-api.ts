"use client";

import type { QueryClient } from "@tanstack/react-query";
import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";
import { rememberCreateProject } from "./last-create-project";
import { applyPendingIssues } from "./optimistic/issue-writes";
import { reconcileProjectIssuesInGlobalCache } from "./global-issues-api";
import type {
  CreateIssueInput,
  Issue,
  IssueUpdateInput,
  RecurringIssue,
} from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as T;
}

/** `signal`: the one that react-query provides to its `queryFn` — a canceled refetch
 actually drops its query instead of letting it run and respond late
 (MIN-156). */
export async function fetchIssuesApi(
  projectId: string,
  signal?: AbortSignal
): Promise<Issue[]> {
  return parseJson<Issue[]>(
    await fetch(`/api/projects/${projectId}/issues`, { signal })
  );
}

/**
 * The `queryFn` of `["issues", projectId]`, shared by ALL its observers:
 * the project board, the dashboard cards, the header and the
 * preloading on hover. A single function for a single key — otherwise the
 * last mounted observer would impose its reading, and a reading that skips
 * the overlay brings back the bug (MIN-156).
 *
 * It retains the START instant of the request and sends the response to the
 * register of pending writes: a response left before a write ne
 * can no longer undo it, whatever its order of arrival.
 */
export function issuesQueryFn(projectId: string) {
  return async ({
    signal,
    client,
  }: { signal?: AbortSignal; client?: QueryClient } = {}): Promise<Issue[]> => {
    const startedAt = Date.now();
    const issues = applyPendingIssues(
      await fetchIssuesApi(projectId, signal),
      startedAt,
      projectId
    );
    if (client) reconcileProjectIssuesInGlobalCache(client, projectId, issues);
    return issues;
  };
}

/** Active recurrences of a project (MIN-136) — one live ticket per series,
 read by the “Recurrences” tab of its settings. */
export async function fetchRecurrencesApi(
  projectId: string
): Promise<RecurringIssue[]> {
  return parseJson<RecurringIssue[]>(
    await fetch(`/api/projects/${projectId}/recurrences`)
  );
}

/** One issue, in full. Used where only a light row is at hand — the command
 palette's cross-project index (MIN-91) carries no description or plan, which
 “copy prompt” needs, so it fetches the ticket on demand. */
export async function fetchIssueApi(issueId: string): Promise<Issue> {
  return parseJson<Issue>(await fetch(`/api/issues/${issueId}`));
}

export async function createIssueApi(
  projectId: string,
  input: CreateIssueInput
): Promise<Issue> {
  const issue = await parseJson<Issue>(
    await fetch(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  // All client-side creations go through here (project board, board
  // aggregate, global dialog, palette, cancellation): this is therefore the only place to
  // instrument to memorize the last project where a ticket was created, which
  // serves as the default project for the dialog when the route does not designate any. After
  // success only — a rejected creation does not move the defect.
  rememberCreateProject(projectId);
  return issue;
}

/** Optional analytics context — the surface from which the edition starts (MIN-78). */
export interface IssueMutationMeta {
  /** « side_panel », « kanban », « palette », « context_menu », « bulk »… */
  surface?: string;
  /** Previous state, when the caller knows it (optimistic update). */
  previousStatus?: string | null;
}

/**
 * Translates a patch into analytics events (MIN-78).
 *
 * It's here, not in every component, because ALL editions of
 * ticket converge on `updateIssueApi`: side panel, context menu,
 * drag and drop kanban, pallet, bulk actions, cancellation. Instrumenting
 * the bottleneck rather than the dozen callers guarantees that no
 * path is forgotten — and that a future caller is automatically covered.
 *
 * Only METADATA leaves: never the title or description, only
 * their modification and the length range.
 */
function trackIssueUpdate(updates: IssueUpdateInput, meta?: IssueMutationMeta): void {
  const surface = meta?.surface ?? "unknown";
  const patch = updates as Record<string, unknown>;

  if (patch.status !== undefined) {
    trackEvent("issue_status_changed", {
      from: meta?.previousStatus ?? null,
      to: String(patch.status),
      surface,
    });
  }
  if (patch.priority !== undefined) {
    trackEvent("issue_priority_changed", { to: String(patch.priority), surface });
  }
  if (patch.assignee_id !== undefined) {
    trackEvent("issue_assignee_changed", {
      assigned: patch.assignee_id !== null,
      surface,
    });
  }
  if (patch.effort !== undefined) {
    trackEvent("issue_effort_changed", { to: String(patch.effort ?? "none") });
  }
  if (patch.due_date !== undefined) {
    trackEvent("issue_due_date_changed", { cleared: patch.due_date === null });
  }
  if (patch.cycle_id !== undefined && patch.status !== "triage") {
    // The cycle is a ticket field, but the user action is "add
    // to / remove from my cycle” — that’s the name we want to read it under. Hence
    // the exception: a trip to triage removes the ticket from the cycle (MIN-32), but
    // it's a consequence, not the gesture — counting it would distort the measurement.
    trackEvent(patch.cycle_id === null ? "cycle_issue_removed" : "cycle_issue_added", {
      surface,
    });
  }
  if (patch.duplicate_of_id !== undefined && patch.duplicate_of_id !== null) {
    trackEvent("issue_relation_added", { relation: "duplicate" });
  }
  if (patch.objective_id !== undefined) {
    trackEvent("issue_objective_changed", { assigned: patch.objective_id !== null });
  }
  if (patch.title !== undefined) trackEvent("issue_title_edited", {});
  if (patch.description !== undefined) {
    trackEvent("issue_description_edited", {
      length_bucket: lengthBucket(
        typeof patch.description === "string" ? patch.description : null
      ),
    });
  }
  if (patch.plan !== undefined) {
    trackEvent("issue_plan_edited", {
      task_count:
        typeof patch.plan === "string"
          ? (patch.plan.match(/^\s*[-*]\s*\[[ x~-]\]/gim)?.length ?? 0)
          : 0,
    });
  }
  if (patch.parent_id !== undefined) {
    trackEvent("issue_relation_added", { relation: "parent" });
  }
}

export async function updateIssueApi(
  issueId: string,
  updates: IssueUpdateInput,
  meta?: IssueMutationMeta
): Promise<Issue> {
  const issue = parseJson<Issue>(
    await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
  // Tracked only after a successful round trip — an edition rejected by the
  // server (quota, permission) is not an edition.
  void issue.then(
    () => trackIssueUpdate(updates, meta),
    () => {}
  );
  return issue;
}

export async function deleteIssueApi(
  issueId: string,
  meta?: IssueMutationMeta
): Promise<void> {
  const response = await fetch(`/api/issues/${issueId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
  trackEvent("issue_deleted", { surface: meta?.surface ?? "unknown" });
}
