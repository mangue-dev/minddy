// Numo cites what it talks about as typed mentions (MIN-872): every type the
// app renders as a pill is in its rules, with where its id comes from.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildSharedRules } = await import("./prompt");

describe("Numo's mention rules", () => {
  const rules = buildSharedRules("en");

  it("names every mention type, with where its id comes from", () => {
    for (const type of ["issue", "objective, project, page", "member", "pull_request", "routine", "scratchpad", "cycle", "mcp", "skill", "date"]) {
      expect(rules).toContain(`| ${type} |`);
    }
    expect(rules).toContain("[@Task notebook](mention:scratchpad/notebook)");
    expect(rules).toContain("mention:date/2026-11-02?time=09:30");
  });

  it("asks for a mention after each kind of change the user cares about", () => {
    expect(rules).toContain("every routine you create, change, run or report on");
    expect(rules).toContain("every time you read, add to or change the user's task notebook");
    expect(rules).toContain("a connection you used (call_mcp_tool)");
    expect(rules).toContain("every specific day or deadline you state");
  });
});
