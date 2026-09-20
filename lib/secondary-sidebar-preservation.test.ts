// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SecondarySidebarProvider, useSecondarySidebar } from "./secondary-sidebar-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/project/pages" }));
vi.mock("mangue-ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  useMediaQuery: () => false,
}));
vi.mock("@/components/issue-context-menu", () => ({
  IssueContextMenu: ({ position }: { position: unknown }) => position
    ? createPortal(createElement("div", { "data-navigation-menu": true }), document.body)
    : null,
}));
vi.mock("@/components/sidebar-filter-field", () => ({ SidebarFilterField: () => null }));
vi.mock("@/components/navigation-context-actions", () => ({ useNavigationContextActions: () => [] }));

let root: Root;
let container: HTMLDivElement;
let browse: ReturnType<typeof useSecondarySidebar>;

function List() {
  const [selected, setSelected] = useState(0);
  return createElement("button", {
    onClick: () => setSelected((value) => value + 1),
    "data-list-row": true,
    "data-navigation-href": "/home",
  }, selected);
}

function Workspace() {
  browse = useSecondarySidebar();
  return createElement("div", null,
    createElement("div", { ref: browse.setHeaderSlot, hidden: !browse.hosting }),
    createElement("div", { ref: browse.setSlot, hidden: !browse.hosting, "data-sidebar-slot": true }),
    createElement(SecondarySidebar, { title: "Pages", children: createElement(List) }),
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(createElement(SecondarySidebarProvider, { children: createElement(Workspace) })));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("secondary sidebar portal preservation", () => {
  it("closes body-portaled navigation menus when their sidebar level is hidden", async () => {
    const row = container.querySelector<HTMLButtonElement>("[data-list-row]")!;
    await act(() => row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    expect(document.querySelector("[data-navigation-menu]")).not.toBeNull();
    await act(() => browse.goBack());
    expect(document.querySelector("[data-navigation-menu]")).toBeNull();
    await act(() => browse.resetBack());
    expect(document.querySelector("[data-navigation-menu]")).toBeNull();
  });

  it("retains list state, DOM and scroll position while browsing upper navigation levels", async () => {
    const row = container.querySelector<HTMLButtonElement>("[data-list-row]")!;
    const scroller = row.parentElement!;
    await act(() => row.click());
    scroller.scrollTop = 340;
    await act(() => browse.goBack());
    expect(browse.hosting).toBe(false);
    expect(container.querySelector("[data-list-row]")).toBe(row);
    expect(row.closest("[data-sidebar-slot]")?.hasAttribute("hidden")).toBe(true);
    await act(() => browse.resetBack());
    expect(browse.hosting).toBe(true);
    expect(container.querySelector("[data-list-row]")).toBe(row);
    expect(row.textContent).toBe("1");
    expect(scroller.scrollTop).toBe(340);
  });
});
