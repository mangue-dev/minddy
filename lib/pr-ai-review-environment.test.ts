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

  it("routes review and correction requests through Numo", () => {
    expect(source).toContain('source: "pull_request"');
    expect(source).toContain('action: "review"');
    expect(source).toContain('action: "fix"');
    expect(source).toContain("pullRequestId: item.prId");
    expect(source).not.toContain("requestPullRequestAiReviewApi");
    expect(source).not.toContain("reviewExecutionAvailable");
    expect(source).not.toContain("cloudExecutionConfigured");
  });
});
