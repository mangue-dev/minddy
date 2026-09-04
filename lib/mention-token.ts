/** Characters that would make a matched label only a prefix of a longer token. */
export const MENTION_TOKEN_END_PATTERN = "(?![\\p{L}\\p{N}_-])";

export function escapeMentionLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether text contains this exact mention token, rather than a label prefix. */
export function containsMentionToken(text: string, label: string): boolean {
  if (!label) return false;
  return new RegExp(
    `@${escapeMentionLabel(label)}${MENTION_TOKEN_END_PATTERN}`,
    "u",
  ).test(text);
}
