import { describe, expect, it } from "vitest";

import {
  formatSelfReview,
  parseUntracked,
  SELF_REVIEW_DIFF_MAX_CHARS,
} from "./self-review";

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
    // La consigne doit DISSUADER de relancer la commande : le harness l'a déjà
    // lancée, et un aller-retour de tool en plus est exactement ce qu'on évite.
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
