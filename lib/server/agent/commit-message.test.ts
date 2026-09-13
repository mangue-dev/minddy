import { describe, expect, it } from "vitest";
import {
  commitMessageFromReply,
  commitMessageWithSignoff,
} from "./commit-message";

describe("agent commit messages", () => {
  it("derives a bounded subject from the reply", () => {
    expect(commitMessageFromReply("**Implement the fix**\nDetails", "MIN-1"))
      .toBe("Implement the fix");
  });

  it("adds one DCO trailer matching the Git author", () => {
    const author = { name: "Minddy Agent", email: "agent@minddy.app" };
    const signed = commitMessageWithSignoff("fix: preserve the routine", author);
    expect(signed).toBe(
      "fix: preserve the routine\n\nSigned-off-by: Minddy Agent <agent@minddy.app>",
    );
    expect(commitMessageWithSignoff(signed, author)).toBe(signed);
  });
});
