// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MentionTextarea } from "@/components/mention-textarea";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionScan } from "@/lib/mention-scan";

vi.mock("mangue-ui", async () => ({
  ...await vi.importActual<Record<string, unknown>>("mangue-ui/lib/utils.ts"),
}));
vi.mock("@/components/mention-suggest", () => ({ MentionFigure: () => null }));
vi.mock("@/components/git/forge-user-avatar", () => ({ ForgeUserAvatar: () => null }));
vi.mock("@/components/actor-avatars", () => ({ NumoAvatar: () => null }));
vi.mock("@/components/assistant/skill-preview-dialog", () => ({ SkillPreviewDialog: () => null }));
vi.mock("@/lib/keyboard/use-send-mode", () => ({ useIsSendShortcut: () => () => false }));
vi.mock("@/components/mention-chip", () => ({
  NUMO_MENTION_ID: "__numo__",
  MentionChip: ({ label, status }: { label: string; status?: string }) =>
    createElement("span", { "data-chip-status": status }, label),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("comment issue mention status", () => {
  it("hydrates the workflow indicator and updates it from current mention sources", async () => {
    const issue = { id: "issue-12", project_id: "project-1", identifier: "MIN-12", title: "Keyboard shortcuts", status: "in_progress" as const };
    const scan: MentionScan = (text) => [{ raw: text, mention: { type: "issue", issue } }];
    const render = async (status: MentionOption["status"]) => act(async () => {
      root.render(createElement(MentionTextarea, {
        value: "@MIN-12", onChange: vi.fn(), members: [],
        mentions: { scan, options: [{ type: "issue", id: issue.id, label: issue.identifier, status }] },
      }));
    });
    await render("in_progress");
    expect(container.querySelector('[data-mention-id]')?.getAttribute("data-mention-status")).toBe("in_progress");
    expect(container.querySelector('[data-chip-status]')?.getAttribute("data-chip-status")).toBe("in_progress");
    await render("done");
    expect(container.querySelector('[data-chip-status]')?.getAttribute("data-chip-status")).toBe("done");
    expect(container.textContent).toBe("MIN-12");
  });
});
