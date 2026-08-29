import { describe, expect, it } from "vitest";
import { buildPageContextBlock } from "./prompt";

describe("assistant inbox context", () => {
  it("directs ambiguous catch-up requests to the inbox tool", () => {
    const block = buildPageContextBlock({ inbox: true });
    expect(block).toContain("looking at their Inbox");
    expect(block).toContain("call list_inbox");
    expect(block).toContain("read/unread state");
  });
});
