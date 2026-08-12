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
  requeued: [] as Array<{ runId: string; userId: string | null; content: string }>,
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    h.recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
  spentFromLedger: vi.fn(async () => h.ledgerSpent),
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
  resolveRepoCloneTarget: vi.fn(async () => ({
    provider: "github",
    repoFullName: "org/repo",
    token: "tok",
    authUrl: "https://x-access-token:tok@github.com/org/repo.git",
    defaultBranch: "main",
  })),
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
    return h.stampReturnsNull ? null : (h.run as never);
  }),
  pullPendingMessages: vi.fn(async () => ["fais plutôt ça"]),
  insertRunMessage: vi.fn(async (runId: string, userId: string | null, content: string) => {
    h.requeued.push({ runId, userId, content });
  }),
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
  executeScratchpadTool: vi.fn(async () => ({ result: { ok: true }, success: true })),
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
  h.prIssueId = null;
  h.stampReturnsNull = false;
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
  it("drainent les messages en attente", async () => {
    expect((await call("GET", "/messages")).body).toEqual({ messages: ["fais plutôt ça"] });
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
    expect(h.requeued).toEqual([{ runId: RUN_ID, userId: null, content: "fais plutôt ça" }]);
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
    for (const name of ["read_file", "edit_file", "run_command", "git_commit"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status).toBe(404);
    }
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
});
