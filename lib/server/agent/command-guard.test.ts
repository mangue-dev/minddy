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
