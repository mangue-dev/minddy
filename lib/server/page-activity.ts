import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { PAGE_WATCH_FRESH_MS, type PageWriteKind } from "@/lib/pages";

/**
 * What a page TELLS when it changes (MIN-278): its activity line, and
 * the notification of the agent writing.
 *
 * Two very distinct surfaces, and this is the basic decision of the ticket:
 *
 * • the ACTIVITY is consulted. It carries everything — created, modified, trashed, restored —, with its author, and it lives in the existing journal
 * (`issue_events`, polymorphic from the objectives), with a fourth parent column. A parallel `page_events` table would have
 * re-requested its API, actor hydration and rendering.
 * • a NOTIFICATION interrupts. There is therefore NONE for “someone has
 * modified a page”: it would be noise at four and a deluge at ten. Only
 * writing the AGENT produces one, and only for the one who launched
 * the run — not for the project.
 */

/** The gestures that a page records. */
export type PageEventType =
  | "page_created"
  | "page_updated"
  | "page_trashed"
  | "page_restored";

/**
 * The ACTIVITY coalescence window, the same as that of the history
 * (`VERSION_COALESCE_MS`, lib/server/pages.ts) and for the same reason:
 * the editor saves one second after the last keystroke, so an afternoon
 * of writing would make a thousand lines. The same person, on the same page, poses
 * one for every five minutes.
 *
 * What the window never covers: a change of author, nor of the nature
 * of gesture. “The agent came after me” is exactly what we read.
 */
const EVENT_COALESCE_MS = 5 * 60_000;

/** Only "modified" repeats enough to merit coalescing — you don't create
 or trash a page forty times in a row. */
const COALESCED: readonly PageEventType[] = ["page_updated"];

/**
 * Places the activity line of a gesture on a page.
 *
 * Two columns say the NATURE of the gesture, and this is not a redundancy:
 *
 * • `via_assistant` names the ACTOR. An agent's writing carries the id of the account
 * which authorized it, and without this flag the line would say "Clément modified
 * this page" of a text that Clément did not write - this is the vocabulary
 * that the timeline already uses for an automated gesture, and it applies here
 * the same identity rule that the history of MIN-277 to its versions;
 * • `field` carries the nature in plain text (“human” / “agent”) and is used for the
 * COALESCENCE below: the five-minute window must never swallow
 * a change of nature. “The agent came after me” is exactly
 * what we came to read.
 *
 * Best-effort from start to finish: an activity that we did not know how to write must
 * never cause the writing of the page to fail.
 */
export async function recordPageEvent(
  service: SupabaseClient,
  params: {
    pageId: string;
    actorId: string | null;
    kind: PageWriteKind;
    type: PageEventType;
    /** The MCP key behind the gesture, when it comes from there: the line then names
 the agent of the key — “Claude Code (mcp)” —, exactly like the timeline
 of a ticket written by the same agent. `via_assistant` takes over
 otherwise, and the line says "Numo". */
    mcpKeyId?: string | null;
  },
): Promise<void> {
  const { pageId, actorId, kind, type, mcpKeyId } = params;

  if (COALESCED.includes(type)) {
    const { data } = await service
      .from("issue_events")
      .select("id")
      .eq("page_id", pageId)
      .eq("type", type)
      .eq("field", kind)
      // `actor_id` can be null (no page gestures are null today,
      // but the column allows it): `eq` does not match NULL in SQL, hence the
      // branche — sans elle, deux gestes anonymes ne se coalesceraient jamais.
      .filter("actor_id", actorId ? "eq" : "is", actorId ?? null)
      .gte("created_at", new Date(Date.now() - EVENT_COALESCE_MS).toISOString())
      .limit(1);
    if (data && data.length > 0) return;
  }

  await insertEvents(service, [
    {
      page_id: pageId,
      actor_id: actorId,
      type,
      field: kind,
      // The two do NOT stack: the timeline tests `via_assistant` BEFORE
      // `via_mcp` (components/issue-timeline.tsx), so carry them both
      // would say “Numo” with a gesture whose agent we know by name.
      via_assistant: kind === "agent" && !mcpKeyId,
      ...(mcpKeyId ? { via_mcp: true, api_key_id: mcpKeyId } : {}),
    },
  ]);
}

/**
 * Warns the launcher of a run that the AGENT has just written to a page.
 *
 * `actorId` IS the recipient, and this is not an oddity: the six page writing tools
 * run under the id of the account that allowed them — the bearer
 * of the MCP key, the Numo user, the project owner. So this is the only person to warn, and warning the entire project with a gesture that no one asked for would be exactly the noise this ticket seeks to avoid.
 *
 * Unless they are watching the page RIGHT NOW: a fresh row in
 * `page_viewers` (lib/page-watch.ts pings it while the editor holds the
 * document open) means the write is already arriving live through realtime —
 * refetch and merge into the open editor — and the inbox line would only
 * repeat what the reader is seeing happen. Somewhere else in the app, or away
 * entirely, the line stays useful and keeps its push.
 *
 * `actor_id` remains NULL on the line: the actor is not a person, this is
 * the agent. Leaving it filled would cause the recipient to see their own portrait
 * next to "someone wrote in this page".
 *
 * `replaceUnread`: a run that goes over the same page ten times leaves
 * only one line — this is the same mechanism as run notifications, and it is
 * bounded on the page by the `page_id` clause of `insertNotifications`.
 */
export async function notifyAgentPageWrite(
  service: SupabaseClient,
  params: { projectId: string; pageId: string; actorId: string },
): Promise<void> {
  // Watching beats warning: one indexed read before the write. The window is
  // generous on purpose — three missed heartbeats still count as watching,
  // so a single dropped ping never resurrects the line.
  const { data } = await service
    .from("page_viewers")
    .select("user_id")
    .eq("page_id", params.pageId)
    .eq("user_id", params.actorId)
    .gte("seen_at", new Date(Date.now() - PAGE_WATCH_FRESH_MS).toISOString())
    .limit(1);
  if (data && data.length > 0) return;

  await insertNotifications(
    service,
    [
      {
        user_id: params.actorId,
        project_id: params.projectId,
        type: "page_agent_edit" as const,
        issue_id: null,
        page_id: params.pageId,
        actor_id: null,
      },
    ],
    { replaceUnread: true },
  );
}
