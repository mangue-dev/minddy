import { describe, expect, it } from "vitest";
import { feedbackBoardUrl } from "./board-url";

const ORIGIN = "https://www.minddy.app";

describe("feedbackBoardUrl", () => {
  it("falls back to the token URL when no custom domain is attached", () => {
    expect(feedbackBoardUrl({ token: "abc123", origin: ORIGIN })).toBe(
      "https://www.minddy.app/f/abc123"
    );
    expect(
      feedbackBoardUrl({ token: "abc123", origin: ORIGIN, customDomain: null })
    ).toBe("https://www.minddy.app/f/abc123");
  });

  it("prefers a VERIFIED custom domain", () => {
    expect(
      feedbackBoardUrl({
        token: "abc123",
        origin: ORIGIN,
        customDomain: { domain: "feedback.acme.com", status: "verified" },
      })
    ).toBe("https://feedback.acme.com");
  });

  // A line `pending` exists in the database but its DNS does not yet point anywhere:
  // giving it to an agent would produce a dead button, broken in production.
  it("ignores a pending custom domain", () => {
    expect(
      feedbackBoardUrl({
        token: "abc123",
        origin: ORIGIN,
        customDomain: { domain: "feedback.acme.com", status: "pending" },
      })
    ).toBe("https://www.minddy.app/f/abc123");
  });

  it("never doubles the slash when the origin carries a trailing one", () => {
    expect(
      feedbackBoardUrl({ token: "abc123", origin: "http://localhost:3000/" })
    ).toBe("http://localhost:3000/f/abc123");
  });
});
