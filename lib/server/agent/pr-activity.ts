import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { forgeActorValue, type ForgeProvider, type PrActionEventType } from "@/lib/pr-events";
import type { SyncedPrRun } from "./runs";

/**
 * Émetteur d'activité des actions PR/MR faites DIRECTEMENT sur le provider
 * (webhooks GitHub ET GitLab — MIN-69, extrait du webhook GitHub). Un seul event
 * par issue (plusieurs runs peuvent partager la même PR). Acteur = l'utilisateur
 * provider : pas d'utilisateur minddy (`actor_id` null), son login est porté par
 * `from_value` (préfixé `gitlab:` pour GitLab — cf. `forgeActorValue`), le numéro
 * de PR/MR par `to_value`. Les actions in-app passent, elles, par les routes avec
 * l'acteur membre.
 */
export async function recordForgePrActionEvents(opts: {
  runs: SyncedPrRun[];
  type: PrActionEventType;
  prNumber: number;
  provider: ForgeProvider;
  login: string | null;
}): Promise<void> {
  const issueIds = [...new Set(opts.runs.map((r) => r.issueId))];
  if (issueIds.length === 0) return;
  await insertEvents(
    getServiceClient(),
    issueIds.map((issueId) => ({
      issue_id: issueId,
      actor_id: null,
      type: opts.type,
      from_value: forgeActorValue(opts.provider, opts.login),
      to_value: String(opts.prNumber),
    })),
  );
}
