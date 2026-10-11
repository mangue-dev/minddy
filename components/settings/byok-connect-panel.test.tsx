// @vitest-environment jsdom
import { act, type ReactNode, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AiKey } from "@/lib/agent-keys-api";
import { ByokConnectPanel } from "./byok-connect-panel";

const h = vi.hoisted(() => ({ keys: [] as AiKey[], add: vi.fn(), remove: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/use-ai-keys-query", () => ({ aiKeysQueryKey: ["keys"], useAiKeysQuery: () => ({ keys: h.keys, loading: false }) }));
vi.mock("@/lib/agent-keys-api", () => ({ addAiKeyApi: h.add, deleteAiKeyApi: h.remove }));
vi.mock("@/lib/runtime-config-provider", () => ({ useRuntimeConfig: () => ({ capabilities: { managedAi: { configured: true } } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("@/components/model-logo", () => ({ ProviderLogo: () => null }));
vi.mock("./settings-ui", () => ({ SettingsRow: ({ label, control }: { label: ReactNode; control: ReactNode }) => <div>{label}{control}</div> }));
vi.mock("mangue-ui", () => {
  const content = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "), toast: { success: vi.fn(), error: vi.fn() },
    Button: ({ variant: _variant, size: _size, ...props }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
    Input: (props: ComponentProps<"input">) => <input {...props} />, Spinner: () => null,
    Select: ({ value, disabled, onValueChange, children }: { value: string; disabled?: boolean; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null, SelectLabel: () => null, SelectSeparator: () => null,
    SelectContent: content, SelectGroup: content,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
    AlertDialogAction: content, AlertDialogCancel: content, AlertDialogContent: content,
    AlertDialogDescription: content, AlertDialogFooter: content, AlertDialogHeader: content, AlertDialogTitle: content,
  };
});
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.keys = []; h.add.mockResolvedValue(undefined); h.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(mode?: "onboarding" | "settings") {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><ByokConnectPanel mode={mode} /></NextIntlClientProvider>));
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label)!;
  await act(async () => button.click());
}
function key(provider: AiKey["provider"]): AiKey {
  return { id: provider, provider, key_prefix: "fixture-prefix", base_url: null,
    created_at: "2026-10-11", updated_at: "2026-10-11", last_used_at: null, validated_at: "2026-10-11",
    enabled_surfaces: ["assistant"], feature_models: {}, supported_capabilities: ["text"], assigned_capabilities: [] };
}
it("keeps several connected providers visible and offers only unconnected providers for addition", async () => {
  h.keys = [key("openrouter"), key("openai")];
  await render("settings");
  expect(host.textContent).toContain("OpenRouter"); expect(host.textContent).toContain("OpenAI");
  expect(host.querySelector("select")).toBeNull();
  expect(host.textContent).not.toContain(messages.Account.aiProviderMinddyHint);
  await click(messages.Account.aiAddProvider);
  const choices = Array.from(host.querySelectorAll("option")).map((item) => item.value);
  expect(choices).toContain("anthropic"); expect(choices).not.toContain("openrouter");
  expect(choices).not.toContain("openai"); expect(choices).not.toContain("minddy");
  await click(messages.Common.cancel);
  expect(host.querySelector("select")).toBeNull(); expect(h.remove).not.toHaveBeenCalled();
  expect(host.textContent).toContain("OpenRouter"); expect(host.textContent).toContain("OpenAI");
});
it("adds a provider without replacing or deleting existing connections", async () => {
  h.keys = [key("openrouter"), key("openai")];
  await render("settings"); await click(messages.Account.aiAddProvider);
  const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "fixture-key");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(messages.Account.aiKeySave);
  expect(h.add).toHaveBeenCalledWith({ provider: "anthropic", key: "fixture-key", baseUrl: undefined });
  expect(h.remove).not.toHaveBeenCalled(); expect(host.querySelector("select")).toBeNull();
  expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["numo-preferences"] });
  expect(host.textContent).toContain("OpenRouter"); expect(host.textContent).toContain("OpenAI");
});
it("preserves the onboarding managed-provider choice and initially open connection form", async () => {
  await render();
  expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("minddy");
  expect(host.querySelector("option[value='minddy']")).not.toBeNull();
  expect(host.querySelector("input[type='password']")).toBeNull();
  expect(host.textContent).not.toContain(messages.Account.aiAddProvider);
});
