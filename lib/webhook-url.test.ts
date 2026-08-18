import { describe, expect, it } from "vitest";

import { normalizeWebhookUrl } from "@/lib/webhook-url";

/**
 * The address of a webhook is pasted from a doc or an address bar, and this
 * that is pasted does not always have a schema. What this test keeps is not the
 * convenience: it is that the schema added is `https`, on a field whose
 * value ends up receiving signed payloads, and that a schema written
 * by hand is never rewritten.
 */
describe("normalizeWebhookUrl", () => {
  it("adds https to a value without a scheme", () => {
    expect(normalizeWebhookUrl("example.com/hooks/minddy")).toBe(
      "https://example.com/hooks/minddy",
    );
    expect(normalizeWebhookUrl("www.example.com")).toBe(
      "https://www.example.com",
    );
    expect(normalizeWebhookUrl("localhost:3000/hook")).toBe(
      "https://localhost:3000/hook",
    );
  });

  it("preserves an already written scheme, including http", () => {
    expect(normalizeWebhookUrl("http://localhost:3000/hook")).toBe(
      "http://localhost:3000/hook",
    );
    expect(normalizeWebhookUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("laisse le vide vide — c'est ainsi qu'on éteint un webhook", () => {
    expect(normalizeWebhookUrl("")).toBe("");
    expect(normalizeWebhookUrl("   ")).toBe("");
  });

  it("trims whitespace around pasted content", () => {
    expect(normalizeWebhookUrl("  example.com/hook \n")).toBe(
      "https://example.com/hook",
    );
  });

  it("produces a URL that the server can parse", () => {
    for (const raw of [
      "example.com/hook",
      "http://a.test",
      "sub.domain.co.uk/x",
    ]) {
      const url = new URL(normalizeWebhookUrl(raw));
      expect(["http:", "https:"]).toContain(url.protocol);
    }
  });
});
