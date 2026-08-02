import "server-only";

import { aiModelFallback } from "@/lib/ai-model-config";
import {
  isPrReviewActive,
  prReviewTopic,
  type PrReviewContextPayload,
  type PrReviewErrorCode,
  type PrReviewEvent,
  type PrReviewEventPayload,
  type PrReviewEventType,
  type PrReviewFindingPayload,
  type PrReviewPhase,
  type PrReviewRun,
  type PrReviewSummaryPayload,
} from "@/lib/pr-review-run";
import { getAppConfigValue } from "@/lib/server/app-config";
import { getServiceClient } from "@/lib/supabase-service";
import { broadcastToTopic } from "./live";

/**
 * La SESSION de review d'une PR par Numo : sa ligne, son flux, son direct.
 *
 * Avant, la passe ne laissait aucune trace : elle vivait dans une requête HTTP
 * et mourait avec elle. Trois choses en découlaient, et c'est ce module qui les
 * répare — écrire la passe, c'est du même geste pouvoir la REGARDER pendant, la
 * RETROUVER après un rechargement, et SAVOIR qu'elle a déjà eu lieu sur ce
 * diff-là.
 *
 * Le flux est append-only et numéroté (`seq`), comme celui d'un run d'agent :
 * le fil de la PR rejoue ce qui est en base à l'ouverture, et reçoit la suite en
 * direct sur le topic privé `pr-review:{id}`. Le direct est un CONFORT — tout ce qui
 * compte est en base, un message perdu ne laisse pas de trou.
 *
 * Un seul écrivain par passe (la fonction qui la joue), d'où le compteur `seq`
 * tenu en mémoire : aucun autre appelant n'insère dans ce flux.
 */

/** Clé `app_config` du modèle de review — le défaut de l'instance, réglable en /admin. */
export const PR_REVIEW_MODEL_CONFIG_KEY = "pr_review_model";

interface RunRow {
  id: string;
  user_id: string;
  status: string;
  model: string;
  head_sha: string | null;
  verdict: string | null;
  inline_comments: number | null;
  summary_comment_id: number | string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

// D'UN SEUL tenant : supabase-js infère le type de la ligne en lisant ce
// littéral, et une concaténation le lui rend illisible (`GenericStringError`).
const RUN_COLUMNS =
  "id, user_id, status, model, head_sha, verdict, inline_comments, summary_comment_id, error, created_at, finished_at";

function toRun(row: RunRow, viewerId?: string): PrReviewRun {
  return {
    id: row.id,
    status: (row.status as PrReviewRun["status"]) ?? "running",
    model: row.model,
    headSha: row.head_sha,
    verdict: (row.verdict as PrReviewRun["verdict"]) ?? null,
    inlineComments: row.inline_comments ?? 0,
    // `bigint` revient parfois en chaîne du driver : l'id se compare à celui
    // d'un commentaire de la forge, qui est un nombre.
    summaryCommentId: row.summary_comment_id == null ? null : Number(row.summary_comment_id),
    error: (row.error as PrReviewErrorCode | null) ?? null,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    // « C'est moi qui l'ai demandée » : un échec ne se montre qu'à la personne
    // qui a cliqué (et payé) — pour les autres, il n'y a rien à faire de cette
    // ligne rouge.
    mine: viewerId ? row.user_id === viewerId : false,
  };
}

/**
 * Le modèle qui va relire, en trois temps : ce qui a été choisi POUR CETTE
 * PASSE, sinon le dernier choix du compte, sinon le défaut de l'instance.
 *
 * Le catalogue est celui de la clé plateforme OpenRouter dans les trois cas —
 * la review tourne dessus, y compris pour un compte en BYOK (un id natif
 * `gpt-…` n'y serait pas routable). Elle se paye donc TOUJOURS sur le quota
 * minddy, ce qui la soumet aussi au plafond de modèle du plan — d'où
 * `chosenByUser` : le plafond porte sur les deux premiers temps (un modèle
 * nommé par quelqu'un), jamais sur le troisième. Le défaut d'instance vaut
 * délibérément un modèle cher, et s'y heurter laisserait un compte Go sans
 * aucun chemin vers une review.
 */
export async function resolvePrReviewModel(opts: {
  perCall?: string | null;
  userId: string;
  /** Vrai quand on vient de demander explicitement le défaut de l'instance. */
  ignoreRemembered?: boolean;
}): Promise<{ model: string; chosenByUser: boolean }> {
  const perCall = opts.perCall?.trim();
  if (perCall) return { model: perCall, chosenByUser: true };
  if (!opts.ignoreRemembered) {
    const remembered = await getUserPrReviewModel(opts.userId);
    if (remembered) return { model: remembered, chosenByUser: true };
  }
  return { model: await getInstancePrReviewModel(), chosenByUser: false };
}

/** Le défaut de l'instance seul (sans le choix du compte) — ce que l'UI affiche
 *  en aparté sur l'option « modèle par défaut » du picker. */
export async function getInstancePrReviewModel(): Promise<string> {
  return (
    (await getAppConfigValue(PR_REVIEW_MODEL_CONFIG_KEY))?.trim() ||
    aiModelFallback(PR_REVIEW_MODEL_CONFIG_KEY)
  );
}

/** Dernier modèle de review choisi par ce compte, ou null. */
export async function getUserPrReviewModel(userId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("user_agent_preferences")
    .select("pr_review_model")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { pr_review_model: string | null } | null)?.pr_review_model ?? null;
}

/**
 * Retient le modèle choisi : la fois d'après, « faire vérifier par Numo » repart
 * de là. `null` efface le choix — c'est ce que veut dire « revenir au défaut de
 * minddy » dans le picker, et sans ça le choix retenu gagnerait pour toujours.
 * Best-effort — un choix non mémorisé ne doit pas empêcher la review.
 */
export async function rememberPrReviewModel(
  userId: string,
  model: string | null,
): Promise<void> {
  try {
    await getServiceClient()
      .from("user_agent_preferences")
      .upsert({ user_id: userId, pr_review_model: model }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[pr-review-runs] remember model failed:", (err as Error).message);
  }
}

/** Ouvre la session. La ligne existe AVANT le premier appel de forge : c'est
 *  elle que la réponse rend, et à laquelle l'écran s'abonne. */
export async function createPrReviewRun(input: {
  pullRequestId: string;
  userId: string;
  model: string;
}): Promise<PrReviewRun> {
  const { data, error } = await getServiceClient()
    .from("pr_review_runs")
    .insert({
      pull_request_id: input.pullRequestId,
      user_id: input.userId,
      model: input.model,
      status: "running",
    })
    .select(RUN_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not open the review run");
  return toRun(data as RunRow, input.userId);
}

/** La dernière passe de cette PR — celle que l'écran montre. */
export async function latestPrReviewRun(
  pullRequestId: string,
  viewerId?: string,
): Promise<PrReviewRun | null> {
  const { data } = await getServiceClient()
    .from("pr_review_runs")
    .select(RUN_COLUMNS)
    .eq("pull_request_id", pullRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRun(data as RunRow, viewerId) : null;
}

/**
 * La dernière passe TERMINÉE de cette PR, quelle que soit celle qui tourne.
 * C'est elle qui porte le `head_sha` relu — donc la réponse à « est-ce que
 * relire aurait quelque chose à lire de nouveau ».
 */
export async function lastFinishedPrReviewRun(
  pullRequestId: string,
): Promise<PrReviewRun | null> {
  const { data } = await getServiceClient()
    .from("pr_review_runs")
    .select(RUN_COLUMNS)
    .eq("pull_request_id", pullRequestId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRun(data as RunRow) : null;
}

/** Une passe TOURNE-t-elle déjà sur cette PR ? Deux tours de modèle simultanés
 *  sur le même diff, c'est deux fois la dépense pour deux fois le même avis. */
export async function activePrReviewRun(pullRequestId: string): Promise<PrReviewRun | null> {
  const run = await latestPrReviewRun(pullRequestId);
  return isPrReviewActive(run) ? run : null;
}

/** Le flux d'une passe, dans l'ordre. `afterSeq` sert le rattrapage du poll. */
export async function prReviewEvents(
  reviewId: string,
  afterSeq = -1,
): Promise<PrReviewEvent[]> {
  let query = getServiceClient()
    .from("pr_review_events")
    .select("id, seq, type, payload, created_at")
    .eq("review_id", reviewId)
    .order("seq", { ascending: true });
  if (afterSeq >= 0) query = query.gt("seq", afterSeq);
  const { data } = await query;
  return ((data ?? []) as {
    id: string;
    seq: number;
    type: string;
    payload: unknown;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    seq: row.seq,
    type: row.type as PrReviewEventType,
    payload: (row.payload ?? null) as PrReviewEventPayload | null,
    created_at: row.created_at,
  }));
}

/**
 * Le carnet d'une passe : il pose les événements et pousse le direct. Une seule
 * instance par passe (le `seq` est tenu ici).
 *
 * TOUT est best-effort : un événement qu'on n'arrive pas à écrire prive l'écran
 * d'une ligne, il n'annule pas une review payée.
 */
export function openPrReviewRecorder(reviewId: string) {
  let seq = 0;
  const topic = prReviewTopic(reviewId);

  async function append(type: PrReviewEventType, payload: PrReviewEventPayload): Promise<void> {
    const current = seq++;
    try {
      const { data, error } = await getServiceClient()
        .from("pr_review_events")
        .insert({ review_id: reviewId, seq: current, type, payload })
        .select("id, seq, type, payload, created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      void broadcastToTopic(topic, "event", { row: data });
    } catch (err) {
      console.error(`[pr-review-runs] event ${type} lost:`, (err as Error).message);
    }
  }

  return {
    reviewId,
    /** Changement de phase. */
    status: (phase: PrReviewPhase) => append("status", { phase }),
    /** Une source lue, avec ses chiffres. */
    context: (payload: PrReviewContextPayload) => append("context", payload),
    /** Un point, au moment où il est posé (ou replié dans la synthèse). */
    finding: (payload: PrReviewFindingPayload) => append("finding", payload),
    /** Le verdict et la synthèse, publiés. */
    summary: (payload: PrReviewSummaryPayload) => append("summary", payload),
    /** La passe s'arrête là. */
    failed: (code: PrReviewErrorCode) => append("error", { code }),
    /**
     * Le texte du tool call en cours d'écriture — ÉPHÉMÈRE, jamais en base :
     * c'est un brouillon réémis plusieurs fois par seconde, et sa version
     * définitive arrive en `summary`. Throttlé par l'appelant, à la cadence du
     * stream.
     */
    stream: (summary: string, findings: number) => {
      void broadcastToTopic(topic, "stream", { summary, findings, at: Date.now() });
    },
  };
}

export type PrReviewRecorder = ReturnType<typeof openPrReviewRecorder>;

/** Ferme la session. `finished_at` est posé ici, jamais par un trigger : c'est
 *  l'instant où Numo a fini d'écrire SUR la PR, pas celui où la ligne bouge. */
export async function finishPrReviewRun(
  reviewId: string,
  outcome:
    | {
        status: "done";
        headSha: string | null;
        verdict: PrReviewSummaryPayload["verdict"];
        inlineComments: number;
        summaryCommentId: number | null;
      }
    | { status: "failed"; headSha?: string | null; error: PrReviewErrorCode },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: outcome.status,
    finished_at: new Date().toISOString(),
    head_sha: outcome.headSha ?? null,
  };
  if (outcome.status === "done") {
    patch.verdict = outcome.verdict;
    patch.inline_comments = outcome.inlineComments;
    patch.summary_comment_id = outcome.summaryCommentId;
  } else {
    patch.error = outcome.error;
  }
  try {
    await getServiceClient().from("pr_review_runs").update(patch).eq("id", reviewId);
  } catch (err) {
    console.error("[pr-review-runs] finish failed:", (err as Error).message);
  }
}
