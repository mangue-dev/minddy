import { describe, expect, it } from "vitest";

import {
  assignedSymbols,
  formatOverwrites,
  formatSelfReview,
  MAX_ASSIGNED_SYMBOLS,
  MAX_SITES_PER_SYMBOL,
  MAX_SITES_SCANNED,
  overwriteSitesForTurn,
  parseUntracked,
  SELF_REVIEW_DIFF_MAX_CHARS,
  SELF_REVIEW_OVERWRITES_MAX_CHARS,
} from "./self-review";
import type { RepoHost } from "./repo-host";
import { cloudLayout } from "./harness-layout";

const DIFF = `diff --git a/components/board-toolbar.tsx b/components/board-toolbar.tsx
--- a/components/board-toolbar.tsx
+++ b/components/board-toolbar.tsx
@@ -965,6 +965,8 @@
+            <DialogTitle>{t("deleteViewTitle")}</DialogTitle>`;

describe("parseUntracked", () => {
  it("ne retient que les lignes `??` de git status --porcelain", () => {
    const porcelain = [
      " M components/board-toolbar.tsx",
      "?? scratch.log",
      "A  messages/fr.json",
      "?? tmp/debug.json",
      "",
    ].join("\n");
    expect(parseUntracked(porcelain)).toEqual(["scratch.log", "tmp/debug.json"]);
  });

  it("rend une liste vide sur une sortie vide", () => {
    expect(parseUntracked("")).toEqual([]);
  });
});

describe("formatSelfReview", () => {
  it("se tait quand le tour n'a rien changé", () => {
    expect(formatSelfReview({ diff: "", porcelain: "" })).toBeNull();
    expect(formatSelfReview({ diff: "   \n  ", porcelain: " M déjà suivi" })).toBeNull();
  });

  it("sert le diff dans un bloc, sans redemander un git diff", () => {
    const block = formatSelfReview({ diff: DIFF, porcelain: "" });
    expect(block).toContain("deleteViewTitle");
    expect(block).toContain("```diff");
    // The instruction should DISDUCE you from restarting the command: the harness already has it
    // launched, and an additional tool round trip is exactly what we avoid.
    expect(block).toContain("do not run it again");
  });

  it("oriente la relecture vers les erreurs de jointure entre fichiers", () => {
    const block = formatSelfReview({ diff: DIFF, porcelain: "" });
    expect(block).toContain("ACROSS files");
    expect(block).toContain("i18n placeholders");
  });

  it("liste les fichiers ajoutés, absents du diff des fichiers suivis", () => {
    const block = formatSelfReview({
      diff: DIFF,
      porcelain: " M a.ts\n?? scratch.log\n?? notes.md\n",
    });
    expect(block).toContain("scratch.log");
    expect(block).toContain("notes.md");
    expect(block).toContain("untracked");
  });

  it("parle même quand SEUL un fichier non suivi est apparu", () => {
    const block = formatSelfReview({ diff: "", porcelain: "?? scratch.log\n" });
    expect(block).not.toBeNull();
    expect(block).toContain("scratch.log");
    expect(block).toContain("No tracked file was modified");
  });

  it("borne la liste des fichiers ajoutés et dit combien restent", () => {
    const porcelain = Array.from({ length: 25 }, (_, i) => `?? f${i}.ts`).join("\n");
    const block = formatSelfReview({ diff: "", porcelain })!;
    expect(block).toContain("f0.ts");
    expect(block).not.toContain("f24.ts");
    expect(block).toContain("and 5 more");
  });

  it("élide un diff énorme par le MILIEU — début et fin portent les fichiers", () => {
    const head = "diff --git a/premier.ts b/premier.ts\n";
    const tail = "\ndiff --git a/dernier.ts b/dernier.ts";
    const diff = head + "x".repeat(SELF_REVIEW_DIFF_MAX_CHARS * 2) + tail;
    const block = formatSelfReview({ diff, porcelain: "" })!;
    expect(block).toContain("premier.ts");
    expect(block).toContain("dernier.ts");
    expect(block.length).toBeLessThan(SELF_REVIEW_DIFF_MAX_CHARS + 2000);
  });
});

// ── Which, elsewhere, writes the same state (MIN-252) ──────────────────────────

/**
 * THE FOUNDING CASE, in hard copy: the difference from PR 48 on `use-agent-run-live.ts`.
 *
 * The change sets `files` in the state of the round — IN a `setLive((prev) =>
 * …)` whose call head does not move — and leaves fifteen lines intact
 * lower, the `setLive(null)` of `onEvent` which resets it to zero at each event
 * laid. This line is not in ANY hunk: this is exactly what the block
 * doit faire remonter.
 *
 * Two traps of the real case, kept here as they are: the symbol is not written on
 * no line `+`, and the line to go up carries VOM FOR WORD the same
 * `setLive(null);` than a line in the diff.
 */
const PR48_DIFF = `diff --git a/lib/use-agent-run-live.ts b/lib/use-agent-run-live.ts
--- a/lib/use-agent-run-live.ts
+++ b/lib/use-agent-run-live.ts
@@ -39,6 +39,15 @@ export interface AgentRunLive {
   startedAt: string;
+  files: AgentFileChange[];
+  filesTruncated: boolean;
 }
@@ -139,11 +150,19 @@ export function useAgentRunLive(
         const reasoningMs = typeof p.reasoningMs === "number" ? p.reasoningMs : 0;
+        const { files, truncated } = parseFilesChangedPayload(p.files, p.filesTruncated);
          // EMPTY send: the real events from the round are already in place.
-        if (!text && !tools && !reasoningActive) {
+        if (!text && !tools && !reasoningActive && files.length === 0) {
           setLive(null);
           return;
         }
         setLive((prev) => ({
           text,
           tools,
           reasoningActive,
           reasoningMs,
+          files,
+          filesTruncated: truncated,
           startedAt: prev?.startedAt ?? new Date().toISOString(),
         }));
       },
       onEvent: (row) => {
`;

/** What `git grep -n 'setLive *\\('` renders on the file as the turn has it
 * left — the declaration (`const [live, setLive] = useState(…)`) is not there,
 *  it calls nothing. */
const PR48_GREP = [
  "lib/use-agent-run-live.ts:140:    setLive(null);",
  "lib/use-agent-run-live.ts:154:          setLive(null);",
  "lib/use-agent-run-live.ts:157:        setLive((prev) => ({",
  "lib/use-agent-run-live.ts:171:        setLive(null);",
].join("\n");

/** A single hunk diff on `a.ts`, whose first line is `startLine`
 * of the file — the numbers count, the exclusion is done on them. */
function hunk(lines: string[], startLine = 1, file = "a.ts"): string {
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -1,1 +${startLine},${lines.length} @@`, ...lines].join(
    "\n",
  );
}

/** A host that responds the SAME output to any grep — we test sorting, not git. */
function hostReturning(stdout: string, exitCode = 0): RepoHost {
  return {
    layout: cloudLayout(),
    exec: async () => ({ exitCode, stdout, stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

describe("assignedSymbols", () => {
  it("retient le setter écrit par le diff de la PR 48", () => {
    expect(assignedSymbols(PR48_DIFF).map((s) => s.name)).toContain("setLive");
  });

  it("lit le hunk — les lignes ajoutées ET leur contexte, jamais les retraits", () => {
    const diff = hunk([" setContext(1);", "-setRemoved(2);", "+setAdded(3);"]);
    // `setRemoved` is no longer in the file: the grepper would look for a
    // line that the trick has just deleted.
    expect(assignedSymbols(diff).map((s) => s.name)).toEqual(["setAdded", "setContext"]);
  });

  it("ignore un hunk de pur retrait — il n'écrit rien", () => {
    expect(assignedSymbols(hunk([" setContext(1);", "-setRemoved(2);"]))).toEqual([]);
  });

  it("voit les collections mutées et les affectations, pas les déclarations", () => {
    const diff = hunk([
      "+  cache.set(key, value);",
      "+  pending.current = true;",
      "+  const fresh = new Map();",
      "+  let counter = 0;",
    ]);
    const found = assignedSymbols(diff);
    expect(found.map((s) => s.name)).toEqual(["cache", "pending.current"]);
    expect(found.map((s) => s.kind)).toEqual(["collection", "variable"]);
  });

  it("ne prend pas une comparaison, une flèche ou une prop JSX pour une écriture", () => {
    const diff = hunk([
      "+  if (status === 'done') return;",
      "+  items.map((item) => item.id);",
      "+  <Board onSelect={handler} density={mode} />",
      "+  total += step;",
    ]);
    expect(assignedSymbols(diff)).toEqual([]);
  });

  it("borne le nombre de symboles", () => {
    const diff = hunk(Array.from({ length: 40 }, (_, i) => `+  setThing${i}(null);`));
    expect(assignedSymbols(diff)).toHaveLength(MAX_ASSIGNED_SYMBOLS);
  });

  it("fait passer ce que le tour a TAPÉ devant ce qu'il a côtoyé", () => {
    const diff = hunk(["+  active = false;", "         setLive(null);"]);
    expect(assignedSymbols(diff).map((s) => s.name)).toEqual(["active", "setLive"]);
  });

  it("fait passer les setters devant, ils mentent le moins au grep", () => {
    const diff = hunk(["+  active = false;", "+  setLive(null);"]);
    expect(assignedSymbols(diff).map((s) => s.kind)).toEqual(["setter", "variable"]);
  });
});

describe("overwriteSitesForTurn", () => {
  it("remonte le `setLive(null)` de `onEvent`, absent des hunks (PR 48)", async () => {
    const hits = await overwriteSitesForTurn(hostReturning(PR48_GREP), PR48_DIFF);
    const live = hits.find((hit) => hit.symbol.name === "setLive");
    expect(live).toBeDefined();
    // Line 171 IS the fault: `setLive(null)` of `onEvent` writes the status
    // that the diff just posed, and it's nowhere in the diff.
    expect(live!.sites.map((s) => s.line)).toContain(171);
    expect(live!.sites.find((s) => s.line === 171)!.text).toBe("setLive(null);");
  });

  it("ne rend pas les lignes que le diff porte déjà", async () => {
    const hits = await overwriteSitesForTurn(hostReturning(PR48_GREP), PR48_DIFF);
    const lines = hits.flatMap((hit) => hit.sites.map((s) => s.line));
    // 154 and 157 are IN the hunks: bringing them back would make the model reread this
    // which he just read, two paragraphs above. And 154 wears the same
    // text as 171 — the exclusion is therefore made on the line, not on the text.
    expect(lines).not.toContain(154);
    expect(lines).not.toContain(157);
    expect(lines).toContain(140);
  });

  it("se tait quand le diff n'écrit aucun état", async () => {
    const diff = hunk(["+Une ligne de doc, et rien d'autre."], 1, "README.md");
    expect(await overwriteSitesForTurn(hostReturning(PR48_GREP), diff)).toEqual([]);
  });

  it("se tait quand l'unique autre écriture est déjà dans le diff", async () => {
    const diff = hunk(["+  setLive(next);"], 12);
    expect(await overwriteSitesForTurn(hostReturning("a.ts:12:setLive(next);"), diff)).toEqual([]);
  });

  /**
   * THE CAP IS JUDGED BEFORE THE EXCLUSION OF THE DIFF (audit finding).
   *
   * `git grep` is capped at `MAX_SITES_SCANNED + 1` lines precisely to KNOW
   * that a symbol is too common and throw it away. But the exclusion of lines from
   * diff came before counting — and since the symbol is EXTRACTED from the diff, its
   * own lines are in this grep. It was therefore enough that only one of them
   * falls in the first 13 so that the count goes down to 12 and the
   * symbol survives, announcing itself “12 other writes” with two hundred behind.
   */
  it("jette un symbole trop répandu même quand une de ses lignes est dans le diff", async () => {
    const diff = hunk(["+  setOpen(true);"], 7, "app/board/page.tsx");
    // 13 lines = the milestone exceeded. The 3rd is that of the diff: before the fix,
    // `selectSites` removed it and the count went down to 12, below the threshold.
    const grep = [
      "components/c1.tsx:4:setOpen(false);",
      "components/c2.tsx:9:setOpen(true);",
      "app/board/page.tsx:7:setOpen(true);",
      ...Array.from({ length: 10 }, (_, i) => `components/d${i}.tsx:${i + 2}:setOpen(false);`),
    ].join("\n");

    expect(await overwriteSitesForTurn(hostReturning(grep), diff)).toEqual([]);
  });

  it("garde un symbole qui reste sous le cap une fois le diff retiré ET avant", async () => {
    const diff = hunk(["+  setOpen(true);"], 7, "app/board/page.tsx");
    const grep = [
      "app/board/page.tsx:7:setOpen(true);",
      "components/c1.tsx:4:setOpen(false);",
    ].join("\n");

    const hits = await overwriteSitesForTurn(hostReturning(grep), diff);
    expect(hits.flatMap((h) => h.sites.map((s) => s.file))).toEqual(["components/c1.tsx"]);
  });

  it("ne fait pas échouer un tour quand le grep tombe", async () => {
    const host: RepoHost = {
      layout: cloudLayout(),
      exec: async () => {
        throw new Error("sandbox morte");
      },
      readFile: async () => null,
      writeFile: async () => {},
      mkdir: async () => {},
    };
    await expect(overwriteSitesForTurn(host, PR48_DIFF)).resolves.toEqual([]);
  });
});

describe("formatOverwrites", () => {
  const symbol = { name: "setLive", kind: "setter" as const, pattern: "setLive *\\(" };
  const site = (line: number) => ({ file: "lib/use-agent-run-live.ts", line, text: "setLive(null);" });

  it("ne dit rien quand il n'y a rien à dire", () => {
    expect(formatOverwrites([])).toBe("");
    expect(formatOverwrites([{ symbol, sites: [] }])).toBe("");
  });

  it("pose la question, et nomme fichier et ligne", () => {
    const block = formatOverwrites([{ symbol, sites: [site(163)] }]);
    expect(block).toContain("lib/use-agent-run-live.ts:163");
    expect(block).toContain("undo what you just set");
    expect(block).toContain("state setter");
  });

  it("jette un symbole trop répandu — c'est un utilitaire, pas un état", () => {
    const many = Array.from({ length: MAX_SITES_SCANNED + 1 }, (_, i) => site(i + 1));
    expect(formatOverwrites([{ symbol, sites: many }])).toBe("");
  });

  it("borne les sites montrés par symbole et dit combien restent", () => {
    const sites = Array.from({ length: MAX_SITES_PER_SYMBOL + 2 }, (_, i) => site(i + 1));
    const block = formatOverwrites([{ symbol, sites }]);
    expect(block).toContain("and 2 more");
    expect(block.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(MAX_SITES_PER_SYMBOL);
  });

  it("borne le bloc entier, pour qu'il accompagne le diff sans le concurrencer", () => {
    const hits = Array.from({ length: 30 }, (_, i) => ({
      symbol: { ...symbol, name: `setThing${i}` },
      sites: [{ file: "a.ts", line: i, text: "x".repeat(400) }],
    }));
    expect(formatOverwrites(hits).length).toBeLessThan(SELF_REVIEW_OVERWRITES_MAX_CHARS + 1000);
  });
});

describe("formatSelfReview avec les autres écritures", () => {
  it("colle le bloc SOUS le diff, jamais à sa place", () => {
    const block = formatSelfReview({
      diff: DIFF,
      porcelain: "",
      overwrites: [
        {
          symbol: { name: "setLive", kind: "setter", pattern: "setLive *\\(" },
          sites: [{ file: "lib/use-agent-run-live.ts", line: 163, text: "setLive(null);" }],
        },
      ],
    })!;
    expect(block.indexOf("```diff")).toBeLessThan(block.indexOf("setLive(null);"));
    expect(block).toContain("ACROSS files");
  });

  it("reste identique à avant quand rien n'écrase rien", () => {
    expect(formatSelfReview({ diff: DIFF, porcelain: "", overwrites: [] })).toBe(
      formatSelfReview({ diff: DIFF, porcelain: "" }),
    );
  });
});
