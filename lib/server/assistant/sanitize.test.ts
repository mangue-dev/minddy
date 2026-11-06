import { describe, expect, it } from "vitest";
import { MAX_INLINE_MESSAGE_CHARS, sanitizeAssistantMessageContent } from "./sanitize";

describe("sanitizeAssistantMessageContent", () => {
  it("keeps a message that fits inline untouched", () => {
    const text = "a".repeat(MAX_INLINE_MESSAGE_CHARS);
    expect(sanitizeAssistantMessageContent(text)).toBe(text);
  });

  it("says how much it cut from a longer message (MIN-916)", () => {
    const result = sanitizeAssistantMessageContent("a".repeat(MAX_INLINE_MESSAGE_CHARS + 250));
    expect(result.startsWith("a".repeat(MAX_INLINE_MESSAGE_CHARS))).toBe(true);
    expect(result.endsWith("[message truncated, 250 characters omitted]")).toBe(true);
  });

  it("still normalizes newlines, controls and inline whitespace", () => {
    expect(sanitizeAssistantMessageContent(" a\r\nb\u0007\t\tc ")).toBe("a\nb c");
    expect(sanitizeAssistantMessageContent(null)).toBe("");
  });
});
