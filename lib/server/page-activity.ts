import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRecentPageActivity } from "./issue-event-store";
import { insertEvents } from "@/lib/server/issue-events";
import type { PageWriteKind } from "@/lib/pages";

/**
 * What a page TELLS when it changes (MIN-278): its activity line, and
 * nothing more.
 *
 * Two very distinct surfaces, and this is the basic decision of the ticket:
 *
 * • the ACTIVITY is consulted. It carries everything — created, modified, trashed, restored —, with its author, and it lives in the existing journal
 * (`issue_events`, polymorphic from the objectives), with a fourth parent column. A parallel `page_events` table would have
 * re-requested its API, actor hydration and rendering.
 * • a NOTIFICATION interrupts. There is therefore NONE for a page edit,
 * whoever writes it: it would be noise at four and a deluge at ten. An agent's
 * write used to notify the account that ran it (`page_agent_edit`), and
 * MIN-958 removed that too: agents write pages often, and every write rang.
 * Mentions and comments in a page still notify (page-mentions.ts, page
 * comments).
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
    if (await hasRecentPageActivity(service, pageId, type, kind, actorId,
      new Date(Date.now() - EVENT_COALESCE_MS).toISOString())) return;
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
