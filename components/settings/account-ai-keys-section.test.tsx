// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AiKey } from "@/lib/agent-keys-api";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { AccountAiKeysSection } from "./account-ai-keys-section";

const minddy: AiProviderOption = { id: "minddy", label: "minddy Cloud", fallbackCapabilities: [] };
const anthropic: AiProviderOption = { id: "anthropic", label: "Anthropic", fallbackCapabilities: [] };

const h = vi.hoisted(() => ({
  keys: [] as AiKey[],
  saveNumo: vi.fn(),
  setRoute: vi.fn(),
  numo: null as null | { provider: string; default_model: string | null; application_model: string | null; providers: unknown[] },
  numoError: null as Error | null,
  routes: { assistant: "minddy", automations: "minddy", voice: "minddy", feedback: "minddy" } as Record<string, string>,
  options: [] as unknown[],
}));
vi.mock("@/lib/use-numo-preferences-query", () => ({
  useNumoPreferencesQuery: () => ({ data: h.numo ?? undefined, isPending: false, error: h.numoError }),
  useSaveNumoPreferences: () => ({ mutate: h.saveNumo }),
}));
vi.mock("@/lib/use-ai-routes-query", () => ({
  useAiRoutesQuery: () => ({ data: { routes: h.routes, options: {
    assistant: h.options, automations: h.options, voice: h.options, feedback: h.options,
  } } }),
  useSetAiRoute: () => ({ mutate: h.setRoute }),
}));
vi.mock("@/components/ai-provider-label", () => ({
  ProviderOptionLabel: ({ option }: { option: { label: string } }) => <span>{option.label}</span>,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/use-ai-keys-query", () => ({ aiKeysQueryKey: ["keys"], useAiKeysQuery: () => ({ keys: h.keys, loading: false }) }));
vi.mock("@/lib/agent-keys-api", () => ({ updateAiKeyPreferencesApi: vi.fn() }));
vi.mock("@/components/settings/byok-connect-panel", () => ({ ByokConnectPanel: () => <div>General API credentials</div> }));
vi.mock("@/components/agent/model-combobox", () => ({
  ModelCombobox: ({ scope, value, onChange, disabled, providerChoice }: { scope?: string; value: string; onChange: (value: string) => void; disabled: boolean; providerChoice?: string | null }) => (
    <select aria-label={`Fixture model ${scope}`} data-provider={providerChoice ?? ""} value={value} disabled={disabled}
      onChange={(event) => onChange(event.target.value)}>
      <option value="">App default</option><option value="provider/model">Specific model</option>
    </select>
  ),
}));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  SettingsRow: ({ label, hint, control, children }: { label: ReactNode; hint?: ReactNode; control: ReactNode; children: ReactNode }) => <article>{label}<p>{hint}</p>{control}{children}</article>,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/ui/select", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Select: ({ value, disabled, onValueChange, children }: { value: string; disabled?: boolean; onValueChange: (value: string) => void; children: ReactNode }) => <select aria-label="Fixture provider" value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.keys = [];
  h.numo = { provider: "minddy", default_model: null, application_model: "provider/model", providers: [minddy, anthropic] };
  h.numoError = null;
  h.routes = { assistant: "minddy", automations: "minddy", voice: "minddy", feedback: "minddy" };
  h.options = [minddy, anthropic];
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
const providerSelects = () => [...host.querySelectorAll<HTMLSelectElement>('select[aria-label="Fixture provider"]')];
async function change(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

it("lists the providers, then one provider per usage, with no code-agent settings (MIN-721, MIN-826)", async () => {
  await render();
  const text = host.textContent ?? "";
  expect(text).toContain("General API credentials");
  for (const usage of ["Numo", "Automations", "Voice dictation", "Feedback"]) expect(text).toContain(usage);
  expect(text).not.toContain("Numo code work");
  expect(providerSelects()).toHaveLength(4);
});

it("moves Numo to another provider and restarts on that provider's default model", async () => {
  h.numo = { ...h.numo!, default_model: "provider/model" };
  await render();
  await change(providerSelects()[0]!, "anthropic");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "anthropic", default_model: null });
});

it("saves Numo's default model for its current provider", async () => {
  h.numo = { ...h.numo!, provider: "anthropic" };
  await render();
  const model = host.querySelector<HTMLSelectElement>('select[aria-label="Fixture model assistant"]')!;
  expect(model.dataset.provider).toBe("anthropic");
  await change(model, "provider/model");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "anthropic", default_model: "provider/model" });
  await change(model, "");
  expect(h.saveNumo).toHaveBeenLastCalledWith({ provider: "anthropic", default_model: null });
});

it("routes one usage alone and says what stays on minddy Cloud", async () => {
  h.options = [minddy, { ...anthropic, fallbackCapabilities: ["embedding"] }];
  h.routes = { ...h.routes, automations: "anthropic" };
  await render();
  expect(host.textContent).toContain("Search by meaning stays on minddy Cloud.");
  await change(providerSelects()[2]!, "anthropic");
  expect(h.setRoute).toHaveBeenCalledWith({ surface: "voice", provider: "anthropic" });
  expect(h.saveNumo).not.toHaveBeenCalled();
});

it("shows a single available provider as text rather than a choice", async () => {
  h.numo = { ...h.numo!, providers: [minddy] };
  h.options = [minddy];
  await render();
  expect(providerSelects()).toHaveLength(0);
  expect(host.textContent).toContain("minddy Cloud");
});

it("reports a preference that never loaded, but keeps a loaded one usable after a refresh failure (MIN-722)", async () => {
  h.numoError = new Error("Fixture refresh failure");
  await render();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Fixture model assistant"]')!.disabled).toBe(false);
  h.numo = null;
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(messages.Account.numoModelLoadError);
});
