import { describe, expect, it } from "vitest";

import { markdownLinkDestination } from "./escape";

describe("markdownLinkDestination", () => {
  it("escapes backslashes before Markdown parentheses", () => {
    expect(markdownLinkDestination("/files/a\\(b).txt")).toBe("/files/a\\\\\\(b\\).txt");
  });

  it("rejects active URL schemes", () => {
    expect(markdownLinkDestination("javascript:alert(1)")).toBeNull();
  });
});
