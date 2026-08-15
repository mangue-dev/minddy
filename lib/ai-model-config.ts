/**
 * The AI knobs an admin can tune from the dashboard (`/admin`) — the single
 * source of truth shared by the admin API (allowed keys + validation) and the
 * admin UI (fields to render). Each entry maps 1:1 to a row in the `app_config`
 * key/value table (read/written via `lib/server/app-config.ts`).
 *
 * NO server-only imports here: this module is pulled into the client dashboard.
 * Keep it a plain data registry.
 *
 * `fallback` is the value used at runtime when the row is unset — the literal
 * written in code, mirrored by the migration `insert` for the keys that have one
 * (the newer keys have no seeded row at all). It is surfaced in the UI as the
 * placeholder so an admin sees what "empty" resolves to. **This is the ONLY
 * place a model id is written in code**: every caller reads its own from here
 * via `aiModelFallback` instead of redeclaring the constant on its side.
 */
import { getProviderDefaultModel } from "@/lib/agent-providers";
import { AGENT_PROVIDERS } from "@/lib/agent-providers";
import { BYOK_MODEL_KEYS, byokFeatureDefaultModelKey } from "@/lib/ai-surfaces";
import { DEFAULT_SUBAGENT_FAVORITES } from "@/lib/subagent-favorites";
import { DEFAULT_RECOMMENDED_MODELS } from "@/lib/recommended-models";

/**
 * `model`       → id `provider/model` choisi dans le catalogue de la clé plateforme ;
 * `modelId`     → id saisi tel quel, dans le namespace d'un provider BYOK (`gpt-…`,
 *                 `claude-…`) : le catalogue plateforme y écrirait des ids invalides ;
 * `favorites`   → liste JSON de `FavoriteSubagentModel` ;
 * `recommended` → liste JSON d'ids, dans l'ordre d'affichage du picker ;
 * `flag`        → interrupteur "true"/"false".
 */
export type AiConfigKind = "model" | "modelId" | "favorites" | "recommended" | "flag";

export type AiConfigGroup = "assistant" | "automations" | "agent" | "byok" | "voice" | "feedback";

export interface AiConfigField {
  /** `app_config` key. */
  key: string;
  kind: AiConfigKind;
  /** Value used at runtime when the row is unset (the literal written in code). */
  fallback: string;
  /** Section the field is grouped under in the dashboard. */
  group: AiConfigGroup;
  /**
   * Coupe le suffixe OpenRouter (MIN-263) sur un champ `model` qui, sinon,
   * en accepterait un. Voir `MODEL_SUFFIXES` pour la raison de chaque exclusion.
   */
  noSuffix?: true;
  /** Libellé technique généré pour les défauts provider × feature. */
  adminLabel?: string;
}

/**
 * Raccourcis de routage OpenRouter (MIN-263) : collés à l'id du modèle après
 * deux points, ils ordonnent les providers de CE modèle sans en changer un
 * seul. Universels — ils marchent sur n'importe quel id.
 *
 *   `nitro`  → providers triés par débit (le plus rapide d'abord) ;
 *   `floor`  → triés par prix (le moins cher d'abord) ;
 *   `exacto` → qualité d'abord, providers dont le tool-calling est fiable.
 *
 * `:online` existe aussi et n'est DÉLIBÉRÉMENT pas offert : il allume la
 * recherche web payante (~$0,005 par appel, forfait Exa) sur n'importe quel
 * appel, alors que la recherche de minddy est un tool explicite dont le coût
 * est une ligne de ledger à part (`lib/server/web-search.ts`). Un suffixe qui
 * multiplie par mille le prix d'un titre de conversation n'a rien à faire dans
 * une liste déroulante.
 */
export const MODEL_SUFFIXES = ["nitro", "floor", "exacto"] as const;

export type ModelSuffix = (typeof MODEL_SUFFIXES)[number];

export function isModelSuffix(value: string): value is ModelSuffix {
  return (MODEL_SUFFIXES as readonly string[]).includes(value);
}

export const AI_MODEL_CONFIG_FIELDS: AiConfigField[] = [
  // Assistant Numo + helpers texte
  { key: "assistant_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "fallback_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "smart_assign_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  {
    key: "automation_agent_model",
    kind: "model",
    fallback: "deepseek/deepseek-v4-flash",
    group: "automations",
    noSuffix: true,
  },
  // Smart-fill (lib/server/smart-fill.ts, MIN-260) : UN appel par ticket créé à
  // la main, sur son seul titre + sa description, et qui rend priorité, effort,
  // catégories et objectif. Il tient la personne devant son écran (la ligne
  // n'est insérée qu'une fois remplie) : il lui faut donc un modèle RAPIDE, pas
  // un modèle malin — la tâche est un rangement, pas un raisonnement. Le drapeau
  // le coupe partout d'un coup, et le formulaire retombe sur la saisie à la main.
  { key: "smart_fill_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "smart_fill_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Titre d'une conversation Numo (lib/server/assistant/title.ts) : un appel de
  // quelques dizaines de tokens par conversation neuve — un petit modèle suffit,
  // et c'est exactement le genre d'appel où un gros ne se justifie pas.
  { key: "conversation_title_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Correspondance des colonnes d'un import CSV (lib/server/import-mapping-ai.ts) :
  // UN appel par fichier déposé, jamais par ligne — le modèle ne voit qu'un
  // résumé des colonnes. C'est le prix d'un import qui ne perd rien, et le
  // drapeau le coupe partout d'un coup (l'import retombe alors sur ses tables
  // d'alias, comme avant).
  { key: "import_map_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "import_map_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Découpe d'un brief en objectifs + tickets (lib/server/brief-to-issues.ts,
  // MIN-172) : UN appel par brief collé, jamais par ticket — le modèle rend le
  // lot entier d'un coup, ce que vingt `create_issue` en file ne feraient ni au
  // même prix ni à la même latence. Le drapeau la coupe partout d'un coup :
  // l'amorce d'un projet neuf retombe alors sur l'import et la saisie à la main.
  { key: "brief_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "brief_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Recherche web (tool `web_search` de Numo et des agents) : le modèle qui lit
  // les résultats du plugin OpenRouter. Le drapeau la coupe partout d'un coup.
  { key: "web_search_enabled", kind: "flag", fallback: "true", group: "assistant" },
  { key: "web_search_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Agent de code cloud (MIN-46) — défaut racine, surchargé par user puis par run.
  // Pas de suffixe (MIN-263) : le modèle d'un run est écrit sur sa ligne
  // `agent_runs` et retourne pendant des dizaines de rounds, parfois depuis la
  // microVM — le repli « rejouer sans le `:` » y voudrait dire réécrire le
  // modèle du run en vol, ce qui est un autre chantier.
  {
    key: "agent_model",
    kind: "model",
    fallback: "deepseek/deepseek-v4-flash",
    group: "agent",
    noSuffix: true,
  },
  // Review d'une PR par Numo (MIN-141). DÉLIBÉRÉMENT plus cher que `agent_model` :
  // relire du code avec le modèle qui vient de l'écrire ne produit qu'un second
  // avis identique — la valeur d'une review vient d'un autre regard. Un appel par
  // clic, jamais automatique : c'est ce qui rend le tarif tenable.
  // Pas de suffixe non plus : même boucle, même run persisté que `agent_model`.
  {
    key: "pr_review_model",
    kind: "model",
    fallback: "anthropic/claude-sonnet-5",
    group: "agent",
    noSuffix: true,
  },
  // Favoris servis au prompt du parent pour `spawn_agent` (MIN-112).
  {
    key: "agent_subagent_favorites",
    kind: "favorites",
    fallback: JSON.stringify(DEFAULT_SUBAGENT_FAVORITES),
    group: "agent",
  },
  // Les modèles CONSEILLÉS, montrés en tête du picker à l'ouverture
  // (cf. lib/recommended-models.ts). À ne pas confondre avec les favoris
  // ci-dessus, qui sont du PROMPT : ceux-là sont de l'UI, lus par un humain qui
  // choisit sur quoi lancer son agent. Ils ne restreignent rien — le catalogue
  // entier reste à une recherche.
  {
    key: "recommended_models",
    kind: "recommended",
    fallback: JSON.stringify(DEFAULT_RECOMMENDED_MODELS),
    group: "agent",
  },
  // Défauts frontier des providers BYOK : ce que tourne un compte qui a posé sa
  // clé sans jamais choisir de modèle. Ids NATIFS du provider (pas `vendor/model`).
  { key: "byok_default_model_openai", kind: "modelId", fallback: byokFallback("openai"), group: "byok" },
  { key: "byok_default_model_anthropic", kind: "modelId", fallback: byokFallback("anthropic"), group: "byok" },
  { key: "byok_default_model_google", kind: "modelId", fallback: byokFallback("google"), group: "byok" },
  // Voix (dictée → ticket)
  { key: "dictate_model", kind: "model", fallback: "google/gemini-3.1-flash-lite", group: "voice" },
  { key: "transcription_model", kind: "model", fallback: "openai/whisper-large-v3", group: "voice" },
  // Démo de dictée de la landing (MIN-150) : le seul appel IA qu'on offre à un
  // visiteur SANS COMPTE. Le drapeau la coupe partout d'un coup, sans
  // déploiement — c'est le garde-fou du dernier recours si l'endpoint ouvert
  // se fait tirer dessus (les autres, par IP et par jour, sont dans la route).
  { key: "demo_dictation_enabled", kind: "flag", fallback: "true", group: "voice" },
  // Board de feedback
  { key: "feedback_classify_enabled", kind: "flag", fallback: "true", group: "feedback" },
  // Dicter un retour, au board public comme dans le dashboard. Elle tourne sur
  // les deux modèles de la voix (`transcription_model` puis `dictate_model`) :
  // c'est la même prise, rangée dans d'autres champs. Le drapeau la coupe
  // partout d'un coup — le micro disparaît, l'écriture reste.
  { key: "feedback_voice_enabled", kind: "flag", fallback: "true", group: "feedback" },
  { key: "feedback_analysis_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  { key: "feedback_embedding_model", kind: "model", fallback: "openai/text-embedding-3-small", group: "feedback" },
];

/**
 * Matrice provider × type d'appel. OpenRouter est absent : son défaut est, par
 * définition, le réglage plateforme du même type. Les champs vides d'un
 * provider générique obligent le compte à choisir un id de son endpoint.
 */
for (const provider of AGENT_PROVIDERS.filter((entry) => entry.id !== "openrouter")) {
  for (const modelKey of BYOK_MODEL_KEYS) {
    let fallback = provider.defaultModel ?? "";
    if (modelKey === "transcription_model") {
      fallback = provider.id === "openai" ? "gpt-4o-mini-transcribe" : "";
    } else if (modelKey === "feedback_embedding_model") {
      fallback =
        provider.id === "openai"
          ? "text-embedding-3-small"
          : provider.id === "google"
            ? "gemini-embedding-001"
            : "";
    }
    AI_MODEL_CONFIG_FIELDS.push({
      key: byokFeatureDefaultModelKey(provider.id, modelKey),
      kind: "modelId",
      fallback,
      group: "byok",
      adminLabel: `${provider.label} · ${modelKey}`,
    });
  }
}

/** Display order of the dashboard sections. */
export const AI_MODEL_CONFIG_GROUPS: AiConfigGroup[] = [
  "assistant",
  "automations",
  "agent",
  "byok",
  "voice",
  "feedback",
];

/**
 * Un champ accepte-t-il un suffixe de routage ? Les modèles, sauf ceux marqués
 * `noSuffix`. Les ids BYOK (`kind: "modelId"`) vivent dans le namespace d'un
 * provider natif, où les raccourcis OpenRouter n'existent pas.
 */
export function isSuffixableField(field: AiConfigField): boolean {
  return field.kind === "model" && !field.noSuffix;
}

/**
 * Clé `app_config` du suffixe d'un réglage de modèle. Elle est DÉRIVÉE, pas
 * déclarée : un champ `model` ajouté au registre gagne son suffixe sans qu'on
 * ait une seconde entrée à tenir en face.
 */
export function modelSuffixKey(key: string): string {
  return `${key}_suffix`;
}

/** Les clés de suffixe du registre, dans l'ordre de leurs champs. */
export const AI_MODEL_SUFFIX_KEYS: string[] = AI_MODEL_CONFIG_FIELDS.filter(
  isSuffixableField,
).map((f) => modelSuffixKey(f.key));

/** Cette clé est-elle le suffixe d'un champ du registre ? */
export function isModelSuffixKey(key: string): boolean {
  return AI_MODEL_SUFFIX_KEYS.includes(key);
}

/**
 * Colle un suffixe de routage à un id de modèle. No-op quand il n'y a pas de
 * suffixe, quand il n'est pas reconnu (une ligne `app_config` écrite à la main
 * ne doit pas casser l'appel), ou quand l'id en porte DÉJÀ un : un admin qui a
 * saisi `…:free` en texte libre a choisi une variante, pas un ordre de routage,
 * et `…:free:nitro` n'existe pas.
 */
export function applyModelSuffix(model: string, suffix: string | null | undefined): string {
  const base = model.trim();
  const wanted = (suffix ?? "").trim();
  if (!base || !wanted || !isModelSuffix(wanted)) return base;
  if (base.includes(":")) return base;
  return `${base}:${wanted}`;
}

/**
 * L'id nu, sans son suffixe de ROUTAGE — ce sur quoi on rejoue après un échec.
 *
 * On ne coupe que `:nitro`, `:floor`, `:exacto`. Les deux points servent aussi
 * à désigner une VARIANTE de modèle (`…:free`, `…:thinking`), qui est un autre
 * modèle, pas un ordre de routage : la couper ferait rejouer un refus sur la
 * variante payante, en silence. `applyModelSuffix` refuse déjà de coller un
 * raccourci sur un id qui porte un `:` — les deux moitiés disent la même chose.
 */
export function stripModelSuffix(model: string): string {
  const cut = model.lastIndexOf(":");
  if (cut < 0) return model;
  return isModelSuffix(model.slice(cut + 1)) ? model.slice(0, cut) : model;
}

/** Fast membership check for the admin API (write allowlist). */
export const AI_MODEL_CONFIG_KEYS = new Set([
  ...AI_MODEL_CONFIG_FIELDS.map((f) => f.key),
  ...AI_MODEL_SUFFIX_KEYS,
]);

export function getAiConfigField(key: string): AiConfigField | undefined {
  return AI_MODEL_CONFIG_FIELDS.find((f) => f.key === key);
}

export function isFlagKey(key: string): boolean {
  return getAiConfigField(key)?.kind === "flag";
}

/**
 * Défaut d'un réglage, à servir quand la ligne `app_config` est absente ou vide.
 *
 * Lève sur une clé inconnue : c'est une faute de programmation, pas un cas de
 * production — mieux vaut casser au premier appel que router silencieusement du
 * trafic vers `undefined`.
 */
export function aiModelFallback(key: string): string {
  const field = getAiConfigField(key);
  if (!field) throw new Error(`Unknown AI config key: ${key}`);
  return field.fallback;
}

/** Clé `app_config` du défaut frontier d'un provider BYOK. */
export function byokDefaultModelKey(providerId: string): string {
  return `byok_default_model_${providerId}`;
}

/** Défaut frontier écrit dans le registre des providers (`lib/agent-providers.ts`). */
function byokFallback(providerId: string): string {
  const model = getProviderDefaultModel(providerId);
  if (!model) throw new Error(`Provider ${providerId} has no default model`);
  return model;
}
