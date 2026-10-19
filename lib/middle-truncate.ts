// A file name that fits a fixed number of lines while always keeping its
// extension (MIN-742): `Screenshot 20…41.webp`, the way Finder labels a card.
//
// Pure: the caller gives the width of each character, so the browser measures
// with a canvas and tests measure with a table.

/** `report.final.pdf` → [`report.final`, `.pdf`]; no extension → [name, ""]. */
export function splitExtension(name: string): [string, string] {
  const match = /\.[^.\s]{1,8}$/.exec(name);
  if (!match || match.index === 0) return [name, ""];
  return [name.slice(0, match.index), match[0]];
}

/** Characters of the stem kept before the extension, as Finder does. */
const TAIL = 2;
const ELLIPSIS = "…";

/**
 * Whether `text` fits in `lines` lines of `width` pixels when it may break
 * between any two characters (`word-break: break-all`).
 */
function fits(text: string, width: number, lines: number, charWidth: (char: string) => number): boolean {
  let line = 1;
  let used = 0;
  for (const char of text) {
    const w = charWidth(char);
    if (used + w > width) {
      line += 1;
      used = 0;
      if (line > lines) return false;
    }
    used += w;
  }
  return true;
}

/**
 * The name to show in `lines` lines of `width` pixels: the whole name when it
 * fits, otherwise its beginning, an ellipsis, the last characters of the stem
 * and the full extension.
 */
export function middleTruncate(
  name: string,
  { width, lines = 2, charWidth }: { width: number; lines?: number; charWidth: (char: string) => number },
): string {
  if (width <= 0 || fits(name, width, lines, charWidth)) return name;
  const [stem, extension] = splitExtension(name);
  const chars = [...stem];
  const tail = chars.slice(-TAIL).join("") + extension;
  let low = 0;
  let high = Math.max(0, chars.length - TAIL);
  // The longest beginning that still fits with the ellipsis and the tail.
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(chars.slice(0, mid).join("") + ELLIPSIS + tail, width, lines, charWidth)) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join("").trimEnd() + ELLIPSIS + tail;
}

/**
 * The same cut by character count, for the first render (no layout yet) and
 * where nothing can be measured.
 */
export function middleTruncateByLength(name: string, max: number): string {
  if ([...name].length <= max) return name;
  return middleTruncate(name, { width: max, lines: 1, charWidth: () => 1 });
}
