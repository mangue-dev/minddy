import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiUsageInput } from "@/lib/server/ai-usage";

/**
 * MIN-223 — le plan de contrôle ne croit RIEN de ce que la microVM raconte
 * d'elle-même.
 *
 * Ce que ces tests gardent tient en une phrase : le `runId` vient de l'OIDC posé
 * par la plateforme, jamais du corps de la requête. Tout le reste — le topic du
 * direct, le payeur au ledger, l'acteur des écritures de tickets — en DÉRIVE.
 * L'oublier une fois, sur une seule surface, et une VM compromise diffuse sur le
 * fil d'un autre run ou impute sa dépense à quelqu'un d'autre. C'est précisément
 * ce qu'une clé Supabase à portée réduite n'aurait pas su empêcher : le topic et
 * le payeur y sont des paramètres.
 *
 * On ne moque que ce qui sort du process (base, realtime, ledger, tools) : le
 * routage des surfaces et les dérivations sont le vrai chemin.
 */

const h = vi.hoisted(() => ({
  recorded: [] as AiUsageInput[],
  streams: [] as Array<{ topic: string; event: string; text: unknown }>,
  /** La charge de direct ENTIÈRE — `streams` n'en garde que le texte. */
  streamPayloads: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ runId: string; type: string }>,
  stamped: [] as Array<Record<string, unknown>>,
  issueCalls: [] as Array<{ ctx: Record<string, unknown>; name: string }>,
  /** Ce qui a été confié à `afterOrNow` — donc au canal qui maintient
   *  l'invocation en vie après la réponse, et jamais détaché. */
  afterWork: [] as Array<() => void | Promise<void>>,
  prIssueId: null as string | null,
  stampReturnsNull: false,
  /** La BASE refuse l'écriture (octet nul, panne) — pas la garde de transition. */
  stampFails: false,
  landed: 0,
  /** Les contextes d'atterrissage passés à l'implémentation partagée. */
  prLandings: [] as Array<{ workBranch: string; baseBranch: string }>,
  run: null as Record<string, unknown> | null,
  /** Combien de fois la ligne du run a été LUE EN BASE. Le direct doit rester à
   *  zéro : c'est le seul appel chaud de la surface (~4/s pendant tout le tour). */
  runReads: 0,
  /** Ce que `checkAgentQuota` répond — `null` = lecture en panne (elle lève). */
  quota: null as Record<string, unknown> | null,
  /** La somme du ledger pour ce run. */
  ledgerSpent: 0 as number | null,
  /** Les runs dont le drapeau d'interruption a été effacé. */
  cleared: [] as string[],
  /** Les messages REMIS en file par la microVM (`POST /messages`). */
  requeued: [] as Array<{
    runId: string;
    userId: string | null;
    content: string;
    mentions: unknown;
  }>,
  /** Les incréments de journal écrits (`POST /journal`). */
  journal: [] as Array<{ runId: string; sessionId: string; events: unknown[] }>,
  /** Un TIERS a-t-il parlé à ce run ? (la question que pose le carnet, MIN-326) */
  steeredByOther: false,
  /** Les appels de tool carnet réellement EXÉCUTÉS. */
  scratchpadCalls: [] as string[],
  /** Le PROFIL de token demandé à `resolveRepoCloneTarget`, appel par appel. */
  repoAccessAsked: [] as string[],
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    h.recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
  spentFromLedger: vi.fn(async () => h.ledgerSpent),
}));

// Le tarif du modèle sort du process (index OpenRouter) : on le fige, sinon le
// plafond calculé dépendrait du catalogue du jour.
vi.mock("./openrouter-index", () => ({
  getOpenRouterModelInfo: vi.fn(async () => ({
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
    cachePricing: null,
  })),
}));

vi.mock("./quota", () => ({
  checkAgentQuota: vi.fn(async () => {
    if (!h.quota) throw new Error("facturation injoignable");
    return h.quota;
  }),
}));

vi.mock("./live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./live")>()),
  broadcastToTopic: vi.fn(
    async (topic: string, event: string, payload: Record<string, unknown>) => {
      h.streams.push({ topic, event, text: payload.text });
      h.streamPayloads.push(payload);
    },
  ),
}));

// `afterOrNow` n'exécute RIEN ici : les tests le déclenchent eux-mêmes. C'est ce
// qui rend visible la différence entre « confié au canal de fond » et « détaché »
// — un `void fetch(…)` posé avant la réponse n'apparaîtrait jamais dans cette
// file, et il mourrait avec l'invocation en vrai.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => void | Promise<void>) => {
    h.afterWork.push(work);
  },
}));

vi.mock("./pr-run", () => ({
  loadPrRunContext: vi.fn(async () => ({ issueId: h.prIssueId })),
}));

vi.mock("./vm-rest", () => ({
  landVmTurn: vi.fn(async () => {
    h.landed++;
  }),
}));

vi.mock("./repo-access", () => ({
  resolveRepoCloneTarget: vi.fn(async (_projectId: string, access = "full") => {
    h.repoAccessAsked.push(access);
    return {
      provider: "github",
      repoFullName: "org/repo",
      token: `tok-${access}`,
      authUrl: `https://x-access-token:tok-${access}@github.com/org/repo.git`,
      defaultBranch: "main",
    };
  }),
}));

vi.mock("./forge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forge")>()),
  forgeFor: vi.fn(() => ({})),
}));

// La moitié FORGE de `create_pr` est PARTAGÉE avec l'ancienne forme, et couverte
// avec elle : ici on vérifie ce qu'on lui passe, pas ce qu'elle en fait.
vi.mock("./pr-landing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pr-landing")>()),
  openPullRequestAfterPush: vi.fn(
    async (
      ctx: { workBranch: string; baseBranch: string },
      opts: {
        pushed: { pushed: boolean };
        noteBranchPushed: (p: { pushed: boolean }) => Promise<void>;
      },
    ) => {
      h.prLandings.push({ workBranch: ctx.workBranch, baseBranch: ctx.baseBranch });
      await opts.noteBranchPushed(opts.pushed);
      return { result: { number: 12, url: "https://github.com/org/repo/pull/12" }, success: true };
    },
  ),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  getRun: vi.fn(async () => {
    h.runReads++;
    return h.run;
  }),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  stampRun: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    return h.stampReturnsNull || h.stampFails ? null : (h.run as never);
  }),
  stampRunResult: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    if (h.stampFails) return { run: null, failed: true };
    return { run: h.stampReturnsNull ? null : (h.run as never), failed: false };
  }),
  pullPendingMessages: vi.fn(async () => [
    { text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] },
  ]),
  insertRunMessage: vi.fn(
    async (
      runId: string,
      userId: string | null,
      content: string,
      mentions?: unknown[] | null,
    ) => {
      h.requeued.push({ runId, userId, content, mentions: mentions ?? null });
    },
  ),
  appendRunJournal: vi.fn(
    async (runId: string, sessionId: string, events: Record<string, unknown>[]) => {
      h.journal.push({ runId, sessionId, events });
    },
  ),
  runSteeredByOther: vi.fn(async () => h.steeredByOther),
  readInterruptFlag: vi.fn(async () => true),
  clearInterrupt: vi.fn(async (runId: string) => {
    h.cleared.push(runId);
  }),
}));

vi.mock("./issue-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issue-tools")>()),
  executeIssueTool: vi.fn(async (ctx: Record<string, unknown>, name: string) => {
    h.issueCalls.push({ ctx, name });
    return { result: { ok: true }, success: true };
  }),
}));

vi.mock("./scratchpad-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scratchpad-tools")>()),
  executeScratchpadTool: vi.fn(async (_ctx: unknown, name: string) => {
    h.scratchpadCalls.push(name);
    return { result: { ok: true }, success: true };
  }),
}));

vi.mock("@/lib/server/account-settings", () => ({
  getAccountSettings: vi.fn(async () => ({ ok: false as const })),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { key: "MIN" } }) }) }),
    }),
  }),
}));

import { handleControlPlaneRequest } from "./control-plane";
import { CHANGED_FILES_CAP } from "./repo-host";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_RUN = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  h.recorded.length = 0;
  h.streams.length = 0;
  h.streamPayloads.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.issueCalls.length = 0;
  h.afterWork.length = 0;
  h.requeued.length = 0;
  h.journal.length = 0;
  h.scratchpadCalls.length = 0;
  h.repoAccessAsked.length = 0;
  h.steeredByOther = false;
  h.prIssueId = null;
  h.stampReturnsNull = false;
  h.stampFails = false;
  h.landed = 0;
  h.prLandings.length = 0;
  h.runReads = 0;
  h.cleared.length = 0;
  h.quota = { unlimited: false, remaining: 3, allowed: true, mode: "platform" };
  h.ledgerSpent = 0;
  h.run = {
    id: RUN_ID,
    status: "running",
    cost_usd: 0,
    budget_usd: null,
    branch_name: null,
    base_branch: "main",
    pr_number: null,
    pr_url: null,
    pr_state: null,
    run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    project_id: "proj-1",
    issue_id: "issue-1",
    pull_request_id: null,
    created_by: "user-owner",
    chain_id: null,
    model: "deepseek/deepseek-v4-flash",
    checkpoint: { messages: [] },
  };
});

const call = (
  method: string,
  surface: string,
  body: Record<string, unknown> | null = null,
  runId = RUN_ID,
) => handleControlPlaneRequest({ runId, method, surface, body });

/**
 * MIN-224 — le plafond de dépense d'un tour se RELIT en cours de route.
 *
 * Un tour de microVM dure des heures et son plafond était figé à son lancement.
 * Or rien ne réserve de budget : deux runs lancés à la même seconde lisent le même
 * restant et le prennent chacun pour plafond, donc ils peuvent dépenser le double.
 */
describe("le budget restant du tour", () => {
  it("rend le restant du COMPTE quand le run n'a pas de plafond propre", async () => {
    // Le cas courant : seules les routines posent un `budget_usd`.
    const res = await call("GET", "/budget");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingUsd: 3 });
  });

  it("prend le plus serré des deux, et déduit au LEDGER ce que le run a dépensé", async () => {
    // Une routine à 2 $, qui en a déjà brûlé 1,20 — dont une part qu'un chunk mort
    // n'a jamais stampée sur la colonne. C'est le ledger qui la porte.
    h.run = { ...h.run!, budget_usd: 2, cost_usd: 0.4 };
    h.ledgerSpent = 1.2;
    const res = await call("GET", "/budget");
    expect((res.body as { remainingUsd: number }).remainingUsd).toBeCloseTo(0.8, 6);
  });

  it("laisse le compte gagner quand c'est lui qui borne", async () => {
    h.run = { ...h.run!, budget_usd: 10 };
    h.quota = { unlimited: false, remaining: 0.5, allowed: true, mode: "platform" };
    expect(await call("GET", "/budget").then((r) => r.body)).toEqual({ remainingUsd: 0.5 });
  });

  it("rend `null` en illimité (BYOK) — il n'y a rien à plafonner", async () => {
    h.quota = { unlimited: true, allowed: true, mode: "byok" };
    expect(await call("GET", "/budget").then((r) => r.body)).toEqual({ remainingUsd: null });
  });

  it("rend `null` quand la facturation est injoignable, jamais 0", async () => {
    // Un 0 arrêterait le tour sur une panne de lecture. La VM garde alors son
    // plafond d'entrée : le pire cas est le comportement d'avant, pas pire.
    h.quota = null;
    const res = await call("GET", "/budget");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingUsd: null });
  });
});

describe("le direct — le topic vient du run, pas du corps", () => {
  it("diffuse sur le run de l'OIDC même quand le corps en désigne un autre", async () => {
    const res = await call("POST", "/stream", { text: "salut", runId: OTHER_RUN, topic: "x" });
    expect(res.status).toBe(200);
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streams).toEqual([{ topic: `agent-run:${RUN_ID}`, event: "stream", text: "salut" }]);
  });

  it("confie la diffusion au canal de fond, au lieu de la détacher", async () => {
    // Le direct n'est écrit NULLE PART : contrairement aux events, aucun poll ne
    // le rattrape. Détaché juste avant la réponse, son fetch meurt gelé avec
    // l'invocation et le fil ne voit jamais l'agent écrire (cf. after-safe.ts).
    await call("POST", "/stream", { text: "salut" });
    // Rien n'est parti pendant la requête : la diffusion attend le crochet.
    expect(h.streams).toHaveLength(0);
    expect(h.afterWork).toHaveLength(1);
    // Et le travail doit RENDRE sa promesse : la détacher à l'intérieur du
    // crochet referait exactement la même panne, un cran plus bas.
    const returned = h.afterWork[0]();
    expect(returned).toBeInstanceOf(Promise);
    await returned;
    expect(h.streams).toHaveLength(1);
  });

  it("ne LIT PAS la ligne du run — c'est le seul appel chaud de la surface", async () => {
    // `emitLive` diffuse ~4×/s pendant toute la durée du tour : une lecture de
    // `agent_runs` par tick, c'est ~29 000 requêtes sur un tour de deux heures,
    // pour une surface qui n'a besoin que du `runId` de l'OIDC. Les surfaces qui
    // ÉCRIVENT, elles, gardent la lecture — la comparaison est le test.
    await call("POST", "/stream", { text: "salut" });
    expect(h.runReads).toBe(0);
    await call("POST", "/events", { type: "status" });
    expect(h.runReads).toBe(1);
  });

  it("diffuse même si la ligne du run a disparu — rien à perdre, personne à atteindre", async () => {
    h.run = null;
    expect((await call("POST", "/stream", { text: "salut" })).status).toBe(200);
  });

  it("ne rediffuse pas la liste de fichiers telle quelle : chemins vides, statuts inventés et surplus tombent", async () => {
    // La VM est notre code, mais elle reste de l'autre côté d'un POST : ce qui
    // part sur le topic est ce que le fil sait lire, pas ce qu'elle a envoyé.
    await call("POST", "/stream", {
      text: "",
      files: [
        { path: "a.ts", status: "deleted" },
        { path: "b.ts", status: "cosmique" }, // statut inconnu → modified
        { path: "", status: "added" }, // chemin vide → ignoré
        "pas un objet",
        { path: "c.ts", status: "renamed", previousPath: "old.ts", vole: "des octets" },
      ],
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0].files).toEqual([
      { path: "a.ts", status: "deleted" },
      { path: "b.ts", status: "modified" },
      { path: "c.ts", status: "renamed", previousPath: "old.ts" },
    ]);
    // Deux entrées écartées : la liste diffusée est plus courte que celle reçue.
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("borne la liste, et le DIT", async () => {
    // Sans plafond, un tour qui touche 500 fichiers les diffuse tous, quatre fois
    // par seconde, à tous les abonnés du topic.
    await call("POST", "/stream", {
      text: "",
      files: Array.from({ length: CHANGED_FILES_CAP + 20 }, (_, i) => ({
        path: `f${i}.ts`,
        status: "modified",
      })),
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect((h.streamPayloads[0].files as unknown[]).length).toBe(CHANGED_FILES_CAP);
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("garde l'aveu de troncature de la VM, qui borne DÉJÀ avant d'envoyer", async () => {
    // La VM coupe au même plafond : sa liste arrive donc entière du point de vue
    // du relais (`raw.length === files.length`), et sans ce report la troncature
    // se perdait ici — le fil lisait une liste bornée comme une liste complète.
    await call("POST", "/stream", {
      text: "",
      files: [{ path: "a.ts", status: "modified" }],
      filesTruncated: true,
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("ne parle pas de fichiers quand il n'y en a pas", async () => {
    // `clearLive` passe par ici : une liste vide ne doit pas devenir un `files: []`
    // que le fil lirait comme « le tour n'a rien touché ».
    await call("POST", "/stream", { text: "salut" });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0]).not.toHaveProperty("files");
    expect(h.streamPayloads[0]).not.toHaveProperty("filesTruncated");
  });
});

describe("le ledger — le payeur vient de la ligne du run, pas du corps", () => {
  it("impute au créateur du run et ignore un billTo envoyé", async () => {
    await call("POST", "/usage", {
      feature: "agent_code",
      cost: 0.42,
      // Les tokens accompagnent le montant, comme sur toute vraie ligne de
      // fournisseur : au-dessus du plancher, c'est ce qui rend le montant
      // vérifiable (MIN-329).
      promptTokens: 1_000_000,
      completionTokens: 100_000,
      billTo: { userId: "quelquun-dautre" },
      userId: "quelquun-dautre",
      runId: OTHER_RUN,
    });
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].billTo).toEqual({ userId: "user-owner" });
    // …et sous l'identifiant de facturation du run, pas sous celui du corps.
    expect(h.recorded[0].runId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(h.recorded[0].cost).toBe(0.42);
  });

  /**
   * MIN-329 — le montant n'est pas une déclaration.
   *
   * Le corps de `/usage` vient d'une boucle pilotée par un modèle qui lit du
   * contenu tiers : une injection suffisait à y poster un `cost` négatif, et
   * cette ligne-là faisait DESCENDRE la consommation du mois du compte.
   */
  it("REFUSE un cost négatif, et n'écrit AUCUNE ligne", async () => {
    const res = await call("POST", "/usage", { feature: "agent_code", cost: -500 });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
    // Le refus se trace sur le run : une dépense qui n'entre nulle part doit se
    // lire là où le trou s'est fait.
    expect(h.events).toEqual([{ runId: RUN_ID, type: "error" }]);
  });

  it("refuse un montant impossible ou démesuré", async () => {
    for (const cost of [Number.NaN, Number.POSITIVE_INFINITY, 10_000]) {
      expect((await call("POST", "/usage", { feature: "agent_code", cost })).status).toBe(400);
    }
    expect(h.recorded).toHaveLength(0);
  });

  it("refuse un compteur de tokens négatif", async () => {
    const res = await call("POST", "/usage", {
      feature: "agent_code",
      cost: 0.01,
      promptTokens: -1_000,
    });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
  });

  it("écrit NOTRE montant quand les tokens ne peuvent pas justifier le sien", async () => {
    const res = await call("POST", "/usage", {
      feature: "agent_code",
      cost: 40,
      promptTokens: 100_000,
      completionTokens: 10_000,
    });
    expect(res.status).toBe(200);
    // 100k × 0,30 $ + 10k × 1,20 $ par million = 0,042 $, et la ligne se dit
    // calculée : ce chiffre-là n'a pas été relevé chez le fournisseur.
    expect(h.recorded[0].cost).toBe(0.042);
    expect(h.recorded[0].estimated).toBe(true);
  });

  it("le total d'un compte ne peut donc que MONTER après un tour", async () => {
    // La somme du ledger est faite sur `cost` : il suffit qu'aucune ligne écrite
    // ne soit négative pour qu'elle ne redescende jamais.
    for (const cost of [-1, -0.000001, Number.NaN, 1e9, 0.02]) {
      await call("POST", "/usage", { feature: "agent_code", cost, completionTokens: 100_000 });
    }
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded.every((line) => (line.cost ?? 0) >= 0)).toBe(true);
  });

  it("range la ligne dans SA bande de seq, quel que soit l'index envoyé", async () => {
    await call("POST", "/usage", { feature: "agent_code", cost: 0.01, seq: -42 });
    expect(h.recorded[0].seq).toBe(0);
  });

  it("refuse une feature hors du périmètre de l'agent", async () => {
    // Sans ce refus, une VM compromise rangerait sa dépense sous `numo_chat` et
    // la sortirait des compteurs de l'agent — invisible là où on la cherche.
    const res = await call("POST", "/usage", { feature: "numo_chat", cost: 10 });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
  });
});

describe("les events", () => {
  it("écrivent sur le run de l'OIDC", async () => {
    await call("POST", "/events", { type: "tool_call", payload: { name: "read_file" } });
    expect(h.events).toEqual([{ runId: RUN_ID, type: "tool_call" }]);
  });

  it("refusent un event sans type plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/events", { payload: {} })).status).toBe(400);
  });
});

describe("le checkpoint", () => {
  it("rend celui de la ligne", async () => {
    const res = await call("GET", "/checkpoint");
    expect(res.body).toEqual({ checkpoint: { messages: [] } });
  });

  it("dit 409 quand le run n'est plus en cours — au lieu de laisser croire", async () => {
    // Une VM qui croit avoir sauvegardé et continue travaille pour une
    // conversation qui est finie.
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [1] } });
    expect(res.status).toBe(409);
  });
});

describe("steering et interruption — inchangés côté base", () => {
  it("drainent les messages en attente, MENTIONS COMPRISES", async () => {
    // La forme a changé avec les mentions (PR 52) : un message est un objet, et
    // ses ids voyagent à côté de son texte — c'est ce que le superviseur
    // repostera au modèle sans les lui faire deviner.
    expect((await call("GET", "/messages")).body).toEqual({
      messages: [{ text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] }],
    });
  });

  it("rendent le drapeau d'interruption", async () => {
    expect((await call("GET", "/interrupt")).body).toEqual({ interrupted: true });
  });

  /**
   * MIN-286 — le pendant du drainage. Le superviseur d'opencode consomme la file
   * AVANT de couper le round pour reposter derrière : quand le tour sort entre les
   * deux (plafond, deadline, run conclu ailleurs), le message n'a été ni joué ni
   * gardé, et il meurt avec la microVM. Il revient donc en file, et c'est LUI qui
   * re-queue le run.
   */
  it("REMETTENT en file ce qui a été drainé sans être joué", async () => {
    const res = await call("POST", "/messages", { messages: ["fais plutôt ça", "  ", ""] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requeued: 1 });
    // Sans auteur : réinséré, il redevient un message en attente ordinaire.
    expect(h.requeued).toEqual([
      // `parseAgentMentions` rend une liste VIDE quand il n'y a rien à lire —
      // `insertRunMessage` n'écrit alors pas la colonne.
      { runId: RUN_ID, userId: null, content: "fais plutôt ça", mentions: [] },
    ]);
  });

  /**
   * PR 52 — UN MESSAGE REMIS EN FILE GARDE SES MENTIONS.
   *
   * Le retour en file est la seule chose qui sépare « accepté à l'écran » de
   * « joué » quand un tour sort au mauvais moment. S'il perdait les ids en
   * chemin, le tour suivant relirait « relis @MIN-42 » sans savoir de quel
   * ticket on parle — c'est-à-dire exactement ce que cette PR répare.
   */
  it("gardent les mentions d'un message remis en file, et ignorent une forme illisible", async () => {
    const res = await call("POST", "/messages", {
      messages: [
        { text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] },
        { text: "   " },
        { mentions: [] },
        42,
      ],
    });
    expect(res.body).toEqual({ requeued: 1 });
    expect(h.requeued).toEqual([
      {
        runId: RUN_ID,
        userId: null,
        content: "relis @MIN-42",
        mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }],
      },
    ]);
  });

  /**
   * MIN-329 — la remise en file est bornée comme l'écriture qui l'a produite.
   * Sans borne, la surface écrivait en base autant de messages que la VM en
   * envoyait, de la taille qu'elle voulait — et chacun revenait dans le prompt du
   * tour suivant.
   */
  it("bornent le nombre et la taille de ce qui revient en file", async () => {
    const res = await call("POST", "/messages", {
      messages: Array.from({ length: 80 }, () => "x".repeat(9_000)),
    });
    expect(res.body).toEqual({ requeued: 50 });
    expect(h.requeued).toHaveLength(50);
    expect(h.requeued.every((m) => m.content.length === 4_000)).toBe(true);
  });

  it("l'EFFACENT sur DELETE — et seulement pour LEUR run", async () => {
    // La boucle consomme le drapeau quand le « stop » qu'elle vient de lire
    // arrivait avec un message : le tour se poursuit alors avec la consigne au
    // lieu de sortir pour être re-queué par ce message resté en file. Le runId
    // vient du claim OIDC, jamais du corps : une VM ne peut effacer que le sien.
    expect((await call("DELETE", "/interrupt")).status).toBe(200);
    expect(h.cleared).toEqual([RUN_ID]);
  });
});

describe("les tools de plateforme", () => {
  it("rejouent un tool ticket avec l'acteur du run, jamais celui du corps", async () => {
    await call("POST", "/tool/read_issue", {
      args: { issue: "MIN-1" },
      actorId: "quelquun-dautre",
    });
    expect(h.issueCalls).toHaveLength(1);
    expect(h.issueCalls[0].ctx.actorId).toBe("user-owner");
    expect(h.issueCalls[0].ctx.runId).toBe(RUN_ID);
  });

  it("ancrent une RELECTURE sur le ticket de sa pull request", async () => {
    // `run.issue_id` est toujours nul sur une session de review, mais la PR porte
    // souvent le ticket qu'elle met en œuvre : c'est LUI le défaut de `read_issue`
    // (même règle qu'execute.ts). Sans ça le tool annonce un défaut qui n'existe
    // pas, et le premier appel sans argument brûle un round.
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
    h.prIssueId = "issue-de-la-pr";
    await call("POST", "/tool/read_issue", { args: {} });
    expect(h.issueCalls[0].ctx.anchorIssueId).toBe("issue-de-la-pr");
  });

  it("ouvrent la pull request sur la branche que la VM vient de POUSSER", async () => {
    // `agent_runs.branch_name` n'est stampé qu'après un premier push RÉEL
    // (MIN-123) — or c'est `create_pr` qui vient de le faire. Le lire sur la ligne
    // du run donnait une tête VIDE à la forge, et stampait `branch_name: ""`.
    const branch = "minddy/agent/min-42-abcd1234";
    const res = await call("POST", "/tool/create_pr", {
      args: { title: "Ajoute le truc" },
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      workBranch: branch,
    });
    expect(res.status).toBe(200);
    expect(h.prLandings).toEqual([{ workBranch: branch, baseBranch: "main" }]);
    // …et c'est CETTE branche-là qu'on enregistre sur la ligne du run.
    expect(h.stamped.find((f) => "branch_name" in f)).toMatchObject({ branch_name: branch });
  });

  it("retombent sur la branche de la ligne quand la VM n'en envoie pas", async () => {
    h.run = { ...h.run, branch_name: "minddy/agent/deja-poussee" };
    await call("POST", "/tool/create_pr", {
      args: { title: "Suite" },
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
    });
    expect(h.prLandings[0].workBranch).toBe("minddy/agent/deja-poussee");
    // Déjà enregistrée : on ne la re-stampe pas.
    expect(h.stamped.some((f) => "branch_name" in f)).toBe(false);
  });

  it("refusent un `create_pr` sans résultat de push — la VM seule sait si elle a poussé", async () => {
    expect((await call("POST", "/tool/create_pr", { args: { title: "x" } })).status).toBe(400);
    expect(h.prLandings).toHaveLength(0);
  });

  it("ne servent PAS les tools de fichier — ils s'exécutent dans la VM", async () => {
    // 403 et pas 404 : le nom n'est pas dans le jeu de ce run, ce qui n'est pas la
    // même chose que « ça n'existe pas » (MIN-326).
    for (const name of ["read_file", "edit_file", "run_command", "git_commit"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status).toBe(403);
    }
  });
});

/**
 * MIN-326 — L'ANCRAGE EST UN VERROU DE CODE, PAS UNE PHRASE DE PROMPT.
 *
 * `runPlatformTool` routait sur le seul NOM du tool. Une session de relecture —
 * celle dont tout le dépôt affirme qu'elle est en lecture seule, et la seule dont
 * le contenu lu vient d'un fork inconnu — pouvait donc écrire dans les tickets,
 * le carnet, le wiki et jusque dans une ROUTINE planifiée, par un POST sur
 * `/api/agent-vm/tool/<nom>` depuis son shell. Une instruction glissée dans un
 * `AGENTS.md` suffisait.
 */
describe("l'ancrage du run ferme la surface `/tool/`", () => {
  /** Une session de relecture : `issue_id` nul, une pull request ancrée. */
  const review = () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
  };

  it("refuse à une RELECTURE toute écriture minddy, et n'écrit RIEN", async () => {
    review();
    for (const name of [
      "create_issue",
      "update_issue",
      "write_issue_plan",
      "create_page",
      "create_objective",
      "create_routine",
      "set_scratchpad",
      "read_scratchpad",
      "create_pr",
    ]) {
      const res = await call("POST", `/tool/${name}`, {
        args: { title: "x" },
        pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      });
      expect(res.status, name).toBe(403);
    }
    expect(h.issueCalls).toEqual([]);
    expect(h.scratchpadCalls).toEqual([]);
    expect(h.prLandings).toEqual([]);
  });

  it("laisse à la relecture ses LECTEURS et les écritures de sa pull request", async () => {
    review();
    expect((await call("POST", "/tool/read_issue", { args: {} })).status).toBe(200);
    expect((await call("POST", "/tool/read_page", { args: { page: "p" } })).status).toBe(200);
    // `comment_pr` part chez la forge : ce qui compte ici est qu'il ne soit pas refusé
    // en amont — l'exécution est couverte par `pr-tools.test.ts`.
    expect((await call("POST", "/tool/comment_pr", { args: { body: "ok" } })).status).not.toBe(403);
  });

  it("refuse les pull requests DU PROJET à une relecture — elle n'a que la sienne", async () => {
    review();
    for (const name of ["list_pull_requests", "review_pull_request", "set_pull_request_state"]) {
      expect((await call("POST", `/tool/${name}`, { args: { pull_request: 3 } })).status, name).toBe(
        403,
      );
    }
  });

  it("ne retire rien à un run de TICKET — c'est le risque de régression", async () => {
    for (const name of ["create_issue", "update_issue", "create_routine", "create_page"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status, name).toBe(200);
    }
    expect((await call("POST", "/tool/set_scratchpad", { args: { content: "x" } })).status).toBe(200);
    expect(h.scratchpadCalls).toEqual(["set_scratchpad"]);
  });
});

/**
 * MIN-327 — LE TOKEN DE FORGE QU'UNE MICROVM REÇOIT DÉPEND DE SON ANCRAGE.
 *
 * `/repo-auth` rendait un token frais à n'importe quelle VM, sans regarder
 * l'ancrage. Une relecture — le seul dont tout le contenu vient d'un fork
 * inconnu — en obtenait un EN ÉCRITURE, qui atterrissait dans son `.git/config` :
 * une injection depuis le fork suffisait à le lire et à l'exfiltrer, et il
 * ouvrait alors tous les dépôts privés de l'installation.
 */
describe("le token de forge remis à la microVM", () => {
  it("refuse tout token à une session de RELECTURE", async () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
    const res = await call("POST", "/repo-auth");
    expect(res.status).toBe(403);
    // Et rien n'a été minté : le refus est en amont de la forge, pas un token
    // qu'on fabriquerait pour le jeter.
    expect(h.repoAccessAsked).toEqual([]);
  });

  it("rend au run de TICKET un token de dépôt, pas le token de la fonction", async () => {
    const res = await call("POST", "/repo-auth");
    expect(res.status).toBe(200);
    // `repo-write` : la VM clone, fetch et pousse. Elle ne merge pas une pull
    // request et n'en approuve pas une — ces gestes-là repassent par `/tool/`.
    expect(h.repoAccessAsked).toEqual(["repo-write"]);
    expect(res.body).toEqual({
      authUrl: "https://x-access-token:tok-repo-write@github.com/org/repo.git",
    });
  });

  it("rend le même token restreint à un run de CARNET", async () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: null };
    expect((await call("POST", "/repo-auth")).status).toBe(200);
    expect(h.repoAccessAsked).toEqual(["repo-write"]);
  });
});

/**
 * MIN-326 — LE CARNET EST PERSONNEL, ET IL EST CELUI DU CRÉATEUR DU RUN.
 *
 * N'importe quel membre du projet peut reprendre un run à chaud (`/steer`) : les
 * tools carnet, eux, sont câblés sur `run.created_by`. Un collègue pilotait donc
 * un agent branché sur la note privée de quelqu'un d'autre — qu'il pouvait lire,
 * et réécrire en entier.
 */
describe("le carnet se ferme dès qu'un tiers a parlé au run", () => {
  it("refuse les tools carnet sur un run repris par quelqu'un d'autre", async () => {
    h.steeredByOther = true;
    for (const name of [
      "read_scratchpad",
      "set_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
    ]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status, name).toBe(403);
    }
    expect(h.scratchpadCalls).toEqual([]);
  });

  it("laisse les tools TICKET ouverts sur ce même run — l'acteur y est le lanceur, pas une note privée", async () => {
    h.steeredByOther = true;
    expect((await call("POST", "/tool/update_issue", { args: {} })).status).toBe(200);
  });

  it("refuse le carnet d'un run sans propriétaire", async () => {
    h.run = { ...h.run, created_by: null };
    expect((await call("POST", "/tool/read_scratchpad", { args: {} })).status).toBe(403);
    expect(h.scratchpadCalls).toEqual([]);
  });
});

describe("la surface est fermée", () => {
  it("refuse ce qu'elle ne connaît pas", async () => {
    expect((await call("POST", "/whatever")).status).toBe(404);
    // …y compris une bonne surface avec la mauvaise méthode.
    expect((await call("GET", "/events")).status).toBe(404);
    expect((await call("POST", "/messages/pending")).status).toBe(404);
  });

  it("refuse un run qui n'existe pas", async () => {
    h.run = null;
    expect((await call("POST", "/events", { type: "status" })).status).toBe(404);
  });
});

describe("la fin de tour n'atterrit qu'UNE fois", () => {
  it("met la session au repos quand le run tourne encore", async () => {
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(200);
    expect(h.landed).toBe(1);
  });

  it("refuse en 409 un second rapport — le client ne le retente pas", async () => {
    // Le client du plan de contrôle retente sur 5xx : sans cette garde, un rapport
    // dont la réponse s'est perdue en vol serait rejoué. Events en double dans le
    // fil, et une SECONDE ligne de compute au ledger — la moitié microVM de la
    // facture, comptée deux fois.
    h.run = { ...h.run, status: "completed" };
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(409);
    expect(h.landed).toBe(0);
  });

  it("refuse un rapport sans statut plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/rest", { costUsd: 1 })).status).toBe(400);
    expect(h.landed).toBe(0);
  });
});

describe("le checkpoint périodique fait aussi office de battement de cœur", () => {
  it("horodate l'activité du run à chaque sauvegarde", async () => {
    // C'est le seul signal régulier qu'un tour qui vit dans la VM produise, et
    // c'est sur lui que le chien de garde décide d'aller interroger la plateforme.
    // Sans lui, il la sonderait pour chaque run à chaque passage du cron.
    await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(h.stamped[0]).toHaveProperty("last_activity_at");
  });

  it("dit 409 quand le run n'est plus en cours — la VM doit s'arrêter", async () => {
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(res.status).toBe(409);
  });

  /**
   * MIN-286 — UNE PANNE D'ÉCRITURE N'EST PAS UN RUN CONCLU.
   *
   * Le superviseur lit un 409 comme « la conversation n'existe plus » : il coupe
   * le tour, il ne pousse pas, il rend la main. Une base qui refuse la ligne —
   * l'octet nul du 2026-08-12, une coupure réseau — lui disait donc d'abandonner
   * un tour parfaitement vivant, et le fil restait figé sur son dernier geste.
   */
  it("dit 503 quand la BASE refuse — la VM doit retenter, pas mourir", async () => {
    h.stampFails = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(res.status).toBe(503);
  });
});

/**
 * MIN-286 (2026-08-13) — LE JOURNAL D'OPENCODE S'ÉCRIT EN APPEND.
 *
 * Il portait la sortie complète de chaque tool et voyageait dans le checkpoint :
 * le plafond du corps tombait au bout d'une quinzaine de lectures de fichiers, et
 * un tour de 31 minutes perdait toute sa conversation. La microVM n'envoie plus
 * que ce qui est NEUF, et la ligne du run — relue à chaque appel de cette
 * surface — n'en garde que le pointeur.
 */
describe("le journal de la session", () => {
  it("écrit l'incrément sous le run de l'OIDC, pas sous celui du corps", async () => {
    const res = await call("POST", "/journal", {
      runId: "un-autre-run",
      sessionId: "ses_1",
      events: [{ seq: 1 }, { seq: 2 }],
    });
    expect(res.status).toBe(200);
    expect(h.journal).toEqual([
      { runId: RUN_ID, sessionId: "ses_1", events: [{ seq: 1 }, { seq: 2 }] },
    ]);
  });

  it("refuse un lot sans session — il n'y aurait rien à rejouer", async () => {
    const res = await call("POST", "/journal", { events: [{ seq: 1 }] });
    expect(res.status).toBe(400);
    expect(h.journal).toEqual([]);
  });
});

/**
 * MIN-331 — UNE MICROVM NE PARLE QUE POUR SON RUN, vu depuis la base.
 *
 * L'admission de la route (`admitSandboxCaller`) refuse déjà une sandbox d'un
 * autre compte Vercel, et dérive le run du nom signé — donc le nom et le run
 * s'accordent par construction. Ce contrôle-ci est l'autre moitié : la ligne du
 * run doit RECONNAÎTRE cette microVM comme la sienne. Le jour où le nommage
 * cesserait d'être déterministe, c'est ici que ça se dit, pas dans les logs.
 */
describe("la microVM appelante et le run qu'elle prétend exécuter", () => {
  it("laisse passer la microVM enregistrée sur le run", async () => {
    h.run = { ...h.run!, sandbox_id: `agent-${RUN_ID}` };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: `agent-${RUN_ID}`,
    });
    expect(res.status).toBe(200);
    expect(h.events).toHaveLength(1);
  });

  it("refuse la microVM d'un AUTRE run, et n'écrit rien", async () => {
    h.run = { ...h.run!, sandbox_id: `agent-${RUN_ID}` };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: "agent-99999999-8888-4777-8666-555555555555",
    });
    expect(res.status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("laisse passer un run dont la microVM n'est pas encore enregistrée", async () => {
    h.run = { ...h.run!, sandbox_id: null };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: `agent-${RUN_ID}`,
    });
    expect(res.status).toBe(200);
  });
});

/**
 * MIN-355 — LE CHEMIN LOCAL, ET CE QU'IL NE SERT PAS.
 *
 * Un tour qui joue sur la machine de l'utilisateur porte un jeton que NOUS avons
 * signé, sur un disque que le modèle peut lire. On ne prétend donc pas le
 * protéger : on réduit ce qu'il ouvre. Trois refus, et une garde de fraîcheur qui
 * ne coûte rien parce que la ligne du run est déjà lue.
 */
describe("le plan de contrôle vu depuis une machine", () => {
  const LOCAL_GEN = 4;
  const callLocal = (
    method: string,
    surface: string,
    body: Record<string, unknown> | null = null,
    gen = LOCAL_GEN,
  ) =>
    handleControlPlaneRequest({ runId: RUN_ID, method, surface, body, local: { gen } });

  beforeEach(() => {
    h.run = { ...h.run!, local_exec: true, local_exec_gen: LOCAL_GEN };
  });

  it("sert les surfaces ordinaires d'un run local qui travaille", async () => {
    expect((await callLocal("POST", "/events", { type: "assistant_message" })).status).toBe(200);
    expect(h.events).toHaveLength(1);
  });

  it("refuse un jeton dont la GÉNÉRATION a été dépassée — la révocation est là", async () => {
    // Émettre un jeton incrémente la génération (`issueLocalExecToken`) : celui de
    // la machine précédente meurt à l'instant, sans qu'on ait rien à rappeler.
    const res = await callLocal("POST", "/events", { type: "assistant_message" }, LOCAL_GEN - 1);
    expect(res.status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("refuse un jeton signé pour un run qui n'est PAS local", async () => {
    // Ne devrait pas exister — donc si ça existe, c'est une faute de chez nous, et
    // elle s'arrête ici plutôt que d'ouvrir une seconde voie sur un run cloud.
    h.run = { ...h.run!, local_exec: false };
    expect((await callLocal("POST", "/events", { type: "assistant_message" })).status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("exige que le run TRAVAILLE, sur toutes les surfaces qui lisent sa ligne", async () => {
    // Une microVM se fait couper au repos ; une machine, non. Sans cette ligne, un
    // jeton de quinze minutes servirait encore les tools d'une conversation finie
    // et consommerait sa file de steering.
    h.run = { ...h.run!, status: "completed" };
    for (const [method, surface] of [
      ["POST", "/events"],
      ["GET", "/messages"],
      ["POST", "/tool/read_issue"],
      ["GET", "/budget"],
    ] as const) {
      const res = await callLocal(method, surface, { type: "assistant_message", args: {} });
      // 409 et pas 403 : c'est celui que le client du plan de contrôle lit déjà
      // comme « arrête-toi », et il n'est pas retenté.
      expect([surface, res.status]).toEqual([surface, 409]);
    }
    expect(h.events).toEqual([]);
    expect(h.issueCalls).toEqual([]);
  });

  it("ne rend AUCUN token de forge — le renouvellement passe par l'app", async () => {
    const res = await callLocal("POST", "/repo-auth");
    expect(res.status).toBe(403);
    // Rien n'a été minté : le refus est en amont de la forge.
    expect(h.repoAccessAsked).toEqual([]);
  });

  it("sert le MÊME jeu de tools que dans la microVM, carnet compris", async () => {
    /**
     * Le cadrage voulait retirer `set_scratchpad` du chemin local — le seul tool
     * destructeur de la surface. Écarté le 2026-08-15, et ce test est la trace de
     * la décision plutôt que de son absence :
     *
     * - un porteur de jeton lit le carnet et son `rev` par `read_scratchpad`, qui
     *   reste servi : le compare-and-swap ne garde que de l'obsolescence ;
     * - et un refus servi ici sans retrait du CATALOGUE (`agentToolsFor`) ferait
     *   brûler un round au modèle sur un tool déclaré qui ment.
     */
    for (const name of [
      "read_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "set_scratchpad",
    ]) {
      expect([name, (await callLocal("POST", `/tool/${name}`, { args: {} })).status]).toEqual([
        name,
        200,
      ]);
    }
    expect(h.scratchpadCalls).toHaveLength(4);
  });

  it("laisse le DIRECT passer sans lire la ligne du run — le 13e cas, assumé", async () => {
    // C'est le seul appel chaud (~4/s) : lui imposer un lookup serait exactement
    // la charge que son court-circuit existe pour supprimer. Ce qu'un jeton volé y
    // gagne est du texte éphémère sur le fil de SON run, quinze minutes au plus.
    const res = await callLocal("POST", "/stream", { text: "salut" }, LOCAL_GEN - 1);
    expect(res.status).toBe(200);
    expect(h.runReads).toBe(0);
  });

  it("ne change RIEN au chemin de la microVM", async () => {
    // La preuve que les deux refus sont bien conditionnés : les mêmes appels,
    // sans `local`, se comportent comme avant — y compris sur un run conclu, que
    // seul le chemin local ferme.
    h.run = { ...h.run!, status: "completed", local_exec: true, local_exec_gen: LOCAL_GEN };
    expect((await call("POST", "/repo-auth")).status).toBe(200);
    expect((await call("POST", "/events", { type: "assistant_message" })).status).toBe(200);
  });
});
