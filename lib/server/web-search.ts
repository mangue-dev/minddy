import "server-only";

import { getAppConfigValues } from "@/lib/server/app-config";
import { stripModelSuffix } from "@/lib/ai-model-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import {
  parseOpenRouterUsage,
  recordAiUsage,
  type AiUsageBillTo,
  type NormalizedUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import type { AiSurface } from "@/lib/ai-surfaces";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import {
  aiChatProviderHeaders,
  translateAiChatRequest,
} from "@/lib/ai-chat";

/**
 * Recherche web de Numo — le SEUL chemin d'accès au web de l'app.
 *
 * Elle passe par le plugin `web` d'OpenRouter (moteur Exa forcé), jamais par un
 * service de recherche tiers : une seule clé, une seule facture, un seul ledger.
 * OpenRouter n'expose pas d'endpoint de recherche isolé — le plugin injecte les
 * résultats dans le prompt d'une complétion. On fait donc UN sous-appel dédié,
 * sur un petit modèle, dont la question EST la requête : la recherche reste un
 * tool explicite (le modèle appelant décide quand chercher) et son coût est une
 * ligne de ledger à part.
 *
 * COÛT — mesuré le 2026-07-27, même requête, même modèle :
 *   sans plugin : usage.cost = $0.0000070
 *   avec plugin : usage.cost = $0.0050820 (dont upstream_inference $0.0000820)
 * L'écart est exactement le forfait Exa ($0.005 par requête, jusqu'à 10
 * résultats). Autrement dit `usage.cost` INCLUT la recherche : la ligne
 * `ai_usage` écrite ici compte le vrai prix, sans calcul maison.
 *
 * Le moteur est épinglé à `exa` volontairement : laissé libre, OpenRouter route
 * vers la recherche NATIVE du provider (OpenAI, Anthropic, Google, xAI) dont le
 * prix est un passthrough variable. Exa = tarif plat, prévisible.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Clés `app_config` (réglables depuis /admin, cf. lib/ai-model-config.ts). */
export const WEB_SEARCH_MODEL_CONFIG_KEY = "web_search_model";
export const WEB_SEARCH_ENABLED_CONFIG_KEY = "web_search_enabled";

/** Forfait Exa par recherche, tel que facturé par OpenRouter (USD, indicatif). */
export const WEB_SEARCH_USD_PER_CALL = 0.005;

/** Résultats demandés — le forfait est le même de 1 à 10, seul le prompt grossit. */
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 10;

const MAX_QUERY_CHARS = 400;
const MAX_ANSWER_TOKENS = 800;
/** Extrait conservé par source (le modèle appelant a déjà la synthèse). */
const MAX_SNIPPET_CHARS = 700;
const TIMEOUT_MS = 45_000;

/**
 * Base de `seq` des lignes `web_search` d'un run : hors de la bande des appels
 * LLM (rounds 0..n) pour qu'un ordre d'affichage reste lisible. Les agents de
 * code utilisent déjà 1e9 pour `sandbox_compute` — d'où 1,5e9 ici.
 */
export const WEB_SEARCH_SEQ_BASE = 1_500_000_000;

/** Plafond de recherches par tour (une réponse Numo, un tour d'agent). */
export const MAX_WEB_SEARCHES_PER_TURN = 5;

export interface WebSource {
  url: string;
  title: string | null;
  snippet: string | null;
}

export type WebSearchOutcome =
  | {
      ok: true;
      answer: string;
      sources: WebSource[];
      usage: NormalizedUsage;
      model: string | null;
      generationId: string | null;
    }
  | { ok: false; error: string };

const SEARCH_SYSTEM_PROMPT = `You are a web research assistant. Search results for the user's query are provided to you.
Answer the query strictly from those results — never from memory, never with a guess.
Be factual, dense and short (a few sentences, or a compact list). Give exact figures, versions and dates when the sources carry them.
Name the source domain inline for any claim that matters.
If the results do not answer the query, say so plainly instead of filling the gap.`;

function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Réglages de la recherche web (cache app_config de 60 s). */
export async function getWebSearchSettings(): Promise<{
  enabled: boolean;
  model: string;
}> {
  const cfg = await getAppConfigValues([
    WEB_SEARCH_ENABLED_CONFIG_KEY,
    ...modelConfigKeys(WEB_SEARCH_MODEL_CONFIG_KEY),
  ]);
  return {
    // Absent = activé (miroir du fallback du registre admin).
    enabled: cfg[WEB_SEARCH_ENABLED_CONFIG_KEY]?.trim() !== "false",
    model: resolveFromValues(WEB_SEARCH_MODEL_CONFIG_KEY, cfg).model,
  };
}

/** Le drapeau admin seul — pour décider d'OFFRIR le tool ou non. */
export async function isWebSearchEnabled(): Promise<boolean> {
  return (await getWebSearchSettings()).enabled;
}

/**
 * Retire `web_search` d'un jeu de tools. Un tool coupé côté admin ne doit pas
 * être proposé au modèle : il le gaspillerait un round pour se voir refuser.
 * Générique sur la forme des deux registres (assistant et agent).
 */
export function withoutWebSearch<T extends { function: { name: string } }>(
  tools: T[]
): T[] {
  return tools.filter((t) => t.function.name !== "web_search");
}

interface CompletionResponse {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string; content?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

/**
 * UNE recherche web. Sous-appel OpenRouter non streamé : le plugin `web` cherche,
 * injecte les extraits, le petit modèle répond. Les sources sortent des
 * `annotations` (`url_citation`) de la réponse.
 */
export async function runWebSearch(params: {
  query: string;
  /** Clé OpenRouter (plateforme, ou BYOK OpenRouter de l'utilisateur). */
  apiKey: string;
  model: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<WebSearchOutcome> {
  const base = stripModelSuffix(params.model);
  const first = await attemptWebSearch(params);
  // Repli du raccourci de routage (MIN-263) : on ne rejoue que sur un REFUS —
  // un timeout rejoué mettrait la réponse de Numo à 90 s pour rien.
  if (first.outcome.ok || !first.refused || base === params.model) return first.outcome;
  console.warn(`[web-search] ${params.model} refused, retrying on ${base}`);
  return (await attemptWebSearch({ ...params, model: base })).outcome;
}

/** Un essai, et si c'est un échec, s'il vaut la peine d'être rejoué sans suffixe. */
async function attemptWebSearch(params: {
  query: string;
  apiKey: string;
  model: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<{ outcome: WebSearchOutcome; refused: boolean }> {
  const query = params.query.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return { outcome: { ok: false, error: "query is required" }, refused: false };

  const maxResults = Math.min(
    Math.max(Math.trunc(params.maxResults ?? DEFAULT_MAX_RESULTS), 1),
    MAX_RESULTS_CAP
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (params.signal) {
    if (params.signal.aborted) controller.abort();
    else params.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        ...aiChatProviderHeaders("openrouter", "Numo web search (minddy)"),
      },
      signal: controller.signal,
      body: JSON.stringify(
        translateAiChatRequest(
          {
            model: params.model,
            messages: [
              { role: "system", content: SEARCH_SYSTEM_PROMPT },
              { role: "user", content: query },
            ],
            maxOutputTokens: MAX_ANSWER_TOKENS,
            extensions: {
              plugins: [{ id: "web", engine: "exa", max_results: maxResults }],
            },
          },
          "openrouter",
        ),
      ),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        outcome: {
          ok: false,
          error: `web search failed (${response.status}): ${detail.slice(0, 200)}`,
        },
        refused: true,
      };
    }

    const body = (await response.json()) as CompletionResponse;
    if (body.error?.message) {
      return {
        outcome: { ok: false, error: `web search failed: ${body.error.message.slice(0, 200)}` },
        refused: true,
      };
    }

    const message = body.choices?.[0]?.message;
    const sources: WebSource[] = [];
    for (const annotation of message?.annotations ?? []) {
      const citation = annotation.url_citation;
      if (!citation?.url) continue;
      if (sources.some((s) => s.url === citation.url)) continue;
      sources.push({
        url: citation.url,
        title: citation.title?.trim() || null,
        snippet: citation.content ? cap(citation.content.trim(), MAX_SNIPPET_CHARS) : null,
      });
      if (sources.length >= maxResults) break;
    }

    return {
      outcome: {
        ok: true,
        answer: (message?.content ?? "").trim(),
        sources,
        usage: parseOpenRouterUsage(body.usage),
        model: body.model ?? params.model,
        generationId: body.id ?? null,
      },
      refused: false,
    };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return {
      outcome: {
        ok: false,
        error: aborted ? "web search timed out" : `web search failed: ${(err as Error).message}`,
      },
      refused: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * La recherche telle que l'appellent les tools (Numo chat, @Numo en commentaire,
 * agents de code) : réglages admin, appel, écriture de la ligne `web_search` au
 * ledger, résultat prêt à renvoyer au modèle. Même forme de retour que les autres
 * tools des deux boucles (`{ result, success }`).
 *
 * L'imputation vient de l'appelant (`billTo`) : la recherche est un sous-appel du
 * tour, elle se facture à qui se facture le tour. Le coût enregistré inclut le
 * forfait de recherche.
 */
export async function runWebSearchTool(params: {
  query: string;
  /** Repli historique/tests. Avec un user, la clé et le modèle se résolvent par surface. */
  apiKey?: string;
  userId?: string;
  surface?: AiSurface;
  runId: string;
  seq: number;
  maxResults?: number;
  billTo: AiUsageBillTo;
  projectId?: string | null;
  conversationId?: string | null;
  signal?: AbortSignal;
}): Promise<{ result: unknown; success: boolean }> {
  const settings = await getWebSearchSettings();
  if (!settings.enabled) {
    return {
      result: { error: "Web search is disabled on this instance." },
      success: false,
    };
  }

  const runtime = params.userId
    ? await resolveAiRuntime({
        userId: params.userId,
        modelKey: WEB_SEARCH_MODEL_CONFIG_KEY,
        surface: params.surface ?? "assistant",
      }).catch(() => null)
    : null;

  // Le plugin `web` est une capacité OpenRouter, pas une extension du standard
  // OpenAI-compatible. Une clé native reste donc sur le quota Minddy pour CE
  // sous-appel ; une clé OpenRouter, elle, utilise bien son modèle par feature.
  const byokOpenRouter = runtime?.provider === "openrouter" ? runtime : null;
  const apiKey = byokOpenRouter?.apiKey ?? params.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { result: { error: "Web search is not available here." }, success: false };
  }

  const outcome = await runWebSearch({
    query: params.query,
    apiKey,
    model: byokOpenRouter?.model ?? settings.model,
    maxResults: params.maxResults,
    signal: params.signal,
  });

  if (!outcome.ok) return { result: { error: outcome.error }, success: false };

  await recordAiUsage({
    runId: params.runId,
    seq: params.seq,
    feature: "web_search",
    provider: "openrouter",
    keyMode: byokOpenRouter?.mode ?? "platform",
    model: outcome.model,
    generationId: outcome.generationId,
    promptTokens: outcome.usage.promptTokens,
    completionTokens: outcome.usage.completionTokens,
    totalTokens: outcome.usage.totalTokens,
    cost: outcome.usage.cost,
    billTo: params.billTo,
    projectId: params.projectId ?? null,
    conversationId: params.conversationId ?? null,
  });

  return {
    result: {
      query: params.query.trim().slice(0, MAX_QUERY_CHARS),
      answer: outcome.answer,
      sources: outcome.sources,
    },
    success: true,
  };
}
