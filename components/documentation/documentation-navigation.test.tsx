// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DocumentationSidebar, type DocumentationNavigationEntry } from "./documentation-navigation";

vi.mock("@/lib/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("mangue-ui", () => import("mangue-ui/components/ui/collapsible"));
vi.mock("@/components/command-palette.css", () => ({}));

it("opens the current topic, remembers manual folds and shares them with mobile and translated navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  const articles: DocumentationNavigationEntry[] = [
    { id: "first-project", title: "First project", topic: "Get started" },
    { id: "account-access", title: "Account access", topic: "Get started" },
    { id: "create-an-issue", title: "Create an issue", topic: "Projects" },
  ];
  const labels = { topics: "Topics", welcome: "Welcome", close: "Close" };
  const host = document.createElement("div");
  document.body.append(host);
  let root = createRoot(host);
  const render = async (currentId: string | null, entries = articles) => {
    await act(() => root.render(<DocumentationSidebar articles={entries} locale="en" currentId={currentId} labels={labels} />));
  };
  const trigger = (topic: string) => [...host.querySelectorAll("button")].find(button => button.textContent === topic)!;
  try {
    await render(null);
    expect(trigger("Get started").getAttribute("aria-expanded")).toBe("false");
    await render("first-project");
    expect(trigger("Get started").getAttribute("aria-expanded")).toBe("true");
    await render("account-access");
    expect(trigger("Get started").getAttribute("aria-expanded")).toBe("true");
    await render("create-an-issue");
    expect(trigger("Get started").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Projects").getAttribute("aria-expanded")).toBe("true");

    await act(() => trigger("Get started").click());
    await render("first-project");
    expect(trigger("Get started").getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(sessionStorage.getItem("minddy-docs-topics")!)["account-access"]).toBe(false);
    await act(() => root.unmount());
    root = createRoot(host);
    await render("account-access", articles.map(article => ({ ...article, topic: article.topic === "Get started" ? "Getting started" : article.topic })));
    expect(trigger("Getting started").getAttribute("aria-expanded")).toBe("false");
    await act(() => trigger("Getting started").click());
    await render("first-project", articles.map(article => ({ ...article, topic: article.topic === "Get started" ? "Getting started" : article.topic })));
    expect(trigger("Getting started").getAttribute("aria-expanded")).toBe("true");

    const mobileHost = document.createElement("div");
    host.append(mobileHost);
    const mobileRoot = createRoot(mobileHost);
    try {
      await act(() => mobileRoot.render(<DocumentationSidebar articles={articles} locale="en" currentId="first-project" labels={labels} />));
      const mobileTrigger = [...mobileHost.querySelectorAll("button")].find(button => button.textContent === "Get started")!;
      expect(mobileTrigger.getAttribute("aria-expanded")).toBe("true");
      await act(() => mobileTrigger.click());
      expect(trigger("Getting started").getAttribute("aria-expanded")).toBe("false");
    } finally { await act(() => mobileRoot.unmount()); }
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
