// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarRows, type AppNavSection } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/app-link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-navigation-context-actions", () => ({ useNavigationContextActions: () => [] }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function renderProjects(onMove: (activeKey: string, overKey: string) => void) {
  const sections: AppNavSection[] = [{
    reorder: { keys: ["project-a", "project-b", "project-c"], onMove, instructions: "Move the project." },
    items: [
      { key: "project-a", label: "Alpha", href: "/projects/a" },
      { key: "project-b", label: "Beta", href: "/projects/b" },
      { key: "project-c", label: "Gamma", href: "/projects/c" },
      { key: "new-project", label: "New project", onClick: () => {} },
    ],
  }];
  await act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider><SidebarRows sections={sections} /></TooltipProvider>
    </QueryClientProvider>));
}

const row = (name: string) => [...host.querySelectorAll<HTMLElement>("[data-sidebar-navigation-item]")]
  .find((element) => element.textContent?.includes(name))!;

const press = (element: HTMLElement, key: string, modifiers: KeyboardEventInit = { altKey: true, shiftKey: true }) =>
  act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers })); });

it("moves the focused project one place with Alt+Shift+Up or Down", async () => {
  const onMove = vi.fn();
  await renderProjects(onMove);
  await press(row("Beta"), "ArrowDown");
  expect(onMove).toHaveBeenLastCalledWith("project-b", "project-c");
  await press(row("Beta"), "ArrowUp");
  expect(onMove).toHaveBeenLastCalledWith("project-b", "project-a");
});

it("does nothing past either end, or without both modifiers", async () => {
  const onMove = vi.fn();
  await renderProjects(onMove);
  await press(row("Alpha"), "ArrowUp");
  await press(row("Gamma"), "ArrowDown");
  await press(row("Beta"), "ArrowDown", { altKey: true });
  expect(onMove).not.toHaveBeenCalled();
});

it("only lets the listed projects move and says how", async () => {
  await renderProjects(vi.fn());
  expect(row("Alpha").getAttribute("aria-keyshortcuts")).toContain("Alt+Shift+ArrowUp");
  expect(row("New project").hasAttribute("aria-keyshortcuts")).toBe(false);
});
