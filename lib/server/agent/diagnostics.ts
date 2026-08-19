import { sq, type RepoHost } from "./repo-host";

/**
 * Type-check of the repository (MIN-110). Since MIN-263 it no longer runs at the end of the turn:
 * it is requested explicitly through `validate_changes` and kept separate from PR
 * publication. The rest of the reasoning below — a check
 * by ROUND and not by edit — remains unchanged.
 *
 * OpenCode closes the loop IN the editing tool: each `edit` touches the
 * file on the LSP side and pastes the diagnostics into the result. We cannot copy
 * it as is, and the measurement says so (docs/agent-harness-comparison.md §3.3, section
 * “Cost of a type-check in the sandbox”): in our microVM, a `tsc --noEmit`
 * incremental costs 4.9 s at floor, ~11 s in normal mode, 14.4 s when
 * affected file is a crossroads. By edition, the heaviest run of our
 * story would pay up to 290s — more than the soft-deadline of a chunk. And
 * above all, a coherent change is spread over several files: checking BETWEEN
 * two halves of the same change goes back to errors that the next edition
 * edits would erase the errors found by the next edit.
 *
 * Hence: ONE check per round, and only if the round touched files. It runs
 * when `validate_changes` is called, not as a hidden side effect of publishing:
 * the errors go into the tool's `followUp`, the model corrects them, and can
 * call validation again before publishing.
 *
 * EVERYTHING here is best-effort and SILENT in case of doubt: no `tsconfig.json`,
 * no `node_modules/.bin/tsc` (our most common production failure:
 * `tsc: command not found`, the model launching `npm run typecheck` before installing),
 * timeout, unreadable output → `null`. A harness that turned an
 * uninstalled environment into a wall of errors would be worse than silence.
 */

/** Wall budget of a type-check. Measured: 22 s cold, ~11 s hot on minddy.
 * Large for a big deposit, narrow so you never eat a whole chunk. */
export const TYPECHECK_TIMEOUT_MS = 120_000;
/** Minimum budget remaining on the chunk to launch a check (otherwise we keep quiet). */
export const TYPECHECK_MIN_BUDGET_MS = 60_000;
/** Heading of the error block returned to the model. Beyond that, he no longer reads, he suffers. */
export const TYPE_ERRORS_MAX_CHARS = 2000;
/**
 * `.tsbuildinfo` kept OUTSIDE the depot: the `git add -A` at the end of the turn does not see it
 * never, and `git status` remains clean for the model (same reason as the folder
 * tools outputs). Persists in microVM snapshot → towers
 * following start again hot (22 s → 11 s).
 *
 * Under the DU RUN root from MIN-354: two runs which would share a cache
 * incremental would make it slower than no cache at all, each
 * invalidating that of the other with each passage.
 */
function tsbuildinfo(host: RepoHost): string {
  return `${host.layout.typecheckDir}/agent.tsbuildinfo`;
}

/** Error block header. OpenCode formulation (“…please fix:”), which we
 * knows that it works, aligned with our scope: the trick, not the file. */
const HEADER = "Type errors detected after your changes, please fix:";
/** Anti-loop reminder: an already broken repository should not become the subject of the round. */
const FOOTER =
  "If an error is unrelated to what you changed (it was already there), do not fix it — say so in your reply.";

/** A typing error such as `tsc --pretty false` makes it. */
export interface TypeErrorEntry {
  /** Path relative to the repository, as tsc prints it. */
  file: string;
  /** The complete line, indented elaborations included. */
  text: string;
}

/** The type-checker of the repository, if it can be used HERE AND NOW. */
export interface TypeChecker {
  /** Major version of TypeScript (`--incremental` with `--noEmit` requires TS ≥ 5). */
  major: number;
}

/**
 * Does the repository have an ACTUALLY executable type-checker? `tsconfig.json` alone
 * is not enough — without `node_modules`, `tsc` does not exist. A single command (1 ms
 * in the VM, the round-trip dominates). Best effort: any failure → `null`.
 */
export async function detectTypeChecker(host: RepoHost): Promise<TypeChecker | null> {
  try {
    const res = await host.exec(
      `test -f tsconfig.json && test -x ./node_modules/.bin/tsc && ./node_modules/.bin/tsc --version`,
      { cwd: host.layout.repoDir, timeoutMs: 30_000 },
    );
    if (res.exitCode !== 0) return null;
    const major = Number(/Version (\d+)\./.exec(res.stdout)?.[1] ?? NaN);
    return Number.isFinite(major) ? { major } : null;
  } catch {
    return null;
  }
}

/**
 * Runs the type-check of the repository and returns the block to be used for the model, or `null`
 * if there is nothing to say. `touched` = the paths that the round has edited: they
 * go AT THE HEAD of the block (this is the link “your edition → this error” that the
 * ticket seeks to reinstate), the rest of the deposit behind.
 */
export async function typeErrorsForTurn(
  host: RepoHost,
  touched: readonly string[],
): Promise<string | null> {
  const checker = await detectTypeChecker(host);
  if (!checker) return null;

  // `--incremental` explicit: the tsconfig of the repository does not necessarily activate it, and
  // it is he who reduces the following laps from 22 s to 11 s. Prohibited with
  // `--noEmit` before TS 5 → we do without it (we pay the high price, but we talk).
  const buildInfo = tsbuildinfo(host);
  const incremental =
    checker.major >= 5 ? ` --incremental --tsBuildInfoFile ${sq(buildInfo)}` : "";
  try {
    const res = await host.exec(
      `mkdir -p ${sq(host.layout.typecheckDir)}; ./node_modules/.bin/tsc --noEmit --pretty false${incremental} 2>&1`,
      { cwd: host.layout.repoDir, timeoutMs: TYPECHECK_TIMEOUT_MS },
    );
    // exitCode 0 = nothing to say. Non-zero WITHOUT analyzable error = tool failure
    // (unreadable tsconfig, OOM, timeout): `formatTypeErrors` returns null.
    return formatTypeErrors(res.stdout + res.stderr, touched);
  } catch {
    return null;
  }
}

/** `path/to/file.ts(12,3): error TS2322: …` — the form of `tsc --pretty false`. */
const ERROR_LINE = /^(\S[^(]*)\((\d+),(\d+)\): error (TS\d+): /;

/**
 * Splits a `tsc --pretty false` output into errors. An entry begins at
 * a line `file(line,column): error TSxxxx:` and absorbs the indented lines which
 * follow (the TypeScript elaborations, often the only place where it says
 * FOR WHAT). Anything that does not belong to any entry is discarded — including errors
 * configuration errors without a file (`TS5083`, `TS18003`), which do not concern the
 * model and would lead him on a false trail.
 */
export function parseTypeErrors(raw: string): TypeErrorEntry[] {
  const entries: TypeErrorEntry[] = [];
  for (const line of raw.split("\n")) {
    const m = ERROR_LINE.exec(line);
    if (m) {
      entries.push({ file: m[1], text: line.trimEnd() });
      continue;
    }
    // Elaboration: attached to the current error, never orphaned.
    if (entries.length > 0 && /^\s+\S/.test(line)) {
      entries[entries.length - 1].text += `\n${line.trimEnd()}`;
    }
  }
  return entries;
}

/**
 * Returns the block served to the model: header, errors of files TOUCHED first,
 * then the others, head to `TYPE_ERRORS_MAX_CHARS`. `null` if there are no errors
 * analyzable — the caller then becomes completely silent.
 *
 * Pure (no sandbox): this is where sorting, heading and formulation live,
 * so this is where the testing is.
 */
export function formatTypeErrors(raw: string, touched: readonly string[]): string | null {
  const entries = parseTypeErrors(raw);
  if (entries.length === 0) return null;

  const isTouched = new Set(touched.map(normalizePath));
  const mine = entries.filter((e) => isTouched.has(normalizePath(e.file)));
  const others = entries.filter((e) => !isTouched.has(normalizePath(e.file)));
  const ordered = [...mine, ...others];

  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of ordered) {
    // +1 for line break. We stop BEFORE overtaking: a block cut at
    // middle of an error would cause the model to read a truncated path or message.
    if (used + entry.text.length + 1 > TYPE_ERRORS_MAX_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length + 1;
    shown++;
  }
  // Cap reached from the first error (a monstrous elaboration): we serve it
  // still, truncated — better than an empty block that would say “everything is fine”.
  if (lines.length === 0) {
    lines.push(ordered[0].text.slice(0, TYPE_ERRORS_MAX_CHARS));
    shown = 1;
  }

  const hidden = ordered.length - shown;
  const more = hidden > 0 ? `\n… and ${hidden} more error${hidden > 1 ? "s" : ""}.` : "";
  return `${HEADER}\n${lines.join("\n")}${more}\n${FOOTER}`;
}

/** `./lib/a.ts` and `lib/a.ts` are the same file; tsc and our tools do not
 * do not write the same. Comparison on a single form. */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

// ── The test suite, same gesture as type-check (MIN-251) ────────────────

/**
 * WHAT THE HARNESS DOES TEACHES HARDER THAN WHAT THE PROMPT SAYS.
 *
 * The prompt has always asked to “run the linter / type-check / build /
 * project tests”. The harness ONLY launched `tsc`. On the PR 48 run,
 * a 13.6-minute round that delivered a seven-file feature didn't run
 * TWO commands in total — one install and one `npm run typecheck` — without opening a
 * only one of the 209 test files in the repository. And the feature didn't work. The model
 * had seen the flaw in his own thinking, then classified it: "*that's
 * working as expected since type checks are passing*”. This is the conclusion
 * logic of what he saw being performed in his place, turn after turn.
 *
 * Hence this block, modeled exactly on type-check: detected, launched at the end
 * round when the repository was modified, with its failures put into context BEFORE
 * the model responds. Only one pass per turn — the turn must end, not spiral into
 * a correction loop.
 *
 * Same rules of silence, and for the same reason: no `test` script, no
 * binary installed, output unreadable, failure → `null`. A harness that would transform
 * an environment not installed as a chess wall would be worse than silent.
 */

/**
 * Suite wall budget. MEASURED in microVM (2 vCPU / 4.2 GB) on 2760
 * minddy tests: **80.5 s**, and — unlike `tsc` — the second pass costs
 * exactly the same price (also 80.5s, 81.2s with a red test). There is no
 * of “hot” dividend to hope for here: the figure to budget is this one.
 *
 * The local time is 4.4× (18.4 s on twelve cores): this is the measurement in the VM which
 * that counts, never the workstation's.
 */
export const TEST_TIMEOUT_MS = 240_000;
/**
 * Wall budget for a TARGETED passage (`vitest related` / `jest --findRelatedTests`).
 * The runner starts the same and only loads the subgraph of the affected files:
 * it's the startup that dominates, not the cases. Bounded much shorter than the rest
 * entire — a targeted passage that takes two minutes is no longer a targeted passage,
 * and letting him run would amount to paying for the sequel without having asked for it.
 */
export const TEST_RELATED_TIMEOUT_MS = 120_000;
/**
 * Minimum budget remaining on the chunk to launch the sequel (otherwise we keep quiet). Even
 * margin that the type-check on its own measurement (60 s for 22 s, ~2.7×): here 180 s
 * for 80s. A full chunk is worth 700s, and the worst spin pays both checks —
 * two type-checks and a continuation, i.e. ~125 s, a sixth of the chunk. This is the price
 * that we accept so that a round cannot end in red without saying so.
 */
export const TEST_MIN_BUDGET_MS = 180_000;
/** Same margin, on the budget of a targeted passage (~30 s measured at worst). */
export const TEST_RELATED_MIN_BUDGET_MS = 90_000;
/** Heading of the chess block returned to the model. Beyond that, he no longer reads, he suffers. */
export const TEST_FAILURES_MAX_CHARS = 3000;
/**
 * Lines kept by failure. A vitest or jest failure is a title, a
 * message, an expected/received diff and a position — then a source code snippet
 * that the model can reread itself. We keep the first, we throw away the second.
 */
const TEST_FAILURE_MAX_LINES = 8;

const TEST_HEADER = "Tests are failing after your changes, please fix:";
/** Same anti-loop reminder as type-check: a deposit that is already red should not
 * become the subject of the tour. */
const TEST_FOOTER =
  "If a failure is unrelated to what you changed (it was already there), do not fix it — say so in your reply.";

/** The repository's test suite, if it is launchable HERE AND NOW. */
export interface TestRunner {
  /** The `test` script of the package.json, as is (we launch it via `npm run`). */
  script: string;
  /** The binary it calls, verified present in `node_modules/.bin`. */
  bin: string;
}

/**
 * The binary that an npm script launches, or `null` if you can't tell. Pure, and
 * exported for testing: this is where what we refuse to guess is decided.
 *
 * We skip the environment assignments at the head (`NODE_ENV=test jest`), and we
 * REFUSES envelopes (`npm run test:unit`, `bash scripts/test.sh`, `node --test`):
 * behind, there is no binary to check, so no way to know if
 * environment is installed — and a `command not found` served as a failure
 * test would send the model looking for a bug that doesn't exist.
 */
export function testRunnerBin(script: string): string | null {
  // The default script for `npm init`. It comes out in 1 without having tested anything.
  if (/no test specified/i.test(script)) return null;
  const tokens = script.trim().split(/\s+/);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  const bin = tokens[0];
  if (!bin || !/^[\w.@/-]+$/.test(bin)) return null;
  const WRAPPERS = new Set([
    "npm", "pnpm", "yarn", "npx", "pnpx", "bun", "bunx", "deno",
    "node", "sh", "bash", "zsh", "make", "echo", "true", "exit",
  ]);
  return WRAPPERS.has(bin) ? null : bin;
}

/**
 * Does the repository have an ACTUALLY executable test suite? A `test` script in
 * `package.json` is not enough — without `node_modules`, its binary does not exist.
 * Best effort: any failure, any doubt → `null`, and nothing will be launched.
 */
export async function detectTestRunner(host: RepoHost): Promise<TestRunner | null> {
  try {
    const raw = await host.readFile(`${host.layout.repoDir}/package.json`);
    if (!raw) return null;
    const script = (JSON.parse(raw) as { scripts?: Record<string, unknown> }).scripts?.test;
    if (typeof script !== "string" || script.trim() === "") return null;
    const bin = testRunnerBin(script);
    if (!bin) return null;
    const res = await host.exec(`test -x ./node_modules/.bin/${bin}`, {
      cwd: host.layout.repoDir,
      timeoutMs: 30_000,
    });
    return res.exitCode === 0 ? { script, bin } : null;
  } catch {
    return null;
  }
}

/**
 * THE SCOPE OF THE PASSAGE, AND WHY IT IS NO LONGER ALWAYS “EVERYTHING” (MIN-262).
 *
 * `"full"` launches the entire suite — this is the guarantee of MIN-251, and it remains the
 * rule as soon as the change weighs: a test which breaks ELSEWHERE is precisely this
 * that we seek to see, it is the unmodified line which undoes the change.
 *
 * `{ related }` launches the TARGETED passage of the runner on the tour files. This is not
 * not "tests of these files": `vitest related` like `jest
 * --findRelatedTests` pull up the IMPORTS GRAPH and run any test that hits
 * these modules, transitively. “Breakage elsewhere” therefore remains covered wherever
 * it is traceable; what we lose is the test which reaches the code by a path that
 * static analysis does not see (a fixture, a file read at execution) — for
 * a line removed is a price that we pay against 80 s of wall each turn.
 *
 * `allowFullFallback` decides the case of the runner without targeted mode: `true`, we pay the
 * entire suite; `false`, we don't launch anything. The caller puts `false` when he has no
 * NOT the budget for an entire suite — otherwise a tiny turn would trigger, by the way,
 * tape, exactly the passage he was trying to avoid, and with no budget for him.
 */
export type TestScope =
  | "full"
  | { related: readonly string[]; allowFullFallback: boolean };

/** What a test run produced — the block, and what actually went wrong. */
export interface TestRunOutcome {
  /** The block to be used for the model, or `null` if the sequence is green / illegible. */
  block: string | null;
  /** What turned out FOR GOOD: Measurement should not read intent. */
  scope: "full" | "related";
}

/**
 * The command for a TARGETED passage, or `null` if this runner does not have one.
 *
 * Here we leave the `npm run test` of the project — deliberately, and this is the only
 * exception: targeted mode is a runner FLAG, and there is no safe way
 * to slip it into a script that we don't know (`npm run test -- related`
 * would give `vitest run related`, which looks for a file named “related”). We
 * therefore calls the binary, the same one that `detectTestRunner` verified as executable.
 *
 * `--passWithNoTests` / `--passWithNoTests`: a round that touches a file that no test
 * covers should return GREEN, not red — the absence of a test is not a failure, and
 * treating it as one would send the model looking for a bug that does not exist.
 */
export function relatedTestCommand(runner: TestRunner, files: readonly string[]): string | null {
  const paths = files.filter((f) => f.trim() !== "").map(sq);
  if (paths.length === 0) return null;
  const bin = `./node_modules/.bin/${runner.bin}`;
  if (runner.bin === "vitest") {
    return `${bin} related --run --passWithNoTests ${paths.join(" ")} 2>&1`;
  }
  if (runner.bin === "jest") {
    return `${bin} --findRelatedTests --passWithNoTests ${paths.join(" ")} 2>&1`;
  }
  return null;
}

/**
 * Runs the repository tests at the requested scope and renders what comes out, or `null`
 * if there is nothing launchable here and now.
 *
 * `CI=1` is not decorative: without it, a `vitest` script (without `run`) would go
 * in watch mode and would occupy the budget until the timeout without ever giving up.
 */
export async function testFailuresForTurn(
  host: RepoHost,
  scope: TestScope = "full",
): Promise<TestRunOutcome | null> {
  const runner = await detectTestRunner(host);
  if (!runner) return null;

  const related = scope === "full" ? null : relatedTestCommand(runner, scope.related);
  if (!related && scope !== "full" && !scope.allowFullFallback) return null;

  try {
    // Full suite: `npm run` rather than binary — what runs is the script
    // OF THE PROJECT, arguments included. `--silent` mutes npm's echo and its own
    // error report — the only text rendered is that of the runner.
    //
    // And the output is NOT filtered here (no `| tail`): on the RPC path,
    // a command that remains silent for a minute sees its socket closed by the other
    // other end (`UND_ERR_SOCKET: other side closed`, measured by calibrating these constants —
    // a `| tail` was enough to silence a consecutive run of 2,760 tests). A
    // runner who writes his progress holds the socket open; we leave it.
    const res = await host.exec(related ?? `npm run test --silent 2>&1`, {
      cwd: host.layout.repoDir,
      timeoutMs: related ? TEST_RELATED_TIMEOUT_MS : TEST_TIMEOUT_MS,
      env: { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const ran = related ? ("related" as const) : ("full" as const);
    // exitCode 0 = green: silence is the correct return.
    if (res.exitCode === 0) return { block: null, scope: ran };
    return { block: formatTestFailures(res.stdout + res.stderr), scope: ran };
  } catch {
    return null;
  }
}

// ── What the MODEL verified itself (MIN-262) ────────────────────────────

/**
 * THE GESTURE IS AUTHENTIC.
 *
 * MIN-251 put the rest in the harness because *what the harness does teaches
 * stronger than what the prompt says*: the model never launched the tests, and
 * concluded “*that's working as expected since type checks are passing*” on a
 * broken feature. The lesson carried - and the hook became a tax: 80 seconds of
 * wall plus an integer response, on a turn that removes a line.
 *
 * This register returns the decision to the model without making it PROMISE anything. He doesn't
 * does not declare what it intends to check: it checks, and the harness does not restart
 * what he has just seen turn green. A declaration would be unverifiable; A
 * `npm test` which comes out as 0 is a fact, dated, and the harness reads it by itself.
 *
 * The invariant, and it fits in one sentence: **green AFTER the last edition**.
 * Every edition expires the register - a trick which tests then re-edits finds the
 * hook, exactly as before.
 */
export interface VerificationSink {
  /**
   * The last repository test command that the MODEL issued and exited
   * in 0, if nothing has been edited since. `null` otherwise — and this is the default state.
   */
  greenCommand: string | null;
}

export function newVerificationSink(): VerificationSink {
  return { greenCommand: null };
}

/** Any edition expires verification: what was green is no longer green. */
export function noteVerificationStale(sink: VerificationSink): void {
  sink.greenCommand = null;
}

/**
 * Note the verdict of a model order. Only a RECOGNIZED test command and
 * GREEN fills the register; a red command empties it (the model has seen its failure,
 * if he doesn't correct it the hook must speak again).
 */
export function noteVerificationCommand(
  sink: VerificationSink,
  command: string,
  exitCode: number,
): void {
  if (!looksLikeTestCommand(command)) return;
  sink.greenCommand = exitCode === 0 ? command.trim() : null;
}

/** Runners recognized by their name, called directly or via `npx`. */
const TEST_BINS = new Set([
  "vitest", "jest", "mocha", "ava", "tap", "playwright", "cypress",
  "pytest", "phpunit", "rspec", "gotestsum",
]);

/**
 * Does this command run the repository tests? PURE, and deliberately AVARE:
 * a false positive silences the harness, that is to say it silences a
 * tour which did not verify anything. When in doubt, we do not recognize — the worst cost
 * of a false negative is a test that could have been avoided.
 *
 * Hence three clear refusals:
 * - anything that makes the exit code LIAR: `||`, `;`, a pipe, a `&`. Alone
 * the `&&` passes, because it propagates the failure - and we then only look at the
 * LAST segment, the only one whose exit code is that of the command.
 * - watch mode: it never returns control, so it concludes nothing.
 * - envelopes that we cannot read (`bash script.sh`, `make test`): we cannot
 * can't tell what's behind it.
 */
export function looksLikeTestCommand(command: string): boolean {
  const raw = command.trim();
  if (raw === "") return false;
  // A pipe returns the code of the last link, `;` does not propagate anything, `&` detaches, a
  // substitution hides everything. Only the `&&` survives — it propagates the failure.
  if (/[|;`]|\$\(|(?<!&)&(?!&)/.test(raw)) return false;
  if (/(^|\s)(--watch|-w)(\s|$)|--watch=|--ui(\s|$)/.test(raw)) return false;

  const last = raw.split("&&").pop()!.trim();
  const tokens = last.split(/\s+/);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  if (tokens.length === 0) return false;

  // `npx` / `pnpm exec` / `pnpm dlx`: what follows is what matters.
  if (["npx", "pnpx", "bunx"].includes(tokens[0])) tokens.shift();
  else if (["pnpm", "yarn", "bun", "npm"].includes(tokens[0]) &&
           ["exec", "dlx"].includes(tokens[1] ?? "")) tokens.splice(0, 2);

  const head = tokens[0] ?? "";
  const next = (tokens[1] ?? "").replace(/^--$/, "");

  // The project script: `npm test`, `npm t`, `pnpm run test:unit`, `yarn test`.
  if (["npm", "pnpm", "yarn", "bun"].includes(head)) {
    const script = next === "run" ? (tokens[2] ?? "") : next;
    return /^(test|t)(:[\w:-]+)?$/.test(script);
  }
  // `go test ./…`, `cargo test`, `python -m pytest`, `dotnet test`.
  if (["go", "cargo", "dotnet", "swift", "mix"].includes(head)) return next === "test";
  if (["python", "python3"].includes(head)) return tokens.includes("pytest");
  // The runner invoked by name, with or without a path (`./node_modules/.bin/vitest`).
  return TEST_BINS.has(head.split("/").pop() ?? "");
}

/** A failure as served: a normalized title and its body. */
export interface TestFailureEntry {
  /** `file > suite > test` (vitest), or the test name (jest). */
  title: string;
  /** The complete block, with a `FAIL …` title at the top. */
  text: string;
  /**
   * `"suite"` when the file could not be LOADED (the vitest “Failed Suites”
   * section): there is then no suite or test case, the title is the file, and
   * the failure represents an entire test file, not an assertion.
   */
  kind?: "suite";
}

/** ` FAIL  lib/a.test.ts > group > case` — the vitest form. The `>` distinguishes
 *  it from jest's `FAIL <file>`, which is only a file header. */
const VITEST_FAIL = /^\s*(?:❯\s*)?FAIL\s+(\S.*>.*\S)\s*$/;
/**
 * ` FAIL  lib/b.test.ts [ lib/b.test.ts ]` — the vitest form when the file
 * cannot be LOADED (missing import, module-level error): it has no suite or
 * case to name, so there is no `>`, and it does not resemble jest's
 * `FAIL <file>` because of the following `[ … ]`. Without this pattern, the
 * line matched nothing and the entire import-error body was discarded — the
 * model could not see the defect caused by its edit.
 */
const VITEST_SUITE_FAIL = /^\s*(?:❯\s*)?FAIL\s+(\S+)\s+\[\s*\S+\s*\]\s*$/;
/** Header of the section for files that could not be loaded (`⎯⎯ Failed Suites 1 ⎯⎯`). */
const VITEST_SUITES_HEADER = /^[\s⎯─=-]*Failed Suites\b/m;
/** `● group › case` — the jest form. `● Console` is not a failure. */
const JEST_FAIL = /^\s*●\s+(?!Console\b)(\S.*\S|\S)\s*$/;
/** `FAIL src/a.test.js` alone: file context for the following `●` lines. */
const JEST_FILE = /^\s*FAIL\s+(\S+)\s*$/;
/** The end summary: nothing beyond it belongs to a failure. */
const SUMMARY = /^\s*(Test Files|Tests|Test Suites:|Snapshots:|Duration|Start at)\b/;
/** Source-code excerpt (` 4|   expect(…)`, `  |     ^`): the model can reread
 *  the file, and these lines would bury the message. */
const CODE_FRAME = /^\s*(\d+\s*\||\|\s*\^)/;
/** Vitest separator lines (`⎯⎯⎯[1/2]⎯⎯⎯`). */
const RULE = /^[\s⎯─=-]*(\[\d+\/\d+\])?[\s⎯─=-]*$/;

/** Runner colors, when the output is not a terminal but still contains them. */
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/**
 * Splits runner output into failures. Vitest and jest are the two handled forms;
 * anything else falls back to the tail of the output (see `formatTestFailures`),
 * never to silence: a red suite we cannot parse remains a red suite, which is
 * exactly what this ticket refuses to let through.
 */
export function parseTestFailures(raw: string): TestFailureEntry[] {
  const entries: TestFailureEntry[] = [];
  let body: string[] = [];
  let file = "";
  let stopped = false;

  const push = (title: string, kind?: "suite") => {
    entries.push({ title, text: `FAIL ${title}`, ...(kind ? { kind } : {}) });
    body = [];
  };

  for (const line of raw.replace(ANSI, "").split("\n")) {
    if (SUMMARY.test(line)) {
      stopped = true;
      continue;
    }
    const vitest = VITEST_FAIL.exec(line);
    if (vitest) {
      stopped = false;
      push(vitest[1]);
      continue;
    }
    const suite = VITEST_SUITE_FAIL.exec(line);
    if (suite) {
      stopped = false;
      // Do NOT change `file`: this title names a file that failed to load; it does
      // not open a context for any following jest `●` entries.
      push(suite[1], "suite");
      continue;
    }
    const jest = JEST_FAIL.exec(line);
    if (jest) {
      stopped = false;
      push(file ? `${file} > ${jest[1]}` : jest[1]);
      continue;
    }
    const jestFile = JEST_FILE.exec(line);
    if (jestFile) {
      // File header: it names the following `●` entries; it is not a failure.
      file = jestFile[1];
      continue;
    }
    if (stopped || entries.length === 0) continue;
    const text = line.replace(/\s+$/, "");
    if (text.trim() === "" || CODE_FRAME.test(text) || RULE.test(text)) continue;
    if (body.length >= TEST_FAILURE_MAX_LINES) continue;
    body.push(text.trim());
    entries[entries.length - 1].text += `\n${text.trim()}`;
  }
  return entries;
}

/**
 * Renders the block served to the model: header, failures, capped at
 * `TEST_FAILURES_MAX_CHARS`.
 *
 * When nothing is parseable, we do NOT stay silent — we serve the tail of the
 * output. A suite that fails during import, an unknown runner, or a broken
 * config: the verdict is always at the end, and “red without details” is vastly
 * better than a round that ends believing the suite is green. The only exception
 * is the absence of tests, which is not a failure.
 */
export function formatTestFailures(raw: string): string | null {
  const clean = raw.replace(ANSI, "");
  const entries = parseTestFailures(clean);

  // The fallback does not rely only on `entries.length === 0`: output announcing
  // “Failed Suites” from which we extracted NO entries is the case where a real
  // failure would be hidden — a single assertion failure parsed elsewhere would
  // otherwise disable it, and the file that failed during import would be
  // reported nowhere.
  const suitesUnread = VITEST_SUITES_HEADER.test(clean) && !entries.some((e) => e.kind === "suite");

  if (entries.length === 0 || suitesUnread) {
    if (/No test files found|no tests found/i.test(clean)) return null;
    const tail = clean.trimEnd().slice(-TEST_FAILURES_MAX_CHARS).trimStart();
    if (tail.trim() === "") return null;
    return `${TEST_HEADER}\n${tail}\n${TEST_FOOTER}`;
  }

  // Files that failed to load come first: they represent an ENTIRE test file
  // failing, whereas a red assertion represents only one case. Vitest already
  // prints them first, but the cap must depend neither on that order nor on the
  // number of red assertions that might precede them in another runner.
  const ordered = [...entries.filter((e) => e.kind === "suite"), ...entries.filter((e) => !e.kind)];

  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of ordered) {
    // Stop BEFORE exceeding the cap: a failure cut in the middle would make the
    // model read a truncated path or message.
    if (used + entry.text.length + 1 > TEST_FAILURES_MAX_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length + 1;
    shown++;
  }
  // The cap is reached on the first failure: serve it anyway, truncated — better
  // than an empty block that would say “everything is fine”.
  if (lines.length === 0) {
    lines.push(ordered[0].text.slice(0, TEST_FAILURES_MAX_CHARS));
    shown = 1;
  }

  const hidden = entries.length - shown;
  const more = hidden > 0 ? `\n… and ${hidden} more failing test${hidden > 1 ? "s" : ""}.` : "";
  return `${TEST_HEADER}\n${lines.join("\n")}${more}\n${TEST_FOOTER}`;
}
