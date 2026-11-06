import "server-only";

import { MAX_INLINE_MESSAGE_CHARS } from "@/lib/numo-message-limits";

export { MAX_INLINE_MESSAGE_CHARS };

// The purpose of this constant IS to match control characters.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Normalize untrusted chat text before persisting it / feeding it to the LLM:
 * NFKC, unified newlines, control characters stripped, inline whitespace
 * collapsed (newlines preserved). Past {@link MAX_INLINE_MESSAGE_CHARS} the text
 * is cut and ends with a marker saying how much was left out, so neither Numo
 * nor a reader takes the excerpt for the whole message (MIN-916).
 */
export function sanitizeAssistantMessageContent(
  value: string | null | undefined
): string {
  const text = normalizeAssistantMessageText(value);
  if (text.length <= MAX_INLINE_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_INLINE_MESSAGE_CHARS)}\n… [message truncated, ${
    text.length - MAX_INLINE_MESSAGE_CHARS
  } characters omitted]`;
}

/** {@link sanitizeAssistantMessageContent} without the length cap. */
export function normalizeAssistantMessageText(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}
