import { describe, expect, it } from "vitest";

import { resolveDiffPosition } from "./mr-position";
import {
  AI_REVIEW_DIFF_MAX_CHARS,
  AI_REVIEW_MAX_INLINE_COMMENTS,
  annotatePatch,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  formatReviewBody,
  normalizeFindingPath,
  parseAiReview,
  selectFindings,
  type ReviewFinding,
  type ReviewableFile,
} from "./pr-ai-review-core";

/**
 * Le cœur de la review de PR par Numo (MIN-141). Ce qui est vérifié ici est ce
 * qui décide de la qualité de la passe :
 *  - les numéros annotés sont EXACTEMENT ceux que la forge accepte (le test les
 *    rejoue contre `resolveDiffPosition`, la fonction qui sert à poster) ;
 *  - une ancre fausse est écartée AVANT l'appel réseau, et redescend en synthèse ;
 *  - le plafond de commentaires coupe dans les broutilles, jamais dans les bugs.
 */

// old 10 = "context-a", 11 = "removed" ; new 10 = "context-a", 11 = "added".
const PATCH = [
  "@@ -10,4 +10,4 @@ function demo() {",
  " context-a",
  "-removed",
  "+added",
  " context-b",
  " context-c",
].join("\n");

const FILES: ReviewableFile[] = [
  { filename: "lib/demo.ts", status: "modified", additions: 1, deletions: 1, patch: PATCH },
];

function finding(over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    path: "lib/demo.ts",
    line: 11,
    side: "RIGHT",
    severity: "risk",
    body: "Ceci est douteux.",
    ...over,
  };
}

describe("annotatePatch", () => {
  it("préfixe chaque ligne de son numéro réel, signe compris", () => {
    expect(annotatePatch(PATCH).split("\n")).toEqual([
      "@@ -10,4 +10,4 @@ function demo() {",
      " 10│context-a",
      "-11│removed",
      "+11│added",
      " 12│context-b",
      " 13│context-c",
    ]);
  });

  it("recale les compteurs à chaque hunk", () => {
    const patch = ["@@ -1,1 +1,1 @@", " a", "@@ -40,1 +50,1 @@", "+neuf"].join("\n");
    expect(annotatePatch(patch).split("\n")).toEqual([
      "@@ -1,1 +1,1 @@",
      " 1│a",
      "@@ -40,1 +50,1 @@",
      "+50│neuf",
    ]);
  });

  it("laisse passer « \\ No newline at end of file » sans le compter", () => {
    const patch = ["@@ -1,1 +1,2 @@", " a", "+b", "\\ No newline at end of file"].join("\n");
    expect(annotatePatch(patch).split("\n")).toEqual([
      "@@ -1,1 +1,2 @@",
      " 1│a",
      "+2│b",
      "\\ No newline at end of file",
    ]);
  });

  /**
   * LE test du module : chaque numéro annoncé au modèle doit être une ancre que
   * la forge accepte. Si les deux marches divergent un jour, c'est ici que ça se
   * voit — pas en production, dans un 422 par commentaire.
   */
  it("chaque numéro annoté est une ancre valide pour la forge", () => {
    for (const line of annotatePatch(PATCH).split("\n")) {
      const m = /^([ +-])(\d+)│/.exec(line);
      if (!m) continue;
      const side = m[1] === "-" ? "LEFT" : "RIGHT";
      expect(resolveDiffPosition(PATCH, Number(m[2]), side)).not.toBeNull();
    }
  });
});

describe("buildReviewUserMessage", () => {
  it("porte le titre, le ticket et le diff annoté", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      body: "Ferme MIN-1.",
      issue: { identifier: "MIN-1", title: "Le compteur déraille", description: "Détails." },
      files: FILES,
    });
    expect(message).toContain("Corrige le compteur");
    expect(message).toContain("MIN-1: Le compteur déraille");
    expect(message).toContain("+11│added");
  });

  it("nomme les fichiers qu'il n'a pas montrés au lieu de les taire", () => {
    const big = "x".repeat(AI_REVIEW_DIFF_MAX_CHARS * 2);
    const message = buildReviewUserMessage({
      title: "Gros diff",
      files: [
        { filename: "a.ts", status: "modified", patch: `@@ -1,1 +1,1 @@\n+${big}` },
        { filename: "b.ts", status: "modified", patch: PATCH },
        { filename: "image.png", status: "added" },
      ],
    });
    expect(message).toContain("Files you were NOT shown");
    expect(message).toContain("b.ts");
    expect(message).toContain("image.png");
  });
});

describe("parseAiReview", () => {
  it("écarte le point mal formé sans jeter les autres", () => {
    const review = parseAiReview({
      summary: "Correct dans l'ensemble.",
      verdict: "comment",
      findings: [
        { path: "lib/demo.ts", line: 11, side: "RIGHT", severity: "blocker", body: "Bug." },
        { path: "", line: 4, side: "RIGHT", severity: "nit", body: "Sans chemin." },
        { path: "lib/demo.ts", line: 0, side: "RIGHT", severity: "nit", body: "Ligne 0." },
      ],
    });
    expect(review?.findings).toHaveLength(1);
    expect(review?.findings[0].severity).toBe("blocker");
  });

  it("retombe sur des valeurs sûres quand le modèle sort de l'énumération", () => {
    const review = parseAiReview({
      summary: "Ça va.",
      verdict: "lgtm",
      findings: [{ path: "a.ts", line: 2, side: "MIDDLE", severity: "critical", body: "Hm." }],
    });
    expect(review?.verdict).toBe("comment");
    expect(review?.findings[0]).toMatchObject({ side: "RIGHT", severity: "risk" });
  });

  it("sans synthèse, ce n'est pas une review", () => {
    expect(parseAiReview({ verdict: "approve", findings: [] })).toBeNull();
    expect(parseAiReview(null)).toBeNull();
  });
});

describe("selectFindings", () => {
  it("garde ce qui s'ancre, replie le reste dans la synthèse", () => {
    const ok = finding();
    const outOfDiff = finding({ line: 900, body: "Hors du diff." });
    const unknownFile = finding({ path: "lib/ailleurs.ts", body: "Fichier absent." });
    const { inline, inSummary } = selectFindings([ok, outOfDiff, unknownFile], FILES);
    expect(inline).toHaveLength(1);
    expect(inSummary.map((f) => f.body)).toEqual(["Hors du diff.", "Fichier absent."]);
  });

  it("une ligne supprimée s'ancre côté LEFT", () => {
    const { inline } = selectFindings([finding({ line: 11, side: "LEFT" })], FILES);
    expect(inline).toHaveLength(1);
    expect(inline[0].side).toBe("LEFT");
  });

  it("réécrit le chemin d'un renommage côté base pour une ancre LEFT", () => {
    const renamed: ReviewableFile[] = [
      { filename: "lib/neuf.ts", previous_filename: "lib/ancien.ts", status: "renamed", patch: PATCH },
    ];
    // Le modèle a nommé le fichier tel qu'il le lit dans le diff (le nouveau nom),
    // mais une ligne supprimée s'adresse par l'ancien.
    const { inline } = selectFindings(
      [finding({ path: "lib/neuf.ts", line: 11, side: "LEFT" })],
      renamed,
    );
    expect(inline[0].path).toBe("lib/ancien.ts");
  });

  it("dédoublonne deux points sur la même ligne", () => {
    const { inline, inSummary } = selectFindings([finding(), finding({ body: "Encore." })], FILES);
    expect(inline).toHaveLength(1);
    expect(inSummary).toHaveLength(0);
  });

  /**
   * Le modèle a recopié l'en-tête entier (`### lib/demo.ts — modified · +1 −1`)
   * au lieu du seul chemin. L'ancre visait juste : elle ne doit pas se perdre
   * pour une raison typographique.
   */
  it("retrouve le fichier quand le modèle a recopié tout l'en-tête", () => {
    const { inline } = selectFindings(
      [finding({ path: "`lib/demo.ts (renamed from lib/vieux.ts) — modified · +1 −1`" })],
      FILES,
    );
    expect(inline).toHaveLength(1);
    expect(inline[0].path).toBe("lib/demo.ts");
  });

  it("dédoublonne les deux écritures d'un même chemin", () => {
    const { inline, inSummary } = selectFindings(
      [finding(), finding({ path: "lib/demo.ts — modified", body: "Encore." })],
      FILES,
    );
    expect(inline).toHaveLength(1);
    expect(inSummary).toHaveLength(0);
  });

  /**
   * Un vrai chemin à parenthèses — ce dépôt en est plein (`app/(app)/…`) — passe
   * par l'égalité stricte et ne voit jamais le nettoyage qui le couperait.
   */
  it("ne coupe pas un vrai chemin à parenthèses", () => {
    const files: ReviewableFile[] = [
      { filename: "app/(marketing)/page.tsx", status: "modified", patch: PATCH },
    ];
    const { inline } = selectFindings([finding({ path: "app/(marketing)/page.tsx" })], files);
    expect(inline[0].path).toBe("app/(marketing)/page.tsx");
  });

  it("nettoie aussi le chemin d'un point non ancré, qui se lira en synthèse", () => {
    const { inSummary } = selectFindings(
      [finding({ path: "lib/ailleurs.ts — added · +9 −0", line: 900 })],
      FILES,
    );
    expect(inSummary[0].path).toBe("lib/ailleurs.ts");
  });

  it("quand le plafond coupe, il coupe dans les broutilles", () => {
    const patch = ["@@ -1,0 +1,10 @@", ...Array.from({ length: 10 }, (_, i) => `+l${i}`)].join("\n");
    const files: ReviewableFile[] = [{ filename: "a.ts", status: "modified", patch }];
    const nits = Array.from({ length: 6 }, (_, i) =>
      finding({ path: "a.ts", line: i + 1, severity: "nit", body: `nit ${i}` }),
    );
    const blocker = finding({ path: "a.ts", line: 9, severity: "blocker", body: "LE bug" });
    const { inline, inSummary } = selectFindings([...nits, blocker], files, 2);
    expect(inline.map((f) => f.body)).toEqual(["LE bug", "nit 0"]);
    expect(inSummary.map((f) => f.body)).toEqual(["nit 1", "nit 2", "nit 3", "nit 4", "nit 5"]);
  });

  it("le plafond par défaut tient la décision de cadrage (3 à 5 points)", () => {
    expect(AI_REVIEW_MAX_INLINE_COMMENTS).toBe(5);
  });
});

describe("normalizeFindingPath", () => {
  it("retire ce qui n'a jamais fait partie d'un chemin", () => {
    expect(normalizeFindingPath("lib/demo.ts — modified · +1 −1")).toBe("lib/demo.ts");
    expect(normalizeFindingPath("lib/neuf.ts (renamed from lib/vieux.ts) — renamed")).toBe(
      "lib/neuf.ts",
    );
    expect(normalizeFindingPath("`lib/demo.ts`")).toBe("lib/demo.ts");
    expect(normalizeFindingPath("./lib/demo.ts")).toBe("lib/demo.ts");
  });

  it("laisse intact un chemin déjà propre", () => {
    expect(normalizeFindingPath("app/(marketing)/page.tsx")).toBe("app/(marketing)/page.tsx");
    expect(normalizeFindingPath("lib/demo.ts")).toBe("lib/demo.ts");
  });
});

describe("formatReviewBody", () => {
  it("rend le verdict, la synthèse, les points non ancrés et la signature", () => {
    const body = formatReviewBody({
      review: { summary: "Deux réserves.", verdict: "request_changes", findings: [] },
      inSummary: [finding({ path: "lib/demo.ts", line: 42, body: "À revoir." })],
      model: "anthropic/claude-sonnet-5",
      locale: "fr",
    });
    expect(body).toContain("Review de Numo");
    // Le verdict est ÉCRIT dans le corps : la review est soumise en `comment`,
    // pour que Numo donne un avis sans tenir la porte du merge.
    expect(body).toContain("des changements sont à faire");
    expect(body).toContain("Deux réserves.");
    expect(body).toContain("`lib/demo.ts:42` — À revoir.");
    expect(body).toContain("anthropic/claude-sonnet-5");
  });

  it("dit aussi le verdict quand il n'y a rien à redire", () => {
    const body = formatReviewBody({
      review: { summary: "RAS.", verdict: "approve", findings: [] },
      inSummary: [],
      model: "m",
      locale: "fr",
    });
    expect(body).toContain("rien à redire");
  });

  it("sans point à replier, pas de section vide", () => {
    const body = formatReviewBody({
      review: { summary: "Rien à dire.", verdict: "approve", findings: [] },
      inSummary: [],
      model: "m",
      locale: "en",
    });
    expect(body).not.toContain("Also noted");
  });
});

describe("buildReviewSystemPrompt", () => {
  it("demande la langue du demandeur et documente le format des ancres", () => {
    expect(buildReviewSystemPrompt("fr")).toContain("in French");
    expect(buildReviewSystemPrompt("en")).toContain("in English");
    // Locale inconnue → l'anglais, jamais une consigne vide.
    expect(buildReviewSystemPrompt("de")).toContain("in English");
    expect(buildReviewSystemPrompt("en")).toContain("`+` = a line this PR adds");
  });
});
