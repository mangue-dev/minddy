/**
 * The BLOCK subpage seen from the document (MIN-272) — pure logic, no IO.
 *
 * The model fits in one sentence, and everything else follows from it: `parent_id` is
 * the TRUTH, the `subpage` block is only one view of it. A page created from
 * sidebar has no blocks in its parent's body, and that's normal.
 *
 * This module is what the two sides of the mirror share:
 *
 * - the server (lib/server/pages.ts) uses it to hold the PARENT's body
 * day when a page goes to the trash or comes back — that's the meaning
 * opposite of the ticket, and it must work even when no one has the parent
 * open, so it can't live in the editor;
 * - the editor uses it to read the subpages present in a document and
 * spot those that have just disappeared.
 *
 * Recursion is essential: a subpage block can be placed IN a
 * leaflet or list item. Looking only at the first level would leave
 * behind a block pointing towards the void — precisely what the ticket
 * seeks to prevent.
 */

import type { PageDocJSON, PageNodeJSON } from "@/lib/pages-merge";

/** The name of the node, as the registry declares it (components/pages/blocks/subpage.ts). */
export const SUBPAGE_TYPE = "subpage";

function childrenOf(node: PageNodeJSON | null | undefined): PageNodeJSON[] {
  return Array.isArray(node?.content) ? (node.content as PageNodeJSON[]) : [];
}

function pageIdOf(node: PageNodeJSON): string | null {
  if (node.type !== SUBPAGE_TYPE) return null;
  const id = node.attrs?.pageId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * The page ids cited by the document, in reading order and without
 * duplicate. A block without `pageId` (placed before the creation is successful) does not
 * is not part: it does not point to anything, there is nothing to trash.
 */
export function subpageIdsIn(doc: PageDocJSON | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (nodes: PageNodeJSON[]) => {
    for (const node of nodes) {
      const id = pageIdOf(node);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
      walk(childrenOf(node));
    }
  };
  walk(childrenOf(doc));
  return out;
}

/** Does the document cite this page? */
export function hasSubpage(
  doc: PageDocJSON | null | undefined,
  pageId: string
): boolean {
  return subpageIdsIn(doc).includes(pageId);
}

/**
 * Removes from the document all blocks that point to one of these pages.
 *
 * `removed` counts the NODES removed, not the pages: the same parent can cite
 * the same subpage twice (copy-paste), and both should go.
 *
 * The returned document is new when something has moved, and it is EXACTLY
 * the input object otherwise — the caller uses it to decide whether to write.
 */
export function removeSubpages(
  doc: PageDocJSON | null | undefined,
  pageIds: Iterable<string>
): { doc: PageDocJSON | null | undefined; removed: number } {
  const targets = new Set(pageIds);
  if (!doc || targets.size === 0) return { doc, removed: 0 };

  let removed = 0;
  const prune = (nodes: PageNodeJSON[]): PageNodeJSON[] => {
    const out: PageNodeJSON[] = [];
    for (const node of nodes) {
      const id = pageIdOf(node);
      if (id && targets.has(id)) {
        removed += 1;
        continue;
      }
      const children = childrenOf(node);
      if (children.length === 0) {
        out.push(node);
        continue;
      }
      const next = prune(children);
      out.push(next === children ? node : { ...node, content: next });
    }
    return out.length === nodes.length && out.every((n, i) => n === nodes[i])
      ? nodes
      : out;
  };

  const content = prune(childrenOf(doc));
  if (removed === 0) return { doc, removed: 0 };
  return { doc: { ...doc, content }, removed };
}

/**
 * Rewrites cited pages based on a `ancien id → nouvel id` table.
 *
 * This is what makes a DUPLICATION honest. Copy a page and its subpages
 * by copying the bodies as they are would give a copy whose blocks point
 * again towards the ORIGINALS: two trees in the sidebar, a single set of links,
 * and a copy that we believe to be independent when it refers elsewhere.
 *
 * A citation OFF the table is not touched — a link to a page in the
 * project that is not part of the copy must continue to point where it
 * pointed. We copy a branch, not the world around it.
 */
export function remapSubpages(
  doc: PageDocJSON | null | undefined,
  idMap: ReadonlyMap<string, string>
): PageDocJSON | null | undefined {
  if (!doc || idMap.size === 0) return doc;

  const walk = (nodes: PageNodeJSON[]): PageNodeJSON[] =>
    nodes.map((node) => {
      const id = pageIdOf(node);
      const next = id ? idMap.get(id) : undefined;
      const children = childrenOf(node);
      const content = children.length > 0 ? walk(children) : null;
      if (!next && !content) return node;
      return {
        ...node,
        ...(next ? { attrs: { ...node.attrs, pageId: next } } : {}),
        ...(content ? { content } : {}),
      };
    });

  return { ...doc, content: walk(childrenOf(doc)) };
}

/**
 * Returns a subpage block to the END of the document, if it is no longer there.
 *
 * At the end of the body, and not in its original place: remember the exact position
 * would ask to log the neighborhood of the block at the time of deletion,
 * for almost no gain — we restore a page, not a layout. It is
 * the assumed hypothesis of the ticket.
 *
 * Without `blockId`: it is `UniqueID` which places one on the next editing of
 * the editor. Inventing one here would require a random generator in a
 * pure module, and two customers could install two different ones on the same
 * bloc.
 */
export function appendSubpage(
  doc: PageDocJSON | null | undefined,
  pageId: string
): { doc: PageDocJSON; added: boolean } {
  const base: PageDocJSON = doc ?? { type: "doc", content: [] };
  if (hasSubpage(base, pageId)) return { doc: base, added: false };
  return {
    doc: {
      ...base,
      content: [
        ...childrenOf(base),
        { type: SUBPAGE_TYPE, attrs: { pageId } },
      ],
    },
    added: true,
  };
}
