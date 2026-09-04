/** Mentions start at the beginning of text or after whitespace, like the composer. */
export const MENTION_TOKEN_START_PATTERN = "(?<!\\S)";

/** Characters that would make a matched label only a prefix of a longer token. */
export const MENTION_TOKEN_END_PATTERN = "(?![\\p{L}\\p{N}_-])";

export function escapeMentionLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
