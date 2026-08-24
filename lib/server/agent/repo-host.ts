import {
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  parseBackgroundProbe,
  BACKGROUND_FETCH_BYTES,
  type BackgroundChunk,
  type BackgroundJobRunner,
  type BackgroundPaths,
} from "./background";
import { grepPathspecs, globPathspecs, expandBraces } from "./git-pathspec";
import { isInvalidRegexError, looksLikeIntendedAlternation } from "./grep-pattern";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";
import type { HarnessLayout } from "./harness-layout";

/**
 * Agent's HANDS on the repository — clone, read, edit, search, jobs
 * background, commit and push. Everything the harness does to the microVM disk.
 *
 * WHY THIS MODULE EXISTS, and it is the pivot of MIN-224. These gestures were
 * written against the `Sandbox` object of the Vercel SDK, therefore against an RPC round trip:
 * `runShell(sandbox, "git status")` leaves the function, crosses the Atlantic,
 * returns. When the loop goes INTO the microVM, they are exactly the same
 * gestures — but on the local disk, by `child_process` and `fs`.
 *
 * Nothing written here is transportation dependent. A `git grep` remains a
 * `git grep`, `resolveWithin` refuses the same `../..` on both sides. Hence the
 * form: **four primitives** (`exec`, `readFile`, `writeFile`, `mkdir`), and
 * all the logic above, written ONE time for both worlds.
 *
 * - the RPC adapter lives in [sandbox.ts](sandbox.ts) (`sandboxHost`);
 * - the local adapter lives in [vm/local-host.ts](vm/local-host.ts), and is not
 * loaded ONLY in the VM.
 *
 * This file therefore imports NO SDK, and it is an invariant held by
 * `vm-bundle-secrets.test.ts`: it goes into the microVM bundle.
 */

/** microVM runtime. */
export const SANDBOX_RUNTIME = "node24";

/**
 * READABLE folders outside repository (read_file / grep / list_dir). Never writable.
 *
 * A FUNCTION of the layout since MIN-354, and no longer a constant: these folders
 * are those OF THE RUN, and two runs on the same machine are not the same.
 */
function readableDirs(layout: HarnessLayout): string[] {
  return [layout.toolOutputDir];
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ShellOptions {
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
}

/**
 * The four primitives, and nothing else. Everything this module does at the repository
 * passes through there — that's what makes the rest of the file transport-independent.
 */
export interface RepoHost {
  /**
   * WHERE THIS HOST WORKS (MIN-354). A host is a disk — and since that
   * disk can be that of a Mac shared by two runs, its address is a
   * VALUE of the run and no longer a module constant.
   *
   * It travels here rather than in argument of the thirty functions below, which
   * already take the host as the first parameter: it's the same fact, says one
   * times. `layout.repoDir` is in particular the security root that
   * `resolveWithin` and `assertNotGit` compare.
   */
  readonly layout: HarnessLayout;
  /** `sh -c <command>`. `cwd` is `layout.repoDir` by default (the tools operate in the repository). */
  exec(command: string, opts?: ShellOptions): Promise<ShellResult>;
  /** UTF8 content, or null if the file does not exist. */
  readFile(absPath: string): Promise<string | null>;
  /** Create or overwrite. The parent folders are assumed to exist (see `mkdir`). */
  writeFile(absPath: string, content: string): Promise<void>;
  /** `mkdir -p`. Don't throw if the folder already exists. */
  mkdir(absPath: string): Promise<void>;
}

/** Safe quote to insert a value into a `sh -c` command. */
export function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * GIT IDENTITY, SET PER COMMAND AND NEVER PERSISTED (MIN-358).
 *
 * `git config user.email` writes to `.git/config`. In a disposable clone this
 * has no consequence; in the user's repository — local-repository mode — it
 * permanently rewrites THEIR identity for all subsequent commits (measured).
 * `git -c` does the same for only the following command, making the question
 * irrelevant in both modes.
 *
 * A command fragment, rather than an environment: that is what `RepoHost.exec`
 * can transport.
 */
export function gitIdentityFlags(committer: { name: string; email: string }): string {
  return `-c ${sq(`user.email=${committer.email}`)} -c ${sq(`user.name=${committer.name}`)}`;
}

/**
 * WORKING-CLONE HISTORY WINDOW, in days (MIN-267).
 *
 * The clone used to be `--depth 1`: ONE grafted commit, with no parent. Enough
 * to edit and diff against the base — but a run whose work IS the history
 * ("audit what changed since the last report", "review the week's commits")
 * had nothing to read, and returned an empty report while believing the
 * repository was empty. This happened in the security-audit routine.
 *
 * Hence a time window rather than a depth: `--shallow-since` bounds the clone
 * by what HAS HAPPENED, not by a number of commits. In this repository, 50
 * commits cover only two days; six months cover everything a monthly routine
 * needs, and the cost remains bounded by activity in the window — not by the
 * total repository size, which keeps growing.
 *
 * Measured cost in this repository (682 commits, all within the window, so the
 * worst case is a COMPLETE clone): 33 MB → 97 MB, and 1.5 s → 4 s. This is paid
 * only when creating a new microVM — waking a snapshot does not re-clone.
 */
export const HISTORY_WINDOW_DAYS = 180;

/** Clone's `--shallow-since` bound, as a short ISO date (UTC). */
export function historySince(now: Date = new Date()): string {
  const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return since.toISOString().slice(0, 10);
}

/**
 * Clone the repository (shallow) on `baseBranch` into the layout repository,
 * then check out `workBranch`: resume the remote branch if it already exists
 * (the run pushed WIP in a previous chunk), otherwise create it from the base.
 * In an untrusted sandbox, `authUrl` is deliberately a credential-free forge
 * URL (Vercel) or a repository-scoped runner relay URL (self-hosted). Desktop
 * local execution may still supply an authenticated URL on the user's machine.
 *
 * The clone uses the history window described above, and `--single-branch` is
 * EXPLICIT: `--depth` implied it, and `--shallow-since` does so in practice,
 * but `resolveBaseRef` ([working-diff.ts](working-diff.ts)) relies on there
 * being only ONE remote ref — this belongs in the command, not as a side
 * effect. Resuming the work branch uses the SAME bound: `--depth 1` would graft
 * onto its tip and cut off the history again, while the base itself is deep.
 *
 * GIT IDENTITY IS NO LONGER WRITTEN TO `.git/config` (MIN-358). It travels to
 * the commit, where `commitAndPush` sets it with `git -c`. In a disposable
 * clone, persisting it had no consequence; the operation was nevertheless the
 * same one that, in the user's repository, rewrites THEIR identity for all
 * subsequent commits (measured). An operation kept in one place cannot leak
 * into the other mode.
 */
export async function cloneRepo(
  host: RepoHost,
  opts: {
    authUrl: string;
    baseBranch: string;
    workBranch: string;
  },
): Promise<void> {
  const { root, repoDir } = host.layout;
  // The run root is created here, not merely cleaned: in a microVM it already
  // exists (it is the Sandbox home), but on an ordinary machine it does not.
  await host.mkdir(root).catch(() => {});
  const wipe = await host.exec(`rm -rf ${sq(repoDir)}`, { cwd: root });
  if (wipe.exitCode !== 0) throw new Error(`cleanup failed: ${wipe.stderr || wipe.stdout}`);

  const since = historySince();
  const clone = await host.exec(
    `git clone --shallow-since=${sq(since)} --single-branch --branch ${sq(opts.baseBranch)}` +
      ` ${sq(opts.authUrl)} ${sq(repoDir)}`,
    { cwd: root, timeoutMs: 180_000 },
  );
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);

  const setup = [
    `set -e`,
    `if git ls-remote --exit-code --heads ${sq(opts.authUrl)} ${sq(opts.workBranch)} >/dev/null 2>&1; then`,
    `  git fetch --shallow-since=${sq(since)} ${sq(opts.authUrl)} ${sq(opts.workBranch)}:${sq(opts.workBranch)}`,
    `  git checkout ${sq(opts.workBranch)}`,
    `else`,
    `  git checkout -b ${sq(opts.workBranch)}`,
    `fi`,
  ].join("\n");
  const branch = await host.exec(setup, { timeoutMs: 120_000 });
  if (branch.exitCode !== 0) throw new Error(`branch setup failed: ${branch.stderr || branch.stdout}`);
}

/**
 * Clone the repository to REVIEW a pull request (MIN-168): base first, then
 * the PR head, READ-ONLY — no work branch is created, and nothing is committed
 * or pushed from this microVM.
 *
 * The head is found by its **server ref** (`refs/pull/<n>/head` on GitHub,
 * `refs/merge-requests/<iid>/head` on GitLab), not by branch name: for a FORK
 * PR, `head_branch` does not exist in the base repository, and fetching it
 * would find nothing — the agent would land on the base, with no diff, and
 * review emptiness while believing it was reviewing the PR. The server ref
 * points to the head commit wherever it comes from.
 *
 * Fall back to the branch name when the ref does not exist (mirror repository,
 * instance that does not publish it); fail explicitly if both are missing,
 * rather than running a silent session on the wrong reference.
 *
 * The clone remains shallow: `git diff <base>` works (it is a tree diff), but
 * three-dot diffs and a deep `git log` have no common history to traverse — the
 * prompt tells the agent so.
 *
 * Hence `baseSha` (MIN-258), which makes the diff CORRECT. Without it, only
 * `git diff origin/<base>` remains, comparing against the LIVE base tip: a
 * commit merged into the base since the PR opened appears REVERSED, as if the
 * pull request had reverted it — and a review then posts public remarks on code
 * untouched by the PR. `baseSha` is the base of the diff served by the FORGE
 * (`getMergeBaseSha`: the live merge base on GitHub, `diff_refs.base_sha` on
 * GitLab): we fetch it into the clone at depth 1 — one commit, under a second —
 * and mark it with the `PR_BASE_TAG` tag. From then on, `git diff pr-base` IS the
 * pull request's change, and counts exactly the same files as the bootstrap's
 * "Files changed" list.
 *
 * Best-effort, deliberately: this fetch is not a clone prerequisite. If it
 * fails (unreachable SHA, instance refusing a SHA-based `want`), the session
 * still runs — the prompt then describes the `origin/<base>` fallback and what
 * it means. A review that does not start costs more than a cautious review.
 */
/** Tag marking the base of the forge-served diff in the review clone. */
export const PR_BASE_TAG = "pr-base";
export async function clonePullRequest(
  host: RepoHost,
  opts: {
    authUrl: string;
    baseBranch: string;
    /** Server ref for the head (see `pullRequestHeadRef`). */
    headRef: string;
    /** Head branch name, when known: the fallback. */
    headBranch: string | null;
    /** Local name under which the head is checked out. */
    localBranch: string;
    /** Base of the diff served by the forge, to mark as `pr-base` (see header). */
    baseSha?: string | null;
  },
): Promise<void> {
  const { root, repoDir } = host.layout;
  await host.mkdir(root).catch(() => {});
  const wipe = await host.exec(`rm -rf ${sq(repoDir)}`, { cwd: root });
  if (wipe.exitCode !== 0) throw new Error(`cleanup failed: ${wipe.stderr || wipe.stdout}`);

  const clone = await host.exec(
    `git clone --depth 1 --branch ${sq(opts.baseBranch)} ${sq(opts.authUrl)} ${sq(repoDir)}`,
    { cwd: root, timeoutMs: 180_000 },
  );
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);

  const fallback = opts.headBranch?.trim()
    ? [
        `  echo "head ref ${opts.headRef} unavailable, falling back to the branch" >&2`,
        `  git fetch --depth 1 ${sq(opts.authUrl)} ${sq(`${opts.headBranch.trim()}:${opts.localBranch}`)}`,
      ]
    : [`  exit 1`];
  const setup = [
    `set -e`,
    // NO IDENTITY IS SET HERE (MIN-358). There used to be a “neutral” one,
    // based on the claim that git would refuse some index operations without it:
    // measured false — in a repository with no identity at all (local, global,
    // or system), `fetch`, `checkout`, `tag -f`, and `show` all work. And nothing
    // is committed here, by construction.
    `if git fetch --depth 1 ${sq(opts.authUrl)} ${sq(`${opts.headRef}:${opts.localBranch}`)} 2>/dev/null; then`,
    `  :`,
    `else`,
    ...fallback,
    `fi`,
    `git checkout ${sq(opts.localBranch)}`,
  ].join("\n");
  const head = await host.exec(setup, { timeoutMs: 120_000 });
  if (head.exitCode !== 0) {
    throw new Error(`pull request checkout failed: ${head.stderr || head.stdout}`);
  }

  // SHA VALIDATED before entering a shell: it comes from a forge API, and `sq`
  // alone would be enough, but a ref that is not a SHA has no place here anyway
  // — a branch name would produce a tag that moves under the agent.
  const baseSha = opts.baseSha?.trim() ?? "";
  if (!/^[0-9a-f]{7,64}$/i.test(baseSha)) return;
  const anchor = await host.exec(
    [
      `set -e`,
      `git fetch --depth 1 ${sq(opts.authUrl)} ${sq(baseSha)}`,
      `git tag -f ${sq(PR_BASE_TAG)} ${sq(baseSha)}`,
    ].join("\n"),
    { timeoutMs: 120_000 },
  );
  if (anchor.exitCode !== 0) {
    // Not a session failure: the prompt can describe the fallback. But say so,
    // otherwise a degraded review is indistinguishable from an exact one.
    console.error(
      `[agent] pr base anchor unavailable (${baseSha}): ${anchor.stderr || anchor.stdout}`,
    );
  }
}

/**
 * SHA of the BASE tip as reported by the clone (`refs/remotes/origin/<base>`,
 * created by `git clone --branch <base>` and unchanged after resuming a work
 * branch). This is the comparison point for the work detector below.
 *
 * Returns "" if the ref cannot be read (unexpected clone shape): the caller
 * then pushes as before — when in doubt, we never risk keeping work off the
 * remote.
 */
async function baseTipSha(host: RepoHost, baseBranch: string): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse --verify ${sq(`refs/remotes/origin/${baseBranch}`)}`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Stage everything, commit if there are changes, then push HEAD → workBranch.
 * Call on every suspend and at the end (the repository state becomes durable in
 * Git). In sandbox mode the caller refreshes trusted network authentication
 * first and passes the unchanged safe remote URL; desktop-local mode may pass a
 * freshly authenticated URL directly.
 *
 * NO BRANCH FOR NOTHING (MIN-123): `git push HEAD:refs/heads/<branch>` CREATES
 * the remote branch even when the tree is clean — at the base SHA. A session
 * that touches no files (question, plan, verification) therefore left an empty
 * branch in the user's repository. Hence the detector: if, after the conditional
 * commit, HEAD is STILL at the base tip, the branch has nothing to say and we do
 * not push at all (`pushed: false`). As soon as a commit exists — the only signal
 * that “code changed”, since `git add -A` sees only tracked content — we push as
 * before: pushed WIP remains the durable safety net beyond the microVM snapshot.
 *
 * Returns the HEAD SHA, whether a commit was created, whether a push happened,
 * and especially `remoteUpdated`: did the push ADVANCE the remote branch? This
 * is THE signal that “real work just arrived on the remote” — more reliable than
 * `committed`, which sees only the current call: a commit from an earlier call
 * whose push failed (transient 5xx) has a CLEAN tree on the next push
 * (`committed=false`), while a purely conversational turn pushes a no-op (the
 * remote is already current). Decisions such as “reopen the rejected PR” must
 * use `remoteUpdated`.
 */
export async function commitAndPush(
  host: RepoHost,
  opts: {
    authUrl: string;
    workBranch: string;
    baseBranch: string;
    message: string;
    /**
     * Git identity for the agent's commits, set PER COMMAND (MIN-358) rather
     * than written to `.git/config` during cloning. It must be attributable to a
     * real forge account (the App's bot on GitHub), otherwise Vercel blocks the
     * deployment.
     */
    committer: { name: string; email: string };
  },
): Promise<{ committed: boolean; remoteUpdated: boolean; headSha: string; pushed: boolean }> {
  const status = await host.exec(`git status --porcelain`);
  const dirty = status.stdout.trim().length > 0;

  if (dirty) {
    const staged = await host.exec(`git add -A`);
    if (staged.exitCode !== 0) throw new Error(`git add failed: ${staged.stderr || staged.stdout}`);
    const commit = await host.exec(
      `git ${gitIdentityFlags(opts.committer)} commit -m ${sq(opts.message)}`,
    );
    if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const head = await host.exec(`git rev-parse HEAD`);
  const headSha = head.stdout.trim();

  // Nothing committed above the base: no branch to create on the remote.
  // `!dirty` is redundant (a commit necessarily advances HEAD) but kept
  // explicitly: this path must NEVER be able to stash a commit.
  const baseSha = await baseTipSha(host, opts.baseBranch);
  if (!dirty && baseSha && baseSha === headSha) {
    return { committed: false, remoteUpdated: false, headSha, pushed: false };
  }

  // Current SHA of the remote branch (empty if it does not exist yet). Best-
  // effort: if ls-remote fails, assume the remote is behind (remoteUpdated will
  // be true if the push succeeds) — an extra reopen is better than pushed work
  // without reopening its rejected PR.
  const remote = await host.exec(
    `git ls-remote ${sq(opts.authUrl)} ${sq(`refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 60_000 },
  );
  const remoteSha = remote.exitCode === 0 ? remote.stdout.trim().split(/\s/)[0] ?? "" : "";

  const push = await host.exec(
    `git push ${sq(opts.authUrl)} ${sq(`HEAD:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return { committed: dirty, remoteUpdated: remoteSha !== headSha, headSha, pushed: true };
}

// ── Per-turn diff (event `files_changed`, MIN-46) ────────────────────────────

/**
 * THE SCOPE OF A TURN WHEN THE REPOSITORY IS NOT OURS (MIN-358).
 *
 * The three reads below compare a ref with the WORKING TREE. In a microVM, this
 * tree contains only the agent's work, so the issue does not arise. In the user's
 * checkout, it also contains THEIRS: without a bound, end-of-turn self-review
 * returns their own WIP as if it came from the model, and targeted tests run on
 * their files.
 *
 * `undefined` = no bound, exactly the previous behavior. An EMPTY list, on the
 * other hand, bounds to nothing at all — which is correct: a turn that touched
 * no files has no diff, whatever else is in the tree.
 */
export type TurnScope = readonly string[] | undefined;

/** The `-- <paths>` part of a git command, or "" when nothing bounds it.
 * `:(literal)` is not needed: these paths come from git itself, not the model. */
function pathspec(scope: TurnScope): string {
  if (scope === undefined) return "";
  // An impossible pathspec rather than no pathspec: `-- ` alone would be read as
  // “everything”, the opposite of what an empty list requests.
  if (scope.length === 0) return ` -- ${sq(":(exclude)*")}`;
  return ` -- ${scope.map(sq).join(" ")}`;
}

/** Maximum number of files listed in a `files_changed` event (bounded large turn). */
export const CHANGED_FILES_CAP = 100;

/** A file changed over a git interval. Defined HERE: this module (server AND
    microVM) does not depend on the client layer `lib/agent-api.ts` ("use client").
    Same shape. */
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  previousPath?: string;
}

/** Current repository HEAD (SHA), or "" if indeterminate. Best-effort — never throws. */
export async function revParseHead(host: RepoHost): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse HEAD`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Resolves the FINAL path from a `git diff --numstat` path field, which compacts
 * renames (`a => b`, `{a => b}`, `pre/{a => b}/post`) — whereas `--name-status`
 * gives clean tab-separated paths. Used only to index counters by final path.
 */
function numstatNewPath(field: string): string {
  const brace = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) {
    const [, pre, , newMid, post] = brace;
    return `${pre}${newMid}${post}`.replace(/\/{2,}/g, "/");
  }
  const arrow = field.split(" => ");
  return (arrow.length === 2 ? arrow[1] : field).trim();
}

/**
 * The turn's TEXT diff, for end-of-turn self-review (self-review.ts): the patch
 * from `fromSha` to the working tree — both work already pushed as WIP midway
 * through the chunk AND work not yet committed — plus raw `git status --porcelain`
 * output, which reveals added files (ignored by `git diff` until tracked).
 *
 * READ-ONLY: neither `add` nor `add -N`. The index belongs to the end of the
 * turn, which stages and commits alone — an add intent placed here would end up
 * in someone else's commit.
 *
 * Best-effort, like `changedFiles`: any error returns empty strings rather than
 * preventing a turn from finishing.
 */
export async function turnDiff(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ diff: string; porcelain: string }> {
  const only = pathspec(scope);
  const [diff, porcelain] = await Promise.all([
    fromSha
      ? host
          .exec(`git diff ${sq(fromSha)}${only}`, { timeoutMs: 30_000 })
          .then((r) => (r.exitCode === 0 ? r.stdout : ""))
          .catch(() => "")
      : Promise.resolve(""),
    host
      .exec(`git status --porcelain${only}`, { timeoutMs: 30_000 })
      .then((r) => (r.exitCode === 0 ? r.stdout : ""))
      .catch(() => ""),
  ]);
  return { diff, porcelain };
}

/**
 * THE TURN'S SIZE, TO SIZE ITS CHECKS (MIN-262) — not its content: this returns
 * neither a patch nor status, only enough to answer “is this turn small enough
 * for one pass of TARGETED tests?”
 *
 * `files` contains ONLY files that still exist (`--diff-filter=d`): this is the
 * list passed to `vitest related`, and a deleted path has no meaning there.
 * `lines` counts everything, including deletions — this is the change's weight.
 *
 * `untracked` is returned separately and weighs heavily for the caller: a NEW
 * file is new behavior, precisely what no existing test covers (MIN-251). A
 * turn that creates one is never “small”, whatever its line count.
 *
 * Best-effort like `turnDiff`: any error returns an UNKNOWN turn size (`null`),
 * and the caller falls back to the full check.
 */
export async function turnDiffStat(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ files: string[]; lines: number; untracked: number } | null> {
  if (!fromSha) return null;
  const only = pathspec(scope);
  try {
    const [numstat, names, porcelain] = await Promise.all([
      host.exec(`git diff --numstat ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git diff --name-only --diff-filter=d ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git status --porcelain${only}`, { timeoutMs: 30_000 }),
    ]);
    if (numstat.exitCode !== 0 || names.exitCode !== 0) return null;
    let lines = 0;
    for (const line of numstat.stdout.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      // `-`: binary file. It has no line count, but it counts as a change — a `0`
      // would make it invisible.
      lines += m[1] === "-" || m[2] === "-" ? 1 : Number(m[1]) + Number(m[2]);
    }
    const files = names.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const untracked =
      porcelain.exitCode === 0
        ? porcelain.stdout.split("\n").filter((l) => l.startsWith("??")).length
        : 0;
    return { files, lines, untracked };
  } catch {
    return null;
  }
}

/**
 * ALL PATHS TOUCHED BY THE TURN, including deletions and new files (MIN-286).
 *
 * `turnDiffStat` sizes a turn: its list is passed to `vitest related`, so it
 * excludes what no longer exists (`--diff-filter=d`) and counts new files only
 * by number. Here we want the opposite — to know WHAT moved, so end-of-turn
 * type-checking has something to inspect when the model only deleted or created
 * through the shell (under opencode, `rm`/`mv` use no write tool).
 *
 * Best-effort like its neighbors: any error returns an empty list.
 */
export async function turnTouchedPaths(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<string[]> {
  if (!fromSha) return [];
  const only = pathspec(scope);
  try {
    const [names, porcelain] = await Promise.all([
      host.exec(`git diff --name-only ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git status --porcelain${only}`, { timeoutMs: 30_000 }),
    ]);
    const paths = new Set<string>();
    if (names.exitCode === 0) {
      for (const line of names.stdout.split("\n")) {
        const path = line.trim();
        if (path) paths.add(path);
      }
    }
    if (porcelain.exitCode === 0) {
      for (const line of porcelain.stdout.split("\n")) {
        if (!line.startsWith("??")) continue;
        const path = line.slice(2).trim();
        if (path) paths.add(path);
      }
    }
    return [...paths];
  } catch {
    return [];
  }
}

/**
 * Files changed between two SHAs (the “per-turn diff”). Two git passes:
 * `--name-status` (status + clean paths, including renames) for the list, and
 * `--numstat` for the +/- counters (binary file → 0/0). Two-point form only —
 * the clone is shallow (depth 1). Best-effort: any error (or a SHA outside the
 * shallow history) returns an empty list and never breaks a turn.
 */
export async function changedFiles(
  host: RepoHost,
  fromSha: string,
  toSha: string,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  if (!fromSha || !toSha || fromSha === toSha) return { files: [], truncated: false };
  return diffToChangedFiles(host, fromSha, sq(toSha), "");
}

/**
 * THE SAME CHANGED FILES, BUT IN THE WORKING TREE (MIN-293).
 *
 * In local-repository mode, **the turn no longer commits**: its deliverable is
 * what it left on the user's disk (decision D2bis-B). There is therefore no
 * second SHA to diff — compare the turn baseline with the tree, and add UNTRACKED
 * files, which `git diff` cannot see and which are nevertheless the most common
 * case when an agent creates a file.
 *
 * `scope` bounds the turn's paths: without it, the user's 20 dirty files would
 * appear in the thread as if the agent had touched them.
 */
export async function workingTreeChangedFiles(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  if (!fromSha) return { files: [], truncated: false };
  const only = pathspec(scope);
  const tracked = await diffToChangedFiles(host, fromSha, "", only);

    // Untracked files, which `git diff` ignores by construction. `--porcelain`
    // marks them `??`, and they all count as “added”.
  let untracked: string[] = [];
  try {
    const status = await host.exec(`git status --porcelain --untracked-files=all${only}`, {
      timeoutMs: 30_000,
    });
    if (status.exitCode === 0) {
      untracked = status.stdout
        .split("\n")
        .filter((line) => line.startsWith("?? "))
        .map((line) => line.slice(3).trim())
        .filter(Boolean);
    }
  } catch {
    // Best-effort, like this entire file: a failing `git status` must not bring
    // down a completed turn.
  }

  const seen = new Set(tracked.files.map((f) => f.path));
  const files = [
    ...tracked.files,
    ...untracked
      .filter((path) => !seen.has(path))
      .map((path): ChangedFile => ({ path, status: "added", additions: 0, deletions: 0 })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  const truncated = tracked.truncated || files.length > CHANGED_FILES_CAP;
  return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
}

/** Shared body: two `git diff` passes, producing a `ChangedFile` list. */
async function diffToChangedFiles(
  host: RepoHost,
  fromSha: string,
  target: string,
  only: string,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  const to = target ? ` ${target}` : "";
  try {
    const [nameStatus, numstat] = await Promise.all([
      host.exec(`git diff --name-status --find-renames ${sq(fromSha)}${to}${only}`),
      host.exec(`git diff --numstat --find-renames ${sq(fromSha)}${to}${only}`),
    ]);
    if (nameStatus.exitCode !== 0) return { files: [], truncated: false };

    // Counters indexed by the FINAL path.
    const counts = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstat.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
      counts.set(numstatNewPath(parts.slice(2).join("\t")), { additions, deletions });
    }

    const files: ChangedFile[] = [];
    for (const line of nameStatus.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0]?.[0] ?? "";
      let status: ChangedFile["status"];
      let path: string;
      let previousPath: string | undefined;
      if (code === "R") {
        status = "renamed";
        previousPath = parts[1] ?? "";
        path = parts[2] ?? previousPath;
      } else if (code === "A" || code === "C") {
        // Copy (C) = new file on the target side → “added” from the reader's perspective.
        status = "added";
        path = parts[1] ?? "";
      } else if (code === "D") {
        status = "deleted";
        path = parts[1] ?? "";
      } else {
        status = "modified";
        path = parts[1] ?? "";
      }
      if (!path) continue;
      const c = counts.get(path) ?? { additions: 0, deletions: 0 };
      files.push({
        path,
        status,
        additions: c.additions,
        deletions: c.deletions,
        ...(previousPath ? { previousPath } : {}),
      });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const truncated = files.length > CHANGED_FILES_CAP;
    return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
  } catch {
    return { files: [], truncated: false };
  }
}

// ── File helpers (used by the agent's tools) ─────────────────────────────────

/** Maximum lines returned by `read_file` without an offset/limit. */
export const READ_MAX_LINES = 2000;
/** Maximum length of a returned line (truncated beyond this). */
export const READ_MAX_LINE_CHARS = 2000;
/** Maximum size of a read file (still read beyond this, but lines are bounded). */
export const READ_MAX_BYTES = 250_000;
/** Maximum files returned by `glob`. */
export const GLOB_MAX_FILES = 100;

/**
 * Absolute, VALIDATED path for a repository file. Resolves `..` and rejects any
 * path outside the run repository.
 *
 * DEFENSE IN DEPTH, with exactly the same meaning since MIN-224: this is a PATH
 * function applied to model arguments before touching disk. Whether the harness
 * runs on the machine it protects changes nothing about what it rejects — the
 * microVM remains the real boundary, but `../../x` must never touch anything
 * there other than the repository.
 *
 * The root has come from the host since MIN-354, and that is the only change: on
 * a machine where the repository is no longer under `/vercel`, a hard-coded root
 * did not reject too little — it rejected EVERYTHING, every real path outside a
 * root that does not exist.
 */
function repoPath(host: RepoHost, relPath: string): string {
  return resolveWithin(host.layout.repoDir, relPath);
}

/**
 * READ path: the repository, plus readable run directories (stored tool output,
 * MIN-107). Reserved for tools that READ — writes go through `writablePath` and
 * remain confined to the repository.
 */
function readablePath(host: RepoHost, path: string): string {
  return resolveReadable(host.layout.repoDir, readableDirs(host.layout), path);
}

/**
 * Like repoPath but for WRITES: additionally rejects `.git/` (writing a hook or
 * config enables escalation — installation-token exfiltration, backdoor).
 */
function writablePath(host: RepoHost, relPath: string): string {
  const abs = repoPath(host, relPath);
  assertNotGit(host.layout.repoDir, abs, relPath);
  return abs;
}

/** Reads the RAW content of a repository file (utf8), or null if it does not exist.
    Used by editing (`edit_file`), which needs the exact unannotated content. */
export async function readWorkFile(host: RepoHost, relPath: string): Promise<string | null> {
  return host.readFile(repoPath(host, relPath));
}

/**
 * The same file, but as it exists AT A GIT REF — not in the working tree
 * (MIN-328).
 *
 * A REVIEW session is checked out at the pull request HEAD, which on a fork
 * belongs to the PR author — that is, on a public repository, to anyone. Reading
 * repository instructions there would let a stranger write into the session's
 * system prompt. Only the BASE is authoritative, and that is what the `pr-base`
 * tag designates.
 *
 * `git show` rather than a checkout: nothing moves in the tree, so the review's
 * `git diff pr-base` remains exactly the PR change. Returns null if the ref or
 * path does not exist — a normal case (no `AGENTS.md`, or the base anchor was not
 * fetched), and a review without conventions is better than one using the
 * attacker's conventions.
 */
export async function readFileAtRef(
  host: RepoHost,
  ref: string,
  relPath: string,
): Promise<string | null> {
  // The ref comes from us (`PR_BASE_TAG`), and the path comes from an instruction
  // filename computed by `instructionFilesFor` — both still go through `sq`, as
  // does everything that enters a shell here.
  const cleaned = relPath.trim().replace(/^\.\//, "");
  if (!cleaned || cleaned.startsWith("/") || cleaned.split("/").includes("..")) return null;
  try {
    const res = await host.exec(`git show ${sq(`${ref}:${cleaned}`)}`, { timeoutMs: 20_000 });
    return res.exitCode === 0 ? res.stdout : null;
  } catch {
    return null;
  }
}

/**
 * Stores tool output that is too long in the run output directory and returns its
 * ABSOLUTE path (the model will pass it back to `read_file`/`grep`). Does NOT go
 * through `writablePath`: we intentionally write outside the repository, and
 * `name` is a simple filename (all separators are neutralized here).
 */
export async function writeToolOutput(
  host: RepoHost,
  name: string,
  content: string,
): Promise<string> {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+$/, "output") || "output";
  const dir = host.layout.toolOutputDir;
  const abs = `${dir}/${safe}`;
  await host.mkdir(dir).catch(() => {});
  await host.writeFile(abs, content);
  return abs;
}

// ── Background jobs (MIN-114) ────────────────────────────────────────────────

/** Timeout for starting a job (wait only for its PID, not its completion). */
const BACKGROUND_START_TIMEOUT_MS = 20_000;
/** Timeout for probing / stopping. */
const BACKGROUND_PROBE_TIMEOUT_MS = 30_000;

/**
 * The three files for a job, in the run output directory — therefore OUTSIDE the
 * repository (`git add -A` at the end of a turn never sees them) and in a
 * directory READABLE by `read_file`/`grep`: a server's full log remains
 * accessible even when the probe returned only its tail (MIN-107).
 */
function backgroundPaths(layout: HarnessLayout, jobId: string): BackgroundPaths {
  const safe = jobId.replace(/[^A-Za-z0-9._-]/g, "-") || "job";
  return {
    log: `${layout.toolOutputDir}/${safe}.log`,
    pid: `${layout.toolOutputDir}/${safe}.pid`,
    exit: `${layout.toolOutputDir}/${safe}.exit`,
  };
}

/**
 * Starts a command IN THE BACKGROUND and returns its PID (the script itself, and
 * why it is written this way, are in `background.ts` — a pure module).
 */
export async function startBackground(
  host: RepoHost,
  opts: { jobId: string; command: string; cwd?: string },
): Promise<{ pid: number; logPath: string }> {
  const p = backgroundPaths(host.layout, opts.jobId);
  const launcher = backgroundStartScript(p, opts.command, host.layout.toolOutputDir);

  const res = await host.exec(launcher, {
    cwd: opts.cwd,
    timeoutMs: BACKGROUND_START_TIMEOUT_MS,
  });
  const pid = Number.parseInt(res.stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    const detail = (res.stderr || res.stdout).trim().slice(0, 300);
    throw new Error(`Could not start the background job${detail ? `: ${detail}` : "."}`);
  }
  return { pid, logPath: p.log };
}

/**
 * Probes a job: what was written SINCE `offset`, plus its state. The increment is
 * bounded to `maxBytes` taken from the END (a chatty watcher must not bring back
 * 40 MB per probe); the offset still advances to the log's real size, and skipped
 * content remains in the file, readable with `grep`/`read_file`.
 */
export async function readBackgroundSince(
  host: RepoHost,
  opts: { jobId: string; pid: number; offset: number; maxBytes: number },
): Promise<BackgroundChunk> {
  const p = backgroundPaths(host.layout, opts.jobId);
  const offset = Math.max(0, Math.floor(opts.offset));
  const maxBytes = Math.max(1, Math.floor(opts.maxBytes));
  const res = await host.exec(backgroundProbeScript(p, opts.pid, offset, maxBytes), {
    timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS,
  });
  try {
    return parseBackgroundProbe(res.stdout, { offset, maxBytes });
  } catch {
    throw new Error(
      `Could not read the background job: ${(res.stderr || res.stdout).trim().slice(0, 300)}`,
    );
  }
}

/**
 * Stops a job: SIGTERM, grace period, then SIGKILL (script in `background.ts`).
 * Never throws for a process that is already dead.
 */
export async function stopBackground(host: RepoHost, pid: number): Promise<void> {
  await host.exec(backgroundStopScript(pid), { timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS });
}

export interface ReadWindow {
  /** Annotated content: one `<n>\t<content>` line per source line (1-based). */
  content: string;
  /** Total number of lines in the file. */
  totalLines: number;
  /** (1-based) index of the first returned line. */
  startLine: number;
  /** Number of returned lines. */
  returnedLines: number;
  /** true if lines were omitted (window smaller than the file). */
  truncated: boolean;
}

/**
 * Reads a WINDOW of a file with line numbers (`cat -n` format: `n\t…`), making
 * edits targetable and bounding context. `offset` (1-based) and `limit` define
 * the window; by default the first `READ_MAX_LINES` lines. Very long lines are
 * truncated. Returns null if the file does not exist.
 *
 * In addition to repository paths, accepts tool output stored in the run output
 * directory (MIN-107): this is how the model rereads the complete output of an
 * overlong `run_command`.
 */
export async function readWorkFileWindow(
  host: RepoHost,
  relPath: string,
  opts?: { offset?: number; limit?: number },
): Promise<ReadWindow | null> {
  const raw = await host.readFile(readablePath(host, relPath));
  if (raw === null) return null;

  const lines = raw.split("\n");
  // A file ending in `\n` (the common case) produces a final empty element: remove
  // it so we do not display a phantom numbered line (`cat -n` semantics).
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const totalLines = lines.length;
  const startLine = Math.max(1, Math.floor(opts?.offset ?? 1));
  const limit = Math.max(1, Math.floor(opts?.limit ?? READ_MAX_LINES));
  const from = startLine - 1;
  const slice = lines.slice(from, from + limit);

  const numbered = slice.map((line, i) => {
    const n = startLine + i;
    const text = line.length > READ_MAX_LINE_CHARS ? `${line.slice(0, READ_MAX_LINE_CHARS)}… [line truncated]` : line;
    return `${n}\t${text}`;
  });

  return {
    content: numbered.join("\n"),
    totalLines,
    startLine,
    returnedLines: slice.length,
    truncated: from > 0 || from + slice.length < totalLines,
  };
}

/** Writes (creates/overwrites) a repository file. Creates parent directories as needed.
    Rejects writes outside the repository or in `.git/`. */
export async function writeWorkFile(
  host: RepoHost,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = writablePath(host, relPath);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  if (dir) await host.mkdir(dir).catch(() => {});
  await host.writeFile(abs, content);
}

/**
 * Moves/renames a tracked file (`git mv`). Rejects leaving the repository / `.git/`
 * on either side, and overwriting an existing destination. Uses git so the
 * commit/PR captures the rename.
 */
export async function moveWorkFile(host: RepoHost, from: string, to: string): Promise<void> {
  const src = writablePath(host, from);
  const dst = writablePath(host, to);
  const dstDir = dst.slice(0, dst.lastIndexOf("/"));
  const cmd = [
    `set -e`,
    `test -e ${sq(src)} || { echo "source not found" >&2; exit 3; }`,
    `test -e ${sq(dst)} && { echo "destination exists" >&2; exit 4; }`,
    dstDir ? `mkdir -p ${sq(dstDir)}` : `:`,
    // git mv if the file is tracked, otherwise plain mv (new, uncommitted file).
    `git mv ${sq(src)} ${sq(dst)} 2>/dev/null || mv ${sq(src)} ${sq(dst)}`,
  ].join("\n");
  const res = await host.exec(cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "move failed");
}

/** Deletes a tracked or new file (`git rm`). Rejects paths outside the repository / `.git/`. */
export async function deleteWorkFile(host: RepoHost, relPath: string): Promise<void> {
  const abs = writablePath(host, relPath);
  const cmd = [
    `test -e ${sq(abs)} || { echo "file not found" >&2; exit 3; }`,
    `git rm -f ${sq(abs)} 2>/dev/null || rm -f ${sq(abs)}`,
  ].join("\n");
  const res = await host.exec(cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "delete failed");
}

/** Lists a repository directory — or the run output directory, to find stored
    output (names, directories with a trailing `/`). */
/**
 * Directory contents, or `null` if it could not be READ (missing path, not a
 * directory, permissions) — MIN-226, same rule as `grep`: a failure is not
 * returned as an empty result. “(empty)” for a directory that does not exist
 * claims that it exists and is empty, which is doubly false, and the model would
 * conclude there is nothing to look for there.
 */
export async function listDir(host: RepoHost, relPath = "."): Promise<string | null> {
  const res = await host.exec(`ls -1Ap ${sq(readablePath(host, relPath))}`);
  return res.exitCode === 0 ? res.stdout : null;
}

export type GrepOutputMode = "content" | "files_with_matches" | "count";

export interface GrepOptions {
  /** Pattern (extended POSIX regex). */
  pattern: string;
  /** Subtree to limit (pathspec). */
  path?: string;
  /** File glob, e.g. `**\/*.ts` (pathspec `:(glob)`). */
  glob?: string;
  outputMode?: GrepOutputMode;
  /** Case insensitive. */
  ignoreCase?: boolean;
  /** Context lines around each match (`content` mode). */
  context?: number;
  /** Cap of rows returned. */
  headLimit?: number;
  /** Looks for the pattern as a LITERAL string (`-F`), without reading it as a regex. */
  fixedStrings?: boolean;
}

export interface GrepResult {
  /** Output lines (may be empty = no match). */
  output: string;
  /** false → git grep FAILED (invalid regex/option) — not “no match”. */
  ok: boolean;
  /** Error message if ok=false. */
  error?: string;
  /** The pattern was not a valid regex: rerun as literal (MIN-109). */
  retriedAsLiteral?: boolean;
  /**
   * The opposite (MIN-238): `fixed_strings` placed on an ALTERNATION, therefore a `|`
   * searched for as a character and alternatives never searched at all.
   * Rerun in regex — these are the results that are returned.
   *
   * Same family as `noFilesInScope`: the search went well, it did not
   * simply didn't look for what the model believed. The difference is that here we
   * can do it again correctly, like MIN-109 does it the other way around.
   */
  retriedAsRegex?: boolean;
  /**
   * No matches AND no files in the scope: `path`/`glob` have
   * selected NO files, so search read nothing (MIN-226).
   *
   * This is the distinction that was missing. “No matches” reads like a
   * fact checked on the code — the model draws a conclusion and moves on to the
   * continued — while an empty perimeter says nothing at all, except that the filter
   * was false. Both came out with the same sentence, and a malformed filter
   * therefore lied in silence, indistinguishable from a real absence: that's like that
   * that the MIN-226 plan "verified" that a file did not call what it
   * called. A form correction (braces in MIN-116, file `path`
   * in MIN-226) closes ONE door; this closes the class.
   */
  noFilesInScope?: boolean;
}

/**
 * Search via `git grep`: gitignore-aware (tracked + untracked files, excluding
 * ignored), fast, with no dependency to install. `content` → `file:line:…`,
 * `files_with_matches` → paths, `count` → `file:count`. `path` and `glob`
 * INTERSECT (glob in path). Git errors (invalid regex, option
 * invalid) are NOT hidden: we read the exit code (≥2 = error) instead of
 * `|| true`/`| head` which would swallow them — the line cap is done in JS.
 * Only exception (MIN-109): a pattern refused as regex is re-run in literal
 * (`-F`), and the return SAYS (`retriedAsLiteral`).
 */
export async function grepRepo(host: RepoHost, opts: GrepOptions): Promise<GrepResult> {
  // Does the `path` target a file readable OUTSIDE the repository (a tool output filed,
  // MIN-107) ? git grep sees nothing there — we move on to system grep.
  const outside = opts.path ? readableOutsideRepo(host, opts.path) : null;
  if (outside) return grepOutside(host, opts, outside);

  const specs = grepPathspecs(opts.path, opts.glob).map(sq);
  const pathspecPart = specs.length ? ` -- ${specs.join(" ")}` : "";
  const build = (literal: boolean) => {
    const flags = [
      "--no-color",
      "-I",
      literal ? "-F" : "-E",
      "--untracked",
      ...grepModeFlags(opts),
    ];
    return `git grep ${flags.join(" ")} -e ${sq(opts.pattern)}${pathspecPart}`;
  };
  const { res, retriedAsLiteral, retriedAsRegex } = await runGrepWithLiteralFallback(
    host,
    build,
    opts,
  );

  // git grep: 0 = matches, 1 = no matches, ≥2 = ERROR (invalid regex/option…).
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  if (res.exitCode === 1 && specs.length > 0) {
    // Nothing found UNDER A FILTER: did the filter only retain one file?
    // A single command, on the only path where the question arises.
    const listed = await host.exec(
      `git ls-files --cached --others --exclude-standard -- ${specs.join(" ")}`,
    );
    if (listed.exitCode === 0 && listed.stdout.trim() === "") {
      return { output: "", ok: true, retriedAsLiteral, retriedAsRegex, noFilesInScope: true };
    }
  }
  return {
    output: capGrepLines(res.stdout, opts.headLimit),
    ok: true,
    retriedAsLiteral,
    retriedAsRegex,
  };
}

/**
 * Launch the search, and if the engine refused the PATTERN (not a valid regex),
 * the literal restart (`-F`) — by far the most common case (MIN-109): the
 * model pastes a piece of code (`onUpdateIssue={`) thinking it is looking for text.
 * Any other error (option, pathspec) returns as is.
 */
async function runGrepWithLiteralFallback(
  host: RepoHost,
  build: (literal: boolean) => string,
  opts: GrepOptions,
): Promise<{ res: ShellResult; retriedAsLiteral: boolean; retriedAsRegex?: boolean }> {
  const literal = opts.fixedStrings === true;
  const res = await host.exec(build(literal));
  if (literal) {
    // The SYMMETRIC fold (MIN-238): `fixed_strings` on an alternation a
    // sought the bar literally, so the alternatives never
    // been sought. Nothing found here means nothing — we restart in regex.
    // Conditioned on the absence of a match: a literal one that FINDS is what we
    // wanted, and restarting it would change a fair response.
    if (res.exitCode === 1 && looksLikeIntendedAlternation(opts.pattern)) {
      const retry = await host.exec(build(false));
      // A refused regex is no better than the literal: we keep the
      // first result rather than trading “nothing found” for an error.
      if (retry.exitCode < 2) return { res: retry, retriedAsLiteral: false, retriedAsRegex: true };
    }
    return { res, retriedAsLiteral: false };
  }
  if (res.exitCode < 2 || !isInvalidRegexError(res.stderr || res.stdout)) {
    return { res, retriedAsLiteral: false };
  }
  return { res: await host.exec(build(true)), retriedAsLiteral: true };
}

/** Flags shared by both engines (case, output mode, context). */
function grepModeFlags(opts: GrepOptions): string[] {
  const flags: string[] = [];
  if (opts.ignoreCase) flags.push("-i");
  const mode = opts.outputMode ?? "content";
  if (mode === "files_with_matches") flags.push("-l");
  else if (mode === "count") flags.push("-c");
  else {
    flags.push("-n");
    const ctx = opts.context != null ? Math.floor(opts.context) : 0;
    if (ctx > 0) flags.push(`-C ${Math.min(ctx, 20)}`);
  }
  return flags;
}

/** Line cap applied in JS (never `| head`, which would hide the exit code). */
function capGrepLines(output: string, headLimit?: number): string {
  if (headLimit == null || headLimit <= 0) return output;
  return output.split("\n").slice(0, Math.floor(headLimit)).join("\n");
}

/** Absolute path validated if it targets a file readable outside the repository, otherwise null.
    Raised if a `..` tried to exit. */
function readableOutsideRepo(host: RepoHost, path: string): string | null {
  const dirs = readableDirs(host.layout);
  if (!dirs.some((dir) => path === dir || path.startsWith(`${dir}/`))) return null;
  return readablePath(host, path);
}

/**
 * Search in a readable folder outside the repository (deposited tool outputs) with the
 * system grep: `-r` for a folder, `-H` to always prefix the path
 * (the model must be able to change it back to `read_file`). Same exit codes as
 * git grep (0 matches, 1 nothing, ≥2 errors), so same return contract.
 */
async function grepOutside(
  host: RepoHost,
  opts: GrepOptions,
  absPath: string,
): Promise<GrepResult> {
  // `--include` of GNU grep does not expand the braces either: a
  // alternative = a `--include` (they unite), like git pathspecs.
  const includes = opts.glob
    ? expandBraces(opts.glob).map((alt) => `--include=${sq(alt)}`)
    : [];
  const build = (literal: boolean) => {
    const flags = [
      "--color=never",
      "-I",
      literal ? "-F" : "-E",
      "-r",
      "-H",
      ...grepModeFlags(opts),
      ...includes,
    ];
    return `grep ${flags.join(" ")} -e ${sq(opts.pattern)} -- ${sq(absPath)}`;
  };
  const { res, retriedAsLiteral, retriedAsRegex } = await runGrepWithLiteralFallback(
    host,
    build,
    opts,
  );
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  if (res.exitCode === 1 && includes.length > 0) {
    // Same question as on the deposit side, asked with the SAME filter: a reason which
    // matches any non-blank line. What remains is exactly the
    // perimeter, without having to reinvent the semantics of `--include`.
    const probe = await host.exec(
      `grep --color=never -I -r -l -E ${includes.join(" ")} -e ${sq(".")} -- ${sq(absPath)}`,
    );
    if (probe.stdout.trim() === "") {
      return { output: "", ok: true, retriedAsLiteral, retriedAsRegex, noFilesInScope: true };
    }
  }
  return {
    output: capGrepLines(res.stdout, opts.headLimit),
    ok: true,
    retriedAsLiteral,
    retriedAsRegex,
  };
}

export interface GlobResult {
  files: string[];
  truncated: boolean;
  /**
   * false → `git ls-files` FAILED (malformed pathspec, unclosed magic) —
   * not “no files” (MIN-226). The failure exited via the empty list, so a
   * poorly written pattern responded "this repository does not contain any such files".
   * Same lie as `grep`, in the next tool.
   */
  ok: boolean;
}

/**
 * Lists the files in the repository corresponding to a glob (pathspec `:(glob)`),
 * gitignore-aware (followed + unfollowed, excluding ignored). `path` and `pattern`
 * INTERSECT (glob in path). Sort + cap (`GLOB_MAX_FILES`) done in JS for
 * do not hide the git exit code behind a pipe.
 */
export async function globRepo(
  host: RepoHost,
  pattern: string,
  path?: string,
): Promise<GlobResult> {
  const specs = globPathspecs(pattern, path).map(sq).join(" ");
  const cmd = `git ls-files --cached --others --exclude-standard -- ${specs}`;
  const res = await host.exec(cmd);
  // Malformed Pathspec: an ERROR, and it says itself. A reason that git refuses and a
  // pattern that doesn't match anything are not the same news.
  if (res.exitCode !== 0) return { files: [], truncated: false, ok: false };

  const all = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
  return {
    files: all.slice(0, GLOB_MAX_FILES),
    truncated: all.length > GLOB_MAX_FILES,
    ok: true,
  };
}

/**
 * The hands of `run_background` (MIN-114) on THE deposit: the policy (ceiling,
 * git guardrail, offsets, formatting) lives in the pure module `background.ts`,
 * this runner only places it on the host. `workdir` goes through `resolveWithin` —
 * a `../..` returns to the tool error model.
 *
 * It lives HERE, and no longer in `exec-tool.ts`, since BOTH engines moved there.
 * serve (MIN-286, batch 3): the opencode supervisor has nothing to borrow from
 * the home loop's tools executor, which batch 3 eventually removes.
 */
export function repoBackgroundRunner(host: RepoHost): BackgroundJobRunner {
  return {
    start: ({ jobId, command, workdir }) =>
      startBackground(host, {
        jobId,
        command,
        cwd: workdir ? resolveWithin(host.layout.repoDir, workdir) : undefined,
      }),
    read: ({ jobId, pid, offset }) =>
      readBackgroundSince(host, { jobId, pid, offset, maxBytes: BACKGROUND_FETCH_BYTES }),
    stop: ({ pid }) => stopBackground(host, pid),
  };
}
