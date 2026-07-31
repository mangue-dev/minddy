import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { forgeActorValue, type ForgeProvider, type PrActionEventType } from "@/lib/pr-events";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { findPullRequestByNumber } from "./pull-requests";
import type { NotificationType } from "@/lib/types";
import type { AgentRun, SyncedPrRun } from "./runs";

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

/**
 * Membre au nom de qui écrire sur le ticket d'une PR sans run (MIN-143) : celui
 * qui a LIÉ le dépôt au projet de ce ticket.
 *
 * `updateIssueFields` traverse la RLS mais refait le contrôle d'accès lui-même,
 * il lui faut donc un membre réel. Celui qui a posé la liaison est le seul dont
 * on sache qu'il appartient à CE projet et qu'il a voulu ce dépôt — c'est déjà
 * l'acteur technique de la synchro d'issues (MIN-97). La forge, elle, est
 * créditée à l'écran par `forgeSync`.
 *
 * Null quand le ticket a disparu, quand aucune liaison ne joint ce dépôt à son
 * projet, ou quand la liaison n'a pas d'auteur : on ne devine pas d'acteur.
 */
async function repoWriteActor(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  issueId: string;
}): Promise<string | null> {
  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("project_id")
    .eq("id", opts.issueId)
    .is("deleted_at", null)
    .maybeSingle();
  const projectId = (issue as { project_id: string } | null)?.project_id;
  if (!projectId) return null;

  const { data: link } = await service
    .from("project_git_links")
    .select("created_by")
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName)
    .eq("project_id", projectId)
    .maybeSingle();
  return (link as { created_by: string | null } | null)?.created_by ?? null;
}

/**
 * Effets « ticket » d'un événement de forge sur une PR/MR qui n'a AUCUN run
 * (MIN-143) : statut aligné, action tracée.
 *
 * Sans ça, le même geste donne deux résultats selon l'endroit où on le fait :
 * fusionner une PR humaine DEPUIS minddy passe son ticket en terminé (les routes
 * lisent `pull_requests.issue_id`), le fusionner sur GitHub ne faisait rien —
 * tout le chemin webhook partait des runs, qu'une PR humaine n'a pas.
 *
 * Ce qui reste dehors, volontairement : la NOTIFICATION. `notifyForgePrAction`
 * prévient l'auteur du run ; une PR humaine n'en a pas, et savoir quel compte de
 * forge est quel membre minddy est le chantier d'identité que MIN-143 parque.
 *
 * Best-effort de bout en bout, comme le reste de ce module.
 */
export async function applyForgePrToIssue(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  prNumber: number;
  /** Nouvel état de la PR, ou null si l'événement n'en décrit aucun. */
  prState: AgentRun["pr_state"] | null;
  /** Action à tracer, ou null (action non tracée, ou écho d'un geste in-app). */
  actionType: PrActionEventType | null;
  /** Login de l'acteur chez la forge — il tient lieu d'acteur dans la timeline. */
  login: string | null;
}): Promise<void> {
  if (!opts.prState && !opts.actionType) return;

  const pr = await findPullRequestByNumber({
    provider: opts.provider,
    repoFullName: opts.repoFullName,
    number: opts.prNumber,
  });
  // Pas de ticket rattaché : c'est le cas NORMAL d'une PR humaine, pas une panne.
  if (!pr?.issue_id) return;
  const issueId = pr.issue_id;

  if (opts.prState) {
    const actorId = await repoWriteActor({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      issueId,
    });
    if (actorId) {
      await syncIssueStatusFromPr({
        issueId,
        actorId,
        prState: opts.prState,
        forgeSync: opts.provider,
      });
    }
  }

  // L'activité, elle, n'a jamais eu besoin d'acteur minddy : `actor_id` est null
  // et le login de la forge voyage dans `from_value` (cf. forgeActorValue).
  if (opts.actionType) {
    await insertEvents(getServiceClient(), [
      {
        issue_id: issueId,
        actor_id: null,
        type: opts.actionType,
        from_value: forgeActorValue(opts.provider, opts.login),
        to_value: String(opts.prNumber),
      },
    ]);
  }
}
