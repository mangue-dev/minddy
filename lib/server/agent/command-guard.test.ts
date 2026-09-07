import { describe, expect, it } from "vitest";

import { checkCommand } from "./command-guard";

const allowed = (command: string, local = false): boolean =>
  checkCommand(command, { local }).allowed;

describe("checkCommand", () => {
  it.each([
    "git reset --hard",
    "git restore package-lock.json",
    "git checkout -- lib/x.ts",
    "git checkout lib/x.ts",
    "git checkout package.json",
    "git checkout HEAD lib/x.ts",
    "git checkout --pathspec-from-file=changed-files.txt",
    "git clean -fd",
    "git stash drop",
    "git rebase -i main",
    "git cherry-pick abc1234",
    "git switch --discard-changes main",
    "git commit --amend --no-edit",
  ])("rejects destructive Git command: %s", (command) => {
    expect(allowed(command)).toBe(false);
    expect(allowed(command, true)).toBe(false);
  });

  it.each([
    "git push origin HEAD",
    "env -i git push",
    "sudo -u root git push",
    "bash -lc 'git push --force'",
    "echo $(git push origin HEAD)",
  ])("rejects remote writes hidden in command syntax: %s", (command) => {
    expect(allowed(command)).toBe(false);
  });

  it("allows a local commit but leaves cloud commits to the harness", () => {
    expect(allowed("git commit -m 'fix: guard local execution'", true)).toBe(
      true,
    );
    expect(allowed("git commit -m 'fix: guard local execution'")).toBe(false);
  });

  it.each([
    "git config core.hooksPath .ci/hooks",
    "git config --global user.email agent@example.com",
    "git -c core.sshCommand='sh -c evil' fetch origin",
    "echo malicious > .git/hooks/pre-commit",
    "cat .GIT/config",
    "cat packages/ui/.git/config",
  ])("rejects persistent Git configuration access: %s", (command) => {
    expect(allowed(command, true)).toBe(false);
  });

  it.each([
    "g=git; $g push origin HEAD",
    "action=push; git $action origin HEAD",
    "$(printf git) reset --hard",
    "eval 'git push'",
  ])("rejects policy-bearing shell expansion: %s", (command) => {
    expect(allowed(command)).toBe(false);
  });

  it.each([
    "npm test",
    "git status --short",
    "git diff --stat",
    "git log --oneline -5",
    "git add -A",
    "git switch main",
    "git checkout -b review-fix main",
    "git checkout --detach HEAD",
    "git config --get remote.origin.url",
    "cat .gitignore",
  ])("allows non-destructive command: %s", (command) => {
    expect(allowed(command)).toBe(true);
  });
});
