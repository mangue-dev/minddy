import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer delivers the API
// compiler. A structural test needs a TypeScript in JS to read a tree.
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-215 — the expense of a run is read IN THE LEDGER, not in a column that only
 * healthy output paths write.
 *
 * What it cost. Routine passage capped at $0.75. Chunk 1 spends $0.35
 * and goes to rest cleanly. Chunk 2 spends $0.40 then throws on
 * `commitAndPush`: the catch stamps the error, never the cost. Chunk 3 recalculates
 * `0,75 − 0,35 = 0,40 $` of remainder — a remainder that no longer exists — and starts again.
 * The passage ends up above its cap, `recomputeChainSpend` undercounts the
 * chain, and "Previous Runs" displays less than what was paid. A
 * summon killed at the time limit does the same, without even going through the catch.
 *
 * Two halves, therefore two tests. The function is verified for real (double du
 * customer service); its two consumption points are in a
 * `executeAgentRun` which can only be reached with a microVM, a base and a model —
 * but the invariant there is lexical (hence what expression does the ceiling go down, and
 * which keys carry the catch stamps), and that can be read in the tree. The
 * compiler will never say anything: `cost_usd` is optional on `stampRun`,
 * and a ceiling derived from the wrong variable type perfectly.
 */

// ── the function ─────────────────────────────── ───────────────────────────────

/** What the RPC returns on the next call: a value, an error, or a throw. */
let rpcResult: () => { data: unknown; error: { message: string } | null };
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcResult();
    },
  }),
}));

import { spentFromLedger } from "@/lib/server/ai-usage";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rpcCalls = [];
  rpcResult = () => ({ data: 0, error: null });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("spentFromLedger", () => {
  it("rend la somme du ledger pour ce run", async () => {
    rpcResult = () => ({ data: 0.7512, error: null });

    await expect(spentFromLedger("run-1")).resolves.toBeCloseTo(0.7512, 6);
    // The sum is done IN BASE: a reading of lines would be capped by
    // PostgREST and would, on a chatty run, return a silently low total.
    expect(rpcCalls).toEqual([{ fn: "get_ai_run_spend", args: { p_run_id: "run-1" } }]);
  });

  it("accepte le numeric rendu en chaîne", async () => {
    // Postgres serializes `numeric` to a string depending on the path: a good `Number()`
    // placed is better than a `NaN` which would propagate in the ceiling.
    rpcResult = () => ({ data: "0.4", error: null });

    await expect(spentFromLedger("run-1")).resolves.toBeCloseTo(0.4, 6);
  });

  it("rend null — jamais 0 — quand la lecture échoue", async () => {
    // The bottom of the ticket: a 0 would be confused with “this run spent nothing” and
    // would reload the entire ceiling, which is exactly the fault we are correcting.
    rpcResult = () => ({ data: null, error: { message: "boom" } });
    await expect(spentFromLedger("run-1")).resolves.toBeNull();

    rpcResult = () => {
      throw new Error("réseau coupé");
    };
    await expect(spentFromLedger("run-1")).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("rend 0 pour un run qui n'a rien au ledger", async () => {
    // The counterpart of the test above: an empty sum is a REAL answer, and
    // it must not disguise itself as a reading failure (the run would leave with
    // its entire ceiling while the answer is correct).
    rpcResult = () => ({ data: 0, error: null });

    await expect(spentFromLedger("run-1")).resolves.toBe(0);
  });
});

// ── its two consumption points in execute.ts ──────────────────────────

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");

const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

/** All `const`/`let` in the file, by name — the names referred to are unique here. */
function declarations(): Map<string, ts.VariableDeclaration> {
  const found = new Map<string, ts.VariableDeclaration>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!found.has(node.name.text)) found.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const decls = declarations();

function initializerOf(name: string): ts.Expression {
  const decl = decls.get(name);
  expect(decl, `\`${name}\` introuvable dans execute.ts`).toBeDefined();
  return decl!.initializer!;
}

/**
 * The keys that this expression PLACES on the resulting object — following the
 * spreads to their declaration, and the two branches of a `...(cond ? {…} : {})`.
 * It is the SHAPE that we check, not the text: the day someone rearranges these
 * objects, the test follows as long as the keys arrive in the right place.
 */
function producedKeys(expr: ts.Expression, seen = new Set<string>()): Set<string> {
  const keys = new Set<string>();
  const merge = (other: Set<string>) => {
    for (const k of other) keys.add(k);
  };

  if (ts.isParenthesizedExpression(expr)) return producedKeys(expr.expression, seen);
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return producedKeys(expr.expression, seen);
  }
  if (ts.isConditionalExpression(expr)) {
    merge(producedKeys(expr.whenTrue, seen));
    merge(producedKeys(expr.whenFalse, seen));
    return keys;
  }
  if (ts.isIdentifier(expr)) {
    if (seen.has(expr.text)) return keys;
    seen.add(expr.text);
    const decl = decls.get(expr.text);
    return decl?.initializer ? producedKeys(decl.initializer, seen) : keys;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const prop of expr.properties) {
      if (ts.isSpreadAssignment(prop)) {
        merge(producedKeys(prop.expression, seen));
      } else if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
        keys.add(prop.name.text);
      }
    }
  }
  return keys;
}

/** The LUS identifiers in a subtree (an object key is not a read). */
function valueReads(root: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isMember = ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
      if (!isMember && !isKey) names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** Objects passed to `stampRun(...)` from a `catch` block, with their status. */
function stampsInCatchClauses(): Array<{ status: string; keys: Set<string> }> {
  const stamps: Array<{ status: string; keys: Set<string> }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isCatchClause(node)) {
      const inner = (n: ts.Node) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "stampRun" &&
          n.arguments.length > 1 &&
          ts.isObjectLiteralExpression(n.arguments[1])
        ) {
          const literal = n.arguments[1] as ts.ObjectLiteralExpression;
          const status = literal.properties.find(
            (p) => p.name && ts.isIdentifier(p.name) && p.name.text === "status",
          );
          stamps.push({
            status:
              status && ts.isPropertyAssignment(status) ? status.initializer.getText() : "",
            keys: producedKeys(literal),
          });
        }
        ts.forEachChild(n, inner);
      };
      ts.forEachChild(node, inner);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return stamps;
}

describe("plafond de run et stamps d'erreur (execute.ts)", () => {
  it("le plafond du run descend de la somme du ledger, plus de la seule colonne", () => {
    const cap = initializerOf("runCapRemainingUsd");
    const reads = valueReads(cap);

    // The ceiling passes through the amount read, and through it alone: ​​this is what makes it
    // insensitive to a dead chunk — catch as killed summon.
    expect(
      [...reads],
      "`runCapRemainingUsd` doit se dériver de `runSpentUsd` (somme du ledger)",
    ).toContain("runSpentUsd");
    expect(
      cap.getText(),
      "`runCapRemainingUsd` ne doit plus lire `run.cost_usd` directement : c'est " +
        "la colonne que seuls les chemins de sortie sains écrivent.",
    ).not.toContain("run.cost_usd");

    // And this amount is indeed the MAX ledger/column: the ledger is best-effort,
    // a failed insertion would leave less than the column carries.
    const spent = initializerOf("runSpentUsd");
    expect([...valueReads(spent)]).toContain("ledgerSpentUsd");
    expect(spent.getText()).toContain("run.cost_usd");
  });

  /**
 * MIN-224 — `agent_runs.cost_usd` must mean THE SAME THING on both
 * engines as long as they coexist.
 *
 * Measured on the same ticket: the microVM engine writes the sum of the ledger there,
 * `sandbox_compute` included ($0.074913); this one only wrote the model, and
 * lost some ($0.165908 worn for $0.236836 spent). The cause is
 * the ORDER of the gestures — the compute was billed from `finally`, therefore AFTER
 * the stamps, so that no rereading of the ledger could see it.
 *
 * Three readers would otherwise mix two populations: `recomputeChainSpend`,
 * `medianCostByIntent` and the cost exposed by the run API.
 */
  it("le repos facture le compute AVANT de relire le ledger", () => {
    /**
 * The invariant MOVED with the loop (MIN-286, 2026-08-14): it is no longer
 * the function which concludes a round, it is `landVmTurn`. The order doesn't change
 * — charging for the compute AFTER the replay would never put it in the
 * column, and `cost_usd` would show less than what the run cost.
 */
    const rest = readFileSync(join(process.cwd(), "lib/server/agent/vm-rest.ts"), "utf8");
    const billAt = rest.indexOf("await recordSandboxUsage({");
    const ledgerAt = rest.indexOf("await spentFromLedger(");
    expect(billAt, "`landVmTurn` doit facturer le compute du tour").toBeGreaterThan(-1);
    expect(ledgerAt, "`landVmTurn` doit relire le ledger").toBeGreaterThan(-1);
    expect(billAt).toBeLessThan(ledgerAt);
    // And the result is the MAX of the two lower bounds: the ledger is best-effort, the
    // column can carry a line that it missed, and an expense does not go backwards.
    expect(rest).toContain("Math.max(run.cost_usd + report.costUsd, ledger ?? 0)");
  });

  it("plus aucun stamp n'écrit le cumul NU — c'est lui qui ignorait le compute", () => {
    const raw: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "cost_usd" &&
        node.initializer.getText().trim() === "newCost"
      ) {
        raw.push(node.getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(
      raw,
      "`cost_usd: newCost` n'écrit que le modèle, et repart d'une colonne qu'un " +
        "chunk mort n'a pas écrite. Passer par `restCostUsd()`.",
    ).toEqual([]);
  });

  it("le `finally` n'est plus qu'un FILET — la facturation est idempotente", () => {
    // Two compute writes for the same chunk would share the seq band
    // (`SANDBOX_USAGE_SEQ_BASE + continuations`) and would step on each other.
    const bill = initializerOf("billSandboxCompute").getText();
    expect(bill, "la garde d'idempotence a disparu").toContain("sandboxComputeBilled");
    expect(bill, "un tour parti dans la microVM facture LUI-MÊME son compute").toContain(
      "vmLoopLaunched",
    );
  });

  it("les repos stampés depuis un catch portent le coût, seul `failed` en est dispensé", () => {
    const stamps = stampsInCatchClauses();
    // Two rests (start with checkpoint, mid-turn error) + failure of a blank run.
    expect(stamps.length, "les stamps du catch d'execute.ts ont disparu").toBeGreaterThanOrEqual(3);

    for (const stamp of stamps) {
      if (stamp.status === '"failed"') {
        // Run BLANK: nothing has ever run under this run_id, there is no cost
        // to stick again — and its checkpoint goes to `null` anyway.
        continue;
      }
      expect(
        [...stamp.keys],
        `un repos stampé depuis un catch (status ${stamp.status}) doit porter \`cost_usd\` : ` +
          "sans lui, la dépense du chunk mort n'est écrite nulle part et le plafond se recharge.",
      ).toContain("cost_usd");
    }
  });
});
