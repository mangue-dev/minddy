// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/en.json";
import type { Issue, IssueRelation, Objective, Project } from "@/lib/types";

const mocks = vi.hoisted(() => ({ openIssue: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/issue-panel-context", () => ({ useIssuePanelActions: () => ({ openIssue: mocks.openIssue }) }));
vi.mock("framer-motion", async () => ({ ...await vi.importActual("framer-motion"), useReducedMotion: () => true }));
// The card loads the viewer on demand; here it is there at once.
vi.mock("next/dynamic", async () => {
  const { IssueGraphViewer } = await import("./issue-graph-viewer");
  return { default: () => IssueGraphViewer };
});

import { IssueGraphCard } from "./issue-graph";

const project = { id: "p1", key: "MIN", name: "Minddy" } as Project;
const issue = (number: number, overrides: Partial<Issue> = {}) => ({
  id: `i${number}`,
  project_id: "p1",
  number,
  title: `Issue ${number}`,
  status: "todo",
  parent_id: null,
  objective_id: null,
  ...overrides,
}) as Issue;
const blocks = (source: number, target: number): IssueRelation => ({
  id: `r${source}-${target}`,
  source_id: `i${source}`,
  target_id: `i${target}`,
  type: "blocks",
});

describe("IssueGraphCard enlarged view", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.openIssue.mockReset();
    mocks.push.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.style.overflow = "";
  });

  const render = async (issues: Issue[], relations: IssueRelation[], objectives: Objective[] = []) => {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <TooltipProvider>
            <IssueGraphCard project={project} issues={issues} relations={relations} objectives={objectives} />
          </TooltipProvider>
        </NextIntlClientProvider>,
      );
    });
  };
  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      element!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };
  const enlarge = async () => {
    await click(container.querySelector('button[aria-label="Enlarge the graph"]'));
    return document.querySelector("dialog")!;
  };
  const button = (dialog: Element, label: string) => dialog.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it("opens the same graph in the full-screen reader and closes it before opening an issue", async () => {
    await render([issue(1), issue(2)], [blocks(1, 2)]);
    expect(document.querySelector("dialog")).toBeNull();

    const dialog = await enlarge();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Issue graph");
    expect(dialog.parentElement?.hasAttribute("data-preview-viewer")).toBe(true);

    // The side panel cannot open above the reader: the reader goes first.
    await click(dialog.querySelector('[aria-label="MIN-2 Issue 2"]'));
    expect(mocks.openIssue).toHaveBeenCalledWith("p1", "i2");
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("zooms with the controls and comes back to the whole graph", async () => {
    await render([issue(1), issue(2)], [blocks(1, 2)]);
    const dialog = await enlarge();
    const content = dialog.querySelector('svg[role="group"] > g')!;
    const reset = button(dialog, "Reset zoom");
    expect(reset.textContent).toBe("100%");
    expect(button(dialog, "Zoom out").disabled).toBe(true);

    await click(button(dialog, "Zoom in"));
    expect(reset.textContent).toBe("150%");
    expect(content.getAttribute("transform")).toContain("scale(1.5)");

    // The scale stops where the drawing stops being readable.
    for (let step = 0; step < 8; step += 1) await click(button(dialog, "Zoom in"));
    expect(reset.textContent).toBe("800%");
    expect(button(dialog, "Zoom in").disabled).toBe(true);

    await click(reset);
    expect(reset.textContent).toBe("100%");
    expect(content.getAttribute("transform")).toBe("translate(0,0) scale(1)");
  });

  it("draws in the reader the tickets the card leaves out", async () => {
    // A chain of 200 tickets: past the card's cap, within the reader's.
    const issues = Array.from({ length: 200 }, (_, index) => issue(index + 1));
    const relations = issues.slice(1).map((_, index) => blocks(index + 1, index + 2));
    await render(issues, relations);
    const dots = (scope: ParentNode) => scope.querySelectorAll('svg[role="group"] [role="link"]').length;
    expect(dots(container)).toBeLessThanOrEqual(120);
    expect(container.textContent).toContain("80 linked issues left out");

    const dialog = await enlarge();
    expect(dots(dialog)).toBe(200);
    expect(dialog.textContent).not.toContain("left out");
  });

  it("shares the closed-issues switch with the card", async () => {
    await render(
      [issue(1), issue(2), issue(3, { status: "done" })],
      [blocks(1, 2), blocks(3, 1)],
    );
    const dialog = await enlarge();
    expect(dialog.querySelector('[aria-label="MIN-3 Issue 3"]')).toBeNull();
    await click(dialog.querySelector('[role="switch"]'));
    expect(dialog.querySelector('[aria-label="MIN-3 Issue 3"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="MIN-3 Issue 3"]')).not.toBeNull();
  });

  it("drops the closed viewer once its exit is over", async () => {
    vi.useFakeTimers();
    await render([issue(1), issue(2)], [blocks(1, 2)]);
    const dialog = await enlarge();
    await click(dialog.querySelector("[data-preview-close]"));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
