/**
 * Read the `<head>` of a remote page without being tricked by it (MIN-336).
 *
 * This module parses HTML **chosen by a user**. The constraint is
 * so not the correctness of the parsing — a poorly formed `<link>` is not serious — but
 * **time**: each function here must be linear in the size of
 * the input, whatever that input is.
 *
 * The regex that lived here were not. `/<link\b[^>]*>/g` on a
 * megabyte without the slightest `>` restarts with a complete `[^>]*` for each `<link`
 * encountered: 66 seconds of event loop blocked, on an instance shared by
 * everyone. `/<meta[^>]*property\s*=\s*["']og:title["'][^>]*>/` was worse
 * — two `[^>]*` around a literal, cubic backtracking, 25 seconds
 * for 52 KB.
 *
 * Hence the form of the code: `indexOf` and sliders, no nested
 * quantifier. A scan, only once, without going back — and explicit bounds
 * on the length of a tag and a title, so that a pathological
 * page costs the price of its size and nothing more.
 */

/** Beyond that, it is no longer a `<head>` tag but a charge. */
const MAX_TAG_LENGTH = 8 * 1024;
/** A title longer than that is truncated: no one will read the rest. */
const MAX_TITLE_LENGTH = 4 * 1024;

/**
 * The content (between the name and `>`) of each start tag with this name.
 *
 * Linear: the cursor never moves back. After a tag, we start again AFTER its
 * `>` — so the `<link` stacked before the same `>` are only read once — and
 * a tag never closed stops the scanning instead of starting it again.
 */
export function* scanTags(html: string, name: string): Generator<string> {
  const needle = `<${name}`;
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf(needle, from);
    if (start === -1) return;
    const end = html.indexOf(">", start + needle.length);
    if (end === -1) return; // no more complete tags after this point
    from = end + 1;
    // `<linkedin>` is not a `<link>`: the name must be followed by a delimiter.
    const next = html[start + needle.length];
    if (next !== undefined && next !== ">" && next !== "/" && !/\s/.test(next)) continue;
    if (end - start > MAX_TAG_LENGTH) continue;
    yield html.slice(start + needle.length, end);
  }
}

/**
 * The attributes of a tag, name in lowercase. First winning occurrence,
 * values ​​in single, double, or bare quotes. Single pass, without
 * regex on input.
 */
export function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);
  let i = 0;
  while (i < tag.length) {
    while (isSpace(tag[i])) i++;
    const nameStart = i;
    while (i < tag.length && !isSpace(tag[i]) && tag[i] !== "=" && tag[i] !== "/") i++;
    if (i === nameStart) {
      i++; // isolated character (`/`, orphan `=`): we move forward, otherwise we loop
      continue;
    }
    const name = tag.slice(nameStart, i).toLowerCase();
    while (isSpace(tag[i])) i++;
    if (tag[i] !== "=") {
      if (!attributes.has(name)) attributes.set(name, "");
      continue;
    }
    i++;
    while (isSpace(tag[i])) i++;
    const quote = tag[i];
    let value: string;
    if (quote === '"' || quote === "'") {
      const valueStart = i + 1;
      const closing = tag.indexOf(quote, valueStart);
      const stop = closing === -1 ? tag.length : closing;
      value = tag.slice(valueStart, stop);
      i = stop + 1;
    } else {
      const valueStart = i;
      while (i < tag.length && !isSpace(tag[i])) i++;
      value = tag.slice(valueStart, i);
    }
    if (!attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

/** The plain text of a `<title>` (undecoded entities), bounded in length. */
export function extractTitleText(html: string): string | null {
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf("<title", from);
    if (start === -1) return null;
    const open = html.indexOf(">", start + 6);
    if (open === -1) return null;
    from = open + 1;
    const next = html[start + 6];
    if (next !== undefined && next !== ">" && !/\s/.test(next)) continue;
    const close = lower.indexOf("</title", open + 1);
    const end = close === -1 ? html.length : close;
    return html.slice(open + 1, Math.min(end, open + 1 + MAX_TITLE_LENGTH));
  }
}

/** The `content` of the first `<meta>` tag declaring this property
 Open Graph (`property=` or, for approximates, `name=`). */
export function extractMetaContent(html: string, property: string): string | null {
  for (const tag of scanTags(html, "meta")) {
    const attributes = parseAttributes(tag);
    const declared = attributes.get("property") ?? attributes.get("name");
    if (declared?.trim().toLowerCase() !== property) continue;
    const content = attributes.get("content");
    if (content) return content.slice(0, MAX_TITLE_LENGTH);
  }
  return null;
}
