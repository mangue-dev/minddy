import { CHANGED_FILES_CAP, sq, type RepoHost } from "./repo-host";

/**
 * THE DIFF OF THE CURRENT TURN, READ IN THE SANDBOX — the only source that knows what
 * the agent just wrote (MIN-266, note “diff in progress”).
 *
 * The diff view of the conversation was served by the FORGE
 * ([diff/route.ts](../../../app/api/agent-runs/[runId]/diff/route.ts)): the PR
 * when it exists, otherwise compares it to `base...branch`. This is the PUSHED work,
 * and the agent only pushes at the end of the round — while it is working, click a
 * file that it has just modified therefore opened the BEFORE state, when it was
 * not an empty diff (first round: the branch does not yet exist on the forge).
 * The thread said "app/foo.tsx modified" and the only surface capable of showing
 * this change did not know about it.
 *
 * Here, we read the repository where it lives (`host.layout.repoDir`), in the microVM of the
 *run. `git diff origin/<base>` covers EVERYTHING there — the commits from previous rounds
 * AND the uncommitted working tree — so the same thing as the compare from the
 * forge, plus what hasn't gone yet. A single source during the round,
 * no two diffs to glue together (patches are not composed).
 *
 * **READ ONLY, and this is the condition of its safety.** These commands run
 * while a round edits and commits: neither `add`, neither `add -N`, nor write
 * index — the end of round stage and commit alone ([commitAndPush](repo-host.ts)),
 * and an add intention placed here would end up in someone else's commit
 *. The worst that can happen is a snapshot taken between two states.
 *
 * UNTRACKED files pass through `git diff --no-index /dev/null <path>`,
 * which renders exactly the same shape as a `new file mode` without touching the
 * index. Without that, a newly created file — the most common case of an
 * agent trick — would be absent from the diff that we show.
 *
 * The parsing is PURE and tested ([working-diff.test.ts](working-diff.test.ts)):
 * this module does not cannot be practiced against a real sandbox, but reading the three git outputs can be fully practiced.
 */

/** A file of the working diff, in the form that forges already serve
 * (`PullRequestFile` on the client side): the diff view does not have to know where it comes from. */
export interface WorkingDiffFile {
  filename: string;
  status: "added" | "removed" | "renamed" | "modified";
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

/**
 * Byte cap on patch TEXT, applied by `head -c` on the sandbox side:
 * a trick that regenerates a lockfile produces a diff of several megabytes, which we
 * does not want to pass or paint. The cut falls in the middle of a line,
 * so the parser must tolerate it — it only loses the last file.
 */
export const WORKING_DIFF_MAX_BYTES = 2_000_000;

/**
 * Ceiling of the diff that leaves a local execution. Unlike a microVM,
 * the server cannot reread this repository: the patch therefore travels once in the direct
 *, then in the end of turn event. We remain clearly below the limit of the
 * control plan and Realtime; big diffs keep their list and their
 * counters, but announce that the patches are truncated.
 */
export const LOCAL_WORKING_DIFF_MAX_BYTES = 240_000;

/** Did the round produce a diff larger than this cap, or more files
 * than `CHANGED_FILES_CAP`? Said on screen — a truncated list without saying it
 * reads like a complete list. */
export interface WorkingDiff {
  files: WorkingDiffFile[];
  truncated: boolean;
}

/**
 * The path AFTER a `--numstat` field, which compacts the
 * renames (`a => b`, `{a => b}`, `pre/{a => b}/post`). Twin of `numstatNewPath` of
 * [repo-host](repo-host.ts) — duplication is assumed: this one is private, and
 * exporting it would pass off a parsing detail as a repository primitive.
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

/** `git diff --numstat` → counters indexed by arrival path. A binary
 * file is worth `-` on both sides: counted 0/0, as the forge does. */
export function parseNumstat(stdout: string): Map<string, { additions: number; deletions: number }> {
  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
    counts.set(numstatNewPath(parts.slice(2).join("\t")), { additions, deletions });
  }
  return counts;
}

interface NameStatusEntry {
  filename: string;
  status: WorkingDiffFile["status"];
  previousFilename?: string;
}

/** `git diff --name-status --find-renames` → status and clean paths (the only
 * place where a rename gives its BOTH paths without compaction). */
export function parseNameStatus(stdout: string): NameStatusEntry[] {
  const out: NameStatusEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0]?.[0] ?? "";
    if (code === "R") {
      const previousFilename = parts[1] ?? "";
      const filename = parts[2] ?? previousFilename;
      if (filename) out.push({ filename, status: "renamed", previousFilename });
      continue;
    }
    const filename = parts[1] ?? "";
    if (!filename) continue;
    // Copy (C) = new file on the target side → “added” from the reader point of view.
    // Everything else (M, T, U…) is called “modified”, like on GitHub.
    const status: WorkingDiffFile["status"] =
      code === "A" || code === "C" ? "added" : code === "D" ? "removed" : "modified";
    out.push({ filename, status });
  }
  return out;
}

/**
 * A unified diff → the patch of each file, in the form of GitHub: the HUNKS
 * alone, from the first line `@@` to the end of the section. The header
 * (`diff --git`, `index`, `---`, `+++`) is rebuilt when displayed
 * ([toUnifiedDiff](../../../components/pull-requests/pr-diff.tsx)), and keeping
 * here would make it appear duplicate.
 *
 * The path reads as `+++ b/<path>` (or `--- a/<path>` for a
 * deletion), never on the `diff --git` line: it pastes the two paths
 * without an usable separator, and a file whose name has a space y
 * becomes undecidable. Git also suffixes these lines with a tab,
 * which is removed.
 *
 * A section without a hunk (pure renaming, binary file) makes a patch EMPTY:
 * there is nothing to paint, and the diff view already knows the say.
 */
export function splitUnifiedDiff(text: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!text.trim()) return out;
  // `\ndiff --git ` and not `diff --git `: a line of patch content can
  // start with these words (a diff within a diff — this file, here).
  const sections = `\n${text}`.split("\ndiff --git ");
  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split("\n");
    let filename = "";
    let hunkStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("@@")) {
        hunkStart = i;
        break;
      }
      if (line.startsWith("+++ ")) {
        const path = line.slice(4).replace(/\t.*$/, "");
        if (path !== "/dev/null") filename = path.replace(/^b\//, "");
      } else if (line.startsWith("--- ") && !filename) {
        const path = line.slice(4).replace(/\t.*$/, "");
        if (path !== "/dev/null") filename = path.replace(/^a\//, "");
      } else if (line.startsWith("rename to ")) {
        filename = line.slice("rename to ".length);
      } else if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
        // A binary has neither `---` nor `+++`: its single line names both sides
        // (`Binary files /dev/null and b/logo.png differ`). He has nothing to paint,
        // but it MUST be in the list — a trick that replaces an image does not
        // cannot pass for a trick that did nothing.
        const right = line.slice("Binary files ".length, -" differ".length).split(" and ").pop();
        if (right && right !== "/dev/null") filename = right.replace(/^[ab]\//, "");
      }
    }
    if (!filename) continue;
    out.set(filename, hunkStart === -1 ? "" : lines.slice(hunkStart).join("\n").replace(/\n+$/, ""));
  }
  return out;
}

/** Additions/deletions read on a patch — the only count available for an
 * UNTRACKED file, which `git diff --numstat` ignores by construction. */
export function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

/**
 * The four outputs of git → the list served to the diff view. Pure: this is where
 * lives all the reading, and therefore everything that can go wrong.
 *
 * Untracked files are added AFTER the tracks then everything is sorted by
 * path: `git status` and `git diff` do not speak of the same together, and a
 * file cannot be in both.
 */
export function buildWorkingDiff(out: {
  nameStatus: string;
  numstat: string;
  patch: string;
  untrackedPatch: string;
  /** Patch text has been trimmed to the byte limit. */
  patchTruncated?: boolean;
}): WorkingDiff {
  const counts = parseNumstat(out.numstat);
  const patches = splitUnifiedDiff(out.patch);
  const untrackedPatches = splitUnifiedDiff(out.untrackedPatch);

  const files: WorkingDiffFile[] = [];
  for (const entry of parseNameStatus(out.nameStatus)) {
    const c = counts.get(entry.filename) ?? { additions: 0, deletions: 0 };
    const patch = patches.get(entry.filename);
    files.push({
      filename: entry.filename,
      status: entry.status,
      additions: c.additions,
      deletions: c.deletions,
      ...(patch ? { patch } : {}),
      ...(entry.previousFilename ? { previous_filename: entry.previousFilename } : {}),
    });
  }
  const tracked = new Set(files.map((f) => f.filename));
  for (const [filename, patch] of untrackedPatches) {
    if (tracked.has(filename)) continue;
    files.push({
      filename,
      status: "added",
      ...countPatchLines(patch),
      ...(patch ? { patch } : {}),
    });
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename));
  const truncated = out.patchTruncated === true || files.length > CHANGED_FILES_CAP;
  return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
}

/**
 * Commands, as they go into the sandbox. `patches: false` serves
 * the HEADER of the conversation, which only needs the two numbers and the
 * requests again every few seconds during the round: two short git
 * passes, not patch megabytes.
 *
 * `baseRef` is a git ref (`origin/main`), not user input:
 * it comes from the run. It still goes through `sq` — the day it comes
 * moreover, the question will not be asked again.
 *
 * Best effort from end to end, like `changedFiles`: the sandbox can be in
 * in the process of committing, turn off, or no longer respond. An empty diff reads
 * as "nothing to show", which is true most often, and never prevents
 * the view from opening.
 */
/**
 * THE BASE OF THE DIFF, RESOLVED IN THE CLONE — the STARTING POINT OF THE BRANCH,
 * i.e. `git merge-base origin/<base> HEAD`, and especially not the tip of
 * `origin/<base>`.
 *
 * THIS IS THE DIFFERENCE BETWEEN TWO POINTS AND THREE POINTS, and it can be quantified. A
 * `git diff origin/main` compares the working tree to the base tip: everything
 * that has landed on `main` since the branch left appears there
 * **REVERSED**, as if the agent had canceled it. The forge shows
 * `base...head` — from the common point. The two views then do not tell
 * the same turn, and this is what we read on PR 51: **881 lines live
 * against 130 in the forge**, because two commits (729 lines) had fallen
 * on `main` between the birth of the branch and cloning this turn.
 *
 * The comment before said "`origin/<base>` is fixed on cloning, so the
 * diff is correct". Frozen, it is — but at the cloning of THIS TURN, not at the
 * birth of the branch. A session that takes over a branch that is
 * a few hours old reclones a database that has moved, and the difference is exactly the
 * work of others.
 *
 * `baseBranch` is zero when the run is started on the default branch of the repository
 * without having been named. Rather than going to the forge to ask for it (an installation token
 * for a name), we read it in the clone: this one is
 * `--single-branch`, so there is ONLY ONE remote ref, and it is necessarily
 * that one.
 *
 * `null` = no readable base (deposit missing, silent sandbox) ⇒ no live diff,
 * and the caller falls back to the forge.
 */
export async function resolveBaseRef(
  host: RepoHost,
  baseBranch: string | null,
): Promise<string | null> {
  const shell: ShellOpts = { cwd: host.layout.repoDir, timeoutMs: 15_000 };
  const ref = await resolveBaseTip(host, baseBranch, shell);
  if (!ref) return null;
  return await mergeBaseWithHead(host, ref, shell);
}

/** The tip of the base in the clone — the ref, before going back to the common point. */
async function resolveBaseTip(
  host: RepoHost,
  baseBranch: string | null,
  shell: ShellOpts,
): Promise<string | null> {
  const named = baseBranch?.trim();
  if (named) {
    const ref = `origin/${named}`;
    const ok = await run(host, `git rev-parse --verify --quiet ${sq(ref)}`, shell);
    if (ok.trim()) return ref;
  }
  // `origin/HEAD` when the clone has installed it: this is the default branch.
  const head = await run(host, `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, shell);
  if (head.trim()) return head.trim();
  // Otherwise the only remote ref left. `--exclude` excludes `origin/HEAD`, of which
  // the short name is “origin” for short: a valid ref, but which reads like
  // a bug the day it appears in a log.
  const only = await run(
    host,
    `git for-each-ref --count=1 --format='%(refname:short)'` +
      ` --exclude=refs/remotes/origin/HEAD refs/remotes/origin/`,
    shell,
  );
  return only.trim() || null;
}

/**
 * The common point between the base and the head, or the base itself when git ne
 * cannot tell.
 *
 * FALLBACK IS THE BEFORE BEHAVIOR, and it is assumed: a clone `--depth`
 * can have no common ancestor in its plugin, and `merge-base` then returns
 * a code 1 without writing anything. Better the slightly too wide diff than none
 * diff — the view otherwise falls on the forge, which does not know the non
 * pushed work, that is to say precisely what we came to see.
 */
async function mergeBaseWithHead(
  host: RepoHost,
  ref: string,
  shell: ShellOpts,
): Promise<string> {
  const base = await run(host, `git merge-base ${sq(ref)} HEAD`, shell);
  return base.trim() || ref;
}

export async function readWorkingDiff(
  host: RepoHost,
  baseRef: string,
  opts: { patches: boolean; scope?: readonly string[]; maxBytes?: number },
): Promise<WorkingDiff> {
  if (opts.scope?.length === 0) return { files: [], truncated: false };
  const ref = sq(baseRef);
  const maxBytes = Math.max(1, Math.min(opts.maxBytes ?? WORKING_DIFF_MAX_BYTES, WORKING_DIFF_MAX_BYTES));
  const only = workingDiffPathspec(opts.scope);
  const shell: ShellOpts = { cwd: host.layout.repoDir, timeoutMs: 30_000 };
  try {
    const [nameStatus, numstat, patch, untrackedPatch] = await Promise.all([
      run(host, `git diff --name-status --find-renames ${ref}${only}`, shell),
      run(host, `git diff --numstat --find-renames ${ref}${only}`, shell),
      opts.patches
        ? run(
            host,
            `git diff --find-renames --no-color ${ref}${only} | head -c ${maxBytes}`,
            shell,
          )
        : Promise.resolve(""),
      opts.patches
        ? run(
            host,
            // `-I%` rather than a bare `xargs`: a path with spaces must remain ONE
            // argument. `; true` swallows the code 1 that `git diff --no-index` returns
            // by DESIGN whenever there is a difference — that is to say always here.
            `git ls-files --others --exclude-standard -z${only}` +
              ` | xargs -0 -n1 -I% git diff --no-index --no-color -- /dev/null %` +
              ` | head -c ${maxBytes}; true`,
            shell,
          )
        : Promise.resolve(""),
    ]);
    return buildWorkingDiff({
      nameStatus,
      numstat,
      patch,
      untrackedPatch,
      patchTruncated:
        patch.length >= maxBytes || untrackedPatch.length >= maxBytes,
    });
  } catch {
    return { files: [], truncated: false };
  }
}

/** `undefined` = entire repository; `[]` = nothing. The paths come from the
 * Git statement of the harness, but remain quoted like any data injected into the shell. */
function workingDiffPathspec(scope: readonly string[] | undefined): string {
  if (scope === undefined) return "";
  return ` -- ${scope.map((path) => sq(`:(literal)${path}`)).join(" ")}`;
}

type ShellOpts = { cwd: string; timeoutMs: number };

/** A command whose failure is worth nothing more than empty output. */
function run(host: RepoHost, command: string, opts: ShellOpts): Promise<string> {
  return host
    .exec(command, opts)
    .then((r) => (r.exitCode === 0 ? r.stdout : ""))
    .catch(() => "");
}
