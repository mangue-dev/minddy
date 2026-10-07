// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SecondarySidebarProvider, useSecondarySidebar } from "./secondary-sidebar-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/project/pages" }));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("mangue-ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  useMediaQuery: () => viewport.mobile,
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
  viewport.mobile = false;
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

it("hosts mobile collection selection in the menu while page state survives closing it", async () => {
  viewport.mobile = true;
  const onNavigate = vi.fn();
  const header = document.createElement("div");
  const body = document.createElement("div");
  container.append(header, body);
  function MobilePage() {
    browse = useSecondarySidebar();
    const [selected, setSelected] = useState("First item");
    return createElement("main", null,
      createElement("p", { "data-page-content": true }, selected),
      createElement(SecondarySidebar, { title: "Collection", hiddenOnMobile: true, children: [
        createElement("button", { key: "group", "data-group-toggle": true }, "Toggle group"),
        createElement("button", { key: "item", "data-navigation-href": "/home", onClick: () => setSelected("Second item") }, "Choose second"),
        createElement("button", { key: "category", "data-sidebar-navigation-item": true, onClick: () => setSelected("Category content") }, "Choose category"),
      ] }),
    );
  }
  await act(() => root.render(createElement(SecondarySidebarProvider, { children: createElement(MobilePage) })));
  // These host nodes represent the menu's portal destinations.
  document.body.append(header, body);
  await act(() => browse.setMobileHost({ route: "/projects/project/pages", header, body, onNavigate }));
  expect(header.textContent).toBe("Collection");
  expect(body.querySelector("[data-mobile-collection-navigation]")).not.toBeNull();
  expect(container.querySelector("[data-mobile-collection-navigation]")).toBeNull();
  await act(() => body.querySelector<HTMLButtonElement>("[data-group-toggle]")!.click());
  expect(onNavigate).not.toHaveBeenCalled();
  await act(() => body.querySelector<HTMLButtonElement>("[data-navigation-href]")!.click());
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(container.querySelector("[data-page-content]")?.textContent).toBe("Second item");
  await act(() => body.querySelector<HTMLButtonElement>("[data-sidebar-navigation-item]")!.click());
  expect(onNavigate).toHaveBeenCalledTimes(2);
  expect(container.querySelector("[data-page-content]")?.textContent).toBe("Category content");
  await act(() => browse.setMobileHost(null));
  expect(body.textContent).toBe("");
  expect(container.querySelector("[data-page-content]")?.textContent).toBe("Category content");
  await act(() => browse.setMobileHost({ route: "/another-route", header, body, onNavigate }));
  expect(body.textContent).toBe("");
  await act(() => browse.setMobileHost(null));
  header.remove(); body.remove();
});
