/**
 * The PAGES of a project (MIN-266) — the pure logic of the tree.
 *
 * No IO here: this whole module works on the FLAT LIST that the server
 * renders in a request. This is the heart of the model — nesting is just one
 * `parent_id` column, so the tree is rebuilt at the caller (sidebar,
 * breadcrumbs, parent selector) without recursive CTE and without N+1, and the
 * depth can remain unlimited at no cost whatever. it is.
 *
 * What this imposes in return: nothing prohibits a CYCLE. Freely reparent
 * a page under another can close a loop (A → B → C → A), and any
 * function that goes down the tree then goes into infinite recursion — white screen.
 * `wouldCreateCycle` is the guard, called BEFORE writing by
 * `lib/server/pages.ts` ; the UI can recall it to gray out a choice, but it
 * is never the only bearer.
 */

/**
 * The NATURE of a page entry (MIN-277): a human, or the agent.
 *
 * It is not deduced from the actor - a gesture from Numo, the MCP or the agent of
 * code carries the id of the account which authorized it. It is therefore transported with
 * the writing, from the surface which triggers it to the history line.
 */
export type PageWriteKind = "human" | "agent";

/**
 * How often the open page proves it is still on screen (MIN-278 follow-up).
 *
 * The editor pings the watch route at this cadence; the server keeps a viewer
 * row fresh and skips the agent-write notification for it. Three beats of
 * margin before the server stops believing in a watcher
 * (`PAGE_WATCH_FRESH_MS`): one missed ping must not resurrect the inbox line,
 * a closed laptop must not silence it forever.
 */
export const PAGE_WATCH_PING_MS = 20_000;

/** A viewer row older than this no longer counts as watching. */
export const PAGE_WATCH_FRESH_MS = 3 * PAGE_WATCH_PING_MS;

/** A page, as it comes out of the table (raw columns). */
export interface Page {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  /** Emoji, or null when the page takes the default icon. */
  icon: string | null;
  /** ProseMirror document. `null` when reading has not requested it. */
  content: unknown;
  version: number;
  /** Fractional index: sorting of siblings is lexicographic. */
  position: string;
  created_by: string | null;
  /**
 * The author of the LAST writing (MIN-277), and the nature of his action.
 *
 * The two go together: six writing tools are open to Numo, the MCP
 * and the code agent, and all write under the id of a human account. Without
 * `updated_kind`, a page rewritten by the agent would show "modified by
 * Clement" — the exact opposite of minddy's identity rule.
 *
 * `null` on a page that no one has rewritten since its creation: it's
 * then `created_by` which names its author.
 */
  updated_by: string | null;
  updated_kind: PageWriteKind;
  /** The MCP key behind the last writing, when it comes from an agent of
 key (MIN-282): it is this which distinguishes “Claude Code” from Numo, which
 `updated_kind: "agent"` covers both. */
  updated_api_key_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  /** The page through which the deletion occurred (null on the root). */
  deleted_root_id: string | null;
  /**
 * The parent's body cited this page, and its block was removed when
 * was trashed (MIN-272). This is what allows the restoration
 * to put the block back **where there was one** — and nowhere else:
 * a page born in the sidebar has never had a block in its parent.
 */
  parent_block_removed: boolean;
  /**
 * Pinned to the head of the secondary bar — SHARED by the project, not own
 * to whoever looks at it (see the `pages_favorite` migration).
 *
 * A favorite subpage is then read TWICE in the bar: once at the head, flat, and once in its place in the tree. This is by design — the favorite
 * is a shortcut to a page, not a move, and seeing it move out of
 * under its parent would make it seem like a reparent.
 */
  favorite: boolean;
}

/**
 * A 1-page PREVIOUS STATE (MIN-277), as the history renders it.
 *
 * The body is only there on the preview of ONE version: the list carries it
 * never — twenty ProseMirror documents for a list of dates would be the
 * heaviest request on the screen for content that no one displays.
 */
export interface PageVersion {
  id: string;
  page_id: string;
  version: number;
  title: string;
  icon: string | null;
  /** ProseMirror document — missing from the list, present on the preview. */
  content?: unknown;
  author_id: string | null;
  author_kind: PageWriteKind;
  /** The name to display, resolved on the server side. “minddy” on an agent gesture. */
  author_name: string;
  /**
 * The AGENT behind an MCP key write, resolved server-side — the canonical id
 * that `McpAvatar` reads (“claude-code”, “cursor”…). Null when
 * the writing is human, or comes from Numo.
 *
 * The NAME remains “minddy” in both agent cases (identity rule); this
 * field only decides the face.
 */
  author_agent?: string | null;
  created_at: string;
}

/**
 * What the TREE reads from a page, and nothing more.
 *
 * The flat list that the server renders does not carry the body of the documents: its
 * lines are therefore NOT `Page`. This entire module works on this common minimum
 * and remains generic on the rest — this is what allows the sidebar to
 * to build its tree with lines without bodies, and to the tests to build it with
 * whole pages, without two sets of functions.
 */
export interface PageRow {
  id: string;
  parent_id: string | null;
  title: string;
  position: string;
}

/** The same page, once the tree has been rebuilt. */
export type PageTreeNode<T extends PageRow> = T & {
  children: PageTreeNode<T>[];
  /** 0 for a root page. */
  depth: number;
};

/** The entire page tree — the common case on the server side and in tests. */
export type PageNode = PageTreeNode<Page>;

/* ─── L'arbre ──────────────────────────────────────────────────────────────── */

/**
 * Reconstructs the tree from the flat list, siblings sorted by `position`.
 *
 * Two cases which are not errors and should not cause anything to disappear:
 * a page whose parent is NOT in the list (parent in the trash, or
 * partial read) goes back to the root rather than out of the tree — an invisible
 * page is worse than a misplaced page; and a cycle possibly
 * present in the base (bypassed guard, direct write) is broken here, its
 * members treated as roots, so that rendering remains possible.
 */
export function buildPageTree<T extends PageRow>(
  pages: readonly T[]
): PageTreeNode<T>[] {
  const byId = new Map<string, PageTreeNode<T>>();
  for (const page of pages) {
    byId.set(page.id, { ...page, children: [], depth: 0 });
  }

  const roots: PageTreeNode<T>[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id && !descends(byId, parent, node.id)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (nodes: PageTreeNode<T>[], depth: number) => {
    nodes.sort(byPosition);
    for (const node of nodes) {
      node.depth = depth;
      sort(node.children, depth + 1);
    }
  };
  sort(roots, 0);

  return roots;
}

/** Is `a` descended from `ancestorId`? Bounded by the number of pages. */
function descends<T extends PageRow>(
  byId: Map<string, PageTreeNode<T>>,
  from: PageTreeNode<T>,
  ancestorId: string
): boolean {
  const seen = new Set<string>();
  let current: PageTreeNode<T> | undefined = from;
  while (current) {
    if (current.id === ancestorId) return true;
    if (seen.has(current.id)) return false; // cycle already present: we stop
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return false;
}

/**
 * Order of a sibling: the position first (fractional index, comparison
 * lexicographic), the title then when two positions are identical —
 * possible after an import or a concurrent writing —, and the id last
 * recourse so that the order is total and therefore stable from one rendering to the other.
 */
export function byPosition(a: PageRow, b: PageRow): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Flattens a tree in display order (parent, then its descendants). */
export function flattenPageTree<T extends PageRow>(
  nodes: readonly PageTreeNode<T>[]
): PageTreeNode<T>[] {
  const out: PageTreeNode<T>[] = [];
  const walk = (list: readonly PageTreeNode<T>[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * The PINLED pages, in the order of the tree.
 *
 * The order is that of the in-depth search, and not that of the postings
 * favorite: it is the only one that the eye finds from one visit to the next, and it does not
 * does not rearrange the block when a fourth is pinned.
 *
 * It starts from the TREE and not from the flat list, which solves two cases of one
 * suddenly: a page whose parent is in the trash has been moved up to the root
 * by `buildPageTree` and therefore remains pinned, and each sibling is already sorted
 * by `position`.
 *
 * What it does NOT do: remove the page from the tree. A favorite subpage
 * reads twice in the bar — pinning is a shortcut, not a
 * move.
 */
export function favoritePages<T extends PageRow & { favorite: boolean }>(
  tree: readonly PageTreeNode<T>[]
): PageTreeNode<T>[] {
  return flattenPageTree(tree).filter((node) => node.favorite);
}

/**
 * The ids of all descendants of a page, NOT including the page.
 *
 * This is what the recycle bin trashes with it (recursive delete
 *), and what the purge ends up clearing.
 */
export function descendantIds(
  pages: readonly { id: string; parent_id: string | null }[],
  pageId: string
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parent_id) continue;
    const siblings = childrenOf.get(page.parent_id);
    if (siblings) siblings.push(page.id);
    else childrenOf.set(page.parent_id, [page.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>([pageId]);
  const queue = [pageId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child)) continue; // cycle en base : on ne boucle pas
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/** The ancestors of a page, from the closest to the root (reverse breadcrumbs). */
export function ancestorsOf<T extends { id: string; parent_id: string | null }>(
  pages: readonly T[],
  pageId: string
): T[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: T[] = [];
  const seen = new Set<string>([pageId]);
  let parentId = byId.get(pageId)?.parent_id ?? null;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    out.push(parent);
    parentId = parent.parent_id;
  }
  return out;
}

/**
 * Beyond this number of levels, the breadcrumb folds its MIDDLE.
 *
 * Three, because this is the point where folding saves space: at three
 * levels, a “…” would replace a single element with another of width
 * comparable, costing one click.
 */
const MAX_PATH_LEVELS = 3;

/**
 * Cuts out a path into what we show and what we fold (MIN-272).
 *
 * It is the MIDDLE levels that are erased, never the two ends: the
 * root says which document we are in, the last says where we come from, and ce
 * are the only two that we read without thinking. Folding at the end would make
 * disappear the direct parent, that is to say the only link we use
 * really.
 *
 * `trail` goes from the ROOT to the direct parent — the opposite d'`ancestorsOf`.
 */
export function foldPath<T>(
  trail: readonly T[],
  max: number = MAX_PATH_LEVELS
): { lead: T | null; hidden: T[]; tail: T[] } {
  if (trail.length === 0) return { lead: null, hidden: [], tail: [] };
  if (trail.length <= max) {
    return { lead: trail[0], hidden: [], tail: trail.slice(1) };
  }
  return {
    lead: trail[0],
    hidden: trail.slice(1, -1),
    tail: [trail[trail.length - 1]],
  };
}

/* ─── The guard ─────────────────────────────── ──────────────────────────────── */

/**
 * Would this move close a loop?
 *
 * True in two cases: the page becomes its own parent, or it becomes
 * child of one of its own descendants. The server responds 409 in this case —
 * the guard is there because the depth is unlimited: without a ceiling, the only defense against the infinite recursion of the sidebar is to refuse the write
 * which would make it possible.
 *
 * A `nextParentId` which does not designate any known page is NOT a cycle: the
 * validation of the existence of the parent is another check, elsewhere.
 */
export function wouldCreateCycle(
  pages: readonly { id: string; parent_id: string | null }[],
  pageId: string,
  nextParentId: string | null
): boolean {
  if (!nextParentId) return false;
  if (nextParentId === pageId) return true;

  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let current: string | null = nextParentId;
  while (current) {
    if (current === pageId) return true;
    if (seen.has(current)) return false; // preexisting cycle, without the page
    seen.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return false;
}

/* ─── Positions ───────────────────────────── ───────────────────────────── */

/**
 * Fractional index, alphabet of 62 digits whose ASCII order coincides with
 * the order of values: a key is compared like a string, in base and in JS,
 * without conversion. A key is the fractional part of a number — “V” is worth
 * ~0.5, “V5” a little more.
 *
 * The interest on an integer: inserting between two neighbors ONLY writes the line
 * moved. Reorder a sibling of thirty subpages by drag and drop
 * costs one update, not thirty.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * A valid position: at least one digit, and only digits of
 * the alphabet. This is what the server requires from a position coming from the client
 * (drag and drop) — a non-alphabet string would sort anywhere.
 */
export function isPosition(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  for (const char of value) {
    if (!DIGITS.includes(char)) return false;
  }
  return !value.endsWith("0");
}

/** A key never ends with the number zero: otherwise no key holds
 between it and the previous one. A value coming from elsewhere is caught up. */
function sanitize(key: string | null | undefined): string | null {
  if (!key) return null;
  for (const char of key) {
    if (!DIGITS.includes(char)) return null;
  }
  return key.endsWith("0") ? `${key}V` : key;
}

/** Middle of `a` and `b`, two fractions, with `a < b` (b null = 1). */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let common = 0;
    while ((a[common] ?? "0") === b[common]) common += 1;
    if (common > 0) {
      return b.slice(0, common) + midpoint(a.slice(common), b.slice(common));
    }
  }

  const digitA = a.length > 0 ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;

  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // Consecutive digits: we go down a notch.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/**
 * A position between two neighbors. `before`/`after` are the positions of the
 * pages which surround the target place, `null` for a sibling edge:
 * `positionBetween(null, null)` gives the very first page,
 * `positionBetween(last, null)` adds at the end of the siblings.
 *
 * An inconsistent pair (before ≥ after, corrupted values) does not raise: on
 * falls back on an edge. Refusing here would block a move for questionable
 * data, where the worst that could happen is an unexpected order.
 */
export function positionBetween(
  before: string | null | undefined,
  after: string | null | undefined
): string {
  let a = sanitize(before);
  let b = sanitize(after);
  if (a !== null && b !== null && a >= b) {
    // Inconsistent order: we only keep the lower limit.
    b = null;
  }
  if (a === null && b === null) return midpoint("", null);
  if (a === null) return midpoint("", b);
  return midpoint(a, b);
}

/** The position of a new page, at the end of the given sibling. */
export function positionAtEnd(
  siblings: readonly { position: string }[]
): string {
  let last: string | null = null;
  for (const sibling of siblings) {
    if (last === null || sibling.position > last) last = sibling.position;
  }
  return positionBetween(last, null);
}
