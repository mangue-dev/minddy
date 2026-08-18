/**
 * THE LOCAL FOLDER OF A PROJECT (MIN-359) — the half that is decided without a disk.
 *
 * The desktop app attaches a machine folder to a project; it is this folder
 * that the agent will open when the conversation is local (D1 of
 * [docs/audits/agent-local-2026-08-14.md](../../docs/audits/agent-local-2026-08-14.md)).
 * Everything that is decided here — is this a git repository, is this THE project repository,
 * what is the settings file allowed to contain — is written in
 * pure, tested functions, like navigation guard and micro guard.
 * The `fs` and the system panel live in `desktop/src/local-repo.ts`.
 *
 * ## The setting is attach, and it only exists on one machine
 *
 * The scoping placed the "run locally" opt-in at the PROJECT level. This is
 * untenable: a home path means nothing anywhere other than on the machine which
 * carries it, and storing it on the server side would publish it — false — to all members.
 * The attachment therefore lives in `userData`, by project, on THIS machine, and it
 * there is nothing to migrate on the database side: `agent_runs.local_exec` (MIN-355) is the only one
 * server state, per run, frozen at launch.
 *
 * Product consequence, which must be assumed rather than discovered: on a project with
 * three, a member on Windows just doesn't see the selector and its runs
 * go to the cloud. An owner also cannot DENY local
 * to its members — that's an organizational policy, not this lot.
 *
 * ## No `git` launched to validate
 *
 * We read `.git/config` with `fs`, we do not launch `git`. On a Mac without Command
 * Line Tools, the slightest invocation of `git` brings up the
 * installation window for

/** Why a folder cannot serve as a local repository for this project. */
export type LocalRepoRefusal =
  /** The path no longer exists, or is not a folder (repository moved, disk unmounted). */
  | "missing"
  /** No readable `.git`: this is not a repository (nor a worktree). */
  | "notGit"
  /** A repository, but without any remote: impossible to say which one it is. */
  | "noRemote"
  /** A repository, but not the one the project linked to. */
  | "wrongRepo";

/** What we know about the file after reading the disk — the decision entry. */
export interface LocalRepoFacts {
  /** The path exists AND it is a folder. */
  readonly isDirectory: boolean;
  /** The content of `.git/config`, or `null` if you were unable to read it. */
  readonly gitConfig: string | null;
}

/** The repository that the project linked to, as the server names it. */
export interface ExpectedRepo {
  /** `owner/name` (GitHub) or `group/subgroup/project` (GitLab). */
  readonly fullName: string;
}

/**
 * The state of an attachment, as the page reads it. A single type for all three
 * gestures (read, attach, detach): the caller never has to cross two
 * shapes to know what to display.
 */
export type LocalRepoState =
  | { readonly status: "none" }
  | { readonly status: "ready"; readonly path: string; readonly folder: string }
  | {
      readonly status: "invalid";
      readonly path: string;
      readonly reason: LocalRepoRefusal;
    };

/**
 * Remotes declared in a `.git/config`.
 *
 * The format is that of `git config`: sections `[remote "nom"]` followed by
 * `key = value`. We only look for `url`, and we tolerate what git tolerates —
 * free indentation, spaces around `=`, single-line sections
 * (`[remote "origin"]` with the subsection in quotes).
 */
export function parseGitConfigRemotes(
  text: string,
): { name: string; url: string }[] {
  const remotes: { name: string; url: string }[] = [];
  let current: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[")) {
      // `[remote "origin"]`, and nothing else: `[core]`, `[branch "main"]`,
      // `[submodule …]` closes the current section without adding anything.
      const section = /^\[remote\s+"(.+)"\]$/.exec(line);
      current = section ? (section[1] ?? null) : null;
      continue;
    }
    if (!current) continue;
    const pair = /^url\s*=\s*(.+)$/.exec(line);
    if (pair?.[1]) remotes.push({ name: current, url: pair[1].trim() });
  }
  return remotes;
}

/**
 * The `owner/repo` that a remote URL designates, or `null`.
 *
 * Three forms, and you need all three: `git@host:owner/repo.git` (the historical SCP
 *, which GitHub offers by default), `ssh://git@host/owner/repo.git`
 * and `https://host/owner/repo(.git)`. GitLab allows subgroups, everything after the host is kept, not just two segments.
 */
export function remoteRepoPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // SCP form: no URL in the sense of `new URL`, it must be recognized separately.
  const scp = /^[^/]+@([^/:]+):(.+)$/.exec(trimmed);
  const raw = scp
    ? scp[2]
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? safeUrlPath(trimmed)
      : null;
  if (!raw) return null;

  const path = raw.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  return path.includes("/") ? path : null;
}

function safeUrlPath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Is this folder the repository that the project linked to?
 *
 * **We are comparing the repository path, NOT the host** — and it is a decision, not a
 * shortcut. The same repository is joined by `github.com`, by a GitHub Enterprise,
 * by a self-hosted GitLab or by an internal mirror; requiring the host from the
 * provider would refuse perfectly legitimate files, and the refusal would be
 * incomprehensible. The residual risk — two out of two identical `owner/repo` * forges — supposes that someone chooses the wrong folder by choosing it themselves
 * in a system panel: it is a safeguard against inattention, not a boundary.
 */
export function remoteMatchesRepo(url: string, expected: ExpectedRepo): boolean {
  const path = remoteRepoPath(url);
  if (!path) return false;
  const wanted = expected.fullName.trim().replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!wanted) return false;
  return path.toLowerCase() === wanted.toLowerCase();
}

/** Can the folder be used as a local repository for this project? */
export function localRepoVerdict(
  facts: LocalRepoFacts,
  expected: ExpectedRepo,
): { ok: true } | { ok: false; reason: LocalRepoRefusal } {
  if (!facts.isDirectory) return { ok: false, reason: "missing" };
  if (facts.gitConfig === null) return { ok: false, reason: "notGit" };
  const remotes = parseGitConfigRemotes(facts.gitConfig);
  if (remotes.length === 0) return { ok: false, reason: "noRemote" };
  const matched = remotes.some((remote) => remoteMatchesRepo(remote.url, expected));
  return matched ? { ok: true } : { ok: false, reason: "wrongRepo" };
}

/**
 * The pointer to a `.git` FILE — what `.git` is in a worktree and in a
 * submodule: a `gitdir: <chemin>` line. The path can be relative to
 * folder which contains the file; it's up to the caller to resolve it, it has `path`.
 */
export function parseGitDirPointer(text: string): string | null {
  const match = /^\s*gitdir:\s*(.+?)\s*$/m.exec(text);
  return match?.[1] ?? null;
}

/** What the settings file contains: one path per project. */
export type LocalRepoStore = Record<string, string>;

/**
 * The store read from disk, reduced to what it has the right to be.
 *
 * **Everything that is not a pair of strings disappears silently**, like the
 * channel: a file truncated by a hard shutdown should not prevent the app from
 * open, and a relative path dragged there by hand must not become the
 * working folder of an agent.
 */
export function parseLocalRepoStore(raw: unknown): LocalRepoStore {
  if (typeof raw !== "object" || raw === null) return {};
  const projects = (raw as { projects?: unknown }).projects;
  if (typeof projects !== "object" || projects === null) return {};
  const store: LocalRepoStore = {};
  for (const [projectId, value] of Object.entries(projects as Record<string, unknown>)) {
    if (!projectId) continue;
    const path = typeof value === "string" ? value : null;
    if (path && path.startsWith("/")) store[projectId] = path;
  }
  return store;
}

/** The form written on the disk — a named object, so it can grow. */
export function serializeLocalRepoStore(store: LocalRepoStore): string {
  return `${JSON.stringify({ projects: store }, null, 2)}\n`;
}

export function withLocalRepo(
  store: LocalRepoStore,
  projectId: string,
  path: string,
): LocalRepoStore {
  return { ...store, [projectId]: path };
}

export function withoutLocalRepo(
  store: LocalRepoStore,
  projectId: string,
): LocalRepoStore {
  const { [projectId]: _removed, ...rest } = store;
  return rest;
}

/** The last segment of a path — what the chip displays when there is no space. */
export function localRepoFolderName(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}
