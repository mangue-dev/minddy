// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { IssueDraft, ObjectiveDraft } from "./drafts";
import type { Issue, Objective, PendingRelationInput, Project } from "./types";

const fixture = vi.hoisted(() => ({
  issues: [] as Issue[], objectives: [] as Objective[],
  drafts: [] as (IssueDraft | ObjectiveDraft)[], save: vi.fn(), remove: vi.fn(),
  mobile: false, smartFill: true, smartFillCreated: true, smartFillRelations: true, queryProjects: [] as (string | null)[],
  editorDocuments: [] as unknown[],
}));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => fixture.mobile }));
vi.mock("next-intl", () => ({ useTranslations: (namespace: string) =>
  (key: string, values?: Record<string, string>) => ((namespace.split(".").reduce<unknown>(
    (messages, part) => (messages as Record<string, unknown>)[part], en) as Record<string, string>)[key] ?? key)
    .replace(/\{(\w+)\}/g, (match, name: string) => values?.[name] ?? match),
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/ui/app-tooltip", () => ({ AppTooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/search-menu", () => ({ SearchMenu: ({ open, onOpenChange, trigger, children, searchValue, onSearchValueChange, container, modal }: {
  open: boolean; onOpenChange: (value: boolean) => void; trigger: React.ReactElement; children: React.ReactNode;
  searchValue: string; onSearchValueChange: (value: string) => void;
  container?: HTMLElement | null; modal?: boolean;
}) => React.createElement("div", { "data-picker": true },
  React.cloneElement(trigger, { onClick: () => onOpenChange(!open) } as React.HTMLAttributes<HTMLElement>),
  open && createPortal(React.createElement("div", { "data-modal": modal }, React.createElement("input", { "aria-label": "Search relations", value: searchValue, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onSearchValueChange(e.target.value) }), children), container ?? document.body)),
}));
// Stubs for the UI primitives the component under test renders.
const uiStubs = vi.hoisted(() => {
  let value: Promise<Record<string, unknown>> | undefined;
  return () => (value ??= (async () => {
  const wrap = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const item = ({ children, onSelect, disabled }: { children: React.ReactNode; onSelect: () => void; disabled?: boolean }) =>
    React.createElement("button", { type: "button", onClick: onSelect, disabled }, children);
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (next: boolean) => void; children: React.ReactNode }) =>
      open ? React.createElement("div", null, React.createElement("button", { type: "button", onClick: () => onOpenChange(false) }, "Close creation"), children) : null,
    // These stub contents deliberately leave keyboard ownership to the fallback.
    DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-dialog-content": true }, children),
    Sheet: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (next: boolean) => void; children: React.ReactNode }) =>
      open ? React.createElement("div", null, React.createElement("button", { type: "button", onClick: () => onOpenChange(false) }, "Close creation"), children) : null,
    SheetContent: wrap, SheetTitle: wrap, SheetTrigger: wrap, SheetClose: wrap,
    DialogTitle: wrap, DropdownMenuLabel: wrap, CommandGroup: wrap,
    CommandItem: item, DropdownMenuItem: item,
    Spinner: () => null,
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props, children),
    SplitButton: ({ children, menu, type, disabled }: { children: React.ReactNode; menu: React.ReactNode; type: "submit"; disabled: boolean }) =>
      React.createElement("div", null, React.createElement("button", { type, disabled }, children), menu),
    Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) =>
      React.createElement("button", { type: "button", onClick: () => onCheckedChange(!checked) }, "Create more toggle"),
    Popover: wrap, PopoverContent: () => null, PopoverTrigger: wrap,
  };
})());
});
vi.mock("sonner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), toast: stubs.toast };
});
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Dialog: stubs.Dialog, DialogContent: stubs.DialogContent, DialogTitle: stubs.DialogTitle };
});
vi.mock("@/components/ui/sheet", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Sheet: stubs.Sheet, SheetContent: stubs.SheetContent, SheetTitle: stubs.SheetTitle, SheetTrigger: stubs.SheetTrigger, SheetClose: stubs.SheetClose };
});
vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), DropdownMenuLabel: stubs.DropdownMenuLabel, DropdownMenuItem: stubs.DropdownMenuItem };
});
vi.mock("@/components/ui/command", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), CommandGroup: stubs.CommandGroup, CommandItem: stubs.CommandItem };
});
vi.mock("@/components/ui/spinner", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Spinner: stubs.Spinner };
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Button: stubs.Button };
});
vi.mock("@/components/ui/split-button", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), SplitButton: stubs.SplitButton };
});
vi.mock("@/components/ui/switch", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Switch: stubs.Switch };
});
vi.mock("@/components/ui/popover", async (importOriginal) => {
  const stubs = await uiStubs();
  return { ...(await importOriginal<Record<string, unknown>>()), Popover: stubs.Popover, PopoverContent: stubs.PopoverContent, PopoverTrigger: stubs.PopoverTrigger };
});
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: (project: string | null) => {
  fixture.queryProjects.push(project);
  return { issues: project ? fixture.issues : [], loading: false };
} }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/use-categories-query", () => ({ useCategoriesQuery: () => ({ categories: [] }) }));
// The real select is a searchable menu (SearchSelect, stubbed out here): one
// button per project is enough to drive "Create in".
vi.mock("@/components/creation-project-select", () => ({ CreationProjectSelect: ({ projects, value, onChange }: {
  projects: Project[]; value: string; onChange: (projectId: string) => void;
}) => React.createElement("div", { "data-create-in": value }, projects.map((p) =>
  React.createElement("button", { key: p.id, type: "button", onClick: () => onChange(p.id) }, `Create in ${p.name}`))),
}));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: (project: string | null) => ({ objectives: project ? fixture.objectives : [], loading: false }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user", user_metadata: { smart_fill: fixture.smartFill, smart_fill_created: fixture.smartFillCreated, smart_fill_relations: fixture.smartFillRelations } } }) }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock("@/lib/use-track-view", () => ({ useTrackView: vi.fn() }));
vi.mock("@/lib/use-mention-sources", () => ({ useDescriptionMentions: () => [] }));
vi.mock("@/lib/use-resource-mentions", () => ({ useResourceMentions: (base: unknown) => base }));
vi.mock("@/lib/use-arrow-field", () => ({ useArrowField: (ref: React.RefObject<HTMLTextAreaElement>) => ({ ref, read: (e: React.ChangeEvent<HTMLTextAreaElement>) => e.target.value }) }));
vi.mock("@/lib/use-attachment-uploads", () => ({ landedResources: () => [], useAttachmentUploads: () => ({
  inputs: [], pending: [], uploading: false, clear: vi.fn(), restore: vi.fn(), addFiles: vi.fn(),
}) }));
vi.mock("@/lib/use-drafts", () => ({ useDrafts: () => ({
  drafts: fixture.drafts, find: (id: string) => fixture.drafts.find((draft) => draft.id === id), save: fixture.save, remove: fixture.remove,
}) }));
vi.mock("@/lib/use-issue-dictation", () => ({ useIssueDictation: () => ({ busy: false, clearHistory: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/lib/use-objective-dictation", () => ({ useObjectiveDictation: () => ({ busy: false, reset: vi.fn() }) }));
vi.mock("@/components/auto-textarea", () => ({ AutoTextarea: "textarea" }));
// Description documents (MIN-728) have their own tests; these surfaces open
// their Markdown.
vi.mock("@/lib/use-rich-document", () => ({
  useRichDocument: () => ({ document: null, remember: () => {} }),
}));
vi.mock("@/components/editor/document-editor-lazy", () => ({ LazyDocumentEditor: ({ className, document }: { className: string; document?: unknown }) => {
  fixture.editorDocuments.push(document ?? null);
  return React.createElement("div", { className }, React.createElement("div", { contentEditable: true, suppressContentEditableWarning: true, tabIndex: 0 }, ""));
}, useIdleDocumentEditorPreload: vi.fn() }));
vi.mock("@/components/resources", () => ({ AddResourceButton: () => null, ResourcePills: () => null, ComposerResourcePills: () => null, DropOverlay: () => null, pasteFileHandler: () => undefined, useFileDrop: () => ({ handlers: {} }) }));
vi.mock("@/components/issue-compact-fields", () => ({
  AssigneeCompact: () => null, CategoriesCompact: () => null, DueDateCompact: () => null,
  ObjectiveCompact: () => null, StatusCompact: () => null,
  // Priority and effort keep a trigger and one option, enough to see Smart Fill
  // hide them and a shortcut bring one back (MIN-746).
  PriorityCompact: ({ open, onChange, onOpenChange }: { open: boolean; onChange: (value: string) => void; onOpenChange: (open: boolean) => void }) =>
    React.createElement("div", null, React.createElement("button", { type: "button", "aria-label": "Change priority" }),
      open && React.createElement("button", { type: "button", onClick: () => { onChange("high"); onOpenChange(false); } }, "High")),
  EffortCompact: ({ open, onChange, onOpenChange }: { open: boolean; onChange: (value: string) => void; onOpenChange: (open: boolean) => void }) =>
    React.createElement("div", null, React.createElement("button", { type: "button", "aria-label": "Change effort" }),
      open && React.createElement("button", { type: "button", onClick: () => { onChange("m"); onOpenChange(false); } }, "M")),
  SmartFillCompact: ({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) =>
    React.createElement("button", { type: "button", onClick: () => onChange(!value) }, "Smart Fill"),
}));
vi.mock("@/components/issue-indicators", () => ({ RelationIcon: () => null, StatusIndicator: () => null, ObjectiveStatusIndicator: () => null }));
vi.mock("@/components/relation-objective-label", () => ({ RelationObjectiveLabel: ({ objective }: { objective: Objective }) => React.createElement("span", null, objective.name) }));
vi.mock("@/components/date-time-picker", () => ({ DateTimePicker: () => null }));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null }));
// The semantic group needs a real cmdk Command; it has its own test (lib/semantic-issue-group.test.tsx).
vi.mock("@/components/semantic-issue-group", () => ({ SemanticIssueGroup: () => null }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/agent-beam", () => ({ AgentBeamOverlay: () => null }));
vi.mock("@/components/ai-elements/dictate-button", () => ({ DictateButton: ({ showLabel = false }: { showLabel?: boolean }) => React.createElement("button", { type: "button", "data-prominent-dictation": String(showLabel) }, "Dictate") }));
vi.mock("@/components/send-shortcut", () => ({ SendShortcutTooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/close-draft-dialog", () => ({ CloseDraftDialog: ({ open, onConfirm, onDiscard }: { open: boolean; onConfirm: () => void; onDiscard: () => void }) => open &&
  React.createElement("div", null, React.createElement("button", { onClick: onConfirm }, "Save draft"), React.createElement("button", { onClick: onDiscard }, "Discard draft")),
}));

import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { CreationRelationsCompact } from "@/components/creation-relations";

let root: Root;
let host: HTMLDivElement;
const project = { id: "project", name: "Current project", key: "MIN", issue_seq: 499 } as Project;
const otherProject = { id: "other", name: "Other project", key: "OTH", issue_seq: 9 } as Project;
const issue = { id: "target-issue", project_id: "project", number: 12, title: "Target issue", status: "todo" } as Issue;
const objective = { id: "target-objective", project_id: "project", name: "Target objective", status: "planned" } as Objective;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  fixture.issues = [issue, { ...issue, id: "closed", title: "Closed issue", status: "done" }, { ...issue, id: "foreign", project_id: "other", title: "Foreign issue" }];
  fixture.objectives = [objective, { ...objective, id: "closed-goal", name: "Closed objective", status: "done" }, { ...objective, id: "foreign-goal", name: "Foreign objective", project_id: "other" }];
  fixture.mobile = false;
  fixture.drafts = []; fixture.editorDocuments = []; fixture.smartFill = true; fixture.smartFillCreated = true; fixture.smartFillRelations = true; fixture.queryProjects = [];
  fixture.save.mockImplementation(async (draft) => { fixture.drafts = [draft]; });
  fixture.remove.mockImplementation(async (id) => { fixture.drafts = fixture.drafts.filter((draft) => draft.id !== id); return true; });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label);
  expect(button, `Button ${label}`).toBeDefined();
  await act(() => button!.click());
}
async function typeTitle(value: string) {
  const textarea = host.querySelector("textarea")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function addRelation(type: PendingRelationInput["type"], target: "issue" | "objective") {
  await click(en.Relations.addRelationAria);
  await click(en.Relations[type]);
  // A closed issue stays linkable (listed last); a closed objective does not.
  expect(document.body.textContent).toContain("Closed issue");
  expect(document.body.textContent).not.toContain("Foreign issue");
  expect(document.body.textContent).not.toContain("Closed objective");
  expect(document.body.textContent).not.toContain("Foreign objective");
  await click(target === "issue" ? "MIN-12Target issue" : "Target objective");
}
async function mountDialog(kind: "issue" | "objective", withProjectMenu = true) {
  const create = vi.fn().mockResolvedValue({ id: "created" });
  const createOther = vi.fn().mockResolvedValue({ id: "created" });
  let open = true;
  let projects = [project, otherProject];
  // The draft the drafts tray asks the dialog to restore (MIN-753).
  let initialDraftId: string | null = null;
  const render = () => root.render(kind === "issue"
    ? React.createElement(CreateIssueDialog, { open, onOpenChange, projectId: project.id, projects, members: [], categories: [], objectives: [], onCreate: create, onCreateInProject: createOther, initialDraftId })
    : React.createElement(ObjectiveDialog, { open, onOpenChange, projectId: project.id, projectKey: project.key, projects: withProjectMenu ? [project, otherProject] : [], members: [], onCreate: create, onCreateInProject: createOther, onUpdate: vi.fn(), initialDraftId }));
  const onOpenChange = (next: boolean) => { open = next; render(); };
  await act(render);
  return {
    create, createOther,
    close: () => onOpenChange(false),
    reopen: (draftId: string | null = null) => act(() => { initialDraftId = draftId; onOpenChange(true); }),
    setProjects: (next: Project[]) => act(() => { projects = next; render(); }),
  };
}

describe("creation relation controls", () => {
  it.each([
    { defaultFill: true, crossProject: false },
    { defaultFill: false, crossProject: false },
    { defaultFill: true, crossProject: true },
    { defaultFill: false, crossProject: true },
  ])("restores Smart Fill after Create more with $defaultFill as the default and cross-project=$crossProject", async ({ defaultFill, crossProject }) => {
    fixture.smartFillCreated = defaultFill;
    const dialog = await mountDialog("issue");
    await click("Create more toggle");
    await click("Smart Fill");
    await typeTitle("Issue with a one-ticket override");
    if (crossProject) await click("Create in Other project");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const target = crossProject ? dialog.createOther : dialog.create;
    expect(target.mock.calls[0].at(-1)).toMatchObject({ smart_fill: !defaultFill });
    await typeTitle("Issue using account preferences");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    // Create more keeps the project just used.
    expect(target).toHaveBeenLastCalledWith(...(crossProject ? [otherProject.id] : []), expect.objectContaining({ smart_fill: defaultFill }));
  });

  it("retains the Smart Fill override when a Create more submission fails", async () => {
    const dialog = await mountDialog("issue");
    dialog.create.mockRejectedValueOnce(new Error("Creation failed"));
    await click("Create more toggle");
    await click("Smart Fill");
    await typeTitle("Manual issue");
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(dialog.create).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Manual issue", smart_fill: false }));
    }
    expect(dialog.create).toHaveBeenCalledTimes(2);
  });

  it.each(["issue", "objective"] as const)("portals the modal %s relation menu outside the clipping dialog after reopening", async (kind) => {
    // Smart Fill owns relations while it is on (MIN-717): pick them by hand.
    if (kind === "issue") fixture.smartFillCreated = false;
    const dialog = await mountDialog(kind);
    for (let opening = 0; opening < 2; opening++) {
      await click(en.Relations.addRelationAria);
      const input = document.querySelector('[aria-label="Search relations"]')!;
      expect(input).not.toBeNull();
      expect(input.closest("[data-dialog-content]")).toBeNull();
      expect(input.parentElement?.getAttribute("data-modal")).toBe("true");
      await click(en.Relations.addRelationAria);
      await click("Close creation");
      await dialog.reopen();
    }
  });

  it("places relations last on the objective page and uses its project key without a project menu", async () => {
    await mountDialog("objective", false);
    const picker = host.querySelector("[data-picker]")!;
    expect(picker.parentElement!.lastElementChild).toBe(picker);
    await addRelation("blocks", "issue");
    expect(host.textContent).toContain("MIN-12");
    expect(host.textContent).not.toContain("Target issue");
  });

  it("shows relations when the account disables Smart Fill", async () => {
    fixture.smartFill = false;
    await mountDialog("issue");
    expect(host.textContent).not.toContain("Smart Fill");
    await addRelation("related", "objective");
    expect(host.textContent).toContain("Target objective");
  });

  it("opens a property hidden by Smart Fill from its shortcut and keeps the value set by hand", async () => {
    const dialog = await mountDialog("issue");
    const effortTrigger = () => host.querySelector('button[aria-label="Change effort"]');
    expect(effortTrigger()).toBeNull();
    await act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true })); });
    expect(effortTrigger()).not.toBeNull();
    await click("M");
    // The picker closed, but the effort chosen by hand stays on the form.
    expect(effortTrigger()).not.toBeNull();
    expect(host.querySelector('button[aria-label="Change priority"]')).toBeNull();
    expect(host.textContent).toContain("Smart Fill");
    await typeTitle("Issue with a chosen effort");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ effort: "m", priority: "none", smart_fill: true }));
  });

  it("opens the relations picker hidden by Smart Fill from R and keeps the relation chosen (MIN-749)", async () => {
    const dialog = await mountDialog("issue");
    const relationButton = () => host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`);
    expect(relationButton()).toBeNull();
    await act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true })); });
    expect(relationButton()).not.toBeNull();
    expect(document.querySelector('input[aria-label="Search relations"]')).not.toBeNull();
    await click(en.Relations.related);
    await click("Target objective");
    // The picker leaves again with Smart Fill on; the chosen relation stays.
    expect(relationButton()).toBeNull();
    expect(host.textContent).toContain("Target objective");
    await typeTitle("Issue with a chosen relation");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ smart_fill: true, relations: [expect.objectContaining({ target_id: objective.id })] }));
  });

  it.each(["issue", "objective"] as const)("keeps %s selections when creation is rejected", async (kind) => {
    // Smart Fill owns relations while it is on (MIN-717): pick them by hand.
    if (kind === "issue") fixture.smartFillCreated = false;
    const dialog = await mountDialog(kind);
    dialog.create.mockRejectedValueOnce(new Error("Creation rejected"));
    await addRelation("blocks", "objective");
    await typeTitle("New entity");
    await act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("textarea")?.value).toBe("New entity");
    expect(host.textContent).toContain("Target objective");
  });

  it.each(["issue", "objective"] as const)("submits removable %s pills with the keyboard shortcut", async (kind) => {
    // Smart Fill owns relations while it is on (MIN-717): pick them by hand.
    if (kind === "issue") fixture.smartFillCreated = false;
    const dialog = await mountDialog(kind);
    await addRelation("blocked_by", "objective");
    const pill = host.querySelector(`[aria-label="${en.Relations.blocked_by}: Target objective"]`)!;
    expect(pill).not.toBeNull();
    expect(pill.compareDocumentPosition(host.querySelector("textarea")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(`${en.Common.remove}: ${en.Relations.blocked_by}: Target objective`);
    expect(host.querySelector(`[aria-label="${en.Relations.blocked_by}: Target objective"]`)).toBeNull();
    await addRelation("blocks", "issue");
    await typeTitle("New entity");
    await act(() => { host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ relations: [{ type: "blocks", target_id: issue.id, target_type: "issue", target_label: "MIN-12 Target issue" }] }));
    expect(dialog.createOther).not.toHaveBeenCalled();
    await dialog.reopen();
    expect(host.textContent).not.toContain("MIN-12 Target issue");
  });

  it("hides the relation picker while Smart Fill is on, keeps chosen relations, and resets after create more", async () => {
    fixture.smartFillCreated = false;
    const dialog = await mountDialog("issue");
    const relationButton = host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`)!;
    const smartFill = [...host.querySelectorAll("button")].find((button) => button.textContent === "Smart Fill")!;
    expect(relationButton.closest("[data-picker]")!.nextElementSibling).toBe(smartFill);
    await addRelation("related", "objective");
    // Smart Fill also links related issues after the save (MIN-717): the
    // picker leaves, the relation already chosen stays as a pill.
    await click("Smart Fill");
    expect(host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`)).toBeNull();
    expect(host.textContent).toContain("Target objective");
    await click("Create more toggle");
    await typeTitle("Smart Fill issue");
    await act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ smart_fill: true, relations: [expect.objectContaining({ target_id: objective.id })] }));
    expect(host.querySelector("textarea")?.value).toBe("");
    expect(host.textContent).not.toContain("Target objective");
  });

  it("keeps the relation picker beside Smart Fill when the account turned relation linking off", async () => {
    fixture.smartFillRelations = false;
    await mountDialog("issue");
    // Smart Fill is on for the issue, but it will not link anything: the field stays manual.
    expect(host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`)).not.toBeNull();
    await addRelation("related", "objective");
    expect(host.textContent).toContain("Target objective");
  });

  it.each(["issue", "objective"] as const)("saves and restores a %s draft with only relations", async (kind) => {
    // Smart Fill owns relations while it is on (MIN-717): pick them by hand.
    if (kind === "issue") fixture.smartFillCreated = false;
    const dialog = await mountDialog(kind);
    await addRelation("related", "objective");
    await click("Close creation");
    await click("Save draft");
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ relations: [expect.objectContaining({ target_id: objective.id })] }));
    await dialog.reopen(fixture.drafts[0].id);
    expect(host.textContent).toContain("Target objective");
    await click("Close creation");
    await click("Discard draft");
    expect(fixture.remove).toHaveBeenCalledWith(fixture.save.mock.calls[0][0].id);
    await dialog.reopen();
    expect(host.querySelector(`[aria-label="${en.Relations.related}: Target objective"]`)).toBeNull();
  });

  it.each(["issue", "objective"] as const)("reopens a %s draft's description from its stored document", async (kind) => {
    // The Markdown drops a pill's figure (portrait, color); the document keeps it.
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { mentionType: "objective", mentionId: objective.id, mentionLabel: "Target objective", color: "#ff0066" } }] }] };
    const base = { id: "draft", projectId: project.id, updatedAt: Date.now(), description: `[@Target objective](mention:objective/${objective.id})`, description_doc: doc, relations: [] };
    fixture.drafts = [kind === "issue"
      ? { ...base, title: "Draft", status: "todo", priority: "none", effort: null, assignee_id: null, objective_id: null, due_date: null, category_ids: [], resources: [] } as IssueDraft
      : { ...base, name: "Draft", status: "planned", lead_user_id: null, target_date: null, color: null } as ObjectiveDraft];
    const dialog = await mountDialog(kind);
    expect(fixture.editorDocuments.at(-1)).toBeNull();
    await act(() => dialog.close());
    await dialog.reopen("draft");
    expect(fixture.editorDocuments.at(-1)).toEqual(doc);
  });

  it("filters duplicate selections by direction and does not fetch candidates while closed", async () => {
    const selection: PendingRelationInput = { type: "blocks", target_id: issue.id, target_type: "issue", target_label: "MIN-12 Target issue" };
    const props = { projectId: project.id, projectKey: project.key, active: true, value: [selection], onChange: vi.fn() };
    await act(() => root.render(React.createElement(CreationRelationsCompact, props)));
    expect(fixture.queryProjects.every((project) => project === null)).toBe(true);
    await click(en.Relations.addRelationAria);
    await click(en.Relations.blocks);
    expect(document.body.textContent).not.toContain("Target issue");
    await click(en.Relations.addRelationAria);
    await click(en.Relations.addRelationAria);
    await click(en.Relations.related);
    expect(document.body.textContent).toContain("Target issue");
    await act(() => root.render(React.createElement(CreationRelationsCompact, { ...props, active: false })));
    await act(() => root.render(React.createElement(CreationRelationsCompact, props)));
    await click(en.Relations.addRelationAria);
    expect(document.body.textContent).toContain(en.Relations.blocked_by);
  });
});

it.each(["issue", "objective"] as const)("keeps mobile %s dictation beside submission without submitting on Next", async (kind) => {
  fixture.mobile = true;
  const dialog = await mountDialog(kind);
  // One unlabeled recorder, right after the create button in the fixed footer.
  const recorder = host.querySelectorAll("[data-prominent-dictation]");
  expect(recorder).toHaveLength(1);
  expect(recorder[0].getAttribute("data-prominent-dictation")).toBe("false");
  const footer = host.querySelector(".creation-form-footer")!;
  expect(footer.closest(".creation-form-body")).toBeNull();
  const submitRow = footer.querySelector(".creation-submit")!;
  expect(submitRow.lastElementChild?.contains(recorder[0])).toBe(true);
  expect(submitRow.querySelector('button[type="submit"]')).not.toBeNull();
  // "Create in" shares the sheet title's row instead of adding one.
  const header = host.querySelector("[data-mobile-sheet-header]")!;
  expect(header.textContent).toContain(kind === "issue" ? en.IssueUI.newIssueTitle : en.Objectives.newObjective);
  expect(header.querySelector("[data-create-in]")).not.toBeNull();
  expect(host.querySelectorAll("[data-create-in]")).toHaveLength(1);
  await typeTitle("Mobile draft");
  const title = host.querySelector("textarea")!;
  await act(() => title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(dialog.create).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(host.querySelector(".creation-description [contenteditable=true]"));
  await act(() => footer.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(dialog.create).toHaveBeenCalledOnce();
});

describe("Create in project (MIN-741)", () => {
  const submitButton = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitForm = () => act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

  it("names the identifier the next issue receives and follows the project's counter", async () => {
    const dialog = await mountDialog("issue");
    expect(submitButton().textContent).toBe("Create MIN-500");
    // Another member's issue reserved 500: realtime bumps the counter.
    await dialog.setProjects([{ ...project, issue_seq: 500 }, otherProject]);
    expect(submitButton().textContent).toBe("Create MIN-501");
    await click("Create in Other project");
    expect(submitButton().textContent).toBe("Create OTH-10");
  });

  it.each(["issue", "objective"] as const)("places the %s project select beside the close button, outside the form", async (kind) => {
    await mountDialog(kind);
    const select = host.querySelectorAll("[data-create-in]");
    expect(select).toHaveLength(1);
    expect(select[0].closest("form")).toBeNull();
    expect(host.querySelector("[data-mobile-sheet-header]")).toBeNull();
  });

  it("falls back to a generic label without the counter", async () => {
    const dialog = await mountDialog("issue");
    await dialog.setProjects([{ ...project, issue_seq: undefined }, otherProject]);
    expect(submitButton().textContent).toBe(en.IssueUI.createTicket);
  });

  it("copies the identifier from the split menu while creating", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const dialog = await mountDialog("issue");
    await typeTitle("Copied issue");
    await click("Create and copy MIN-500");
    expect(writeText).toHaveBeenCalledWith("MIN-500");
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied issue" }));
  });

  it("clears project-scoped choices when the issue moves to another project", async () => {
    fixture.smartFillCreated = false;
    const dialog = await mountDialog("issue");
    await addRelation("related", "objective");
    await click("Create in Other project");
    expect(host.textContent).not.toContain("Target objective");
    await typeTitle("Moved issue");
    await submitForm();
    expect(dialog.create).not.toHaveBeenCalled();
    expect(dialog.createOther).toHaveBeenCalledWith(otherProject.id, expect.objectContaining({
      title: "Moved issue", relations: [], category_ids: [], objective_id: null, parent_id: null, copy_resources: [],
    }));
    // The dialog closed on creation; reopening starts in its own project.
    await dialog.reopen();
    expect(host.querySelector("[data-create-in]")?.getAttribute("data-create-in")).toBe(project.id);
  });

  it("creates an objective with a plain button in the selected project", async () => {
    const dialog = await mountDialog("objective");
    expect(submitButton().textContent).toBe(en.Objectives.createObjective);
    await addRelation("blocks", "issue");
    await click("Create in Other project");
    expect(host.textContent).not.toContain("MIN-12");
    await typeTitle("Moved objective");
    await submitForm();
    expect(dialog.create).not.toHaveBeenCalled();
    expect(dialog.createOther).toHaveBeenCalledWith(otherProject.id, expect.objectContaining({
      name: "Moved objective", lead_user_id: null, relations: [], copy_resources: [],
    }));
  });
});
