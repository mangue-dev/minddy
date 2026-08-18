import { describe, expect, it, vi } from "vitest";

import {
  buildWorkingDiff,
  countPatchLines,
  parseNameStatus,
  parseNumstat,
  readWorkingDiff,
  resolveBaseRef,
  splitUnifiedDiff,
} from "./working-diff";
import type { RepoHost, ShellResult } from "./repo-host";
import { cloudLayout } from "./harness-layout";

/**
 * READING GIT OUTPUTS, performed on REAL outputs — those of a
 * hand-mounted throwaway repository (a modification, a deletion, a
 * rename, an untracked file, a binary, a space path), copied
 * here as is. That's the whole point: this module can't exercise
 * against a real microVM, but its real job is to READ, and that's fully tested.
 */

const NAME_STATUS = ["D\tdel.txt", "M\tkeep.txt", "R100\tren.txt\tren2.txt"].join("\n");

const NUMSTAT = ["0\t1\tdel.txt", "2\t1\tkeep.txt", "0\t0\tren.txt => ren2.txt"].join("\n");

const PATCH = `diff --git a/del.txt b/del.txt
deleted file mode 100644
index 587be6b..0000000
--- a/del.txt
+++ /dev/null
@@ -1 +0,0 @@
-x
diff --git a/keep.txt b/keep.txt
index de98044..a7bc997 100644
--- a/keep.txt
+++ b/keep.txt
@@ -1,3 +1,4 @@
 a
-b
+B
 c
+d
diff --git a/ren.txt b/ren2.txt
similarity index 100%
rename from ren.txt
rename to ren2.txt
`;

const UNTRACKED_PATCH = `diff --git a/bin.dat b/bin.dat
new file mode 100644
index 0000000..366fd40
Binary files /dev/null and b/bin.dat differ
diff --git a/sub/with space.txt b/sub/with space.txt
new file mode 100644
index 0000000..b680253
--- /dev/null
+++ b/sub/with space.txt\t
@@ -0,0 +1 @@
+z
diff --git a/untracked.txt b/untracked.txt
new file mode 100644
index 0000000..07f33c4
--- /dev/null
+++ b/untracked.txt
@@ -0,0 +1,2 @@
+new
+file
`;

describe("parseNameStatus", () => {
  it("lit statuts et chemins, renommage compris", () => {
    expect(parseNameStatus(NAME_STATUS)).toEqual([
      { filename: "del.txt", status: "removed" },
      { filename: "keep.txt", status: "modified" },
      { filename: "ren2.txt", status: "renamed", previousFilename: "ren.txt" },
    ]);
  });

  it("range une copie du côté des ajouts et le reste du côté des modifications", () => {
    expect(parseNameStatus("C075\ta.txt\tb.txt\nT\tc.txt")).toEqual([
      { filename: "a.txt", status: "added" },
      { filename: "c.txt", status: "modified" },
    ]);
  });

  it("ignore les lignes vides et sans chemin", () => {
    expect(parseNameStatus("\nM\n\nM\tok.txt\n")).toEqual([
      { filename: "ok.txt", status: "modified" },
    ]);
  });
});

describe("parseNumstat", () => {
  it("indexe les compteurs par chemin d'ARRIVÉE d'un renommage", () => {
    const counts = parseNumstat(NUMSTAT);
    expect(counts.get("keep.txt")).toEqual({ additions: 2, deletions: 1 });
    // The packed field `ren.txt => ren2.txt` indexes on the name after —
    // otherwise the counters of a renamed file would never join its line.
    expect(counts.get("ren2.txt")).toEqual({ additions: 0, deletions: 0 });
    expect(counts.has("ren.txt")).toBe(false);
  });

  it("décompacte aussi la forme à accolades", () => {
    const counts = parseNumstat("3\t1\tapp/{old => new}/page.tsx");
    expect(counts.get("app/new/page.tsx")).toEqual({ additions: 3, deletions: 1 });
  });

  it("compte un binaire 0/0 plutôt que NaN", () => {
    expect(parseNumstat("-\t-\tbin.dat").get("bin.dat")).toEqual({
      additions: 0,
      deletions: 0,
    });
  });
});

describe("splitUnifiedDiff", () => {
  it("rend les HUNKS seuls, sans l'en-tête que la vue reconstruit", () => {
    const patches = splitUnifiedDiff(PATCH);
    expect(patches.get("keep.txt")).toBe("@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d");
    // A deleted file has no `+++ b/...`: its path reads `--- a/`.
    expect(patches.get("del.txt")).toBe("@@ -1 +0,0 @@\n-x");
  });

  it("suit un renommage pur jusqu'à son nom d'arrivée, patch vide", () => {
    expect(splitUnifiedDiff(PATCH).get("ren2.txt")).toBe("");
  });

  it("lit un chemin à espaces sur la ligne +++ , tabulation de git retirée", () => {
    const patches = splitUnifiedDiff(UNTRACKED_PATCH);
    expect(patches.get("sub/with space.txt")).toBe("@@ -0,0 +1 @@\n+z");
  });

  it("garde un binaire (sans hunk) plutôt que de le perdre", () => {
    expect(splitUnifiedDiff(UNTRACKED_PATCH).get("bin.dat")).toBe("");
  });

  it("ne se laisse pas couper par un diff DANS un diff", () => {
    const nested = `diff --git a/doc.md b/doc.md
--- a/doc.md
+++ b/doc.md
@@ -1,2 +1,3 @@
 exemple :
+diff --git a/faux.txt b/faux.txt
`;
    const patches = splitUnifiedDiff(nested);
    expect([...patches.keys()]).toEqual(["doc.md"]);
    expect(patches.get("doc.md")).toContain("+diff --git a/faux.txt b/faux.txt");
  });

  it("rend une map vide sur un diff vide", () => {
    expect(splitUnifiedDiff("").size).toBe(0);
    expect(splitUnifiedDiff("   \n").size).toBe(0);
  });
});

describe("countPatchLines", () => {
  it("compte les lignes du patch (le seul compte d'un fichier non suivi)", () => {
    expect(countPatchLines("@@ -0,0 +1,2 @@\n+new\n+file")).toEqual({
      additions: 2,
      deletions: 0,
    });
  });
});

describe("buildWorkingDiff", () => {
  const built = () =>
    buildWorkingDiff({
      nameStatus: NAME_STATUS,
      numstat: NUMSTAT,
      patch: PATCH,
      untrackedPatch: UNTRACKED_PATCH,
    });

  it("assemble suivis et non suivis en une seule liste triée", () => {
    expect(built().files.map((f) => f.filename)).toEqual([
      "bin.dat",
      "del.txt",
      "keep.txt",
      "ren2.txt",
      "sub/with space.txt",
      "untracked.txt",
    ]);
  });

  it("donne à chaque fichier son statut, ses compteurs et son patch", () => {
    const byName = new Map(built().files.map((f) => [f.filename, f]));
    expect(byName.get("keep.txt")).toEqual({
      filename: "keep.txt",
      status: "modified",
      additions: 2,
      deletions: 1,
      patch: "@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d",
    });
    expect(byName.get("ren2.txt")).toMatchObject({
      status: "renamed",
      previous_filename: "ren.txt",
    });
  });

  it("compte un fichier NON SUIVI en ajout, avec ses lignes", () => {
    const untracked = built().files.find((f) => f.filename === "untracked.txt");
    // This is the most common case of an agent trick, and the one that `git diff`
    // only does not see: without the `--no-index` passage, this file would be absent.
    expect(untracked).toMatchObject({ status: "added", additions: 2, deletions: 0 });
  });

  it("ne compte pas deux fois un fichier déjà suivi", () => {
    const out = buildWorkingDiff({
      nameStatus: "M\tkeep.txt",
      numstat: "2\t1\tkeep.txt",
      patch: PATCH,
      untrackedPatch: `diff --git a/keep.txt b/keep.txt
new file mode 100644
--- /dev/null
+++ b/keep.txt
@@ -0,0 +1 @@
+doublon
`,
    });
    expect(out.files).toHaveLength(1);
    expect(out.files[0].status).toBe("modified");
  });

  it("dit sa troncature quand le texte a été coupé au plafond", () => {
    const out = buildWorkingDiff({
      nameStatus: NAME_STATUS,
      numstat: NUMSTAT,
      patch: PATCH,
      untrackedPatch: "",
      patchTruncated: true,
    });
    expect(out.truncated).toBe(true);
  });

  it("borne la liste à 100 fichiers, et le dit", () => {
    const many = Array.from({ length: 130 }, (_, i) => `M\tf${String(i).padStart(3, "0")}.txt`);
    const out = buildWorkingDiff({
      nameStatus: many.join("\n"),
      numstat: "",
      patch: "",
      untrackedPatch: "",
    });
    expect(out.files).toHaveLength(100);
    expect(out.truncated).toBe(true);
  });
});

/** A repository host that responds per table, and remembers what was asked of it. */
function fakeHost(replies: [RegExp, string][]): RepoHost & { commands: string[] } {
  const commands: string[] = [];
  return {
    commands,
    layout: cloudLayout(),
    exec: async (command: string): Promise<ShellResult> => {
      commands.push(command);
      for (const [pattern, stdout] of replies) {
        if (pattern.test(command)) return { exitCode: 0, stdout, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    },
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

describe("resolveBaseRef", () => {
  it("prend origin/<base> quand la ref existe", async () => {
    const host = fakeHost([[/rev-parse --verify/, "abc123\n"]]);
    expect(await resolveBaseRef(host, "main")).toBe("origin/main");
  });

  /**
 * THE DEFAULT WHICH WAS READING 881 LINES FOR 130 (PR 51). Without the common point,
 * the live diff compares the working tree to the TIP of the base: the commits
 * that have fallen on `main` since the birth of the branch appear inverted,
 * and the view at rest (the forge, which shows `base...head`) says something else.
 */
  it("remonte au point commun avec la tête, pas au tip de la base", async () => {
    const host = fakeHost([
      [/rev-parse --verify/, "abc123\n"],
      [/merge-base/, "deadbee\n"],
    ]);
    expect(await resolveBaseRef(host, "main")).toBe("deadbee");
    expect(host.commands.some((c) => c.includes("git merge-base 'origin/main' HEAD"))).toBe(true);
  });

  it("retombe sur la base quand merge-base ne dit rien (clone greffé)", async () => {
    const host = fakeHost([[/rev-parse --verify/, "abc123\n"]]);
    expect(await resolveBaseRef(host, "main")).toBe("origin/main");
  });

  it("prend origin/HEAD quand la base n'est pas nommée", async () => {
    const host = fakeHost([[/symbolic-ref/, "origin/main\n"]]);
    expect(await resolveBaseRef(host, null)).toBe("origin/main");
    expect(host.commands.some((c) => c.includes("rev-parse"))).toBe(false);
  });

  it("retombe sur la seule ref distante du clone quand origin/HEAD manque", async () => {
    // the clone is `--single-branch`: there is only one remote ref, and
    // this is necessarily the basis. Going to ask for it at the forge would cost one token.
    const host = fakeHost([[/for-each-ref/, "origin/develop\n"]]);
    expect(await resolveBaseRef(host, null)).toBe("origin/develop");
    // `origin/HEAD` is excluded: its short name is “origin” for short, a ref
    // valid that reads like a bug as soon as it appears somewhere.
    expect(host.commands.some((c) => c.includes("--exclude=refs/remotes/origin/HEAD"))).toBe(true);
  });

  it("retombe aussi quand la base NOMMÉE n'existe pas dans le clone", async () => {
    const host = fakeHost([[/for-each-ref/, "origin/main\n"]]);
    expect(await resolveBaseRef(host, "disparue")).toBe("origin/main");
  });

  it("rend null quand le dépôt ne dit rien", async () => {
    expect(await resolveBaseRef(fakeHost([]), "main")).toBeNull();
  });
});

describe("readWorkingDiff", () => {
  it("ne demande AUCUNE écriture : ni add, ni commit, ni checkout", async () => {
    const host = fakeHost([
      [/--name-status/, NAME_STATUS],
      [/--numstat/, NUMSTAT],
      [/--find-renames --no-color/, PATCH],
      [/ls-files --others/, UNTRACKED_PATCH],
    ]);
    await readWorkingDiff(host, "origin/main", { patches: true });
    // The end of the stage tour and commits ALONE: an intention to add placed here
    // would end up in someone else's commit.
    for (const command of host.commands) {
      expect(command).not.toMatch(/git (add|commit|checkout|stash|reset)\b/);
    }
  });

  it("saute les patches en mode résumé (l'en-tête n'a besoin que des nombres)", async () => {
    const host = fakeHost([
      [/--name-status/, NAME_STATUS],
      [/--numstat/, NUMSTAT],
    ]);
    const out = await readWorkingDiff(host, "origin/main", { patches: false });
    expect(host.commands.some((c) => c.includes("ls-files --others"))).toBe(false);
    expect(out.files.map((f) => f.filename)).toEqual(["del.txt", "keep.txt", "ren2.txt"]);
    expect(out.files.every((f) => f.patch === undefined)).toBe(true);
  });

  it("borne le diff local aux chemins du tour et au plafond demandé", async () => {
    const host = fakeHost([
      [/--name-status/, "M\tlib/a file.ts"],
      [/--numstat/, "1\t0\tlib/a file.ts"],
      [/--find-renames --no-color/, ""],
      [/ls-files --others/, ""],
    ]);
    await readWorkingDiff(host, "abc123", {
      patches: true,
      scope: ["lib/a file.ts"],
      maxBytes: 240_000,
    });
    expect(host.commands.every((command) => command.includes("'lib/a file.ts'") || !command.startsWith("git"))).toBe(true);
    expect(host.commands.filter((command) => command.includes("head -c"))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("head -c 240000"),
      ]),
    );
  });

  it("rend une liste vide plutôt que de lever quand la sandbox tombe", async () => {
    const host: RepoHost = {
      layout: cloudLayout(),
      exec: vi.fn().mockRejectedValue(new Error("sandbox unreachable")),
      readFile: async () => null,
      writeFile: async () => {},
      mkdir: async () => {},
    };
    // This path is a BONUS on that of the forge: an unreachable microVM must
    // do a silent fallback, not a crashed diff view.
    await expect(readWorkingDiff(host, "origin/main", { patches: true })).resolves.toEqual({
      files: [],
      truncated: false,
    });
  });
});
