// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AiKey } from "@/lib/agent-keys-api";
import { AccountAiKeysSection, NumoModelPreference } from "./account-ai-keys-section";

const h = vi.hoisted(() => ({
  keys: [] as AiKey[], invalidate: vi.fn(), update: vi.fn(),
  saveNumo: vi.fn(), numoModel: null as string | null,
  numoProvider: "openrouter", numoError: null as Error | null,
}));
vi.mock("@/lib/use-numo-preferences-query", () => ({
  numoPreferencesQueryKey: ["numo-preferences"],
  useNumoPreferencesQuery: () => ({ data: { provider: h.numoProvider, default_model: h.numoModel, application_model: "provider/model" }, isPending: false, error: h.numoError }),
  saveNumoPreferencesApi: h.saveNumo,
}));
vi.mock("@/components/model-logo", () => ({ ProviderLogo: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }));
vi.mock("@/lib/use-ai-keys-query", () => ({ aiKeysQueryKey: ["keys"], useAiKeysQuery: () => ({ keys: h.keys, loading: false }) }));
vi.mock("@/lib/use-agent-models-query", () => ({
  agentModelsQueryKey: ["models"], useAgentModelsQuery: () => ({ defaultModel: "provider/model" }),
}));
vi.mock("@/lib/agent-keys-api", () => ({
  updateAiKeyPreferencesApi: h.update, assignAiCapabilityApi: vi.fn(),
}));
vi.mock("@/components/settings/byok-connect-panel", () => ({ ByokConnectPanel: () => <div>General API credentials</div> }));
vi.mock("@/components/agent/model-combobox", () => ({ ModelCombobox: ({ scope, value, onChange, disabled, triggerContent }: { scope?: string; value: string; onChange: (value: string) => void; disabled: boolean; triggerContent?: ReactNode }) => <div data-model-scope={scope ?? "code"}>{triggerContent}<select aria-label="Fixture model" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">App default</option><option value="provider/model">Specific model</option></select></div> }));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  SettingsRow: ({ label, control, children }: { label: ReactNode; control: ReactNode; children: ReactNode }) => <article>{label}{control}{children}</article>,
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
  h.numoModel = null;
  h.numoProvider = "openrouter";
  h.numoError = null;
  h.saveNumo.mockResolvedValue(undefined);
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

it("shows only the general AI routing, with no code-agent settings (MIN-721)", async () => {
  h.keys = [apiKey(["assistant", "automations", "agent"])];
  await render();
  const general = host.querySelector('[aria-labelledby="minddy-ai-title"]')!;
  expect(general.textContent).toContain("General API credentials");
  expect(general.textContent).toContain("Numo conversations and comments");
  expect(general.textContent).not.toContain(messages.Account.byokSurface_agent);
  expect(host.querySelector('[data-model-scope="code"]')).toBeNull();
  expect(host.textContent).not.toContain("Sandbox");
});

async function renderNumo() {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><NumoModelPreference /></NextIntlClientProvider>));
}
async function chooseNumo(model: string) {
  const select = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { select.value = model; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("saves a Numo model for the active provider and refreshes settings and conversation pickers", async () => {
  await renderNumo();
  await chooseNumo("provider/model");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "openrouter", default_model: "provider/model" });
  expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["numo-preferences"] });
  expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["models"] });
});
it("restores a saved Numo choice and clears it explicitly to the application default", async () => {
  h.numoModel = "provider/model";
  h.numoProvider = "anthropic";
  await renderNumo();
  expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("provider/model");
  await chooseNumo("");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "anthropic", default_model: null });
});
it("retains the saved choice when saving fails and reports a load failure", async () => {
  h.numoModel = "provider/model";
  h.saveNumo.mockRejectedValueOnce(new Error("Fixture save failure"));
  await renderNumo();
  await chooseNumo("");
  expect(h.invalidate).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("provider/model");
  h.numoError = new Error("Fixture load failure");
  await renderNumo();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(messages.Account.numoModelLoadError);
});
