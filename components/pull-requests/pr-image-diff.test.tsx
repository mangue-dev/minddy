// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PullRequestFile } from "@/lib/agent-api";
import { PrImageDiff } from "./pr-image-diff";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("framer-motion", async () => ({ ...await vi.importActual("framer-motion"), useReducedMotion: () => true }));

let root: Root;
let container: HTMLDivElement;
let urls: number;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  urls = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:image-${++urls}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  // Dimensions are read on a detached image; let it load at once.
  vi.stubGlobal("Image", class {
    naturalWidth = 640;
    naturalHeight = 480;
    onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function stubForge(responses: Partial<Record<"base" | "head", number>>) {
  const fetchMock = vi.fn(async (url: string) => {
    const side = new URL(url, "http://app.test").searchParams.get("side") as "base" | "head";
    const status = responses[side] ?? 200;
    return { status, ok: status === 200, blob: async () => new Blob([side]) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function render(status: string) {
  const file = { filename: "public/logo.png", status, additions: 0, deletions: 0 } as PullRequestFile;
  await act(() => root.render(<PrImageDiff file={file} endpoint="/api/pull-requests/pr" locale="en" />));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}

it("opens each side of a modified image in the shared reader (MIN-686)", async () => {
  stubForge({});
  await render("modified");
  const triggers = container.querySelectorAll<HTMLButtonElement>("button[aria-haspopup=dialog]");
  expect(triggers).toHaveLength(2);
  const [before, after] = [...triggers].map((button) => button.querySelector("img")!.getAttribute("src"));

  await act(() => triggers[1].click());
  const dialog = document.querySelector("dialog[open]")!;
  expect(dialog.getAttribute("aria-label")).toBe("public/logo.png · imageAfter");
  expect(dialog.querySelector("img")?.getAttribute("src")).toBe(after);
  expect(after).not.toBe(before);

  // A click on the image keeps it open; Close dismisses it.
  await act(() => (dialog.querySelector("img") as HTMLElement).click());
  expect(document.querySelector("dialog[open]")).not.toBeNull();
  await act(() => (dialog.querySelector("[data-preview-close]") as HTMLElement).click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(document.querySelector("dialog")).toBeNull();
});

it("requests and expands only the existing side of added and removed images", async () => {
  const fetchMock = stubForge({});
  await render("added");
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain("side=head");
  expect(container.querySelectorAll("button[aria-haspopup=dialog]")).toHaveLength(1);

  fetchMock.mockClear();
  await render("removed");
  expect(fetchMock.mock.calls.map(([url]) => url).every((url) => url.includes("side=base"))).toBe(true);
});

it("offers no reader for a missing or failed side", async () => {
  stubForge({ base: 404, head: 500 });
  await render("modified");
  expect(container.querySelectorAll("button[aria-haspopup=dialog]")).toHaveLength(0);
  expect(container.textContent).toContain("imageAbsent");
  expect(container.textContent).toContain("imageFailed");
});
