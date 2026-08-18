// WHO is cited in a page, and in which block (MIN-278).
//
// The mention node is mounted in the page editor from MIN-273, and write
// “@Clément can you decide that” didn’t warn anyone — while the same
// sentence in a ticket comment, yes. This module is the PURE half of the
// catch-up: the document goes in, the quotes come out. Nothing from the base, nothing
// not tiptap — therefore testable as-is (lib/pages-mentions.test.ts).
//
// ─── Why do we reread the TEXT, and not the nodes ────────────────────────────
//
// Because it is the contract for minddy mentions: what is stored is
// text, “@Name”, and the pill is re-deduced upon rereading (cf.
// components/mention-node.ts and the architecture of mentions). A TYPED mention
// by hand, without going through the selector, is therefore not a node — and it
// counts just as much. We flatten the block into text (a mention node makes its
// “@label”, like `renderText`), then we pass the common scanner
// (lib/mention-scan.ts). A single rule of what IS a mention, shared
// with the input field: this is what guarantees that the pill displayed and the
// accused person designates the same account.
//
// ─── Why by BLOCK ───────────────────────────────────────────────────────────
//
// So that the click on the notification falls on the paragraph, and not at the top
// of a three-screen document. The anchor already exists (`blockLink`,
// components/pages/block-actions.ts), and the page follows it when opened.

import { contentMentionScanner } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

/** The attribute which carries the stable ID of a block — the same string as
 `BLOCK_ID_ATTRIBUTE` (components/pages/blocks/types.ts), copied here rather than imported: this module must remain mountable outside the browser, and the block register pulls tiptap. The test checks it against the source. */
export const PAGE_BLOCK_ID_ATTRIBUTE = "blockId";

interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: DocNode[] | null;
}

/** The text of a node and its descendants, including mentions. */
function textOf(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  // A mention node is ATOMIC: it has no text child, its label
  // lives in its attributes. Without this branch, a mention placed in the selector
  // — the most common case — would be invisible to the scanner.
  if (node.type === "mention") {
    const label = node.attrs?.mentionLabel;
    return typeof label === "string" && label ? `@${label}` : "";
  }
  if (!Array.isArray(node.content)) return "";
  // A space between the children: two stuck blocks should not make one
  // name that has never been written (“@Jean” + “Marc” ≠ “@Jean Marc”).
  return node.content.map(textOf).join(" ");
}

/** A first level block, flattened: its id (when it has one) and its text. */
export interface PageBlockText {
  blockId: string | null;
  text: string;
}

/**
 * The top level blocks of a page document, flattened.
 *
 * Top level only: this is where the block id lives (the anchor, handle,
 * block merge from MIN-271 all hook into it). A mention written in
 * a bullet therefore goes back to the id of the list, which is the right granularity —
 * this is the block that the block link knows to target.
 */
export function pageBlockTexts(doc: unknown): PageBlockText[] {
  const blocks = (doc as DocNode | null)?.content;
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block) => {
    const id = block.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    return {
      blockId: typeof id === "string" && id ? id : null,
      text: textOf(block),
    };
  });
}

/** A quote to warn: who, and where. */
export interface PageMention {
  userId: string;
  /** The block where the quote was found, `null` when it has no id. */
  blockId: string | null;
}

/** The accounts cited in a document, with the FIRST block that cites them. */
function mentionsIn(doc: unknown, members: Member[]): Map<string, string | null> {
  const scan = contentMentionScanner({ members });
  const found = new Map<string, string | null>();
  for (const block of pageBlockTexts(doc)) {
    if (!block.text.includes("@")) continue;
    for (const segment of scan(block.text)) {
      if (segment.mention?.type !== "member") continue;
      const userId = segment.mention.member.user_id;
      // The FIRST block wins: quoting the same person twice must not
      // make the destination depend on the randomness of the iteration order.
      if (!found.has(userId)) found.set(userId, block.blockId);
    }
  }
  return found;
}

/**
 * Which has just been cited in a page, and therefore deserves to be warned.
 *
 * Three rules, the same as for a ticket description
 * (lib/server/description-mentions.ts) — that's the point: a mention
 * has the same behavior everywhere.
 *
 * 1. ACCESS. `members` is the list of people who HAVE access to the project; a name
 * that is not there does not notify anyone.
 * 2. NEVER YOURSELF. Quoting yourself on your own page is not an appeal.
 * 3. NEWS ONLY. We compare to the PREVIOUS document and we do not
 * warn those arriving. Without this, the editor recording a second
 * after the last keystroke, correcting a comma ten lines down
 * would re-save the entire page — and this is the rule that holds all the flow:
 * a burst of autosaves only notifies the save where the name appears.
 *
 * `previousDoc` absent = creation: everything mentioned is new.
 */
export function newPageMentions(params: {
  members: Member[];
  doc: unknown;
  previousDoc?: unknown;
  actorId: string | null;
}): PageMention[] {
  const before = params.previousDoc
    ? mentionsIn(params.previousDoc, params.members)
    : new Map<string, string | null>();

  const out: PageMention[] = [];
  for (const [userId, blockId] of mentionsIn(params.doc, params.members)) {
    if (userId === params.actorId) continue;
    if (before.has(userId)) continue;
    out.push({ userId, blockId });
  }
  return out;
}
