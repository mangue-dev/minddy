import { sq, type RepoHost } from "./repo-host";
import type { PlatformToolHandler } from "./agent-contract";

/**
 * CLOSING control of a plan (MIN-236) — the harness asks the question to the
 * model's place, after `write_issue_plan` and before he returns control.
 *
 * The targeted fault is not exploration: on the run which cost MIN-226, the
 * LAST call before writing was a `grep ObjectiveSidePanel` which made
 * the 4 files in plain text, and the plan only named 2. The information was in
 * context. MIN-226 closed the two mechanical causes (the `grep` which lied,
 * the prompt closing rule); it does not close with an instruction,
 * because an incomplete plan reads exactly like a complete plan — it's
 * precisely what makes it invisible to its own rereading.
 *
 * Hence the same doctrine as the end-of-turn type-check (`diagnostics.ts`) and
 * self-reading of the diff (`self-review.ts`): what the prompt REQUESTS, the
 * harness EXECUTES it, and puts the result back into context. Here: the
 * identifiers that the plan names are clustered for real, and the files that
 * contain them without being named returns to the model.
 *
 * **An observation, not a verdict.** The harness cannot distinguish a
 * forgotten caller from deliberate omission — a test file that cites the
 * component without being affected by the change is a perfectly normal case.
 * He notes, the model decides (`append_to_plan`, or nothing).
 *
 * Everything is MECHANICAL: no semantic reading of the plan, no model call.
 * Extract tokens, grep them, subtract what the plan already names.
 */

/** Closing grep wall budget. A single order, cape wide: on a large
 * deposit `git grep -F` remains below the second per reason. */
export const PLAN_CLOSURE_TIMEOUT_MS = 60_000;
/** Minimum budget remaining on the chunk to launch the check. Lower than the
 * type-check (a `git grep` costs nothing), but you have to let the model
 * what to read the rendered files and complete your plan. */
export const PLAN_CLOSURE_MIN_BUDGET_MS = 45_000;

/** Patterns clustered as much as possible. Beyond that, we pay one more order for a signal
 * that the model will not read: the identifiers of a plan are ordered, the
 * The first bring change. */
export const MAX_NEEDLES = 12;
/**
 * Beyond this number of files, a pattern is DISCARDED rather than reported.
 *
 * It is the safeguard that decides the usefulness of the whole mechanism. A symbol
 * present in 40 files is a common utility, not a forgotten caller: the
 * report would drown the only reason that matters under those whose plan had not
 * no reason to speak. The founding case fits largely below (4 files).
 */
export const MAX_FILES_PER_NEEDLE = 12;
/** Files listed by pattern in the rendered block. */
const FILES_SHOWN_PER_NEEDLE = 8;
/** Patterns listed in the rendered block. */
const NEEDLES_SHOWN = 6;

/** Group marker in command output — a prefix that no path
 * of file does not carry, so the division is unambiguous. */
const GROUP_MARK = "@@needle ";

/** A clustered pattern and the repository files that contain it. */
export interface ClosureHit {
  /** The pattern as it was grated (literal). */
  needle: string;
  /** The token of the plan it comes from — identical to the pattern except for a path,
   * of which we grep the basename without extension. */
  source: string;
  /** Paths relative to the repository, such as `git grep -l` renders them. */
  files: string[];
}

// ── Extraction ───────────────────────────────────────────────────────────────

/** Closed code blocks: their content is an EXAMPLE, not the shopping list of the
 * plan. Keeping them would grep each id of a pasted snippet. */
const FENCE_BLOCK = /^```[\s\S]*?^```/gm;
/** Inline code span — the plan's convention for its identifiers. */
const INLINE_CODE = /`([^`\n]+)`/g;
/** Bare path (outside backticks): `lib/server/agent/execute.ts`. Plans often write
 *  these without marking them up, and they carry the most information. */
const BARE_PATH = /(?:^|[\s(,;:])((?:[\w.@\-[\]()]+\/)+[\w.@\-[\]()]+\.[A-Za-z0-9]+)/g;

/** Code identifier: PascalCase, camelCase, or SCREAMING_SNAKE_CASE. An all-lowercase
 *  token (`plan`, `grep`, `objective`) is a word, not a symbol. */
const PASCAL_OR_CAMEL = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/** File path: at least one `/` and an extension. */
const PATH_LIKE = /^[\w.@\-[\]()/]+\.[A-Za-z0-9]+$/;

/**
 * Does this filename (with its extensions removed) identify something, or is it a
 * word?
 *
 * MEASURED on this repository: without this filter, `lib/server/agent/execute.ts`
 * produced the `execute` pattern and `vm/turn.ts` the `turn` pattern — two common
 * English words, bringing back more than a hundred files each, all discarded
 * afterward and consuming two of the twelve pattern slots. It is the same rule
 * as for a bare identifier, applied in the right place: a HUMP
 * (`objectiveSidePanel`) or a separator (`plan-closure`, `self_review`) is needed
 * for a name to count as a name.
 *
 * A list of generic names (`page`, `route`, `index`, `middleware`…) would do the
 * same job less well: it would need updating for every framework convention,
 * even though none of these names passes this rule.
 */
function isDistinctiveStem(stem: string): boolean {
  if (stem.length < 4) return false;
  if (/[-_.]/.test(stem)) return true;
  return /^[a-z_$][A-Za-z0-9_$]*[A-Z]/.test(stem) || /^[A-Z][A-Za-z0-9_$]*[a-z]/.test(stem);
}

/** The filename without its extensions: `plan-closure.test.ts` → `plan-closure`.
 *  A single pass would leave `plan-closure.test`, which finds nothing. */
function stemOf(basename: string): string {
  return basename.replace(/\.[A-Za-z0-9]+$/, "").replace(/\.(?:test|spec|stories|d)$/, "");
}

/**
 * The grep patterns, extracted from the plan's markdown.
 *
 * Two sources: inline code spans (the plan's convention) and paths written
 * without backticks. A path becomes the “basename without extension” pattern —
 * `components/objectives/objective-side-panel.tsx` → `objective-side-panel`: what
 * we seek are its IMPORTERS, and an import never cites the full path
 * rather than the full path as the plan writes it (`@/components/…`,
 * `./objective-side-panel`).
 *
 * Document order is preserved, duplicates are removed, and the result is capped
 * at `MAX_NEEDLES`.
 */
export function planNeedles(plan: string): { needle: string; source: string }[] {
  const body = plan.replace(FENCE_BLOCK, "\n");
  const raw: string[] = [];
  for (const m of body.matchAll(INLINE_CODE)) raw.push(m[1].trim());
  for (const m of body.matchAll(BARE_PATH)) raw.push(m[1].trim());

  const out: { needle: string; source: string }[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    const needle = needleFor(token);
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    out.push({ needle, source: token });
    if (out.length >= MAX_NEEDLES) break;
  }
  return out;
}

/** The pattern represented by this token, or `null` if it is not a code symbol. */
function needleFor(token: string): string | null {
  // An apostrophe would break shell quoting, and a space is never a symbol.
  if (!token || token.length > 80 || /[\s'\\`]/.test(token)) return null;

  if (token.includes("/")) {
    if (!PATH_LIKE.test(token)) return null;
    const stem = stemOf(token.slice(token.lastIndexOf("/") + 1));
    return isDistinctiveStem(stem) ? stem : null;
  }

  if (token.length < 4) return null;
  if (SCREAMING.test(token)) return token;
  if (!PASCAL_OR_CAMEL.test(token)) return null;
  // A bump at least: that's what separates `ObjectiveSidePanel` from `objectif`.
  return isDistinctiveStem(token) ? token : null;
}

// ── The grep ───────────────────────────────── ─────────────────────────────────

/**
 * ONE order for all designs. A `host.exec` per pattern would cost one
 * network round trip each from the function (the engine outside microVM speaks to
 * the sandbox via the network); the `sh` loop costs one for all.
 *
 * Each group opens on `@@needle <motif>`, then lists its files, one by
 * line — no `sed`/`awk` assuming present, and a trivial parser. The `||
 * `true` absorbs exit code 1 from `git grep` (no match), which is a result, not
 * a breakdown.
 *
 * `| head` is PROHIBITED in `grepRepo` because it would hide the exit code
 * from git, the only way to distinguish “no match” from a pattern error. Here we
 * throws this code anyway (`|| true`), so there is nothing to hide: the cap
 * just avoid crossing a thousand paths at the exit for a reason that will be
 * taken a step further. One line more than the cape is enough to know that.
 */
export function buildClosureCommand(needles: readonly string[]): string {
  const groups = needles.map(
    (needle) =>
      `printf '%s\\n' ${sq(GROUP_MARK + needle)}; git grep --no-color -I -l -F --untracked -e ${sq(needle)} | head -n ${MAX_FILES_PER_NEEDLE + 1} || true;`,
  );
  return groups.join(" ");
}

/** Splits the output of `buildClosureCommand` into files by pattern. */
export function parseClosureOutput(stdout: string): Map<string, string[]> {
  const byNeedle = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith(GROUP_MARK)) {
      current = [];
      byNeedle.set(line.slice(GROUP_MARK.length).trim(), current);
      continue;
    }
    const path = line.trim();
    if (current && path) current.push(path);
  }
  return byNeedle;
}

// ── What the plan already names ──────────────────────── ────────────────────────

/**
 * Does the plan name this file?
 *
 * Three accepted forms, from the strictest to the loosest: the complete path,
 * a suffix of at least two segments (`objectives/page.tsx` for
 * `app/objectives/page.tsx` — a plan often writes the short path), and the
 * basename alone when it is distinctive (never `page.tsx`).
 *
 * Deliberately COWARD: a false “already named” costs only silence, when a
 * false “forgotten” costs the model an unnecessary check at each shot. Between
 * both mistakes, the talkative one is the only one that pays for itself every time.
 */
export function planNamesFile(plan: string, file: string): boolean {
  const path = file.replace(/^\.\//, "");
  if (plan.includes(path)) return true;

  const segments = path.split("/");
  for (let i = 1; i < segments.length - 1; i++) {
    if (plan.includes(segments.slice(i).join("/"))) return true;
  }

  const base = segments[segments.length - 1];
  // Same rule as for extraction: a `page.tsx` cited alone does not name anything.
  if (!isDistinctiveStem(stemOf(base))) return false;
  return plan.includes(base);
}

// ── The block used for the model ───────────────────────── ─────────────────────────

const HEADER = `Before you reply: the harness grepped the identifiers your plan names, and found files that contain them and that the plan never mentions.`;

const FOOTER = `This is an observation, not a verdict — the harness cannot tell a call site you forgot from one you left out on purpose. Open the ones that matter. If a file belongs in the plan, add it with \`append_to_plan\` (never rewrite the plan). If it does not, carry on: no need to justify the omission.`;

/**
 * The closing block, or `null` if there is nothing to say — the NORMAL case, and the
 * which must remain silent: a complete plan does not deserve a paragraph which
 * says it is complete.
 *
 * PUR: the sandbox is read by the caller, as `formatTypeErrors` and
 * `formatSelfReview`, so that the sorting, headings and formulation can be tested without
 * microVM.
 */
export function formatPlanClosure(input: {
  /** The markdown of the plan writes this turn (adds from the same turn included). */
  plan: string;
  /** What grep rendered, by pattern. */
  hits: readonly ClosureHit[];
}): string | null {
  const kept = input.hits
    // A pattern that is too widespread says nothing about the closure of the plan (see MAX_FILES_PER_NEEDLE).
    .filter((hit) => hit.files.length > 0 && hit.files.length <= MAX_FILES_PER_NEEDLE)
    .map((hit) => ({
      ...hit,
      files: hit.files.filter((file) => !planNamesFile(input.plan, file)),
    }))
    .filter((hit) => hit.files.length > 0);

  if (kept.length === 0) return null;

  const shown = kept.slice(0, NEEDLES_SHOWN);
  const blocks = shown.map((hit) => {
    const files = hit.files.slice(0, FILES_SHOWN_PER_NEEDLE);
    const hidden = hit.files.length - files.length;
    const label = hit.needle === hit.source ? `\`${hit.needle}\`` : `\`${hit.source}\``;
    const via = hit.needle === hit.source ? "" : ` (grepped as \`${hit.needle}\`)`;
    return `${label}${via} — ${hit.files.length} file${hit.files.length > 1 ? "s" : ""} your plan does not mention:\n${files
      .map((file) => `- ${file}`)
      .join("\n")}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`;
  });
  const more =
    kept.length > shown.length
      ? `\n\n… and ${kept.length - shown.length} other identifier${kept.length - shown.length > 1 ? "s" : ""} in the same case.`
      : "";

  return `${HEADER}\n\n${blocks.join("\n\n")}${more}\n\n${FOOTER}`;
}

// ── The impure hook ──────────────────────────── ─────────────────────────────

/**
 * Runs the closing grep in the sandbox and makes the block to serve, or `null`.
 *
 * Best-effort end-to-end, like type-check: no repository, `git` missing,
 * timeout, unreadable output → `null`. A closing check that would cause a
 * round would be a control that we would remove the following week.
 */
export async function planClosureForTurn(host: RepoHost, plan: string): Promise<string | null> {
  const needles = planNeedles(plan);
  if (needles.length === 0) return null;
  try {
    const res = await host.exec(buildClosureCommand(needles.map((n) => n.needle)), {
      cwd: host.layout.repoDir,
      timeoutMs: PLAN_CLOSURE_TIMEOUT_MS,
    });
    // The command exits as 0 whatever happens (`|| true`): an absent deposit or a
    // `git` not found makes groups EMPTY, and `formatPlanClosure` goes silent
    // all alone. This guard therefore only covers the failure of the shell itself — sandbox
    // dead, command killed by timeout —, where the output is a fragment.
    if (res.exitCode !== 0) return null;
    const byNeedle = parseClosureOutput(res.stdout);
    const hits: ClosureHit[] = needles.map(({ needle, source }) => ({
      needle,
      source,
      files: byNeedle.get(needle) ?? [],
    }));
    return formatPlanClosure({ plan, hits });
  } catch {
    return null;
  }
}

/** The plan written during a round, as the end-of-round brackets read it
 * — the closing here, and the rereading of `plan-review.ts` (MIN-237). */
export interface PlanWriteSink {
  /** A `write_issue_plan` SUCCEEDED this round — otherwise, nothing to check. */
  wrote: boolean;
  /** The verified markdown: the written plan, plus the blocks added in the same
   *  round (they name files, so they count as coverage). */
  markdown: string;
}

/**
 * A new sink. Lives on the scale of CHUNK, like `selfReviewed` and for the same
 * reason: he does not travel through the checkpoint.
 *
 * What this lets slip through, said rather than discovered: on the FUNCTION side, a chunk which
 * dies between `write_issue_plan` and the end of the turn leaves without the plan, therefore without
 * control. The price of making it travel would be an extra 64kb plan in a
 * checkpoint that `fitCheckpoint` already sizes as narrowly as possible, for a window of
 * a few seconds — and the window does not exist at all in the microVM (MIN-224),
 * where the whole trick fits into a single process.
 */
export function newPlanWriteSink(): PlanWriteSink {
  return { wrote: false, markdown: "" };
}

/**
 * Envelop the tools ticket handler to note, in passing, the plan that the
 * written tour. The sink is mutated here and read by the end-of-turn hook — even
 * slicing as `editedPaths` for type-check.
 *
 * We ONLY note successful calls: a `write_issue_plan` refused (ticket
 * not found, empty plan) has not written anything, and grep its markdown would make the
 * harness to grep the markdown of a plan that does not exist.
 *
 * `append_to_plan` does not TRIGGER the control (the plan it completes is not
 * in his arguments, so we would not know what is already named) but he
 * COUNTS when a `write_issue_plan` occurred in the same turn.
 *
 * `edit_issue_text` on the plan is REPLAYED on the noted markdown (MIN-237): it is
 * by him that the model corrects his plan after proofreading, and the closing turns
 * AFTER her. Without this replay, grep would report as forgotten a file that the
 * model just named. The substitution is that of the tool (single, or global
 * with `replace_all`), applied only if the passage is present here: our
 * copy only covers what THIS round wrote, the server's may be more
 * wide, and a patch that is not applied should not break anything.
 */
export function watchPlanWrites(
  handler: PlatformToolHandler,
  sink: PlanWriteSink,
): PlatformToolHandler {
  return async (name, args) => {
    const out = await handler(name, args);
    if (!out.success) return out;
    if (name === "write_issue_plan" && typeof args.plan === "string") {
      sink.wrote = true;
      sink.markdown = args.plan;
    } else if (name === "append_to_plan" && typeof args.markdown === "string") {
      sink.markdown = `${sink.markdown}\n\n${args.markdown}`;
    } else if (name === "edit_issue_text" && args.field === "plan") {
      const from = typeof args.old_string === "string" ? args.old_string : "";
      const to = typeof args.new_string === "string" ? args.new_string : null;
      if (from && to != null && sink.markdown.includes(from)) {
        sink.markdown =
          args.replace_all === true
            ? sink.markdown.split(from).join(to)
            : sink.markdown.replace(from, to);
      }
    }
    return out;
  };
}
