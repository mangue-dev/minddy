// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/markdown";
import { PrEndpointProvider } from "./pr-endpoint-context";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe("pull request image previews", () => {
  it.each([
    "[![Capture](https://github.com/user-attachments/assets/11111111-2222-3333-4444-555555555555)](https://example.com)",
    '<a href="https://example.com"><img alt="Capture" src="https://github.com/user-attachments/assets/11111111-2222-3333-4444-555555555555"></a>',
  ])("opens linked Markdown and HTML images without navigating and keeps the authenticated source: %s", async (body) => {
    await act(() => root.render(createElement(PrEndpointProvider, {
      endpoint: "/api/pull-requests/pr",
      children: createElement(Markdown, { children: body, allowRawHtml: true }),
    })));
    const thumbnail = host.querySelector("img")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(() => { thumbnail.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    const preview = document.querySelector('[role="dialog"] img')!;
    expect(preview.getAttribute("src")).toBe(thumbnail.getAttribute("src"));
    expect(preview.getAttribute("src")).toBe("/api/pull-requests/pr/image?asset=11111111-2222-3333-4444-555555555555");
  });

  it.each(["Enter", " "])("opens an image with the %s key", async (key) => {
    await act(() => root.render(createElement(PrEndpointProvider, {
      endpoint: "/api/agent-runs/run/pr",
      children: createElement(Markdown, { children: "![Capture](https://example.com/capture.png)" }),
    })));
    const thumbnail = host.querySelector("img")!;
    expect(thumbnail.getAttribute("tabindex")).toBe("0");
    await act(() => { thumbnail.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
    expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe("https://example.com/capture.png");
  });

  it("keeps images outside pull requests as ordinary Markdown content", async () => {
    await act(() => root.render(createElement(Markdown, { children: "![Capture](https://example.com/capture.png)" })));
    const thumbnail = host.querySelector("img")!;
    expect(thumbnail.hasAttribute("tabindex")).toBe(false);
    await act(() => { thumbnail.click(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
