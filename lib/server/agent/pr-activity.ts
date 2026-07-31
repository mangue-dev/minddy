import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { forgeActorValue, type ForgeProvider, type PrActionEventType } from "@/lib/pr-events";
import type { NotificationType } from "@/lib/types";
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
  // Les runs CARNET (MIN-84) n'ont pas d'issue : rien à tracer pour eux.
  const issueIds = [
    ...new Set(opts.runs.map((r) => r.issueId).filter((id): id is string => id != null)),
  ];
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

/** Action de forge → type de notification (null = rien à annoncer : refuser une
    PR est déjà visible dans le ticket qui repasse « à faire »). */
function notificationTypeFor(type: PrActionEventType): NotificationType | null {
  if (type === "pr_accepted") return "pr_merged";
  if (type === "pr_approved" || type === "pr_changes_requested") return "pr_reviewed";
  return null;
}

/**
 * Inbox (MIN-138) : prévient l'AUTEUR du run quand quelqu'un approuve, demande
 * des changements ou fusionne SA pull request directement sur la forge. Sans ça
 * il ne l'apprend qu'en ouvrant la page.
 *
 * Appelé juste après `recordForgePrActionEvents`, derrière les MÊMES gardes
 * anti-écho (bot GitHub / compte de service GitLab) : une action faite depuis
 * minddy est déjà connue de celui qui l'a faite.
 *
 * **Sans `replaceUnread`**, contrairement aux notifications d'agent : les types
 * frères d'`insertNotifications` ne couvrent que la famille agent, et deux
 * reviews successives sont deux FAITS distincts, pas l'état d'un run qui se
 * réécrit. Best-effort, comme tout le reste de ce module.
 */
export async function notifyForgePrAction(opts: {
  runs: SyncedPrRun[];
  type: PrActionEventType;
  actorLogin: string | null;
}): Promise<void> {
  const notificationType = notificationTypeFor(opts.type);
  if (!notificationType) return;
  // Un run carnet n'a pas d'issue où renvoyer, un run importé pas d'auteur.
  // Dédoublonné par (destinataire, issue) : plusieurs runs partagent une PR.
  const seen = new Set<string>();
  const rows = opts.runs
    .filter((r) => r.createdBy && r.issueId)
    .filter((r) => {
      const key = `${r.createdBy}:${r.issueId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      user_id: r.createdBy as string,
      project_id: r.projectId,
      type: notificationType,
      issue_id: r.issueId,
      // L'acteur est un compte de la forge, pas un utilisateur minddy : l'inbox
      // retombe sur l'icône du type, comme pour un retour du board public.
      actor_id: null,
    }));
  if (rows.length === 0) return;
  try {
    await insertNotifications(getServiceClient(), rows);
  } catch (e) {
    console.error("[pr-activity] notify failed:", (e as Error).message);
  }
}
