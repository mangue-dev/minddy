// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    conversationModel: null as string | null,
    conversationReasoningLevel: "high" as const,
    conversationConfigError: null as string | null,
  },
  update: vi.fn(),
  reasoningProps: null as null | { value: string; levels: string[] },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/assistant-chat-context", () => ({
  useAssistantChatContext: () => ({ state: h.state, updateConversationConfig: h.update }),
}));
vi.mock("@/lib/use-agent-models-query", () => ({
  useAgentModelsQuery: () => ({
    defaultModel: "default-model",
    defaultReasoning: "medium",
    models: [{
      id: "default-model",
      reasoning: { efforts: ["low"], mandatory: true },
    }],
  }),
  useReasoningLevelsFor: () => ["low"],
}));
vi.mock("@/components/agent/model-combobox", () => ({ ModelCombobox: () => null }));
vi.mock("@/components/agent/reasoning-combobox", () => ({
  ReasoningCombobox: (props: { value: string; levels: string[] }) => {
    h.reasoningProps = props;
    return null;
  },
}));

import { ConversationSettings } from "@/components/assistant/conversation-settings";

let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.reasoningProps = null;
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("ConversationSettings", () => {
  it("shows an unsupported persisted choice instead of silently displaying another level", async () => {
    await act(async () => root.render(createElement(ConversationSettings)));

    expect(h.reasoningProps).toMatchObject({
      value: "high",
      levels: ["low"],
    });
  });
});
