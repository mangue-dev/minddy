/**
 * The SCHEME of a page body, written in plaintext (MIN-350).
 *
 * Until now `page.content` entered as arbitrary JSON, bounded in depth
 * and in size and nothing else: any type of node, any whatever
 * attribute, and especially any `src` — a `javascript:` stored in a
 * file block appeared as is in the `href` of its anchor
 * (components/pages/blocks/file-view.tsx), which is a real anchor and that a click
 * really follows.
 *
 * This module is the door. It lists the nodes, the marks and their attributes, and
 * it decides on the addresses.
 *
 * ## Why a list written by hand, when the register exists
 *
 * The block register IS the truth, and this list must remain equal to it —
 * but we can't ask him here. Reading it means mounting the extensions
 * tiptap, therefore an editor, therefore a DOM: `lib/server/pages.ts` valid in a
 * server function, on the critical path of each backup, where the
 * markdown projection must have been loaded by path from a
 * bundle to part (see lib/server/pages-projection.ts). The price would be one jsdom
 * per write to reread a list of twenty names.
 *
 * Equality is not left to rereading: `page-content-schema.test.ts`
 * mounts the REAL register under jsdom and requires that this file says exactly the
 * same nodes, the same marks and the same attributes. A block added without its
 * entry here drops the continuation — not a user's save.
 *
 * ## What we refuse, and what we drop
 *
 * An UNKNOWN node or mark causes the entire write to be refused (400): it is
 * content that no surface can render, and accepting it as a base would mean
 * reserving it one day for a rendering which will understand it. A hostile address
 *, the same - a refusal is what the author must see.
 *
 * An unknown ATTRIBUTE is simply removed: this is already what
 * ProseMirror when loading the document (`Node.fromJSON` ignores what the schema
 * does not declare), and refusing an entire page for one more attribute would make
 * each deployment of the editor capable of blocking tabs left open.
 *
 * Pure module, without `server-only` or dependencies: blocks import it also
 * (their markdown serialization refuses to write a link to an address that this
 * file rejects), and they are mounted headless in a server function.
 */

/* ── Addresses ───────────────────────────── ────────────────────────────── */

/**
 * Attributes that carry an ADDRESS, regardless of node or brand.
 *
 * By NAME and not by node, intentionally: the day a video block arrives with
 * its `src`, it is covered before being written. The counterpart — an attribute
 * named `src` which would not be a URL — does not exist in the schema, and the
 * test holds it.
 */
const URL_ATTRIBUTES = new Set(["src", "href"]);

/**
 * The protocols that a page address is allowed to carry.
 *
 * `http`/`https` because an external image is a normal and documented case (cf.
 * blocks/image.ts: `![graphe](https://…)` written by Numo should work), and
 * `mailto` because a contact link in a page is one.
 *
 * Everything else falls, `javascript:` at the top, but also `data:` (an HTML page
 * at base64 in a `href` is a full one-click XSS) and `blob:`.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * `true` if this address can be stored in a page body.
 *
 * RELATIVE addresses (`/api/projects/…`, the form that our own
 * files take) are accepted as is: they have no protocol, therefore
 * no protocol to refuse, and they can only designate us.
 *
 * The normalization counts as much as the list: `java\tscript:alert(1)` is a
 * URL that the browser follows and that a naive comparison lets through. On
 * therefore removes blanks and control characters BEFORE reading the
 * protocol — and since it is this same cleaned string that we send back to
 * the caller ({@link normalizePageUrl}), what is put away is what was judged.
 */
export function isSafePageUrl(value: unknown): boolean {
  return normalizePageUrl(value) !== null;
}

/**
 * The address as we agree to store it, or `null` if it is refused.
 *
 * `new URL` with a base is only used to READ the protocol: the returned value
 * remains the original cleaned string, never the URL absolute — a `/api/…`
 * must remain relative in the document (see lib/page-files.ts).
 */
export function normalizePageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Blanks and control characters: `java\tscript:` and `java\nscript:` are
  // tracked by browsers, and looks like nothing for a test of
  // prefix. They also have no meaning in an address.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0020\u007f]/g, "");
  if (!cleaned) return null;
 // No protocol: a relative address. `//host/path` carries one
  // implicitly (that of the page) — it is therefore http(s), therefore acceptable.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) return cleaned;
  try {
    return SAFE_PROTOCOLS.has(new URL(cleaned).protocol) ? cleaned : null;
  } catch {
    return null;
  }
}

/* ── Nodes and marks ─────────────────────── ──────────────────────── */

/**
 * Each node in a page's schema, with its attributes. Exact mirror of the registry
 * (components/pages/blocks) plus the StarterKit substrate, the mention and
 * the `blockId` of UniqueID — verified node by node by the test.
 */
export const PAGE_NODE_ATTRIBUTES: Record<string, readonly string[]> = {
  doc: [],
  paragraph: ["blockId"],
  text: [],
  hardBreak: [],
  heading: ["blockId", "level"],
  bulletList: ["blockId", "tight"],
  orderedList: ["blockId", "tight", "start", "type"],
  listItem: [],
  taskList: ["blockId", "tight"],
  taskItem: ["checked", "state"],
  blockquote: ["blockId"],
  callout: ["blockId", "icon", "color"],
  codeBlock: ["blockId", "language"],
  horizontalRule: ["blockId"],
  details: ["blockId", "open"],
  detailsSummary: [],
  detailsContent: [],
  subpage: ["blockId", "pageId"],
  image: ["blockId", "src", "alt", "width", "uploadId"],
  pageFile: ["blockId", "src", "name", "size", "mime", "uploadId"],
  mention: [
    "mentionType",
    "mentionId",
    "mentionLabel",
    "seed",
    "color",
    "icon",
  ],
};

/** Brands, same contract as nodes. */
export const PAGE_MARK_ATTRIBUTES: Record<string, readonly string[]> = {
  link: ["href", "target", "rel", "class", "title"],
  bold: [],
  italic: [],
  strike: [],
  underline: [],
  code: [],
  pageTextColor: ["color"],
  pageBackgroundColor: ["color"],
};

/* ── Validation ───────────────────────────── ───────────────────────────── */

/** Why is a body refused. `unknown-node` also covers brands: from the author's point of view, it's the same "this block doesn't exist here". */
export type PageContentRefusal = "unknown-node" | "unsafe-url";

export type PageContentCheck =
  | { ok: true; content: unknown }
  | { ok: false; reason: PageContentRefusal };

/**
 * The body as we agree to write it.
 *
 * Returns a COPY when something has been removed, never the input object
 * modified in place: the caller keeps what it received, and the comparison
 * "has the body changed?" » of the history remains true.
 *
 * The descent is recursive, and it can be: the depth is bounded
 * before (lib/json-depth.ts, MIN-348), this is precisely the order that this
 * guardrail imposes.
 */
export function checkPageContent(value: unknown): PageContentCheck {
  try {
    return { ok: true, content: walk(value, true) };
  } catch (err) {
    if (err instanceof PageContentError) return { ok: false, reason: err.reason };
    throw err;
  }
}

class PageContentError extends Error {
  constructor(readonly reason: PageContentRefusal) {
    super(reason);
  }
}

function walk(value: unknown, isRoot: boolean): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const node = value as Record<string, unknown>;

  const type = node.type;
  if (type !== undefined) {
    if (typeof type !== "string" || !(type in PAGE_NODE_ATTRIBUTES)) {
      throw new PageContentError("unknown-node");
    }
    // The root is a DOCUMENT, and nothing else: accept a bare `paragraph`
    // would make a body that the editor refuses to load — a document that cannot be
    // can no longer open is worth less than a write refused.
    if (isRoot && type !== "doc") throw new PageContentError("unknown-node");
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === "attrs") {
      out.attrs = readAttrs(child, typeof type === "string" ? type : null);
    } else if (key === "marks") {
      out.marks = readMarks(child);
    } else if (key === "content" && Array.isArray(child)) {
      out.content = child.map((item) => walk(item, false));
    } else {
      out[key] = child;
    }
  }
  return out;
}

function readAttrs(value: unknown, type: string | null): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const allowed = type ? PAGE_NODE_ATTRIBUTES[type] : null;
  return filterAttrs(value as Record<string, unknown>, allowed);
}

function readMarks(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((mark) => {
    if (!mark || typeof mark !== "object" || Array.isArray(mark)) return mark;
    const record = mark as Record<string, unknown>;
    const type = record.type;
    if (typeof type !== "string" || !(type in PAGE_MARK_ATTRIBUTES)) {
      throw new PageContentError("unknown-node");
    }
    const attrs = record.attrs;
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return record;
    return {
      ...record,
      attrs: filterAttrs(
        attrs as Record<string, unknown>,
        PAGE_MARK_ATTRIBUTES[type]
      ),
    };
  });
}

function filterAttrs(
  attrs: Record<string, unknown>,
  allowed: readonly string[] | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (allowed && !allowed.includes(key)) continue;
    if (URL_ATTRIBUTES.has(key) && value !== null && value !== undefined) {
      const url = normalizePageUrl(value);
      if (url === null) throw new PageContentError("unsafe-url");
      out[key] = url;
      continue;
    }
    out[key] = value;
  }
  return out;
}
