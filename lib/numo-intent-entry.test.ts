import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("common Numo intent entry", () => {
  it.each([
    "components/pages/page-task-surface.tsx",
    "components/home/home-numo-composer.tsx",
  ])("routes the %s voluntary request through openIntent", (file) => {
    const contents = source(file);
    expect(contents).toContain("openIntent");
    expect(contents).not.toContain("setAgentComposeDraft");
  });

  it("waits for page persistence before handing page tasks to Numo", () => {
    const contents = source("components/pages/page-task-surface.tsx");
    expect(contents).toContain("flush()\n          .then");
    expect(contents).not.toContain("flush().finally");
  });

  // Numo is a tracking assistant (MIN-721): no surface hands it code work.
  it.each([
    "components/issue-card.tsx",
    "components/issue-side-panel.tsx",
    "components/pages/page-task-surface.tsx",
    "components/feedback/feedback-setup-wizard.tsx",
    "components/integrations/create-integration-wizard.tsx",
    "components/pull-requests/pr-detail.tsx",
    "lib/use-bulk-selection-actions.ts",
  ])("does not hand code work to Numo from %s", (file) => {
    const contents = source(file);
    for (const action of ["implement", "plan", "verify", "custom", "fix"]) {
      expect(contents).not.toContain(`action: "${action}"`);
    }
    expect(contents).not.toContain("requestPullRequestAiReviewApi");
  });

  it("keeps PR mentions inside Numo without a direct worker launch", () => {
    const contents = source("lib/server/agent/pr-actions.ts");
    expect(contents).toContain("startNumoIntent");
    expect(contents).not.toContain("launchAgentRun(");
  });
});
