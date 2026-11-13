import { Extension } from "@tiptap/core";

/**
 * Markdown TABLES, read into a document that has no table block.
 *
 * markdown-it renders a GFM table as `<table>`, and the editor schema has no
 * node for it: ProseMirror's DOM parser then keeps only the text of the cells
 * and joins them into one paragraph, with nothing between them
 * (`ENFRPrivacy policyhttps://…https://…`). Agents write tables often, so a
 * page written by Numo or over MCP came out glued.
 *
 * Until pages have a table block, each row becomes one bullet that keeps
 * every cell and says which column it belongs to:
 *
 *   | | EN | FR |            - **Privacy** — EN: `…/privacy` · FR: `…/fr/…`
 *   | --- | --- | --- |   →
 *   | Privacy | `…` | `…` |
 *
 * The first cell names the row, in bold; the others follow as
 * `Header: value`, empty cells omitted. Inline formatting (code, links, bold)
 * is moved as is, so nothing in a cell is lost.
 */
export function flattenMarkdownTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll("table"))) {
    // A table nested in another one is handled with its parent's cells.
    if (table.parentElement?.closest("table")) continue;
    table.replaceWith(tableToList(table));
  }
}

function tableToList(table: HTMLTableElement): HTMLUListElement {
  const doc = table.ownerDocument;
  const rows = Array.from(table.rows);
  const headRow = table.tHead?.rows[0] ?? null;
  const bodyRows = headRow && rows.length > 1 ? rows.filter((row) => row !== headRow) : rows;
  const headers = headRow && bodyRows !== rows
    ? Array.from(headRow.cells).map((cell) => (cell.textContent ?? "").trim())
    : [];

  const list = doc.createElement("ul");
  for (const row of bodyRows) {
    const cells = Array.from(row.cells);
    const paragraph = doc.createElement("p");
    const [first, ...rest] = cells;
    if (first && hasContent(first)) {
      const strong = doc.createElement("strong");
      strong.append(...Array.from(first.childNodes));
      paragraph.append(strong);
    }
    let pieces = 0;
    rest.forEach((cell, index) => {
      if (!hasContent(cell)) return;
      const separator = pieces > 0 ? " · " : paragraph.hasChildNodes() ? " — " : "";
      const header = headers[index + 1];
      paragraph.append(doc.createTextNode(`${separator}${header ? `${header}: ` : ""}`));
      paragraph.append(...Array.from(cell.childNodes));
      pieces += 1;
    });
    if (!paragraph.hasChildNodes()) continue;
    const item = doc.createElement("li");
    item.append(paragraph);
    list.append(item);
  }
  return list;
}

function hasContent(cell: HTMLTableCellElement): boolean {
  return (cell.textContent ?? "").trim() !== "" || cell.querySelector("img") !== null;
}

/** Hooks `flattenMarkdownTables` into tiptap-markdown's parse. */
export const MarkdownTables = Extension.create({
  name: "markdownTables",
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            flattenMarkdownTables(element);
          },
        },
      },
    };
  },
});
