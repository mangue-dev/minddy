import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoHost, ShellResult } from "../repo-host";
import type { AgentUsageLine, ExecuteAgentTool } from "../agent-loop";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

/** Ce que la boucle moquée reçoit, et dont ces tests se servent. */
interface LoopParams {
  execTool: ExecuteAgentTool;
  messages: unknown[];
  usageSeqStart: number;
  recordUsage: (line: AgentUsageLine) => Promise<void>;
  pullSteering?: () => Promise<string[]>;
  refreshBudgetUsd?: () => Promise<number | null>;
  emitLive: (progress: {
    text: string;
    tools: number;
    reasoningActive: boolean;
    reasoningMs: number;
  }) => void;
}

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
  /** Comment le tour se termine. Le défaut est la fin naturelle. */
  status: "completed" as "completed" | "interrupted" | "error" | "suspended",
  /** La cause d'un `suspended`, telle que la boucle la nomme (MIN-219). */
  suspendReason: undefined as undefined | "transient_error",
  /** Ce que la boucle a retenu de la panne — le message du fournisseur. */
  errorMessage: undefined as undefined | string,
  /**
   * Ce que la boucle moquée FAIT avant de rendre — pour exercer les crochets que
   * le vrai moteur appelle au fil des rounds (`recordUsage`, `pullSteering`).
   */
  duringLoop: null as null | ((params: LoopParams) => Promise<void>),
}));

vi.mock("../agent-loop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agent-loop")>()),
  runAgentLoop: vi.fn(async (params: LoopParams) => {
    h.execTool = params.execTool;
    await h.duringLoop?.(params);
    return {
      status: h.status,
      ...(h.suspendReason ? { suspendReason: h.suspendReason } : {}),
      ...(h.errorMessage ? { errorMessage: h.errorMessage } : {}),
      messages: params.messages,
      reply: "fait",
      costUsd: 0,
      usageSeqEnd: params.usageSeqStart + 1,
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

const BASE_SHA = "1111111111111111111111111111111111111111";
const HEAD_SHA = "2222222222222222222222222222222222222222";

/**
 * Un dépôt qui a VRAIMENT du travail à pousser : arbre sale, un commit, une tête
 * qui avance, et un diff d'un fichier. C'est le seul décor où l'event
 * `files_changed` peut naître — le host « tout à zéro » rend un sha vide, donc
 * aucun diff, et ne prouverait rien.
 */
const pushingHost = (): RepoHost => ({
  exec: vi.fn(async (command: string): Promise<ShellResult> => {
    const out = (stdout: string): ShellResult => ({ exitCode: 0, stdout, stderr: "" });
    if (command.startsWith("git status --porcelain")) return out(" M lib/a.ts\n");
    if (command.startsWith("git rev-parse HEAD")) return out(`${HEAD_SHA}\n`);
    if (command.includes("--name-status")) return out("M\tlib/a.ts\n");
    if (command.includes("--numstat")) return out("3\t1\tlib/a.ts\n");
    return out("");
  }),
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
  pushSteering: vi.fn(async () => {}),
  hasPendingMessages: vi.fn(async () => false),
  checkInterrupt: vi.fn(async () => false),
  clearInterrupt: vi.fn(async () => {}),
  budgetRemaining: vi.fn(async () => 4.2),
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
    engine: "loop",
    model: "deepseek/deepseek-v4-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder",
    reasoningLevel: "medium",
    contextWindow: null,
    inputUsdPerMTok: null,
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
    bootstrapMs: 0,
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
  h.status = "completed";
  h.suspendReason = undefined;
  h.errorMessage = undefined;
  h.duringLoop = null;
});

describe("le plafond de dépense se relit pendant le tour", () => {
  /**
   * Un tour de microVM dure des heures et son plafond était figé à son lancement.
   * Or rien ne réserve de budget : deux runs lancés à la même seconde lisent le
   * même restant et le prennent chacun pour plafond. La relecture est ce qui borne
   * la casse — et le throttle ce qui la rend abordable, la lecture coûtant deux
   * requêtes là où un round peut durer trois secondes.
   */
  async function refreshesDuring(
    hits: number[],
  ): Promise<{ reads: number; values: Array<number | null> }> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-08T12:00:00Z"));
    const client = cp();
    const values: Array<number | null> = [];
    h.duringLoop = async (params) => {
      for (const afterMs of hits) {
        vi.setSystemTime(new Date(Date.parse("2026-08-08T12:00:00Z") + afterMs));
        values.push((await params.refreshBudgetUsd?.()) ?? null);
      }
    };
    try {
      await runVmTurn(job(), client, host());
    } finally {
      vi.useRealTimers();
    }
    return { reads: vi.mocked(client.budgetRemaining).mock.calls.length, values };
  }

  it("ne relit pas à chaque round — une minute, pas trois secondes", async () => {
    // Trois passages en dix secondes : la cadence n'est pas franchie, personne
    // n'appelle le plan de contrôle et la boucle garde son plafond (`null`).
    const { reads, values } = await refreshesDuring([2_000, 5_000, 10_000]);
    expect(reads).toBe(0);
    expect(values).toEqual([null, null, null]);
  });

  it("relit une fois la cadence franchie, et rend ce que le compte a encore", async () => {
    const { reads, values } = await refreshesDuring([2_000, 61_000, 65_000, 130_000]);
    // Deux lectures : à 61 s et à 130 s. Celle de 65 s retombe dans la fenêtre.
    expect(reads).toBe(2);
    expect(values).toEqual([null, 4.2, null, 4.2]);
  });
});

describe("un tour `suspended` remonte sa CAUSE, pas une phrase fixe", () => {
  it("nomme la panne de fournisseur — sans elle, MIN-219 est perdu sur ce chemin", async () => {
    // `runAgentLoop` rend `suspended` + `suspendReason: "transient_error"` quand
    // le fournisseur a épuisé ses reprises. Écrasé en « ce tour a atteint sa
    // limite », le tour mourait en annonçant une durée qu'aucune horloge n'avait
    // atteinte — et la fonction n'avait plus de quoi décider d'un re-queue.
    h.status = "suspended";
    h.suspendReason = "transient_error";
    h.errorMessage = "429 Too Many Requests";
    const report = await runVmTurn(job(), cp(), host());
    expect(report.status).toBe("error");
    expect(report.errorCode).toBe("providerUnavailable");
    // Le message du fournisseur SURVIT : c'est la seule trace qui dise laquelle
    // des pannes (429, 502, réseau) a arrêté le tour.
    expect(report.errorMessage).toBe("429 Too Many Requests");
  });

  it("nomme le plafond du tour quand aucune panne n'est en cause", async () => {
    h.status = "suspended";
    const report = await runVmTurn(job(), cp(), host());
    expect(report.status).toBe("error");
    expect(report.errorCode).toBe("turnTooLong");
    // Rien à raconter de plus : la phrase que l'utilisateur lit vient du code.
    expect(report.errorMessage).toBeUndefined();
  });

  it("laisse une erreur ORDINAIRE sans code — elle est déjà racontée au fil", async () => {
    h.status = "error";
    h.errorMessage = "402 Payment Required";
    const report = await runVmTurn(job(), cp(), host());
    expect(report.status).toBe("error");
    expect(report.errorCode).toBeUndefined();
    expect(report.errorMessage).toBe("402 Payment Required");
  });
});

/**
 * MIN-248 bis — le fil voit les fichiers PENDANT le tour, sur ce moteur aussi.
 *
 * Le crochet n'existait que côté fonction : sur un projet basculé en `loop_in_vm`
 * — c'est-à-dire sur celui où on regardait — la liste provisoire n'était jamais
 * envoyée, et le plan de contrôle lisait un champ `files` que personne ne
 * remplissait. Rien ne le disait : les deux moteurs type-checkaient, et le test
 * du crochet exerçait l'exec-tool sans jamais passer par un moteur.
 */
describe("les fichiers du tour en cours partent au fil (microVM)", () => {
  /** Les charges de direct reçues par le plan de contrôle, dans l'ordre. */
  async function liveOf(
    during: (params: LoopParams) => Promise<void>,
  ): Promise<Array<Record<string, unknown>>> {
    const client = cp();
    h.duringLoop = during;
    await runVmTurn(job(), client, host());
    return vi.mocked(client.emitLive).mock.calls.map(([p]) => p as unknown as Record<string, unknown>);
  }

  it("annonce une édition dès qu'elle a réussi, sur une charge de round au repos", async () => {
    const charges = await liveOf(async (params) => {
      await params.execTool("write_file", { path: "lib/a.ts", content: "const a = 1;\n" }, "c1");
    });
    expect(charges).toEqual([
      {
        text: "",
        tools: 0,
        reasoningActive: false,
        reasoningMs: 0,
        files: [{ path: "lib/a.ts", status: "modified" }],
        filesTruncated: false,
      },
    ]);
  });

  it("reporte la liste sur les charges SUIVANTES — une charge tait, le fil efface", async () => {
    const charges = await liveOf(async (params) => {
      await params.execTool("write_file", { path: "lib/a.ts", content: "const a = 1;\n" }, "c1");
      params.emitLive({ text: "je continue", tools: 1, reasoningActive: false, reasoningMs: 0 });
    });
    expect(charges).toHaveLength(2);
    expect(charges[1]).toMatchObject({
      text: "je continue",
      tools: 1,
      files: [{ path: "lib/a.ts", status: "modified" }],
    });
  });

  it("compte AUSSI les éditions d'une fille : la sandbox est partagée", async () => {
    // Une délégation d'une demi-heure ne montrait rien au fil, alors que c'est là
    // qu'on regarde le plus. Le `files_changed` de fin de tour, lui, ne distingue
    // pas non plus la main qui a écrit : c'est le même dépôt.
    const client = cp();
    let childTool: ExecuteAgentTool | null = null;
    h.duringLoop = async (params) => {
      // La fille tourne sur la MÊME boucle moquée : sans ce garde, son
      // `duringLoop` relancerait une fille, et ainsi de suite.
      if (childTool) return;
      const spawned = await params.execTool(
        "spawn_agent",
        { task: "range la cuisine", mode: "implement", expected_output: "un rapport" },
        "call-spawn",
      );
      expect(spawned.success).toBe(true);
      // `spawn_agent` ne s'attend pas : la fille est lancée en fond, et c'est son
      // passage dans la boucle moquée qui nous rend son exec-tool.
      await vi.waitFor(() => expect(h.execTool).not.toBe(params.execTool));
      childTool = h.execTool;
    };
    await runVmTurn(job(), client, host());
    await childTool!("write_file", { path: "lib/fille.ts", content: "const f = 1;\n" }, "c1");
    const charges = vi
      .mocked(client.emitLive)
      .mock.calls.map(([p]) => p as unknown as Record<string, unknown>);
    expect(charges.at(-1)).toMatchObject({
      files: [{ path: "lib/fille.ts", status: "modified" }],
    });
  });

  it("ne met AUCUNE clé `files` sur une charge d'un tour qui n'a rien touché", async () => {
    // `files: []` se lirait comme un signe de vie : le fil garderait sa queue
    // vivante à l'écran sur un round au repos.
    const charges = await liveOf(async (params) => {
      params.emitLive({ text: "je réfléchis", tools: 0, reasoningActive: true, reasoningMs: 120 });
    });
    expect(charges).toEqual([
      { text: "je réfléchis", tools: 0, reasoningActive: true, reasoningMs: 120 },
    ]);
  });
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

describe("la sauvegarde périodique porte le compteur de seq COURANT", () => {
  /** Une ligne de ledger minimale, au numéro demandé. */
  const line = (seq: number): AgentUsageLine => ({
    runId: "ledger",
    seq,
    feature: "agent_code",
    billTo: { unattributed: "test" },
  });

  /** Joue un tour dont la boucle dépense, puis franchit la cadence de sauvegarde. */
  async function saveAfter(
    usageSeqStart: number,
    seqs: number[],
  ): Promise<Record<string, unknown> | undefined> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
    const client = cp();
    h.duringLoop = async (params) => {
      for (const seq of seqs) await params.recordUsage(line(seq));
      // Au-delà de `CHECKPOINT_SAVE_INTERVAL_MS` : le prochain sommet de round
      // sauvegarde. C'est `pullSteering` qui le porte, comme dans la vraie boucle.
      vi.setSystemTime(new Date("2026-08-07T12:06:00Z"));
      await params.pullSteering?.();
    };
    try {
      await runVmTurn(job({ usageSeqStart }), client, host());
    } finally {
      vi.useRealTimers();
    }
    return vi.mocked(client.saveCheckpointQuietly).mock.calls[0]?.[0] as unknown as
      | Record<string, unknown>
      | undefined;
  }

  it("reprend là où le tour en est, pas à zéro", async () => {
    // `usageSeq` est la seule valeur du checkpoint que la boucle ne rende qu'à la
    // FIN. Y poser `0` au milieu faisait repartir de zéro le tour qui reprend
    // depuis cette sauvegarde (`usageSeqStart = checkpoint.usageSeq ?? …` : `0`
    // n'est pas nullish, donc c'est `0` qui gagne) — les lignes de ledger du tour
    // repris retombaient sur les numéros du tour mort.
    const saved = await saveAfter(7, [7, 8]);
    expect(saved?.usageSeq).toBe(9);
  });

  it("ne recule JAMAIS sous le point de départ du tour, même sans un seul appel", async () => {
    const saved = await saveAfter(7, []);
    expect(saved?.usageSeq).toBe(7);
  });

  it("ignore la bande des filles — elle vit très au-dessus de celle du parent", async () => {
    // Une fille écrit sous `subagentUsageSeq(slot)`, hors de la bande du parent.
    // Prendre le max des deux propulserait le compteur du parent là-haut, ce qui
    // serait pire que le défaut corrigé : seul le `recordUsage` DU PARENT compte.
    const client = cp();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
    h.duringLoop = async (params) => {
      await params.recordUsage(line(7));
      await client.recordUsage(line(900_000)); // une fille, sur son propre canal
      vi.setSystemTime(new Date("2026-08-07T12:06:00Z"));
      await params.pullSteering?.();
    };
    try {
      await runVmTurn(job({ usageSeqStart: 7 }), client, host());
    } finally {
      vi.useRealTimers();
    }
    const saved = vi.mocked(client.saveCheckpointQuietly).mock.calls[0]?.[0];
    expect(saved?.usageSeq).toBe(8);
  });
});

describe("le wall-clock facturé comprend l'amorçage", () => {
  it("ajoute `bootstrapMs` à son propre chrono — la microVM tournait déjà", async () => {
    // L'horloge de la boucle ne démarre qu'au lancement du process node. Avant
    // lui, la fonction a réveillé la microVM et cloné le dépôt (~22 s à froid) :
    // du compute que la plateforme nous facture et que personne n'imputait.
    const report = await runVmTurn(job({ bootstrapMs: 21_500 }), cp(), host());
    expect(report.sandboxMs).toBeGreaterThanOrEqual(21_500);
  });

  it("ne facture QUE son chrono quand l'amorçage n'a rien coûté", async () => {
    const report = await runVmTurn(job({ bootstrapMs: 0 }), cp(), host());
    expect(report.sandboxMs).toBeLessThan(21_500);
  });
});

describe("le diff du tour ne se raconte qu'à la fin de tour NATURELLE", () => {
  it("le remonte quand le tour se termine — la baseline avance dans le même geste", async () => {
    const report = await runVmTurn(job({ filesFromSha: BASE_SHA }), cp(), pushingHost());
    expect(report.changed?.files.map((f) => f.path)).toEqual(["lib/a.ts"]);
    expect(report.checkpoint?.lastFilesSha).toBe(HEAD_SHA);
  });

  it("le TAIT sur un tour interrompu — le tour qui le termine le dira d'un seul tenant", async () => {
    // `lastFilesSha` est défini comme « le sha au dernier event `files_changed`
    // émis » (runs.ts) et n'avance qu'en `completed`. Émettre l'event sans avancer
    // la baseline cassait le couple : le fil listait les fichiers à
    // l'interruption, puis les relistait au tour suivant.
    h.status = "interrupted";
    const report = await runVmTurn(job({ filesFromSha: BASE_SHA }), cp(), pushingHost());
    expect(report.changed).toBeUndefined();
    expect(report.checkpoint?.lastFilesSha).toBe(BASE_SHA);
    // Le travail est bien poussé pour autant : ce qu'on retient est le RÉCIT, pas
    // le commit.
    expect(report.pushed?.pushed).toBe(true);
  });
});
