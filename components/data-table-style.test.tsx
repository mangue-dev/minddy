import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "@/components/markdown";

// MIN-947: read-only tables (comments and pull request bodies, the routine
// run history, Numo's answers) share the look of a page database's table.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("read-only data tables", () => {
  it("renders a Markdown table with the shared look and no frame of its own", () => {
    const html = renderToStaticMarkup(
      <Markdown>{"| Name | Status |\n| --- | --- |\n| Login | Done |"}</Markdown>,
    );
    expect(html).toMatch(/<table class="data-table[ "]/);
    expect(html).not.toMatch(/<div[^>]*border[^>]*><table/);
    expect(html).not.toMatch(/<thead class=/);
  });

  it("gives the routine run history the shared look", () => {
    const source = read("components/routines/routine-detail.tsx");
    expect(source).toMatch(/<table className="data-table data-table-interactive /);
    expect(source).not.toContain("bg-muted/30");
  });

  it("keeps the default arrow over a whole clickable row (MIN-587)", () => {
    const css = read("app/globals.css");
    const rule = css.split(".data-table-interactive > tbody > tr {")[1]?.split("}")[0] ?? "";
    expect(rule).toContain("cursor: default;");
    expect(rule).not.toContain("cursor: pointer");
  });

  it("styles Numo's Streamdown tables with the same rules", () => {
    const css = read("app/globals.css");
    expect(css).toContain(':is(.data-table, [data-streamdown="table"])');
    // Streamdown frames its table in a bordered box; the database has none.
    expect(css).toMatch(/div:has\(> \[data-streamdown="table"\]\) \{\s*border: 0;/);
  });
});
