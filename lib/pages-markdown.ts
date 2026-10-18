/**
 * Markdown PROJECTION of a page — in both directions (MIN-269).
 *
 * The body of a page is stored in JSON ProseMirror, because that's what
 * what a block editor with stable IDs, handle and drag and drop requires.
 * But an agent does not read JSON ProseMirror: it reads markdown, and reads and
 * writing pages from Numo is the central argument of the feature. The JSON is
 * so the STORAGE, the markdown the projection — for the MCP (MIN-273), the agent
 * code and exports.
 *
 * The rule: **a round trip never loses CONTENT.** Only content
 * presentation, and only where it is written below.
 *
 * ## Losses assumed
 *
 * | Ce qui tombe | Pourquoi | Ce qui reste |
 * | --- | --- | --- |
 * | The color of a passage (text and background) | Markdown has no color. The mark is removed when writing rather than copied into `<span>`: a clear loss is better than a tag in the middle of what Numo reads (see blocks/color.ts) | The text, word for word |
 * | The FOLDED state of a leaflet (`open`) | `<details>` carries the attribute, but it is a reading state, specific to the viewer, not content | The summary and the folded body |
 * | The pill of a mention | A mention IS of the text (`@Nom`, `@MIN-42`) — the node is only a habit, restated upon rereading by lib/mention-scan | `@Nom`, literally |
 * | The block ID (`blockId`) | It only makes sense within a document; a markdown from Numo does not carry any | A NEW ID, added during rereading (`stampBlockIds`) |
 * | The title of a subpage | It is never copied into the parent body, by construction: it is resolved on display (see blocks/subpage.ts) | `[[page:<id>]]`, therefore the target |
 * | The WIDTH of an image | `![…](…)` has no attribute. The width is a display setting - how many columns the image occupies -, never the content (see blocks/image.ts) | The image, at its default width |
 * | The WEIGHT and type of a file | A markdown link only carries its text and address. These are two comfort indications, rereadable from `page_files`: the name and the file itself are there | `[nom](url)`, so the file |
 *
 * These losses apply to a WHOLE replacement. A targeted agent edit (append,
 * passage rewrite) keeps every block whose Markdown it did not change exactly as
 * stored, colors, widths, pills and IDs included (`reconcileBodyBlocks`, MIN-688):
 * only the blocks it actually rewrote go through the table above.
 *
 * The LEGEND of an image does NOT fall, and it is a choice: it is the
 * alternative text (`![caption](…)`), a single field for both. A good
 * caption is a good alt text — keeping two in the node would have liked
 * say losing one each time there and back.
 *
 * Everything else — titles, lists, tasks and their four states, nesting,
 * quote, callout (including its icon and color), code, separator, leaflet,
 * subpage, bold/italic/code/link —
 * returns identical, and lib/pages-markdown.test.ts plays it block by block, in
 * BROADCASTING the register: a block added without its projection causes the sequence to fall.
 *
 * ## Ce que ce module suppose
 *
 * A global DOM (`window.DOMParser`): tiptap-markdown reads the markdown in
 * passing through HTML. In a browser and under jsdom, it is there. Elsewhere -
 * a server function, the MCP tool of MIN-273 — it is up to the caller to
 * install it before the first call. It is a known and written constraint,
 * not a surprise.
 */

import { Editor, type JSONContent } from "@tiptap/core";
import {
  pageExtensions,
  type PageExtensionsOptions,
} from "@/components/pages/page-extensions";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
} from "@/components/pages/blocks";
import { normalizeNotionCalloutPaste } from "@/components/pages/blocks/callout";

// The live collaboration operations travel in this same bundle (MIN-688): the
// server applies steps with the schema this module already builds, without a
// second ProseMirror copy and outside the Next server build.
export {
  applyCollabSteps,
  canonicalBodyJSON,
  diffCollabSteps,
  isCanonicalBodyJSON,
  rebaseCollabSteps,
  sameCollabValue,
} from "@/lib/page-collaboration-document";

/**
 * Which editor a document comes from (MIN-728). The projection must mount the
 * same schema and serializers as the editor that wrote the document:
 * - `page`: the whole catalog;
 * - `document`: descriptions and comments, without the page-tree blocks;
 * - `notebook`: the document set with the notebook's paragraph, which keeps
 *   deliberate empty lines as spacer lines.
 * A name rather than extensions, so a server reaching this module through the
 * bundle can choose it.
 */
export type DocumentProfile = "page" | "document" | "notebook";

function profileExtensions(profile: DocumentProfile): PageExtensionsOptions {
  if (profile === "page") return {};
  if (profile === "document") return { blocks: "document" };
  return { blocks: "document", extensions: { paragraph: ScratchpadParagraph } };
}

/** A page as the projection sees it: its header, and its body. */
export interface PageProjection {
  title: string;
  /** Emoji, or `null` when the page takes the default icon. */
  icon: string | null;
  /** The ProseMirror document. `null` for an empty page. */
  content: JSONContent | null;
}

/**
 * The emoji at the top of the title. `Extended_Pictographic` covers the emojis of a single
 * code point, the sequence `‍` the compounds (“👩‍💻”), and `️` the
 * presentation selector; flags (two regional indicators) and
 * keys (“1️⃣”) have their own branch. A title that STARTS with an emoji
 * without being one — “🎉 the exit” — would lose its own on rereading: it is the
 * price of a header that fits on one line, and the icon is anyway
 * chosen in a selector, never typed in the title.
 */
const ICON_PREFIX =
  /^(?:\p{RI}\p{RI}|[0-9#*]️?⃣|\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s+/u;

/** The header: `# 📘 Titre`. The title and icon are not in the body (this
    are two columns), but Numo should receive the page in ONE piece. */
const HEAD = /^#[ \t]+(.*)$/;

/* ── The WRITING direction: JSON → markdown ───────────────────────────────── */

/**
 * The page in markdown, including the header.
 *
 * The body is serialized by the register: this file does not know any blocks
 * by name, and will never know any. Each descriptor carries its
 * `toMarkdown` (or relies on that of its node), the register grafts it, and
 * adding a table block will not touch a row from here.
 */
export function pageToMarkdown(page: PageProjection): string {
  const head = headLine(page);
  const body = bodyToMarkdown(page.content);
  if (!head) return body;
  return body ? `${head}\n\n${body}` : head;
}

function headLine({ title, icon }: PageProjection): string {
  const trimmed = title.trim();
  if (!trimmed && !icon) return "";
  return `# ${icon ? `${icon} ` : ""}${trimmed}`.trimEnd();
}

/** The body alone - what a surface sees which already has the title elsewhere. */
export function bodyToMarkdown(
  content: JSONContent | null | undefined,
  profile: DocumentProfile = "page"
): string {
  if (!content) return "";
  const editor = pageEditor(content, profile);
  try {
    return markdownOf(editor).trim();
  } finally {
    editor.destroy();
  }
}

/* ── Keeping what an agent did not touch (MIN-688) ───────────────────────── */

/**
 * The new body an agent produced from Markdown, with every top-level block
 * whose Markdown did NOT change taken back from the previous body.
 *
 * Reparsing Markdown regenerates block IDs and drops what Markdown cannot say
 * (a color, an image width, a mention pill, a folded state — the losses table
 * above). Applied as a whole, a one-word edit by Numo would therefore rewrite
 * every block: comments and links anchored on block IDs would lose their
 * target, and a collaborator typing anywhere in the page would see their
 * pending text rebased across a full replacement. Aligning the two block
 * sequences by their Markdown (a longest common subsequence) keeps the
 * untouched blocks exactly as they were, so the live replacement covers only
 * the blocks the agent actually changed. A changed block is the reparsed one,
 * with the losses of a whole replacement.
 */
export function reconcileBodyBlocks(
  previous: JSONContent | null | undefined,
  next: JSONContent,
  profile: DocumentProfile = "page"
): JSONContent {
  const before = previous?.content ?? [];
  const after = next.content ?? [];
  if (before.length === 0 || after.length === 0) return next;
  const editor = pageEditor(previous ?? { type: "doc", content: [] }, profile);
  try {
    const { schema } = editor;
    // `null` when a block cannot be serialized: it then matches nothing.
    const serialize = (block: JSONContent): string | null => {
      try {
        const doc = schema.topNodeType.create(null, [schema.nodeFromJSON(block)]);
        return (editor.storage as unknown as {
          markdown: { serializer: { serialize(node: unknown): string } };
        }).markdown.serializer.serialize(doc).trim();
      } catch {
        return null;
      }
    };
    const same = (x: string | null, y: string | null) => x !== null && x === y;
    const a = before.map(serialize);
    const b = after.map(serialize);
    // Longest common subsequence of the two Markdown block lists.
    const table: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const content: JSONContent[] = [];
    // A rewritten block keeps its identity: within each run of changed blocks,
    // the n-th new block of a type takes the ID of the n-th old block of the
    // same type. Comments and links anchored on it survive, and the live diff
    // edits it in place instead of replacing it.
    let removed: JSONContent[] = [];
    let added: JSONContent[] = [];
    const flush = () => {
      const pool = new Map<string, JSONContent[]>();
      for (const block of removed) {
        const list = pool.get(block.type ?? "") ?? [];
        list.push(block);
        pool.set(block.type ?? "", list);
      }
      for (const block of added) {
        const match = pool.get(block.type ?? "")?.shift();
        const id = match?.attrs?.[BLOCK_ID_ATTRIBUTE];
        content.push(id ? { ...block, attrs: { ...block.attrs, [BLOCK_ID_ATTRIBUTE]: id } } : block);
      }
      removed = [];
      added = [];
    };
    let i = 0;
    let j = 0;
    while (j < b.length || i < a.length) {
      if (i < a.length && j < b.length && same(a[i], b[j])) {
        flush();
        content.push(before[i]);
        i += 1;
        j += 1;
      } else if (i < a.length && (j >= b.length || table[i + 1][j] >= table[i][j + 1])) {
        removed.push(before[i]);
        i += 1;
      } else {
        added.push(after[j]);
        j += 1;
      }
    }
    flush();
    return { ...next, content };
  } finally {
    editor.destroy();
  }
}

/* ── READING direction: markdown → JSON ────────────────────────────────── */

/**
 * The markdown of a page, reread on page.
 *
 * The header is CONSUMED: a level 1 heading at the head of the document becomes the
 * page title, its head emoji its icon. This is what allows Numo
 * to write an entire page in one go — and this is also why a body
 * which begins with a `# ` sees its first line go up in the title. THE
 * levels 2 and 3 remain of the body.
 */
export function markdownToPage(markdown: string): PageProjection {
  const { title, icon, body } = splitHead(markdown);
  return { title, icon, content: bodyFromMarkdown(body) };
}

/** The body alone — the counterpart of `bodyToMarkdown`. */
export function bodyFromMarkdown(
  markdown: string,
  profile: DocumentProfile = "page"
): JSONContent {
  const editor = pageEditor(normalizeNotionCalloutPaste(markdown) ?? markdown, profile);
  try {
    return stampBlockIds(editor.getJSON());
  } finally {
    editor.destroy();
  }
}

/**
 * Give its stable ID to each block that does not have one.
 *
 * `UniqueID` is correctly mounted (it is he who puts the attribute in the schema, therefore which
 * prevents an existing `blockId` from being thrown away when rereading a JSON), but it
 * only PUT it down on the tick following the creation of the editor: tiptap emits `create`
 * in a `setTimeout`. A projection is synchronous and throws its editor
 * immediately — without this passage, a page written in markdown by Numo would arrive in
 * base with blocks without identity, and backup by block (MIN-271) like
 * the link anchors would have nothing to hold on to.
 *
 * The types come from the register (`BLOCK_ID_TYPES`): a new block is identified
 * automatically, here as in the editor.
 */
function stampBlockIds(json: JSONContent): JSONContent {
  const types = new Set(BLOCK_ID_TYPES);
  const walk = (node: JSONContent) => {
    if (node.type && types.has(node.type)) {
      const attrs = node.attrs ?? {};
      if (attrs[BLOCK_ID_ATTRIBUTE] == null) {
        node.attrs = { ...attrs, [BLOCK_ID_ATTRIBUTE]: newBlockId() };
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return json;
}

function newBlockId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  // old jsdom, insecure context: a backup id, unique in fact. A
  // Block ID ONLY has scope in its document.
  return `b-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function splitHead(markdown: string): {
  title: string;
  icon: string | null;
  body: string;
} {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first += 1;

  const head = first < lines.length ? HEAD.exec(lines[first]) : null;
  if (!head) return { title: "", icon: null, body: markdown.trim() };

  // A `# titre` immediately followed by a `===` would be a setext title, not this
  // header — but markdown-it reads the `#` first, so nothing to untangle here.
  const rest = head[1].trim();
  const emoji = ICON_PREFIX.exec(rest);
  return {
    title: (emoji ? rest.slice(emoji[0].length) : rest).trim(),
    icon: emoji ? emoji[0].trim() : null,
    body: lines.slice(first + 1).join("\n").trim(),
  };
}

/* ── The assembly ──────────────────────────── ───────────────────────────── */

/**
 * An editor mounted on the page schema, without a line of React or view
 * of knot. This is the SAME schema as the editor (components/pages/page-extensions.ts):
 * a block that one knows how to produce, the other knows how to read it.
 *
 * The editor is disposable — one per call, destroyed in the process. keep it
 * open between two conversions would bring the projection to a state
 * (history, selection, plugins) which it has no use for, and would return two
 * concurrent calls dependent on each other.
 */
function pageEditor(content: JSONContent | string, profile: DocumentProfile = "page"): Editor {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: pageExtensions({ headless: true, ...profileExtensions(profile) }),
  });
}

/* ── Documents outside pages (MIN-728) ──────────────────────────────────── */

/**
 * What an editor should open, from the parent's Markdown and the stored
 * document.
 *
 * The Markdown is the authority: every external reader uses it, and an agent,
 * the forge or an import may have rewritten it without touching the
 * document. The document is used as stored only while its projection still
 * says exactly that Markdown. Otherwise its untouched blocks are kept — IDs,
 * colors, pills — and the changed ones come from the Markdown, the way pages
 * absorb an agent's edit (`reconcileBodyBlocks`). Without a usable document,
 * the Markdown itself is what opens.
 */
export function documentForEditor(
  markdown: string,
  stored: JSONContent | null | undefined,
  profile: Exclude<DocumentProfile, "page"> = "document"
): JSONContent | string {
  if (!stored || stored.type !== "doc") return markdown;
  try {
    if (bodyToMarkdown(stored, profile).trim() === markdown.trim()) return stored;
    return reconcileBodyBlocks(stored, bodyFromMarkdown(markdown, profile), profile);
  } catch {
    // A document this schema cannot read (written by a later version, or
    // damaged) is no reason not to open the text.
    return markdown;
  }
}

function markdownOf(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}
