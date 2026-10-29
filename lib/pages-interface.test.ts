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

  it("shows a grab cursor only once a block drag actually starts", () => {
    const gutter = source("components/pages/block-gutter.tsx");

    expect(gutter).toContain("setDragging(true);");
    // A block drag is a move: no "copy" (+) cursor while it passes the text.
    expect(gutter).toContain('event.dataTransfer.effectAllowed = "move"');
    expect(gutter).toContain('event.dataTransfer.dropEffect = "move"');
    expect(gutter).toContain("onElementDragEnd={() => setDragging(false)}");
    expect(gutter).toContain('dragging && "cursor-grabbing"');
    expect(gutter).not.toContain('"cursor-grab"');
    expect(gutter).not.toContain("active:cursor-grabbing");
  });

  it("uses app chrome for block comment annotations", () => {
    const badge = source("components/pages/block-comment-badge.tsx");
    const comments = source("components/pages/block-comments.ts");
    const gutter = source("components/pages/block-gutter.tsx");
    const css = source("app/globals.css");

    expect(badge).toContain("<Tooltip");
    expect(badge).toContain("<TooltipContent");
    expect(comments).not.toContain(".title =");
    expect(comments).toContain("Decoration.inline(range.from, range.to");
    expect(css).toContain(".page-commented-passage");
    // A commented block keeps the gutter where every block has it.
    expect(gutter).not.toContain("COMMENTED_GUTTER_SHIFT");
  });

  it("keeps page actions in a fixed header and opens the requested side-panel tab", () => {
    const view = source("components/pages/page-view.tsx");
    const history = source("components/pages/page-history.tsx");

    expect(view).toContain(
      'className="relative flex min-h-0 flex-1 flex-col"'
    );
    expect(view).toContain(
      '<AppContentHeader contentClassName="gap-2">'
    );
    expect(view).toContain('onOpenHistory={() => openHistory("versions")}');
    expect(view).toContain('onClick={() => openHistory("activity")}');
    expect(view).toContain("icon={Message01Icon}");
    expect(view).toContain("initialTab={historyTab}");
    expect(history).toContain('initialTab = "activity"');
    expect(history).toContain("if (open) setTab(initialTab)");
  });

  it("builds the full sidebar and open-page menu from one action list", () => {
    const actions = source("components/pages/page-document-actions.tsx");
    const tree = source("components/pages/page-tree.tsx");
    const view = source("components/pages/page-view.tsx");

    for (const id of [
      "new-subpage",
      "favorite",
      "copy",
      "copy-link",
      "copy-content",
      "promote-to-issue",
      "publish",
      "export",
      "trash",
    ]) {
      expect(actions).toContain(`id: "${id}"`);
    }
    expect(tree).toContain("usePageDocumentMenu({");
    expect(view).toContain("usePageDocumentMenu({");
  });

  it("rehydrates mention pills after an agent rewrites page markdown", () => {
    const editor = source("components/editor/rich-editor.tsx");
    const view = source("components/pages/page-view.tsx");

    expect(editor).toContain("hydrateMentions(editor, scan, { exact: !!collaboration })");
    expect(editor).toContain("transaction.getMeta(MENTION_HYDRATION_META)");
    expect(view).toContain("scan: mentionSources.scan");
  });

  it("keeps document switching inside the persistent Pages shell", () => {
    const shell = source("components/pages/pages-shell.tsx");
    const tree = source("components/pages/page-tree.tsx");
    const detailRoute = source(
      "app/(app)/projects/[id]/pages/[pageId]/page.tsx"
    );

    expect(shell).toContain("<RetainedPageDocuments");
    expect(shell).toContain("onOpen={openPage}");
    expect(tree).toContain("event.preventDefault();");
    expect(tree).toContain("onOpen(page.id);");
    expect(detailRoute).toContain("return null;");
  });

  it("warms activity data before the comments panel opens", () => {
    const view = source("components/pages/page-view.tsx");
    const warmup = source("lib/page-activity-cache.ts");
    const activity = source("components/pages/page-activity.tsx");
    const backlinks = source("components/pages/page-backlinks.tsx");

    expect(view).toContain("usePageActivityWarmup(projectId, pageId, page)");
    expect(view).toContain("onMouseEnter={warmPageActivity}");
    expect(warmup).toContain("queryClient.prefetchQuery({");
    expect(warmup).toContain("pageEventsKey(pageId)");
    expect(warmup).toContain("pageBacklinksKey(pageId)");
    expect(activity).toContain("staleTime: PAGE_ACTIVITY_FRESH_MS");
    expect(backlinks).toContain("staleTime: PAGE_ACTIVITY_FRESH_MS");
    expect(activity).not.toContain('refetchOnMount: "always"');
    expect(backlinks).not.toContain('refetchOnMount: "always"');
  });

  it("orders creation-dependent page work without persisting orphan links", () => {
    const view = source("components/pages/page-view.tsx");
    const pagesQuery = source("lib/use-pages-query.ts");

    expect(view).toContain("await child.settled;");
    expect(view).toContain("afterPageCreation(pageId");
    expect(view).toContain("!isPageCreationPending(pageId)");
    expect(pagesQuery).toContain("settled: request");
    expect(pagesQuery).toContain("await waitForPageCreation(pageId)");
  });
});
