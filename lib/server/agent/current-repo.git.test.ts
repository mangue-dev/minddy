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
 * MIN-358 — LA CHAÎNE DE FIN DE TOUR CONTRE UN VRAI DÉPÔT GIT, dans un vrai
 * checkout habité par un humain.
 *
 * Même raison d'être que [sandbox-push-git.test.ts](sandbox-push-git.test.ts) :
 * ce qui se joue ici n'est pas notre logique (couverte en host factice par
 * [current-repo.test.ts](current-repo.test.ts)) mais le COMPORTEMENT DE GIT. La
 * promesse du ticket est « l'index, le HEAD et l'arbre de travail de
 * l'utilisateur ne sont pas touchés », et elle ne se vérifie qu'en regardant son
 * dépôt après coup.
 *
 * Le décor est celui du mode dépôt courant : un dépôt distant, un checkout que
 * l'utilisateur a déjà — avec du WIP, une branche à lui, un `pre-commit` hostile
 * et un `.gitignore` qui couvre son `.env.local` — et une racine de run posée
 * AILLEURS, comme le layout l'exige.
 *
 * `realpathSync` sur le dossier temporaire, et ce n'est pas de la coquetterie :
 * `/var/folders/…` de macOS est un lien symbolique, `git rev-parse
 * --show-toplevel` rend le chemin physique, et la préparation compare les deux.
 * Un lanceur qui attache un dossier au projet a le même devoir (MIN-359).
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
/** L'identité du HARNESS — jamais celle du dépôt, qui reste à `humaine`. */
const COMMITTER = { name: "minddy[bot]", email: "42+minddy[bot]@users.noreply.github.com" };
const HUMAN_IDENTITY = `git config user.email humaine@example.com && git config user.name humaine && git config commit.gpgsign false`;

/** Branches qui existent VRAIMENT sur le dépôt distant. */
async function remoteHeads(): Promise<string[]> {
  const { stdout } = await sh(`git ls-remote --heads ${origin}`, origin);
  return stdout.trim().split("\n").filter(Boolean).map((line) => line.split("\t")[1] ?? "");
}

/** L'état de l'utilisateur, en une lecture : de quoi comparer avant et après. */
async function humanState(): Promise<Record<string, string>> {
  const { stdout } = await sh(
    `git rev-parse HEAD && git branch --show-current && git write-tree && git status --porcelain`,
    repo,
  );
  const [head, branch, index, ...status] = stdout.trim().split("\n");
  return { head, branch, index, status: status.sort().join("|") };
}

/** Un push de fin de tour : le périmètre est recalculé, comme le fait le superviseur. */
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
 * Ce que le commit de la branche de travail apporte au HEAD de l'utilisateur.
 *
 * `core.quotePath=false` et une normalisation NFC : git cite les chemins
 * non-ASCII par défaut, et APFS les range en NFD. Ni l'un ni l'autre ne dit quoi
 * que ce soit de ce qu'on teste — mais les deux suffisent à faire échouer une
 * comparaison de chaînes.
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

  // Le décor de l'humain : sa branche, son WIP suivi, son fichier non suivi, son
  // `.env.local` réel, et un `pre-commit` qui casse tout ce qui l'appelle.
  await sh(`git checkout -q -b humaine`, repo);
  await sh(`printf 'mon WIP\n' >> f.txt`, repo);
  await sh(`printf 'notes perso\n' > NOTES.md`, repo);
  await sh(`printf 'SECRET=1\n' > .env.local`, repo);
  await sh(
    `printf '#!/bin/sh\nexit 1\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`,
    repo,
  );

  // La racine du RUN est ailleurs : le harness n'écrit jamais dans le dépôt.
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
    // f.txt modifié, NOTES.md non suivi. `.env.local` est ignoré, donc invisible.
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

    // Ce que l'agent fait par ses tools d'écriture…
    await sh(`printf 'de agent\n' > agent.ts`, repo);
    await sh(`printf 'SECRET=vole\n' > .env.local`, repo);
    // …ce qu'il fait par le SHELL, sans passer par aucune permission `edit`…
    await sh(`printf 'lock\n' > pnpm-lock.yaml && rm garde.txt`, repo);
    // …et un chemin que ni l'un ni l'autre n'a produit (il n'existe pas).
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
    // Le WIP de l'humain est resté chez lui, et son `.env.local` avec.
    expect(await deliveredFiles()).not.toContain("M\tf.txt");
    expect(await deliveredFiles()).not.toContain("A\tNOTES.md");
    expect(await deliveredFiles()).not.toContain("A\t.env.local");
  });

  it("n'a touché ni son HEAD, ni sa branche, ni son index, ni son arbre", async () => {
    const after = await humanState();
    expect(after.head).toBe(humanBefore.head);
    expect(after.branch).toBe("humaine");
    expect(after.index).toBe(humanBefore.index);
    // Son WIP est toujours là, mot pour mot.
    const { stdout } = await sh(`tail -1 f.txt && cat NOTES.md`, repo);
    expect(stdout).toBe("mon WIP\nnotes perso\n");
  });

  it("n'a pas lancé son `pre-commit` — `commit-tree` n'a pas de hook", async () => {
    // Le hook sort en 1 : s'il avait tourné, le commit précédent aurait levé.
    // On le redit ici en le rendant BAVARD, pour que l'échec soit lisible le jour
    // où quelqu'un remplacerait la plomberie par un `git commit`.
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
   * LE CAS QU'AUCUNE ASTUCE NE REFERME : l'agent édite un fichier que
   * l'utilisateur avait déjà modifié. Le commit emporte alors son travail à lui,
   * et la seule conduite honnête est de le NOMMER — c'est ce que le superviseur
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
   * …et l'inverse, qui est le piège : le travail que l'AGENT a laissé au tour
   * précédent est encore « modifié » dans l'arbre de travail, puisque nos commits
   * vivent sur une ref et pas sur le HEAD de l'utilisateur. Sans la soustraction
   * de `owned`, chaque fichier de l'agent se dénoncerait comme du travail humain.
   */
  it("ne prend pas son propre travail des tours précédents pour celui de l'humain", async () => {
    const later = await readRepoState(host);
    expect(later.has("agent.ts")).toBe(true);
    const scope = turnPaths({ edited: ["agent.ts"], owned: ["agent.ts"], before: later, after: later });
    expect(scope.carried).toEqual([]);
  });
});

/**
 * MIN-358 — LE PÉRIMÈTRE APPLIQUÉ AUX LECTURES DE DIFF DE FIN DE TOUR.
 *
 * C'est la moitié du ticket qu'on oublie : le commit ne livre que les chemins de
 * l'agent, mais l'auto-relecture et la portée des tests, elles, comparent une
 * référence à l'ARBRE DE TRAVAIL — qui contient aussi le WIP de l'utilisateur.
 * Sans borne, le modèle relit le travail de quelqu'un d'autre comme s'il était
 * le sien.
 */
describe("les lectures de diff, bornées", () => {
  it("sans borne, elles voient le WIP de l'utilisateur", async () => {
    const { porcelain } = await turnDiff(host, prepared.parent);
    expect(porcelain).toContain("NOTES.md");
  });

  it("bornées au périmètre, elles ne voient que l'agent", async () => {
    // `f.txt` est suivi, donc il sort du `git diff` ; `agent.ts` est neuf dans le
    // checkout (nos commits vivent sur une ref), donc il ne sort que du statut —
    // c'est pour ça que `turnDiff` rend les deux.
    const { diff, porcelain } = await turnDiff(host, prepared.parent, ["agent.ts", "f.txt"]);
    expect(diff).toContain("f.txt");
    expect(porcelain).toContain("agent.ts");
    expect(porcelain).not.toContain("NOTES.md");
  });

  /**
   * ET LE CAS QUI SE TROMPE TOUT SEUL : une liste VIDE doit borner à RIEN. Un
   * `-- ` nu se lit comme « tout », c'est-à-dire l'inverse — et un tour qui n'a
   * touché à aucun fichier rendrait alors l'arbre entier de l'utilisateur.
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
