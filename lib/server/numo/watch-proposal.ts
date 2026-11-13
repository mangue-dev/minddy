import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseNumoWatchProposal, type NumoWatchItem } from "@/lib/numo-watches";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  NumoWatchError,
  cancelNumoWatch,
  createNumoWatch,
  restoreNumoWatch,
  validateNumoWatchInput,
} from "./watches";

/**
 * The user's confirmation of a recurring reminder Numo proposed with
 * permissions (MIN-953). `create_watch` writes nothing when the reminder
 * carries grants: it returns a proposal, the conversation shows it as a card
 * that lists what the reminder may do, and the user's own request, from
 * their session, writes it here. A model cannot confirm in their place.
 *
 * The proposal comes back from the browser, so everything is checked again:
 * the user's access to the project (none for a personal reminder), the instruction, the cadence and the
 * grants. Whether the user really holds a granted right (an admin account,
 * a project role) is checked at every occurrence, not here.
 */

export type NumoWatchConfirmation =
  | { ok: true; watch: NumoWatchItem }
  | { ok: false; status: number; code: NumoWatchConfirmationError };

export type NumoWatchConfirmationError =
  | "invalid" | "project_unavailable" | "replaced_gone" | "already_set"
  | "limit_reached" | "recurring_limit_reached" | "unavailable";

const refused = (status: number, code: NumoWatchConfirmationError): NumoWatchConfirmation =>
  ({ ok: false, status, code });

export async function confirmNumoWatchProposal(service: SupabaseClient, userId: string,
  body: unknown): Promise<NumoWatchConfirmation> {
  const proposal = parseNumoWatchProposal(body);
  if (!proposal) return refused(400, "invalid");
  // A personal reminder (MIN-982) names no project.
  if (proposal.project_id !== null && !(await getProjectAccess(userId, proposal.project_id))) {
    return refused(404, "project_unavailable");
  }
  const input = {
    target: { type: "date" as const, id: null, condition: { kind: "date" as const }, fireAt: "" },
    action: "act" as const,
    instruction: proposal.instruction,
    recurrence: proposal.recurrence,
    grants: proposal.grants,
    timezone: proposal.timezone,
  };
  let canceled: string | null = null;
  try {
    // Checked before the replaced reminder is cancelled, so a refused
    // confirmation keeps it.
    validateNumoWatchInput(input);
    if (proposal.replaces) {
      if (!(await cancelNumoWatch(service, userId, proposal.replaces))) return refused(404, "replaced_gone");
      canceled = proposal.replaces;
    }
    const watch = await createNumoWatch(service, userId, {
      ...input, id: proposal.id, projectId: proposal.project_id, conversationId: null,
    });
    return { ok: true, watch };
  } catch (error) {
    if (canceled) await restoreNumoWatch(service, userId, canceled);
    if (!(error instanceof NumoWatchError)) throw error;
    switch (error.code) {
      case "conflict": return refused(409, "already_set");
      case "limit_reached": return refused(409, "limit_reached");
      case "recurring_limit_reached": return refused(409, "recurring_limit_reached");
      case "database": return refused(503, "unavailable");
      default: return refused(400, "invalid");
    }
  }
}
