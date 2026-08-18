import { gitIdentityFlags, sq, type RepoHost } from "./repo-host";

/**
 * WORKING IN SOMEONE ELSE'S DEPOT (MIN-358, decision D2).
 *
 * In microVM, the repository is a clone created for the tour: we do what we want there,
 * `git add -A` included, because there is no one else in it. On the machine
 * of the user, the repository is THE ONE HE OPENED — its branch, its index,
 * its WIP, its `.env`. Three gestures of the end of turn chain destroy
 * human work, measured on a disposable clone from this repository:
 *
 * | Geste | Ce qu'il fait au checkout de l'humain |
 * | --- | --- |
 * | `git add -A` | stage all the non-ignored: its WIP goes into the pull request |
 * | `git checkout -b` | changing branches at your fingertips |
 * | `git config user.email` | rewrites HIS git identity in HIS repository |
 *
 * This module is the answer, and its form is in one sentence: **we do not touch or
 * to its index, nor to its HEAD, nor to its working tree.** The commit is made
 * in a DISPOSABLE index (`GIT_INDEX_FILE`), from the parent tree, not including
 * posing as the paths of the tour; `commit-tree` makes it a commit, `update-ref`
 * hooks it to a ref of ours, and the push leaves by sha. After which
 * `git status`, `git branch --show-current` and `git write-tree` render, at
 * the user, exactly what they rendered before.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE PROBE HAS DECIDED, AND THAT NO READING WOULD SAY
 *
 * - **the hooks do not turn.** `commit-tree` is plumbing: a
 * `pre-commit` slow, or which comes out in 1, can no longer break a turn. This is the
 * “user hooks are running” problem fixed by build,
 * and not by a `--no-verify` that you should have thought about putting;
 * - **a ghost path is silently ignored** (`update-index --add --remove`
 * on a file neither on disk nor in the tree returns 0): the list of paths
 * of the tour therefore does not need to be exact to be safe;
 * - **`git status --porcelain` CITE non-ASCII paths** (`"lib/\303\251t\303\251.ts"`),
 * `-z` no. Hence `-z` everywhere here: a poorly reread accentuated path is a
 * file missing from pull request;
 * - **a gitignored file does not appear in `status`** but `update-index` does
 * would stage without flinching — it's plumbing, it doesn't read `.gitignore`.
 * The user's real `.env` is there, in this mode: hence `dropIgnoredPaths`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO ASSURED CHOICES, WHICH CAN BE SEEN IN THE PRODUCT
 *
 * 1. **The parent of the first commit is the HEAD of the checkout**, not `origin/<base>`.
 * Connecting to the database would produce a pull request whose content is built
 * on a state that the base does not contain — subtly false code — where
 * branching into HEAD only carries commits that the user has already made.
 * Corollary: `origin/<base>` is not READ anywhere on this path, so the fact
 * whether he is worth the last human `git fetch` no longer concerns us.
 * 2. **No local branch is created.** The run anchor is a ref to us
 * (`refs/minddy/run/<id>/work`); the branch of work only exists on the
 * remote. Setting a `refs/heads/<branche>` would be more convenient — and the day
 * the user has exactly THIS branch checked out, move it under him
 * would make all of the agent's work appear as canceled in his
 * `git status`. He gets it from the remote, like any colleague.
 *
 * And a case that no trick closes, and which must therefore be SAYED rather than
 * decide silently: **the user edits a file that the agent edits
 * also.** `carriedPaths` names it, and the end of the round publishes it to the thread.
 */

/**
 * Where the anchor of a run lives in the user's repository. A ref to us, outside
 * of `refs/heads/`: it appears neither in `git branch` nor in its
 * autocomplete, and two runs on the same machine do not work on each other.
 *
 * The point is removed like the rest, and not just at the top: `..` is
 * FORBIDDEN in a ref name by git itself, and an identifier that
 * would cause the `update-ref` to fail at commit time — that is, at
 * the place where we have the most work to lose.
 */
export function runWorkRef(runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9_-]/g, "-") || "run";
  return `refs/minddy/run/${safe}/work`;
}

/**
 * THE STATE OF THE WORK TREE, indexed by path — a snapshot taken at
 * start of the round and we compare again at the end.
 *
 * The value is the XY code of `git status` (` M`, `??`, `D `…). We do not compare
 * never CONTENT: what we are looking for is “this path was not in this
 * state when the round started", and that's exactly what the code says.
 */
export type RepoState = Map<string, string>;

/**
 * `git status --porcelain -z` → the state, path by path.
 *
 * The `-z` format separates entries with NULL and quotes NOTHING. A rename (`R`)
 * y occupies two fields — destination then origin — and both count: the
 * destination is a new path, the origin a vanished path, and a turn which
 * rename must deliver both.
 */
export function parseStatusZ(stdout: string): RepoState {
  const fields = stdout.split("\0");
  const state: RepoState = new Map();
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    state.set(path, code);
    // Renaming/copying: the NEXT field has the original path, and it does not have
    // of code to him. It is consumed here, otherwise the loop would read it as a
    // entry whose first three characters would be of the path.
    if (code[0] === "R" || code[0] === "C") {
      const from = fields[++i];
      if (from) state.set(from, code);
    }
  }
  return state;
}

/** The snapshot, read from the repository. Best-effort: a silent git returns an empty state,
 * which reduces the scope of the tour to only the noted editions. */
export async function readRepoState(host: RepoHost): Promise<RepoState> {
  try {
    const res = await host.exec(`git status --porcelain -z`, { timeoutMs: 60_000 });
    return res.exitCode === 0 ? parseStatusZ(res.stdout) : new Map();
  } catch {
    return new Map();
  }
}

/** The scope of a tour: what it delivers, and what it takes away without having written it. */
export interface TurnPaths {
  /** Paths to be staged, sorted — the union of the two sources, ignored paths excluded
   * by `dropIgnoredPaths` (who needs the deposit). */
  paths: string[];
  /**
   * The paths that the agent edited WHILE the user already had them
   * modified — therefore those whose commit also carries its own work.
   *
   * This is not an error to be corrected, it is the price of the mode: two hands in
   * the same file. What would be wrong would be not to say it.
   */
  carried: string[];
}

/**
 * THE PERIMETER OF THE TOUR — two sources, and you need both.
 *
 * 1. **Notated editions** (`delivery.noteEdit`, which comes from permissions
 *    `edit` d'opencode). Fiable en v1 : il n'y a pas de bouton « toujours
 * allow”, so no edit is silent. **The day there is one,
 * `always` on `edit` has the pattern `*` and will render subsequent editions
 * invisible** — this list will then become FALSE, not just incomplete,
 * and it is the second source which will have to catch up.
 * 2. **The delta of the two snapshots**, which sees what no writing tool has
 * product: a lockfile rewritten by `npm install`, a codegen, a `rm` of
 * shell. Without it these files would simply be missing from the pull request.
 *
 * Neither of the two is enough: `git status` alone would also see the WIP of
 * the user, and noted edits alone would miss the entire shell.
 *
 * `owned` is what the PREVIOUS laps of the same run had already edited. He doesn't
 * only serves `carried`: after a round, the agent's work remains “modified”
 * in the working tree (our commits live on a ref, not on its HEAD), and
 * without this subtraction each file of the agent would denounce itself as
 * of the user's work taken away.
 */
export function turnPaths(opts: {
  /** Paths edited by the tools DURING this tour (relating to the repository). */
  edited: Iterable<string>;
  /** Paths already edited by previous rounds of this run. */
  owned?: Iterable<string>;
  before: RepoState;
  after: RepoState;
}): TurnPaths {
  const paths = new Set<string>();
  for (const path of opts.edited) {
    const clean = path.trim();
    if (clean) paths.add(clean);
  }
  for (const [path, code] of opts.after) {
    if (opts.before.get(path) !== code) paths.add(path);
  }
  // A path disappeared from the end snapshot even though it was modified at the beginning
  // does NOT count: it is the user (or agent) who returned the file to their
  // original condition, there is nothing to deliver.

  const owned = new Set<string>();
  for (const path of opts.owned ?? []) owned.add(path.trim());
  const carried = [...paths].filter((path) => opts.before.has(path) && !owned.has(path));

  return { paths: [...paths].sort(), carried: carried.sort() };
}

/**
 * THE LIST OF PATHS, PASSED THROUGH A FILE AND NOT THROUGH THE COMMAND LINE.
 *
 * Two reasons, and the second is the real one: a redesign round affects
 * hundreds of files and `sh -c` has a limit (`E2BIG`); above all, `-z` — the
 * only format where an accented or spaced path is reread without ambiguity — is not
 * accepted by `check-ignore` and `update-index` than with `--stdin` (measured:
 * "-z only makes sense with --stdin"). The file lives under the DU RUN root,
 * therefore outside the repository: it never appears in anyone's `git status`.
 */
async function writePathList(host: RepoHost, name: string, paths: string[]): Promise<string> {
  const file = `${host.layout.root}/${name}`;
  await host.mkdir(host.layout.root).catch(() => {});
  await host.writeFile(file, paths.map((path) => `${path}\0`).join(""));
  return file;
}

/**
 * REMOVE THE GITIGNORED PATHS. `update-index` is plumbing: it involves a
 * `.env.local` without a word. In this mode, this `.env.local` is the REAL file of
 * user secrets.
 *
 * `git check-ignore` makes ignored paths on stdout, outputs 0 if it has any
 * found, in 1 otherwise, and in 128 on error — this last case does not filter anything
 * rather than throwing everything away. It consults the index, so a TRACKED file is not
 * never returned as ignored, even if it matches a pattern: that's what we want.
 */
export async function dropIgnoredPaths(host: RepoHost, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return paths;
  try {
    const file = await writePathList(host, "ignore-probe", paths);
    const res = await host.exec(`git check-ignore -z --stdin < ${sq(file)}`, { timeoutMs: 30_000 });
    if (res.exitCode !== 0) return paths;
    const ignored = new Set(res.stdout.split("\0").filter(Boolean));
    return paths.filter((path) => !ignored.has(path));
  } catch {
    return paths;
  }
}

/** What the preparation found in the user's repository. */
export interface CurrentRepoState {
  /** The commit on which the run is based: our anchor if the run has already committed,
   * the HEAD of the checkout otherwise. */
  parent: string;
  /** The branch that the user has under their fingers (empty if HEAD is detached). */
  branch: string;
  /** Does the turn repeat an existing anchor (second turn, or repeat)? */
  resumed: boolean;
  /** Files already modified in its working tree when the round started. */
  dirty: number;
  /** The snapshot already read to calculate `dirty`, reused by the supervisor. */
  state: RepoState;
}

/**
 * PREPARE THE ROUND IN THE CURRENT DEPOSIT — and don't clone, checkout, configure
 * Nothing. It is the counterpart of `cloneRepo`, and it is much shorter because
 * everything `cloneRepo` makes is already there.
 *
 * Trois gestes seulement :
 *
 * 1. **check that `layout.repoDir` IS the root of a git repository.** Reject one
 * subfolder is not zealous: the tour paths are relative to the
 * root of the repository, and a subfolder would silently shift them all;
 * 2. **find the anchor of the run** — the local ref if it exists, otherwise the
 * working branch on the remote (the run has already pushed, from here or elsewhere),
 *    sinon rien ;
 * 3. **read the starting state**: HEAD, branch, cleanliness.
 *
 * LIFT if the deposit is not usable, like `cloneRepo`: a trick that doesn't know
 * not where he writes does not have degraded mode.
 */
export async function prepareCurrentRepo(
  host: RepoHost,
  opts: {
    runId: string;
    authUrl: string;
    workBranch: string;
    remoteWorkMayExist?: boolean;
    /** Base branch chosen at launch: a cloud branch is brought back
     * before opening OpenCode, without ever moving the user's HEAD. */
    baseBranch?: string;
  },
): Promise<CurrentRepoState> {
  const { repoDir } = host.layout;
  const toplevel = await host.exec(`git rev-parse --show-toplevel && pwd -P`, {
    timeoutMs: 30_000,
  });
  const [root, cwd] = toplevel.stdout.trim().split("\n");
  if (toplevel.exitCode !== 0 || !root) {
    throw new Error(
      `local repository unusable: ${repoDir} is not a git repository ` +
        `(${(toplevel.stderr || toplevel.stdout).trim().slice(0, 200)})`,
    );
  }
  if (root !== cwd) {
    throw new Error(
      `local repository unusable: ${repoDir} is inside the repository at ${root}, not its root — ` +
        `attach the repository root to the project`,
    );
  }

  const ref = runWorkRef(opts.runId);
  const base = opts.baseBranch?.trim() ?? "";
  const baseRef = `refs/minddy/run/${opts.runId.replace(/[^A-Za-z0-9_-]/g, "-") || "run"}/base`;
  // A branch proposed as local by the picker must remain local: the
  // download again cost ~1s each conversation, then the code
  // nevertheless left HEAD. The two refs are independent, therefore read
  // in parallel.
  const [localBase, localRunParent] = await Promise.all([
    base ? revParse(host, `refs/heads/${base}`) : Promise.resolve(""),
    revParse(host, ref),
  ]);

  let baseParent = localBase;
  if (base && !baseParent) {
    // The branch only exists in the cloud: we bring it under a private ref to
    // minddy, without moving HEAD or user refs.
    const fetched = await host.exec(
      `git fetch --no-tags --quiet ${sq(opts.authUrl)}` +
        ` ${sq(`+refs/heads/${base}:${baseRef}`)}`,
      { timeoutMs: 120_000 },
    );
    if (fetched.exitCode !== 0) {
      throw new Error(
        `could not synchronize base branch ${base}: ` +
          `${(fetched.stderr || fetched.stdout).trim().slice(0, 300)}`,
      );
    }
    baseParent = await revParse(host, baseRef);
    if (!baseParent) {
      throw new Error(`could not resolve synchronized base branch ${base}`);
    }
  }

  let parent = localRunParent;
  if (!parent && opts.remoteWorkMayExist !== false) {
    // Has the run already pushed, from here or another machine? We bring back our tip
    // sous NOTRE ref — jamais sous `refs/heads/` ni `refs/remotes/origin/`, qui
    // both belong to the user.
    const fetched = await host.exec(
      `git fetch --no-tags --quiet ${sq(opts.authUrl)}` +
        ` ${sq(`+refs/heads/${opts.workBranch}:${ref}`)}`,
      { timeoutMs: 120_000 },
    );
    if (fetched.exitCode === 0) parent = await revParse(host, ref);
  }
  // “Recovered” is said from the RUN, not from the machine: an anchor brought back from the remote is
  // of the work that this run has already pushed, from here or elsewhere. What remains after
  // at this point, a run begins — and it begins on the HEAD of
  // the user (see the header, choice no. 1).
  const resumed = Boolean(parent);
  // These three readings do not depend on each other. Serialize them
  // ajoutait trois forks de shell au chemin critique de chaque tour local.
  const [head, branchResult, state] = await Promise.all([
    parent ? Promise.resolve(parent) : baseParent ? Promise.resolve(baseParent) : revParse(host, "HEAD"),
    host.exec(`git branch --show-current`).catch(() => null),
    readRepoState(host),
  ]);
  parent = head;
  if (!parent) {
    throw new Error(`local repository unusable: ${repoDir} has no commit to build on`);
  }

  const branch = branchResult?.stdout.trim() ?? "";
  return { parent, branch, resumed, dirty: state.size, state };
}

/** The sha of a ref, or "" if it does not exist. Never lift. */
async function revParse(host: RepoHost, ref: string): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse --verify --quiet ${sq(`${ref}^{commit}`)}`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/** What `commitTurnAndPush` renders — the form of `commitAndPush`, plus what the
 * Current deposit mode is the only one to know. */
export interface CurrentRepoPush {
  committed: boolean;
  remoteUpdated: boolean;
  headSha: string;
  pushed: boolean;
  /** The paths delivered by this commit. */
  paths: string[];
  /** Those of them that the user had also modified (see `TurnPaths`). */
  carried: string[];
}

/**
 * COMMIT BY TEMPORARY INDEX, THEN PUSH — the heart of the current deposit mode.
 *
 * ```
 * GIT_INDEX_FILE=<jetable> git read-tree <parent> # parent's tree, not its own
 * GIT_INDEX_FILE=<jetable> git update-index --add --remove -- <chemins du tour>
 * GIT_INDEX_FILE=<jetable> git write-tree                  # l'arbre du commit
 * git -c user.email=… commit-tree <arbre> -p <parent> # no hook, no HEAD
 * git update-ref <ancre du run> <commit>
 * git push <url> <commit>:refs/heads/<branche>
 * ```
 *
 * The user's index, HEAD and working tree are not affected by
 * none of these six commands — verified on a real repository
 * ([current-repo.git.test.ts](current-repo.git.test.ts)).
 *
 * NO BRANCH FOR NOTHING, like `commitAndPush` (MIN-123): if the tree writes
 * is identical to that of the parent, there is nothing to commit, and if the run has not
 * never pushed anything so there is nothing to push either. A round of questions
 * or plan therefore leaves no branch on the user's repository.
 *
 * `remoteUpdated` keeps exactly the meaning it has on the microVM side: does the push have
 * moves the remote branch FORWARD? It is he, and not `committed`, that the
 * function reads to reopen a refused pull request.
 */
export async function commitTurnAndPush(
  host: RepoHost,
  opts: {
    runId: string;
    authUrl: string;
    workBranch: string;
    message: string;
    committer: { name: string; email: string };
    /**
     * What to commit to WHEN THE RUN HAS NO ANCHOR YET — the HEAD of the
     * checkout, tel que `prepareCurrentRepo` l'a lu.
     *
     * The real parent is read HERE with each call. This is what makes the
     * safe function to call twice in a round (`create_pr`, then the end of
     * turn): a caller who forgets to state his state would otherwise create a
     * BROTHER of the first commit, and the push would go non-fast-forward.
     */
    fallbackParent: string;
    /** The perimeter of the tour, already united and already cleared of ignored paths. */
    scope: TurnPaths;
  },
): Promise<CurrentRepoPush> {
  const ref = runWorkRef(opts.runId);
  const anchor = await revParse(host, ref);
  const parent = anchor || opts.fallbackParent;
  const indexFile = `${host.layout.root}/turn-index`;
  const env = { GIT_INDEX_FILE: indexFile };

  // The disposable index is REDONE at each call (`create_pr` then end of turn, or
  // two turns in the same run root): an index left by a call
  // previous would carry paths which are no longer those of the tour. And he lives under
  // the root of the RUN, never in the repository: `git status` must not see anything.
  await host.mkdir(host.layout.root).catch(() => {});
  const wipe = await host.exec(`rm -f ${sq(indexFile)}`);
  if (wipe.exitCode !== 0) throw new Error(`temp index cleanup failed: ${wipe.stderr}`);

  const read = await host.exec(`git read-tree ${sq(parent)}`, { env, timeoutMs: 120_000 });
  if (read.exitCode !== 0) {
    throw new Error(`git read-tree failed: ${read.stderr || read.stdout}`);
  }

  if (opts.scope.paths.length > 0) {
    // `--add` takes the new files, `--remove` records those which have disappeared from
    // disk. A path that does not exist on disk or in the tree is ignored
    // error-free (measured): the list does not need to be exact.
    const list = await writePathList(host, "turn-paths", opts.scope.paths);
    const staged = await host.exec(
      `git update-index --add --remove -z --stdin < ${sq(list)}`,
      { env, timeoutMs: 120_000 },
    );
    if (staged.exitCode !== 0) {
      throw new Error(`git update-index failed: ${staged.stderr || staged.stdout}`);
    }
  }

  const written = await host.exec(`git write-tree`, { env, timeoutMs: 120_000 });
  const tree = written.stdout.trim();
  if (written.exitCode !== 0 || !tree) {
    throw new Error(`git write-tree failed: ${written.stderr || written.stdout}`);
  }
  const parentTree = await host.exec(`git rev-parse ${sq(`${parent}^{tree}`)}`);

  let headSha = parent;
  let committed = false;
  if (parentTree.stdout.trim() !== tree) {
    const commit = await host.exec(
      `git ${gitIdentityFlags(opts.committer)} commit-tree ${sq(tree)} -p ${sq(parent)}` +
        ` -m ${sq(opts.message)}`,
      { timeoutMs: 120_000 },
    );
    headSha = commit.stdout.trim();
    if (commit.exitCode !== 0 || !headSha) {
      throw new Error(`git commit-tree failed: ${commit.stderr || commit.stdout}`);
    }
    const moved = await host.exec(`git update-ref ${sq(ref)} ${sq(headSha)}`);
    if (moved.exitCode !== 0) {
      throw new Error(`git update-ref failed: ${moved.stderr || moved.stdout}`);
    }
    committed = true;
  }
  await host.exec(`rm -f ${sq(indexFile)}`).catch(() => {});

  /**
   * WHAT THIS COMMIT DELIVERED — empty when there was no commit, and this is
   * which counts: `carried` triggers a note in the thread (“work of yours is
   * left in the pull request"), and publish it on a tour which has nothing
   * committed would announce a damage which did not occur.
   */
  const delivered = committed
    ? { paths: opts.scope.paths, carried: opts.scope.carried }
    : { paths: [], carried: [] };

  // Nothing committed and nothing pushed before: no branch to create on the
  // user repository for a ride that didn't touch the code.
  if (!committed && !anchor) {
    return { ...delivered, committed: false, remoteUpdated: false, headSha, pushed: false };
  }

  const remote = await host.exec(
    `git ls-remote ${sq(opts.authUrl)} ${sq(`refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 60_000 },
  );
  const remoteSha = remote.exitCode === 0 ? remote.stdout.trim().split(/\s/)[0] ?? "" : "";

  // By SHA, and not `HEAD:refs/heads/…`: HEAD is that of the user.
  const push = await host.exec(
    `git push ${sq(opts.authUrl)} ${sq(`${headSha}:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return { ...delivered, committed, remoteUpdated: remoteSha !== headSha, headSha, pushed: true };
}
