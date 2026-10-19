// @vitest-environment jsdom
import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoutineDetail } from "@/components/routines/routine-detail";
import { ObjectiveDetail } from "@/components/objective-detail";
import type { Routine } from "@/lib/routines-api";
import type { Objective } from "@/lib/types";

const state = vi.hoisted(() => ({ reset: vi.fn(), toast: vi.fn(), push: vi.fn(),
  runs: [] as { id: string; kind: string; numo_conversation_id?: string; created_at: string; status: string }[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en", useNow: () => new Date("2026-10-13T00:00:00Z"), useFormatter: () => ({ dateTime: () => "October 13", number: (value: number) => String(value) }) }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const { Fragment } = await import("react");
  const box = ({ children }: { children?: ReactNode }) => <Fragment>{children}</Fragment>;
  const button = ({ children, onClick, onSelect, disabled, "aria-label": label }: { children?: ReactNode; onClick?: () => void; onSelect?: () => void; disabled?: boolean; "aria-label"?: string }) => <button disabled={disabled} aria-label={label} onClick={onClick ?? onSelect}>{children}</button>;
  return { Button: button, Badge: box, DropdownMenu: box, DropdownMenuTrigger: box, DropdownMenuContent: box, DropdownMenuItem: button,
    DropdownMenuSeparator: () => null, Popover: box, PopoverContent: box, PopoverTrigger: box,
    ConfirmDeleteDialog: () => null, Skeleton: () => null, Switch: () => null,
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "), toast: { error: state.toast, info: vi.fn(), success: vi.fn() } };
})());
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/badge", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Badge: stubs.Badge };
});
vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), DropdownMenu: stubs.DropdownMenu, DropdownMenuTrigger: stubs.DropdownMenuTrigger, DropdownMenuContent: stubs.DropdownMenuContent, DropdownMenuItem: stubs.DropdownMenuItem, DropdownMenuSeparator: stubs.DropdownMenuSeparator };
});
vi.mock("@/components/ui/popover", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Popover: stubs.Popover, PopoverContent: stubs.PopoverContent, PopoverTrigger: stubs.PopoverTrigger };
});
vi.mock("@/components/ui/confirm-delete-dialog", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), ConfirmDeleteDialog: stubs.ConfirmDeleteDialog };
});
vi.mock("@/components/ui/skeleton", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Skeleton: stubs.Skeleton };
});
vi.mock("@/components/ui/switch", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Switch: stubs.Switch };
});
vi.mock("sonner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), toast: stubs.toast };
});
vi.mock("@/components/app-link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: state.push }) }));
vi.mock("@/components/app-content-header", () => ({ AppContentHeader: ({ children }: { children: ReactNode }) => <header>{children}</header> }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/empty-scene", () => ({ EmptyScene: () => null }));
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: ReactNode }) => <p>{children}</p> }));
vi.mock("@/components/routines/routine-prompt-field", () => ({ RoutinePromptField: ({ value, onChange }: { value: string; onChange: (text: string, mentions: []) => void }) => <textarea data-routine-draft value={value} onChange={(event) => onChange(event.target.value, [])} /> }));
vi.mock("@/components/routines/routine-trigger-fields", () => ({ RoutineTriggerFields: () => null, RoutineTriggerSummary: () => null }));
vi.mock("@/components/routines/routine-schedule-fields", () => ({ RoutineScheduleFields: () => null }));
vi.mock("@/components/routines/spend-cap-combobox", () => ({ SpendCapCombobox: () => null }));
vi.mock("@/components/settings/settings-ui", () => ({ SettingsRow: () => null }));
vi.mock("@/components/assistant/assistant-shell", () => ({ AssistantShell: ({ embeddedConversationId }: { embeddedConversationId: string }) => <p data-open-run={embeddedConversationId}>{embeddedConversationId}</p> }));
vi.mock("@/lib/use-agent-models-query", () => ({ useAgentModelsQuery: () => ({ routineSchedulingConfigured: true, loading: false }) }));
vi.mock("@/lib/use-routines-query", () => ({ useRoutineRunsQuery: () => ({ runs: state.runs, loading: false }), routineRunsQueryKey: (id: string) => ["routines", id, "runs"], routinesQueryKey: () => ["routines"], patchRoutineInCache: vi.fn() }));
vi.mock("@/lib/use-scroll-fade", () => ({ useScrollFade: () => ({ ref: null, scrollProps: {}, edges: { start: false, end: false } }) }));
vi.mock("@/lib/use-mention-sources", () => ({ useDescriptionMentions: () => ({}) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/use-repository-skills", () => ({ useRepositorySkills: () => ({ skills: [] }) }));
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: { children: ReactNode }) => children, TooltipTrigger: ({ children }: { children: ReactNode }) => children, TooltipContent: () => null }));
vi.mock("@/components/pull-requests/pr-state-badge", () => ({ PR_STATE_STYLES: {}, PrStateBadge: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/use-objective-resources", () => ({ useObjectiveResources: () => ({ resources: [], add: vi.fn(), remove: vi.fn(), rename: vi.fn() }) }));
vi.mock("@/lib/use-objective-timeline", () => ({ useObjectiveTimeline: () => ({ items: [], addComment: vi.fn(), updateComment: vi.fn(), deleteComment: vi.fn(), deleteAttachment: vi.fn() }) }));
vi.mock("@/lib/use-objective-dictation", () => ({ useObjectiveDictation: () => ({ busy: false, onTranscript: vi.fn(), reset: state.reset }) }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: [] }), objectiveProgress: () => ({ done: 0, total: 0, percent: 0 }) }));
vi.mock("@/lib/keyboard/use-mod-shortcut", () => ({ useModKey: () => "⌘" }));
// Description documents (MIN-728) have their own tests; these surfaces open
// their Markdown.
vi.mock("@/lib/use-rich-document", () => ({
  useRichDocument: () => ({ document: null, remember: () => {} }),
}));
vi.mock("@/lib/use-description-collaboration", () => ({
  useDescriptionCollaboration: () => ({
    status: "unavailable", doc: null, collaboration: null,
    flush: async () => true, hasUnsavedChanges: () => false,
  }),
}));
vi.mock("@/components/editor/document-editor-lazy", async () => {
  const { useState } = await import("react");
  return { useIdleDocumentEditorPreload: () => {}, LazyDocumentEditor: ({ value, onEdit }: { value: string; onEdit: () => void }) => {
    const [draft, setDraft] = useState(value);
    return <textarea data-objective-description value={draft} onChange={(event) => { setDraft(event.target.value); onEdit(); }} />;
  } };
});
vi.mock("@/components/issue-property-fields", () => ({ PropertyRow: () => null, AssigneeValue: () => null, DueDateValue: () => null }));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/objective-progress", () => ({ ObjectiveProgressStat: () => null }));
vi.mock("@/components/objective-momentum", () => ({ ObjectiveMomentum: () => null }));
vi.mock("@/components/objective-feedback-section", () => ({ ObjectiveFeedbackSection: () => null }));
vi.mock("@/components/objective-resources-section", () => ({ ObjectiveResourcesSection: () => null }));
vi.mock("@/components/objective-relations-section", () => ({ ObjectiveRelationsSection: () => null }));
vi.mock("@/components/issue-timeline", () => ({ IssueActivity: () => null, CommentComposer: () => null }));
vi.mock("@/components/ai-elements/dictate-button", () => ({ DictateButton: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/issue-indicators", () => ({ ObjectiveStatusIndicator: () => null }));

let root: Root; let host: HTMLDivElement; let client: QueryClient; let routine: Routine; let objective: Objective;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); state.reset.mockClear(); state.toast.mockClear(); state.push.mockClear(); state.runs = [];
  routine = { id: "routine", project_id: "project", title: "Saved routine", prompt: "Saved instruction", enabled: true, prompt_mentions: [],
    frequency: "daily", hour: 9, minute: 0, weekdays: [], days_of_month: [], timezone: "UTC", next_run_at: null, max_spend_percent: 15, owner_id: "owner", base_branch: null, last_run_at: null, last_error: null,
    created_at: "2026-10-13T00:00:00Z", updated_at: "2026-10-13T00:00:00Z" };
  objective = { id: "objective", name: "Saved objective", description: "Saved description", status: "planned", color: "blue", project_id: "project" } as Objective;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); });
async function renderRoutine(active = true, owner = true) {
  await act(() => root.render(<QueryClientProvider client={client}><Activity mode={active ? "visible" : "hidden"}>
    <RoutineDetail routine={routine} project={null} isOwner={owner} onChanged={vi.fn()} onDeleted={vi.fn()} />
  </Activity></QueryClientProvider>));
}
async function renderObjective(active = true, save = vi.fn().mockResolvedValue(undefined)) {
  await act(() => root.render(<Activity mode={active ? "visible" : "hidden"}>
    <ObjectiveDetail objective={objective} projectId="project" projectKey="P" members={[]} issues={[]} onUpdate={save} onDelete={vi.fn()} onBusyChange={vi.fn()} />
  </Activity>));
}
async function type(field: HTMLTextAreaElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (label: string) => [...host.querySelectorAll("button")].find((element) => element.textContent === label)!;

it("preserves an unsaved routine draft through Activity returns and resets it only for a different routine", async () => {
  await renderRoutine(); await act(() => button("edit").click());
  const field = host.querySelector<HTMLTextAreaElement>("[data-routine-draft]")!; await type(field, "Unsent instruction");
  await renderRoutine(false); routine = { ...routine, title: "Remote renamed routine", prompt: "Remote instruction" }; await renderRoutine();
  expect(host.querySelector("[data-routine-draft]")).toBe(field); expect(field.value).toBe("Unsent instruction");
  expect(host.textContent).toContain("Remote renamed routine");
  routine = { ...routine, id: "different" }; await renderRoutine(); expect(host.querySelector("[data-routine-draft]")).toBeNull();
  expect(host.textContent).toContain("Remote instruction");
});

it("adopts accepted remote routine fields in an edit form that has not been changed", async () => {
  await renderRoutine(); await act(() => button("edit").click());
  routine = { ...routine, prompt: "Accepted remote instruction" }; await renderRoutine(false); await renderRoutine();
  expect(host.querySelector<HTMLTextAreaElement>("[data-routine-draft]")!.value).toBe("Accepted remote instruction");
});

it("keeps an opened run on retained returns while preserving owner-only routine editing", async () => {
  state.runs = [{ id: "run", kind: "numo", numo_conversation_id: "conversation", created_at: "2026-10-13T00:00:00Z", status: "completed" }];
  await renderRoutine(true, false); expect(button("edit")).toBeUndefined();
  await act(() => host.querySelector<HTMLTableRowElement>("tbody tr")!.click());
  expect(host.querySelector('[data-open-run="conversation"]')).not.toBeNull();
  await renderRoutine(false, false); await renderRoutine(true, false);
  expect(host.querySelector('[data-open-run="conversation"]')).not.toBeNull();
});

it("preserves dirty objective name and description plus dictation history across hidden remote updates", async () => {
  await renderObjective(); const name = host.querySelector<HTMLTextAreaElement>("textarea:not([data-objective-description])")!;
  const description = host.querySelector<HTMLTextAreaElement>("[data-objective-description]")!;
  await type(name, "Unsent objective name"); await type(description, "Unsent objective description");
  await renderObjective(false); objective = { ...objective, name: "Remote objective", description: "Remote description" }; await renderObjective();
  expect(host.querySelector("[data-objective-description]")).toBe(description);
  expect(name.value).toBe("Unsent objective name"); expect(description.value).toBe("Unsent objective description");
  expect(state.reset).not.toHaveBeenCalled();
  objective = { ...objective, id: "different" }; await renderObjective();
  expect(name.value).toBe("Remote objective"); expect(state.reset).toHaveBeenCalledOnce();
});

it("adopts accepted remote objective fields when clean and suspends hidden shortcuts", async () => {
  await renderObjective(); objective = { ...objective, name: "Remote objective", description: "Remote description" };
  await renderObjective(false); document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", metaKey: true, bubbles: true }));
  expect(state.push).not.toHaveBeenCalled(); await renderObjective();
  expect(host.querySelector<HTMLTextAreaElement>("textarea:not([data-objective-description])")!.value).toBe("Remote objective");
  expect(host.querySelector<HTMLTextAreaElement>("[data-objective-description]")!.value).toBe("Remote description");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", metaKey: true, bubbles: true }));
  expect(state.push).toHaveBeenCalledWith("/projects/project?objective=objective");
});

it("retains authoritative objective write failures on the preserved editing surface", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Forbidden")); await renderObjective(true, save);
  const name = host.querySelector<HTMLTextAreaElement>("textarea:not([data-objective-description])")!;
  await type(name, "Changed name"); await act(() => { name.focus(); name.blur(); });
  expect(save).toHaveBeenCalledWith("objective", { name: "Changed name" });
  expect(state.toast).toHaveBeenCalledWith("Forbidden");
});
