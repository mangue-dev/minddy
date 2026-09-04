import { describe, expect, it } from "vitest";

import { containsMentionToken } from "./mention-token";

describe("mention token boundaries", () => {
  it("does not treat a shorter identifier as present inside a longer mention", () => {
    expect(containsMentionToken("Review @MIN-42", "MIN-4")).toBe(false);
    expect(containsMentionToken("Review @MIN-4, then continue", "MIN-4")).toBe(
      true,
    );
  });

  it("handles Unicode letters as part of the longer token", () => {
    expect(containsMentionToken("Ask @JeanÉric", "Jean")).toBe(false);
  });
});
