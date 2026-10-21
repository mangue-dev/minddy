// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KEY_FOR_FIELD } from "@/components/issue-field-shortcuts";
import {
  OBJECTIVE_KEY_FOR_FIELD,
  useObjectiveFieldShortcuts,
  type ObjectiveShortcutField,
} from "@/components/objective-field-shortcuts";

let container: HTMLDivElement;
let root: Root;
const onField = vi.fn();
// Stands in for the app-wide C/O quick-create (window, bubble phase).
const quickCreate = vi.fn();

const ALL: ObjectiveShortcutField[] = ["status", "lead", "targetDate", "color", "relation"];

function Surface({ fields = ALL, scoped = false }: { fields?: ObjectiveShortcutField[]; scoped?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  useObjectiveFieldShortcuts({ enabled: true, fields, onField, scope: scoped ? scope : undefined });
  return (
    <div ref={scope}>
      <button type="button" data-testid="inside" />
      <input data-testid="title" />
    </div>
  );
}

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const inside = () => container.querySelector('[data-testid="inside"]')!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.addEventListener("keydown", quickCreate);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.removeEventListener("keydown", quickCreate);
  onField.mockReset();
  quickCreate.mockReset();
});

it("uses the issue keys for the fields both entities share, and C for the color", () => {
  expect(OBJECTIVE_KEY_FOR_FIELD).toMatchObject({
    status: KEY_FOR_FIELD.status,
    lead: KEY_FOR_FIELD.assignee,
    targetDate: KEY_FOR_FIELD.dueDate,
    color: "C",
    relation: "R",
  });
});

it("opens each field from its key and keeps C from the app-wide quick-create", () => {
  render(<Surface />);
  for (const [field, key] of Object.entries(OBJECTIVE_KEY_FOR_FIELD)) {
    expect(press(inside(), key.toLowerCase()).defaultPrevented).toBe(true);
    expect(onField).toHaveBeenLastCalledWith(field);
  }
  expect(quickCreate).not.toHaveBeenCalled();
});

it("leaves keys typed in a field, with a modifier or repeated, and fields the surface lacks", () => {
  render(<Surface fields={["status", "color"]} />);
  press(container.querySelector('[data-testid="title"]')!, "s");
  press(inside(), "s", { shiftKey: true });
  press(inside(), "c", { metaKey: true });
  press(inside(), "s", { repeat: true });
  press(inside(), "r");
  expect(onField).not.toHaveBeenCalled();
  // C outside the objective's fields still reaches the quick-create.
  expect(quickCreate).toHaveBeenCalledTimes(5);
});

it("on a page, yields to an open dialog or popover", () => {
  render(<Surface />);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-state", "open");
  dialog.checkVisibility = () => true;
  document.body.append(dialog);
  press(inside(), "c");
  dialog.remove();
  expect(onField).not.toHaveBeenCalled();
  expect(quickCreate).toHaveBeenCalledTimes(1);
});

it("in a dialog, only takes keys pressed inside its content", () => {
  render(<Surface scoped />);
  const outside = document.createElement("button");
  document.body.append(outside);
  press(outside, "s");
  outside.remove();
  expect(onField).not.toHaveBeenCalled();
  press(inside(), "s");
  expect(onField).toHaveBeenCalledWith("status");
});
