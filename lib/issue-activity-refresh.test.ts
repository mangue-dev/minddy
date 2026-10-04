// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { IssueActivity } from "@/components/issue-timeline";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useFormatter: () => ({}) }));
vi.mock("@/lib/use-mention-sources", () => ({ useDescriptionMentions: () => ({}) }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/markdown", () => ({ Markdown: () => null }));
vi.mock("@/components/mention-textarea", () => ({ MentionTextarea: () => null, extractMentions: () => [] }));
vi.mock("@/components/assistant/tool-call-display", () => ({ toolRunningLabel: () => "" }));
vi.mock("@/components/actor-avatars", () => ({ AutomationAvatar: () => null, McpAvatar: () => null, NumoAvatar: () => null, SmartAssignAvatar: () => null, SmartFillAvatar: () => null }));
vi.mock("@/components/resources", () => ({}));
vi.mock("@/components/one-line", () => ({ OneLine: ({ children }: { children: import("react").ReactNode }) => createElement("p", null, children) }));
vi.mock("mangue-ui", () => ({
  Skeleton: () => createElement("div", { "data-skeleton": true }),
  Button: ({ children }: { children: import("react").ReactNode }) => createElement("button", null, children),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
afterEach(() => vi.unstubAllGlobals());

const props: ComponentProps<typeof IssueActivity> = {
  items: [], ctx: { members: [], objectives: [], categories: [], issues: [], projectKey: "TEST" },
  currentUserId: null, projectId: "project", onReply: async () => {}, onEditComment: async () => {},
  onDeleteComment: async () => {}, onDeleteAttachment: async () => {},
};

it("preserves loaded activity and empty results during refreshes while retaining initial and failed read fallbacks", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const render = (phase: NonNullable<typeof props.readState>["phase"], items = props.items) =>
    act(() => root.render(createElement(IssueActivity, { ...props, items, readState: { phase } })));
  try {
    await render("loading");
    expect(container.querySelector("[data-skeleton]")).not.toBeNull();
    expect(container.textContent).not.toContain("noActivity");
    await render("fresh");
    const empty = container.querySelector("p")!;
    await render("refreshing");
    expect(container.querySelector("p")).toBe(empty);
    expect(empty.textContent).toBe("noActivity");
    expect(getComputedStyle(empty).visibility).toBe("visible");
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    const items: typeof props.items = [{ kind: "event", at: "2026-10-04T12:00:00Z", event: {
      id: "event", issue_id: "issue", type: "created", actor_id: null, field: null,
      from_value: null, to_value: null, created_at: "2026-10-04T12:00:00Z",
    } }];
    await render("fresh", items);
    const row = container.querySelector("li")!;
    expect(row).not.toBeNull();
    await render("refreshing", items);
    expect(container.querySelector("li")).toBe(row);
    expect(getComputedStyle(row).visibility).toBe("visible");
    expect(row.closest("[inert], [aria-hidden='true']")).toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    for (const phase of ["error", "paused"] as const) {
      await render(phase, items);
      expect(getComputedStyle(row).visibility).toBe("hidden");
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    }
  } finally { await act(() => root.unmount()); container.remove(); }
});
