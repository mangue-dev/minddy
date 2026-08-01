import { describe, expect, it } from "vitest";

import { resolveDiffPosition } from "./mr-position";
import {
  AI_REVIEW_DIFF_MAX_CHARS,
  AI_REVIEW_FILE_MAX_CHARS,
  AI_REVIEW_MAX_INLINE_COMMENTS,
  AI_REVIEW_NOTE_MAX_CHARS,
  annotatePatch,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  elideAnnotatedPatch,
  formatReviewBody,
  normalizeFindingPath,
  parseAiReview,
  parsePartialReview,
  selectFindings,
  type ReviewFinding,
  type ReviewNote,
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

describe("elideAnnotatedPatch", () => {
  /** Un patch d'un seul hunk, largement au-dessus du budget d'un fichier. */
  const bigPatch = (count: number) =>
    [
      `@@ -1,${count} +1,${count} @@`,
      ...Array.from({ length: count }, (_, i) => `+const value${i} = compute(${i}, "padding");`),
    ].join("\n");

  it("laisse un patch sous le budget exactement tel quel", () => {
    expect(elideAnnotatedPatch(annotatePatch(PATCH), AI_REVIEW_FILE_MAX_CHARS)).toBe(
      annotatePatch(PATCH),
    );
  });

  /**
   * LE test de cette fonction. Une coupe au caractère fait reprendre la queue au
   * milieu d'une ligne : `+456│const x = …` devient `56│const x = …`, et le
   * prompt demande au modèle de RECOPIER le numéro imprimé — 56 est valide
   * ailleurs dans le diff, le commentaire atterrirait sur une autre ligne.
   * Chaque ligne rendue doit donc porter son signe ET son numéro entier.
   */
  it("ne coupe jamais au milieu d'une ligne : tout numéro rendu est une ancre valide", () => {
    const patch = bigPatch(600);
    const elided = elideAnnotatedPatch(annotatePatch(patch), AI_REVIEW_FILE_MAX_CHARS);
    expect(elided.length).toBeLessThanOrEqual(AI_REVIEW_FILE_MAX_CHARS);
    expect(elided).toMatch(/\[\d+ lines elided\]/);

    for (const line of elided.split("\n")) {
      if (line.startsWith("@@") || line.startsWith("…")) continue;
      const m = /^([ +-])(\d+)│/.exec(line);
      // Un fragment (`56│…`, `│const …`) ne matche pas — c'est la faute cherchée.
      expect(m, `ligne tronquée : ${JSON.stringify(line)}`).not.toBeNull();
      const side = m![1] === "-" ? "LEFT" : "RIGHT";
      expect(resolveDiffPosition(patch, Number(m![2]), side)).not.toBeNull();
    }
  });

  /**
   * Une ligne à elle seule plus longue que le budget (fichier minifié, data URL)
   * ne peut pas entrer entière. Coupée par la FIN : le préfixe `+2│` survit, donc
   * l'ancre reste juste — c'est le code qui manque, et le `…` le dit.
   */
  it("coupe une ligne trop longue par la fin, son numéro en tête", () => {
    const patch = ["@@ -1,2 +1,2 @@", "+court", `+${"x".repeat(40_000)}`].join("\n");
    const elided = elideAnnotatedPatch(annotatePatch(patch), AI_REVIEW_FILE_MAX_CHARS);
    const lines = elided.split("\n");
    expect(lines[lines.length - 1]).toMatch(/^\+2│x+ …$/);
    expect(elided.length).toBeLessThanOrEqual(AI_REVIEW_FILE_MAX_CHARS);
  });
});

describe("buildReviewUserMessage", () => {
  it("montre un gros fichier sans jamais tronquer un numéro de ligne", () => {
    const patch = [
      "@@ -1,600 +1,600 @@",
      ...Array.from({ length: 600 }, (_, i) => `+const value${i} = compute(${i}, "padding");`),
    ].join("\n");
    const message = buildReviewUserMessage({
      title: "Gros fichier",
      files: [{ filename: "lib/gros.ts", status: "modified", patch }],
    });
    const block = message.slice(message.indexOf("```diff") + 8, message.lastIndexOf("```"));
    for (const line of block.split("\n")) {
      if (!line || line.startsWith("@@") || line.startsWith("…")) continue;
      expect(line, `ligne tronquée : ${JSON.stringify(line)}`).toMatch(/^[ +-]\d+│/);
    }
  });

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

  /**
   * Le plan est la référence contre laquelle le diff se lit, et les commentaires
   * du ticket sont l'endroit où un écart au plan s'argumente : sans les deux, un
   * écart ASSUMÉ se lit comme une faute.
   */
  it("porte le plan du ticket et ce qui s'est dit dessus", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      issue: {
        identifier: "MIN-1",
        title: "Le compteur déraille",
        plan: "## Contexte\n\n- [x] Réparer `count()`\n- [ ] Tester",
        comments: [
          { author: "Clément G", body: "Finalement on garde l'ancien nom." },
          { author: "Numo", body: "Noté, la tâche 2 tombe." },
        ],
      },
      files: FILES,
    });
    expect(message).toContain("Its implementation plan");
    expect(message).toContain("- [x] Réparer `count()`");
    // L'état des cases est expliqué : « fait » sans code dans le diff est le
    // signalement que le plan sert à rendre possible.
    expect(message).toContain("`[x]` done");
    expect(message).toContain("What was said on the issue");
    expect(message).toContain("**Clément G** — Finalement on garde l'ancien nom.");
    expect(message).toContain("**Numo** — Noté, la tâche 2 tombe.");
  });

  it("porte ce qui a déjà été dit sur la PR, ancres comprises", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      conversation: {
        reviews: [
          { author: "alice", about: "changes requested", body: "Il manque un test." },
        ],
        reviewComments: [
          { author: "bob", about: "lib/demo.ts:11", body: "Ce nom est trompeur." },
        ],
        comments: [{ author: "carol", body: "Je regarde ce soir." }],
      },
      files: FILES,
    });
    expect(message).toContain("What has already been said on this pull request");
    expect(message).toContain("**alice** (changes requested) — Il manque un test.");
    expect(message).toContain("**bob** (lib/demo.ts:11) — Ce nom est trompeur.");
    expect(message).toContain("**carol** — Je regarde ce soir.");
  });

  it("garde les messages les plus RÉCENTS et compte ceux qu'il tait", () => {
    const many: ReviewNote[] = Array.from({ length: 40 }, (_, i) => ({
      author: "bob",
      body: `message ${i} ${"x".repeat(AI_REVIEW_NOTE_MAX_CHARS)}`,
    }));
    const message = buildReviewUserMessage({
      title: "PR bavarde",
      conversation: { reviews: [], reviewComments: [], comments: many },
      files: FILES,
    });
    expect(message).toContain("message 39");
    expect(message).not.toContain("message 0 ");
    expect(message).toMatch(/\(\d+ older not shown\)/);
    // Un pavé est élidé par le milieu, pas jeté.
    expect(message).toContain("chars elided");
  });

  /**
   * Le budget des messages est PARTAGÉ : une PR très commentée ne doit pas faire
   * disparaître les commentaires du ticket — ce sont eux qui expliquent les
   * écarts au plan, et l'inverse serait exactement la mauvaise coupe.
   */
  it("aucune liste n'affame les autres", () => {
    const long = (n: number): ReviewNote[] =>
      Array.from({ length: n }, (_, i) => ({
        author: "bob",
        body: `bruit ${i} ${"x".repeat(AI_REVIEW_NOTE_MAX_CHARS)}`,
      }));
    const message = buildReviewUserMessage({
      title: "PR bavarde",
      issue: { identifier: "MIN-1", title: "T", comments: long(40) },
      conversation: {
        reviews: [{ author: "alice", about: "approved", body: "LE verdict." }],
        reviewComments: [{ author: "bob", about: "lib/demo.ts:11", body: "LE point." }],
        comments: long(40),
      },
      files: FILES,
    });
    expect(message).toContain("LE verdict.");
    expect(message).toContain("LE point.");
    expect(message).toContain("What was said on the issue");
    expect(message).toContain("The pull request thread");
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

  /**
   * Un renommage s'adresse par son chemin ACTUEL, des deux côtés du diff — y
   * compris sur une ligne supprimée (la convention du composer humain,
   * `pr-diff.tsx`). L'ancien nom n'existe pas dans le diff de la forge, et la vue
   * diff de minddy indexe les fils sur `files[].filename`. Le modèle, lui, peut
   * nommer l'un ou l'autre : les deux doivent atterrir sur le nouveau.
   */
  it("adresse un renommage par son chemin actuel, des deux côtés", () => {
    const renamed: ReviewableFile[] = [
      { filename: "lib/neuf.ts", previous_filename: "lib/ancien.ts", status: "renamed", patch: PATCH },
    ];
    for (const named of ["lib/neuf.ts", "lib/ancien.ts"]) {
      const { inline } = selectFindings(
        [finding({ path: named, line: 11, side: "LEFT" })],
        renamed,
      );
      expect(inline[0].path).toBe("lib/neuf.ts");
    }
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

  it("dit quoi faire du plan et de ce qui a déjà été écrit", () => {
    const prompt = buildReviewSystemPrompt("fr");
    // Le plan est une référence de lecture, pas une loi : un écart argumenté
    // dans les commentaires n'est pas une faute.
    expect(prompt).toContain("decided before the code was written");
    expect(prompt).toContain("Departing from the plan is not a defect in itself");
    expect(prompt).toContain("Do not say again what has already been said");
  });
});

describe("parsePartialReview", () => {
  /** Le tool call tel qu'il arrive : coupé n'importe où, y compris au milieu
   *  d'un mot, d'un échappement ou d'un objet. */
  const FULL = JSON.stringify({
    summary: "Cette PR ajoute un compteur.\nLe reste **tient**.",
    verdict: "comment",
    findings: [
      { path: "lib/a.ts", line: 12, side: "RIGHT", severity: "risk", body: "Cas non couvert." },
      { path: "lib/b.ts", line: 3, side: "LEFT", severity: "nit", body: "Nom trompeur." },
    ],
  });

  it("rend la synthèse échappements résolus, avant même la fin de la phrase", () => {
    const cut = FULL.slice(0, FULL.indexOf("compteur"));
    const partial = parsePartialReview(cut);
    expect(partial.summary).toBe("Cette PR ajoute un");
    // Le `\n` du JSON est une VRAIE fin de ligne à l'écran, pas deux caractères.
    expect(parsePartialReview(FULL).summary).toContain("compteur.\nLe reste");
  });

  it("ne rend que les points COMPLETS — un point à moitié écrit n'a pas d'ancre", () => {
    const cut = FULL.slice(0, FULL.indexOf('"body":"Nom') + 10);
    const partial = parsePartialReview(cut);
    expect(partial.findings).toHaveLength(1);
    expect(partial.findings[0]).toMatchObject({ path: "lib/a.ts", line: 12 });
    expect(parsePartialReview(FULL).findings).toHaveLength(2);
  });

  it("survit à une coupe au milieu d'un échappement", () => {
    const src = '{"summary": "avant\\';
    expect(parsePartialReview(src).summary).toBe("avant");
    expect(parsePartialReview('{"summary": "avant\\u00e').summary).toBe("avant");
    expect(parsePartialReview('{"summary": "avant\\u00e9"').summary).toBe("avanté");
  });

  it("ne confond pas une clé citée DANS un texte avec la vraie clé", () => {
    const src = '{"summary": "on parle de \\"findings\\" ici", "findings": [';
    const partial = parsePartialReview(src);
    expect(partial.summary).toBe('on parle de "findings" ici');
    expect(partial.findings).toEqual([]);
  });

  it("rend du vide sur une entrée vide plutôt que de lever", () => {
    expect(parsePartialReview("")).toEqual({ summary: "", findings: [] });
    expect(parsePartialReview("{")).toEqual({ summary: "", findings: [] });
    expect(parsePartialReview('{"verdict": "approve"}').summary).toBe("");
  });

  it("lit la même chose que parseAiReview une fois le flux terminé", () => {
    const complete = parseAiReview(JSON.parse(FULL));
    const partial = parsePartialReview(FULL);
    expect(partial.summary).toBe(complete?.summary);
    expect(partial.findings).toEqual(complete?.findings);
  });
});

/**
 * Répondre à Numo en citant son message (MIN-162) : la mention le relance, et
 * le message cité doit arriver ENTIER, présenté comme le sien — sans quoi il
 * redécouvre son propre propos et le redit.
 */
describe("buildReviewUserMessage — la demande et le message cité", () => {
  it("met la demande en tête, avant le diff", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      files: FILES,
      question: { author: "mangue-dev", body: "@numo tu peux revérifier le cas vide ?" },
    });
    expect(message).toContain("## What you were asked");
    expect(message).toContain("@mangue-dev");
    expect(message).toContain("> @numo tu peux revérifier le cas vide ?");
    // En TÊTE : c'est la demande, le reste n'est que ce qu'il faut pour y répondre.
    expect(message.indexOf("## What you were asked")).toBeLessThan(message.indexOf("## Diff"));
  });

  it("dit à Numo qu'un message cité est LE SIEN", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      files: FILES,
      question: {
        author: "mangue-dev",
        body: "@Numo et pour le cas vide ?",
        replyTo: {
          author: "minddy-app[bot]",
          body: "J'ai relu le diff : le compteur ne gère pas la liste vide.",
          mine: true,
        },
      },
    });
    expect(message).toContain("### The message being replied to");
    expect(message).toContain("**This one is yours**");
    expect(message).toContain("> J'ai relu le diff : le compteur ne gère pas la liste vide.");
  });

  it("nomme l'auteur quand le message cité est celui de quelqu'un d'autre", () => {
    const message = buildReviewUserMessage({
      title: "Corrige le compteur",
      files: FILES,
      question: {
        author: "mangue-dev",
        body: "@numo qu'en penses-tu ?",
        replyTo: { author: "octocat", body: "Je trouve ça risqué.", mine: false },
      },
    });
    expect(message).toContain("Written by @octocat");
    expect(message).not.toContain("**This one is yours**");
  });

  it("ne pose aucune section quand rien n'a été demandé", () => {
    const message = buildReviewUserMessage({ title: "Corrige le compteur", files: FILES });
    expect(message).not.toContain("## What you were asked");
    expect(message).not.toContain("### The message being replied to");
  });
});

describe("buildReviewSystemPrompt", () => {
  it("n'explique la mention QUE quand la passe vient d'une mention", () => {
    expect(buildReviewSystemPrompt("fr", true)).toContain("What you were asked");
    expect(buildReviewSystemPrompt("fr", true)).toContain("cannot change the code");
    expect(buildReviewSystemPrompt("fr")).not.toContain("What you were asked");
  });
});
