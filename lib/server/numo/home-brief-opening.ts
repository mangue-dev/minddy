import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeBrief } from "./home-brief-content";
import { encodeNumoFinalMessage, shouldProtectNumoFinalContent } from "./final-content";

/**
 * A conversation started on Home under Numo's summary (MIN-933) opens with
 * that summary as Numo's first message, stored before the user's: Numo reads
 * it in its history and answers as the continuation of what it said, and the
 * panel and the history show it where the user saw it.
 *
 * The message belongs to no turn. `metadata.home_brief` names the version, so
 * the home page does not show the summary twice once the stored messages load.
 */

export const HOME_BRIEF_MESSAGE_META = "home_brief";

/** True when the summary was stored. Best effort: the user's message goes on regardless. */
export async function openConversationWithHomeBrief(service: SupabaseClient, input: {
  userId: string;
  conversationId: string;
  briefId: string;
  /** Before the user's message, which the turn admission stamps right after. */
  now?: Date;
}): Promise<boolean> {
  const brief = await getHomeBrief(service, input.userId, input.briefId);
  if (!brief) return false;
  const messageId = randomUUID();
  const metadata = { [HOME_BRIEF_MESSAGE_META]: brief.id };
  const stored = await shouldProtectNumoFinalContent(service)
    ? await encodeNumoFinalMessage(input.userId, messageId, {
        content: brief.content, context: null, metadata, tool_call_id: null, tool_name: null,
      })
    : null;
  const createdAt = new Date((input.now ?? new Date()).getTime() - 1_000).toISOString();
  const { error } = await service.from("assistant_messages").insert({
    id: messageId,
    conversation_id: input.conversationId,
    turn_id: null,
    role: "assistant",
    content: stored?.content ?? brief.content,
    metadata: stored ? {} : metadata,
    ...(stored ? { final_payload_version: stored.final_payload_version } : {}),
    created_at: createdAt,
  });
  if (error) {
    console.error("[numo-home-brief] opening_failed");
    return false;
  }
  return true;
}
