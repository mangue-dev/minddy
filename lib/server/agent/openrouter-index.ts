import "server-only";

import type { ModelPricing } from "@/lib/model-multiplier";

/**
 * L'index OpenRouter : UNE lecture de `/models`, mise en cache au niveau du
 * process, d'où sortent toutes les questions qu'on pose à un modèle avant de
 * l'employer.
 *
 * Trois lecteurs, un seul aller-retour :
 *  - le catalogue du picker (`models-catalog.ts`) — nom d'affichage + filtre
 *    tool-calling ;
 *  - la boucle de l'agent (`model.ts`) — fenêtre de contexte (seuil de
 *    compaction) et entrée image (MIN-111) ;
 *  - le plafond de plan (`model-plan.ts`) — les prix, donc le multiplicateur.
 * Chacun tirait sa propre requête vers la même URL avant : trois caches à durée
 * de vie différente, qui pouvaient se contredire sur le même modèle.
 *
 * Best-effort de bout en bout : un échec laisse l'index tel quel (périmé, ou
 * vide) et les appelants retombent sur leur défaut conservateur. Le catalogue
 * public d'OpenRouter s'ouvre sans clé — le `Bearer` n'est qu'une politesse
 * d'attribution quand on en a une.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Même durée que l'ancien cache du catalogue : la liste bouge lentement. */
const TTL_MS = 60 * 60 * 1000;

export interface OpenRouterModelInfo {
  id: string;
  /** Nom d'affichage publié par OpenRouter (`name`), sinon l'id. */
  name: string;
  contextLength: number | null;
  /** `architecture.input_modalities` contient `image` → on peut lui MONTRER une maquette. */
  imageInput: boolean;
  /**
   * `supported_parameters` contient `tools`. Un modèle qui ne déclare AUCUN
   * paramètre est réputé compatible : l'absence d'annonce n'est pas un refus.
   */
  tools: boolean;
  /** Prix publiés, convertis au million de tokens. `null` si illisibles. */
  pricing: ModelPricing | null;
}

const index = new Map<string, OpenRouterModelInfo>();
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * `"0.0000012"` (USD/token) → 1.2 (USD/Mtok). Tolère un nombre déjà typé.
 *
 * L'arrondi à 6 décimales n'est pas de la coquetterie : `1e-7 * 1e6` ne fait pas
 * exactement 0,1 en flottant, et ces miettes se propageaient jusque dans le
 * multiplicateur affiché. Au millionième de dollar près, on est déjà bien
 * en-dessous de ce que le moindre prix publié distingue.
 */
function perMillionTokens(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1e6) / 1e6 : null;
}

async function fetchIndex(apiKey?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(MODELS_URL, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      context_length?: number;
      architecture?: { input_modalities?: string[] };
      supported_parameters?: string[];
      pricing?: { prompt?: string | number; completion?: string | number };
    }>;
  };
  const next = new Map<string, OpenRouterModelInfo>();
  for (const m of body.data ?? []) {
    if (!m.id) continue;
    const input = perMillionTokens(m.pricing?.prompt);
    const output = perMillionTokens(m.pricing?.completion);
    next.set(m.id, {
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length && m.context_length > 0 ? m.context_length : null,
      imageInput: (m.architecture?.input_modalities ?? []).includes("image"),
      tools: !m.supported_parameters?.length || m.supported_parameters.includes("tools"),
      pricing:
        input != null && output != null
          ? { inputUsdPerMTok: input, outputUsdPerMTok: output }
          : null,
    });
  }
  // Remplacement atomique : un index à moitié réécrit ferait passer un modèle
  // pour inconnu le temps de la boucle — donc pour « prix inconnu », donc autorisé.
  if (next.size > 0) {
    index.clear();
    for (const [id, info] of next) index.set(id, info);
    loadedAt = Date.now();
  }
}

/**
 * Charge l'index s'il est absent ou périmé. Ne lève jamais, et déduplique les
 * appels concurrents : au démarrage d'une invocation, le catalogue, la boucle et
 * le plafond le demandent tous les trois dans la même milliseconde.
 */
export async function loadOpenRouterIndex(apiKey?: string): Promise<void> {
  if (index.size > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (!inFlight) {
    inFlight = fetchIndex(apiKey)
      .catch((err) => {
        console.error("[openrouter-index] load failed:", (err as Error).message);
      })
      .finally(() => {
        inFlight = null;
      });
  }
  await inFlight;
}

/**
 * Ce que l'index sait d'un modèle, ou `null`.
 *
 * Le repli sur l'id NU (`anthropic/claude-opus-5:nitro` → `anthropic/claude-opus-5`)
 * n'est pas une commodité d'affichage : les suffixes de routage d'OpenRouter
 * (`:nitro`, `:floor`, `:online`…) désignent le même modèle au même prix, et sans
 * ce repli il suffirait d'en coller un pour rendre un modèle « de prix inconnu »,
 * donc hors plafond. Les variantes qui ont un vrai prix à elles (`:free`) sont
 * listées telles quelles et gagnent par l'égalité exacte, testée d'abord.
 */
export async function getOpenRouterModelInfo(
  model: string,
  apiKey?: string,
): Promise<OpenRouterModelInfo | null> {
  await loadOpenRouterIndex(apiKey);
  const exact = index.get(model);
  if (exact) return exact;
  const colon = model.lastIndexOf(":");
  return colon > 0 ? index.get(model.slice(0, colon)) ?? null : null;
}

/** Tout le catalogue, dans l'ordre où OpenRouter le publie. Vide si illisible. */
export async function listOpenRouterIndex(apiKey?: string): Promise<OpenRouterModelInfo[]> {
  await loadOpenRouterIndex(apiKey);
  return [...index.values()];
}
