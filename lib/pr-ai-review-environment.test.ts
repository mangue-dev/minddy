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
  it("uses the request-changes compact selector order", () => {
    const environment = dialog.indexOf("<EnvironmentCombobox");
    const model = dialog.indexOf("<ModelCombobox");
    const reasoning = dialog.indexOf("<ReasoningCombobox");

    expect(environment).toBeGreaterThan(-1);
    expect(model).toBeGreaterThan(environment);
    expect(reasoning).toBeGreaterThan(model);
    expect(dialog).toContain('variant="compact"');
  });

  it("offers local review only through the native bridge and isolates it", () => {
    expect(dialog).toContain("localAvailable={localRepo.available}");
    expect(dialog).toContain("worktreeAvailable={false}");
    expect(source).toContain("localWorktree: aiReviewUsesLocal");
    expect(source).toContain("localIssueContextConfirmed: localContextConfirmed");
  });

  it("keeps review and correction actions available for local-only execution", () => {
    expect(source).toContain(
      "reviewExecutionConfigured || localRepo.available",
    );
    expect(source.match(/reviewUpToDate \|\| !reviewExecutionAvailable/g)).toHaveLength(3);

    const relaunchGate = source.slice(
      source.indexOf("const canRelaunch ="),
      source.indexOf("// `item` comes from the list"),
    );
    expect(relaunchGate).toContain("reviewExecutionAvailable");
  });
});
