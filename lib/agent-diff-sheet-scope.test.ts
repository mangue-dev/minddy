// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { AgentDiffSheet } from "@/components/agent/agent-diff-sheet";
import { fileAnchorId } from "./pr-file-tree";
import type { PullRequestFile } from "./agent-api";

const fixture = vi.hoisted(() => ({
  files: [{ filename: 'src/a "quoted" file.ts', status: "modified", additions: 1, deletions: 0 }] as PullRequestFile[],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => {
  const wrapper = ({ children, ref }: { children?: ReactNode; ref?: Ref<HTMLDivElement> }) => createElement("div", { ref }, children);
  return { SidePanel: wrapper, SidePanelBody: wrapper, SidePanelContent: wrapper, SidePanelDescription: wrapper, SidePanelHeader: wrapper, SidePanelTitle: wrapper, Spinner: () => null };
});
vi.mock("@/lib/use-agent-runs", () => ({
  useAgentRunDiffQuery: () => ({ files: fixture.files, loading: false }),
  useDesktopAgentRunDiffQuery: () => ({ diff: null, loading: false }),
}));
vi.mock("@/lib/pr-endpoint-context", () => ({ PrEndpointProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/pull-requests/pr-diff", () => ({
  PrDiff: ({ files }: { files: PullRequestFile[] }) => createElement("div", null,
    files.map((file) => createElement("section", { key: file.filename, id: fileAnchorId(file.filename), "data-current-diff": true }))),
}));
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("jumps to the active panel's file instead of an identical hidden retained diff anchor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const scrolls: Element[] = [];
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { scrolls.push(this); };
  const old = document.createElement("section");
  old.id = fileAnchorId(fixture.files[0].filename);
  old.style.display = "none";
  document.body.append(old);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(createElement(AgentDiffSheet, {
      runId: "run-1", open: true, onOpenChange: () => {}, working: false,
      baseBranch: "main", branchName: "feature", focusPath: fixture.files[0].filename,
    })));
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]).toBe(host.querySelector("[data-current-diff]"));
    expect(scrolls[0]).not.toBe(old);
  } finally {
    await act(() => root.unmount());
    Element.prototype.scrollIntoView = originalScroll;
  }
});
