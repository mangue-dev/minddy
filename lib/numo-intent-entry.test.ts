import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("common Numo intent entry", () => {
  it.each([
    "components/issue-card.tsx",
    "components/issue-side-panel.tsx",
    "components/scratchpad/use-launch-agent-note.ts",
    "components/pages/page-task-surface.tsx",
    "components/home/home-numo-composer.tsx",
    "components/feedback/feedback-setup-wizard.tsx",
    "components/integrations/create-integration-wizard.tsx",
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

  it("keeps PR review and fix intent in the common conversation", () => {
    const contents = source("components/pull-requests/pr-detail.tsx");
    expect(contents).toContain('source: "pull_request"');
    expect(contents).toContain('action: "review"');
    expect(contents).toContain('action: "fix"');
    expect(contents).toContain("pullRequestId: item.prId");
    expect(contents).not.toContain("requestPullRequestAiReviewApi");
  });

  it("does not submit a no-effect forge review before a Numo-only fix", () => {
    const contents = source("components/pull-requests/pr-detail.tsx");
    expect(contents).toContain("!postVerdict && relaunching");
    expect(contents).toContain('{ published: "none" as const }');
  });

  it.each([
    "app/api/issues/[id]/agent/route.ts",
    "app/api/agent-runs/route.ts",
  ])("retires the %s launch adapter explicitly", (file) => {
    const contents = source(file);
    expect(contents).toContain('error: "numoRequired"');
    expect(contents).toContain("status: 410");
    expect(contents).not.toContain("startNumoIntent");
    expect(contents).not.toContain("launchAgentRun({");
  });

  it("keeps PR actions inside Numo without a direct worker launch", () => {
    const contents = source("lib/server/agent/pr-actions.ts");
    expect(contents).toContain("startNumoIntent");
    expect(contents).not.toContain("launchAgentRun({");
  });
});
