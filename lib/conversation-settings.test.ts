// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conversationReasoningIndex,
  conversationReasoningLevels,
} from "@/lib/conversation-settings";

const h = vi.hoisted(() => ({
  state: {
    conversationModel: null as string | null,
    conversationReasoningLevel: "high" as const,
    conversationConfigError: null as string | null,
  },
  update: vi.fn(),
  sliderProps: null as null | {
    value: number[];
    min: number;
    max: number;
    onValueChange: (value: number[]) => void;
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/assistant-chat-context", () => ({
  useAssistantChatContext: () => ({
    state: h.state,
    updateConversationConfig: h.update,
  }),
}));
vi.mock("@/lib/use-agent-models-query", () => ({
  useAgentModelsQuery: () => ({
    provider: "openrouter",
    defaultModel: "z-ai/glm-5.3-flash",
    defaultReasoning: "medium",
    models: [{
      id: "z-ai/glm-5.3-flash",
      reasoning: { efforts: ["low"], mandatory: true },
    }],
  }),
  useReasoningLevelsFor: () => ["low"],
}));
vi.mock("@/components/agent/model-combobox", () => ({
  ModelCombobox: () => null,
}));
vi.mock("@/components/model-logo", () => ({
  ModelLogo: () => null,
  ProviderLogo: () => null,
}));
vi.mock("@/components/ui/tooltip", async () => {
  const { createElement } = await import("react");
  const Wrapper = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    Tooltip: Wrapper,
    TooltipContent: Wrapper,
    TooltipTrigger: Wrapper,
  };
});
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const { createElement } = await import("react");
  const Wrapper = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    Button: ({ children, ...props }: { children?: ReactNode }) =>
      createElement("button", props, children),
    Popover: Wrapper,
    PopoverContent: Wrapper,
    PopoverTrigger: Wrapper,
    Slider: (props: NonNullable<typeof h.sliderProps>) => {
      h.sliderProps = props;
      return createElement("div", { "aria-label": "slider" });
    },
    cn: (...values: Array<string | false | null | undefined>) =>
      values.filter(Boolean).join(" "),
  };
})());
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/popover", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Popover: stubs.Popover, PopoverContent: stubs.PopoverContent, PopoverTrigger: stubs.PopoverTrigger };
});
vi.mock("@/components/ui/slider", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Slider: stubs.Slider };
});

import { ConversationSettings } from "@/components/assistant/conversation-settings";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  h.sliderProps = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("conversation reasoning stops", () => {
  it("always starts at no reasoning and follows the canonical effort order", () => {
    expect(conversationReasoningLevels(["high", "minimal", "low"])).toEqual([
      "off",
      "minimal",
      "low",
      "high",
    ]);
    expect(conversationReasoningIndex("medium", ["low", "high"])).toBe(1);
  });
});

describe("ConversationSettings", () => {
  it("combines the effective model and reasoning, and resets both overrides", async () => {
    await act(async () => root.render(createElement(ConversationSettings)));

    // The composer trigger shows the logo only (MIN-827); the model and its
    // reasoning level are named by its tooltip.
    const trigger = host.querySelector('button[aria-label="sectionTitle"]');
    expect(trigger?.textContent).not.toContain("GLM 5.3 Flash");
    expect(trigger?.getAttribute("tooltip")).toBe("GLM 5.3 Flash · reasoningLow");
    expect(host.textContent).not.toContain("modelDefault");
    expect(h.sliderProps).toMatchObject({ value: [1], min: 0, max: 1 });
    expect(h.update).toHaveBeenCalledWith({ reasoningLevel: "low" });

    const reset = host.querySelector<HTMLButtonElement>(
      'button[aria-label="modelSettingsReset"]',
    );
    await act(async () => reset?.click());
    expect(h.update).toHaveBeenCalledWith({ model: null, reasoningLevel: null });

    await act(async () => h.sliderProps?.onValueChange([0]));
    expect(h.update).toHaveBeenCalledWith({ reasoningLevel: "off" });
  });
});
