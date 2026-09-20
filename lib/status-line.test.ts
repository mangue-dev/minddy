// @vitest-environment jsdom

import { act, Fragment, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StatusLine, StatusLineFloating } from "@/components/status-line";

// The pill uses mangue-ui's radix popover; a passthrough keeps the assertions
// on text and DOM structure, with the content always in the tree.
vi.mock("mangue-ui", () => ({
  cn: (...classes: Array<string | false | undefined>) =>
    classes.filter(Boolean).join(" "),
  Popover: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  PopoverTrigger: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  PopoverContent: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-slot": "popover-content" }, children),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  motion: new Proxy(
    {},
    {
      get: (_, tag: string) => (props: Record<string, unknown>) => {
        const { initial: _i, animate: _a, exit: _e, transition: _t, whileTap: _w, ...rest } = props;
        return createElement(tag, rest);
      },
    },
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const HISTORY_KEY = "minddy:status-errors";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(ui: ReactNode) {
  act(() => {
    root.render(createElement(Fragment, null, ui));
  });
}

/** Fire a toast, then let sonner's deferred publish land. */
function fire(fn: () => void) {
  act(() => {
    fn();
  });
  act(() => {
    vi.advanceTimersByTime(1);
  });
}

const text = () => container.textContent ?? "";
const line = () => container.querySelector('[role="status"]');
const bell = () => container.querySelector('button[aria-label="bellLabel"]');

describe("the status line", () => {
  it("shows a fired toast as the line, then lets it go after 4s", () => {
    render(createElement(StatusLine));
    expect(text()).not.toContain("Saved");
    fire(() => toast.success("Saved"));
    expect(line()).not.toBeNull();
    expect(text()).toContain("Saved");
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(line()).toBeNull();
    expect(text()).not.toContain("Saved");
  });

  it("keeps an error longer, and records it for the bell", () => {
    render(createElement(StatusLine));
    fire(() => toast.error("Boom"));
    expect(line()).not.toBeNull();
    expect(text()).toContain("Boom");
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(line()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(line()).toBeNull();

    const history = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ message: "Boom" });
    expect(bell()).not.toBeNull();
  });

  it("replaces the line when the same id updates (dictation flow)", () => {
    render(createElement(StatusLine));
    fire(() => toast.info("Dictating…", { id: "dictation-in-flight" }));
    expect(text()).toContain("Dictating…");
    fire(() => toast.info("Done", { id: "dictation-in-flight" }));
    expect(text()).toContain("Done");
    expect(text()).not.toContain("Dictating…");
  });

  it("caps the bell history at 5, most recent first", () => {
    render(createElement(StatusLine));
    for (let i = 0; i < 7; i++) {
      fire(() => toast.error(`Failure ${i}`));
    }
    const history = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    expect(history).toHaveLength(5);
    expect(history[0].message).toBe("Failure 6");
  });

  it("offers the full text of a fired toast in the details popover", () => {
    render(createElement(StatusLine));
    fire(() => toast.info("A long message worth reading in full"));
    const content = container.querySelector('[data-slot="popover-content"]');
    expect(content?.textContent).toContain("A long message worth reading in full");
  });

  it("renders on mobile too, floating above the nav", () => {
    render(createElement(StatusLineFloating));
    fire(() => toast.error("Mobile boom"));
    expect(text()).toContain("Mobile boom");
    expect(bell()).not.toBeNull();
    const history = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    expect(history).toHaveLength(1);
  });
});
