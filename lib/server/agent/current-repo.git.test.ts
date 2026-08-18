import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  commitTurnAndPush,
  dropIgnoredPaths,
  prepareCurrentRepo,
  readRepoState,
  runWorkRef,
  turnPaths,
  type CurrentRepoState,
  type RepoState,
} from "./current-repo";
import { layoutForCurrentRepo } from "./harness-layout";
import { turnDiff, turnDiffStat } from "./repo-host";
import { localHost } from "./vm/local-host";

/**
 * MIN-358 — THE END OF ROUND CHAIN ​​AGAINST A REAL GIT REPOSITORY, in a real
 * checkout manned by a human.
 *
 * Same reason as [sandbox-push-git.test.ts](sandbox-push-git.test.ts):
 * what is at stake here is not our logic (covered in dummy host by
 * [current-repo.test.ts](current-repo.test.ts)) but the BEHAVIOR OF GIT. There
 * ticket promise is "the index, HEAD and working tree of
 * the user are not affected", and it is only verified by looking at his
 * deposit afterwards.
 *
 * The setting is that of the current deposit mode: a remote deposit, a checkout that
 * the user already has — with WIP, a branch of his own, a hostile `pre-commit`
 * and a `.gitignore` which covers its `.env.local` — and a run root posed
 * ELSEWHERE, as the layout requires.
 *
 * `realpathSync` on the temporary folder, and it's not coquetry:
 * macOS's `/var/folders/…` is a symbolic link, `git rev-parse
 * --show-toplevel` renders the physical path, and the preparation compares the two.
 * A launcher who attaches a folder to the project has the same duty (MIN-359).
 */

const run = promisify(execFile);
const sh = (cmd: string, cwd: string) => run("sh", ["-c", cmd], { cwd });

let root: string;
let origin: string;
let repo: string;
let host: ReturnType<typeof localHost>;
let prepared: CurrentRepoState;
let before: RepoState;

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const WORK_BRANCH = "minddy/agent/min-358-abcd1234";
/** The identity of the HARNESS — never that of the repository, which remains at `humaine`. */
const COMMITTER = { name: "minddy[bot]", email: "42+minddy[bot]@users.noreply.github.com" };
const HUMAN_IDENTITY = `git config user.email humaine@example.com && git config user.name humaine && git config commit.gpgsign false`;

/** Branches that REALLY exist on the remote repository. */
async function remoteHeads(): Promise<string[]> {
  const { stdout } = await sh(`git ls-remote --heads ${origin}`, origin);
  return stdout.trim().split("\n").filter(Boolean).map((line) => line.split("\t")[1] ?? "");
}

/** The state of the user, in one reading: enough to compare before and after. */
async function humanState(): Promise<Record<string, string>> {
  const { stdout } = await sh(
    `git rev-parse HEAD && git branch --show-current && git write-tree && git status --porcelain`,
    repo,
  );
  const [head, branch, index, ...status] = stdout.trim().split("\n");
  return { head, branch, index, status: status.sort().join("|") };
}

/** An end-of-turn push: the perimeter is recalculated, as the supervisor does. */
async function push(message: string, edited: string[], owned: string[] = []) {
  const scope = turnPaths({ edited, owned, before, after: await readRepoState(host) });
  return await commitTurnAndPush(host, {
    runId: RUN_ID,
    authUrl: `file://${origin}`,
    workBranch: WORK_BRANCH,
    message,
    committer: COMMITTER,
    fallbackParent: prepared.parent,
    scope: { ...scope, paths: await dropIgnoredPaths(host, scope.paths) },
  });
}

/**
 * What the working branch commit does to the user's HEAD.
 *
 * `core.quotePath=false` and NFC normalization: git quotes the paths
 * non-ASCII by default, and APFS stores them as NFD. Neither one says what
 * whether it's what we're testing — but both are enough to fail a
 * string comparison.
 */
async function deliveredFiles(): Promise<string[]> {
  const ref = runWorkRef(RUN_ID);
  const { stdout } = await sh(`git -c core.quotePath=false diff --name-status HEAD ${ref}`, repo);
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.normalize("NFC"))
    .sort();
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "minddy-current-repo-")));
  origin = path.join(root, "origin");
  repo = path.join(root, "checkout");

  await sh(`mkdir origin`, root);
  await sh(
    `git init -q --initial-branch=main . && ${HUMAN_IDENTITY} && ` +
      `printf 'un\n' > f.txt && printf 'garde\n' > garde.txt && printf '.env*\n' > .gitignore && ` +
      `git add -A && git commit -qm un`,
    origin,
  );
  await sh(`git clone -q file://${origin} checkout`, root);
  await sh(`${HUMAN_IDENTITY}`, repo);

  // The setting of the human: its branch, its monitored WIP, its untracked file, its
  // `.env.local` real, and a `pre-commit` which breaks everything that calls it.
  await sh(`git checkout -q -b humaine`, repo);
  await sh(`printf 'mon WIP\n' >> f.txt`, repo);
  await sh(`printf 'notes perso\n' > NOTES.md`, repo);
  await sh(`printf 'SECRET=1\n' > .env.local`, repo);
  await sh(
    `printf '#!/bin/sh\nexit 1\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`,
    repo,
  );

  // The root of RUN is elsewhere: the harness never writes to the repository.
  host = localHost(layoutForCurrentRepo(path.join(root, "run"), repo, path.join(root, "oc")));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("préparer le dépôt courant", () => {
  it("ne clone rien, ne checkout rien, et lit ce que l'utilisateur a sous les doigts", async () => {
    prepared = await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: `file://${origin}`,
      workBranch: WORK_BRANCH,
    });
    before = await readRepoState(host);

    const { stdout: head } = await sh(`git rev-parse HEAD`, repo);
    expect(prepared.parent).toBe(head.trim());
    expect(prepared.branch).toBe("humaine");
    expect(prepared.resumed).toBe(false);
    // f.txt modified, NOTES.md not followed. `.env.local` is ignored, therefore invisible.
    expect(prepared.dirty).toBe(2);
    expect(before.has(".env.local")).toBe(false);
  });

  it("refuse un sous-dossier — les chemins du tour seraient tous décalés", async () => {
    await sh(`mkdir -p lib`, repo);
    const sub = localHost(
      layoutForCurrentRepo(path.join(root, "run"), path.join(repo, "lib"), path.join(root, "oc")),
    );
    await expect(
      prepareCurrentRepo(sub, { runId: RUN_ID, authUrl: `file://${origin}`, workBranch: WORK_BRANCH }),
    ).rejects.toThrow(/not its root/);
  });
});

describe("le tour qui n'a rien fait", () => {
  it("ne crée AUCUNE branche sur le dépôt de l'utilisateur", async () => {
    const res = await push("wip(MIN-358): agent update", []);

    expect(res).toMatchObject({ committed: false, pushed: false, remoteUpdated: false });
    expect(await remoteHeads()).toEqual(["refs/heads/main"]);
  });
});

describe("le tour qui a travaillé", () => {
  let humanBefore: Record<string, string>;

  it("ne livre que les chemins de l'agent, et pas le WIP de l'humain", async () => {
    humanBefore = await humanState();

    // What the agent does with his writing tools…
    await sh(`printf 'de agent\n' > agent.ts`, repo);
    await sh(`printf 'SECRET=vole\n' > .env.local`, repo);
    // …which he does through SHELL, without going through any permission `edit`…
    await sh(`printf 'lock\n' > pnpm-lock.yaml && rm garde.txt`, repo);
    // …and a path that neither of them produced (it does not exist).
    const res = await push("feat(MIN-358): du vrai travail", [
      "agent.ts",
      ".env.local",
      "jamais-cree.ts",
    ]);

    expect(res).toMatchObject({ committed: true, pushed: true, remoteUpdated: true });
    expect(await deliveredFiles()).toEqual([
      "A\tagent.ts",
      "D\tgarde.txt",
      "A\tpnpm-lock.yaml",
    ].sort());
    // The human's WIP remained at home, and his `.env.local` with it.
    expect(await deliveredFiles()).not.toContain("M\tf.txt");
    expect(await deliveredFiles()).not.toContain("A\tNOTES.md");
    expect(await deliveredFiles()).not.toContain("A\t.env.local");
  });

  it("n'a touché ni son HEAD, ni sa branche, ni son index, ni son arbre", async () => {
    const after = await humanState();
    expect(after.head).toBe(humanBefore.head);
    expect(after.branch).toBe("humaine");
    expect(after.index).toBe(humanBefore.index);
    // His WIP is still there, word for word.
    const { stdout } = await sh(`tail -1 f.txt && cat NOTES.md`, repo);
    expect(stdout).toBe("mon WIP\nnotes perso\n");
  });

  it("n'a pas lancé son `pre-commit` — `commit-tree` n'a pas de hook", async () => {
    // The hook exits at 1: if it had run, the previous commit would have raised.
    // We say it again here by making it TALKING, so that the failure is readable during the day
    // where someone would replace the plumbing with a `git commit`.
    await sh(
      `printf '#!/bin/sh\necho HOOK >> ${path.join(root, "hook.log")}\nexit 1\n' > .git/hooks/pre-commit`,
      repo,
    );
    await sh(`printf 'encore\n' >> agent.ts`, repo);
    await push("wip(MIN-358): encore", ["agent.ts"]);
    await expect(sh(`test -e ${path.join(root, "hook.log")}`, root)).rejects.toThrow();
  });

  it("commite sous l'identité passée, sans réécrire celle de l'utilisateur", async () => {
    const { stdout: author } = await sh(`git log -1 --format='%an <%ae>' ${runWorkRef(RUN_ID)}`, repo);
    expect(author.trim()).toBe(`${COMMITTER.name} <${COMMITTER.email}>`);
    const { stdout: configured } = await sh(`git config user.email`, repo);
    expect(configured.trim()).toBe("humaine@example.com");
  });

  it("chaîne les tours : le second commit a le premier pour parent", async () => {
    const { stdout } = await sh(`git rev-list --count HEAD..${runWorkRef(RUN_ID)}`, repo);
    expect(Number(stdout.trim())).toBe(2);
  });

  it("ne pose aucune branche locale dans le dépôt de l'utilisateur", async () => {
    const { stdout } = await sh(`git branch --format='%(refname:short)'`, repo);
    expect(stdout.trim().split("\n").sort()).toEqual(["humaine", "main"]);
  });

  it("livre un chemin accentué et à espaces — `-z` et rien d'autre", async () => {
    await sh(`printf 'x\n' > "été noté.ts"`, repo);
    const res = await push("feat(MIN-358): un nom qui pique", []);
    expect(res.committed).toBe(true);
    expect(await deliveredFiles()).toContain("A\tété noté.ts");
  });

  /**
   * THE CASE THAT NO TIP CLOSES: the agent edits a file that
   * the user had already edited. The commit then takes its own work,
   * and the only honest conduct is to NAME him — that is what the supervisor
   * publie au fil.
   */
  it("nomme les fichiers dont il emporte le travail de l'utilisateur", async () => {
    await sh(`printf 'de agent aussi\n' >> f.txt`, repo);
    const res = await push("fix(MIN-358): touche au fichier de l'humain", ["f.txt"]);

    expect(res.carried).toEqual(["f.txt"]);
    const { stdout } = await sh(`git show ${runWorkRef(RUN_ID)}:f.txt`, repo);
    expect(stdout).toBe("un\nmon WIP\nde agent aussi\n");
  });

  /**
   * …and the opposite, which is the trap: the work that the AGENT left to the turn
   * previous one is still “modified” in the working tree, since our commits
   * live on a ref and not on the user's HEAD. Without subtraction
   * of `owned`, each file of the agent would be denounced as human work.
   */
  it("ne prend pas son propre travail des tours précédents pour celui de l'humain", async () => {
    const later = await readRepoState(host);
    expect(later.has("agent.ts")).toBe(true);
    const scope = turnPaths({ edited: ["agent.ts"], owned: ["agent.ts"], before: later, after: later });
    expect(scope.carried).toEqual([]);
  });
});

/**
 * MIN-358 — THE SCOPE APPLIED TO END OF TURN DIFF READS.
 *
 * This is half the ticket that we forget: the commit only delivers the paths of
 * the agent, but the self-reading and the scope of the tests, they compare a
 * reference to the WORK TREE — which also contains the user's WIP.
 * Unbounded, the model rereads someone else's work as if it were
 * his.
 */
describe("les lectures de diff, bornées", () => {
  it("sans borne, elles voient le WIP de l'utilisateur", async () => {
    const { porcelain } = await turnDiff(host, prepared.parent);
    expect(porcelain).toContain("NOTES.md");
  });

  it("bornées au périmètre, elles ne voient que l'agent", async () => {
    // `f.txt` is followed, so it comes out of `git diff`; `agent.ts` is new in the
    // checkout (our commits live on a ref), so it only outputs status —
    // that's why `turnDiff` renders both.
    const { diff, porcelain } = await turnDiff(host, prepared.parent, ["agent.ts", "f.txt"]);
    expect(diff).toContain("f.txt");
    expect(porcelain).toContain("agent.ts");
    expect(porcelain).not.toContain("NOTES.md");
  });

  /**
   * AND THE CASE THAT IS WRONG: an EMPTY list must end at NOTHING. A
   * `-- ` nu reads like "all", that is to say the opposite - and a turn which has
   * touching any files would then render the entire user tree.
   */
  it("un périmètre vide ne rend rien, jamais tout", async () => {
    const { diff, porcelain } = await turnDiff(host, prepared.parent, []);
    expect(diff).toBe("");
    expect(porcelain).toBe("");
    expect(await turnDiffStat(host, prepared.parent, [])).toMatchObject({
      files: [],
      lines: 0,
      untracked: 0,
    });
  });
});
