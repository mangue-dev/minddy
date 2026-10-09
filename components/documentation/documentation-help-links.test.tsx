// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { expect, it, vi } from "vitest";
import { DocumentationHelpResponse, documentationHelpLinkComponents, rehypeDocumentationSectionReferences } from "./documentation-help-links";

vi.mock("mangue-ui", () => import("mangue-ui/lib/utils"));

const sections = [
  { id: "create-an-issue", title: "Create an issue", level: 2 },
  { id: "implementation-plans", title: "Implementation plans", level: 3 },
];
const appUrl = "http://localhost:3000";

function render(content: string) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<ReactMarkdown
    components={documentationHelpLinkComponents(appUrl, "issues", "en", sections)}
    rehypePlugins={[[rehypeDocumentationSectionReferences, sections]]}
  >{content}</ReactMarkdown>);
  return host;
}

it("renders repeated prose references as blue section citations with the heading title and a hashtag", () => {
  const host = render("See {#create-an-issue}, **{#implementation-plans}**, then {#create-an-issue}.");
  const links = [...host.querySelectorAll("a")];
  expect(links.map(link => link.getAttribute("href"))).toEqual(["#create-an-issue", "#implementation-plans", "#create-an-issue"]);
  expect(links.map(link => link.textContent)).toEqual(["#Create an issue", "#Implementation plans", "#Create an issue"]);
  for (const link of links) {
    expect(link.classList.contains("markdown-link")).toBe(true);
    expect(link.hasAttribute("data-documentation-citation")).toBe(true);
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe("#");
    expect(link.querySelector("svg")).toBeNull();
  }
});

it("preserves unknown and incomplete references, inline and fenced code, and existing link labels", () => {
  const host = render("{#missing} {#create-an-issue\n\n`{#create-an-issue}`\n\n```text\n{#implementation-plans}\n```\n\n[Literal {#create-an-issue}](https://example.com)");
  expect(host.querySelectorAll("a")).toHaveLength(1);
  expect(host.querySelector("a")?.textContent).toBe("Literal {#create-an-issue}");
  expect([...host.querySelectorAll("code")].map(code => code.textContent?.trim())).toEqual(["{#create-an-issue}", "{#implementation-plans}"]);
  expect(host.textContent).toContain("{#missing} {#create-an-issue");
});

it("enriches fragment and canonical current-guide links while preserving other guides and languages", () => {
  const host = render("[Section](#create-an-issue) [Guide](https://minddy.app/docs/issues#create-an-issue) [Other](/docs/pages#editor-save) [French](/fr/documentation/issues#create-an-issue)");
  expect([...host.querySelectorAll("a")].map(link => [link.getAttribute("href"), link.textContent])).toEqual([
    ["#create-an-issue", "#Create an issue"],
    ["#create-an-issue", "#Create an issue"],
    ["/docs/pages#editor-save", "Other"],
    ["/fr/documentation/issues#create-an-issue", "French"],
  ]);
});

it("updates unchanged streamed text when the current article's section context changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const content = "See {#create-an-issue}.";
  const response = (currentSections: typeof sections) => <DocumentationHelpResponse appUrl={appUrl} articleId="issues" locale="en" sections={currentSections} isAnimating>{content}</DocumentationHelpResponse>;
  try {
    await act(() => root.render(response([])));
    expect(host.querySelector("a")).toBeNull();
    await act(() => root.render(response(sections)));
    expect(host.querySelector("a")?.textContent).toBe("#Create an issue");
    await act(() => root.render(response([])));
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain("{#create-an-issue}");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
