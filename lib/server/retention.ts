import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { attachmentPaths, type TrashType } from "@/lib/server/trash";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { removeStorageObjects } from "@/lib/server/attachments";
import {
  ORPHAN_PAGE_FILE_DAYS,
  sweepOrphanPageFiles,
} from "@/lib/server/page-files";

/**
 * Application des durées de conservation (MIN-119, RGPD art. 5.1.e).
 *
 * Une politique de confidentialité qui annonce des durées et un code qui ne
 * supprime jamais rien, c'est le manquement le plus banal — et le plus simple à
 * constater lors d'un contrôle. Ce module est le pendant exécutable de la
 * section « Durées de conservation » de la politique : les deux doivent dire la
 * même chose, et c'est ici que la valeur fait foi.
 *
 * Le contenu créé par l'utilisateur ne part de lui-même qu'à UNE condition :
 * l'avoir supprimé. Un ticket, un projet, un objectif ou un feedback mis à la
 * corbeille y reste 30 jours, puis le balayage l'efface pour de bon (MIN-133) —
 * c'est le seul cas, et la corbeille l'annonce en clair, jour par jour. Tout le
 * reste de ce qui part ici est *technique* : traces d'exécution, jetons expirés,
 * accusés de lecture, dont la conservation n'a plus d'utilité passé un délai.
 * Ce à quoi l'utilisateur n'a pas touché, lui, ne bouge jamais.
 *
 * Appelé une fois par nuit par `app/api/cron/data-retention/route.ts`.
 * Les durées correspondantes sont documentées dans
 * `docs/rgpd/registre-des-traitements.md`.
 */

/** Durées de conservation, en jours. Source de vérité du produit. */
export const RETENTION_DAYS = {
  /** Notifications déjà lues — la boîte de réception ne remonte pas si loin. */
  readNotifications: 180,
  /**
   * Invitations restées en attente. Passé ce délai, l'adresse d'une personne
   * qui n'a jamais rejoint le projet est conservée sans finalité.
   */
  pendingInvitations: 90,
  /**
   * Traces d'exécution de l'agent (événements + messages de pilotage) après
   * l'état terminal du run. Le `checkpoint` de reprise, lui, est déjà remis à
   * null à la fin du run (lib/server/agent/runs.ts). Ne restent ensuite que les
   * métadonnées attachées au ticket : branche, pull request, statut, coût.
   */
  agentRunTrace: 30,
  /**
   * Charge utile brute des webhooks Stripe. La LIGNE reste au-delà — sa clé
   * primaire porte la garde d'idempotence, la supprimer rouvrirait la porte au
   * rejeu d'un événement. Seul le `payload` part.
   */
  stripeWebhookPayload: 90,
  /**
   * Corbeille (MIN-133). Le seul contenu utilisateur que ce balayage détruit —
   * et seulement parce que l'utilisateur l'a déjà supprimé une fois. La durée
   * est celle affichée sur chaque ligne de la corbeille : elle vit dans
   * `lib/server/trash.ts`, d'où elle est réexportée ici pour que le balayage et
   * l'écran ne puissent pas diverger.
   */
  trash: TRASH_RETENTION_DAYS,
  /**
   * Identités de board qui n'ont RIEN produit : vérifiées par code puis plus
   * rien — ni retour, ni vote, ni commentaire, ni session vivante. Leur adresse
   * était conservée sans finalité, ce que l'article 5.1.e n'admet pas.
   *
   * 90 jours, soit la durée de vie d'une session de board : en deçà, la purge
   * courrait après des gens encore connectés. Le tri lui-même est en SQL
   * (`purge_dormant_feedback_identities`) — six « n'existe pas » que PostgREST
   * ne sait pas exprimer.
   */
  dormantFeedbackIdentities: 90,
  /**
   * Historique des pages (MIN-277) : les états antérieurs d'un document.
   *
   * Même durée que la corbeille, et c'est délibéré — un second délai serait une
   * seconde chose à retenir, pour la même promesse (« rien de ce que vous avez
   * écrit ne disparaît avant trente jours »). Ce qui part ici n'est jamais le
   * document courant : il vit dans `pages`, et rien ne l'efface tant que
   * personne ne l'a supprimé.
   */
  pageVersions: TRASH_RETENTION_DAYS,
  /**
   * Fichiers de page ORPHELINS (MIN-280) : plus cités par aucun corps.
   *
   * Ce n'est pas une durée de conservation au sens de l'article 5.1.e — le
   * fichier n'est plus une donnée qu'on garde, c'est un octet que plus rien ne
   * montre. Le délai est un délai de GRÂCE : une image sort d'un corps par un
   * retour arrière, et y revient par un `⌘Z` fait le lendemain, par la
   * restauration d'une version (MIN-277) ou par un passage à la corbeille. Une
   * semaine couvre tous ces retours ; au-delà, plus personne ne revient.
   */
  orphanPageFiles: ORPHAN_PAGE_FILE_DAYS,
} as const;

export type RetentionKey = keyof typeof RETENTION_DAYS;

const DAY_MS = 86_400_000;

/** Borne ISO en deçà de laquelle une ligne est expirée. */
export function cutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export interface RetentionStep {
  /** Nom de la purge, tel qu'il apparaît dans le résultat du cron. */
  step: string;
  /** Lignes touchées, ou null si l'étape a échoué. */
  deleted: number | null;
  error?: string;
}

export interface RetentionSweepResult {
  ok: boolean;
  ranAt: string;
  steps: RetentionStep[];
}

/**
 * Enveloppe une purge : une table qui échoue (colonne renommée, timeout) ne doit
 * pas emporter le balayage entier — les suivantes tournent quand même, et le
 * cron rapporte l'étape fautive.
 */
async function step(
  name: string,
  run: () => Promise<number>
): Promise<RetentionStep> {
  try {
    return { step: name, deleted: await run() };
  } catch (e) {
    return { step: name, deleted: null, error: (e as Error).message };
  }
}

type Service = ReturnType<typeof getServiceClient>;

/** Compte les lignes réellement supprimées (`count: "exact"` sur un delete). */
function counted(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error as Error;
  return result.count ?? 0;
}

/** Notifications lues il y a plus de `readNotifications` jours. */
async function purgeReadNotifications(service: Service, now: Date) {
  return counted(
    await service
      .from("notifications")
      .delete({ count: "exact" })
      .not("read_at", "is", null)
      .lt("read_at", cutoff(RETENTION_DAYS.readNotifications, now))
  );
}

/** Invitations jamais acceptées, émises il y a plus de `pendingInvitations`. */
async function purgePendingInvitations(service: Service, now: Date) {
  return counted(
    await service
      .from("project_invitations")
      .delete({ count: "exact" })
      .eq("status", "pending")
      .lt("created_at", cutoff(RETENTION_DAYS.pendingInvitations, now))
  );
}

const TERMINAL_RUN_STATUSES = ["completed", "failed", "canceled"];

/**
 * Traces des runs d'agent terminés depuis plus de `agentRunTrace` jours.
 *
 * Deux tables (`agent_run_events`, `agent_run_messages`) filtrées sur la même
 * liste de runs : PostgREST ne sait pas joindre dans un DELETE, donc on résout
 * d'abord les identifiants. Le lot est borné — un balayage quotidien rattrape
 * le reste le lendemain, et une purge illimitée sur une base qui a accumulé des
 * mois de runs dépasserait la durée de la fonction.
 */
async function purgeAgentRunTraces(service: Service, now: Date) {
  const { data, error } = await service
    .from("agent_runs")
    .select("id")
    .in("status", TERMINAL_RUN_STATUSES)
    .lt("updated_at", cutoff(RETENTION_DAYS.agentRunTrace, now))
    .limit(500);
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;

  const events = counted(
    await service.from("agent_run_events").delete({ count: "exact" }).in("run_id", ids)
  );
  const messages = counted(
    await service.from("agent_run_messages").delete({ count: "exact" }).in("run_id", ids)
  );
  return events + messages;
}

/** Codes d'autorisation OAuth expirés (usage unique, très court terme). */
async function purgeExpiredOauthCodes(service: Service, now: Date) {
  return counted(
    await service
      .from("oauth_authorization_codes")
      .delete({ count: "exact" })
      .lt("expires_at", now.toISOString())
  );
}

/** Sessions et codes à usage unique expirés des boards publics de feedback. */
async function purgeExpiredFeedbackAuth(service: Service, now: Date) {
  const iso = now.toISOString();
  const sessions = counted(
    await service.from("feedback_sessions").delete({ count: "exact" }).lt("expires_at", iso)
  );
  const codes = counted(
    await service.from("feedback_otp_codes").delete({ count: "exact" }).lt("expires_at", iso)
  );
  return sessions + codes;
}

/**
 * Identités de board dormantes (MIN-119, art. 5.1.e).
 *
 * Lot borné comme les autres : le balayage du lendemain reprend la suite. La
 * fonction rend le nombre de lignes réellement supprimées.
 */
async function purgeDormantFeedbackIdentities(service: Service, now: Date) {
  const { data, error } = await service.rpc("purge_dormant_feedback_identities", {
    p_before: cutoff(RETENTION_DAYS.dormantFeedbackIdentities, now),
    p_limit: 500,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/**
 * Charge utile des webhooks Stripe au-delà de `stripeWebhookPayload` jours.
 * `update`, pas `delete` : la ligne garde son rôle d'anti-rejeu.
 */
async function stripPayloads(service: Service, now: Date) {
  const { count, error } = await service
    .from("stripe_webhook_events")
    .update({ payload: null }, { count: "exact" })
    .not("payload", "is", null)
    .lt("created_at", cutoff(RETENTION_DAYS.stripeWebhookPayload, now));
  if (error) throw error;
  return count ?? 0;
}

/**
 * Versions de page expirées (MIN-277).
 *
 * Lot borné comme les autres. Le compteur d'une page très écrite peut monter
 * vite (une version par tranche de cinq minutes et par auteur), et une purge
 * illimitée sur un arriéré dépasserait la durée de la fonction ; le balayage du
 * lendemain reprend la suite.
 *
 * La purge DÉFINITIVE d'une page, elle, ne passe pas par ici : ses versions
 * s'en vont par la cascade de `page_versions.page_id` (cf. la migration), au
 * moment même où la ligne part.
 */
async function purgePageVersions(service: Service, now: Date) {
  const { data, error } = await service
    .from("page_versions")
    .select("id")
    .lt("created_at", cutoff(RETENTION_DAYS.pageVersions, now))
    .limit(1000);
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  return counted(
    await service.from("page_versions").delete({ count: "exact" }).in("id", ids)
  );
}

/**
 * Les tables de la corbeille, et le type qui leur correspond.
 *
 * Les PAGES y passent DEUX fois, et l'ordre est le fond de l'affaire : une page
 * corbeillée avec son parent porte `deleted_root_id`, et `parent_id` est
 * `on delete set null` — purger une racine avant ses descendants les laisserait
 * derrière, sans racine, donc réapparus à la corbeille comme des lignes
 * autonomes. Les descendants d'abord, les racines ensuite : le lot borné peut
 * couper où il veut, il ne laisse jamais d'orphelin visible.
 */
const TRASH_TABLES: {
  table: string;
  type: TrashType;
  /** Restreint le lot : `notNull` / `isNull` sur une colonne. */
  scope?: { column: string; isNull: boolean };
}[] = [
  { table: "issues", type: "issue" },
  { table: "objectives", type: "objective" },
  { table: "feedback_posts", type: "feedback" },
  { table: "agent_routines", type: "routine" },
  { table: "pages", type: "page", scope: { column: "deleted_root_id", isNull: false } },
  { table: "pages", type: "page", scope: { column: "deleted_root_id", isNull: true } },
  { table: "projects", type: "project" },
];

/**
 * Corbeille : les éléments supprimés il y a plus de `trash` jours.
 *
 * L'ordre compte. Les projets passent en DERNIER : supprimer un projet cascade
 * sur ses tickets, ses objectifs, ses feedbacks et ses routines, et purger un
 * projet d'abord emporterait des lignes qu'on n'aurait pas comptées — le total
 * rapporté au cron mentirait. Les objets du storage ne cascadent pas du tout :
 * leurs chemins sont relevés AVANT le delete, puis effacés une fois les lignes
 * parties. Une routine, elle, n'a pas de fichier mais emporte ses passages
 * (`agent_runs.routine_id` cascade) : c'est ici, et seulement ici, que
 * l'historique d'une routine supprimée disparaît vraiment.
 *
 * Lot borné par table : le balayage du lendemain reprend le reste, là où une
 * purge illimitée sur un arriéré dépasserait la durée de la fonction.
 */
const TRASH_BATCH = 500;

async function purgeTrash(service: Service, now: Date) {
  const expired = cutoff(RETENTION_DAYS.trash, now);
  let deleted = 0;

  for (const { table, type, scope } of TRASH_TABLES) {
    const query = service
      .from(table)
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", expired);
    if (scope) {
      if (scope.isNull) query.is(scope.column, null);
      else query.not(scope.column, "is", null);
    }
    const { data, error } = await query.limit(TRASH_BATCH);
    if (error) throw error;

    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length === 0) continue;

    const paths = await attachmentPaths(service, type, ids);
    deleted += counted(
      await service.from(table).delete({ count: "exact" }).in("id", ids)
    );
    await removeStorageObjects(service, paths);
  }

  return deleted;
}

/** Exécute toutes les purges et rend le détail par étape. */
export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionSweepResult> {
  const service = getServiceClient();

  const steps = [
    await step("read_notifications", () => purgeReadNotifications(service, now)),
    await step("pending_invitations", () => purgePendingInvitations(service, now)),
    await step("agent_run_traces", () => purgeAgentRunTraces(service, now)),
    await step("oauth_authorization_codes", () => purgeExpiredOauthCodes(service, now)),
    await step("feedback_auth", () => purgeExpiredFeedbackAuth(service, now)),
    await step("feedback_dormant_identities", () =>
      purgeDormantFeedbackIdentities(service, now)
    ),
    await step("stripe_webhook_payloads", () => stripPayloads(service, now)),
    await step("page_versions", () => purgePageVersions(service, now)),
    // AVANT la corbeille, et l'ordre a une raison : purger une page emporte ses
    // fichiers elle-même (lib/server/trash.ts). Passer d'abord ici évite de
    // relire des lignes qui vont partir dans la seconde, et surtout de compter
    // deux fois les mêmes octets dans le rapport du cron.
    await step("orphan_page_files", () =>
      sweepOrphanPageFiles(service, cutoff(RETENTION_DAYS.orphanPageFiles, now))
    ),
    await step("trash", () => purgeTrash(service, now)),
  ];

  return {
    ok: steps.every((s) => s.deleted !== null),
    ranAt: now.toISOString(),
    steps,
  };
}
