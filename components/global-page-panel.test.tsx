// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalPagePanel } from "./global-page-panel";

const h = vi.hoisted(() => ({
  pages: new Map<string, { id: string; title: string; database_schema: unknown[] | null }>(),
  pathname: "/projects/p1",
  push: vi.fn(),
  navigate: vi.fn((_href: string, open: () => void) => open()),
  flush: vi.fn(async () => true),
  onNavigate: undefined as undefined | ((id: string, databaseId?: string) => void),
}));

// The document and the side panel are reduced to what the panel decides:
// which page it shows, and its two ways out.
vi.mock("@/components/pages/page-view", () => ({
  PageView: ({ pageId, onNavigate, onNavigationReady }: {
    pageId: string;
    onNavigate: (id: string, databaseId?: string) => void;
    onNavigationReady: (flush: () => Promise<boolean>) => void;
  }) => {
    h.onNavigate = onNavigate;
    onNavigationReady(h.flush);
    return <article data-page-id={pageId} />;
  },
}));
vi.mock("@/components/pages/page-peek-panel", () => ({
  PagePeekPanel: ({ expandLabel, onExpand, onClose, children }: {
    expandLabel: string;
    onExpand: () => void;
    onClose: () => void;
    children: ReactNode;
  }) => (
    <div>
      <button type="button" onClick={onExpand}>{expandLabel}</button>
      <button type="button" onClick={onClose}>close</button>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/use-pages-query", () => ({
  usePagesQuery: () => ({ byId: h.pages, loading: false }),
}));
vi.mock("@/lib/use-app-router", () => ({
  useAppRouter: () => ({ push: h.push }),
  useAppNavigation: () => h.navigate,
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));

const messages = { Pages: { untitled: "Untitled", expand: "Expand" } };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.pages = new Map([
    ["doc", { id: "doc", title: "Specification", database_schema: null }],
    ["child", { id: "child", title: "Details", database_schema: null }],
    ["db", { id: "db", title: "Roadmap", database_schema: [] }],
  ]);
  h.pathname = "/projects/p1";
  window.history.replaceState(null, "", "/");
  h.push.mockClear();
  h.navigate.mockClear();
  h.flush.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(pageId: string, onClose = vi.fn()) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GlobalPagePanel projectId="p1" pageId={pageId} onClose={onClose} />
      </NextIntlClientProvider>,
    );
  });
  return onClose;
}

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;

it("shows a classic page and expands it to its full screen after saving", async () => {
  const onClose = await render("doc");
  expect(host.querySelector("[data-page-id]")?.getAttribute("data-page-id")).toBe("doc");
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => button("Expand").click());
  expect(h.flush).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
  expect(h.push).toHaveBeenCalledWith("/projects/p1/pages/doc");
});

it("keeps the panel open when the page could not be saved", async () => {
  h.flush.mockResolvedValueOnce(false);
  const onClose = await render("doc");
  await act(async () => button("close").click());
  expect(onClose).not.toHaveBeenCalled();
});

it("sends a database page to its full screen instead of the panel", async () => {
  const onClose = await render("db");
  expect(host.querySelector("[data-page-id]")).toBeNull();
  expect(onClose).toHaveBeenCalled();
  expect(h.push).toHaveBeenCalledWith("/projects/p1/pages/db");
});

it("uses the pages shell's router when the pages screen is already open", async () => {
  h.pathname = "/projects/p1/pages/other";
  await render("doc");
  await act(async () => button("Expand").click());
  expect(h.push).not.toHaveBeenCalled();
  expect(h.navigate).toHaveBeenCalledWith("/projects/p1/pages/doc", expect.any(Function));
});

it("replaces its document with a subpage opened from it", async () => {
  const onClose = await render("doc");
  await act(async () => h.onNavigate?.("child"));
  expect(host.querySelector("[data-page-id]")?.getAttribute("data-page-id")).toBe("child");
  expect(onClose).not.toHaveBeenCalled();
});

it("closes when the page is already the screen underneath", async () => {
  window.history.replaceState(null, "", "/projects/p1/pages/doc");
  const onClose = await render("doc");
  expect(onClose).toHaveBeenCalled();
  expect(h.push).not.toHaveBeenCalled();
});
