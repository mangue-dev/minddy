import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import {
  collapsesInBurst,
  forgeActorValue,
  PR_EVENT_BURST_MS,
  type ForgeProvider,
  type PrActionEventType,
} from "@/lib/pr-events";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { findPullRequestByNumber } from "./pull-requests";
import { findRunsForPr } from "./runs";
import type { NotificationType } from "@/lib/types";
import type { AgentRun, SyncedPrRun } from "./runs";

/**
 * Fenêtre pendant laquelle un geste identique DÉJÀ tracé vaut écho. Le hook
 * arrive dans la seconde qui suit l'appel de forge ; deux gestes identiques
 * espacés de plus que ça sont deux faits distincts, et se tracent tous les deux.
 */
const ECHO_WINDOW_MS = 2 * 60_000;

/** Le compte de forge d'un membre, tel que les deux tables le stockent. */
interface ForgeAccountRow {
  user_id?: string | null;
  provider_account_id: string | null;
  account_login: string | null;
}

/** L'acteur d'un hook, tel que la forge le livre. */
interface ForgeAccountRef {
  /** Id du compte chez la forge — la CLÉ : immuable au renommage. */
  accountId: string | null;
  /** Login du compte — un nom d'AFFICHAGE, gardé en repli d'ancienneté. */
  login: string | null;
}

/**
 * Cette ligne désigne-t-elle ce compte de forge (MIN-154) ?
 *
 * La clé est `provider_account_id` : le login est un nom d'affichage, écrit une
 * fois à la connexion du compte et jamais rafraîchi — un renommage chez GitHub
 * ou GitLab suffisait à rendre son porteur inconnu de minddy.
 *
 * Le login reste un repli, mais seulement là où l'id ne peut pas trancher :
 * ligne d'ancienneté dont l'id est nul (la colonne est nullable des deux côtés),
 * ou hook qui n'en livre pas. Il ne gagne JAMAIS contre un id différent — deux
 * personnes peuvent se succéder sur un même nom, et attribuer le geste au
 * mauvais membre est pire que ne l'attribuer à personne.
 */
export function forgeAccountMatches(
  row: ForgeAccountRow,
  actor: ForgeAccountRef,
): boolean {
  if (actor.accountId && row.provider_account_id) {
    return row.provider_account_id === actor.accountId;
  }
  return !!actor.login && row.account_login === actor.login;
}

/**
 * `,` `(` `)` `"` sont les séparateurs de la syntaxe de filtre PostgREST : une
 * valeur qui en porte casserait le `.or(...)` au lieu de le restreindre. Aucun
 * login de forge n'en contient — le terme se saute plutôt que de se risquer.
 */
function isFilterSafe(value: string): boolean {
  return !/[,()"]/.test(value);
}

/**
 * Les membres minddy derrière un compte de forge — le pont que MIN-144 rend
 * possible : `git_user_identities` côté GitHub (le compte autorisé), la connexion
 * OAuth côté GitLab (elle EST déjà l'identité de la personne).
 *
 * Exporté pour `pr-opened-notify.ts`, qui s'en sert dans l'autre sens : non plus
 * « ce geste est-il un écho du nôtre » mais « qui, chez nous, vient d'ouvrir
 * cette PR » — la seule personne à qui ne pas l'annoncer.
 *
 * Une seule requête sur le chemin webhook : on demande les lignes que l'id OU le
 * login pourraient désigner, puis `forgeAccountMatches` tranche en mémoire — le
 * `.or(...)` est un filet large, la règle est celle-là.
 *
 * Vide quand personne n'a connecté ce compte : c'est alors quelqu'un qui n'agit
 * pas depuis minddy, et rien n'est à dédoublonner.
 */
export async function minddyUsersForForgeAccount(opts: {
  provider: ForgeProvider;
  accountId: string | null;
  login: string | null;
}): Promise<string[]> {
  const terms: string[] = [];
  if (opts.accountId && isFilterSafe(opts.accountId)) {
    terms.push(`provider_account_id.eq.${opts.accountId}`);
  }
  if (opts.login && isFilterSafe(opts.login)) {
    terms.push(`account_login.eq."${opts.login}"`);
  }
  if (terms.length === 0) return [];

  const service = getServiceClient();
  const table = opts.provider === "github" ? "git_user_identities" : "git_connections";
  const { data } = await service
    .from(table)
    .select("user_id, provider_account_id, account_login")
    .eq("provider", opts.provider)
    .or(terms.join(","));
  return [
    ...new Set(
      ((data ?? []) as ForgeAccountRow[])
        .filter((row) => forgeAccountMatches(row, opts))
        .map((r) => r.user_id)
        .filter((id): id is string => !!id),
    ),
  ];
}

/**
 * Ce (ticket, geste, PR) vient-il d'être tracé par la route, c'est-à-dire fait
 * DEPUIS minddy (MIN-144) ?
 *
 * Jusqu'à MIN-144, l'anti-écho se lisait sur l'ACTEUR : merger depuis minddy
 * partait du bot de la GitHub App (ou du compte qui a lié le dépôt côté GitLab),
 * donc « acteur = nous » suffisait. Depuis, un geste humain part du compte git de
 * la PERSONNE : l'acteur du hook est le même qu'elle ait cliqué dans minddy ou
 * sur la forge, et l'identité seule ne discrimine plus rien — sans ce garde,
 * chaque merge fait depuis minddy produit DEUX lignes d'activité (celle de la
 * route, puis celle du hook), deux dispatchs de webhook d'intégration, et une
 * notification d'inbox à l'auteur du run pour son propre geste.
 *
 * Ce qu'on cherche est donc précis : un événement du MÊME type, sur la MÊME PR,
 * écrit il y a quelques secondes PAR LE MEMBRE qui porte ce compte de forge. Un
 * autre membre qui approuve sur la forge à la même seconde garde sa ligne.
 *
 * Ce membre se reconnaît à l'ID de son compte de forge, pas à son login
 * (MIN-154) : le login est un nom d'affichage jamais rafraîchi, et un renommage
 * chez GitHub ou GitLab rendait ce garde muet — pour toujours, et en silence.
 * Deux lignes d'activité identiques sur le ticket, deux dispatchs de webhook
 * d'intégration, et une notification d'inbox à l'auteur du run pour son propre
 * geste.
 *
 * Best-effort, et la course n'est pas gagnée d'avance : si le hook arrivait avant
 * l'écriture de la route, on retombe sur l'ancien comportement (un doublon) —
 * jamais sur une perte.
 */
export async function isPrActionEcho(opts: {
  issueIds: (string | null | undefined)[];
  type: PrActionEventType;
  prNumber: number;
  provider: ForgeProvider;
  /** Id du compte de l'acteur chez la forge — la clé d'identité (MIN-154). */
  accountId: string | null;
  /** Login de l'acteur chez la forge : repli quand l'id manque d'un côté. */
  login: string | null;
}): Promise<boolean> {
  const issueIds = [...new Set(opts.issueIds.filter((id): id is string => !!id))];
  if (issueIds.length === 0) return false;
  const actorIds = await minddyUsersForForgeAccount({
    provider: opts.provider,
    accountId: opts.accountId,
    login: opts.login,
  });
  if (actorIds.length === 0) return false;
  const { data } = await getServiceClient()
    .from("issue_events")
    .select("id")
    .in("issue_id", issueIds)
    .in("actor_id", actorIds)
    .eq("type", opts.type)
    .eq("to_value", String(opts.prNumber))
    .gte("created_at", new Date(Date.now() - ECHO_WINDOW_MS).toISOString())
    .limit(1);
  return !!data?.length;
}

/**
 * Ce (ticket, geste, PR, acteur) porte-t-il DÉJÀ une ligne de moins de deux
 * minutes ? Le garde des gestes répétables (`collapsesInBurst`).
 *
 * Une review GitHub de huit remarques de ligne arrive en huit
 * `pull_request_review_comment` quasi simultanés : ce sont huit faits pour la
 * forge, un seul geste pour le lecteur du ticket. Sans ce regroupement, le
 * journal porterait huit fois la même phrase.
 *
 * Best-effort, et pour la même raison que l'anti-écho : les huit livraisons
 * peuvent s'exécuter en parallèle, et une lecture peut passer avant l'écriture
 * de sa voisine. On retombe alors sur quelques lignes de trop — jamais sur une
 * perte, jamais sur une ligne attribuée à côté.
 *
 * Deux modes, selon d'où vient le geste : in-app (`actorId`, le membre minddy)
 * ou forge (`actor_id` null, l'acteur encodé dans `from_value`).
 */
export async function hasRecentPrEvent(opts: {
  issueIds: string[];
  type: string;
  prNumber: number;
  actorId?: string | null;
  fromValue?: string | null;
}): Promise<boolean> {
  if (opts.issueIds.length === 0) return false;
  let query = getServiceClient()
    .from("issue_events")
    .select("id")
    .in("issue_id", opts.issueIds)
    .eq("type", opts.type)
    .eq("to_value", String(opts.prNumber))
    .gte("created_at", new Date(Date.now() - PR_EVENT_BURST_MS).toISOString())
    .limit(1);
  if (opts.actorId) {
    query = query.eq("actor_id", opts.actorId);
  } else {
    query = query.is("actor_id", null);
    query = opts.fromValue
      ? query.eq("from_value", opts.fromValue)
      : query.is("from_value", null);
  }
  const { data } = await query;
  return !!data?.length;
}

/** Tickets qui n'ont pas déjà la ligne (identité : geste + PR + acteur de forge). */
async function withoutBurstDuplicates(opts: {
  issueIds: string[];
  type: PrActionEventType;
  prNumber: number;
  fromValue: string | null;
}): Promise<string[]> {
  if (!collapsesInBurst(opts.type)) return opts.issueIds;
  const kept: string[] = [];
  for (const issueId of opts.issueIds) {
    const recent = await hasRecentPrEvent({
      issueIds: [issueId],
      type: opts.type,
      prNumber: opts.prNumber,
      fromValue: opts.fromValue,
    });
    if (!recent) kept.push(issueId);
  }
  return kept;
}

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
  const fromValue = forgeActorValue(opts.provider, opts.login);
  const targets = await withoutBurstDuplicates({
    issueIds,
    type: opts.type,
    prNumber: opts.prNumber,
    fromValue,
  });
  if (targets.length === 0) return;
  await insertEvents(
    getServiceClient(),
    targets.map((issueId) => ({
      issue_id: issueId,
      actor_id: null,
      type: opts.type,
      from_value: fromValue,
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
  /** Id du compte de l'acteur chez la forge — sert à reconnaître l'écho (MIN-154). */
  accountId: string | null;
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
  // Sauf écho : depuis MIN-144, fusionner une PR humaine DEPUIS minddy porte le
  // compte git de la personne, et l'appelant ne peut plus le distinguer d'un
  // merge fait sur la forge — la route l'a déjà tracé.
  if (
    opts.actionType &&
    !(await isPrActionEcho({
      issueIds: [issueId],
      type: opts.actionType,
      prNumber: opts.prNumber,
      provider: opts.provider,
      accountId: opts.accountId,
      login: opts.login,
    }))
  ) {
    const fromValue = forgeActorValue(opts.provider, opts.login);
    const targets = await withoutBurstDuplicates({
      issueIds: [issueId],
      type: opts.actionType,
      prNumber: opts.prNumber,
      fromValue,
    });
    if (targets.length === 0) return;
    await insertEvents(getServiceClient(), [
      {
        issue_id: issueId,
        actor_id: null,
        type: opts.actionType,
        from_value: fromValue,
        to_value: String(opts.prNumber),
      },
    ]);
  }
}

/**
 * Trace sur le(s) ticket(s) d'une PR un geste de forge SANS effet d'état — une
 * review, un commentaire de fil, une remarque de ligne. Le pendant, pour les
 * gestes qui ne changent rien à la PR elle-même, de ce que `handlePullRequest`
 * fait autour de `syncPrState`.
 *
 * Une seule règle à retenir : la PR de Numo passe par ses RUNS (ils portent le
 * ticket, et l'auteur du run mérite sa notification), une PR humaine par la PR
 * elle-même (MIN-143, `applyForgePrToIssue`). Ce garde `runs.length === 0`
 * manquait au chemin des reviews : approuver une PR humaine sur GitHub ne
 * laissait aucune trace sur son ticket, là où la fusionner en laissait une.
 *
 * Best-effort de bout en bout, comme le reste de ce module.
 */
export async function recordForgePrGesture(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  prNumber: number;
  type: PrActionEventType;
  /** Id du compte de l'acteur chez la forge — la clé de l'anti-écho (MIN-154). */
  accountId: string | null;
  /** Login de l'acteur chez la forge — il tient lieu d'acteur dans la timeline. */
  login: string | null;
}): Promise<void> {
  const runs = await findRunsForPr({
    repoFullName: opts.repoFullName,
    prNumber: opts.prNumber,
    provider: opts.provider,
  });
  if (runs.length === 0) {
    await applyForgePrToIssue({ ...opts, prState: null, actionType: opts.type });
    return;
  }
  const echo = await isPrActionEcho({
    issueIds: runs.map((r) => r.issueId),
    type: opts.type,
    prNumber: opts.prNumber,
    provider: opts.provider,
    accountId: opts.accountId,
    login: opts.login,
  });
  if (echo) return;
  await recordForgePrActionEvents({
    runs,
    type: opts.type,
    prNumber: opts.prNumber,
    provider: opts.provider,
    login: opts.login,
  });
  // Inbox : sans type de notification associé (commentaires), c'est un no-op.
  await notifyForgePrAction({ runs, type: opts.type, actorLogin: opts.login });
}
