import type { PullRequestFile } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The tree of files AFFECTED by a PR (MIN-182) — not the repository, just what
 * the diff contains. Built from `files` paths alone: none
 * network call, no repository knowledge.
 *
 * Two rules do all the work:
 *
 * - **single-child folders fold onto one line** — on a PR which
 * only touches one screen, `app/(app)/lab/diff` is better than four levels
 * of indentation, three of which say nothing;
 * - **the counters go up** — a folder carries the sum of what it
 * contains, which gives the map of weights without having to do everything unfold.
 *
 * Pure and without React, like `pr-review-threads` or `pr-diff-hunk`: the
 * structure is tested without mounting anything.
 */

/**
 * Normalized status of a file. GitHub knows more than the four that we
 * paint (`copied`, `changed`, `unchanged`): everything that is not an addition, a
 * removal or a renaming is called "modified". `previous_filename` serves as
 * second witness of the renaming — GitLab sets it too.
 */
export type FileStatus = "added" | "removed" | "renamed" | "modified";

export function fileStatusOf(file: PullRequestFile): FileStatus {
  if (file.status === "added" || file.status === "removed") return file.status;
  if (file.status === "renamed" || file.previous_filename) return "renamed";
  return "modified";
}

/**
 * The status word, only once for the two surfaces that say it: the
 * file card badge and the tree line icon. Typed
 * `MessageKey` and not `string` — a faulty key must refuse to compile, not
 * displayed in plain text (see [lib/i18n-keys.ts](lib/i18n-keys.ts)).
 */
export const FILE_STATUS_LABELS = {
  added: "fileAdded",
  removed: "fileRemoved",
  renamed: "fileRenamed",
  modified: "fileModified",
} as const satisfies Record<FileStatus, MessageKey<"PullRequests">>;

/**
 * The DOM anchor of a file's map. The path as is: `getElementById`
 * doesn't escape anything, so a space or a parenthesis in a file name doesn't pose a problem. Stable from one rendition to the next — that's what makes it a
 * link target.
 */
export function fileAnchorId(filename: string): string {
  return `pr-file-${filename}`;
}

interface FileTreeCommon {
  /** What the line displays: one segment, or several if the folder is folded. */
  label: string;
  /** Full path from root — render key, and for a file, anchor it. */
  path: string;
  /** Accumulated for a folder, those of the file for a sheet. */
  additions: number;
  deletions: number;
}

export interface FileTreeFile extends FileTreeCommon {
  kind: "file";
  status: FileStatus;
  /** The file as the forge served it — the renaming, the patch, everything is there. */
  file: PullRequestFile;
}

export interface FileTreeDir extends FileTreeCommon {
  kind: "dir";
  children: FileTreeNode[];
}

export type FileTreeNode = FileTreeFile | FileTreeDir;

/** Folder under construction: a map of subfolders and its files. */
interface DirDraft {
  name: string;
  dirs: Map<string, DirDraft>;
  files: PullRequestFile[];
}

/**
 * Alphabetical, case insensitive like file explorers, and
 * numeric so that `10` follows `9`. FIXED local: the order of the files of a
 * PR does not have to change depending on the language of who is looking at it.
 */
const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/**
 * What a leaf announces. A rename that changes the NAME says so on the line
 * (`ancien → nouveau`); a simple move, no — the tree already shows it by
 * placing the file under its new folder, and repeating the original path
 * would double the line to learn nothing. The full path from before remains
 * on `file.previous_filename`, for the tooltip.
 */
function leafLabel(file: PullRequestFile): string {
  const name = basename(file.filename);
  if (!file.previous_filename) return name;
  const from = basename(file.previous_filename);
  return from === name ? name : `${from} → ${name}`;
}

function leafNode(file: PullRequestFile): FileTreeFile {
  return {
    kind: "file",
    label: leafLabel(file),
    path: file.filename,
    additions: file.additions,
    deletions: file.deletions,
    status: fileStatusOf(file),
    file,
  };
}

function totals(children: FileTreeNode[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const child of children) {
    additions += child.additions;
    deletions += child.deletions;
  }
  return { additions, deletions };
}

/** Folders first, then files, each group sorted by name. */
function childrenOf(draft: DirDraft, path: string): FileTreeNode[] {
  const dirs = [...draft.dirs.values()]
    .sort((a, b) => COLLATOR.compare(a.name, b.name))
    .map((child) => dirNode(child, path));
  const files = [...draft.files]
    .sort((a, b) => COLLATOR.compare(basename(a.filename), basename(b.filename)))
    .map(leafNode);
  return [...dirs, ...files];
}

function dirNode(draft: DirDraft, parentPath: string): FileTreeDir {
  const path = parentPath ? `${parentPath}/${draft.name}` : draft.name;
  const children = childrenOf(draft, path);
  // A folder whose only child is a FOLDER only adds one notch
  // indentation: the two lines become one. The son is already folded
  // (the traversal is postfix), so an entire string is collected at once.
  // A single child FILE does not fold: the file remains what
  // unfolds, and its file opens.
  const inner = children.length === 1 && children[0].kind === "dir" ? children[0] : null;
  const effective = inner ? inner.children : children;
  return {
    kind: "dir",
    label: inner ? `${draft.name}/${inner.label}` : draft.name,
    path: inner ? inner.path : path,
    children: effective,
    ...totals(effective),
  };
}

/**
 * The tree, ready to render. Files arrive in order from the forge; the
 * sort is ours, and it only depends on the paths.
 */
export function buildFileTree(files: PullRequestFile[]): FileTreeNode[] {
  const root: DirDraft = { name: "", dirs: new Map(), files: [] };
  for (const file of files) {
    // `filter(Boolean)` : un chemin qui commencerait par `/` ou porterait un
    // double separator would otherwise create an unnamed folder.
    const segments = file.filename.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      let next = dir.dirs.get(segment);
      if (!next) {
        next = { name: segment, dirs: new Map(), files: [] };
        dir.dirs.set(segment, next);
      }
      dir = next;
    }
    dir.files.push(file);
  }
  return childrenOf(root, "");
}
