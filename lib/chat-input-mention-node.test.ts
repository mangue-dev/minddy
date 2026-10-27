// @vitest-environment jsdom

import { expect, it } from "vitest";
import { createMentionNode, mentionFromNode } from "@/components/assistant/chat-input";

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
