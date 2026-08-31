// The THREADS of a page (MIN-282) — the pure half: the lines enter, the threads
// come out, ordered and marked.
//
// Nothing from the base, nothing from tiptap, nothing from React: the document only arrives here
// in the form of the set of block ids it carries. This is what makes
// ANCHORING and DETACHING testable as is (lib/page-comments.test.ts),
// while these are exactly the two behaviors that we cannot verify
// to the eye.
//
// ─── What “detached” means, and why it’s not a column ──────
//
// A thread anchored on a block that is no longer in the document is detached. It is
// a READING, calculated on each display against the real document — never one
// write. Two reasons, and the second is the true one: a block can return by
// a simple ⌘Z, and a page can be read by several people, therefore the tab which would note
// disappearing would write a state that the next tab is undoing.
//
// A detached thread does not disappear: it goes back TO THE HEAD, with the extract frozen at
// when it was written (`quote`). Deleting it with its block would lose the
// only trace of why the block was removed.

/** A page comment, as rendered by the API. */
export interface PageComment {
  id: string;
  page_id: string;
  project_id: string;
  /** The anchor: the commented block. Null = a comment on the PAGE. */
  block_id: string | null;
  /** The extract from the block, frozen at the time of the comment. */
  quote: string | null;
  body: string;
  author_id: string | null;
  /** The root of the thread when this line is a response (depth ≤ 1). */
  parent_id: string | null;
  via_assistant?: boolean;
  assistant_status?: "working" | "done" | "error" | null;
  assistant_tool?: string | null;
  via_mcp?: boolean;
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_agent?: string | null;
  created_at: string;
  updated_at: string;
}

/** A thread: its root, its answers, and what its anchor has become. */
export interface PageThread {
  root: PageComment;
  replies: PageComment[];
  /** Anchored to a block — whether this block still exists or not. */
  anchored: boolean;
  /** Anchored on an ABSENT block of the document: the thread speaks of a text that has left. */
  detached: boolean;
}

/**
 * The threads of a page, in the order they are read.
 *
 * `blockIds` is the set of block ids of the document as it is AT
 * THE SCREEN — not the last save. It's the only state that decides
 * the detachment, and it changes at the touch of a finger.
 *
 * The order: the DETACHED first (they talk about a text that no one sees anymore, so nothing on the page will remind them), then the rest by date.
 *
 * No “resolved” thread: a page comment is deleted when it no longer has
 * purpose, it is not closed. Resolving makes sense on a CODE REVIEW remark — a point to be addressed before merging, and this is already what the children of a pull request do — not on a note left in a doc, which has no deadline to pass.
 */
export function arrangeThreads(
  comments: PageComment[],
  blockIds: ReadonlySet<string>
): PageThread[] {
  const roots = comments.filter((c) => !c.parent_id);
  const rootIds = new Set(roots.map((c) => c.id));
  const repliesByRoot = new Map<string, PageComment[]>();
  for (const c of comments) {
    if (!c.parent_id || !rootIds.has(c.parent_id)) continue;
    const list = repliesByRoot.get(c.parent_id) ?? [];
    list.push(c);
    repliesByRoot.set(c.parent_id, list);
  }
  // An ORPHAN response (root removed from this list) becomes one again
  // root rather than disappearing: losing text because we lost its
  // parent is exactly what the detachment otherwise denies.
  const orphans = comments.filter((c) => c.parent_id && !rootIds.has(c.parent_id));

  const threads: PageThread[] = [...roots, ...orphans].map((root) => {
    const anchored = !!root.block_id;
    return {
      root,
      replies: (repliesByRoot.get(root.id) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ),
      anchored,
      detached: anchored && !blockIds.has(root.block_id as string),
    };
  });

  return threads.sort((a, b) => {
    if (a.detached !== b.detached) return a.detached ? -1 : 1;
    return a.root.created_at.localeCompare(b.root.created_at);
  });
}

/**
 * The blocks which carry a living thread, and how many messages each — what
 * paints the border and the pastille (components/pages/block-comments.ts).
 *
 * A DETACHED thread does not light anything: its block no longer exists, there is nothing to
 * paint ; it's the page activity that shows it.
 */
export function commentedBlockCounts(
  threads: PageThread[]
): Map<string, number> {
  return new Map(
    [...commentedBlockAnnotations(threads)].map(([id, annotation]) => [
      id,
      annotation.count,
    ])
  );
}

export interface CommentedBlockAnnotation {
  count: number;
  /** Frozen excerpts that still identify a particular passage in the block. */
  quotes: string[];
}

/** The visual annotations carried by each live commented block. */
export function commentedBlockAnnotations(
  threads: PageThread[]
): Map<string, CommentedBlockAnnotation> {
  const annotations = new Map<string, CommentedBlockAnnotation>();
  for (const thread of threads) {
    if (thread.detached || !thread.root.block_id) continue;
    const id = thread.root.block_id;
    const annotation = annotations.get(id) ?? { count: 0, quotes: [] };
    annotation.count += 1 + thread.replies.length;
    const quote = thread.root.quote?.trim();
    if (quote && !annotation.quotes.includes(quote)) {
      annotation.quotes.push(quote);
    }
    annotations.set(id, annotation);
  }
  return annotations;
}

/** Ceiling of the frozen extract: enough to recognize the sentence, not enough to copy the block — a detached thread must fit on two lines in the list. */
export const MAX_QUOTE_LENGTH = 300;

/** The extract as it is stored: folded on a line, cut cleanly, with its
 ellipsis when it was cut. */
export function normalizeQuote(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= MAX_QUOTE_LENGTH
    ? text
    : `${text.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`;
}
