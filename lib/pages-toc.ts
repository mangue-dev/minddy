import type { Node } from "@tiptap/pm/model";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";

/**
 * What the floating table of contents reads from a document
 * (components/pages/page-toc.tsx) — and nothing else: neither React, nor DOM, nor
 * browser, so that reading titles can be tested alone.
 *
 * The source is the ProseMirror STATUS and not the rendered DOM. Two consequences which
 * are worth saying: the table follows the typing without us observing anything that
 * is, and it cannot describe a page that the document no longer contains.
 */
export interface TocEntry {
  /** Stable block identity, independent from edits before the heading. */
  id: string;
  /** The current ProseMirror position used to find the heading in the DOM. */
  pos: number;
  /** 1, 2 or 3: the block register does not offer others. */
  level: number;
  text: string;
}

/**
 * The titles of the document, in reading order.
 *
 * An EMPTY title is not one: we come across one as soon as we type "##" and
 * we stop to think, and an entry without text is a silent line
 * in the table — at best useless, at worst a place that moves under the
 * cursor while writing.
 *
 * Nested titles (in a leaflet, for example) count: they
 * structure the page like the others, and skipping them would make a table that
 * skips sections without ever saying why.
 */
export function readHeadings(doc: Node): TocEntry[] {
  const entries: TocEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const text = node.textContent.trim();
    if (text) {
      const blockId = node.attrs[BLOCK_ID_ATTRIBUTE];
      entries.push({
        id:
          typeof blockId === "string" && blockId
            ? blockId
            : `heading-at-${pos}`,
        pos,
        level: (node.attrs.level as number) || 1,
        text,
      });
    }
    // Un titre n'en contient pas d'autre : inutile d'y descendre.
    return false;
  });
  return entries;
}

/**
 * Do two tables carry the same thing?
 *
 * The reading is redone with EACH keystroke: without this comparison, typing a
 * letter in a paragraph would re-render the entire table, with its transitions
 * width, for content identical.
 */
export function sameHeadings(a: TocEntry[], b: TocEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, i) =>
        entry.id === b[i].id &&
        entry.pos === b[i].pos &&
        entry.level === b[i].level &&
        entry.text === b[i].text
    )
  );
}
