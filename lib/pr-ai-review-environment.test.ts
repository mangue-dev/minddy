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

describe("Numo pull-request review environment", () => {
  it("only exposes the execution environment when launching a review", () => {
    const environment = dialog.indexOf("<EnvironmentCombobox");

    expect(environment).toBeGreaterThan(-1);
    expect(dialog).not.toContain("<ModelCombobox");
    expect(dialog).not.toContain("<ReasoningCombobox");
  });

  it("offers local review only through the native bridge and isolates it", () => {
    expect(dialog).toContain("localAvailable={localRepo.available}");
    expect(dialog).toContain("worktreeAvailable={false}");
    expect(source).toContain("localWorktree: aiReviewUsesLocal");
    expect(source).toContain("localIssueContextConfirmed: localContextConfirmed");
  });

  it("keeps review and correction actions available for local-only execution", () => {
    expect(source).toContain(
      "cloudExecutionConfigured || localRepo.available",
    );
    expect(source.match(/reviewUpToDate \|\| !reviewExecutionAvailable/g)).toHaveLength(3);

    const relaunchGate = source.slice(
      source.indexOf("const canRelaunch ="),
      source.indexOf("// `item` comes from the list"),
    );
    expect(relaunchGate).toContain("reviewExecutionAvailable");
  });
});
