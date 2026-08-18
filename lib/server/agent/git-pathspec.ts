/**
 * Construction of git pathspecs for the agent's `grep`/`glob` tools (MIN-46).
 * PURE logic (no shell), extracted from sandbox.ts to be testable.
 *
 * TRAP fixed: git treats multiple pathspecs as a UNION (OR), not an intersection. Passing `-- 'path' ':(glob)pattern'` therefore broadens the search
 * (everything under `path`, PLUS anything matching `pattern` in the repository)
 * instead of restricting it. When `path` AND `glob` are provided, we merge into
 * ONE SINGLE pathspec `:(glob)<path>/<glob>` → real intersection “glob in path”.
 *
 * SECOND TRAP, measured on a real run (MIN-116): git's `:(glob)` does
 * does NOT expand braces. `**\/*.{ts,tsx}` — the form that the model writes
 * spontaneously, this is the ripgrep / Claude Code convention — then matches NO
 * file, git outputs code 1, and the tool renders “(no matches)”, indistinguishable
 * from a real absence. On the verification run, 7 `grep` out of 13 lied like
 * that, until `grep "Issue"` who replied that there was nothing. We therefore develop
 * the braces OURSELVES: an alternative = a pathspec, and the OR union of git
 * (the trap above) gives exactly the right semantics here.
 *
 * THIRD TRAP, same family, measured on MIN-226: `path` denotes a SUBTREE,
 * and the intersection assumes this. When the model wants to search ONE file, it
 * fills both fields in the same path (`path` = `glob` = `components/foo.tsx`)
 * — the natural reading of "where to search" + "what to search". We made
 * then `:(glob)components/foo.tsx/components/foo.tsx`, which matches nothing: git
 * comes out as 1, the tool responds “(no matches)”, and the model records that this
 * file does not contain what it was looking for. On the run which wrote the plan for
 * MIN-226, the 5 probes of this form lied — including the one which would have found
 * the third caller of the component that was being deleted.
 *
 * A FILE `path` does not intersect so no more: he wins, and the glob falls.
 * This is the only safe direction — at worst we search wider than asked, and
 * we never answer “nothing” on code that exists.
 */

/** Combines a subtree and a glob into a single path (glob in subtree). */
function joinWithin(path: string, glob: string): string {
  const base = path.replace(/^\/+|\/+$/g, "");
  return base ? `${base}/${glob}` : glob;
}

/**
 * Makes a glob recursive if it does NOT contain a `/`: ripgrep convention/Claude
 * Code where `*.ts` matches at any depth. In `:(glob)` git pathspec, `*` does not pass through `/`, so a bare `*.ts` would only match the root — surprising
 * for the pattern. We then prefix with a recursive doublestar segment.
 */
function recursive(glob: string): string {
  return glob.includes("/") ? glob : `**/${glob}`;
}

/**
 * Expansion product cap. A realistic glob produces a handful
 * (`{ts,tsx,js,jsx,mjs,cjs,json,md}` = 8); beyond that, the entry is pathological and
 * we render the pattern as is rather than creating hundreds of pathspecs.
 */
const MAX_BRACE_ALTERNATIVES = 64;
/** Nesting depth guardrail (`{a,{b,c}}`) — same spirit. */
const MAX_BRACE_ROUNDS = 10;

/**
 * Expands the braces of a glob: `*.{ts,tsx}` → `*.ts` + `*.tsx`. The nested
 * groups are expanded step by step; a pattern without braces (or whose braces are not balanced) appears as is, identically.
 */
export function expandBraces(pattern: string): string[] {
  let level = [pattern];
  for (let round = 0; round < MAX_BRACE_ROUNDS; round++) {
    const next: string[] = [];
    let expanded = false;
    for (const p of level) {
      const group = firstBraceGroup(p);
      if (!group) {
        next.push(p);
        continue;
      }
      expanded = true;
      for (const alt of group.alternatives) {
        next.push(p.slice(0, group.start) + alt + p.slice(group.end + 1));
      }
    }
    if (!expanded) return next;
    if (next.length > MAX_BRACE_ALTERNATIVES) return [pattern];
    level = next;
  }
  return level;
}

/**
 * First BALANCED group `{…}` of the pattern, with its level 1 alternatives.
 * Ignores what is escaped (`\{`) and the contents of a class `[…]` — a comma
 * belongs to the class, not to the group.
 */
function firstBraceGroup(
  p: string,
): { start: number; end: number; alternatives: string[] } | null {
  let start = -1;
  let depth = 0;
  let inClass = false;
  let commas: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") {
      inClass = true;
    } else if (c === "{") {
      if (depth === 0) {
        start = i;
        commas = [];
      }
      depth++;
    } else if (c === "}") {
      if (depth === 0) continue;
      depth--;
      if (depth === 0) return { start, end: i, alternatives: sliceAt(p, start + 1, i, commas) };
    } else if (c === "," && depth === 1) {
      commas.push(i);
    }
  }
  return null;
}

/** Slice `p[from, to)` at the given comma positions. */
function sliceAt(p: string, from: number, to: number, commas: number[]): string[] {
  const out: string[] = [];
  let cursor = from;
  for (const comma of commas) {
    out.push(p.slice(cursor, comma));
    cursor = comma + 1;
  }
  out.push(p.slice(cursor, to));
  return out;
}

/** A glob → its brace alternatives, each made recursive if necessary. */
function globAlternatives(glob: string): string[] {
  return expandBraces(glob).map(recursive);
}

/**
 * Glob metacharacters: their presence says that we are talking about a PATTERN, not a path.
 *
 * `[` and `]` are deliberately ABSENT. These are indeed
 * glob metacharacters (a character class), but in a Next.js repository they write
 * first a route segment — `app/(app)/projects/[id]/page.tsx` — and counting
 * as a pattern made the guard blind to the very path behind which the
 * bug had hidden. A `path` that would be a real character class without
 * any `*`/`?`/`{}` is a laboratory case; a dynamic route is the common case
 *.
 */
const GLOB_META = /[*?{}]/;

/**
 * Does `path` designate a specific file rather than a subtree? Question asked
 * WITHOUT touching the disk (this module is pure), therefore decided on the form: none
 * metacharacter, and a last segment which carries an extension.
 *
 * Making a mistake here is not serious, and it is intended: a false positive (a folder
 * named `app/v1.2`) drops the glob and searches the entire subtree —
 * larger than requested, never less. It is the exact opposite of the defect that
 * repairs, and there is no symmetry to be sought between the two.
 */
function looksLikeFile(path: string): boolean {
  if (GLOB_META.test(path)) return false;
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return /[^.]\.[A-Za-z0-9]+$/.test(last);
}

/**
 * Should the glob be ABANDONED in favor of just `path`? Two cases, and both
 * both mean "search in there":
 *
 * - `path` names a file — there is nothing to filter under a file ;
 * - both fields have the same path — nest it under itself ne
 * would match nothing, whether this path is a file or a folder.
 */
function globIsMoot(path: string, glob: string): boolean {
  return path === glob || looksLikeFile(path);
}

/**
 * Pathspecs (UNquoted) for `git grep`. Intersects `path` and `glob` when both
 * are provided, and returns ONE pathspec per curly brace alternative (OR union of
 * git). Table to be quoted by the caller.
 */
export function grepPathspecs(path?: string | null, glob?: string | null): string[] {
  const p = path?.trim();
  const g = glob?.trim();
  if (g && !(p && globIsMoot(p, g))) {
    return globAlternatives(g).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
  }
  if (p) return [p];
  return [];
}

/** Pathspecs (UNquoted) for `git ls-files` (tool `glob`) — at least one. */
export function globPathspecs(pattern: string, path?: string | null): string[] {
  const p = path?.trim();
  // Same guard as above: `glob(pattern, path)` where `path` is a file
  // (or the pattern itself) can only refer to this file.
  if (p && globIsMoot(p, pattern.trim())) return [p];
  return globAlternatives(pattern).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
}
