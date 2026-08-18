import "server-only";

// The purpose of this constant IS to match control characters.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Normalize untrusted chat text before persisting it / feeding it to the LLM:
 * NFKC, unified newlines, control characters stripped, inline whitespace
 * collapsed (newlines preserved), capped at 12k chars.
 */
export function sanitizeAssistantMessageContent(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(/[^\S\n]+/g, " ")
    .trim()
    .slice(0, 12_000);
}
