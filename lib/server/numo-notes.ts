import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeNumoNote, readNumoNotes } from "./numo-note-content";
import { issueStore } from "./issue-store";
import { objectiveStore } from "./objective-store";
import { insertNotifications, type NotificationRow } from "./notifications";
import { resolveNotificationPrefs } from "@/lib/notification-prefs";
import { splitMentionLinks } from "@/lib/mention-link";

/**
 * Numo's notes (MIN-914): a short message Numo writes into the inbox of the
 * user it works for, during a conversation or a routine run. Only that user:
 * other members have their own Numo, and a note sent to them too would reach
 * them twice.
 *
 * The title and body are model-written free text, so they live in
 * `numo_notes`, sealed under the project's key once project content
 * encryption is active; the notification row only points at the note.
 */

/** What the reader sees of a title and a body: a mention counts as its pill. */
export const NUMO_NOTE_TITLE_MAX = 120;
export const NUMO_NOTE_BODY_MAX = 600;
/** What `numo_notes` stores, mention links included (its check constraint). */
const NUMO_NOTE_TITLE_STORED_MAX = 200;
const NUMO_NOTE_BODY_STORED_MAX = 1000;
/** The room a mention pill takes in a line, whatever its link's length. */
const MENTION_VISIBLE_LENGTH = 12;
/** Notes one Numo turn may send. A turn that needs more is reporting, not warning. */
export const NUMO_NOTES_PER_TURN = 5;
/** The same note to the same target is sent once in this window. */
export const NUMO_NOTE_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export const NUMO_NOTE_LINK_TYPES = [
  "issue",
  "objective",
  "page",
  "pull_request",
  "routine",
] as const;
export type NumoNoteLinkType = (typeof NUMO_NOTE_LINK_TYPES)[number];
export interface NumoNoteLink {
  type: NumoNoteLinkType;
  id: string;
}

/** The length a reader sees: each typed mention reads as one pill. */
function visibleLength(text: string): number {
  return splitMentionLinks(text).reduce((length, piece) =>
    length + (typeof piece === "string" ? piece.length : MENTION_VISIBLE_LENGTH), 0);
}

/**
 * Collapse whitespace and cap the length, so a note always fits its surfaces.
 * Typed mentions (MIN-975) count as the pill they draw, and a cut never
 * leaves half a mention behind.
 */
function clean(value: unknown, max: number, storedMax: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (visibleLength(text) <= max && text.length <= storedMax) return text;
  const cut = text.slice(0, max);
  // A mention the cut went through is dropped whole.
  const at = cut.lastIndexOf("[@");
  const whole = at < 0 || splitMentionLinks(cut.slice(at)).some((piece) => typeof piece !== "string");
  return (whole ? cut : cut.slice(0, at)).trim();
}

export function parseNumoNoteLink(value: unknown): NumoNoteLink | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const { type, id } = value as Record<string, unknown>;
  if (typeof type !== "string" ||
      !(NUMO_NOTE_LINK_TYPES as readonly string[]).includes(type) ||
      typeof id !== "string" || !id.trim()) {
    return "invalid";
  }
  return { type: type as NumoNoteLinkType, id: id.trim() };
}

/** The notification columns that point at the link's target. */
function targetColumns(link: NumoNoteLink | null) {
  return {
    issue_id: link?.type === "issue" ? link.id : null,
    objective_id: link?.type === "objective" ? link.id : null,
    page_id: link?.type === "page" ? link.id : null,
    pull_request_id: link?.type === "pull_request" ? link.id : null,
    routine_id: link?.type === "routine" ? link.id : null,
  };
}

/** Whether the linked record is live and belongs to the project. */
async function linkInProject(
  service: SupabaseClient,
  projectId: string,
  link: NumoNoteLink,
): Promise<boolean> {
  switch (link.type) {
    case "issue": {
      const { data } = await issueStore(service).select("id")
        .eq("id", link.id).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      return !!data;
    }
    case "objective": {
      const { data } = await objectiveStore(service).select("id")
        .eq("id", link.id).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      return !!data;
    }
    case "page": {
      const { data } = await service.from("pages").select("id")
        .eq("id", link.id).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      return !!data;
    }
    case "routine": {
      const { data } = await service.from("agent_routines").select("id")
        .eq("id", link.id).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      return !!data;
    }
    case "pull_request": {
      const { data: pr } = await service.from("pull_requests")
        .select("provider, repo_full_name").eq("id", link.id).maybeSingle();
      if (!pr) return false;
      const { data: linked } = await service.from("project_git_links")
        .select("project_id").eq("project_id", projectId)
        .eq("provider", pr.provider).eq("repo_full_name", pr.repo_full_name)
        .limit(1);
      return (linked ?? []).length > 0;
    }
  }
}

export type SendNumoNoteResult =
  | { ok: true; delivered: true }
  | { ok: true; delivered: false; reason: "muted" | "duplicate" }
  | { ok: false; error: string };

/**
 * Write a note into the inbox of `userId`, the user Numo is working for.
 * Project access is the caller's to check: this function trusts that
 * `userId` may read `projectId`, and checks the link against the project.
 */
export async function sendNumoNote(input: {
  service: SupabaseClient;
  userId: string;
  projectId: string;
  title: unknown;
  body: unknown;
  link: NumoNoteLink | null;
  turnId?: string | null;
  /** A background turn's urgent note (MIN-929): counted by the daily urgent cap. */
  urgent?: boolean;
  /**
   * Skip the 24-hour duplicate check. A reminder (MIN-923) fires once by its
   * own claim, and two reminders may rightly carry the same instruction.
   */
  dedupe?: boolean;
  now?: Date;
}): Promise<SendNumoNoteResult> {
  const { service, userId, projectId, link } = input;
  const title = clean(input.title, NUMO_NOTE_TITLE_MAX, NUMO_NOTE_TITLE_STORED_MAX);
  const body = clean(input.body, NUMO_NOTE_BODY_MAX, NUMO_NOTE_BODY_STORED_MAX);
  if (!title) return { ok: false, error: "title is required." };
  if (!body) return { ok: false, error: "body is required." };

  if (link && !(await linkInProject(service, projectId, link))) {
    return { ok: false, error: `The linked ${link.type.replace("_", " ")} was not found in this project.` };
  }

  // A muted category is the user's answer: report it rather than writing a
  // note nobody will read.
  try {
    const { data } = await service.auth.admin.getUserById(userId);
    const prefs = resolveNotificationPrefs(
      (data?.user?.user_metadata ?? null) as Record<string, unknown> | null);
    if (!prefs.numo) return { ok: true, delivered: false, reason: "muted" };
  } catch {
    // Same fail-open rule as insertNotifications.
  }

  if (input.turnId) {
    const { count, error } = await service.from("numo_notes")
      .select("id", { count: "exact", head: true })
      .eq("numo_turn_id", input.turnId);
    if (error) return { ok: false, error: "Unable to send the note." };
    if ((count ?? 0) >= NUMO_NOTES_PER_TURN) {
      return { ok: false, error: `At most ${NUMO_NOTES_PER_TURN} notes per turn. Put the rest in your reply.` };
    }
  }

  const targets = targetColumns(link);
  const now = input.now ?? new Date();
  if (input.dedupe !== false) {
    const since = new Date(now.getTime() - NUMO_NOTE_DEDUP_WINDOW_MS).toISOString();
    let recent = service.from("notifications")
      .select("numo_note_id")
      .eq("user_id", userId).eq("project_id", projectId)
      .eq("type", "numo_message").gte("created_at", since);
    for (const [column, value] of Object.entries(targets)) {
      recent = value ? recent.eq(column, value) : recent.is(column, null);
    }
    const { data: recentRows, error: recentError } = await recent.limit(50);
    if (recentError) return { ok: false, error: "Unable to send the note." };
    const previous = await readNumoNotes(service,
      (recentRows ?? []).map((row) => row.numo_note_id as string), userId);
    if (previous === null) return { ok: false, error: "Unable to send the note." };
    const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    if ([...previous.values()].some((note) => sameText(note.body, body))) {
      return { ok: true, delivered: false, reason: "duplicate" };
    }
  }

  const id = randomUUID();
  const note = await encodeNumoNote({
    id, project_id: projectId, user_id: userId,
    numo_turn_id: input.turnId ?? null, title, body,
  }, { service });
  const { error: noteError } = await service.from("numo_notes")
    .insert(input.urgent ? { ...note, urgent: true } : note);
  if (noteError) {
    console.error("[numo-notes] insert_failed", { code: noteError.code });
    return { ok: false, error: "Unable to send the note." };
  }

  const row: NotificationRow = {
    user_id: userId,
    project_id: projectId,
    type: "numo_message",
    numo_note_id: id,
    ...targets,
    actor_id: null,
    // A gesture of Numo, never of the user: the inbox names Numo.
    via_assistant: true,
  };
  const inserted = await insertNotifications(service, [row]);
  if (inserted === 0) {
    await service.from("numo_notes").delete().eq("id", id);
    return { ok: false, error: "Unable to send the note." };
  }
  return { ok: true, delivered: true };
}
