import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Un test structurel a besoin d'un TypeScript en JS pour lire un arbre.
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-215 — la dépense d'un run se lit AU LEDGER, pas à une colonne que seuls les
 * chemins de sortie sains écrivent.
 *
 * Ce que ça coûtait. Passage de routine plafonné à 0,75 $. Chunk 1 dépense 0,35 $
 * et se met au repos proprement. Chunk 2 dépense 0,40 $ puis lève sur
 * `commitAndPush` : le catch stampe l'erreur, jamais le coût. Chunk 3 recalcule
 * `0,75 − 0,35 = 0,40 $` de restant — un restant qui n'existe plus — et repart.
 * Le passage finit au-dessus de son plafond, `recomputeChainSpend` sous-compte la
 * chaîne, et « Exécutions précédentes » affiche moins que ce qui a été payé. Une
 * invocation tuée à la limite de durée fait pareil, sans même passer par le catch.
 *
 * Deux moitiés, donc deux tests. La fonction se vérifie pour de vrai (double du
 * service client) ; ses deux points de consommation, eux, sont dans un
 * `executeAgentRun` qui ne s'atteint qu'avec une microVM, une base et un modèle —
 * mais l'invariant y est lexical (d'où quelle expression le plafond descend, et
 * quelles clés portent les stamps du catch), et ça se lit dans l'arbre. Le
 * compilateur, lui, ne dira jamais rien : `cost_usd` est optionnel sur `stampRun`,
 * et un plafond dérivé de la mauvaise variable type parfaitement.
 */

// ── la fonction ──────────────────────────────────────────────────────────────

/** Ce que la RPC rend au prochain appel : une valeur, une erreur, ou une levée. */
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
    // La somme se fait EN BASE : une lecture de lignes serait plafonnée par
    // PostgREST et rendrait, sur un run bavard, un total silencieusement bas.
    expect(rpcCalls).toEqual([{ fn: "get_ai_run_spend", args: { p_run_id: "run-1" } }]);
  });

  it("accepte le numeric rendu en chaîne", async () => {
    // Postgres sérialise `numeric` en chaîne selon le chemin : un `Number()` bien
    // placé vaut mieux qu'un `NaN` qui se propagerait dans le plafond.
    rpcResult = () => ({ data: "0.4", error: null });

    await expect(spentFromLedger("run-1")).resolves.toBeCloseTo(0.4, 6);
  });

  it("rend null — jamais 0 — quand la lecture échoue", async () => {
    // Le fond du ticket : un 0 se confondrait avec « ce run n'a rien dépensé » et
    // rechargerait le plafond entier, soit exactement le défaut qu'on corrige.
    rpcResult = () => ({ data: null, error: { message: "boom" } });
    await expect(spentFromLedger("run-1")).resolves.toBeNull();

    rpcResult = () => {
      throw new Error("réseau coupé");
    };
    await expect(spentFromLedger("run-1")).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("rend 0 pour un run qui n'a rien au ledger", async () => {
    // Le pendant du test du dessus : une somme vide est une VRAIE réponse, et
    // elle ne doit pas se déguiser en échec de lecture (le run repartirait avec
    // son plafond entier alors que la réponse est juste).
    rpcResult = () => ({ data: 0, error: null });

    await expect(spentFromLedger("run-1")).resolves.toBe(0);
  });
});

// ── ses deux points de consommation dans execute.ts ──────────────────────────

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");

const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

/** Toutes les `const`/`let` du fichier, par nom — les noms visés sont uniques ici. */
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
 * Les clés que cette expression POSE sur l'objet résultant — en suivant les
 * spreads jusqu'à leur déclaration, et les deux branches d'un `...(cond ? {…} : {})`.
 * C'est la SHAPE qu'on vérifie, pas le texte : le jour où quelqu'un réorganise ces
 * objets, le test suit tant que les clés arrivent au bon endroit.
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

/** Les identifiants LUS dans un sous-arbre (une clé d'objet n'est pas une lecture). */
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

/** Les objets passés à `stampRun(...)` depuis un bloc `catch`, avec leur statut. */
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

    // Le plafond passe par le montant relu, et par lui seul : c'est ce qui le rend
    // insensible à un chunk mort — catch comme invocation tuée.
    expect(
      [...reads],
      "`runCapRemainingUsd` doit se dériver de `runSpentUsd` (somme du ledger)",
    ).toContain("runSpentUsd");
    expect(
      cap.getText(),
      "`runCapRemainingUsd` ne doit plus lire `run.cost_usd` directement : c'est " +
        "la colonne que seuls les chemins de sortie sains écrivent.",
    ).not.toContain("run.cost_usd");

    // Et ce montant est bien le MAX ledger/colonne : le ledger est best-effort,
    // une insertion ratée y laisserait moins que ce que la colonne porte.
    const spent = initializerOf("runSpentUsd");
    expect([...valueReads(spent)]).toContain("ledgerSpentUsd");
    expect(spent.getText()).toContain("run.cost_usd");
  });

  /**
   * MIN-224 — `agent_runs.cost_usd` doit vouloir dire LA MÊME CHOSE sur les deux
   * moteurs tant qu'ils coexistent.
   *
   * Mesuré sur le même ticket : le moteur en microVM y écrit la somme du ledger,
   * `sandbox_compute` compris (0,074913 $) ; celui-ci n'écrivait que le modèle, et
   * en perdait (0,165908 $ portés pour 0,236836 $ dépensés). La cause tient à
   * l'ORDRE des gestes — le compute était facturé depuis le `finally`, donc APRÈS
   * les stamps, si bien qu'aucune relecture du ledger ne pouvait le voir.
   *
   * Trois lecteurs mélangeraient sinon deux populations : `recomputeChainSpend`,
   * `medianCostByIntent` et le coût exposé par l'API du run.
   */
  it("le repos facture le compute AVANT de relire le ledger", () => {
    /**
     * L'invariant a DÉMÉNAGÉ avec la boucle (MIN-286, 2026-08-14) : ce n'est plus
     * la fonction qui conclut un tour, c'est `landVmTurn`. L'ordre, lui, ne change
     * pas — facturer le compute APRÈS la relecture ne le mettrait jamais dans la
     * colonne, et `cost_usd` afficherait moins que ce que le run a coûté.
     */
    const rest = readFileSync(join(process.cwd(), "lib/server/agent/vm-rest.ts"), "utf8");
    const billAt = rest.indexOf("await recordSandboxUsage({");
    const ledgerAt = rest.indexOf("await spentFromLedger(");
    expect(billAt, "`landVmTurn` doit facturer le compute du tour").toBeGreaterThan(-1);
    expect(ledgerAt, "`landVmTurn` doit relire le ledger").toBeGreaterThan(-1);
    expect(billAt).toBeLessThan(ledgerAt);
    // Et le résultat est le MAX des deux minorants : le ledger est best-effort, la
    // colonne peut porter une ligne qu'il a ratée, et une dépense ne recule pas.
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
    // Deux écritures de compute pour un même chunk partageraient la bande de seq
    // (`SANDBOX_USAGE_SEQ_BASE + continuations`) et se marcheraient dessus.
    const bill = initializerOf("billSandboxCompute").getText();
    expect(bill, "la garde d'idempotence a disparu").toContain("sandboxComputeBilled");
    expect(bill, "un tour parti dans la microVM facture LUI-MÊME son compute").toContain(
      "vmLoopLaunched",
    );
  });

  it("les repos stampés depuis un catch portent le coût, seul `failed` en est dispensé", () => {
    const stamps = stampsInCatchClauses();
    // Deux repos (amorçage avec checkpoint, erreur mi-tour) + l'échec d'un run vierge.
    expect(stamps.length, "les stamps du catch d'execute.ts ont disparu").toBeGreaterThanOrEqual(3);

    for (const stamp of stamps) {
      if (stamp.status === '"failed"') {
        // Run VIERGE : rien n'a jamais tourné sous ce run_id, il n'y a pas de coût
        // à recoller — et son checkpoint part à `null` de toute façon.
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
