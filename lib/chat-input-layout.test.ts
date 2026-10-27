// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const h = vi.hoisted(() => ({
  uploads: {
    pending: [], inputs: [], uploading: false,
    addFiles: vi.fn(), remove: vi.fn(), clear: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: null }), useAuthOptional: () => null }));
vi.mock("./use-attachment-uploads", () => ({ useAttachmentUploads: () => h.uploads }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/components/theme-provider", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { ChatInput } from "@/components/assistant/chat-input";

let root: Root;
let container: HTMLDivElement;
const editor = () => container.querySelector<HTMLElement>("[role=textbox]")!;
// The compact row's text cell carries its own vertical padding.
const compact = (element: HTMLElement) => !!element.closest('[class*="pt-[15px]"]');

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  // A narrow panel: the compact row leaves the text less room than the
  // placeholder needs, so an empty composer's placeholder wraps there,
  // while an empty composer has no text width at all.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "textbox" ? (compact(this) ? 60 : 240) : 260;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "textbox" && compact(this) ? 44 : 22;
  });
  Range.prototype.getBoundingClientRect = () => ({ width: 0 } as DOMRect);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("expands an empty composer whose placeholder overflows a narrow panel, without flipping back", async () => {
  // The placeholder measures 150 px, wider than the compact row's 60 px.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: () => ({ width: 150 }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    font: "14px sans-serif", lineHeight: "22px", paddingLeft: "0px", paddingRight: "0px",
  } as CSSStyleDeclaration);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    root.render(createElement(TooltipProvider, {
      children: createElement(ChatInput, { onSend: vi.fn(), hideAttach: true }),
    }));
  });
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/Maximum update depth/);
  expect(editor().textContent).toBe("");
  expect(compact(editor())).toBe(false);
});

it("keeps a line that wraps in the compact row on its own row, without flipping back", async () => {
  // One line of text, wider than the compact row's room but far narrower
  // than an estimate from the controls alone.
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "textbox" && compact(this) ? 44 : 22;
  });
  Range.prototype.getBoundingClientRect = () => ({ width: 100 } as DOMRect);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    root.render(createElement(TooltipProvider, {
      children: createElement(ChatInput, { onSend: vi.fn(), hideAttach: true, draftHtml: "Summarize the open triage" }),
    }));
  });
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/Maximum update depth/);
  expect(editor().textContent).toBe("Summarize the open triage");
  expect(compact(editor())).toBe(false);
});
