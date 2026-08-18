import type { CreateIssueInput, Issue } from "./types";

/**
 * Constructs an "optimistic" issue from the creation input, inserted
 * into the cache immediately so that the card appears without waiting for POST
 * (MIN-40). Reconciled with the server line on success, removed on failure.
 *
 * **It is the client who NAMEs the line**: the id drawn here leaves with the creation
 * (`CreateIssueInput.id`) and becomes the primary key in base. Without that the card
 * was displayed twice for a second: the trigger broadcasts the INSERT at the commit,
 * well before the POST responded (it still has the attachments, the
 * categories and Smart Assign to do), and the real-time bridge could not recognize this broadcast as ours — the write register en
 * wait only knew the optimistic id, the line broadcast carried one
 * other. He therefore adopted it as the line of a third party, alongside the optimistic card
 *; then the return of the POST placed the server line ON the card, two
 * entries of the same id that only a refetch reattached (quickly on the board of a
 * project, several seconds on `/all`, hence the duplicate which "remained").
 * Same id on both sides, `issueWrites.wasJustWritten` recognizes the echo and the
 * bridge lets it pass, exactly as for an edition.
 *
 * The `number`, itself, remains an estimate (max + 1 **in this project**) adjusted to
 * success — the final value comes from server-side atomic counter.
 */
export function buildOptimisticIssue(
  input: CreateIssueInput,
  projectId: string,
  userId: string | null,
  existing: Issue[]
): Issue {
  const now = new Date().toISOString();
  const nextNumber =
    existing.reduce(
      (m, i) => (i.project_id === projectId ? Math.max(m, i.number) : m),
      0
    ) + 1;
  const status = input.status ?? "backlog"; // same default as the DB column
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    number: nextNumber,
    title: input.title,
    description: input.description ?? null,
    plan: input.plan ?? null,
    status,
    priority: input.priority ?? "none",
    effort: input.effort ?? null,
    assignee_id: input.assignee_id ?? null,
    objective_id: input.objective_id ?? null,
    parent_id: input.parent_id ?? null,
    duplicate_of_id: null,
    due_date: input.due_date ?? null,
    recurrence: input.recurrence ?? null,
    // Asked by the server at the first activation (it is worth the id of the line,
    // which we don't have yet): the optimistic card does without it.
    recurrence_series_id: null,
    position: Date.now(),
    created_by: userId,
    integration_id: null,
    created_at: now,
    updated_at: now,
    completed_at: status === "done" ? now : null,
    cycle_id: null,
    category_ids: input.category_ids ?? [],
    // The attachment count is an AGGREGATE: neither the POST response nor the
    // broadcast line does not carry it, only the GET of the board calculates it. We put it
    // so here — at creation, the ticket resources are exactly those
    // that we send —, otherwise the pellet would be missing until the next refetch.
    resource_count:
      (input.resources?.length ?? 0) + (input.copy_resources?.length ?? 0),
  };
}
