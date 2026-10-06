import { describe, expect, it } from "vitest";
import { feedbackBoardUrl } from "./board-url";

const ORIGIN = "https://www.minddy.app";

describe("feedbackBoardUrl", () => {
  it("uses the token URL on the configured application origin", () => {
    expect(feedbackBoardUrl({ token: "abc123", origin: ORIGIN })).toBe(
      "https://www.minddy.app/f/abc123"
    );
    expect(feedbackBoardUrl({ token: "abc123", origin: "https://tickets.example.test" }))
      .toBe("https://tickets.example.test/f/abc123");
  });

  it("never doubles the slash when the origin carries a trailing one", () => {
    expect(
      feedbackBoardUrl({ token: "abc123", origin: "http://localhost:3000/" })
    ).toBe("http://localhost:3000/f/abc123");
  });
});
