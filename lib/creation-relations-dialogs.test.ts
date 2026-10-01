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
  smartFill: true, queryProjects: [] as (string | null)[],
}));
vi.mock("next-intl", () => ({ useTranslations: (namespace: keyof typeof en) =>
  (key: string) => (en[namespace] as Record<string, string>)[key] ?? key,
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
vi.mock("mangue-ui", () => {
  const wrap = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const item = ({ children, onSelect, disabled }: { children: React.ReactNode; onSelect: () => void; disabled?: boolean }) =>
    React.createElement("button", { type: "button", onClick: onSelect, disabled }, children);
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (next: boolean) => void; children: React.ReactNode }) =>
      open ? React.createElement("div", null, React.createElement("button", { type: "button", onClick: () => onOpenChange(false) }, "Close creation"), children) : null,
    // The mobile bottom sheet does not forward DialogContent refs.
    DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-dialog-content": true }, children),
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
});
vi.mock("@/lib/use-issues-query", () => ({ useIssuesQuery: (project: string | null) => {
  fixture.queryProjects.push(project);
  return { issues: project ? fixture.issues : [], loading: false };
} }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: (project: string | null) => ({ objectives: project ? fixture.objectives : [], loading: false }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user", user_metadata: { smart_fill: fixture.smartFill } } }) }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock("@/lib/use-track-view", () => ({ useTrackView: vi.fn() }));
vi.mock("@/lib/use-mention-sources", () => ({ useDescriptionMentions: () => [] }));
vi.mock("@/lib/use-arrow-field", () => ({ useArrowField: (ref: React.RefObject<HTMLTextAreaElement>) => ({ ref, read: (e: React.ChangeEvent<HTMLTextAreaElement>) => e.target.value }) }));
vi.mock("@/lib/use-attachment-uploads", () => ({ useAttachmentUploads: () => ({
  inputs: [], pending: [], uploading: false, clear: vi.fn(), restore: vi.fn(), addFiles: vi.fn(),
}) }));
vi.mock("@/lib/use-drafts", () => ({ useDrafts: () => ({
  drafts: fixture.drafts, find: (id: string) => fixture.drafts.find((draft) => draft.id === id), save: fixture.save, remove: fixture.remove,
}) }));
vi.mock("@/lib/use-issue-dictation", () => ({ useIssueDictation: () => ({ busy: false, clearHistory: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/lib/use-objective-dictation", () => ({ useObjectiveDictation: () => ({ busy: false, reset: vi.fn() }) }));
vi.mock("@/components/auto-textarea", () => ({ AutoTextarea: "textarea" }));
vi.mock("@/components/markdown-editor-lazy", () => ({ MarkdownEditor: () => null, useIdleMarkdownEditorPreload: vi.fn() }));
vi.mock("@/components/resources", () => ({ AddResourceButton: () => null, ResourcePills: () => null, DropOverlay: () => null, pasteFileHandler: () => undefined, useFileDrop: () => ({ handlers: {} }) }));
vi.mock("@/components/issue-compact-fields", () => ({
  AssigneeCompact: () => null, CategoriesCompact: () => null, DueDateCompact: () => null,
  EffortCompact: () => null, ObjectiveCompact: () => null, PriorityCompact: () => null, StatusCompact: () => null,
  SmartFillCompact: ({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) =>
    React.createElement("button", { type: "button", onClick: () => onChange(!value) }, "Smart Fill"),
}));
vi.mock("@/components/issue-indicators", () => ({ RelationIcon: () => null, StatusIndicator: () => null, ObjectiveStatusIndicator: () => null }));
vi.mock("@/components/relation-objective-label", () => ({ RelationObjectiveLabel: ({ objective }: { objective: Objective }) => React.createElement("span", null, objective.name) }));
vi.mock("@/components/date-time-picker", () => ({ DateTimePicker: () => null }));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/agent-beam", () => ({ AgentBeamOverlay: () => null }));
vi.mock("@/components/ai-elements/dictate-button", () => ({ DictateButton: () => null }));
vi.mock("@/components/send-shortcut", () => ({ SendShortcutTooltip: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/draft-recovery-row", () => ({ DraftRecoveryRow: ({ drafts, onRecover }: { drafts: { id: string }[]; onRecover: (id: string) => void }) =>
  React.createElement("div", null, drafts.map((draft) => React.createElement("button", { key: draft.id, type: "button", onClick: () => onRecover(draft.id) }, "Recover draft"))),
}));
vi.mock("@/components/close-draft-dialog", () => ({ CloseDraftDialog: ({ open, onConfirm, onDiscard }: { open: boolean; onConfirm: () => void; onDiscard: () => void }) => open &&
  React.createElement("div", null, React.createElement("button", { onClick: onConfirm }, "Save draft"), React.createElement("button", { onClick: onDiscard }, "Discard draft")),
}));

import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { CreationRelationsCompact } from "@/components/creation-relations";

let root: Root;
let host: HTMLDivElement;
const project = { id: "project", name: "Current project", key: "MIN" } as Project;
const otherProject = { id: "other", name: "Other project", key: "OTH" } as Project;
const issue = { id: "target-issue", project_id: "project", number: 12, title: "Target issue", status: "todo" } as Issue;
const objective = { id: "target-objective", project_id: "project", name: "Target objective", status: "planned" } as Objective;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.issues = [issue, { ...issue, id: "closed", title: "Closed issue", status: "done" }, { ...issue, id: "foreign", project_id: "other", title: "Foreign issue" }];
  fixture.objectives = [objective, { ...objective, id: "closed-goal", name: "Closed objective", status: "done" }, { ...objective, id: "foreign-goal", name: "Foreign objective", project_id: "other" }];
  fixture.drafts = []; fixture.smartFill = true; fixture.queryProjects = [];
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
  expect(document.body.textContent).not.toContain("Closed issue");
  expect(document.body.textContent).not.toContain("Foreign issue");
  expect(document.body.textContent).not.toContain("Closed objective");
  expect(document.body.textContent).not.toContain("Foreign objective");
  await click(target === "issue" ? "MIN-12Target issue" : "Target objective");
}
async function mountDialog(kind: "issue" | "objective", withProjectMenu = true) {
  const create = vi.fn().mockResolvedValue({ id: "created" });
  const createOther = vi.fn().mockResolvedValue({ id: "created" });
  let open = true;
  const render = () => root.render(kind === "issue"
    ? React.createElement(CreateIssueDialog, { open, onOpenChange, projectId: project.id, projects: [project, otherProject], members: [], categories: [], objectives: [], onCreate: create, onCreateInProject: createOther })
    : React.createElement(ObjectiveDialog, { open, onOpenChange, projectId: project.id, projectKey: project.key, projects: withProjectMenu ? [project, otherProject] : [], members: [], onCreate: create, onCreateInProject: createOther, onUpdate: vi.fn() }));
  const onOpenChange = (next: boolean) => { open = next; render(); };
  await act(render);
  return { create, createOther, reopen: () => act(() => onOpenChange(true)) };
}

describe("creation relation controls", () => {
  it.each(["issue", "objective"] as const)("portals the modal %s relation menu outside the clipping dialog after reopening", async (kind) => {
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
    expect(host.textContent).toContain("MIN-12 Target issue");
  });

  it("shows relations when the account disables Smart Fill", async () => {
    fixture.smartFill = false;
    await mountDialog("issue");
    expect(host.textContent).not.toContain("Smart Fill");
    await addRelation("related", "objective");
    expect(host.textContent).toContain("Target objective");
  });

  it.each(["issue", "objective"] as const)("keeps %s selections when creation is rejected", async (kind) => {
    const dialog = await mountDialog(kind);
    dialog.create.mockRejectedValueOnce(new Error("Creation rejected"));
    await addRelation("blocks", "objective");
    await typeTitle("New entity");
    await act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("textarea")?.value).toBe("New entity");
    expect(host.textContent).toContain("Target objective");
  });

  it.each(["issue", "objective"] as const)("submits removable %s pills with the keyboard shortcut and protects cross-project creation", async (kind) => {
    const dialog = await mountDialog(kind);
    await addRelation("blocked_by", "objective");
    const pill = host.querySelector(`[aria-label="${en.Relations.blocked_by}: Target objective"]`)!;
    expect(pill).not.toBeNull();
    expect(pill.compareDocumentPosition(host.querySelector("textarea")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Other project")?.disabled).toBe(true);
    expect(host.textContent).toContain(en.Relations.crossProjectUnavailable);
    await click(`${en.Common.remove}: ${en.Relations.blocked_by}: Target objective`);
    expect(host.querySelector(`[aria-label="${en.Relations.blocked_by}: Target objective"]`)).toBeNull();
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Other project")?.disabled).toBe(false);
    await addRelation("blocks", "issue");
    await typeTitle("New entity");
    await act(() => { host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ relations: [{ type: "blocks", target_id: issue.id, target_type: "issue", target_label: "MIN-12 Target issue" }] }));
    expect(dialog.createOther).not.toHaveBeenCalled();
    await dialog.reopen();
    expect(host.textContent).not.toContain("MIN-12 Target issue");
  });

  it("keeps relations immediately before Smart Fill when enabled or disabled and resets after create more", async () => {
    const dialog = await mountDialog("issue");
    const relationButton = host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`)!;
    const smartFill = [...host.querySelectorAll("button")].find((button) => button.textContent === "Smart Fill")!;
    expect(relationButton.closest("[data-picker]")!.nextElementSibling).toBe(smartFill);
    await addRelation("related", "objective");
    await click("Smart Fill");
    expect(host.querySelector(`[aria-label="${en.Relations.addRelationAria}"]`)).not.toBeNull();
    expect(host.textContent).toContain("Target objective");
    await click("Smart Fill");
    await click("Create more toggle");
    await typeTitle("Smart Fill issue");
    await act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(dialog.create).toHaveBeenCalledWith(expect.objectContaining({ smart_fill: true, relations: [expect.objectContaining({ target_id: objective.id })] }));
    expect(host.querySelector("textarea")?.value).toBe("");
    expect(host.textContent).not.toContain("Target objective");
  });

  it.each(["issue", "objective"] as const)("saves and restores a %s draft with only relations", async (kind) => {
    const dialog = await mountDialog(kind);
    await addRelation("related", "objective");
    await click("Close creation");
    await click("Save draft");
    expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ relations: [expect.objectContaining({ target_id: objective.id })] }));
    await dialog.reopen();
    await click("Recover draft");
    expect(host.textContent).toContain("Target objective");
    await click("Close creation");
    await click("Discard draft");
    await dialog.reopen();
    expect(host.querySelector(`[aria-label="${en.Relations.related}: Target objective"]`)).toBeNull();
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
