import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/pull-requests/pr-detail.tsx"),
  "utf8",
);
const dialog = source.slice(
  source.indexOf("open={aiReviewDialog}"),
  source.indexOf("{/* Review dialogue"),
);

describe("Numo pull-request review execution", () => {
  it("does not expose an execution-environment choice", () => {
    expect(dialog).not.toContain("<EnvironmentCombobox");
    expect(dialog).not.toContain("<ModelCombobox");
    expect(dialog).not.toContain("<ReasoningCombobox");
  });

  it("never sends retired desktop-local launch fields", () => {
    expect(source).not.toContain("localExec:");
    expect(source).not.toContain("localWorktree:");
    expect(source).not.toContain("localIssueContextConfirmed:");
    expect(source).not.toContain("LocalIssueRunConfirmation");
  });

  it("gates review and correction actions on server execution", () => {
    expect(source).toContain(
      "const reviewExecutionAvailable = cloudExecutionConfigured;",
    );
    expect(source.match(/reviewUpToDate \|\| !reviewExecutionAvailable/g)).toHaveLength(3);

    const relaunchGate = source.slice(
      source.indexOf("const canRelaunch ="),
      source.indexOf("// `item` comes from the list"),
    );
    expect(relaunchGate).toContain("reviewExecutionAvailable");
  });
});
