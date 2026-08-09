import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Un test structurel a besoin d'un TypeScript en JS pour lire un arbre.
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VM_BUNDLE_PATH, VM_JOB_PATH, type VmJob } from "./vm/protocol";

/**
 * MIN-224 — L'AMORÇAGE DE LA MICROVM EST DU COMPUTE, ET IL DOIT ÊTRE FACTURÉ.
 *
 * Ce qu'il manquait. Le wall-clock de la microVM a changé de main avec la boucle :
 * c'est elle qui le tient, du début à la fin du tour. Mais son horloge ne démarre
 * qu'au lancement du process node — et avant lui, la fonction a réveillé ou CRÉÉ
 * la machine, posé la politique réseau, cloné le dépôt (~22 s à froid, MIN-222) et
 * écrit 280 Ko de bundle. La fonction ne facturait plus rien pour ces runs, la VM
 * ne pouvait pas connaître une durée d'avant sa naissance : cette tranche-là ne
 * tombait dans AUCUN compteur. Un défaut qui ne se voit pas — il faut comparer le
 * ledger à la facture Vercel pour s'en apercevoir.
 *
 * Deux moitiés, donc deux familles de tests. `startVmLoop` se monte pour de vrai
 * (un faux Sandbox suffit) ; la garde du `finally` d'`executeAgentRun`, elle, ne
 * s'atteint qu'avec une microVM, une base et un modèle — mais l'invariant y est
 * lexical, et ça se lit dans l'arbre. Le compilateur ne dira jamais rien : la
 * garde d'origine (`!run.loop_in_vm`) type parfaitement.
 */

// ── `startVmLoop` : où la mesure se prend ────────────────────────────────────

const h = vi.hoisted(() => ({
  writes: [] as Array<Array<{ path: string; content: string }>>,
  ranCommand: null as null | { cmd: string; args: string[] },
  /** Combien de temps le SDK met à écrire le bundle — le gros de l'amorçage. */
  bundleWriteMs: 0,
  /**
   * L'HORLOGE EST PILOTÉE, ELLE NE TOURNE PAS. Ces tests mesurent une durée : la
   * première version faisait dormir `writeFiles` de 120 ms et attendait
   * `bootstrapMs >= 120`. `setTimeout(n)` rend la main à `n - 1` ms d'horloge
   * murale environ trois fois sur mille au repos, bien plus souvent sous les
   * 2 800 tests de la suite — le test échouait donc au hasard, et le harness
   * servait cet échec à l'agent comme une régression de son propre changement
   * (run f80dca09, MIN-249 : un aller-retour de modèle brûlé sur un test vert).
   * Une horloge à la main rend la mesure EXACTE, donc l'assertion aussi.
   */
  nowMs: 1_700_000_000_000,
}));

// Le bundle est lu PAR CHEMIN dans `.agent-vm/`, un artefact que seul `prebuild`
// produit. Sans ce double, ces tests ne passeraient que sur une machine qui vient
// de builder — et échoueraient sur un dépôt fraîchement cloné.
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi.fn(async () => "// bundle de test"),
}));

const sandbox = () =>
  ({
    mkDir: vi.fn(async () => {}),
    writeFiles: vi.fn(async (files: Array<{ path: string; content: string }>) => {
      h.writes.push(files);
      // L'écriture du bundle ne DORT pas, elle AVANCE l'horloge : même effet sur
      // ce que `startVmLoop` mesure, sans dépendre de l'ordonnanceur.
      if (files.some((f) => f.path === VM_BUNDLE_PATH)) h.nowMs += h.bundleWriteMs;
    }),
    runCommand: vi.fn(async (params: { cmd: string; args: string[] }) => {
      h.ranCommand = params;
      return { cmdId: "cmd-42" };
    }),
  }) as never;

const { startVmLoop } = await import("./vm-launch");

/** Le job tel qu'il a ATTERRI sur le disque de la microVM. */
function writtenJob(): VmJob {
  const file = h.writes.flat().find((f) => f.path === VM_JOB_PATH);
  expect(file, "aucun job écrit dans la microVM").toBeDefined();
  return JSON.parse(file!.content) as VmJob;
}

const jobInput = (): Omit<VmJob, "bootstrapMs"> =>
  ({
    runId: "run-1",
    workBranch: "minddy/agent/min-42",
    messages: [],
  }) as unknown as Omit<VmJob, "bootstrapMs">;

let nowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.writes.length = 0;
  h.ranCommand = null;
  h.bundleWriteMs = 0;
  h.nowMs = 1_700_000_000_000;
  nowSpy = vi.spyOn(Date, "now").mockImplementation(() => h.nowMs);
});

afterEach(() => {
  nowSpy.mockRestore();
});

describe("startVmLoop pose la durée de l'amorçage dans le job", () => {
  it("mesure depuis le début du travail de la FONCTION, pas depuis son propre appel", async () => {
    // 400 ms d'amorçage déjà écoulées quand on l'appelle : réveil de la microVM,
    // politique réseau, clone. C'est le gros du chiffre, et il est derrière nous.
    const callStart = Date.now() - 400;
    await startVmLoop(sandbox(), jobInput(), callStart);
    expect(writtenJob().bootstrapMs).toBe(400);
  });

  it("compte l'écriture du bundle — c'est pour elle qu'il y a deux écritures", async () => {
    // Le job ne peut porter la mesure qu'APRÈS ce qui la compose. Un seul
    // `writeFiles` obligerait à figer le chiffre avant ses 280 Ko.
    h.bundleWriteMs = 120;
    await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(writtenJob().bootstrapMs).toBe(120);
  });

  it("écrit le bundle D'ABORD, le job ENSUITE", async () => {
    await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(h.writes.map((w) => w.map((f) => f.path))).toEqual([[VM_BUNDLE_PATH], [VM_JOB_PATH]]);
  });

  it("lance le bundle en détaché et rend l'identifiant de la commande", async () => {
    const cmdId = await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(cmdId).toBe("cmd-42");
    expect(h.ranCommand).toMatchObject({ cmd: "node", args: [VM_BUNDLE_PATH] });
  });
});

// ── la garde du `finally` d'execute.ts ───────────────────────────────────────

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");
const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

/**
 * La condition qui décide si la FONCTION facture la microVM de ce passage.
 *
 * Elle a déménagé sans changer de sens : le métrage vit maintenant dans
 * `billSandboxCompute`, appelé par les mises au repos (pour que `cost_usd` puisse
 * relire un ledger complet) et par le `finally` en filet. La garde y est une
 * sortie anticipée plutôt qu'un `if` autour de l'appel — ce qu'on vérifie est la
 * CONDITION, pas sa forme.
 */
function sandboxUsageGuard(): string {
  let decl: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "billSandboxCompute"
    ) {
      decl ??= node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(decl, "le métrage compute a disparu d'execute.ts").toBeDefined();
  expect(
    decl!.getText(),
    "`billSandboxCompute` ne facture plus rien",
  ).toContain("recordSandboxUsage");

  let guard: ts.Expression | undefined;
  const firstIf = (node: ts.Node) => {
    if (guard) return;
    if (ts.isIfStatement(node)) guard = node.expression;
    else ts.forEachChild(node, firstIf);
  };
  ts.forEachChild(decl!, firstIf);
  expect(guard, "`billSandboxCompute` ne garde plus rien").toBeDefined();
  return guard!.getText();
}

describe("execute.ts facture la microVM quand la boucle n'est PAS partie", () => {
  it("garde le métrage sur `vmLoopLaunched`, pas sur `run.loop_in_vm`", () => {
    const guard = sandboxUsageGuard();
    // La différence entre les deux tient tout le défaut : un amorçage qui LÈVE
    // est bien un run `loop_in_vm`, mais aucune boucle n'en rendra jamais compte.
    // Le chien de garde ne le rattrape pas non plus — il ne balaie que les runs
    // `running`, et celui-ci vient d'être mis au repos par le `catch`.
    expect(guard).toContain("vmLoopLaunched");
    expect(
      guard,
      "garder sur `run.loop_in_vm` laisse un amorçage en échec facturé zéro",
    ).not.toContain("run.loop_in_vm");
  });

  it("ne déclare la boucle partie qu'APRÈS avoir persisté son identifiant de commande", () => {
    const text = source.getText();
    const stamp = text.indexOf("loop_command_id: cmdId");
    const launched = text.indexOf("vmLoopLaunched = true");
    expect(stamp, "`loop_command_id` n'est plus persisté").toBeGreaterThan(-1);
    expect(launched, "`vmLoopLaunched` n'est plus posé").toBeGreaterThan(-1);
    // Si le stamp échoue, le tour part sans que son id soit en base : son rapport
    // sera refusé en 409 et le chien de garde n'aura rien à interroger. Personne
    // ne facturera cette microVM-là si ce n'est pas la fonction.
    expect(launched, "`vmLoopLaunched` doit être posé après le stamp, pas avant").toBeGreaterThan(
      stamp,
    );
  });
});
