import "server-only";

import { aiModelFallback } from "@/lib/ai-model-config";
import { issueIdentifier } from "@/lib/issue-constants";
import { getAppConfigValue } from "@/lib/server/app-config";
import {
  newRunId,
  parseOpenRouterUsage,
  recordAiUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { getServiceClient } from "@/lib/supabase-service";
import { isForgeApiError, type Forge } from "./forge";
import {
  AI_REVIEW_TOOL_NAME,
  AI_REVIEW_TOOL_PARAMETERS,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  formatReviewBody,
  parseAiReview,
  selectFindings,
  type AiReview,
  type ReviewIssueContext,
} from "./pr-ai-review-core";
import type { PullRequestRow } from "./pull-requests";

/**
 * Review d'une pull request par Numo (MIN-141) — la passe DÉCLENCHÉE.
 *
 * `self-review.ts` existait déjà, mais c'est autre chose : une injection de fin
 * de tour dans la boucle de l'agent, que personne ne peut demander de
 * l'extérieur. Ici, un clic sur « Faire vérifier par Numo » (menu Review d'une
 * PR — de N'IMPORTE quelle PR, pas seulement de celles que Numo a ouvertes)
 * déclenche UN appel modèle qui produit une synthèse et des commentaires de
 * ligne, là où CodeRabbit se pose.
 *
 * Trois décisions tenues ici :
 *  1. **Manuel.** Rien ne l'appelle à l'ouverture d'une PR. Un tour de modèle
 *     coûte de l'argent, un clic n'en coûte pas — et c'est le déclencheur qui
 *     paye (`billTo: { userId }`, MIN-131), pas le owner du projet.
 *  2. **Un autre modèle.** `pr_review_model` est délibérément distinct de
 *     `agent_model` : faire relire du code par le modèle qui vient de l'écrire
 *     donne un second avis identique. C'est la raison d'être de la passe.
 *  3. **Synthèse + 3 à 5 points en ligne** (`selectFindings`), le reste replié
 *     dans la synthèse — quinze commentaires de ligne, c'est du bruit.
 *
 * L'écriture passe par l'outillage de MIN-138 : `createPullRequestReviewComment`
 * pour les ancres, `submitReview` pour la synthèse — soumise en `comment`,
 * TOUJOURS, le verdict étant écrit dans le corps (voir plus bas : un avis, pas
 * une porte).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Clé `app_config` du modèle de review — surchargeable sans redeploy. */
export const PR_REVIEW_MODEL_CONFIG_KEY = "pr_review_model";

/** Un diff se lit plus lentement qu'un ticket se classe : 3 minutes, pas 45 s. */
const REVIEW_TIMEOUT_MS = 180_000;

/** Assez pour une synthèse et une poignée de points argumentés, pas pour un essai. */
const REVIEW_MAX_TOKENS = 4000;

export type PrAiReviewOutcome =
  | {
      ok: true;
      /** Ce que Numo pense de la PR. Écrit dans la synthèse, pas dans l'événement
       *  de review de la forge (cf. la soumission en `comment` plus bas). */
      verdict: AiReview["verdict"];
      /** Commentaires de ligne réellement déposés. */
      inlineComments: number;
      model: string;
    }
  | { ok: false; error: "noDiff" | "modelUnavailable" | "modelRefused" };

interface PrAiReviewInput {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  pr: PullRequestRow;
  /** Qui a cliqué — c'est lui qui paye. */
  userId: string;
  locale: string;
}

/**
 * Lance la passe et POSTE le résultat. Lève sur erreur de forge (l'appelant la
 * traduit en HTTP) ; les échecs du modèle reviennent en `{ ok: false }`, parce
 * qu'un modèle qui n'a rien à dire n'est pas une panne de minddy.
 */
export async function runPrAiReview(input: PrAiReviewInput): Promise<PrAiReviewOutcome> {
  const { forge, call } = input;
  const [pr, files] = await Promise.all([
    forge.getPullRequest(call),
    forge.listPullRequestFiles(call),
  ]);
  if (files.length === 0) return { ok: false, error: "noDiff" };

  const model =
    (await getAppConfigValue(PR_REVIEW_MODEL_CONFIG_KEY))?.trim() ||
    aiModelFallback(PR_REVIEW_MODEL_CONFIG_KEY);

  const raw = await callReviewModel({
    model,
    system: buildReviewSystemPrompt(input.locale),
    user: buildReviewUserMessage({
      title: pr.title ?? input.pr.title ?? "",
      body: pr.body,
      issue: await loadIssueContext(input.pr.issue_id),
      files,
    }),
    userId: input.userId,
  });
  if (raw === null) return { ok: false, error: "modelUnavailable" };

  const review = parseAiReview(raw);
  if (!review) return { ok: false, error: "modelRefused" };

  const { inline, inSummary } = selectFindings(review.findings, files);

  // Les commentaires de ligne d'abord, la synthèse ensuite : c'est la synthèse
  // qui porte ce qui n'a pas pu être ancré, et on ne le sait qu'après avoir
  // essayé. Un 422 ici (la tête a bougé entre la lecture et l'envoi) fait
  // redescendre le point dans la synthèse plutôt que de tomber.
  const posted: typeof inline = [];
  const failed: typeof inline = [];
  for (const finding of inline) {
    try {
      await forge.createPullRequestReviewComment({
        ...call,
        body: finding.body,
        path: finding.path,
        line: finding.line,
        side: finding.side,
      });
      posted.push(finding);
    } catch (err) {
      if (!isForgeApiError(err) || err.status !== 422) throw err;
      failed.push(finding);
    }
  }

  const body = formatReviewBody({
    review,
    inSummary: [...failed, ...inSummary],
    model,
    locale: input.locale,
  });

  // Le verdict de Numo est ÉCRIT dans le corps, jamais porté par l'événement de
  // review : la passe est soumise en `comment`, toujours. Un `APPROVE` posté par
  // l'app satisferait une protection de branche qui exige une approbation — du
  // code fusionné sans qu'un humain l'ait lu — et un `REQUEST_CHANGES` bloquerait
  // la PR jusqu'à ce que quelqu'un le lève à la main. Numo donne un avis ;
  // approuver et demander des changements restent des gestes du menu Review,
  // c'est-à-dire des gestes de la personne qui décide.
  await forge.submitReview({ ...call, verdict: "comment", body });

  return { ok: true, verdict: review.verdict, inlineComments: posted.length, model };
}

/**
 * Le ticket que la PR met en œuvre — le contexte qui distingue « ce code est
 * correct » de « ce code fait ce qu'on lui demandait ». Best-effort : une PR sans
 * ticket (le cas normal d'une PR humaine, MIN-143) se relit très bien sans.
 */
async function loadIssueContext(issueId: string | null): Promise<ReviewIssueContext | null> {
  if (!issueId) return null;
  try {
    const { data } = await getServiceClient()
      .from("issues")
      .select("number, title, description, projects(key)")
      .eq("id", issueId)
      .maybeSingle();
    if (!data) return null;
    const key = ((data.projects as { key?: string } | null)?.key ?? "").toString();
    return {
      identifier: issueIdentifier(key, data.number as number),
      title: (data.title as string) ?? "",
      description: (data.description as string | null) ?? null,
    };
  } catch (err) {
    console.error("[pr-ai-review] issue context failed:", (err as Error).message);
    return null;
  }
}

/**
 * L'appel modèle à sortie forcée. Même contrat que `forcedToolCall` du feedback
 * (un tool obligatoire, `null` au moindre échec) mais avec ses propres budgets :
 * une review lit un diff entier et écrit plusieurs paragraphes, les 1 024 tokens
 * et 45 s de la passe feedback la couperaient au milieu.
 */
async function callReviewModel(input: {
  model: string;
  system: string;
  user: string;
  userId: string;
}): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "PR review (minddy)",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: AI_REVIEW_TOOL_NAME,
              description: "Mandatory structured output — you must always call it.",
              parameters: AI_REVIEW_TOOL_PARAMETERS,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: AI_REVIEW_TOOL_NAME } },
        usage: { include: true },
        max_tokens: REVIEW_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };

    // Le ledger AVANT la lecture du tool call : l'appel est payé même quand le
    // modèle répond à côté, et une dépense hors compteur est exactement ce que
    // MIN-131 interdit.
    const usage = parseOpenRouterUsage(data.usage);
    await recordAiUsage({
      runId: newRunId(),
      feature: "pr_review",
      model: data.model ?? input.model,
      generationId: data.id ?? null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost: usage.cost,
      billTo: { userId: input.userId },
    });

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (toolCall?.name !== AI_REVIEW_TOOL_NAME) return {};
    return JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>;
  } catch (err) {
    console.error("[pr-ai-review] LLM call failed:", (err as Error).message);
    return null;
  }
}
