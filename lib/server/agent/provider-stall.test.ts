import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { MAX_PROVIDER_REQUEUES, MAX_STREAM_ATTEMPTS, planProviderStall } from "./retry";

/**
 * MIN-219 — une panne du fournisseur n'est pas une continuation.
 *
 * Ce que ça coûtait. Les reprises INTERNES d'un appel modèle tiennent 4 essais et
 * ≤ 3,5 s d'attente cumulée ; passé ça, la boucle suspendait le chunk — d'un
 * `suspended` en tout point semblable à celui de la soft-deadline. L'exécuteur le
 * re-queuait donc `not_before` = maintenant, `continuations + 1`, `attempts: 0`,
 * et le drain, qui reclaim DANS LE MÊME PROCESS, renvoyait aussitôt le chunk dans
 * la panne. Un chunk mort sur son premier appel coûte quelques secondes : les 20
 * continuations du tour partaient en une ou deux fenêtres de drain. Puis le tour
 * s'arrêtait sur « Ce tour a atteint sa limite de durée » — le seul message que ce
 * plafond savait dire, alors qu'aucune horloge n'avait sonné et que la vraie cause
 * était une panne de quelques minutes.
 *
 * Trois choses à tenir, donc, et elles se testent à trois endroits différents :
 * la boucle NOMME la panne, la politique BORNE l'attente en la faisant croître, et
 * l'exécuteur ne compte pas une attente comme un chunk de travail.
 */

describe("la boucle nomme la panne du fournisseur", () => {
  interface Choice {
    delta?: Record<string, unknown>;
    finish_reason?: string | null;
  }

  function sse(choices: Choice[]): string {
    const chunks: Array<Record<string, unknown>> = choices.map((c) => ({
      id: "gen_1",
      model: "test/model",
      choices: [c],
    }));
    chunks.push({
      id: "gen_1",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost: 0.01 },
    });
    return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  }

  let responses: Array<() => Response>;
  let fetchCalls: number;

  beforeEach(() => {
    responses = [];
    fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls++;
        const next = responses.shift();
        if (!next) throw new Error("fetch non prévu par le test");
        return next();
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseParams = {
    tools: [],
    model: "test/model",
    apiKey: "sk-test",
    baseUrl: "https://example.invalid/v1",
    runId: "run_test",
    billTo: { userId: "user_test" } as const,
    // Le ledger est INJECTÉ depuis MIN-224 : la boucle ne connaît plus le chemin de
    // la base. Ici, un puits — ce test ne mesure pas la dépense.
    recordUsage: async () => {},
    softDeadlineMs: 250_000,
    emit: async () => {},
    execTool: async () => ({ result: {}, success: true }),
  };

  function seed(): AgentChatMessage[] {
    return [
      { role: "system", content: "You are numo." },
      { role: "user", content: "Fix the bug." },
    ];
  }

  // Les vraies attentes de backoff tournent (500 ms + 1 s + 2 s) : c'est le
  // chemin réel qu'on veut, pas une horloge simulée.
  it("suspend AVEC son motif quand les reprises internes sont épuisées", { timeout: 20_000 }, async () => {
    // Le fournisseur répond 502 à chacun des essais internes.
    responses = Array.from(
      { length: MAX_STREAM_ATTEMPTS },
      () => () => new Response("upstream is down", { status: 502 }),
    );

    const result = await runAgentLoop({ ...baseParams, messages: seed() });

    expect(fetchCalls).toBe(MAX_STREAM_ATTEMPTS);
    expect(result.status).toBe("suspended");
    // Le motif : c'est LUI qui sépare cette sortie de celle de la soft-deadline,
    // et donc une attente d'une continuation.
    expect(result.suspendReason).toBe("transient_error");
    // Et ce que le fournisseur a dit, pour que le repos final puisse le citer au
    // lieu d'inventer une limite de durée.
    expect(result.errorMessage).toContain("502");
    // Aucun round n'a abouti : le chunk n'a rien fait avancer.
    expect(result.messages).toEqual(seed());
  });

  it("ne pose PAS de motif sur une suspension ordinaire (plafond de rounds)", async () => {
    responses = [() => new Response(sse([{ delta: { content: "Done." }, finish_reason: "stop" }]))];

    const result = await runAgentLoop({ ...baseParams, messages: seed(), maxRounds: 1 });

    // Un tour qui parle et conclut : rien à attendre, rien à nommer.
    expect(result.status).toBe("completed");
    expect(result.suspendReason).toBeUndefined();
  });
});

describe("politique d'attente entre chunks", () => {
  it("diffère TOUJOURS, et de plus en plus longtemps", () => {
    const delays: number[] = [];
    for (let previous = 0; previous < MAX_PROVIDER_REQUEUES; previous++) {
      const plan = planProviderStall(previous);
      expect(plan.requeue).toBe(true);
      if (!plan.requeue) throw new Error("unreachable");
      // Le compteur avance d'un cran à chaque panne — c'est lui qui va dans le
      // checkpoint re-queué, et qui borne la série.
      expect(plan.retries).toBe(previous + 1);
      // Zéro était le défaut : un `not_before` au présent renvoie le chunk dans la
      // panne à la seconde près, puisque le drain reclaim dans le même process.
      expect(plan.delayMs).toBeGreaterThan(0);
      delays.push(plan.delayMs);
    }
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("abandonne au-delà du budget, plutôt que d'attendre indéfiniment", () => {
    const plan = planProviderStall(MAX_PROVIDER_REQUEUES);
    expect(plan.requeue).toBe(false);
    // Le repos est un meilleur service qu'une attente sans fin : le checkpoint est
    // gardé, un message suffit à repartir.
    expect(plan.retries).toBe(MAX_PROVIDER_REQUEUES + 1);
  });

  it("ne rend jamais un délai indéfini sur un compteur aberrant", () => {
    // Le compteur vient de la base : une ligne bricolée à la main ne doit pas
    // pouvoir produire un `not_before` dans le passé.
    for (const previous of [-5, Number.NaN, 0.5]) {
      const plan = planProviderStall(previous);
      expect(plan.requeue).toBe(true);
      if (!plan.requeue) throw new Error("unreachable");
      expect(plan.delayMs).toBeGreaterThan(0);
      expect(Number.isFinite(plan.delayMs)).toBe(true);
    }
  });

  it("borne la patience totale sous le garde-fou d'horloge du tour", () => {
    // `MAX_WALL_CLOCK_MS` vaut 60 min dans `execute.ts` : l'attente cumulée doit
    // rester DEVANT lui, sinon c'est l'horloge qui trancherait — et elle dirait
    // « limite de durée », exactement le mensonge qu'on ferme.
    let total = 0;
    for (let previous = 0; previous < MAX_PROVIDER_REQUEUES; previous++) {
      const plan = planProviderStall(previous);
      if (plan.requeue) total += plan.delayMs;
    }
    expect(total).toBeLessThan(30 * 60_000);
  });
});

/**
 * L'exécuteur, lui, ne s'atteint qu'avec une microVM, une base et un modèle : ce
 * qui suit tient l'invariant LEXICALEMENT, comme `checkpoint-turn-state.test.ts`.
 * Le compilateur ne dit rien ici — `run.continuations + 1` type aussi bien que
 * `run.continuations + (providerStalled ? 0 : 1)`.
 */
describe("l'exécuteur ne compte pas une attente comme un chunk de travail", () => {
  // Aplati : ce qu'on tient est la FORME de la décision, pas l'indentation du jour.
  const source = readFileSync(join(process.cwd(), "lib/server/agent/execute.ts"), "utf8").replace(
    /\s+/g,
    " ",
  );

  it("n'avance `continuations` que sur un chunk qui a travaillé", () => {
    expect(source).toContain("run.continuations + (providerStalled ? 0 : 1)");
    // Et pas de `run.continuations + 1` résiduel : c'était la ligne du défaut.
    expect(source).not.toContain("continuations = run.continuations + 1");
  });

  it("re-queue l'attente sur un `not_before` FUTUR", () => {
    // La branche d'attente calcule sa date depuis le délai de la politique, là où
    // la continuation ordinaire réutilise `nowIso`.
    expect(source).toContain("planProviderStall(run.checkpoint?.providerRetries ?? 0)");
    expect(source).toContain("not_before: new Date(Date.now() + delayMs).toISOString()");
    // Le compteur repart au chunk suivant : sans lui dans le checkpoint, l'attente
    // ne serait bornée par rien.
    expect(source).toContain("providerRetries: stall.retries");
  });

  it("dit la panne au lieu de la limite de durée", () => {
    expect(source).toContain('providerGaveUp ? "providerUnavailable"');
  });
});
