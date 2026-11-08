// @vitest-environment jsdom

import { expect, it } from "vitest";
import { composerNodesFromMarkdown, composerText, createMentionNode, mentionFromNode } from "@/components/assistant/chat-input";

it("keeps an objective's status on its composer pill, for the pill and the sent message", () => {
  const pill = createMentionNode({
    type: "objective",
    id: "obj-1",
    label: "Public launch",
    color: "blue",
    objectiveStatus: "in_progress",
  });
  expect(mentionFromNode(pill)).toMatchObject({
    type: "objective",
    id: "obj-1",
    label: "Public launch",
    objectiveStatus: "in_progress",
  });
});

it("sends typed mentions as links without a name, and Numo as its text (MIN-872)", () => {
  const root = document.createElement("div");
  root.append(
    "Ask ",
    createMentionNode({ type: "member", id: "u1", label: "Alice" }),
    " by ",
    createMentionNode({ type: "date", id: "2026-11-02", label: "Monday", meta: { time: "09:30" } }),
    ", ",
    createMentionNode({ type: "numo", id: "__numo__", label: "Numo" }),
  );
  expect(composerText(root)).toBe("Ask [@](mention:member/u1) by [@](mention:date/2026-11-02?time=09:30), @Numo");
});

it("keeps an MCP server's provider on its composer pill, for its logo", () => {
  const pill = createMentionNode({ type: "mcp", id: "conn-1", label: "Linear", mcpService: "linear" });
  expect(mentionFromNode(pill)).toMatchObject({ type: "mcp", id: "conn-1", mcpService: "linear" });
});

it("fills a prompt written with mentions as pills, and sends the same links back (MIN-930)", () => {
  const nodes = composerNodesFromMarkdown(
    "Give me the summary of [@Test](mention:project/p1) by [@](mention:date/2026-11-09) for [@](mention:page/x)",
    (link) => link.type === "project" ? { type: "project", id: link.id, label: link.label, iconUrl: "https://icon" } : null,
  );
  const root = document.createElement("div");
  root.append(...nodes);
  const pill = root.querySelector<HTMLElement>("[data-mention-type]")!;
  expect(mentionFromNode(pill)).toMatchObject({ type: "project", id: "p1", label: "Test" });
  expect(pill.dataset.mentionIcon).toBe("https://icon");
  expect(root.textContent).toContain("by 2026-11-09 for @…");
  expect(composerText(root)).toBe("Give me the summary of [@](mention:project/p1) by 2026-11-09 for @…");
});
