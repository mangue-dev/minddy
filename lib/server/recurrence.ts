import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecurrenceCadence, nextDueDateISO, seriesIdOf } from "@/lib/recurrence";
import { createIssueForProject } from "@/lib/server/create-issue";
import { insertEvents } from "@/lib/server/issue-events";

/**
 * The heart of recurring tickets (MIN-136): a ticket which passes to `done`
 * generates its successor, to `backlog`, at the expiry shifted by one cadence.
 *
 * The invariant held here: ONE single living ticket carries a given recurrence. The
 * cadence is first REMOVED from the terminated ticket by a compare-and-swap
 * (`where recurrence is not null`), and only the one who wins this swap creates
 * the occurrence. Two consequences, both intended:
 *
 * - two concurrent writes (grouped edition which replays, webhook reissued)
 * cannot create two occurrences;
 * - a `done → todo → done` does not recreate anything: the recurrence has moved on
 * the next occurrence, the reopened ticket is just a regular ticket.
 *
 * Called from the deferred effects of lib/server/update-issue.ts — the only
 * status write path (UI, MCP, Numo, agent, sync of deposit).
 */
export async function spawnNextOccurrence({
  service,
  completed,
  actorId,
  projectName = null,
}: {
  service: SupabaseClient;
  /** The completed ticket line, such that update-issue loaded it BEFORE the
 update (it still carries its recurrence). */
  completed: Record<string, unknown>;
  /** Who checked the ticket: author of the following occurrence and its
 creation event — it was his gesture that gave rise to it. */
  actorId: string;
  projectName?: string | null;
}): Promise<void> {
  const cadence = completed.recurrence;
  if (!isRecurrenceCadence(cadence)) return;
  const issueId = completed.id as string;

  // Compare-and-swap: which resets the cadence to null creates the occurrence.
  const { data: claimed, error: claimError } = await service
    .from("issues")
    .update({ recurrence: null })
    .eq("id", issueId)
    .not("recurrence", "is", null)
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("[recurrence] claim failed:", claimError.message);
    return;
  }
  if (!claimed) return; // someone else has already created the occurrence

  // The deadline sets the pace, not the closing date: a Monday review
  // checked on Wednesday falls on the following Monday. Without deadline (line
  // written before the rule “a cadence requires a date”), the series stops —
  // the cadence has just been removed, there is nothing to reschedule.
  const due = nextDueDateISO(completed.due_date as string | null, cadence);
  if (!due) {
    console.error("[recurrence] no due date to schedule from, series stopped:", issueId);
    return;
  }

  const { data: categoryRows } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);

  // What is transmitted: enough to do THE SAME work again. Neither the plan (the
  // log ONE occurrence), nor the parent (the next occurrence is not
  // a sub-ticket of the same site), nor the attachments or comments.
  const result = await createIssueForProject({
    projectId: completed.project_id as string,
    projectName,
    actorId,
    input: {
      title: completed.title,
      description: completed.description ?? null,
      status: "backlog",
      priority: completed.priority,
      effort: completed.effort ?? null,
      assignee_id: completed.assignee_id ?? null,
      objective_id: completed.objective_id ?? null,
      due_date: due,
      recurrence: cadence,
      category_ids: (categoryRows ?? []).map((c) => c.category_id as string),
    },
    recurrenceSeriesId: seriesIdOf({
      id: issueId,
      recurrence_series_id: completed.recurrence_series_id as string | null,
    }),
  });

  if (!result.ok) {
    // Limit of plan outcomes reached, base unavailable… The rate has already
    // been removed: the series ends there rather than looping each time
    // fence. The completed ticket keeps its `recurrence_series_id`, so the
    // recurrence remains restable by hand on the next ticket.
    console.error(
      "[recurrence] next occurrence failed:",
      result.rawMessage ?? result.errorKey
    );
    return;
  }

  // The trace on the ticket side completed: without it, checking a ticket would
  // appear a ticket elsewhere without anything saying so.
  await insertEvents(service, [
    {
      issue_id: issueId,
      actor_id: actorId,
      type: "recurrence_spawned",
      from_value: cadence,
      to_value: result.issue.id as string,
    },
  ]);
}
