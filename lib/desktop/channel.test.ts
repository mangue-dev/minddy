import { describe, expect, it } from "vitest";

import { storedChannelNeedsReset } from "@/lib/desktop/channel";

describe("storedChannelNeedsReset", () => {
  it("resets an installation that had switched to the retired preview channel", () => {
    expect(storedChannelNeedsReset({ channel: "preview" })).toBe(true);
  });

  it("leaves stable, unknown and malformed content untouched", () => {
    for (const raw of [
      { channel: "stable" },
      { channel: "PREVIEW" },
      { channel: 1 },
      {},
      [],
      null,
      undefined,
      "preview",
    ]) {
      expect(storedChannelNeedsReset(raw)).toBe(false);
    }
  });
});
