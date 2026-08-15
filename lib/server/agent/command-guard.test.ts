import { describe, expect, it } from "vitest";
import { checkCommand } from "./command-guard";

/**
 * Garde-fou git de `run_command` (MIN-108). Le test qui compte n'est pas la liste
 * des refus — c'est la liste des NON-refus : un faux positif bloque une commande
 * légitime à chaque tour, alors que le risque couvert est rare.
 */

const refused = (cmd: string) => checkCommand(cmd);
const allowed = (cmd: string) => checkCommand(cmd).allowed;

describe("checkCommand — les commandes réellement passées en production", () => {
  // Relevé sur agent_run_events, toute l'histoire du produit.
  it("refuse le `git checkout --` du 2026-07-14", () => {
    const v = refused("git checkout -- components/app-shell-chrome.tsx");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toMatch(/harness owns git/i);
  });

  it("refuse le `cd … && git checkout -- …` du 2026-07-15", () => {
    const v = refused("cd /vercel/sandbox/repo && git checkout -- package-lock.json && git diff --stat");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toMatch(/edit the file back/i);
  });
});

describe("checkCommand — ce qui détruit du travail ou écrit sur le remote", () => {
  for (const cmd of [
    "git commit -m 'wip'",
    "git commit --amend --no-edit",
    "git push origin HEAD",
    "git push --force-with-lease",
    "git reset --hard HEAD",
    "git reset --soft HEAD~1",
    "git rebase -i main",
    "git cherry-pick abc1234",
    "git restore package-lock.json",
    "git restore --staged .",
    "git checkout .",
    "git checkout -f",
    "git stash drop",
    "git stash clear",
    // MIN-244 : `clean -f` et `switch --discard-changes` détruisent exactement ce
    // que le module dit protéger — le travail non commité de la branche.
    "git clean -fd",
    "git clean -f",
    "git clean -xdf",
    "git clean --force",
    "git switch --discard-changes main",
    "git switch -f main",
  ]) {
    it(`refuse \`${cmd}\``, () => {
      expect(allowed(cmd)).toBe(false);
    });
  }

  it("attrape la commande cachée au milieu d'une chaîne", () => {
    expect(allowed("pnpm install; git reset --hard; pnpm build")).toBe(false);
    expect(allowed("pnpm test || git checkout -- .")).toBe(false);
    expect(allowed("echo hi\ngit push\necho bye")).toBe(false);
    expect(allowed("(cd /tmp && git push)")).toBe(false);
    expect(allowed("echo $(git commit -m x)")).toBe(false);
  });

  it("ne se laisse pas contourner par une enveloppe ou un chemin absolu", () => {
    expect(allowed("sudo git push")).toBe(false);
    expect(allowed("/usr/bin/git reset --hard")).toBe(false);
    expect(allowed("GIT_AUTHOR_NAME=x git commit -m y")).toBe(false);
    expect(allowed("git -C /vercel/sandbox/repo checkout -- lib/plan.ts")).toBe(false);
  });

  /**
   * MIN-354 — LE GARDE-FOU NE CONNAÎT AUCUN CHEMIN, ET C'EST CE QUI LE SAUVE.
   *
   * Il lit une commande, jamais un layout : le dépôt qui apparaît dans un `cd`
   * ou un `git -C` n'est qu'un argument. C'était vrai sans qu'on le vérifie tant
   * que ces chaînes venaient toutes de `/vercel/sandbox/repo` — et c'est
   * exactement ce que le lot met à l'épreuve, puisque les commandes d'un run
   * local porteront le chemin du poste. Rien à changer dans `command-guard.ts` :
   * ce bloc ANCRE cette non-dépendance, pour qu'une future « amélioration » qui
   * s'appuierait sur un préfixe se fasse voir ici.
   */
  it("refuse la même chose quel que soit le dépôt cité dans la commande", () => {
    const HOME = "/Users/dev/Projets/app";
    expect(allowed(`git -C ${HOME} checkout -- lib/plan.ts`)).toBe(false);
    expect(allowed(`sh -c 'cd ${HOME} && git push'`)).toBe(false);
    expect(refused(`cd ${HOME} && git checkout -- package-lock.json`).allowed).toBe(false);
    // …et laisse passer la même chose, elle aussi.
    expect(allowed(`cd ${HOME} && git diff --stat`)).toBe(true);
    expect(allowed(`cd ${HOME} && npm test`)).toBe(true);
  });

  // MIN-244 : le shell cachait git derrière son propre `-c`, et `gitInvocation`
  // prenait `bash` pour le binaire. C'est une forme que le modèle écrit tout seul.
  it("re-parse la commande portée par un shell", () => {
    expect(allowed('bash -lc "git reset --hard"')).toBe(false);
    expect(allowed("sh -c 'cd /vercel/sandbox/repo && git push'")).toBe(false);
    expect(allowed('/bin/bash -c "git checkout -- lib/plan.ts"')).toBe(false);
    expect(allowed('zsh -ec "git commit -m wip"')).toBe(false);
    expect(allowed('sudo bash -c "git push --force"')).toBe(false);
    expect(allowed('bash -c "bash -c \\"git push\\""')).toBe(false);
    expect(allowed('sh -c -- "git reset --hard"')).toBe(false);
    expect(allowed('bash -o pipefail -c "git push"')).toBe(false);
  });
});

describe("checkCommand — les faux positifs à ne PAS attraper", () => {
  for (const cmd of [
    "git add -A",
    "git diff",
    "git diff --stat",
    "git log --oneline -5",
    "git status",
    "git status --porcelain",
    "git show HEAD",
    "git branch --show-current",
    "git stash list",
    "git checkout -b feature/x",
    "git checkout main",
    "npm run reset-db",
    "pnpm vitest run lib/server/agent",
    'grep -n "git commit" README.md',
    "grep -rn 'git reset --hard' docs/",
    "echo 'never run git push here' >> AGENTS.md",
    "cd /vercel/sandbox/repo && git diff --stat",
    // MIN-244 : le shell n'est pas suspect en lui-même, seul son `-c` est relu.
    'bash -lc "pnpm build"',
    "bash scripts/setup.sh",
    "sh -- scripts/git-reset.sh",
    "sh -c 'git status --porcelain'",
    'bash -lc "git log --oneline -5"',
    "git clean -n",
    "git clean --dry-run",
    "git switch main",
    "git switch -c feature/x",
    "echo \"bash -c 'git push'\" >> notes.md",
  ]) {
    it(`laisse passer \`${cmd}\``, () => {
      expect(allowed(cmd)).toBe(true);
    });
  }

  it("laisse passer une commande vide ou sans git", () => {
    expect(allowed("")).toBe(true);
    expect(allowed("   ")).toBe(true);
    expect(allowed("ls -la")).toBe(true);
  });

  it("ne confond pas un exécutable qui finit par 'git'", () => {
    expect(allowed("legit push")).toBe(true);
    expect(allowed("./scripts/mygit commit")).toBe(true);
  });
});
