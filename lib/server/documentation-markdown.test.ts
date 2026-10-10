import { describe, expect, it, vi } from "vitest";
import { documentationBlocks, documentationLocales, documentationPath } from "@/lib/documentation-core.mjs";
import { documentationMarkdownPath } from "@/lib/documentation-delivery";
import { getDocumentationDrafts, getPublishedDocumentation } from "./documentation";
import { documentationMarkdownResponse, renderDocumentationArticle } from "./documentation-markdown";
import { SITE_URL } from "@/lib/site";
import MarkdownIt from "markdown-it";

const origin = SITE_URL;

describe("public documentation Markdown", () => {
  it.each(documentationLocales)("exposes every published %s article from its generated index", async locale => {
    const articles = getPublishedDocumentation(locale);
    expect(articles.length).toBeGreaterThan(0);
    const response = documentationMarkdownResponse(`${origin}${documentationPath(null, locale)}/llms.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Language")).toBe(locale);
    const index = await response.text();
    for (const article of articles) {
      const path = documentationMarkdownPath(article.id, locale);
      expect(index).toContain(`](${origin}${path})`);
      const exported = documentationMarkdownResponse(`${origin}${path}`);
      expect(exported.status).toBe(200);
      expect(exported.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      expect(exported.headers.get("Link")).toContain(`${origin}${documentationPath(article.id, locale)}>; rel="canonical"`);
      const body = await exported.text();
      expect(body).toContain(article.compatibility.version);
      for (const section of article.sections) expect(body).toContain(`#${section.id}`);
      expect(body).not.toContain('"evidence":');
      expect(body).not.toContain('"review":');
      for (const figure of article.figures) {
        if (article.content.includes(`](${figure.src})`)) {
          expect(body).toContain(figure.caption);
          for (const item of figure.diagram?.items ?? []) {
            expect(body).toContain(item.title);
            if (item.detail) expect(body).toContain(item.detail);
          }
        }
      }
      for (const match of body.matchAll(/\]\((https?:\/\/[^\s)]+\.md(?:[?#][^\s)]*)?)\)/g)) {
        const link = new URL(match[1]);
        if (link.origin !== origin) continue;
        const target = articles.find(item => documentationMarkdownPath(item.id, locale) === link.pathname);
        if (link.pathname.endsWith("/index.md")) continue;
        expect(target, `Published target for ${match[1]}`).toBeDefined();
        if (link.hash) expect(target!.sections.some(section => `#${section.id}` === link.hash), `Stable target for ${match[1]}`).toBe(true);
      }
    }
  });

  it("searches published passages and preserves canonical section citations", async () => {
    const body = await documentationMarkdownResponse(`${origin}/docs/index.md?q=implementation%20plan`).text();
    expect(body).toContain("## Search results");
    expect(body).toMatch(/\/docs\/issues\.md#implementation-plans/);
    expect(await documentationMarkdownResponse(`${origin}/docs.md?q=nonexistentterm987`).text()).toContain("No matching published articles");
  });

  it("returns the same article through negotiation and legacy Markdown paths", async () => {
    const canonical = await documentationMarkdownResponse(`${origin}/fr/documentation/issues.md`).text();
    expect(await documentationMarkdownResponse(`${origin}/fr/documentation/issues`).text()).toBe(canonical);
    expect(await documentationMarkdownResponse(`${origin}/fr/documentation/create-an-issue.md`).text()).toBe(canonical);
  });

  it("keeps previews, unpublished content, and arbitrary paths out of exports", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MINDDY_DOCUMENTATION_PREVIEW", "1");
    try {
      const published = getPublishedDocumentation("en");
      for (const article of getDocumentationDrafts().filter(item => item.locale === "en" && !published.some(candidate => candidate.id === item.id))) {
        expect(documentationMarkdownResponse(`${origin}/docs/${article.id}.md`).status).toBe(404);
      }
      for (const path of ["/docs/unknown.md", "/p/token.md", "/md/documentation?route=issues", "/docs/reviews/private.md"]) {
        expect(documentationMarkdownResponse(`${origin}${path}`).status).toBe(404);
      }
    } finally { vi.unstubAllEnvs(); }
  });

  it("preserves executable examples and renders diagrams, captions, and localized links", () => {
    const articles = getPublishedDocumentation("fr");
    const article = articles.find(item => item.id === "issues")!;
    const figure = { ...article.figures[0], kind: "diagram" as const, src: "/diagram.svg", alt: "Flow", caption: "Expected result", diagram: {
      layout: "matrix" as const, title: "Action", headers: ["Role", "Limit"], rows: [["Owner", "Read | write"]], note: "Check permissions",
    } };
    const example = { ...article, figures: [figure], content: '## Example {#example}\n\n![Flow](/diagram.svg)\n\n[Guide](/docs/issues#implementation-plans)\n\n[`npm`](/docs/issues)\n\n`[literal](/docs/issues)`\n\n```sh\necho "[literal](/docs/issues)"\n```' };
    const body = renderDocumentationArticle(example, articles);
    expect(body).toContain("| Owner | Read \\| write |");
    expect(body).toContain("Check permissions");
    expect(body).toContain("Expected result");
    expect(body).toContain(`${origin}/fr/documentation/issues.md#implementation-plans`);
    expect(body).toContain('[`npm`](' + origin + '/fr/documentation/issues.md)');
    expect(body).toContain('`[literal](/docs/issues)`');
    expect(body).toContain('echo "[literal](/docs/issues)"');
  });

  it("keeps fenced operational commands verbatim across the entire English corpus", () => {
    const articles = getPublishedDocumentation("en");
    for (const article of articles) {
      const exported = renderDocumentationArticle(article, articles);
      for (const block of documentationBlocks(article.content)) {
        for (const match of block.content.matchAll(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm)) expect(exported).toContain(match[0]);
      }
    }
  });

  it("preserves backslashes and table boundaries in diagram headers and cells", () => {
    const article = getPublishedDocumentation("en").find(item => item.id === "issues")!;
    const figure = { ...article.figures[0], kind: "diagram" as const, src: "/diagram.svg", diagram: {
      layout: "matrix" as const, headers: [String.raw`Path\|name`, "Result"],
      rows: [["C:\\folder\\", String.raw`one\|two`], ["line\r\nbreak", "last\rcell"]],
    } };
    const body = renderDocumentationArticle({ ...article, figures: [figure], content: "## Example {#example}\n\n![Flow](/diagram.svg)" }, [article]);
    const tokens = new MarkdownIt().parse(body, {});
    const table = tokens.slice(tokens.findIndex(token => token.type === "table_open"), tokens.findIndex(token => token.type === "table_close"));
    expect(table.filter(token => token.type === "th_open")).toHaveLength(2);
    expect(table.filter(token => token.type === "td_open")).toHaveLength(4);
    expect(table.filter(token => token.type === "inline").map(token => token.children?.map(child => child.content).join("")))
      .toEqual([String.raw`Path\|name`, "Result", "C:\\folder\\", String.raw`one\|two`, "line break", "last cell"]);
  });
});
