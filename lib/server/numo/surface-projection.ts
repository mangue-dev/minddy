import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { commentFallbackDone } from "@/lib/server/runtime-locale-copy";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { commentDisplay, type CommentDisplay } from "@/lib/server/assistant/comment-live";
import type { SafeEmitter } from "@/lib/server/assistant/sse";
import type { PullRequestRow } from "@/lib/server/agent/pull-requests";
import type { NumoTurn } from "./turns";
import type {
  NumoSurfaceDestination,
  NumoSurfaceEvent,
  NumoSurfaceThread,
} from "./surface-conversations";

interface SurfaceProjectionRow extends NumoSurfaceEvent {
  thread: NumoSurfaceThread;
}

export function numoSurfaceProjectionDisposition(
  status: NumoTurn["status"],
): "wait" | "reply" | "fail" {
  if (status === "queued" || status === "running" || status === "waiting_work") {
    return "wait";
  }
  if (status === "completed" || status === "waiting_input") return "reply";
  return "fail";
}

export function surfaceAskUserQuestions(content: string | null): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { questions?: unknown };
    return Array.isArray(parsed.questions)
      ? parsed.questions.filter(
          (question): question is string => typeof question === "string" && !!question.trim(),
        )
      : [];
  } catch {
    return [];
  }
}

async function projectableOutcome(
  service: SupabaseClient,
  turn: NumoTurn,
): Promise<string> {
  const answer = turn.outcome?.trim() ?? "";
  if (turn.status !== "waiting_input") return answer;
  const { data, error } = await service
    .from("assistant_messages")
    .select("content")
    .eq("turn_id", turn.id)
    .eq("role", "tool")
    .eq("tool_name", "ask_user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const questions = surfaceAskUserQuestions(data?.content as string | null);
  const questionText = questions.join("\n\n");
  return [answer, questionText].filter(Boolean).join("\n\n");
}

async function projectionForTurn(
  service: SupabaseClient,
  turnId: string,
): Promise<SurfaceProjectionRow | null> {
  const { data, error } = await service
    .from("numo_surface_events")
    .select("*, thread:numo_surface_threads(*)")
    .eq("turn_id", turnId)
    .in("projection_status", ["pending", "projecting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SurfaceProjectionRow | null;
}

/** Mirror the common engine's live activity onto an internal comment placeholder. */
export async function createNumoSurfaceEmitter(
  service: SupabaseClient,
  turnId: string,
): Promise<SafeEmitter | undefined> {
  const projection = await projectionForTurn(service, turnId);
  const destination = projection?.destination;
  if (
    !projection?.response_id || destination?.kind !== "comment"
    || projection.projection_status !== "pending"
  ) return undefined;
  const display = commentDisplay(
    service,
    projection.response_id,
    destination.table,
  );
  let text = "";
  return {
    emit(event, data) {
      if (event === "content_delta") {
        const delta = (data as { delta?: unknown } | null)?.delta;
        if (typeof delta === "string") {
          text += delta;
          display.stream(text);
        }
      } else if (event === "tool_call_start") {
        const name = (data as { name?: unknown } | null)?.name;
        if (typeof name === "string") display.tool(name);
      }
    },
    close() {},
    get isClosed() {
      return false;
    },
  };
}

function combineEmitters(
  first: SafeEmitter | undefined,
  second: SafeEmitter | undefined,
): SafeEmitter | undefined {
  if (!first) return second;
  if (!second) return first;
  let closed = false;
  return {
    emit(event, data) {
      first.emit(event, data);
      second.emit(event, data);
    },
    close() {
      if (closed) return;
      closed = true;
      first.close();
      second.close();
    },
    get isClosed() {
      return closed || (first.isClosed && second.isClosed);
    },
  };
}

export async function withNumoSurfaceEmitter(
  service: SupabaseClient,
  turnId: string,
  liveEmitter?: SafeEmitter,
): Promise<SafeEmitter | undefined> {
  return combineEmitters(
    liveEmitter,
    await createNumoSurfaceEmitter(service, turnId),
  );
}

async function claimProjection(
  service: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("numo_surface_events")
    .update({ projection_status: "projecting", updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("projection_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function stampProjection(
  service: SupabaseClient,
  eventId: string,
  turnStatus: string,
  status: "projected" | "failed",
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await service
    .from("numo_surface_events")
    .update({
      projection_status: status,
      projected_turn_status: turnStatus,
      projected_at: now,
      updated_at: now,
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

async function notifyCommentProjection(
  service: SupabaseClient,
  projection: SurfaceProjectionRow,
  destination: Extract<NumoSurfaceDestination, { kind: "comment" }>,
): Promise<void> {
  if (!destination.notification || !projection.response_id) return;
  const memberIds = await projectMemberIds(service, projection.thread.project_id);
  const targets = new Set(
    destination.notification.candidateUserIds.filter(
      (id): id is string => !!id && id !== projection.actor_id && memberIds.has(id),
    ),
  );
  const rows: NotificationRow[] = [...targets].map((userId) => ({
    user_id: userId,
    project_id: projection.thread.project_id,
    type: destination.notification!.type,
    issue_id: destination.notification!.issueId ?? null,
    objective_id: destination.notification!.objectiveId ?? null,
    feedback_post_id: destination.notification!.feedbackPostId ?? null,
    page_id: destination.notification!.pageId ?? null,
    block_id: destination.notification!.blockId ?? null,
    comment_id: destination.notification!.type === "comment"
      ? projection.response_id
      : undefined,
    actor_id: projection.actor_id,
    via_assistant: true,
  }));
  await insertNotifications(service, rows);
  await service
    .from("numo_surface_events")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", projection.id)
    .is("notified_at", null);
}

async function projectComment(
  service: SupabaseClient,
  projection: SurfaceProjectionRow,
  turn: NumoTurn,
): Promise<void> {
  const destination = projection.destination;
  if (destination.kind !== "comment" || !projection.response_id) return;
  const display: CommentDisplay = commentDisplay(
    service,
    projection.response_id,
    destination.table,
  );
  if (numoSurfaceProjectionDisposition(turn.status) === "reply") {
    await display.finish(
      await projectableOutcome(service, turn)
      || commentFallbackDone(destination.locale),
    );
    await notifyCommentProjection(service, projection, destination);
  } else {
    await display.fail();
  }
}

async function projectPullRequest(
  service: SupabaseClient,
  projection: SurfaceProjectionRow,
  turn: NumoTurn,
): Promise<void> {
  const destination = projection.destination;
  if (destination.kind !== "pull_request") return;
  if (numoSurfaceProjectionDisposition(turn.status) !== "reply") return;
  const body = await projectableOutcome(service, turn);
  if (!body) return;

  const { data: pr, error } = await service
    .from("pull_requests")
    .select("*")
    .eq("id", destination.pullRequestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pr) return;
  const { resolvePrScope } = await import("@/lib/server/agent/pr-actions");
  const scope = await resolvePrScope(projection.actor_id, pr as PullRequestRow);
  if (!scope) return;
  await scope.forge.createPullRequestComment({ ...scope.call, body });
}

/** Publish only the final surface-safe outcome, never tool or connector results. */
export async function projectNumoSurfaceTurn(
  service: SupabaseClient,
  turn: NumoTurn,
): Promise<void> {
  if (numoSurfaceProjectionDisposition(turn.status) === "wait") return;
  const projection = await projectionForTurn(service, turn.id);
  if (!projection || projection.projection_status !== "pending") return;
  if (!(await claimProjection(service, projection.id))) return;

  try {
    // Re-check access at delivery time. A private answer is not projected after
    // the invoking member loses access while background work is running.
    if (!await getProjectAccess(projection.actor_id, projection.thread.project_id)) {
      if (projection.destination.kind === "comment" && projection.response_id) {
        await commentDisplay(
          service,
          projection.response_id,
          projection.destination.table,
        ).fail();
      }
      await stampProjection(service, projection.id, turn.status, "failed");
      return;
    }
    if (projection.destination.kind === "comment") {
      await projectComment(service, projection, turn);
    } else {
      await projectPullRequest(service, projection, turn);
    }
    await stampProjection(service, projection.id, turn.status, "projected");
  } catch (error) {
    console.error("[numo-surface] projection failed:", error);
    await stampProjection(service, projection.id, turn.status, "failed");
  }
}

export async function failNumoSurfaceProjection(
  service: SupabaseClient,
  turnId: string,
): Promise<void> {
  const projection = await projectionForTurn(service, turnId).catch(() => null);
  if (
    !projection || projection.destination.kind !== "comment"
    || !projection.response_id
  ) return;
  await commentDisplay(
    service,
    projection.response_id,
    projection.destination.table,
  ).fail();
}
