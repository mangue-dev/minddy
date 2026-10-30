// External agents learn every typed mention (MIN-872): the usage guide and
// each Markdown field they write list the types and the date form.
import { describe, expect, it } from "vitest";
import { MCP_FULL_USAGE_GUIDE, MCP_MENTIONS_IN_MARKDOWN } from "./instructions";

describe("MCP mention guidance", () => {
  it("lists every type, the notebook and dates", () => {
    for (const type of ["issue", "objective", "project", "page", "member", "pull_request", "routine", "cycle", "mcp", "skill"]) {
      expect(MCP_MENTIONS_IN_MARKDOWN).toContain(type);
    }
    expect(MCP_MENTIONS_IN_MARKDOWN).toContain("[@Task notebook](mention:scratchpad/notebook)");
    expect(MCP_MENTIONS_IN_MARKDOWN).toContain("[@](mention:date/YYYY-MM-DD)");
  });

  it("is part of the usage guide", () => {
    expect(MCP_FULL_USAGE_GUIDE).toContain("MENTIONS.");
    expect(MCP_FULL_USAGE_GUIDE).toContain(MCP_MENTIONS_IN_MARKDOWN);
  });
});
