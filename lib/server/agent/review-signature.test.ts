import { describe, expect, it } from "vitest";
import { signReviewBody } from "./review-signature";

describe("signReviewBody", () => {
  // The French bodies exercise the French runtime footer.
  it("adds the signature once", () => {
    const body = signReviewBody("Rien à redire.", "openai/gpt-5.6", "fr");
    expect(body).toContain("🤖 Relu par Numo (minddy) · openai/gpt-5.6");
    expect(body.match(/🤖/g)).toHaveLength(1);
  });

  it("does not sign twice when the body already carries it", () => {
    const once = signReviewBody("Rien à redire.", "openai/gpt-5.6", "fr");
    expect(signReviewBody(once, "openai/gpt-5.6", "fr")).toBe(once);
  });

  it("does not sign twice when the signature is in another language", () => {
    const already = "Nothing to fix.\n\n---\n🤖 Reviewed by Numo (minddy) · anthropic/claude";
    expect(signReviewBody(already, "openai/gpt-5.6", "fr")).toBe(already);
  });

  it("follows the requester's language", () => {
    expect(signReviewBody("ok", "m", "en")).toContain("🤖 Reviewed by Numo (minddy) · m");
  });
});
