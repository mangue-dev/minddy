// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Category, Objective } from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof en) => (key: string) =>
    (en[namespace] as Record<string, string>)[key] ?? key,
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
// The real hook counts each objective's issues from the query cache; the menu
// only needs the list back in some order.
vi.mock("@/lib/use-ordered-objectives", () => ({ useOrderedObjectives: <T,>(objectives: T[]) => objectives }));
vi.mock("@/components/objective-label", () => ({
  OBJECTIVE_PILL_TRIGGER: "", objectivePickerOption: () => ({}),
  ObjectivePill: ({ objective }: { objective: Objective }) => <span>{objective.name}</span>,
  ObjectiveName: ({ objective }: { objective: Objective }) => <span>{objective.name}</span>,
}));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null, SearchMultiSelect: () => null }));
vi.mock("@/components/date-time-picker", () => ({ DateTimePicker: () => null }));
vi.mock("@/lib/use-picker-create", () => ({ useCategoryCreateOption: () => null, useObjectiveCreateOption: () => null }));

import { SmartFillCompact, type SmartFillManualFields } from "@/components/issue-compact-fields";

const bug = { id: "cat-bug", name: "Bug", color: "red" } as Category;
const ux = { id: "cat-ux", name: "UX", color: "blue" } as Category;
const launch = { id: "obj-launch", name: "Launch", project_id: "p1", status: "planned" } as Objective;

let host: HTMLDivElement;
let root: Root;

function manualFields(overrides: Partial<SmartFillManualFields> = {}): SmartFillManualFields {
  return {
    priority: "none", onPriorityChange: vi.fn(),
    effort: null, onEffortChange: vi.fn(),
    categories: [bug, ux], categoryIds: [], onCategoryIdsChange: vi.fn(),
    objectives: [launch], objectiveId: null, onObjectiveChange: vi.fn(),
    ...overrides,
  };
}

function render(element: React.ReactElement) {
  act(() => root.render(<TooltipProvider>{element}</TooltipProvider>));
}

function key(target: Element, name: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
}

function menuItem(role: string, name: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)]
    .find((element) => element.textContent?.trim() === name);
  if (!item) throw new Error(`No ${role} named ${name}`);
  return item;
}

/** A chosen entry runs once the menu has closed, on the next frame. */
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

/** Opens the chevron menu, then the submenu of one property, by keyboard. */
function openSubmenu(label: string) {
  const chevron = host.querySelector(`[aria-label="${en.IssueUI.smartFillManualAria}"]`)!;
  key(chevron, "Enter");
  const trigger = menuItem("menuitem", label);
  act(() => trigger.focus());
  key(trigger, "ArrowRight");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Wide viewport: submenus are Radix flyouts, not the mobile inline rows.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("SmartFillCompact split button (MIN-809)", () => {
  it("keeps the left half a toggle", () => {
    const onChange = vi.fn();
    render(<SmartFillCompact value onChange={onChange} manual={manualFields()} />);
    const toggle = host.querySelector<HTMLButtonElement>("[aria-pressed]")!;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    act(() => toggle.click());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("is a toggle alone without values to set by hand", () => {
    render(<SmartFillCompact value onChange={vi.fn()} />);
    expect(host.querySelector(`[aria-label="${en.IssueUI.smartFillManualAria}"]`)).toBeNull();
  });

  it("sets the priority from its submenu, without offering no priority", async () => {
    const fields = manualFields();
    render(<SmartFillCompact value onChange={vi.fn()} manual={fields} />);
    openSubmenu(en.Field.priority);
    expect(() => menuItem("menuitem", en.Priority.none)).toThrow();
    const high = menuItem("menuitem", en.Priority.high);
    key(high, "Enter");
    await settle();
    expect(fields.onPriorityChange).toHaveBeenCalledWith("high");
  });

  it("names each effort once", async () => {
    const fields = manualFields();
    render(<SmartFillCompact value onChange={vi.fn()} manual={fields} />);
    openSubmenu(en.Field.effort);
    const m = menuItem("menuitem", "M");
    key(m, "Enter");
    await settle();
    expect(fields.onEffortChange).toHaveBeenCalledWith("m");
  });

  it("adds a category and keeps the others, with the menu still open", () => {
    const fields = manualFields({ categoryIds: [bug.id] });
    render(<SmartFillCompact value onChange={vi.fn()} manual={fields} />);
    openSubmenu(en.Field.categories);
    expect(menuItem("menuitem", "Bug").hasAttribute("data-checked")).toBe(true);
    key(menuItem("menuitem", "UX"), "Enter");
    expect(fields.onCategoryIdsChange).toHaveBeenCalledWith([bug.id, ux.id]);
    expect(menuItem("menuitem", "Bug")).toBeTruthy();
  });

  it("finds a value inside the submenus from the search field", () => {
    render(<SmartFillCompact value onChange={vi.fn()} manual={manualFields()} />);
    key(host.querySelector(`[aria-label="${en.IssueUI.smartFillManualAria}"]`)!, "Enter");
    const search = document.querySelector<HTMLInputElement>('[role="menu"] input')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "Launch");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent?.includes("Launch"))).toBe(true);
  });

  it("sets the objective and hides its submenu when the project has none", async () => {
    const fields = manualFields();
    render(<SmartFillCompact value onChange={vi.fn()} manual={fields} />);
    openSubmenu(en.Field.objective);
    key(menuItem("menuitem", "Launch"), "Enter");
    await settle();
    expect(fields.onObjectiveChange).toHaveBeenCalledWith(launch.id);

    act(() => root.unmount());
    root = createRoot(host);
    render(<SmartFillCompact value onChange={vi.fn()} manual={manualFields({ objectives: [] })} />);
    key(host.querySelector(`[aria-label="${en.IssueUI.smartFillManualAria}"]`)!, "Enter");
    expect(() => menuItem("menuitem", en.Field.objective)).toThrow();
  });

  it("offers the title only while Smart Fill writes it, then hands it the caret (MIN-813)", async () => {
    const chevron = () => host.querySelector(`[aria-label="${en.IssueUI.smartFillManualAria}"]`)!;
    render(<SmartFillCompact value onChange={vi.fn()} manual={manualFields()} />);
    key(chevron(), "Enter");
    expect(() => menuItem("menuitem", en.Field.title)).toThrow();

    act(() => root.unmount());
    document.body.innerHTML = "";
    document.body.append(host);
    root = createRoot(host);
    const onTitleFocus = vi.fn();
    const fields = manualFields({ onTitleRequest: vi.fn(), onTitleFocus });
    render(<SmartFillCompact value onChange={vi.fn()} manual={fields} />);
    key(chevron(), "Enter");
    key(menuItem("menuitem", en.Field.title), "Enter");
    await settle();
    expect(fields.onTitleRequest).toHaveBeenCalledOnce();
    // The closing menu does not take the caret back to the chevron; Radix
    // restores focus on the task after the menu unmounts.
    await settle();
    expect(document.activeElement).not.toBe(chevron());
    expect(onTitleFocus).toHaveBeenCalledOnce();
  });
});
