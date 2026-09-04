/** Characters that would make a matched label only a prefix of a longer token. */
export const MENTION_TOKEN_END_PATTERN = "(?![\\p{L}\\p{N}_-])";

export function escapeMentionLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
