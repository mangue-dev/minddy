// @vitest-environment jsdom
import { act, forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistantPageContext } from "@/lib/assistant-types";
import { RoutinesHome } from "./routines-home";

const state = vi.hoisted(() => ({
  ai: { loading: false, available: true },
  blank: true,
  shell: null as null | { pageContext: AssistantPageContext; projectId: string | null; displayMode: string },
  focus: vi.fn(),
  newConversation: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-ai-surface-availability", () => ({ useAiSurfaceAvailability: () => state.ai }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanel: () => ({ isOpen: false }) }));
vi.mock("@/lib/assistant-composer-context", () => ({
  AssistantComposerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/assistant-chat-context", () => ({
  AssistantChatProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAssistantChatContext: () => ({
    state: { conversationId: state.blank ? null : "c1", messages: [] },
    isBusy: false,
  }),
}));
vi.mock("@/components/app-content-header", () => ({
  AppContentHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock("@/components/ui/tooltip", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
// The real shell holds a whole Numo conversation; this stand-in keeps the
// contract the page relies on: its props, and `fill` filling the composer.
vi.mock("@/components/assistant/assistant-shell", () => ({
  AssistantShell: forwardRef(function AssistantShell(
    props: {
      pageContext: AssistantPageContext;
      projectId: string | null;
      displayMode: string;
      intro: ReactNode;
      afterComposer: ReactNode;
      unavailableFallback: ReactNode;
    },
    ref,
  ) {
    const [text, setText] = useState("");
    state.shell = props;
    useImperativeHandle(ref, () => ({
      fill: setText,
      focus: state.focus,
      newConversation: state.newConversation,
      sendMessage: () => {},
    }));
    if (!state.ai.available) return <>{props.unavailableFallback}</>;
    return (
      <div>
        {props.intro}
        <p data-composer>{text}</p>
        {props.afterComposer}
      </div>
    );
  }),
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  state.ai = { loading: false, available: true };
  state.blank = true;
  state.shell = null;
  state.focus.mockReset();
  state.newConversation.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (props: Partial<Parameters<typeof RoutinesHome>[0]> = {}) =>
  act(() => root.render(<RoutinesHome projectId={null} onStartFresh={() => {}} {...props} />));
const click = (selector: string) =>
  act(() => (host.querySelector(selector) as HTMLElement).click());
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label);

it("holds an expanded Numo conversation that asks for a new routine", async () => {
  await render({ projectId: "p1" });
  expect(state.shell).toMatchObject({
    projectId: "p1",
    displayMode: "expanded",
    pageContext: { newRoutine: true, projectId: "p1" },
  });
  expect(host.textContent).toContain("title");
  await render();
  expect(state.shell?.pageContext).toEqual({ newRoutine: true });
});

it("fills the composer with an example instead of sending it", async () => {
  await render();
  await click('[data-routine-example="stale"]');
  expect(host.querySelector("[data-composer]")?.textContent).toBe("example_stale_prompt");
});

it("starts from scratch with the wizard, and uses it for examples without AI", async () => {
  const onStartFresh = vi.fn();
  state.ai = { loading: false, available: false };
  await render({ onStartFresh });
  expect(host.querySelector("[data-composer]")).toBeNull();
  await click('[data-routine-example="weeklyWrap"]');
  expect(onStartFresh).toHaveBeenCalledWith("example_weeklyWrap_prompt");
  await act(() => button("startFresh")!.click());
  expect(onStartFresh).toHaveBeenLastCalledWith();
});

it("offers a new conversation once one has started", async () => {
  await render();
  expect(button("newConversation")).toBeUndefined();
  state.blank = false;
  await render({ focusRequest: 0 });
  await act(() => button("newConversation")!.click());
  expect(state.newConversation).toHaveBeenCalledTimes(1);
});

it("a + brings back a blank home with the caret in the composer", async () => {
  state.blank = false;
  await render();
  expect(state.focus).not.toHaveBeenCalled();
  await render({ focusRequest: 1 });
  expect(state.newConversation).toHaveBeenCalledTimes(1);
  expect(state.focus).toHaveBeenCalledTimes(1);
});
