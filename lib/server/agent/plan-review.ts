import { headTail } from "./prune";
import { sq, type RepoHost } from "./repo-host";

/**
 * SELF-READING OF A PLAN (MIN-237) — the counterpart, for a document, of what
 * `self-review.ts` made for a diff.
 *
 * A trick that modifies files receives two things before returning control:
 * typing errors (`diagnostics.ts`) and its own diff to reread from start to finish
 * end (`self-review.ts`). A `intent: plan` round doesn't change any files, so
 * both are silent: he writes his document and responds. This is the ONLY release of
 * the agent who has no time for proofreading, even though it is the one someone
 * will build on next.
 *
 * What it cost, measured on run `ada40ec9` (MIN-226): a task
 * "check `components/secondary-sidebar.tsx`" written to a file that run
 * had read it THREE TIMES without finding anything to change; an open `loading.tsx` and
 * never resumed work; and a verification step that promised
 * `npm run lint`, script which does not exist in this repository — `package.json` not having
 * never been opened.
 *
 * Of these three defects, ONLY ONE is mechanically decidable, and it is this one that
 * the harness slice: the orders that the plan names are confronted with the
 * `scripts` of `package.json` of the repository. The other two insist that the
 * model knows for its OWN turn — which files it has opened, what question it
 * has already been resolved — and the harness knows nothing about it. So there remain QUESTIONS,
 * asked when they can still be used: before the response.
 *
 * Twin of `plan-closure.ts` (MIN-236), which attacks the same hole from the
 * completeness rather than rereading. Both are useful separately, and on
 * a turn of plan they use one after the other - cf. chain order
 * the `gateWritePlan` gate (delivery-gate.ts).
 */

/** Minimum wall budget remaining to serve proofreading. Same threshold as
 * closing: we are not launching anything costly (a reading of a manifesto), but we must
 * give the model something to reread his plan and correct it. */
export const PLAN_REVIEW_MIN_BUDGET_MS = 45_000;
/** Wall budget of the `package.json` probe. Large for a `head` on a file. */
export const PLAN_REVIEW_TIMEOUT_MS = 15_000;
/**
 * Cap of the plan reinjected. Elision by the MIDDLE (`headTail`), like the diff: the
 * context is at the head, the verification step is at the tail, and these are the two
 * ends that the questions ask. A plan of more than 12,000 characters is
 * in any case a plan that no one will reread in one go.
 */
export const PLAN_REVIEW_MAX_CHARS = 12_000;

/** Scripts listed in the block (beyond that, we say how many are left). */
const SCRIPTS_SHOWN = 24;
/** Missing orders listed (beyond that, plan has another problem). */
const MISSING_SHOWN = 6;
/** Reading course for the manifesto. A `package.json` is a manifest; this cape does not
 * limits only a pathological deposit, where the probe will be silent for lack of valid JSON. */
const PKG_MAX_BYTES = 131_072;
/** Separator of the two halves of the probe. On his own line he cannot
 * appear in JSON: a JSON string does not contain a bare line break. */
const WORKSPACE_MARK = "@@workspace";

/** What the depot knows about its orders. */
export interface RepoScripts {
  /** The names of `scripts` of the `package.json` ROOT, in file order. */
  names: string[];
  /**
   * Does the repository look like a monorepo (`workspaces`, `pnpm-workspace.yaml`)?
   *
   * This flag only serves to KEEP QUIET: in a monorepo, a script missing from the
   * root can live very well in a bundle, and the harness has no way of
   * slice. He then lists what he knows instead of accusing — an observation
   * A false one costs much more than the observation that was not made.
   */
  workspace: boolean;
}

// ── What the plan promises ────────────────────────── ──────────────────────────

/**
 * A `package.json` script invoked by a package manager.
 *
 * Only EXPLICIT forms (`npm run x`, `pnpm run x`, `yarn run x`) are
 * read: `pnpm x` in short is ambiguous — `pnpm add`, `pnpm dlx`, `pnpm install`
 * are not scripts, and getting it wrong here would cause the harness to say that a script
 * missing where there never was.
 */
const RUN_SCRIPT = /\b(?:npm|pnpm|yarn|bun)\s+(?:run|run-script)\s+([A-Za-z0-9:@._/-]+)/g;
/** `npm test` is the only shortcut that really targets a manifest script (and
 * which fails loudly if missing). `npm start` falls back on `server.js`. */
const NPM_TEST = /\bnpm\s+test\b/;

/**
 * The scripts that the plan promises to run, in document order.
 *
 * Code blocks are READ here, unlike `planNeedles` (plan-closure.ts)
 * who throws them: there a block is a snippet of code to write, here it is
 * the very place where the verification step writes its commands.
 */
export function planCommands(plan: string): string[] {
  const out: string[] = [];
  const push = (name: string): void => {
    // `npm run -- --flag`: a flag is not a script name.
    if (!name || name.startsWith("-") || out.includes(name)) return;
    out.push(name);
  };
  for (const m of plan.matchAll(RUN_SCRIPT)) push(m[1]);
  if (NPM_TEST.test(plan)) push("test");
  return out;
}

// ── What the repository offers ────────────────────────── ──────────────────────────

/**
 * ONE command for both halves of the probe: the root manifest, then the
 * presence of a pnpm workspace file. One `host.exec` per question
 * would cost a network round trip each from the function (the engine outside
 * microVM talks to the sandbox over the network).
 */
export function buildScriptsCommand(): string {
  return `head -c ${PKG_MAX_BYTES} package.json 2>/dev/null || true; printf '\\n%s\\n' ${sq(WORKSPACE_MARK)}; ls pnpm-workspace.yaml pnpm-workspace.yml 2>/dev/null || true`;
}

/** Rereads the probe, or `null` if the repository does not have a readable manifest — in which case
 * the question of controls remains a question, without an answer from the harness. */
export function parseScriptsProbe(stdout: string): RepoScripts | null {
  const at = stdout.lastIndexOf(`\n${WORKSPACE_MARK}\n`);
  const json = at >= 0 ? stdout.slice(0, at) : stdout;
  const tail = at >= 0 ? stdout.slice(at + WORKSPACE_MARK.length + 2) : "";

  let pkg: unknown;
  try {
    pkg = JSON.parse(json);
  } catch {
    return null;
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return null;

  const scripts = (pkg as { scripts?: unknown }).scripts;
  const names =
    scripts && typeof scripts === "object" && !Array.isArray(scripts)
      ? Object.keys(scripts as Record<string, unknown>)
      : [];
  return {
    names,
    workspace: (pkg as { workspaces?: unknown }).workspaces != null || tail.trim().length > 0,
  };
}

// ── The block used for the model ───────────────────────── ─────────────────────────

const HEADER = `Before you reply: here is the plan you just wrote, read back to you. Nothing else in this turn re-reads it, and someone is going to build on it.`;

const QUESTIONS = `Read it as its reader will — with your plan and none of your context:
- does every task name code you actually opened this turn? A path you inferred but never read is a guess, and a plan is read as a statement of fact.
- does a task say "check whether X" or "verify X" where you already know the answer? You looked — write the finding, not the errand. A task that re-asks a question you already answered makes the next run redo your work.
- does the verification step name commands that exist in this repo?
- did you open a file this turn that no task mentions? Decide which it is: it belongs in the plan, or it does not.`;

const FOOTER = `Fix what needs fixing IN PLACE: \`edit_issue_text\` rewrites one passage (old_string → new_string), \`append_to_plan\` adds a task or a note. Do NOT call \`write_issue_plan\` again — it re-emits the whole document and would drop anything changed meanwhile. If the plan holds up, carry on — do not restate it, and do not announce that you re-read it.`;

/** `\`a\`, \`b\`, \`c\`.` — the list of scripts, capped. */
function scriptList(names: readonly string[]): string {
  const shown = names.slice(0, SCRIPTS_SHOWN);
  const hidden = names.length - shown.length;
  return `${shown.map((n) => `\`${n}\``).join(", ")}${hidden > 0 ? `, … and ${hidden} more` : ""}.`;
}

/**
 * The fence that wraps the plan without being closed by it.
 *
 * A plan contains code blocks — the verification step is one, and it is exactly
 * what the questions inspect. A three-backtick fence would therefore be CLOSED
 * by the plan itself, and everything after the first block (the rest of the plan,
 * the verdict, and the questions) would be read as code. CommonMark's rule is to
 * use a fence longer than the longest one it contains.
 */
function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * What the harness has to say about the plan's commands, or `""` if it has nothing to say
 * say. Four cases, and silence is one of them: without a legible manifesto, the
 * question remains posed to the model without answer — better that than an answer
 * invented.
 */
function commandsVerdict(named: readonly string[], scripts: RepoScripts | null): string {
  if (!scripts) return "";

  // Monorepo: a script missing from the root can live in a package. We list it;
  // we do not accuse.
  if (scripts.workspace) {
    if (scripts.names.length === 0) return "";
    return `This repo's root \`package.json\` declares workspaces, so the harness cannot tell where a script lives. Its ROOT scripts are: ${scriptList(scripts.names)}`;
  }

  const missing = named.filter((name) => !scripts.names.includes(name));
  if (missing.length > 0) {
    const shown = missing.slice(0, MISSING_SHOWN);
    const hidden = missing.length - shown.length;
    const list = shown.map((name) => `- \`npm run ${name}\` — there is no \`${name}\` script.`);
    return `The harness read the repo's \`package.json\`. Your plan promises commands that do not exist:\n${list.join("\n")}${
      hidden > 0 ? `\n… and ${hidden} more.` : ""
    }\n\nThe scripts this repo actually has: ${
      scripts.names.length > 0 ? scriptList(scripts.names) : "none at all."
    }`;
  }

  if (named.length > 0) {
    return `The harness read the repo's \`package.json\`: every command your plan names exists there. Nothing to fix on that one.`;
  }

  if (scripts.names.length === 0) return "";
  return `Your plan names no command to run. The repo's \`package.json\` offers: ${scriptList(scripts.names)}`;
}

/**
 * The rereading block, or `null` if there is no plan to reread.
 *
 * Always used when a plan has been written, where `formatPlanClosure` is silent
 * when she found nothing: the closure is an OBSERVATION (no observation,
 * no block), rereading is a MOMENT — the one that was missing. A correct difference
 * also comes back to the model.
 *
 * PUR: the sandbox is read by the caller, as `formatTypeErrors` and
 * `formatSelfReview`, so that the headings and formulation can be tested without microVM.
 */
export function formatPlanReview(input: {
  /** The markdown of the plan writes this round (additions and corrections of the same round included). */
  plan: string;
  /** What the probe returned, or `null` if the repository does not have a readable manifest. */
  scripts?: RepoScripts | null;
}): string | null {
  const plan = input.plan.trim();
  if (!plan) return null;

  const verdict = commandsVerdict(planCommands(plan), input.scripts ?? null);
  const shown = headTail(plan, PLAN_REVIEW_MAX_CHARS);
  const fence = fenceFor(shown);
  return [
    HEADER,
    `${fence}markdown\n${shown}\n${fence}`,
    ...(verdict ? [verdict] : []),
    QUESTIONS,
    FOOTER,
  ].join("\n\n");
}

// ── The impure hook ──────────────────────────── ─────────────────────────────

/**
 * Probes the repository and returns the replay block, or `null` if the plan is empty.
 *
 * The probe is best-effort — no repository, no `package.json`, unreadable JSON,
 * timeout → the block leaves WITHOUT the verdict on the commands. It's not a
 * silent degradation: the question of commands is written in the block, and
 * it simply becomes a question again that the model must decide for itself.
 */
export async function planReviewForTurn(host: RepoHost, plan: string): Promise<string | null> {
  let scripts: RepoScripts | null = null;
  try {
    const res = await host.exec(buildScriptsCommand(), {
      cwd: host.layout.repoDir,
      timeoutMs: PLAN_REVIEW_TIMEOUT_MS,
    });
    if (res.exitCode === 0) scripts = parseScriptsProbe(res.stdout);
  } catch {
    // Rereading is worth serving without its verdict.
  }
  return formatPlanReview({ plan, scripts });
}
