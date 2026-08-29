import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("page interface regressions", () => {
  it("shows backlinks in activity instead of the document footer", () => {
    const activity = source("components/pages/page-activity.tsx");
    const backlinks = source("components/pages/page-backlinks.tsx");
    const view = source("components/pages/page-view.tsx");

    expect(activity).toContain(
      "<PageBacklinks projectId={projectId} pageId={pageId} />"
    );
    expect(view).not.toContain("<PageBacklinks");
    expect(backlinks).toContain("mentionNavigationTarget(");
    expect(backlinks).toContain(
      "openIssue(target.projectId, target.issueId)"
    );
  });

  it("uses a pointer over the block handle and grabbing only while pressed", () => {
    const gutter = source("components/pages/block-gutter.tsx");

    expect(gutter).toContain("cursor-pointer active:cursor-grabbing");
    expect(gutter).not.toContain("cursor-grab active:cursor-grabbing");
  });

  it("builds the full sidebar and open-page menu from one action list", () => {
    const actions = source("components/pages/page-document-actions.tsx");
    const tree = source("components/pages/page-tree.tsx");
    const view = source("components/pages/page-view.tsx");

    for (const id of [
      "new-subpage",
      "favorite",
      "copy-for-agent",
      "publish",
      "export",
      "trash",
    ]) {
      expect(actions).toContain(`id: "${id}"`);
    }
    expect(tree).toContain("usePageDocumentMenu({");
    expect(view).toContain("usePageDocumentMenu({");
  });
});
