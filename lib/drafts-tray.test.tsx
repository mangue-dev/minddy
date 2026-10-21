// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { DraftKind, IssueDraft, ObjectiveDraft } from "./drafts";

const h = vi.hoisted(() => ({
  store: { issue: [] as IssueDraft[], objective: [] as ObjectiveDraft[] },
  listeners: new Set<(kind: DraftKind, drafts: unknown[]) => void>(),
  openCreateIssue: vi.fn(),
  openCreateObjective: vi.fn(),
  projects: [] as { id: string; key: string; name: string; my_role?: string }[],
}));

// An in-memory draft store with the real module's contract: every write
// announces the kind's new list to subscribers.
vi.mock("@/lib/drafts", () => ({
  draftStorageKey: (kind: DraftKind) => `minddy:drafts:${kind}`,
  readDrafts: async (kind: DraftKind) => [...h.store[kind]],
  subscribeDrafts: (listener: (kind: DraftKind, drafts: unknown[]) => void) => {
    h.listeners.add(listener);
    return () => h.listeners.delete(listener);
  },
  deleteDraft: async (kind: DraftKind, id: string) => {
    const next = (h.store[kind] as { id: string }[]).filter((draft) => draft.id !== id);
    (h.store as Record<DraftKind, unknown[]>)[kind] = next;
    for (const listener of h.listeners) listener(kind, next);
    return next;
  },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "viewer" } }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: h.projects }) }));
vi.mock("@/lib/create-context", () => ({
  useCreate: () => ({ openCreateIssue: h.openCreateIssue, openCreateObjective: h.openCreateObjective }),
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));

const { DraftsTray } = await import("@/components/drafts-tray");

const issueDraft = (id: string, projectId: string, updatedAt: number): IssueDraft => ({
  id, projectId, updatedAt, title: `Issue ${id}`, description: "**Bold** context line", status: "todo", priority: "none",
  effort: null, assignee_id: null, objective_id: null, due_date: null, category_ids: [], resources: [],
});
const objectiveDraft = (id: string, projectId: string, updatedAt: number): ObjectiveDraft => ({
  id, projectId, updatedAt, name: "", description: "", status: "planned", lead_user_id: null, target_date: null, color: null,
});

let root: Root;
let host: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TooltipProvider><DraftsTray /></TooltipProvider>
      </NextIntlClientProvider>,
    );
  });
}
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === label);
async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined();
  await act(async () => { element!.click(); });
}
async function openTray(count: number) {
  const trigger = button(`${count} drafts`) ?? button(`${count} draft`);
  await click(trigger);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  h.store = { issue: [], objective: [] };
  h.listeners.clear();
  h.openCreateIssue.mockReset();
  h.openCreateObjective.mockReset();
  h.projects = [
    { id: "writable", key: "MIN", name: "Minddy" },
    { id: "readonly", key: "RO", name: "Read only", my_role: "reader" },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("drafts tray", () => {
  it("stays hidden without a draft and appears when a dialog saves one", async () => {
    await render();
    expect(host.textContent).toBe("");
    const saved = [issueDraft("a", "writable", 1)];
    h.store.issue = saved;
    await act(async () => { for (const listener of h.listeners) listener("issue", saved); });
    expect(button("1 draft")).toBeDefined();
    expect(host.textContent).toContain("Drafts1");
  });

  it("lists drafts of writable projects, newest first, and reopens one in its dialog", async () => {
    h.store.issue = [issueDraft("old", "writable", 1), issueDraft("hidden", "readonly", 5)];
    h.store.objective = [objectiveDraft("goal", "writable", 3)];
    await render();
    await openTray(2);
    const rows = [...document.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows).toEqual([
      expect.stringContaining("Untitled"),
      expect.stringContaining("Issue old"),
    ]);
    expect(rows[0]).toContain("No description");
    // The description is shown as plain text, without its Markdown syntax.
    expect(rows[1]).toContain("Bold context line");
    expect(document.body.textContent).not.toContain("Issue hidden");

    await click(button("Resume “Untitled”"));
    expect(h.openCreateObjective).toHaveBeenCalledWith({ projectId: "writable", draftId: "goal" });
  });

  it("deletes a draft only after confirmation", async () => {
    h.store.issue = [issueDraft("a", "writable", 2), issueDraft("b", "writable", 1)];
    await render();
    await openTray(2);
    await click(button("Delete the “Issue a” draft"));
    expect(h.store.issue).toHaveLength(2);
    expect(document.body.textContent).toContain("Delete “Issue a”?");
    const confirm = [...document.querySelectorAll("button")].find((element) => element.textContent === "Delete draft");
    await click(confirm);
    expect(h.store.issue.map((draft) => draft.id)).toEqual(["b"]);
    expect(button("1 draft")).toBeDefined();
  });
});
