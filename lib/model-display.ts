import { AGENT_ALLOWED_MODELS } from "@/lib/agent-models";

/**
 * Readable display of an AI model (OpenRouter id `provider/model`) — MIN-46.
 * Formatted full name ("deepseek/deepseek-v4-flash" → "DeepSeek V4 Flash") and
 * standardized provider slug for logos `@lobehub/icons`. Client + server.
 */

/** OpenRouter provider slug → @lobehub/icons provider key (where they diverge). */
const PROVIDER_ALIASES: Record<string, string> = {
  "meta-llama": "meta",
  mistralai: "mistral",
  "x-ai": "xai",
  moonshotai: "moonshot",
  "z-ai": "zhipu",
  "amazon": "bedrock",
};

/** Case of brands/acronyms after naive title-case. */
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

/** Curated labels from the allowlist (priority over automatic formatting). */
const KNOWN_LABELS = new Map(AGENT_ALLOWED_MODELS.map((m) => [m.id, m.label]));

/** Remove OpenRouter variant suffixes (`:free`, `:nitro`, `@…` routing). */
function baseId(modelId: string): string {
  return modelId.split(":")[0].split("@")[0];
}

/** Provider slug (key @lobehub/icons) from an id `provider/model`. */
export function providerFromModel(modelId: string | null | undefined): string {
  if (!modelId) return "";
  const provider = baseId(modelId).split("/")[0]?.toLowerCase() ?? "";
  return PROVIDER_ALIASES[provider] ?? provider;
}

/** Initial capitalization, then case correction of brands and acronyms. */
function capitalize(word: string): string {
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  return TOKEN_FIXUPS[cap] ?? cap;
}

function formatToken(tok: string): string {
  if (!tok) return tok;
  /**
 * VERSION token ("k3", "v4", "qwen3.5"): the number remains as is,
 * but the letters preceding it are capitalized like everywhere else.
 * They didn't, and "moonshotai/kimi-k3" read "Kimi k3" —
 * the case "v4" was treated alone, hard, and it was the only one.
 *
 * The exception is the OpenAI reasoning family: "o3" is written in lowercase
 *, in OpenAI as in the OpenRouter index, which names it
 * "OpenAI: o3 Pro". This is indeed a brand exception and not a rule on
 * the prefixes of a letter: “k3” and “r1” are capitalized.
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
 * Readable full name of a template. Uses the curated label of the allowlist if
 * known, otherwise formats the slug ("gemini-2.5-flash" → "Gemini 2.5 Flash").
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
