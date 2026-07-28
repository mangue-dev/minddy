/**
 * Contenu MULTIMODAL des messages de l'agent de code (MIN-111).
 *
 * Jusqu'ici tout le harness supposait `content: string` : l'agent lisait la
 * DESCRIPTION d'une maquette, jamais la maquette. Un message peut désormais porter
 * un tableau de PARTIES au format OpenAI/OpenRouter (texte + image) — ce qui
 * traverse le checkpoint, la compaction, l'élagage et le cache de prompt.
 *
 * Module PUR (comme compact.ts / prune.ts / caching.ts) : ces helpers sont le SEUL
 * endroit qui sait lire un contenu quelle que soit sa forme. Toute lecture de
 * `m.content` ailleurs dans le harness passe par `textOf` / `contentChars`.
 */

/** Une partie de contenu, au format des content parts OpenAI/OpenRouter. */
export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Le contenu d'un message, sous ses deux formes. */
export type AgentMessageContent = string | AgentContentPart[] | null | undefined;

/**
 * Une image renvoyée par un tool, prête à devenir une partie `image_url`.
 * `url` est une DATA URL (`data:image/png;base64,…`), jamais une URL signée :
 * l'historique EST le checkpoint et il est rejoué des heures plus tard, quand
 * l'URL signée a expiré depuis longtemps.
 */
export interface AgentToolImage {
  url: string;
  /** Nom du fichier — pour les traces et les events, jamais envoyé au modèle. */
  name?: string;
}

/**
 * Coût de contexte attribué à UNE image, en « caractères » (≈ 1 000 tokens au
 * ratio 4:1 de compact.ts). La taille de la data URL n'a AUCUN rapport avec le
 * prix : une maquette de 1 Mo en base64 vaut ~1 000 tokens chez le modèle, pas
 * 250 000. Compter les octets déclencherait une compaction à chaque round dès la
 * première maquette ouverte.
 */
export const IMAGE_PART_CHARS = 4000;

/** Le texte d'un contenu, quelle que soit sa forme (parties image ignorées). */
export function textOf(content: AgentMessageContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Nombre de parties image d'un contenu (0 pour une chaîne). */
export function imageCount(content: AgentMessageContent): number {
  if (!Array.isArray(content)) return 0;
  return content.reduce((n, p) => (p.type === "image_url" ? n + 1 : n), 0);
}

/** Octets « de contexte » d'un contenu — proxy pour les images (cf. IMAGE_PART_CHARS). */
export function contentChars(content: AgentMessageContent): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let chars = 0;
  for (const p of content) {
    chars += p.type === "text" ? p.text.length : IMAGE_PART_CHARS;
  }
  return chars;
}

/**
 * Retire les parties image d'un contenu et les remplace par UNE note texte.
 * Renvoie le contenu inchangé (même référence) s'il n'y a pas d'image — l'appelant
 * s'en sert pour savoir s'il a quelque chose à réécrire.
 */
export function stripImages(
  content: AgentMessageContent,
  note: string,
): AgentMessageContent {
  if (imageCount(content) === 0) return content;
  const kept = (content as AgentContentPart[]).filter((p) => p.type !== "image_url");
  return [...kept, { type: "text" as const, text: note }];
}
