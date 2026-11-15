// @vitest-environment jsdom
// The surface variants of one field picker: the same field, value and
// accessible name everywhere; only the card keeps its clicks from the card.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Member } from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof en) => (key: string, values?: Record<string, string>) => {
    const message = (en[namespace] as Record<string, string>)[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? "");
  },
  useFormatter: () => ({ dateTime: () => "" }),
}));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/search-select", () => ({
  SearchSelect: ({ trigger }: { trigger: React.ReactNode }) => trigger,
  SearchMultiSelect: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/lib/use-picker-create", () => ({ useCategoryCreateOption: () => undefined, useObjectiveCreateOption: () => undefined }));

import { AssigneePicker, EffortPicker, StatusPicker, type FieldPickerVariant } from "@/components/issue-field-pickers";

const VARIANTS: FieldPickerVariant[] = ["card", "row", "compact"];

let host: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement) {
  act(() => root.render(<TooltipProvider>{element}</TooltipProvider>));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("field picker variants", () => {
  it.each(VARIANTS)("names the unset effort the same way on the %s", (variant) => {
    render(<EffortPicker variant={variant} value={null} onChange={() => {}} />);
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Effort: Not set");
  });

  it.each(VARIANTS)("names the Smart Assign empty state on the %s", (variant) => {
    render(<AssigneePicker variant={variant} value={null} members={[] as Member[]} onChange={() => {}} smartAssign />);
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe(`Assignee: ${en.Field.smartAssign}`);
  });

  it.each([
    ["card", false],
    ["row", true],
    ["compact", true],
  ] as const)("on the %s, a click on the trigger reaches the surrounding surface: %s", (variant, bubbles) => {
    const onSurfaceClick = vi.fn();
    const onSurfacePointerDown = vi.fn();
    render(
      <div onClick={onSurfaceClick} onPointerDown={onSurfacePointerDown}>
        <StatusPicker variant={variant} value="todo" onChange={() => {}} />
      </div>,
    );
    const trigger = host.querySelector("button")!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger.click();
    });
    expect(onSurfaceClick).toHaveBeenCalledTimes(bubbles ? 1 : 0);
    expect(onSurfacePointerDown).toHaveBeenCalledTimes(bubbles ? 1 : 0);
  });

  it("shows the value's name beside the indicator only when the compact tile asks", () => {
    render(<StatusPicker variant="compact" value="todo" onChange={() => {}} showValue />);
    expect(host.textContent).toContain(en.Status.todo);
    render(<StatusPicker variant="compact" value="todo" onChange={() => {}} />);
    expect(host.textContent).not.toContain(en.Status.todo);
  });
});
