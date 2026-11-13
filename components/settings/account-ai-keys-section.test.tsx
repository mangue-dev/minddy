// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { AiKey } from "@/lib/agent-keys-api";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { AccountAiKeysSection } from "./account-ai-keys-section";

const minddy: AiProviderOption = { id: "minddy", label: "minddy Cloud" };
const anthropic: AiProviderOption = { id: "anthropic", label: "Anthropic" };

const h = vi.hoisted(() => ({
  keys: [] as AiKey[],
  saveNumo: vi.fn(),
  setRoute: vi.fn(),
  numo: null as null | { provider: string; default_model: string | null; application_model: string | null; model_locked?: boolean; providers: unknown[] },
  numoError: null as Error | null,
  routes: {} as Record<string, string>,
  options: [] as unknown[],
  saveDecisions: vi.fn(),
  decisions: null as null | {
    instance_engine: "model" | "llm"; engine: "model" | "llm" | null; provider: string | null;
    model: string | null; default_model: string | null; providers: unknown[];
  },
}));
vi.mock("@/lib/use-ai-decisions-query", () => ({
  useAiDecisionsQuery: () => ({ data: h.decisions ?? undefined, error: null }),
  useSaveAiDecisions: () => ({ mutate: h.saveDecisions }),
}));
vi.mock("@/lib/use-numo-preferences-query", () => ({
  useNumoPreferencesQuery: () => ({ data: h.numo ?? undefined, isPending: false, error: h.numoError }),
  useSaveNumoPreferences: () => ({ mutate: h.saveNumo }),
}));
vi.mock("@/lib/use-ai-routes-query", () => ({
  useAiRoutesQuery: () => ({ data: {
    routes: new Proxy(h.routes, { get: (target, usage: string) => target[usage] ?? "minddy" }),
    options: new Proxy({}, { get: () => h.options }),
  } }),
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
  ModelCombobox: ({ scope, value, onChange, disabled, providerChoice, capability }: { scope?: string; value: string; onChange: (value: string) => void; disabled: boolean; providerChoice?: string | null; capability?: string }) => (
    <select aria-label={`Fixture model ${scope}`} data-provider={providerChoice ?? ""} data-capability={capability ?? ""} value={value} disabled={disabled}
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
  h.routes = {};
  h.options = [minddy, anthropic];
  h.decisions = { instance_engine: "model", engine: null, provider: "minddy", model: null, default_model: null, providers: [minddy, anthropic] };
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

const anthropicKey = (featureModels: Record<string, string> = {}): AiKey => ({
  id: "key-anthropic", provider: "anthropic", key_prefix: "sk-ant", base_url: null,
  created_at: "2026-10-10", updated_at: "2026-10-10", last_used_at: null, validated_at: "2026-10-10",
  enabled_surfaces: [], feature_models: featureModels, supported_capabilities: ["text"], assigned_capabilities: [],
});

it("offers one provider per model role, never one per feature (MIN-954)", async () => {
  await render();
  const text = host.textContent ?? "";
  expect(text).toContain("General API credentials");
  for (const role of [messages.Account.aiRole_llm, messages.Account.aiRole_embedding,
    messages.Account.aiRole_transcription, messages.Account.aiRole_decision]) {
    expect(text).toContain(role);
  }
  for (const usage of ["Conversation titles", "Numo code work"]) expect(text).not.toContain(usage);
  // Language model, embeddings, speech to text, then the decisions' kind and provider (MIN-980).
  expect(providerSelects()).toHaveLength(5);
});

it("moves Numo conversations to another provider and restarts on that provider's default model", async () => {
  h.numo = { ...h.numo!, default_model: "provider/model" };
  await render();
  await change(providerSelects()[0]!, "anthropic");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "anthropic", default_model: null });
  expect(h.setRoute).not.toHaveBeenCalled();
});

it("saves Numo's default model for its current provider", async () => {
  h.numo = { ...h.numo!, provider: "anthropic" };
  await render();
  const model = host.querySelector<HTMLSelectElement>('select[aria-label="Fixture model assistant"]')!;
  expect(model.dataset.provider).toBe("anthropic");
  await change(model, "provider/model");
  expect(h.saveNumo).toHaveBeenCalledWith({ provider: "anthropic", default_model: "provider/model" });
});

it("offers no Numo model on minddy Cloud, where the instance sets it (MIN-954)", async () => {
  h.numo = { ...h.numo!, model_locked: true };
  await render();
  expect(host.querySelector('select[aria-label="Fixture model assistant"]')).toBeNull();
  // The provider stays a choice: a personal key brings the model back.
  expect(providerSelects()).toHaveLength(5);
});

it("routes the embedding role alone", async () => {
  await render();
  await change(providerSelects()[1]!, "anthropic");
  expect(h.setRoute).toHaveBeenCalledWith({ usage: "issue_embedding_model", provider: "anthropic" });
  expect(h.saveNumo).not.toHaveBeenCalled();
});

it("shows a key's model under its provider, and none for minddy Cloud", async () => {
  h.keys = [anthropicKey({ transcription_model: "provider/model" })];
  h.routes = { transcription_model: "anthropic" };
  await render();
  const byok = [...host.querySelectorAll<HTMLSelectElement>('select[aria-label="Fixture model byok"]')];
  expect(byok).toHaveLength(1);
  expect(byok[0]!.value).toBe("provider/model");
  expect(byok[0]!.dataset.provider).toBe("anthropic");
});

it("shows a single available provider as text rather than a choice", async () => {
  h.numo = { ...h.numo!, providers: [minddy] };
  h.options = [minddy];
  h.decisions = { ...h.decisions!, providers: [minddy] };
  await render();
  // Only the kind of model for decisions stays a choice.
  expect(providerSelects()).toHaveLength(1);
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

const decisionEngine = () => providerSelects()[3]!;
const decisionProvider = () => providerSelects()[4]!;

it("picks the kind of model for decisions, the instance's kind following the administrator (MIN-980)", async () => {
  await render();
  expect(decisionEngine().value).toBe("model");
  expect([...decisionEngine().options].map((option) => option.textContent))
    .toEqual(["Decision model (default)", "Language model"]);
  await change(decisionEngine(), "llm");
  expect(h.saveDecisions).toHaveBeenCalledWith({ engine: "llm" });

  h.decisions = { ...h.decisions!, engine: "llm" };
  await render();
  expect(decisionEngine().value).toBe("llm");
  await change(decisionEngine(), "model");
  // Choosing the instance's kind clears the account's own choice.
  expect(h.saveDecisions).toHaveBeenLastCalledWith({ engine: null });
});

it("follows an instance that decides with a language model (MIN-980)", async () => {
  h.decisions = { ...h.decisions!, instance_engine: "llm" };
  await render();
  expect(decisionEngine().value).toBe("llm");
  expect(decisionEngine().selectedOptions[0]!.textContent).toBe("Language model (default)");
});

it("routes decisions to one of the providers that can answer them (MIN-980)", async () => {
  const openrouter: AiProviderOption = { id: "openrouter", label: "OpenRouter" };
  h.decisions = { ...h.decisions!, providers: [minddy, openrouter] };
  await render();
  expect(decisionProvider().value).toBe("minddy");
  expect([...decisionProvider().options].map((option) => option.value)).toEqual(["minddy", "openrouter"]);
  await change(decisionProvider(), "openrouter");
  expect(h.saveDecisions).toHaveBeenCalledWith({ provider: "openrouter" });
});

it("lists a key's decision models, or its language models once the switch is on (MIN-980)", async () => {
  h.decisions = { ...h.decisions!, provider: "openrouter", model: "typesafe/jev-1.13", default_model: "typesafe/jev-1.13" };
  await render();
  let pickers = [...host.querySelectorAll<HTMLSelectElement>('select[aria-label="Fixture model byok"]')];
  expect(pickers).toHaveLength(1);
  expect(pickers[0]!.dataset.capability).toBe("decision");
  expect(pickers[0]!.dataset.provider).toBe("openrouter");
  await change(pickers[0]!, "");
  expect(h.saveDecisions).toHaveBeenCalledWith({ model: null });

  h.decisions = { ...h.decisions!, engine: "llm", model: null };
  await render();
  pickers = [...host.querySelectorAll<HTMLSelectElement>('select[aria-label="Fixture model byok"]')];
  expect(pickers[0]!.dataset.capability).toBe("text");
});

it("offers no decision model on minddy Cloud, where the instance sets it (MIN-980)", async () => {
  h.decisions = { ...h.decisions!, provider: "minddy" };
  await render();
  expect(host.querySelector('select[aria-label="Fixture model byok"]')).toBeNull();
});
