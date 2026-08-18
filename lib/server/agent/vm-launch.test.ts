import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer delivers the API
// compiler. A structural test needs a TypeScript in JS to read a tree.
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { vmBundlePath, vmJobPath, VM_PROTOCOL_VERSION, type VmJob } from "./vm/protocol";
import { cloudLayout, layoutForRoot } from "./harness-layout";

/** The layout of a run in microVM — the one that the function places on each job. */
const LAYOUT = cloudLayout();
const BUNDLE_PATH = vmBundlePath(LAYOUT);
const JOB_PATH = vmJobPath(LAYOUT);

/**
 * MIN-224 — MICROVM BOOT IS COMPUTE, AND IT MUST BE CHARGED.
 *
 * What was missing. The wall-clock of the microVM has changed hands with the loop:
 * it is she who holds it, from the start to the end of the turn. But its clock only starts
 * when the process node is launched — and before it, the function has woken up or CREATED
 * the machine, set the network policy, cloned the repository (~22 s cold, MIN-222) and
 * wrote 280 KB of bundle. The function no longer charged anything for these runs, the VM
 * could not know a duration before its birth: this slice did not
 * fall into ANY counter. A defect that is not visible — you have to compare the
 * ledger to the Vercel invoice to notice it.
 *
 * Two halves, therefore two families of tests. `startVmLoop` is set up for real
 * (a fake Sandbox is enough); the custody of `finally` of `executeAgentRun`, it is only achieved with a microVM, a base and a model - but the invariant is lexical, and it can be read in the tree. The compiler will never say anything: the
 * keeps original (`!run.loop_in_vm`) type perfectly.
 */

// ── `startVmLoop`: where the measurement is taken ────────────────────────────────────

const h = vi.hoisted(() => ({
  writes: [] as Array<Array<{ path: string; content: string }>>,
  ranCommand: null as null | { cmd: string; args: string[] },
  /** How long does the SDK take to write the bundle — the bulk of bootstrapping. */
  bundleWriteMs: 0,
  /**
 * THE CLOCK IS CONTROLLED, IT DOES NOT TURN. These tests measure a duration: the
 * first version made `writeFiles` sleep for 120 ms and waited for
 * `bootstrapMs >= 120`. `setTimeout(n)` returns control to `n - 1` ms clock
 * wall about three times out of a thousand at rest, much more often under the
 * 2,800 tests in the sequence — the test therefore failed at random, and the harness
 * served this failure to the agent as a regression of its own change
 * (run f80dca09, MIN-249: a round trip of model burned on a green test).
 * A clock in hand makes the measurement EXACT, so the assertion too.
 */
  nowMs: 1_700_000_000_000,
}));

// The bundle is read BY PATH into `.agent-vm/`, an artifact that only `prebuild`
// product. Without this duplicate, these tests would only pass on a machine that comes
// from builder — and would fail on a freshly cloned repository.
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi.fn(async () => "// bundle de test"),
}));

const sandbox = () =>
  ({
    mkDir: vi.fn(async () => {}),
    writeFiles: vi.fn(async (files: Array<{ path: string; content: string }>) => {
      h.writes.push(files);
      // Writing the bundle does not SLEEP, it ADVANCES the clock: same effect on
      // what `startVmLoop` measures, without depending on the scheduler.
      if (files.some((f) => f.path.endsWith("/main.js"))) h.nowMs += h.bundleWriteMs;
    }),
    runCommand: vi.fn(async (params: { cmd: string; args: string[] }) => {
      h.ranCommand = params;
      return { cmdId: "cmd-42" };
    }),
  }) as never;

const { startVmLoop } = await import("./vm-launch");

/** The job as it LANDED on the microVM disk. */
function writtenJob(): VmJob {
  const file = h.writes.flat().find((f) => f.path === JOB_PATH);
  expect(file, "aucun job écrit dans la microVM").toBeDefined();
  return JSON.parse(file!.content) as VmJob;
}

const jobInput = (): Omit<VmJob, "bootstrapMs"> =>
  ({
    protocolVersion: VM_PROTOCOL_VERSION,
    layout: LAYOUT,
    runId: "run-1",
    workBranch: "minddy/agent/min-42",
    repoMode: "clone",
    committer: { name: "minddy agent", email: "agent@minddy.app" },
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
    // 400 ms of boot time already elapsed when called: wake up the microVM,
    // network policy, clone. That's the bulk of the number, and it's behind us.
    const callStart = Date.now() - 400;
    await startVmLoop(sandbox(), jobInput(), callStart);
    expect(writtenJob().bootstrapMs).toBe(400);
  });

  it("compte l'écriture du bundle — c'est pour elle qu'il y a deux écritures", async () => {
    // The job can only carry the measure AFTER what it consists of. Only one
    // `writeFiles` would require freezing the figure before its 280 KB.
    h.bundleWriteMs = 120;
    await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(writtenJob().bootstrapMs).toBe(120);
  });

  it("écrit le bundle D'ABORD, le job ENSUITE", async () => {
    await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(h.writes.map((w) => w.map((f) => f.path))).toEqual([[BUNDLE_PATH], [JOB_PATH]]);
  });

  it("lance le bundle en détaché et rend l'identifiant de la commande", async () => {
    const cmdId = await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(cmdId).toBe("cmd-42");
    expect(h.ranCommand).toMatchObject({ cmd: "node", args: [BUNDLE_PATH, JOB_PATH] });
  });

  /**
 * THE JOB PATH GOES IN ARGUMENT (MIN-354), and this is the only information
 * that the harness cannot learn from the job: the layout is IN IT. Without this
 * argument, a harness launched outside microVM would seek its job in
 * `/vercel/sandbox/harness`, which does not exist — and would die there, before all the
 * remains. This is the failure measured when the file is opened.
 */
  it("passe au harness le chemin de son job", async () => {
    await startVmLoop(sandbox(), jobInput(), Date.now());
    expect(h.ranCommand).toMatchObject({ args: [BUNDLE_PATH, JOB_PATH] });
  });

  /**
 * AND EVERYTHING FOLLOWS THE LAYOUT OF THE JOB, without exception: a layout elsewhere moves
 * the three writes AND the launch. A single path left hard would make
 * write the bundle in one place and look for it in another.
 */
  it("écrit et lance là où le job le dit, quelle que soit la racine", async () => {
    const root = "/Users/dev/Library/Application Support/minddy/runs/r-9";
    const layout = layoutForRoot(root, "/Users/dev/oc");
    const job = { ...jobInput(), layout } as Omit<VmJob, "bootstrapMs">;
    await startVmLoop(sandbox(), job, Date.now());
    expect(h.writes.flat().map((f) => f.path)).toEqual([
      `${root}/harness/main.js`,
      `${root}/harness/job.json`,
    ]);
    expect(h.ranCommand).toMatchObject({
      args: [`${root}/harness/main.js`, `${root}/harness/job.json`],
      cwd: `${root}/harness`,
    });
  });

  /**
 * AND AN UNUSABLE LAYOUT FAILS THE BOOT HERE, not in the VM.
 *
 * The harness would also refuse it (`parseVmJob`), but only after the
 * waking up the microVM and the repository clone: a round launched for nothing, of which the
 * cause only appears after a minute. `repoDir` is also the root of
 * security of writing safeguards — it is checked where it is written.
 */
  it("refuse d'écrire un job dont le layout ne tient pas", async () => {
    const layout = { ...LAYOUT, repoDir: "repo" };
    const job = { ...jobInput(), layout } as Omit<VmJob, "bootstrapMs">;
    await expect(startVmLoop(sandbox(), job, Date.now())).rejects.toThrow(/absolute/i);
    expect(h.writes).toEqual([]);
    expect(h.ranCommand).toBeNull();
  });
});

// ── guarding the `finally` of execute.ts ───────────────────────────────────────

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");
const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

/**
 * The condition that decides whether the FUNCTION charges the microVM for this passage.
 *
 * It moved without changing direction: the footage now lives in
 * `billSandboxCompute`, called by quiesces (so that `cost_usd` can
 * reread a complete ledger) and by the `finally` in net. The guard there is a
 * early exit rather than a `if` around the call — what we check is the
 * CONDITION, not its form.
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
    // The difference between the two lies in the whole defect: a priming which RISES
    // is indeed a `loop_in_vm` run, but no loop will ever account for it.
    // The watchdog doesn't catch him either — he only sweeps the runs
    // `running`, and this has just been put to rest by the `catch`.
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
    // If the stamp fails, the round leaves without its id being in base: its report
    // will be refused in 409 and the watchdog will have nothing to query. Person
    // will not charge for this microVM if it is not the function.
    expect(launched, "`vmLoopLaunched` doit être posé après le stamp, pas avant").toBeGreaterThan(
      stamp,
    );
  });
});
