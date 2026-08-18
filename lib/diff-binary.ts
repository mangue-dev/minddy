/**
 * What a file WITHOUT a patch really is (MIN-66).
 *
 * Both GitHub and GitLab omit the patch in two very different cases: the
 * file is binary (there is no textual diff to do), or it is too
 * large (there might be one, the forge refuses to send it). The diff view
 * said of a single message — “binary or too large” —, which does not provide information on either one nor the other.
 *
 * We decide on the extension, the only clue we have: the list of files does not have __
 * carries neither MIME type nor flag binary.
 */

/** Extensions rendered side by side, with their MIME type served by the proxy. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // SVG is text: the forge therefore sends the patch, and we only pass here
  // if it's too big for that. Served in `image/svg+xml`, it is returned by the
  // browser IN a <img> tag — therefore without script or external request
  // possible, unlike an inline insertion in the document.
  svg: "image/svg+xml",
};

/**
 * Known binary extensions that we don't know how to SHOW — the display stops
 * upon finding, but it just says it. Outside of this list and outside of the images, an unpatched file is considered "too large": this is the most frequent case (lockfiles, large JSON, data), and the only one where "see on GitHub"
 * really learns something.
 */
const BINARY_EXTENSIONS = new Set([
  "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "wav", "ogg", "flac", "m4a",
  "mp4", "webm", "mov", "avi", "mkv",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar", "wasm",
  "psd", "ai", "sketch", "fig", "xcf",
  "db", "sqlite", "sqlite3", "pyc", "node",
]);

export type NoPatchKind = "image" | "binary" | "unchanged" | "tooLarge";

function extensionOf(filename: string): string {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  return base.includes(".") ? (base.split(".").pop() ?? "") : "";
}

/**
 * What we display instead of the diff, for a file that the forge has not
 * patched.
 *
 * The order matters. The extension first: a binary is announced 0 addition / 0
 * removal by the two forges, it would otherwise fall into the “no change
 * content” case below. Then only the line count — 0/0 on a
 * text file means that there is NOTHING to differ (pure renaming, change
 * of mode), not that the forge gave up for lack of space. This is the case of a
 * renaming with 100% similarity, which promised to be "too bulky".
 */
export function noPatchKind(file: {
  filename: string;
  additions: number;
  deletions: number;
}): NoPatchKind {
  const ext = extensionOf(file.filename);
  if (ext in IMAGE_TYPES) return "image";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return file.additions === 0 && file.deletions === 0 ? "unchanged" : "tooLarge";
}

/**
 * MIME type served by the byte proxy. Deduced from the extension, NEVER taken from
 * the forge: the content comes from a third-party repository, and returning it under the type
 * that it assigns to itself would be like letting a repository choose what the browser
 * executes on our origin. An unlisted extension is not served at all.
 */
export function imageMimeType(filename: string): string | null {
  return IMAGE_TYPES[extensionOf(filename)] ?? null;
}
