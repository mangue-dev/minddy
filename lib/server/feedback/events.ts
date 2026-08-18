import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertEvents,
  stampIntegration,
  stampMcpKey,
  stampViaAssistant,
  type EventRow,
} from "@/lib/server/issue-events";
import type { FeedbackPostSource } from "@/lib/feedback/types";

/**
 * Feedback Activity Log (MIN-57) — the counterpart to issue-events for
 * feedback posts. The rows live in the SAME table `issue_events`
 * (polymorphic issue / objective / feedback_post) and pass through the same
 * `insertEvents` ; these helpers only construct the EventRow feedback and
 * assign them correctly (member, board, integration, AI).
 *
 * All writes are best-effort and off-critical path: a failure of
 * logging should never cause the mutation that triggered it to fail
 * (insertEvents already swallows its errors).
 */

const s = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Fields in the post followed with from/to (the mirror of buildFieldChangeEvents). */
export function buildFeedbackFieldChangeEvents(
  postId: string,
  actorId: string | null,
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): EventRow[] {
  const events: EventRow[] = [];

  if ("title" in updates && updates.title !== before.title) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "title",
      from_value: s(before.title),
      to_value: s(updates.title),
    });
  }
  // Body: like a description, we only record the fact that it has changed.
  if ("body" in updates && (updates.body ?? "") !== (before.body ?? "")) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "body",
    });
  }
  if ("status" in updates && (updates.status ?? null) !== (before.status ?? null)) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "status",
      from_value: s(before.status),
      to_value: s(updates.status),
    });
  }
  // The team response no longer goes through here (MIN-196): it's a comment
  // public, and the activity feed already shows comments. The lines
  // `team_response` already written remains readable — see lib/describe-event.ts.
  // Visibility: we log the meaning (made public/private) — no from/to,
  // the action is self-sufficient in the thread.
  if (
    "is_public" in updates &&
    (updates.is_public ?? null) !== (before.is_public ?? null)
  ) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "is_public",
      to_value: updates.is_public ? "public" : "private",
    });
  }
  // Publication status (MIN-54): publication of a retained return, issued by a
  // override team. `pending` does not produce a sentence — this is the state
  // initial wait, with no action to report. Junk no longer passes through
  // here: it has become the status `spam`, logged by the `status` block.
  if (
    "review_state" in updates &&
    (updates.review_state ?? null) !== (before.review_state ?? null) &&
    updates.review_state !== "pending"
  ) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "review_state",
      to_value: s(updates.review_state),
    });
  }
  return events;
}

/** “Created” event — assigned to the member (internal input), integration
 (API channel) or board (public submission, anonymous actor). The channel is
 carried by `field` for the thread phrase. */
export async function emitFeedbackCreated(
  service: SupabaseClient,
  params: {
    postId: string;
    source: FeedbackPostSource;
    createdByMember?: string | null;
    integrationId?: string | null;
  }
): Promise<void> {
  const row: EventRow = {
    feedback_post_id: params.postId,
    actor_id: params.source === "internal" ? params.createdByMember ?? null : null,
    type: "created",
    field: params.source,
  };
  await insertEvents(
    service,
    stampIntegration([row], params.source === "api" ? params.integrationId : null)
  );
}

/** Field change events (title/body/status/response). */
export async function emitFeedbackFieldChanges(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    before: Record<string, unknown>;
    updates: Record<string, unknown>;
    /** Assigns the change to Numo in the thread (via_assistant). */
    viaAssistant?: boolean;
    /** Assigns the change to the MCP agent (via_mcp + key) in the thread. */
    mcpKeyId?: string | null;
  }
): Promise<void> {
  const rows = stampMcpKey(
    stampViaAssistant(
      buildFeedbackFieldChangeEvents(
        params.postId,
        params.actorId,
        params.before,
        params.updates
      ),
      !!params.viaAssistant
    ),
    params.mcpKeyId
  );
  await insertEvents(service, rows);
}

/** Promotion to issue (to_value = id of the issue created). */
export async function emitFeedbackPromoted(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "promoted",
          to_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
}

/** Link to an existing issue (to_value = issue id). */
export async function emitFeedbackLinked(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "linked",
          to_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
}

/** Detaching the linked issue (from_value = id of the detached issue). */
export async function emitFeedbackUnlinked(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string | null;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "unlinked",
          from_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
}

/** Merge received on the canonical post (to_value = title of the duplicate absorbed).
 An AI merge is assigned to Numo in the thread (via_assistant). */
export async function emitFeedbackMerged(
  service: SupabaseClient,
  params: {
    canonicalPostId: string;
    actorId: string | null;
    dupTitle: string;
    performedBy: "ai" | "team";
    undone?: boolean;
  }
): Promise<void> {
  const row: EventRow = {
    feedback_post_id: params.canonicalPostId,
    actor_id: params.actorId,
    type: params.undone ? "merge_undone" : "merged",
    to_value: params.dupTitle,
  };
  await insertEvents(
    service,
    stampViaAssistant([row], params.performedBy === "ai")
  );
}
