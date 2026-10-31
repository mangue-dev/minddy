// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarRows, type AppNavSection } from "@/components/app-sidebar";
import { SessionContext } from "@/lib/app-tab-session-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppTabsSession } from "@/lib/app-tabs-session";

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

it("prepares a project section destination through the session on pointer intent, never on render", async () => {
  const prefetch = vi.fn();
  const session = { prefetch } as unknown as AppTabsSession;
  const sections = [{ key: "project", items: [{ key: "feedback", label: "Feedback", href: "/projects/p/feedback" }] }] as unknown as AppNavSection[];
  await act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider><SessionContext.Provider value={session}><SidebarRows sections={sections} /></SessionContext.Provider></TooltipProvider>
    </QueryClientProvider>));
  expect(prefetch).not.toHaveBeenCalled();
  const link = host.querySelector<HTMLAnchorElement>("a[data-sidebar-navigation-item]")!;
  await act(async () => { link.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
  expect(prefetch).toHaveBeenCalledWith("/projects/p/feedback");
});
