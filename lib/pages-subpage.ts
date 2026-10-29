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
 *
 * Since the subpage became an inline mention, a parent cites its child with a
 * LINK LINE: a paragraph that holds only the page's mention
 * (`[@Title](mention:page/<id>)`). The `subpage` block survives only in pages
 * stored before that change, until their first opening converts them
 * (`convertSubpageBlocks`). Every helper here reads both forms; a page
 * mentioned inside a sentence is text and is never removed by the mirror.
 */

import type { PageDocJSON, PageNodeJSON } from "@/lib/pages-merge";

/** The name of the node, as the registry declares it (components/pages/blocks/subpage.ts). */
export const SUBPAGE_TYPE = "subpage";

function childrenOf(node: PageNodeJSON | null | undefined): PageNodeJSON[] {
  return Array.isArray(node?.content) ? (node.content as PageNodeJSON[]) : [];
}

/** A page mention node's target. */
function mentionedPageId(node: PageNodeJSON): string | null {
  if (node.type !== "mention" || node.attrs?.mentionType !== "page") return null;
  const id = node.attrs?.mentionId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A link line: a paragraph whose only content is one page mention. */
function linkLinePageId(node: PageNodeJSON): string | null {
  if (node.type !== "paragraph") return null;
  const parts = childrenOf(node).filter(
    (child) => !(child.type === "text" && typeof child.text === "string" && !child.text.trim()),
  );
  return parts.length === 1 ? mentionedPageId(parts[0]) : null;
}

/** The page a block stands for: a legacy subpage block or a link line. */
function pageIdOf(node: PageNodeJSON): string | null {
  if (node.type === SUBPAGE_TYPE) {
    const id = node.attrs?.pageId;
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return linkLinePageId(node);
}

/** The attributes of a page mention, as the editor's mention node stores them.
    The label stays empty: a pill resolves the current title on display, and
    agents read mentions relabeled for them. */
export function pageMentionNode(pageId: string, label = ""): PageNodeJSON {
  return {
    type: "mention",
    attrs: {
      mentionType: "page",
      mentionId: pageId,
      mentionLabel: label,
      seed: null,
      color: null,
      icon: null,
      status: null,
      legacy: null,
    },
  };
}

/** The link line that cites `pageId`, keeping a block id when one is given. */
export function pageLinkLine(pageId: string, blockId?: unknown): PageNodeJSON {
  return {
    type: "paragraph",
    ...(typeof blockId === "string" && blockId ? { attrs: { blockId } } : {}),
    content: [pageMentionNode(pageId)],
  };
}

/**
 * Every legacy `subpage` block of the document turned into a link line, in
 * place — in a list item or a leaflet too. The block id is kept, so comments
 * and block links anchored on it still find it. `converted` counts the blocks;
 * the document is returned untouched when it is zero.
 */
export function convertSubpageBlocks(
  doc: PageDocJSON | null | undefined,
): { doc: PageDocJSON | null | undefined; converted: number } {
  if (!doc) return { doc, converted: 0 };
  let converted = 0;
  const walk = (nodes: PageNodeJSON[]): PageNodeJSON[] => {
    let changed = false;
    const out = nodes.map((node) => {
      if (node.type === SUBPAGE_TYPE) {
        converted += 1;
        changed = true;
        const id = node.attrs?.pageId;
        // A block placed before its page existed points nowhere: an empty
        // paragraph keeps the line without inventing a link.
        return typeof id === "string" && id
          ? pageLinkLine(id, node.attrs?.blockId)
          : { type: "paragraph", ...(node.attrs?.blockId ? { attrs: { blockId: node.attrs.blockId } } : {}) };
      }
      const children = childrenOf(node);
      if (children.length === 0) return node;
      const next = walk(children);
      if (next === children) return node;
      changed = true;
      return { ...node, content: next };
    });
    return changed ? out : nodes;
  };
  const content = walk(childrenOf(doc));
  return converted === 0 ? { doc, converted: 0 } : { doc: { ...doc, content }, converted };
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

/** Does the document cite this page — as a block, a link line or a mention
    in a sentence? */
export function hasSubpage(
  doc: PageDocJSON | null | undefined,
  pageId: string
): boolean {
  let found = false;
  const walk = (nodes: PageNodeJSON[]) => {
    for (const node of nodes) {
      if (found) return;
      if (pageIdOf(node) === pageId || mentionedPageId(node) === pageId) {
        found = true;
        return;
      }
      walk(childrenOf(node));
    }
  };
  walk(childrenOf(doc));
  return found;
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
      // The legacy block names its page in `pageId`, a mention in `mentionId`
      // — the mention of a copied page inside a sentence follows the copy too.
      const legacy = node.type === SUBPAGE_TYPE ? pageIdOf(node) : null;
      const mention = mentionedPageId(node);
      const next = legacy ? idMap.get(legacy) : mention ? idMap.get(mention) : undefined;
      const children = childrenOf(node);
      const content = children.length > 0 ? walk(children) : null;
      if (!next && !content) return node;
      return {
        ...node,
        ...(next ? { attrs: { ...node.attrs, [legacy ? "pageId" : "mentionId"]: next } } : {}),
        ...(content ? { content } : {}),
      };
    });

  return { ...doc, content: walk(childrenOf(doc)) };
}

/**
 * Returns the page's link line to the END of the document, if the document no
 * longer cites it.
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
        pageLinkLine(pageId),
      ],
    },
    added: true,
  };
}
