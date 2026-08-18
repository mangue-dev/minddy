/**
 * EXPORT of a page in markdown — pure logic (MIN-283).
 *
 * No IO here: this module receives the tree (id, parent, title) and the already projected markdown
 * of each page (lib/pages-markdown.ts, MIN-269), and it actually
 * a FILE TREE. This is all that distinguishes an export from a simple projection, and this is precisely the part that is tested without a base:
 *
 * - one FILE NAME per page, taken from its title, safe on the three file systems, and unique between brothers;
 * - one page which has children becomes a FILE (`Title/index.md`): this is
 * the only form which keeps the nesting of the wiki in an archive, and that
 * that all exports of this kind have converged to produce;
 * - the subpage blocks, written `[[page:<id>]]` by projection, become
 * RELATIVE LINKS between the files in the archive. A bare identifier in
 * a file that is opened outside of minddy leads nowhere — and that is
 * precisely the use we are aiming for: taking the doc.
 *
 * A target OUTSIDE the archive (a subpage that is not exported) keeps its
 * `[[page:<id>]]`. Inventing a link that does not resolve would be worse than leaving
 * the mark of the original document, which itself says what it is.
 */

/** A page as the export sees it: its place in the tree, and its body. */
export interface ExportInputPage {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  /** The markdown of the page, including the header (see `pageToMarkdown`). */
  markdown: string;
}

/** A file in the archive. */
export interface ExportedFile {
  /** Path relative to the root of the archive, separators `/`. */
  path: string;
  markdown: string;
}

/** Max length of a name segment: File systems cap at
 255 bytes, and a page title can be 500 characters. */
const MAX_SLUG_LENGTH = 80;

/**
 * The file name of a page, taken from its title.
 *
 * We keep the accented letters and spaces — it's a file that
 * someone will open, not a storage key (see `sanitizeFileKey`, which
 * responds to the other question). Only the characters that a file system refuses, and the leading dots, which would make a file hidden.
 */
export function pageFileSlug(title: string): string {
  const cleaned = title
    // Control characters: invisible in a title, refused in a name.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // Forbidden on Windows, plus `/` and `\` which would open a folder.
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    // Windows also refuses a name ending in a period or space.
    .replace(/[. ]+$/, "");
  return cleaned.slice(0, MAX_SLUG_LENGTH).trim() || "page";
}

/** `Title`, `Title (2)`, `Title (3)`… — sibling pages may share a name, but two
    files in the same folder may not. */
function uniqueIn(taken: Set<string>, slug: string): string {
  const key = slug.toLowerCase();
  if (!taken.has(key)) {
    taken.add(key);
    return slug;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${slug} (${n})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

const SUBPAGE_LINK = /\[\[page:([^\]\s]+)\]\]/g;

/**
 * The archive of a branch: one file per page, with links rewritten.
 *
 * `pages` contains the root AND its descendants, in any order. A page whose
 * parent is not in the list is treated as a root — this does not happen on a
 * branch, but prevents an inconsistent input set from silently making files
 * disappear.
 */
export function exportPagesToFiles(pages: ExportInputPage[]): ExportedFile[] {
  const ids = new Set(pages.map((p) => p.id));
  const childrenOf = new Map<string, ExportInputPage[]>();
  const roots: ExportInputPage[] = [];
  for (const page of pages) {
    if (page.parent_id && ids.has(page.parent_id)) {
      const list = childrenOf.get(page.parent_id);
      if (list) list.push(page);
      else childrenOf.set(page.parent_id, [page]);
    } else {
      roots.push(page);
    }
  }

  // Determine every page path first — links cannot be rewritten until all paths
  // are known.
  const pathOf = new Map<string, string>();
  /** `reserved`: names already taken IN this folder before naming any sibling.
      There is only one, `index` — the folder carries the parent's name, and its
      body is stored there as `index.md`. A subpage titled “Index” would produce
      the same path, causing the archive to silently keep only one of the files. */
  const assign = (siblings: ExportInputPage[], prefix: string, reserved: string[] = []) => {
    const taken = new Set<string>(reserved);
    for (const page of siblings) {
      const slug = uniqueIn(taken, pageFileSlug(page.title));
      const children = childrenOf.get(page.id) ?? [];
      // A page with children becomes a folder; its own body is stored there as
      // `index.md`, alongside them.
      const path = children.length > 0 ? `${prefix}${slug}/index.md` : `${prefix}${slug}.md`;
      pathOf.set(page.id, path);
      if (children.length > 0) assign(children, `${prefix}${slug}/`, ["index"]);
    }
  };
  assign(roots, "");

  const files: ExportedFile[] = [];
  const walk = (list: ExportInputPage[]) => {
    for (const page of list) {
      const path = pathOf.get(page.id)!;
      files.push({
        path,
        markdown: rewriteSubpageLinks(page.markdown, path, pathOf, pages),
      });
      walk(childrenOf.get(page.id) ?? []);
    }
  };
  walk(roots);
  return files;
}

/** The `[[page:<id>]]` markers in a body, changed into relative Markdown links. */
function rewriteSubpageLinks(
  markdown: string,
  fromPath: string,
  pathOf: Map<string, string>,
  pages: ExportInputPage[]
): string {
  const titleOf = new Map(pages.map((p) => [p.id, p]));
  return markdown.replace(SUBPAGE_LINK, (whole, id: string) => {
    const target = pathOf.get(id);
    if (!target) return whole;
    const page = titleOf.get(id);
    const label = page ? `${page.icon ? `${page.icon} ` : ""}${page.title || id}` : id;
    return `[${label}](${relativePath(fromPath, target)})`;
  });
}

/** The path to `to` as seen from the file `from` (`../other/page.md`). */
export function relativePath(from: string, to: string): string {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const path = [...Array(up).fill(".."), ...toParts.slice(common)].join("/");
  // A relative link that descends starts with `./`: without it, a name
  // containing `:` could be read as a protocol.
  return up === 0 ? `./${path}` : path;
}

/** The downloaded file name: `My page.md`, `My page.zip`. */
export function exportFileName(title: string, extension: "md" | "zip"): string {
  return `${pageFileSlug(title)}.${extension}`;
}
