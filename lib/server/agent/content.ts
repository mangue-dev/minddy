/**
 * MULTIMODAL content of code agent messages (MIN-111).
 *
 * Until now all the harness assumed `content: string`: the agent read the
 * DESCRIPTION of a model, never the model. A message can now carry
 * an array of PARTS in OpenAI/OpenRouter format (text + image) — which
 * passes through the checkpoint, compaction, pruning and prompt cache.
 *
 * PUR module (like compact.ts / prune.ts / caching.ts): these helpers are the ONLY
 * place that can read content whatever its form. Any reading of
 * `m.content` elsewhere in the harness goes through `textOf` / `contentChars`.
 */

/** A part of content, in OpenAI/OpenRouter content parts format. */
export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** The content of a message, in its two forms. */
export type AgentMessageContent = string | AgentContentPart[] | null | undefined;

/**
 * An image returned by a tool, ready to become a game `image_url`.
 * `url` is a DATA URL (`data:image/png;base64,…`), never a signed URL:
 * the history IS the checkpoint and it is replayed hours later, when
 * the signed URL has long expired.
 */
export interface AgentToolImage {
  url: string;
  /** File name — for traces and events, never sent to the model. */
  name?: string;
}

/**
 * Context cost assigned to ONE image, in "characters" (≈ 1000 tokens au
 * 4:1 ratio of compact.ts). The size of the data URL has NO relation to the
 * price: a 1 MB model in base64 is worth ~1,000 tokens in the model, not
 * 250,000. Counting the bytes would trigger a compaction in each round from the
 * first open model.
 */
export const IMAGE_PART_CHARS = 4000;

/** The text of content, whatever its form (image parts ignored). */
export function textOf(content: AgentMessageContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Number of image parts of content (0 for a string). */
export function imageCount(content: AgentMessageContent): number {
  if (!Array.isArray(content)) return 0;
  return content.reduce((n, p) => (p.type === "image_url" ? n + 1 : n), 0);
}

/** “Context” bytes of content — proxy for images (see IMAGE_PART_CHARS). */
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
 * Removes the image parts of content and replaces them with ONE text note.
 * Returns the content unchanged (same reference) if there is no image — the caller
 * uses this to know if they have anything to rewrite.
 */
export function stripImages(
  content: AgentMessageContent,
  note: string,
): AgentMessageContent {
  if (imageCount(content) === 0) return content;
  const kept = (content as AgentContentPart[]).filter((p) => p.type !== "image_url");
  return [...kept, { type: "text" as const, text: note }];
}
