// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AiKey } from "@/lib/agent-keys-api";
import { AccountAiKeysSection } from "./account-ai-keys-section";

const h = vi.hoisted(() => ({
  keys: [] as AiKey[], engine: "opencode", invalidate: vi.fn(), update: vi.fn(),
  saveEngine: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("@/lib/use-ai-keys-query", () => ({ aiKeysQueryKey: ["keys"], useAiKeysQuery: () => ({ keys: h.keys, loading: false }) }));
vi.mock("@/lib/use-agent-preferences-query", () => ({
  agentPreferencesQueryKey: ["preferences"],
  useAgentPreferencesQuery: () => ({ defaultEngine: h.engine, nativeAgentsEnabled: true,
    defaultModel: "provider/model", defaultReasoningLevel: "high", loading: false }),
}));
vi.mock("@/lib/use-agent-models-query", () => ({
  agentModelsQueryKey: ["models"], useAgentModelsQuery: () => ({ defaultModel: "provider/model" }),
  useReasoningLevelsFor: () => ["high"],
}));
vi.mock("@/lib/agent-keys-api", () => ({
  updateAiKeyPreferencesApi: h.update, saveAgentEnginePreferenceApi: h.saveEngine,
  assignAiCapabilityApi: vi.fn(), saveAgentPreferencesApi: vi.fn(),
}));
vi.mock("@/components/settings/byok-connect-panel", () => ({ ByokConnectPanel: () => <div>General API credentials</div> }));
vi.mock("./account-sandbox-section", () => ({ AccountSandboxSection: ({ embedded }: { embedded: boolean }) => <div data-embedded={embedded}>Sandbox</div> }));
vi.mock("./native-agent-connections", () => ({
  NativeAgentConnections: ({ children, openCodeProviderLabel }: { children: ReactNode; openCodeProviderLabel: string }) =>
    <section data-code-agent><h2>Code agent</h2><span>OpenCode ({openCodeProviderLabel})</span>{children}</section>,
}));
vi.mock("@/components/agent/model-combobox", () => ({ ModelCombobox: ({ scope }: { scope?: string }) => <div data-model-scope={scope ?? "code"}>Model</div> }));
vi.mock("@/components/agent/reasoning-combobox", () => ({ ReasoningCombobox: () => <div data-reasoning>Reasoning</div> }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  SettingsRow: ({ label, control, children }: { label: ReactNode; control: ReactNode; children: ReactNode }) => <article>{label}{control}{children}</article>,
  SettingsEmpty: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("mangue-ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Select: ({ value, disabled, onValueChange, children }: { value: string; disabled?: boolean; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />,
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.engine = "opencode";
  h.keys = [];
  h.update.mockResolvedValue(undefined);
  h.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><AccountAiKeysSection /></NextIntlClientProvider>));
}
function apiKey(surfaces: AiKey["enabled_surfaces"]): AiKey {
  return { id: "text-key", provider: "openrouter", key_prefix: "prefix", base_url: null,
    created_at: "2026-10-10", updated_at: "2026-10-10", last_used_at: null, validated_at: "2026-10-10",
    enabled_surfaces: surfaces, feature_models: {}, supported_capabilities: ["text"], assigned_capabilities: ["text"] };
}

it("separates general AI from code model controls and includes sandbox under the code agent", async () => {
  h.keys = [apiKey(["assistant", "automations", "agent"])];
  await render();
  const general = host.querySelector('[aria-labelledby="minddy-ai-title"]')!;
  const code = host.querySelector("[data-code-agent]")!;
  expect(general.textContent).toContain("General API credentials");
  expect(general.textContent).toContain("Numo conversations and comments");
  expect(general.textContent).not.toContain(messages.Account.byokSurface_agent);
  expect(general.querySelector('[data-model-scope="code"]')).toBeNull();
  expect(code.querySelector('[data-model-scope="code"]')).not.toBeNull();
  expect(code.querySelector("[data-reasoning]")).not.toBeNull();
  expect(code.querySelector('[data-embedded="true"]')).not.toBeNull();
  expect(code.textContent).toContain("OpenCode (OpenRouter)");
});

it("changes OpenCode funding without changing general AI assignments", async () => {
  h.keys = [apiKey(["assistant", "voice", "agent"])];
  await render();
  const select = host.querySelector<HTMLSelectElement>("[data-code-agent] select")!;
  await act(() => { select.value = "minddy"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(h.update).toHaveBeenCalledWith({ key_id: "text-key", enabled_surfaces: ["assistant", "voice"] });
  expect(h.invalidate).toHaveBeenCalledTimes(3);
  expect(h.saveEngine).not.toHaveBeenCalled();
  h.keys = [apiKey(["assistant", "voice"])];
  await render();
  expect(host.querySelector("[data-code-agent]")?.textContent).toContain(`OpenCode (${messages.Account.aiProviderMinddy})`);
  await act(() => { select.value = "text-key"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(h.update).toHaveBeenLastCalledWith({ key_id: "text-key", enabled_surfaces: ["assistant", "voice", "agent"] });
});

it.each(["codex", "claude_code"])("hides API funding and model controls for %s while keeping general AI and sandbox", async (engine) => {
  h.engine = engine;
  h.keys = [apiKey(["assistant", "agent"])];
  await render();
  const code = host.querySelector("[data-code-agent]")!;
  expect(code.querySelector("select")).toBeNull();
  expect(code.querySelector('[data-model-scope="code"]')).toBeNull();
  expect(code.querySelector("[data-reasoning]")).toBeNull();
  expect(code.textContent).toContain("Sandbox");
  expect(host.querySelector('[aria-labelledby="minddy-ai-title"]')?.textContent).toContain("Numo conversations and comments");
  expect(h.update).not.toHaveBeenCalled();
});
