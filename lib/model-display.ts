import { AGENT_ALLOWED_MODELS } from "@/lib/agent-models";

/**
 * Affichage lisible d'un modèle IA (id OpenRouter `provider/model`) — MIN-46.
 * Nom complet formaté ("deepseek/deepseek-v4-flash" → "DeepSeek V4 Flash") et
 * slug de provider normalisé pour les logos `@lobehub/icons`. Client + serveur.
 */

/** Slug provider OpenRouter → clé provider @lobehub/icons (là où ils divergent). */
const PROVIDER_ALIASES: Record<string, string> = {
  "meta-llama": "meta",
  mistralai: "mistral",
  "x-ai": "xai",
  moonshotai: "moonshot",
  "z-ai": "zhipu",
  "amazon": "bedrock",
};

/** Casse des marques/acronymes après title-case naïf. */
const TOKEN_FIXUPS: Record<string, string> = {
  Gpt: "GPT",
  Deepseek: "DeepSeek",
  Glm: "GLM",
  Xai: "xAI",
  Ai: "AI",
  Oss: "OSS",
  Vl: "VL",
  Qwq: "QwQ",
  Llm: "LLM",
};

/** Labels curatés de l'allowlist (priorité sur le formatage automatique). */
const KNOWN_LABELS = new Map(AGENT_ALLOWED_MODELS.map((m) => [m.id, m.label]));

/** Retire les suffixes de variante OpenRouter (`:free`, `:nitro`, routage `@…`). */
function baseId(modelId: string): string {
  return modelId.split(":")[0].split("@")[0];
}

/** Slug du provider (clé @lobehub/icons) depuis un id `provider/model`. */
export function providerFromModel(modelId: string | null | undefined): string {
  if (!modelId) return "";
  const provider = baseId(modelId).split("/")[0]?.toLowerCase() ?? "";
  return PROVIDER_ALIASES[provider] ?? provider;
}

/** Majuscule initiale, puis correction de casse des marques et acronymes. */
function capitalize(word: string): string {
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  return TOKEN_FIXUPS[cap] ?? cap;
}

function formatToken(tok: string): string {
  if (!tok) return tok;
  /**
   * Token de VERSION (« k3 », « v4 », « qwen3.5 ») : le numéro reste tel quel,
   * mais les lettres qui le précèdent se capitalisent comme partout ailleurs.
   * Elles ne le faisaient pas, et « moonshotai/kimi-k3 » se lisait « Kimi k3 » —
   * le cas « v4 » était traité seul, en dur, et c'était le seul.
   *
   * L'exception est la famille de raisonnement d'OpenAI : « o3 » s'écrit en
   * minuscule, chez OpenAI comme dans l'index OpenRouter, qui la nomme
   * « OpenAI: o3 Pro ». C'est bien une exception de marque et non une règle sur
   * les préfixes d'une lettre : « k3 » et « r1 » se capitalisent, eux.
   */
  const versioned = /^([a-z]+)([\d.].*)$/i.exec(tok);
  if (versioned) {
    const [, letters, version] = versioned;
    if (letters.toLowerCase() === "o") return `o${version}`;
    return `${capitalize(letters)}${version}`;
  }
  // Un token qui COMMENCE par un chiffre se garde intact : « 4o » de GPT-4o,
  // « 70b » d'un Llama, « 2.5 » d'un Gemini.
  if (/\d/.test(tok)) return tok;
  return capitalize(tok);
}

/**
 * Nom complet lisible d'un modèle. Utilise le label curaté de l'allowlist si
 * connu, sinon formate le slug ("gemini-2.5-flash" → "Gemini 2.5 Flash").
 */
export function formatModelName(modelId: string | null | undefined): string {
  if (!modelId) return "";
  const known = KNOWN_LABELS.get(modelId) ?? KNOWN_LABELS.get(baseId(modelId));
  if (known) return known;
  const base = baseId(modelId);
  const slug = base.includes("/") ? base.slice(base.indexOf("/") + 1) : base;
  const name = slug.split(/[-_]/).map(formatToken).join(" ").trim();
  return name || modelId;
}
