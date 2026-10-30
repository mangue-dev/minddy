// @vitest-environment jsdom

import { expect, it } from "vitest";
import { composerText, createMentionNode, mentionFromNode } from "@/components/assistant/chat-input";

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
