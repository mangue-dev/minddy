/**
 * Favoris de sous-agents (MIN-112) : le type, le repli produit et le parseur.
 *
 * Partagé par les deux bouts de la chaîne — le serveur, qui les sert au prompt du
 * parent (`lib/server/agent/subagent-config.ts`), et le dashboard admin, qui les
 * édite (`components/admin/admin-models-dashboard.tsx`). Le parseur est le MÊME
 * des deux côtés : l'API refuse à l'écriture exactement ce que le runtime
 * ignorerait à la lecture.
 *
 * AUCUN import server-only ici : ce module est tiré dans le client.
 */

export type SubagentThinkingEffort = "low" | "medium" | "high";

export const SUBAGENT_THINKING_EFFORTS: readonly SubagentThinkingEffort[] = [
  "low",
  "medium",
  "high",
];

export function isSubagentThinkingEffort(value: unknown): value is SubagentThinkingEffort {
  return (
    typeof value === "string" &&
    (SUBAGENT_THINKING_EFFORTS as readonly string[]).includes(value)
  );
}

/** Un modèle de la liste « Favorites for sub-agents » (réglable par `app_config`). */
export interface FavoriteSubagentModel {
  /** Id exact du fournisseur, tel qu'OpenRouter le connaît. */
  id: string;
  /** Nom lisible — l'agent peut référencer le modèle par là. */
  label: string;
  /** Use-case conseillé, servi dans le prompt système du parent. */
  use_case: string;
  /** Niveau de réflexion conseillé pour ce modèle (indicatif). */
  thinking_effort?: SubagentThinkingEffort;
}

/**
 * Repli écrit EN CODE, en ANGLAIS — c'est du prompt, pas de l'UI. Un `use_case`
 * écrit pour un humain (« Économique · défaut », le `hint` du picker) ne dit rien
 * à un agent qui choisit un modèle pour une exploration : ces phrases-là sont
 * écrites pour être LUES PAR LE MODÈLE.
 *
 * Aucune ligne `app_config` n'est semée pour cette clé : tant que l'admin n'a
 * rien réglé, c'est cette liste qui tourne.
 */
export const DEFAULT_SUBAGENT_FAVORITES: FavoriteSubagentModel[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    use_case:
      "Cheap and fast. Default choice for exploration, greps, reading a lot of files, and any mechanical task.",
    thinking_effort: "low",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    use_case:
      "Balanced and strong at code. Use it when the sub-agent has to WRITE code you will not re-read line by line.",
    thinking_effort: "medium",
  },
  {
    id: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    use_case:
      "Most capable, most expensive. Only for genuinely hard analysis or a change with subtle logic.",
    thinking_effort: "high",
  },
];

/** Valide une entrée. Une entrée cassée est ignorée, jamais fatale. */
export function parseSubagentFavorite(raw: unknown): FavoriteSubagentModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : id;
  const useCase = typeof o.use_case === "string" ? o.use_case.trim() : "";
  const effort = typeof o.thinking_effort === "string" ? o.thinking_effort.trim() : "";
  return {
    id,
    label,
    use_case: useCase,
    ...(isSubagentThinkingEffort(effort) ? { thinking_effort: effort } : {}),
  };
}

/**
 * Liste lisible tirée de la valeur `app_config`, ou `null` quand il n'y a RIEN
 * d'exploitable (vide, JSON illisible, pas un tableau, aucune entrée valide).
 *
 * `null` est un verdict, pas une erreur : le serveur y répond par le repli — un
 * réglage cassé ne doit pas tuer un run — et l'API admin par un 400, pour que
 * personne n'enregistre une liste qui ne servira jamais.
 */
export function parseSubagentFavorites(
  raw: string | null | undefined,
): FavoriteSubagentModel[] | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const favorites = parsed
    .map(parseSubagentFavorite)
    .filter((f): f is FavoriteSubagentModel => f !== null);
  return favorites.length > 0 ? favorites : null;
}
