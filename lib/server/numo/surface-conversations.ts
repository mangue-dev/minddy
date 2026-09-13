import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type NumoSurface =
  | "issue_comment"
  | "objective_comment"
  | "page_comment"
  | "feedback_comment"
  | "pull_request_comment";

export type NumoSurfaceDestination =
  | {
      kind: "comment";
      table: "comments" | "page_comments";
      locale: string;
      notification?: {
        type: "comment" | "page_comment";
        candidateUserIds: Array<string | null | undefined>;
        issueId?: string | null;
        objectiveId?: string | null;
        feedbackPostId?: string | null;
        pageId?: string | null;
        blockId?: string | null;
      };
    }
  | {
      kind: "pull_request";
      pullRequestId: string;
    };

export interface NumoSurfaceThread {
  id: string;
  surface: NumoSurface;
  source_thread_id: string;
  actor_id: string;
  project_id: string;
  conversation_id: string;
}

export interface NumoSurfaceEvent {
  id: string;
  thread_id: string;
  source_event_id: string;
  actor_id: string;
  turn_id: string | null;
  destination: NumoSurfaceDestination;
  response_id: string | null;
  projection_status: "pending" | "projecting" | "projected" | "failed";
  projected_turn_status: string | null;
  projected_at: string | null;
  notified_at: string | null;
  created_at: string;
}

async function findSurfaceThread(
  service: SupabaseClient,
  input: { surface: NumoSurface; sourceThreadId: string; actorId: string },
): Promise<NumoSurfaceThread | null> {
  const { data, error } = await service
    .from("numo_surface_threads")
    .select("*")
    .eq("surface", input.surface)
    .eq("source_thread_id", input.sourceThreadId)
    .eq("actor_id", input.actorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as NumoSurfaceThread | null;
}

/** Resolve one private conversation for an actor's projection of a shared thread. */
export async function ensureNumoSurfaceThread(input: {
  service: SupabaseClient;
  surface: NumoSurface;
  sourceThreadId: string;
  actorId: string;
  projectId: string;
  title: string;
}): Promise<NumoSurfaceThread> {
  const existing = await findSurfaceThread(input.service, input);
  if (existing) return existing;

  const { data: conversation, error: conversationError } = await input.service
    .from("conversations")
    .insert({
      project_id: null,
      user_id: input.actorId,
      title: input.title,
    })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "Unable to create surface conversation");
  }

  const { data, error } = await input.service
    .from("numo_surface_threads")
    .insert({
      surface: input.surface,
      source_thread_id: input.sourceThreadId,
      actor_id: input.actorId,
      project_id: input.projectId,
      conversation_id: conversation.id,
    })
    .select("*")
    .single();
  if (!error && data) return data as NumoSurfaceThread;

  // A concurrent delivery may have won the unique mapping. Remove only the
  // conversation created by this attempt, then reuse the authoritative row.
  await input.service
    .from("conversations")
    .delete()
    .eq("id", conversation.id)
    .eq("user_id", input.actorId);
  const raced = await findSurfaceThread(input.service, input);
  if (raced) return raced;
  throw new Error(error?.message ?? "Unable to map surface conversation");
}

/** Reserve one source event before creating its visible response placeholder. */
export async function reserveNumoSurfaceEvent(input: {
  service: SupabaseClient;
  threadId: string;
  sourceEventId: string;
  actorId: string;
  destination: NumoSurfaceDestination;
}): Promise<{ event: NumoSurfaceEvent; created: boolean }> {
  const { data, error } = await input.service
    .from("numo_surface_events")
    .insert({
      thread_id: input.threadId,
      source_event_id: input.sourceEventId,
      actor_id: input.actorId,
      destination: input.destination,
    })
    .select("*")
    .single();
  if (!error && data) {
    return { event: data as NumoSurfaceEvent, created: true };
  }

  const { data: existing, error: readError } = await input.service
    .from("numo_surface_events")
    .select("*")
    .eq("thread_id", input.threadId)
    .eq("source_event_id", input.sourceEventId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error(error?.message ?? "Unable to reserve surface event");
  return { event: existing as NumoSurfaceEvent, created: false };
}

export async function setNumoSurfaceEventResponse(input: {
  service: SupabaseClient;
  eventId: string;
  responseId: string;
}): Promise<void> {
  const { error } = await input.service
    .from("numo_surface_events")
    .update({ response_id: input.responseId, updated_at: new Date().toISOString() })
    .eq("id", input.eventId);
  if (error) throw new Error(error.message);
}

export async function bindNumoSurfaceEvent(input: {
  service: SupabaseClient;
  eventId: string;
  turnId: string;
}): Promise<void> {
  const { error } = await input.service
    .from("numo_surface_events")
    .update({ turn_id: input.turnId, updated_at: new Date().toISOString() })
    .eq("id", input.eventId);
  if (error) throw new Error(error.message);
}

export async function failNumoSurfaceEvent(
  service: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await service
    .from("numo_surface_events")
    .update({
      projection_status: "failed",
      projected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);
  if (error) console.error("[numo-surface] failed to mark event:", error.message);
}

export interface PendingSurfaceWorkerInput {
  turnId: string;
  runId: string;
  questionId: string;
}

/** Find the exact durable worker question a reply on this projection answers. */
export async function pendingSurfaceWorkerInput(
  service: SupabaseClient,
  conversationId: string,
): Promise<PendingSurfaceWorkerInput | null> {
  const { data, error } = await service
    .from("numo_assistant_turns")
    .select("id, checkpoint")
    .eq("conversation_id", conversationId)
    .eq("status", "waiting_input")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const checkpoint = data?.checkpoint as {
    phase?: string;
    input_request?: { runId?: unknown; questionId?: unknown };
  } | null;
  if (
    !data?.id || checkpoint?.phase !== "worker_input_wait"
    || typeof checkpoint.input_request?.runId !== "string"
    || typeof checkpoint.input_request?.questionId !== "string"
  ) return null;
  return {
    turnId: data.id as string,
    runId: checkpoint.input_request.runId,
    questionId: checkpoint.input_request.questionId,
  };
}
