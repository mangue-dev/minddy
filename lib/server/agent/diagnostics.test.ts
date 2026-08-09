import { describe, expect, it } from "vitest";
import {
  detectTestRunner,
  formatTestFailures,
  formatTypeErrors,
  parseTestFailures,
  parseTypeErrors,
  testRunnerBin,
  TEST_FAILURES_MAX_CHARS,
  TYPE_ERRORS_MAX_CHARS,
} from "./diagnostics";
import type { RepoHost } from "./repo-host";

/**
 * MIN-110 — le type-check de fin de tour. La partie sandbox (lancer `tsc` dans la
 * microVM) n'est pas testable ici ; ce qui l'est, et qui décide de ce que le modèle
 * lit vraiment, c'est le PARSING de la sortie de tsc, l'ordre (les fichiers du tour
 * d'abord) et le cap. Les sorties ci-dessous sont copiées de vraies exécutions dans
 * la microVM.
 */

const REAL = `lib/plan.ts(253,7): error TS2322: Type 'string' is not assignable to type 'number'.
components/agent/agent-event-feed.tsx(88,3): error TS2554: Expected 2 arguments, but got 1.`;

describe("parseTypeErrors", () => {
  it("lit la forme de `tsc --pretty false`", () => {
    const entries = parseTypeErrors(REAL);
    expect(entries.map((e) => e.file)).toEqual([
      "lib/plan.ts",
      "components/agent/agent-event-feed.tsx",
    ]);
    expect(entries[0].text).toContain("TS2322");
  });

  it("rattache les élaborations indentées à leur erreur", () => {
    const raw = `lib/a.ts(1,1): error TS2345: Argument of type 'A' is not assignable to parameter of type 'B'.
  Types of property 'id' are incompatible.
    Type 'string' is not assignable to type 'number'.
lib/b.ts(2,2): error TS2304: Cannot find name 'foo'.`;
    const entries = parseTypeErrors(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toContain("Types of property 'id' are incompatible.");
    expect(entries[1].text).toBe(`lib/b.ts(2,2): error TS2304: Cannot find name 'foo'.`);
  });

  it("jette les erreurs de configuration sans fichier — elles ne concernent pas le modèle", () => {
    const raw = `error TS5083: Cannot read file '/vercel/sandbox/repo/tsconfig.json'.`;
    expect(parseTypeErrors(raw)).toEqual([]);
  });

  it("ignore le bruit qui n'est pas une erreur", () => {
    expect(parseTypeErrors("")).toEqual([]);
    expect(parseTypeErrors("npm notice New minor version of npm available!")).toEqual([]);
  });
});

describe("formatTypeErrors", () => {
  it("se tait quand il n'y a rien à dire", () => {
    expect(formatTypeErrors("", ["lib/plan.ts"])).toBeNull();
    expect(formatTypeErrors("error TS5083: Cannot read file 'tsconfig.json'.", [])).toBeNull();
  });

  it("sert l'en-tête d'OpenCode et la consigne anti-boucle", () => {
    const block = formatTypeErrors(REAL, ["lib/plan.ts"]);
    expect(block).toContain("Type errors detected after your changes, please fix:");
    expect(block).toContain("TS2322");
    expect(block).toContain("do not fix it");
  });

  it("met les fichiers du tour EN TÊTE, le reste du dépôt derrière", () => {
    const block = formatTypeErrors(REAL, ["components/agent/agent-event-feed.tsx"]) ?? "";
    const mine = block.indexOf("agent-event-feed.tsx");
    const other = block.indexOf("lib/plan.ts");
    expect(mine).toBeGreaterThan(-1);
    expect(mine).toBeLessThan(other);
  });

  it("compare les chemins à une forme unique (`./lib/a.ts` = `lib/a.ts`)", () => {
    const raw = `lib/z.ts(1,1): error TS1: nope.
lib/a.ts(1,1): error TS2: nope.`;
    const block = formatTypeErrors(raw, ["./lib/a.ts"]) ?? "";
    expect(block.indexOf("lib/a.ts")).toBeLessThan(block.indexOf("lib/z.ts"));
  });

  it("cape le bloc et dit combien d'erreurs il cache", () => {
    const many = Array.from(
      { length: 200 },
      (_, i) => `lib/f${i}.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'.`,
    ).join("\n");
    const block = formatTypeErrors(many, []) ?? "";
    // Le cap porte sur les erreurs ; en-tête et consigne s'ajoutent par-dessus.
    expect(block.length).toBeLessThan(TYPE_ERRORS_MAX_CHARS + 400);
    expect(block).toMatch(/… and \d+ more errors\./);
    // Aucune ligne d'erreur coupée au milieu : un chemin tronqué envoie le modèle
    // éditer un fichier qui n'existe pas.
    for (const line of block.split("\n")) {
      if (line.includes("error TS")) expect(line).toMatch(/\.$/);
    }
  });

  it("sert quand même une erreur unique plus grosse que le cap, tronquée", () => {
    const huge = `lib/a.ts(1,1): error TS2345: ${"x".repeat(TYPE_ERRORS_MAX_CHARS * 2)}`;
    const block = formatTypeErrors(huge, ["lib/a.ts"]) ?? "";
    expect(block).toContain("lib/a.ts(1,1)");
    expect(block.length).toBeLessThan(TYPE_ERRORS_MAX_CHARS + 400);
  });

  it("un seul reste caché → singulier", () => {
    const raw = Array.from(
      { length: 40 },
      (_, i) => `lib/f${i}.ts(1,1): error TS2322: ${"y".repeat(45)}.`,
    ).join("\n");
    const block = formatTypeErrors(raw, []) ?? "";
    const hidden = /… and (\d+) more error(s?)\./.exec(block);
    expect(hidden).not.toBeNull();
    if (hidden && hidden[1] === "1") expect(hidden[2]).toBe("");
  });
});

/**
 * MIN-251 — la suite de tests, même geste que le type-check. Ce qui décide ici de
 * ce que le modèle lit vraiment : ce qu'on accepte de LANCER (`testRunnerBin`,
 * `detectTestRunner`), et ce qu'on sait LIRE d'une sortie de runner. Les sorties
 * ci-dessous sont copiées de vraies exécutions.
 */

const VITEST_OUT = `
 RUN  v4.1.10 /vercel/sandbox/repo

 ❯ lib/plan.test.ts (3 tests | 2 failed) 3ms
     × lit un plan vide 2ms
     × jette 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/plan.test.ts > le parseur > lit un plan vide
AssertionError: expected 2 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 2

 ❯ lib/plan.test.ts:4:19
      2| describe("le parseur", () => {
      3|   it("lit un plan vide", () => {
      4|     expect(1 + 1).toBe(3);
       |                   ^
      5|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  lib/plan.test.ts > le parseur > jette
Error: boom
 ❯ lib/plan.test.ts:7:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Duration  76ms
`;

const JEST_OUT = `
FAIL src/sum.test.js
  ● sum › adds numbers

    expect(received).toBe(expected) // Object.is equality

    Expected: 3
    Received: 2

      at Object.<anonymous> (src/sum.test.js:4:21)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 2 passed, 3 total
`;

describe("testRunnerBin", () => {
  it("lit le binaire, affectations d'environnement comprises", () => {
    expect(testRunnerBin("vitest run")).toBe("vitest");
    expect(testRunnerBin("jest --ci")).toBe("jest");
    expect(testRunnerBin("NODE_ENV=test CI=1 jest")).toBe("jest");
    expect(testRunnerBin("cross-env NODE_ENV=test jest")).toBe("cross-env");
  });

  it("refuse de deviner derrière une enveloppe", () => {
    // Derrière `npm run` ou `bash`, il n'y a pas de binaire à vérifier — donc pas
    // moyen de savoir si l'environnement est installé, et un `command not found`
    // servi comme un échec de test enverrait le modèle chercher un bug fantôme.
    expect(testRunnerBin("npm run test:unit")).toBeNull();
    expect(testRunnerBin("bash scripts/test.sh")).toBeNull();
    expect(testRunnerBin("node --test")).toBeNull();
    expect(testRunnerBin("pnpm -r test")).toBeNull();
  });

  it("refuse le script par défaut de `npm init` — il sort en 1 sans avoir testé", () => {
    expect(testRunnerBin(`echo "Error: no test specified" && exit 1`)).toBeNull();
  });
});

/** Host de papier : un `package.json` et un `test -x` qu'on décide. */
function hostWith(pkg: string | null, binPresent = true): RepoHost {
  return {
    exec: async () => ({ exitCode: binPresent ? 0 : 1, stdout: "", stderr: "" }),
    readFile: async () => pkg,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

describe("detectTestRunner", () => {
  it("retient le script `test` quand son binaire est là", async () => {
    const runner = await detectTestRunner(hostWith(`{"scripts":{"test":"vitest run"}}`));
    expect(runner).toEqual({ script: "vitest run", bin: "vitest" });
  });

  it("se tait quand le binaire n'est pas installé", async () => {
    // Notre échec de production le plus fréquent, côté type-check : le modèle lance
    // la vérification avant l'install. Un mur d'échecs y serait pire que le silence.
    expect(await detectTestRunner(hostWith(`{"scripts":{"test":"vitest run"}}`, false))).toBeNull();
  });

  it("se tait sans `package.json`, sans script `test`, ou sur du JSON illisible", async () => {
    expect(await detectTestRunner(hostWith(null))).toBeNull();
    expect(await detectTestRunner(hostWith(`{"scripts":{"build":"next build"}}`))).toBeNull();
    expect(await detectTestRunner(hostWith(`{"scripts":{"test":"  "}}`))).toBeNull();
    expect(await detectTestRunner(hostWith(`{ pas du json`))).toBeNull();
  });
});

describe("parseTestFailures", () => {
  it("lit la forme de vitest : fichier, suite, test, message, position", () => {
    const entries = parseTestFailures(VITEST_OUT);
    expect(entries.map((e) => e.title)).toEqual([
      "lib/plan.test.ts > le parseur > lit un plan vide",
      "lib/plan.test.ts > le parseur > jette",
    ]);
    expect(entries[0].text).toContain("AssertionError: expected 2 to be 3");
    expect(entries[0].text).toContain("lib/plan.test.ts:4:19");
    // L'extrait de code source est jeté : le modèle sait relire le fichier, et ces
    // lignes-là noieraient le message.
    expect(entries[0].text).not.toContain("describe(");
  });

  it("lit la forme de jest, et rattache l'échec à son fichier", () => {
    const entries = parseTestFailures(JEST_OUT);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("src/sum.test.js > sum › adds numbers");
    expect(entries[0].text).toContain("Expected: 3");
    expect(entries[0].text).toContain("src/sum.test.js:4:21");
  });

  it("s'arrête au récapitulatif — rien après n'appartient à un échec", () => {
    const entries = parseTestFailures(VITEST_OUT);
    expect(entries[1].text).not.toContain("Duration");
    expect(entries[1].text).not.toContain("2 failed");
  });

  it("ignore les couleurs du terminal", () => {
    // Le runner colorise dès qu'il croit parler à un terminal. Sans `NO_COLOR`, ou
    // avec un runner qui l'ignore, la sortie arrive habillée : elle doit se lire
    // pareil.
    const colored = VITEST_OUT.replaceAll("FAIL ", "[41m[1mFAIL[22m[49m ");
    expect(parseTestFailures(colored).map((e) => e.title)).toEqual(
      parseTestFailures(VITEST_OUT).map((e) => e.title),
    );
  });
});

describe("formatTestFailures", () => {
  it("sert l'en-tête et la consigne anti-boucle", () => {
    const block = formatTestFailures(VITEST_OUT) ?? "";
    expect(block).toContain("Tests are failing after your changes, please fix:");
    expect(block).toContain("do not fix it");
    // Chaque échec s'ouvre sur `FAIL ` — c'est ce que compte `failuresShown`.
    expect(block.split("\n").filter((l) => l.startsWith("FAIL ")).length).toBe(2);
  });

  it("cape le bloc et dit combien d'échecs il cache", () => {
    const many = Array.from(
      { length: 200 },
      (_, i) => ` FAIL  lib/f${i}.test.ts > groupe > cas ${i}\nAssertionError: expected 2 to be 3`,
    ).join("\n");
    const block = formatTestFailures(many) ?? "";
    expect(block.length).toBeLessThan(TEST_FAILURES_MAX_CHARS + 400);
    expect(block).toMatch(/… and \d+ more failing tests\./);
  });

  it("sur une sortie qu'on ne sait pas lire, sert la QUEUE plutôt que le silence", () => {
    // Une suite qui tombe à l'import, un runner inconnu, une config cassée : le
    // verdict vit toujours à la fin. Un « rouge sans détail » vaut infiniment mieux
    // qu'un tour qui se termine en croyant la suite verte — c'est tout le ticket.
    const raw = `Error: Cannot find module './missing'\n    at Object.<anonymous> (vitest.config.ts:3:1)`;
    const block = formatTestFailures(raw) ?? "";
    expect(block).toContain("Tests are failing after your changes");
    expect(block).toContain("Cannot find module './missing'");
  });

  it("se tait quand il n'y a pas de test à lancer, ou rien à dire", () => {
    expect(formatTestFailures("No test files found, exiting with code 1")).toBeNull();
    expect(formatTestFailures("")).toBeNull();
    expect(formatTestFailures("   \n  ")).toBeNull();
  });
});
