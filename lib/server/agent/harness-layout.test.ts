import { describe, expect, it } from "vitest";

import {
  assertUsableLayout,
  cloudLayout,
  layoutForCurrentRepo,
  layoutForRoot,
  runScopedRoot,
  CLOUD_SANDBOX_ROOT,
  type HarnessLayout,
} from "./harness-layout";

/**
 * MIN-354 — the layout of the harness, which has become a value of the run.
 *
 * Pure logic, tested like [prune.test.ts](prune.test.ts): we call, on
 * assert. What this file keeps is three facts, and none of them are tastes:
 *
 * 1. **The cloud is not moving.** This batch does not move anything in production; il
 * calculates what was written. A deviation from just one of these six paths
 * would leave the cooked opencode binary next to the one the harness
 * is looking for, or the `.tsbuildinfo` in the end-of-round `git add -A`.
 * 2. **Two runs are disjoint.** This is the reason for the ticket: on a
 * machine, two simultaneous turns must not share a repository, a job, a SQLite base, or tools outputs.
 * 3. **A questionable layout is refused.** `repoDir` is the security root of
 * four guardrails, and it now arrives by a JSON.
 */

describe("le layout du cloud", () => {
  it("rend exactement les chemins d'avant MIN-354", () => {
    // These six values ​​were module constants. Seeing them written here is
    // which says that we have configured without MOVE: a production run must
    // find your repository, binary and snapshot where they've always been.
    expect(cloudLayout()).toEqual({
      root: "/vercel/sandbox",
      repoDir: "/vercel/sandbox/repo",
      toolOutputDir: "/vercel/sandbox/tool-output",
      harnessDir: "/vercel/sandbox/harness",
      typecheckDir: "/vercel/sandbox/typecheck",
      opencodeDir: "/vercel/oc",
    });
  });

  it("passe son propre contrôle", () => {
    expect(() => assertUsableLayout(cloudLayout())).not.toThrow();
  });
});

describe("la dérivation", () => {
  it("met tout ce qui est du run sous sa racine, et rien d'autre", () => {
    const layout = layoutForRoot("/work/r-1", "/opt/oc");
    for (const dir of [layout.repoDir, layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith("/work/r-1/")).toBe(true);
    }
    // The binary is specific to the MACHINE: 144 MB which cannot be reinstalled
    // par ticket.
    expect(layout.opencodeDir).toBe("/opt/oc");
  });

  /**
 * HARNESS AND RELEASES ARE BROTHERS OF THE DEPOSIT, NEVER ITS CHILDREN. It is this
 * which means that the `git add -A` at the end of the round does not see them — otherwise the
 * job of the round, which carries the history of the conversation AND the push URL,
 * would leave in a commit in the user's repository then in his PR.
 */
  it("garde le harness et les sorties HORS du dépôt", () => {
    const layout = layoutForRoot("/work/r-1", "/opt/oc");
    for (const dir of [layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith(`${layout.repoDir}/`)).toBe(false);
    }
  });

  /**
 * MIN-358 — the current deposit mode: the deposit is that of the user, all
 * the rest belongs to the run. This is the only layout where `repoDir` is not
 * `<root>/repo`, and it passes the same check as the others.
 */
  it("laisse le dépôt courant où il est, sans y installer le harness", () => {
    const layout = layoutForCurrentRepo("/work/r-1", "/Users/x/Projets/app/", "/opt/oc");
    expect(layout.repoDir).toBe("/Users/x/Projets/app");
    expect(layout.harnessDir).toBe("/work/r-1/harness");
    for (const dir of [layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith(`${layout.repoDir}/`)).toBe(false);
    }
    expect(() => assertUsableLayout(layout)).not.toThrow();
  });

  it("absorbe un slash final plutôt que de produire un `//`", () => {
    // `resolveWithin` compares to `${base}/`: a double slash would escape the
    // prefix comparison on one side and not on the other.
    expect(layoutForRoot("/work/r-1/", "/opt/oc/")).toEqual(layoutForRoot("/work/r-1", "/opt/oc"));
  });
});

describe("deux runs sur une machine", () => {
  /**
 * THE TRAP THAT THE TICKET EXISTS TO CLOSE. On a microVM, a run had its
 * machine; on a workstation, two tickets launched in succession shared everything — the
 * job rewritten under the first, a single SQLite opencode base for both, a
 * common output folder.
 */
  it("ne partagent aucun chemin de run", () => {
    const a = layoutForRoot(runScopedRoot("/work", "run-a"), "/opt/oc");
    const b = layoutForRoot(runScopedRoot("/work", "run-b"), "/opt/oc");
    const perRun = (l: HarnessLayout) => [l.root, l.repoDir, l.toolOutputDir, l.harnessDir, l.typecheckDir];
    for (const [left, right] of perRun(a).map((v, i) => [v, perRun(b)[i]])) {
      expect(left).not.toBe(right);
    }
    // …and neither is a prefix of the other: `/work/run-a` must not pass as
    // be in `/work/run-a-bis`, nor vice versa.
    expect(a.root.startsWith(`${b.root}/`)).toBe(false);
    expect(b.root.startsWith(`${a.root}/`)).toBe(false);
  });

  it("partagent en revanche le binaire opencode", () => {
    const a = layoutForRoot(runScopedRoot("/work", "run-a"), "/opt/oc");
    const b = layoutForRoot(runScopedRoot("/work", "run-b"), "/opt/oc");
    expect(a.opencodeDir).toBe(b.opencodeDir);
  });

  /**
 * The identifier comes from the base, but it BOUNDS a root: a `/` or a `..`
 * which passes there would take the run out of its working folder, and it is
 * this root which bounds all the rest.
 */
  it("neutralise un identifiant qui tenterait de sortir du dossier de travail", () => {
    for (const runId of ["../../etc", "a/b", "..", "", "/etc/passwd"]) {
      const root = runScopedRoot("/work", runId);
      expect(root.startsWith("/work/")).toBe(true);
      // What matters: no more separator after the working folder, so
      // no more `..` segments to go up — the root can no longer exit.
      expect(root.slice("/work/".length)).not.toContain("/");
      expect(root.slice("/work/".length).startsWith(".")).toBe(false);
    }
    expect(runScopedRoot("/work", "a/b")).toBe("/work/a-b");
    expect(runScopedRoot("/work", "")).toBe("/work/run");
  });
});

describe("le contrôle du layout", () => {
  const base = layoutForRoot("/work/r-1", "/opt/oc");

  it("refuse un chemin relatif", () => {
    // `resolveWithin("repo", "../x")` comes out of nothing at all: the guard
    // would become mute, not false — which is worse.
    expect(() => assertUsableLayout({ ...base, repoDir: "repo" })).toThrow(/absolute/i);
  });

  it("refuse un slash final", () => {
    expect(() => assertUsableLayout({ ...base, repoDir: "/work/r-1/repo/" })).toThrow(/slash/i);
  });

  /**
 * MIN-358: a repository OUTSIDE the run root is now legitimate — this is
 * the current repository mode, where the repository is that of the user. What remains
 * denied is the only thing the rule really protected: a harness
 * installed IN the repository, therefore visible to someone's `git status`.
 */
  it("accepte un dépôt hors de la racine du run (mode dépôt courant)", () => {
    expect(() => assertUsableLayout({ ...base, repoDir: "/Users/x/Projets/app" })).not.toThrow();
  });

  it("refuse un harness installé DANS le dépôt", () => {
    const inside = layoutForCurrentRepo("/work/r-1", "/work/r-1", "/opt/oc");
    expect(() => assertUsableLayout(inside)).toThrow(/outside the repository/i);
  });

  it("refuse un dossier du run hors de la racine du run", () => {
    expect(() => assertUsableLayout({ ...base, harnessDir: "/ailleurs/harness" })).toThrow(
      /under root/i,
    );
  });

  it("refuse un champ manquant", () => {
    expect(() =>
      assertUsableLayout({ ...base, harnessDir: undefined as unknown as string }),
    ).toThrow(/absolute/i);
  });

  it("laisse le binaire opencode vivre hors de la racine du run", () => {
    // It's the ONLY path that has the right to be elsewhere, and that's deliberate.
    expect(() =>
      assertUsableLayout({ ...base, opencodeDir: `${CLOUD_SANDBOX_ROOT}/../oc` }),
    ).not.toThrow();
  });
});
