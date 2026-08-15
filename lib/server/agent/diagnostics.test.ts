import { describe, expect, it } from "vitest";
import {
  detectTestRunner,
  formatTestFailures,
  looksLikeTestCommand,
  newVerificationSink,
  noteVerificationCommand,
  noteVerificationStale,
  relatedTestCommand,
  formatTypeErrors,
  parseTestFailures,
  parseTypeErrors,
  testRunnerBin,
  TEST_FAILURES_MAX_CHARS,
  TYPE_ERRORS_MAX_CHARS,
} from "./diagnostics";
import type { RepoHost } from "./repo-host";
import { cloudLayout } from "./harness-layout";

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

/**
 * MIN-257 — le cas du ticket, capturé tel quel : `vitest run` (4.1.10 du dépôt) sur
 * deux fichiers sondes, l'un avec une assertion rouge, l'autre avec un import qui
 * n'existe plus. Vitest ouvre alors une section « Failed Suites » dont l'en-tête
 * `FAIL  <fichier> [ <fichier> ]` ne porte AUCUN `>` — la forme que le parseur ne
 * savait pas lire, et dont il jetait tout le corps.
 */
const VITEST_COLLECT_OUT = `
 RUN  v4.1.10 /Users/clementguerin/Projets/minddy-ticketing/minddy

 ❯ lib/zz-probe-b.test.ts (0 test)
 ❯ lib/zz-probe-a.test.ts (1 test | 1 failed) 3ms
     × adds 3ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/zz-probe-b.test.ts [ lib/zz-probe-b.test.ts ]
Error: Cannot find module './zz-gone-module' imported from /Users/clementguerin/Projets/minddy-ticketing/minddy/lib/zz-probe-b.test.ts
 ❯ lib/zz-probe-b.test.ts:2:1
      1| import { describe, expect, it } from "vitest";
      2| import { renamed } from "./zz-gone-module";
       | ^
      3|
      4| describe("probe b", () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/zz-probe-a.test.ts > probe a > adds
AssertionError: expected 2 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 2

 ❯ lib/zz-probe-a.test.ts:5:19
      3| describe("probe a", () => {
      4|   it("adds", () => {
      5|     expect(1 + 1).toBe(3);
       |                   ^
      6|   });
      7| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  1 failed (1)
   Start at  15:35:37
   Duration  90ms (transform 19ms, setup 0ms, import 15ms, tests 3ms, environment 0ms)
`;

/** La même exécution, sonde à l'import SEULE : aucun test n'a même été collecté. */
const VITEST_COLLECT_ONLY_OUT = `
 RUN  v4.1.10 /Users/clementguerin/Projets/minddy-ticketing/minddy

 ❯ lib/zz-probe-b.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/zz-probe-b.test.ts [ lib/zz-probe-b.test.ts ]
Error: Cannot find module './zz-gone-module' imported from /Users/clementguerin/Projets/minddy-ticketing/minddy/lib/zz-probe-b.test.ts
 ❯ lib/zz-probe-b.test.ts:2:1
      1| import { describe, expect, it } from "vitest";
      2| import { renamed } from "./zz-gone-module";
       | ^
      3|
      4| describe("probe b", () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  15:35:45
   Duration  72ms (transform 7ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
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
    layout: cloudLayout(),
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

  it("lit un fichier qui n'a pas CHARGÉ — la forme sans `>` de « Failed Suites »", () => {
    const entries = parseTestFailures(VITEST_COLLECT_ONLY_OUT);
    expect(entries).toHaveLength(1);
    // Ni suite ni cas à nommer : le titre vaut le fichier.
    expect(entries[0].title).toBe("lib/zz-probe-b.test.ts");
    expect(entries[0].kind).toBe("suite");
    // Et surtout le CORPS, qui partait entièrement à la poubelle.
    expect(entries[0].text).toContain("Cannot find module './zz-gone-module'");
    expect(entries[0].text).toContain("lib/zz-probe-b.test.ts:2:1");
    expect(entries[0].text).not.toContain("describe(");
  });

  it("lit les DEUX : le fichier tombé à l'import ET l'assertion rouge d'ailleurs", () => {
    // Le cas du ticket. Une seule assertion parsée suffisait à désarmer le repli,
    // et l'échec le plus directement causé par l'édition du modèle disparaissait.
    const entries = parseTestFailures(VITEST_COLLECT_OUT);
    expect(entries.map((e) => e.title)).toEqual([
      "lib/zz-probe-b.test.ts",
      "lib/zz-probe-a.test.ts > probe a > adds",
    ]);
    expect(entries[0].kind).toBe("suite");
    expect(entries[1].kind).toBeUndefined();
  });

  it("n'ouvre pas un contexte de fichier jest sur un échec de collecte", () => {
    // `FAIL <fichier>` seul, chez jest, NOMME les `●` qui suivent. La forme
    // `FAIL <fichier> [ <fichier> ]` est un échec à part entière : elle ne doit pas
    // se faire prendre pour cet en-tête-là, ni renommer l'échec suivant.
    const raw = `${VITEST_COLLECT_ONLY_OUT}
  ● sum › adds numbers
    Expected: 3`;
    const entries = parseTestFailures(raw);
    expect(entries.map((e) => e.title)).toEqual(["lib/zz-probe-b.test.ts", "sum › adds numbers"]);
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

  it("sert le fichier tombé à l'import EN TÊTE, sans perdre l'assertion rouge", () => {
    const block = formatTestFailures(VITEST_COLLECT_OUT) ?? "";
    expect(block).toContain("FAIL lib/zz-probe-b.test.ts");
    expect(block).toContain("Cannot find module './zz-gone-module'");
    expect(block).toContain("FAIL lib/zz-probe-a.test.ts > probe a > adds");
    expect(block).toContain("AssertionError: expected 2 to be 3");
    // Un fichier entier à zéro pèse plus qu'un cas : il passe devant le cap.
    expect(block.indexOf("FAIL lib/zz-probe-b.test.ts")).toBeLessThan(
      block.indexOf("FAIL lib/zz-probe-a.test.ts"),
    );
  });

  it("ne laisse pas le cap manger l'échec de collecte", () => {
    // 200 assertions rouges devant, un fichier non chargé derrière : c'est LUI qui
    // doit rester dans le bloc, pas être poussé dehors par le volume.
    const many = Array.from(
      { length: 200 },
      (_, i) => ` FAIL  lib/f${i}.test.ts > groupe > cas ${i}\nAssertionError: expected 2 to be 3`,
    ).join("\n");
    const block = formatTestFailures(`${many}\n${VITEST_COLLECT_ONLY_OUT}`) ?? "";
    expect(block).toContain("FAIL lib/zz-probe-b.test.ts");
    expect(block).toContain("Cannot find module './zz-gone-module'");
  });

  it("sert la QUEUE quand la sortie annonce des « Failed Suites » qu'on n'a pas su lire", () => {
    // Le repli ne doit pas se désarmer sur une seule assertion parsée ailleurs : si
    // vitest change la forme de cet en-tête, on sert la queue brute plutôt que de
    // rendre un bloc qui tait le fichier tombé.
    const raw = VITEST_COLLECT_OUT.replace(
      " FAIL  lib/zz-probe-b.test.ts [ lib/zz-probe-b.test.ts ]",
      " FORME-INCONNUE  lib/zz-probe-b.test.ts",
    );
    const block = formatTestFailures(raw) ?? "";
    expect(block).toContain("Tests are failing after your changes");
    expect(block).toContain("Cannot find module './zz-gone-module'");
  });

  it("se tait quand il n'y a pas de test à lancer, ou rien à dire", () => {
    expect(formatTestFailures("No test files found, exiting with code 1")).toBeNull();
    expect(formatTestFailures("")).toBeNull();
    expect(formatTestFailures("   \n  ")).toBeNull();
  });
});

/**
 * MIN-262 — CE QUE LE MODÈLE A VÉRIFIÉ LUI-MÊME.
 *
 * La reconnaissance de commande est le point sensible de tout le ticket : un faux
 * positif fait TAIRE le harness, c'est-à-dire qu'il rend le silence à un tour que
 * personne n'a vérifié. D'où une batterie qui teste surtout ce qu'on REFUSE.
 */
describe("looksLikeTestCommand", () => {
  it("reconnaît le script du projet et les runners appelés par leur nom", () => {
    for (const cmd of [
      "npm test",
      "npm t",
      "npm run test",
      "npm run test --silent",
      "npm run test:unit",
      "pnpm test",
      "pnpm run test",
      "yarn test",
      "bun run test",
      "npx vitest run lib/x.test.ts",
      "vitest run",
      "./node_modules/.bin/vitest related --run lib/x.ts",
      "jest --findRelatedTests lib/x.ts",
      "pnpm exec jest",
      "CI=1 NODE_ENV=test npm test",
      "npm install && npm test",
      "go test ./...",
      "cargo test",
      "python -m pytest tests/",
      "pytest -q",
    ]) {
      expect(looksLikeTestCommand(cmd), cmd).toBe(true);
    }
  });

  it("refuse tout ce qui rend le code de sortie menteur", () => {
    // `|| true` et `; echo` sortent en 0 quoi qu'il arrive ; un pipe rend le code
    // du DERNIER maillon. Les trois transformeraient une suite rouge en silence.
    for (const cmd of [
      "npm test || true",
      "npm test; echo done",
      "npm test | tail -5",
      "npm test &",
      "echo $(npm test)",
      "npm test `date`",
    ]) {
      expect(looksLikeTestCommand(cmd), cmd).toBe(false);
    }
  });

  it("refuse le mode watch, qui ne conclut jamais", () => {
    expect(looksLikeTestCommand("vitest --watch")).toBe(false);
    expect(looksLikeTestCommand("npm run test -- --watch")).toBe(false);
    expect(looksLikeTestCommand("vitest --ui")).toBe(false);
  });

  it("refuse ce qui n'est pas une vérification, et les enveloppes illisibles", () => {
    for (const cmd of [
      "npm run typecheck",
      "npm run build",
      "npm run lint",
      "npm install",
      "git status",
      "bash scripts/test.sh",
      "make test",
      "node --test",
      "",
      "   ",
    ]) {
      expect(looksLikeTestCommand(cmd), cmd).toBe(false);
    }
  });

  it("ne lit que le DERNIER maillon d'une chaîne `&&`", () => {
    // `&&` propage l'échec, donc le code de sortie est celui du dernier — mais un
    // `npm test && npm run build` sorti en 0 ne dit rien de plus que « le build
    // passe » si le build est ce qui a fini : la reconnaissance suit ce maillon-là.
    expect(looksLikeTestCommand("npm test && npm run build")).toBe(false);
    expect(looksLikeTestCommand("npm run build && npm test")).toBe(true);
  });
});

describe("le registre de vérification", () => {
  it("se remplit sur un vert, se vide sur un rouge, ignore le reste", () => {
    const sink = newVerificationSink();
    expect(sink.greenCommand).toBeNull();

    noteVerificationCommand(sink, "npm run typecheck", 0);
    expect(sink.greenCommand).toBeNull(); // pas une commande de test

    noteVerificationCommand(sink, "npm test", 0);
    expect(sink.greenCommand).toBe("npm test");

    // Rouge : le modèle a vu l'échec. S'il ne le corrige pas, le harness doit
    // reparler — donc le registre se vide.
    noteVerificationCommand(sink, "npm test", 1);
    expect(sink.greenCommand).toBeNull();
  });

  it("est périmé par toute édition — c'est l'invariant du ticket", () => {
    const sink = newVerificationSink();
    noteVerificationCommand(sink, "npm test", 0);
    noteVerificationStale(sink);
    expect(sink.greenCommand).toBeNull();
  });
});

describe("relatedTestCommand", () => {
  it("bâtit le passage ciblé de vitest et de jest, chemins échappés", () => {
    expect(relatedTestCommand({ script: "vitest run", bin: "vitest" }, ["lib/a b.ts"])).toBe(
      "./node_modules/.bin/vitest related --run --passWithNoTests 'lib/a b.ts' 2>&1",
    );
    expect(relatedTestCommand({ script: "jest", bin: "jest" }, ["lib/a.ts"])).toBe(
      "./node_modules/.bin/jest --findRelatedTests --passWithNoTests 'lib/a.ts' 2>&1",
    );
  });

  it("rend null quand il n'y a pas de mode ciblé, ou rien à cibler", () => {
    // Un runner qu'on ne connaît pas : l'appelant retombe sur la suite entière
    // plutôt que d'inventer un drapeau qui ne veut rien dire.
    expect(relatedTestCommand({ script: "mocha", bin: "mocha" }, ["lib/a.ts"])).toBeNull();
    expect(relatedTestCommand({ script: "vitest run", bin: "vitest" }, [])).toBeNull();
    expect(relatedTestCommand({ script: "vitest run", bin: "vitest" }, ["  "])).toBeNull();
  });
});
