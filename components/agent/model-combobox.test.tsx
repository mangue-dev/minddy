// @vitest-environment jsdom
import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { ModelCombobox } from "./model-combobox";

/**
 * The provider step of the model picker (MIN-826): with several providers,
 * the list opens on them, and choosing one lists its models. The popover is
 * reduced to its open state; the command list is the real one.
 */

const catalogs: Record<string, { defaultModel: string; models: Array<{ id: string; name: string }> }> = {
  minddy: { defaultModel: "deepseek/deepseek-v4-flash", models: [{ id: "deepseek/deepseek-v4-flash", name: "DeepSeek" }] },
  anthropic: { defaultModel: "claude-sonnet-5", models: [{ id: "claude-sonnet-5", name: "Sonnet" }, { id: "claude-opus-5-5", name: "Opus" }] },
};
vi.mock("@/lib/use-agent-models-query", () => ({
  useAgentModelsQuery: (_scope: string, _capability: string, provider?: string | null) => {
    const catalog = catalogs[provider ?? "minddy"]!;
    return {
      provider: provider === "anthropic" ? "anthropic" : "openrouter",
      defaultModel: catalog.defaultModel,
      models: catalog.models,
      maxMultiplier: null, planId: null, recommended: [], loading: false,
    };
  },
}));
vi.mock("@/components/model-logo", () => ({ ModelLogo: () => null, ProviderLogo: () => null }));
vi.mock("@/components/ai-provider-label", () => ({
  ProviderOptionLabel: ({ option }: { option: { label: string } }) => <span>{option.label}</span>,
}));
const Open = createContext<{ open: boolean; set: (open: boolean) => void }>({ open: false, set: () => {} });
vi.mock("@/components/ui/responsive-popover", () => ({
  ResponsivePopover: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) =>
    <Open.Provider value={{ open, set: onOpenChange }}>{children}</Open.Provider>,
  ResponsivePopoverTrigger: ({ children }: { children: ReactNode }) => {
    const { set } = useContext(Open);
    return <div data-trigger onClick={() => set(true)}>{children}</div>;
  },
  ResponsivePopoverContent: ({ children }: { children: ReactNode }) => {
    const { open } = useContext(Open);
    return open ? <div data-content>{children}</div> : null;
  },
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const providers = [{ id: "minddy" as const, label: "minddy Cloud" }, { id: "anthropic" as const, label: "Anthropic" }];

async function render(props: Partial<Parameters<typeof ModelCombobox>[0]>) {
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ModelCombobox value="" onChange={() => {}} defaultLabel="Default" placeholder="Search"
        emptyLabel="None" loadingLabel="Loading" scope="assistant" {...props} />
    </NextIntlClientProvider>,
  ));
}
const options = () => [...host.querySelectorAll<HTMLElement>("[cmdk-item]")];
const click = (element: HTMLElement) => act(async () => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
const open = () => click(host.querySelector<HTMLElement>("[data-trigger]")!);

it("opens on the providers, then lists the chosen provider's models", async () => {
  const onSelect = vi.fn();
  await render({ providerStep: { providers, current: "minddy", onSelect } });
  await open();
  expect(options().map((option) => option.textContent)).toEqual(["minddy Cloud", "Anthropic"]);
  expect(host.querySelector("[cmdk-input]")).toBeNull();

  await click(options()[1]!);
  const content = host.querySelector("[data-content]")!;
  // A way back to the providers, and the provider's own default first.
  expect(content.querySelector("button")?.textContent).toBe("Anthropic");
  expect(options()[0]!.textContent).toContain("Claude Sonnet 5");
  expect(options().map((option) => option.textContent)).toContainEqual(expect.stringContaining("Claude Opus 5.5"));

  await click(options().find((option) => option.textContent?.includes("Claude Opus 5.5"))!);
  expect(onSelect).toHaveBeenCalledWith("anthropic", "claude-opus-5-5");
});

it("goes back to the providers from the model list", async () => {
  await render({ providerStep: { providers, current: "minddy", onSelect: vi.fn() } });
  await open();
  await click(options()[1]!);
  await click(host.querySelector<HTMLElement>("[data-content] button")!);
  expect(options().map((option) => option.textContent)).toEqual(["minddy Cloud", "Anthropic"]);
});

it("opens straight on the models without a provider choice", async () => {
  const onChange = vi.fn();
  await render({ onChange, providerStep: { providers: [providers[0]!], current: "minddy", onSelect: vi.fn() } });
  await open();
  expect(host.querySelector("[cmdk-input]")).not.toBeNull();
  await click(options().find((option) => option.textContent?.includes("DeepSeek V4 Flash") && !option.textContent.includes("Default"))!);
  expect(onChange).toHaveBeenCalledWith("deepseek/deepseek-v4-flash");
});
