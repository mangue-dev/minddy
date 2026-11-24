// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LlmChoice } from "./llm-model-picker";

type SliderProps = {
  value: number[];
  max: number;
  onValueChange: (values: number[]) => void;
  onValueCommit: (values: number[]) => void;
};
const h = vi.hoisted(() => ({
  slider: null as null | SliderProps,
  combobox: null as null | { value: string; onChange: (value: string) => void; scope: string; defaultLabel: string },
  scopes: [] as string[],
  levels: ["off", "low", "medium", "high"] as string[],
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-agent-models-query", () => ({
  useAgentModelsQuery: (scope: string) => {
    h.scopes.push(scope);
    return {
      provider: "anthropic",
      defaultReasoning: "medium",
      models: [
        { id: "app-model", reasoning: { efforts: ["low", "medium", "high"], mandatory: false } },
        { id: "light-model", reasoning: { efforts: ["low"], mandatory: false } },
      ],
    };
  },
  useReasoningLevelsFor: (_model: string, scope: string) => {
    h.scopes.push(scope);
    return h.levels.filter((level) => level !== "off");
  },
}));
vi.mock("@/components/agent/model-combobox", () => ({
  ModelCombobox: (props: { value: string; onChange: (value: string) => void; scope: string; defaultLabel: string }) => {
    h.combobox = props;
    return null;
  },
}));
vi.mock("@/components/model-logo", () => ({ ModelLogo: () => null, ProviderLogo: () => null }));
const pass = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: pass, TooltipContent: pass, TooltipTrigger: pass }));
vi.mock("@/components/ui/responsive-popover", () => ({
  ResponsivePopover: pass, ResponsivePopoverContent: pass, ResponsivePopoverTrigger: pass,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: { children?: ReactNode; variant?: string; size?: string }) =>
    createElement("button", props, children),
}));
vi.mock("@/components/ui/slider", () => ({
  Slider: (props: SliderProps) => {
    h.slider = props;
    return null;
  },
}));

const { LlmModelPicker } = await import("./llm-model-picker");

let root: Root;
let host: HTMLDivElement;
const onChange = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onChange.mockReset();
  h.slider = null;
  h.scopes = [];
  h.levels = ["off", "low", "medium", "high"];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(value: LlmChoice) {
  await act(() => root.render(createElement(LlmModelPicker, {
    provider: "anthropic", value, applicationModel: "app-model", onChange, ariaLabel: "Default Numo model",
  })));
}

it("shows the instance's level until the account chooses one", async () => {
  await render({ model: null, reasoningLevel: null });
  const trigger = host.querySelector('button[role="combobox"]')!;
  expect(trigger.textContent).toContain("App Model");
  expect(trigger.textContent).toContain("reasoningMedium");
  // off, low, medium, high: medium is the third stop.
  expect(h.slider).toMatchObject({ value: [2], max: 3 });
});

it("saves the level once the slider is released, not while it moves", async () => {
  await render({ model: null, reasoningLevel: null });
  await act(async () => h.slider!.onValueChange([3]));
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('button[role="combobox"]')!.textContent).toContain("reasoningHigh");
  await act(async () => h.slider!.onValueCommit([3]));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ model: null, reasoningLevel: "high" });
});

it("keeps a chosen level on another model, at its nearest stop", async () => {
  await render({ model: null, reasoningLevel: "high" });
  await act(async () => h.combobox!.onChange("light-model"));
  expect(onChange).toHaveBeenCalledWith({ model: "light-model", reasoningLevel: "low" });
});

it("leaves a level that follows the instance following it on another model", async () => {
  await render({ model: null, reasoningLevel: null });
  await act(async () => h.combobox!.onChange("light-model"));
  expect(onChange).toHaveBeenCalledWith({ model: "light-model", reasoningLevel: null });
});

it("resets both choices to the defaults", async () => {
  await render({ model: "light-model", reasoningLevel: "low" });
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="numoModelReset"]')!.click());
  expect(onChange).toHaveBeenCalledWith({ model: null, reasoningLevel: null });
});

it("lists the platform's models with the administration's labels and built-in level", async () => {
  await act(() => root.render(createElement(LlmModelPicker, {
    scope: "platform", value: { model: null, reasoningLevel: null }, applicationModel: "app-model", onChange,
    ariaLabel: "Model", defaultReasoning: "high", labels: { default: "Default model", reset: "Reset", model: "Model" },
  })));
  expect(h.scopes).not.toContain("assistant");
  expect(h.combobox).toMatchObject({ scope: "platform", defaultLabel: "Default model" });
  // The built-in level wins over the catalog's medium.
  expect(host.querySelector('button[role="combobox"]')!.textContent).toContain("reasoningHigh");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Reset"]')!.click());
  expect(onChange).not.toHaveBeenCalled();
});
