import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoHost, ShellResult } from "../repo-host";
import type { ExecuteAgentTool } from "../agent-loop";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

/**
 * MIN-224 — ce que la boucle garde EN PROPRE quand elle descend dans la microVM.
 *
 * Le plan de contrôle rejoue les tools de plateforme, mais il ne compte rien et ne
 * sait rien du tour : il facture ce qu'on lui demande et ouvre la pull request
 * qu'on lui décrit. Deux choses vivent donc dans la boucle, et elles disparaîtraient
 * sans un mot si personne ne les gardait —
 *
 *  1. **le plafond de recherches web**. La fonction le tenait dans un compteur de
 *     closure ; la VM doit tenir le même, sinon un modèle qui cherche en rond
 *     dépense 0,005 $ par appel sans borne, et rien dans le fil ne le dit ;
 *  2. **la branche de travail de `create_pr`**. `agent_runs.branch_name` n'existe
 *     qu'après un premier push RÉEL (MIN-123) — or ce push-là, c'est justement
 *     celui que `create_pr` vient de faire. Si la VM ne la remonte pas, la fonction
 *     ouvre la pull request sur une tête vide.
 *
 * `runAgentLoop` est moqué : on lui prend son `execTool` et on appelle les tools
 * comme le modèle le ferait. Tout le reste — routage des tools, compteurs, appels
 * au plan de contrôle — est le vrai chemin.
 */

const h = vi.hoisted(() => ({
  /** Ce que la boucle a demandé au plan de contrôle. */
  toolCalls: [] as Array<{ name: string; body: Record<string, unknown> }>,
  /** L'`execTool` du parent, capturé au passage de `runAgentLoop`. */
  execTool: null as ExecuteAgentTool | null,
}));

vi.mock("../agent-loop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agent-loop")>()),
  runAgentLoop: vi.fn(async (params: { execTool: ExecuteAgentTool; messages: unknown[] }) => {
    h.execTool = params.execTool;
    return {
      status: "completed" as const,
      messages: params.messages,
      reply: "fait",
      costUsd: 0,
      usageSeqEnd: 1,
      rounds: 1,
    };
  }),
}));

const { runVmTurn } = await import("./turn");

/** Un shell qui répond 0 à tout : `commitAndPush` y voit un arbre propre. */
const host = (): RepoHost => ({
  exec: vi.fn(async (): Promise<ShellResult> => ({ exitCode: 0, stdout: "", stderr: "" })),
  readFile: vi.fn(async () => null),
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
});

const cp = (): ControlPlaneClient => ({
  emit: vi.fn(async () => {}),
  emitLive: vi.fn(),
  recordUsage: vi.fn(async () => {}),
  saveCheckpointQuietly: vi.fn(async () => true),
  pullSteering: vi.fn(async () => []),
  hasPendingMessages: vi.fn(async () => false),
  checkInterrupt: vi.fn(async () => false),
  syncPlan: vi.fn(async () => {}),
  callTool: vi.fn(async (name: string, body: Record<string, unknown>) => {
    h.toolCalls.push({ name, body });
    return { result: { ok: true }, success: true };
  }),
  repoAuthUrl: vi.fn(async () => null),
  reportTurn: vi.fn(async () => {}),
});

const WORK_BRANCH = "minddy/agent/min-42-abcd1234";

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    model: "deepseek/deepseek-v4-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder",
    reasoningLevel: "medium",
    contextWindow: null,
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: false,
    webSearch: true,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    messages: [{ role: "user", content: "salut" }],
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    parkedForSubagents: false,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: WORK_BRANCH,
    authUrl: "https://x-access-token:tok@github.com/org/repo.git",
    commitRef: "MIN-42",
    filesFromSha: "",
    locale: "fr",
    feature: "agent_code",
    checkpointMaxBytes: 3_200_000,
    ...over,
  };
}

/** Joue le tour et rend l'`execTool` que la boucle a reçu. */
async function toolsOf(over: Partial<VmJob> = {}): Promise<ExecuteAgentTool> {
  await runVmTurn(job(over), cp(), host());
  if (!h.execTool) throw new Error("runAgentLoop n'a pas été appelé");
  return h.execTool;
}

beforeEach(() => {
  h.toolCalls.length = 0;
  h.execTool = null;
});

describe("le plafond de recherches web voyage avec la boucle", () => {
  it("laisse passer le quota du tour, puis REFUSE — sans appeler le plan de contrôle", async () => {
    const exec = await toolsOf();
    for (let i = 0; i < 5; i++) {
      const out = await exec("web_search", { query: `q${i}` }, `call-${i}`);
      expect(out.success, `recherche ${i}`).toBe(true);
    }
    const refused = await exec("web_search", { query: "q5" }, "call-5");
    expect(refused.success).toBe(false);
    expect(String((refused.result as { error: string }).error)).toContain("Web search limit reached");
    // Le refus est LOCAL : la sixième ne doit pas être facturée pour être refusée.
    expect(h.toolCalls.filter((c) => c.name === "web_search")).toHaveLength(5);
  });

  it("numérote ses recherches — deux lignes de ledger, pas deux fois la même", async () => {
    const exec = await toolsOf();
    await exec("web_search", { query: "a" }, "c1");
    await exec("web_search", { query: "b" }, "c2");
    expect(h.toolCalls.map((c) => (c.body.args as { seq: number }).seq)).toEqual([0, 1]);
  });
});

describe("`create_pr` remonte la branche qu'il vient de pousser", () => {
  it("l'envoie au plan de contrôle — la ligne du run ne la porte pas encore", async () => {
    const exec = await toolsOf();
    await exec("create_pr", { title: "Ajoute le truc" }, "call-pr");
    const call = h.toolCalls.find((c) => c.name === "create_pr");
    expect(call).toBeDefined();
    expect(call?.body.workBranch).toBe(WORK_BRANCH);
    // Et le résultat du push, dont la fonction a besoin pour décider s'il y a
    // matière à ouvrir quoi que ce soit.
    expect(call?.body.pushed).toMatchObject({ pushed: expect.any(Boolean) });
  });
});
