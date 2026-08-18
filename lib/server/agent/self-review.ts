import { headTail } from "./prune";
import { grepRepo, type RepoHost } from "./repo-host";

/**
 * Auto-replay EXECUTED at end of turn.
 *
 * The system prompt has always asked, in step 4 of “How to work”:
 * “Run `git diff` and read your change end to end before replying”. It was a
 * politeness — nothing executed it, nothing verified that it had taken place. But the
 * repository applies the opposite rule everywhere else: git prohibitions are
 * ANNOUNCED as executed because they are (command-guard.ts, MIN-108), and
 * the end-of-turn type-check TALKS to the model instead of hoping it throws it
 * (diagnostics.ts, MIN-110). This module applies the same doctrine to proofreading:
 * the round diff is put IN the context of the model before it responds.
 *
 * What it catches that nothing else catches: the JOIN error —
 * two files written in the same gesture, each correct in isolation, whose
 * contract between them is false. The basic case: `"deleteViewTitle": "Delete
 * “{name}”?”` in the catalog, `t("deleteViewTitle")` in the component. Neither
 * neither the type-check nor the repository tests saw the fault (cf.
 * lib/i18n-contract.test.ts, written for that one) — and a file reread by
 * file doesn't see it either, because every half passes. You must have
 * the two slopes under the eyes AT THE SAME TIME, what the difference of the turn gives.
 *
 * The diff is presented as the output of a `git diff` that the harness threw to
 * HIS PLACE — the agent therefore has no reason to restart it, and the round costs
 * an injection rather than a round trip of tool.
 *
 * WHAT THE DIFF ALONE DOES NOT SHOW (MIN-252). The rereading above poses the
 * bonne question — « *a value produced in one file and consumed in another — do
 * the two sides agree?*” — and on the run of the PR 48 the model answered it
 * honestly: the data string WAS consistent. The fault was elsewhere.
 * `onEvent: (row) => { setLive(null) }` returned `null` to the state that the
 * change had just been made, from an UNMODIFIED line, absent from the four
 * hunks. A diff replay cannot see what is not in the diff —
 * and it was not a problem of context: the model had read this line
 * two calls before editing, with no pruning in between. He had read it and
 * didn't connect it to what he wrote.
 *
 * Hence the second block: the OTHER report writing sites that the diff writes,
 * read in the repository and not in the diff. Same error family as the one that
 * motivated first — an invisible defect file by file — shifted by one
 * notch: invisible DIFF BY DIFF. And it's a `grep` that the harness can do
 * itself, as it already does `git diff` in place of the model.
 *
 * ASSUME, because the perfect is out of reach: no flow analysis. We
 * extracts the identifiers of the added lines and searches for them, as in
 * would make a proofreader in a hurry. This produces false positives - acceptable, the block
 * is short and the model sorts. What isn't is what we had before:
 * zero signal.
 */

/** Injected diff cap. Beyond that, the model no longer rereads, it undergoes — even
 * reasoning that `TYPE_ERRORS_MAX_CHARS`, calibrated higher because a diff
 * can be read in full or not read. Elision by the MIDDLE (`headTail`): the
 * start and end of a diff carry the files, not the padding. */
export const SELF_REVIEW_DIFF_MAX_CHARS = 12_000;

/** Cape of the “who writes this elsewhere” block. An ORDER OF SIZE under the diff, and
 * this is intentional: this block ACCOMPANYS the diff, it does not compete with it. A
 * grep paragraph longer than the change it comments out reads like the
 * subject of the tour, which it is not. */
export const SELF_REVIEW_OVERWRITES_MAX_CHARS = SELF_REVIEW_DIFF_MAX_CHARS / 6;

/** Minimum wall budget remaining on the chunk to inject replay.
 *
 * Extended to MIN-252: the gesture is no longer “two git commands” — it carries
 * now until `MAX_ASSIGNED_SYMBOLS` greps (run together, but each
 * crosses the deposit), and the block that comes out requires a VERIFICATION, not a
 * reading. Serve this to a model who no longer has time to open a file
 * would produce the worst of both worlds: a question asked, never instructed. */
export const SELF_REVIEW_MIN_BUDGET_MS = 75_000;

/** Untracked files listed by name (beyond that, we say how many remain). */
const UNTRACKED_MAX = 20;

const HEADER = `Before you reply, here is what this turn actually changed. The harness ran \`git diff\` for you — do not run it again.`;

const INSTRUCTIONS = `Read it end to end, as a reviewer would, then either fix what you find or reply.

Check especially what is only visible ACROSS files, because each file alone looks right:
- a value produced in one file and consumed in another (i18n placeholders, props, payload fields, env vars, DB columns) — do the two sides agree?
- something added in one place that its counterpart still ignores (a new case, a new state, a new option);
- anything you changed halfway and did not finish.
Then the usual: no stray debug or scratch file, no leftover commented-out code, nothing unrelated to what was asked.

If it is all correct, carry on — do not restate the diff, and do not announce that you re-read it.`;

/** An untracked file, such as `git status --porcelain` renders it. */
export function parseUntracked(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/**
 * The auto-reread block, or `null` if there is nothing to re-read.
 *
 * PUR: the sandbox is read by the caller (execute.ts), so that the implementation
 * form, headings and formulation remain testable without microVM — even
 * cutting as `formatTypeErrors`.
 */
export function formatSelfReview(input: {
  /** Output of `git diff <baseline>`: SUIVIS files modified this round. */
  diff: string;
  /** Output of `git status --porcelain`: used to list the added files. */
  porcelain?: string;
  /** The other writes of the states that the diff writes (`overwriteSitesForTurn`). */
  overwrites?: readonly OverwriteHit[];
}): string | null {
  const diff = input.diff.trim();
  const untracked = parseUntracked(input.porcelain ?? "");

  // Nothing followed modified AND nothing new: the tour did not touch the deposit.
  if (!diff && untracked.length === 0) return null;

  const shown = untracked.slice(0, UNTRACKED_MAX);
  const hidden = untracked.length - shown.length;
  const untrackedBlock =
    untracked.length > 0
      ? `\n\nNew files this turn (untracked, so absent from the diff above):\n${shown
          .map((path) => `- ${path}`)
          .join("\n")}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`
      : "";

  const diffBlock = diff
    ? `\n\n\`\`\`diff\n${headTail(diff, SELF_REVIEW_DIFF_MAX_CHARS)}\n\`\`\``
    : "\n\n(No tracked file was modified.)";

  const overwrites = formatOverwrites(input.overwrites ?? []);

  return `${HEADER}${diffBlock}${untrackedBlock}\n\n${INSTRUCTIONS}${overwrites}`;
}

// ── Which, ELSEWHERE, writes the same state (MIN-252) ───────────────────────────

/** Symbols extracted from the diff, at most. Beyond that, the block would drown out the difference
 * that it accompanies — and the first writings of a tour are those which
 * carry change. */
export const MAX_ASSIGNED_SYMBOLS = 15;
/** Sites REPORTED by symbol. Three are enough to open the file;
 * beyond that we list, we no longer show. */
export const MAX_SITES_PER_SYMBOL = 3;
/**
 * Beyond this number of sites, a symbol is DISMISSED rather than reported.
 *
 * It is the safeguard which decides the usefulness of the whole mechanism, and it holds
 * place of list of stop words (same reasoning as in `plan-closure.ts`): a
 * generic name — `data`, `value`, `state` — is written everywhere, so it falls
 * here alone, without having to keep a list that each convention of
 * framework would expire. A state that is written from only one other place is
 * exactly the founding case.
 */
export const MAX_SITES_SCANNED = 12;
/** Detailed symbols in the rendered block. */
const SYMBOLS_SHOWN = 6;
/** Repository files searched: the code, not the docs or catalogs. */
const CODE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
/** Under that, an identifier is a loop counter, not a state. */
const MIN_SYMBOL_LENGTH = 4;

/**
 * The FORM of writing that caused a symbol to be remembered. It bears the rigged pattern,
 * so she decides what we will find — and she tells herself to the model, who has not
 * to guess why the harness shows him.
 */
export type AssignedKind = "setter" | "collection" | "variable";

export interface AssignedSymbol {
  /** The identifier writes: `setLive`, `cache`, `pending.current`. */
  name: string;
  kind: AssignedKind;
  /** The ERE pattern searched in the repository, derived from the name and form. */
  pattern: string;
}

/** A `setX(` — the setter of a `useState`, and the clearest form: all
 * call is a write, without exception to sort. */
const SETTER_CALL = /\b(set[A-Z][A-Za-z0-9_$]*)\s*\(/g;
/** A mutated collection: `x.set(`, `x.add(`, `x.delete(`, `x.clear(`. */
const COLLECTION_WRITE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\.(?:set|add|delete|clear)\s*\(/g;
/**
 * An assignment at HEAD of instruction: `live = …`, `cache.current = …`.
 *
 * The anchor at the start of the line (once the indentation is removed) is what separates
 * writing a JSX `prop={…}`, a default parameter or a key
 * object — none of the three opens a line. `[^=>]` after `=` removes
 * `==`, `===` and the arrow of a lambda; declarations are discarded before.
 */
const ASSIGNMENT = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)\s*=[^=>]/;
/** A declaration DECLARES, it does not overwrite anything: the symbol is born there. */
const DECLARATION = /^(?:const|let|var|export|import|type|interface|class|function|async)\b/;

/** Escape for a POSIX ERE — in practice, the point of a `x.current`. */
function escapeEre(value: string): string {
  return value.replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
}

/** The pattern of writing of this symbol, according to its shape. */
function patternFor(name: string, kind: AssignedKind): string {
  const id = escapeEre(name);
  if (kind === "setter") return `${id} *\\(`;
  if (kind === "collection") return `${id} *\\.(set|add|delete|clear) *\\(`;
  // The left guard prevents `active = …` from matching `isActive = …` or
  // `x.active = …`: what we are looking for is THIS symbol, not its namesake.
  return `(^|[^-+*/%!<>=&|.A-Za-z0-9_$])${id} *=[^=>]`;
}

/** A line from a hunk, from the AFTER side: the one the depot carries now, so
 * the one whose line numbers align with those of grep. */
export interface HunkLine {
  text: string;
  /** The turn WRITE it (`+`), as opposed to the context that git gives around. */
  added: boolean;
  /** His number in today's file. */
  line: number;
}

export interface DiffHunk {
  /** Path relative to the repository, as `+++ b/…` names it. */
  file: string;
  lines: HunkLine[];
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * The hunks of a unified `git diff`, AFTER side, including line numbers.
 *
 * These numbers are the whole point: they are what allows you to say “this
 * grep match IS a diff' line without comparing texts. On the case
 * founder the comparison of texts would have been wrong — `setLive(null);` figure
 * THREE times in the file, including one in the diff and one in the `onEvent`
 * qu'il faut justement remonter.
 *
 * A deleted file (`+++ /dev/null`) has no side after it: it is ignored.
 */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let file: string | null = null;
  let current: DiffHunk | null = null;
  let next = 0;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim().replace(/^b\//, "");
      file = path && path !== "/dev/null" ? path : null;
      current = null;
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      next = Number.parseInt(header[1], 10);
      current = file ? { file, lines: [] } : null;
      if (current) hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("+")) current.lines.push({ text: raw.slice(1).trim(), added: true, line: next++ });
    else if (raw.startsWith("-")) continue; // Removed: no longer in file, so no more number.
    else if (raw.startsWith(" ") || raw === "")
      current.lines.push({ text: raw.slice(1).trim(), added: false, line: next++ });
    // Everything else (`\ No newline`, `diff --git`, `index`) does not carry a line.
  }
  return hunks;
}

/** Does the diff cover this `fichier:ligne`? This is the question posed
 * exclusion: what the model has just read, we do not show it to him. */
export function diffCoverage(hunks: readonly DiffHunk[]): (file: string, line: number) => boolean {
  const byFile = new Map<string, Set<number>>();
  for (const hunk of hunks) {
    let lines = byFile.get(hunk.file);
    if (!lines) byFile.set(hunk.file, (lines = new Set()));
    for (const l of hunk.lines) lines.add(l.line);
  }
  return (file, line) => byFile.get(file)?.has(line) === true;
}

/**
 * The states that this trick WRITES, the most direct first.
 *
 * Deliberately narrow scope: `useState` setters, collections
 * mutated, and assignments at the head of the instruction. These are the three forms
 * which produce the intended error — “someone else resets this.”
 *
 * THE HUNK, NOT THE `+` LINE. On the founding case, the trick adds two fields
 * IN a `setLive((prev) => ({ … }))` whose call head does not move:
 * the writing is the hunk's doing, it is not written on any of his lines
 * `+`. Sticking to the added lines didn't find anything at all — checked, it's
 * what the first version of this module did. The context that git gives
 * around (three lines) is therefore also read, and it is read as what it is: the
 * immediate vicinity of the change. A hunk with no added lines — a pure
 * withdrawal — writes nothing and is not read.
 *
 * THE ORDER wears the cape. What the trick has hit takes precedence over what it has encountered, and
 * the setters in front of the rest: it is the form of which each occurrence is a
 * writing, therefore the one whose grep lies the least.
 */
export function assignedSymbols(diff: string): AssignedSymbol[] {
  const found = new Map<string, AssignedSymbol & { added: boolean }>();
  const add = (name: string, kind: AssignedKind, added: boolean) => {
    if (name.length < MIN_SYMBOL_LENGTH) return;
    const already = found.get(name);
    if (already) {
      // The same symbol seen on a `+` line is better than in context.
      if (added && !already.added) already.added = true;
      return;
    }
    found.set(name, { name, kind, pattern: patternFor(name, kind), added });
  };

  for (const hunk of parseDiffHunks(diff)) {
    if (!hunk.lines.some((l) => l.added)) continue;
    for (const { text, added } of hunk.lines) {
      for (const m of text.matchAll(SETTER_CALL)) add(m[1], "setter", added);
      for (const m of text.matchAll(COLLECTION_WRITE)) add(m[1], "collection", added);
      if (DECLARATION.test(text)) continue;
      const assigned = ASSIGNMENT.exec(text);
      if (assigned) add(assigned[1], "variable", added);
    }
  }

  const rank: Record<AssignedKind, number> = { setter: 0, collection: 1, variable: 2 };
  return [...found.values()]
    .sort((a, b) => Number(b.added) - Number(a.added) || rank[a.kind] - rank[b.kind])
    .slice(0, MAX_ASSIGNED_SYMBOLS)
    .map(({ name, kind, pattern }) => ({ name, kind, pattern }));
}

/** A place in the repository that writes the symbol, outside the diff. */
export interface OverwriteSite {
  /** Path relative to the repository, as `git grep -n` renders it. */
  file: string;
  line: number;
  /** The line, indentation removed. */
  text: string;
}

export interface OverwriteHit {
  symbol: AssignedSymbol;
  sites: OverwriteSite[];
}

/** Cuts out a `git grep -n` (`fichier:ligne:texte`) output. A line whose
 * number is not a number is not a match: it is thrown, not guessed. */
export function parseGrepSites(output: string): OverwriteSite[] {
  const sites: OverwriteSite[] = [];
  for (const raw of output.split("\n")) {
    const first = raw.indexOf(":");
    if (first <= 0) continue;
    const second = raw.indexOf(":", first + 1);
    if (second < 0) continue;
    const line = Number.parseInt(raw.slice(first + 1, second), 10);
    if (!Number.isFinite(line)) continue;
    sites.push({ file: raw.slice(0, first), line, text: raw.slice(second + 1).trim() });
  }
  return sites;
}

/**
 * Sites that are NOT in the diff, files affected first.
 *
 * Only one rule: never make the model reread a line that he has just
 * lire. L'exclusion se fait donc par `fichier:ligne` — un site couvert par un
 * hunk IS a line of the diff — and especially not by the text, which repeats: on
 * the founding case, the line to go back carries word for word the same
 * `setLive(null);` than one line of the diff, fifteen lines higher.
 *
 * The order matters more than it seems: the cap falls to three, and another site
 * in a file that the turn has just edited is by far the most likely to
 * undo what he has just put there.
 */
export function selectSites(
  sites: readonly OverwriteSite[],
  opts: { inDiff: (file: string, line: number) => boolean; touched: ReadonlySet<string> },
): OverwriteSite[] {
  const kept = sites.filter((site) => site.text && !opts.inDiff(site.file, site.line));
  return [...kept].sort((a, b) => {
    const byFile = Number(opts.touched.has(b.file)) - Number(opts.touched.has(a.file));
    return byFile !== 0 ? byFile : a.file.localeCompare(b.file) || a.line - b.line;
  });
}

const OVERWRITE_HEADER = `The harness also grepped the state your diff WRITES, and found other places that write it — lines you did not touch, so they are nowhere in the diff above.`;

const OVERWRITE_FOOTER = `Does any of them undo what you just set? A diff review cannot answer this on its own: the line that defeats a change is usually the one that did not change. This is an observation, not a verdict — most of these are legitimate. Open the ones that write the same state on the same path as your change, and reply once you have looked.`;

/** How the block tells where a symbol comes from — the model must be able to rule out
 * a false positive without opening the file. */
const KIND_LABEL: Record<AssignedKind, string> = {
  setter: "state setter",
  collection: "mutated collection",
  variable: "assigned variable",
};

/**
 * The “who writes this elsewhere” block, or `""` if there is nothing to say — the case
 * NORMAL, and the one who must remain silent: a trick that no one undoes
 * the writing doesn't deserve a paragraph saying so.
 *
 * PUR, like everything else in the module: the grep is done by the caller.
 */
export function formatOverwrites(hits: readonly OverwriteHit[]): string {
  // Sorting by volume belongs to `overwriteSitesForTurn`, which applies it to the
  // grep BRUT — only place where the actual count is known. The course remains here in
  // net for a caller who would construct his `hits` differently.
  const kept = hits.filter((hit) => hit.sites.length > 0 && hit.sites.length <= MAX_SITES_SCANNED);
  if (kept.length === 0) return "";

  const shown = kept.slice(0, SYMBOLS_SHOWN);
  const blocks = shown.map((hit) => {
    const sites = hit.sites.slice(0, MAX_SITES_PER_SYMBOL);
    const hidden = hit.sites.length - sites.length;
    const lines = sites.map((site) => `- ${site.file}:${site.line}  ${site.text}`).join("\n");
    return `\`${hit.symbol.name}\` (${KIND_LABEL[hit.symbol.kind]}) — ${hit.sites.length} other write${hit.sites.length > 1 ? "s" : ""}:\n${lines}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`;
  });
  const more =
    kept.length > shown.length
      ? `\n\n… and ${kept.length - shown.length} other symbol${kept.length - shown.length > 1 ? "s" : ""} in the same case.`
      : "";

  const body = headTail(`${blocks.join("\n\n")}${more}`, SELF_REVIEW_OVERWRITES_MAX_CHARS);
  return `\n\n---\n\n${OVERWRITE_HEADER}\n\n${body}\n\n${OVERWRITE_FOOTER}`;
}

/**
 * Runs the greps in the sandbox and renders the other writes, symbol by
 * symbole.
 *
 * One grep PER symbol, all run together: `grepRepo` already knows how to distinguish
 * “no match” of a refused pattern and fall back to literal (MIN-109), and
 * doing this again in a `sh` loop would amount to rewriting this module in less
 * GOOD. The price is a round trip per symbol, paid in parallel and bounded by
 * `MAX_ASSIGNED_SYMBOLS`.
 *
 * End-to-end best-effort, such as type-checking and plan closure: no
 * deposit, `git` absent, timeout, reason refused → no block, never a turn
 * blocked.
 */
export async function overwriteSitesForTurn(
  host: RepoHost,
  diff: string,
): Promise<OverwriteHit[]> {
  const symbols = assignedSymbols(diff);
  if (symbols.length === 0) return [];
  const hunks = parseDiffHunks(diff);
  const inDiff = diffCoverage(hunks);
  const touched = new Set(hunks.map((hunk) => hunk.file));

  const hits = await Promise.all(
    symbols.map(async (symbol) => {
      const res = await grepRepo(host, {
        pattern: symbol.pattern,
        glob: CODE_GLOB,
        outputMode: "content",
        // One more than the milestone: this is what allows you to KNOW that you have exceeded it,
        // therefore to throw away a symbol that is too widespread instead of showing three sites
        // au hasard.
        headLimit: MAX_SITES_SCANNED + 1,
      }).catch(() => null);
      if (!res?.ok) return null;
      const raw = parseGrepSites(res.output);
      // THE CAP IS JUDGED ON THE GREP BRUT, BEFORE `selectSites`. The symbol is
      // extracted from the diff, so its OWN lines are in this grep: remove them
      // first brings down below the threshold an omnipresent symbol, which
      // then announces “12 other writes” even though he has two hundred. It is
      // the order that `plan-closure.ts` already applies (it filters on `hit.files`
      // raw before removing the files named by the plan).
      if (raw.length > MAX_SITES_SCANNED) return null;
      return { symbol, sites: selectSites(raw, { inDiff, touched }) };
    }),
  );
  return hits.filter((hit): hit is OverwriteHit => hit != null && hit.sites.length > 0);
}
