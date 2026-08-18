// WHO acted, as a notification will say — the “actor” counterpart of
// notification-target.ts, and for the same reason: a notification is
// reads on TWO surfaces, and both must name the same person.
//
// Module PUR (pas de `server-only`) : il ne fait que trancher entre trois
// flags, and it lives next to the phrase and the destination.

import type { NotificationRow } from "./server/notifications";

/**
 * The little bit of `NotificationRow` that any producer of a possibly automated
 * gesture must make.
 *
 * `actor_id` remains the account under which the entry is made — you need a
 * id, and it is he who carries the rights -, but when the gesture is that of a
 * AGENT it is the agent that the two surfaces name: the MCP key when there is
 * one ("Claude Code (mcp)"), Numo otherwise (the cat, the code agent).
 *
 * **Both surfaces**, and that's the whole reason for this helper. The inbox
 * could do without it for a COMMENT: it falls on the flag of the
 * comment line (`comments.via_assistant`, app/api/notifications/route.ts).
 * The PUSHED notification only reads the notification line
 * (lib/server/push/payload.ts) — without these fields, the system banner announces the
 * bearer account where the inbox announces the agent. Concretely: a response from
 * Numo to my own request arrived on my phone as “Clément has
 * commented” — a notification from myself, for a text that I did not
 * write. A description or a ticket written by Numo had the same fault,
 * and them WITHOUT the inbox catch-up: no comment line behind
 * where to read the flag.
 *
 * The two flags NEVER accumulate: the display tests `via_assistant`
 * before `via_mcp` (like the timeline), so carrying them both would say
 * “Numo” with a gesture where we know the agent by name.
 */
export function notificationActorSource(params: {
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Pick<NotificationRow, "via_mcp" | "api_key_id" | "via_assistant"> {
  if (params.mcpKeyId) return { via_mcp: true, api_key_id: params.mcpKeyId };
  if (params.viaAssistant) return { via_assistant: true };
  return {};
}
