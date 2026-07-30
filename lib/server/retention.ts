import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Application des durées de conservation (MIN-119, RGPD art. 5.1.e).
 *
 * Une politique de confidentialité qui annonce des durées et un code qui ne
 * supprime jamais rien, c'est le manquement le plus banal — et le plus simple à
 * constater lors d'un contrôle. Ce module est le pendant exécutable de la
 * section « Durées de conservation » de la politique : les deux doivent dire la
 * même chose, et c'est ici que la valeur fait foi.
 *
 * Ce qui est purgé n'est JAMAIS du contenu créé par l'utilisateur : ses tickets,
 * commentaires, projets et conversations restent jusqu'à ce que lui-même ou la
 * suppression de son compte les efface. Ne partent d'eux-mêmes que les données
 * *techniques* — traces d'exécution, jetons expirés, accusés de lecture — dont
 * la conservation n'a plus d'utilité passé un délai.
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

/** Exécute toutes les purges et rend le détail par étape. */
export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionSweepResult> {
  const service = getServiceClient();

  const steps = [
    await step("read_notifications", () => purgeReadNotifications(service, now)),
    await step("pending_invitations", () => purgePendingInvitations(service, now)),
    await step("agent_run_traces", () => purgeAgentRunTraces(service, now)),
    await step("oauth_authorization_codes", () => purgeExpiredOauthCodes(service, now)),
    await step("feedback_auth", () => purgeExpiredFeedbackAuth(service, now)),
    await step("stripe_webhook_payloads", () => stripPayloads(service, now)),
  ];

  return {
    ok: steps.every((s) => s.deleted !== null),
    ranAt: now.toISOString(),
    steps,
  };
}
