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
  streams: [] as Array<{ runId: string; text: string }>,
  events: [] as Array<{ runId: string; type: string }>,
  stamped: [] as Array<Record<string, unknown>>,
  issueCalls: [] as Array<{ ctx: Record<string, unknown>; name: string }>,
  stampReturnsNull: false,
  run: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    h.recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
}));

vi.mock("./live", () => ({
  broadcastRunStream: vi.fn((runId: string, live: { text: string }) => {
    h.streams.push({ runId, text: live.text });
  }),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  getRun: vi.fn(async () => h.run),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  stampRun: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    return h.stampReturnsNull ? null : (h.run as never);
  }),
  pullPendingMessages: vi.fn(async () => ["fais plutôt ça"]),
  readInterruptFlag: vi.fn(async () => true),
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

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_RUN = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  h.recorded.length = 0;
  h.streams.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.issueCalls.length = 0;
  h.stampReturnsNull = false;
  h.run = {
    id: RUN_ID,
    run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    project_id: "proj-1",
    issue_id: "issue-1",
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

describe("le direct — le topic vient du run, pas du corps", () => {
  it("diffuse sur le run de l'OIDC même quand le corps en désigne un autre", async () => {
    const res = await call("POST", "/stream", { text: "salut", runId: OTHER_RUN, topic: "x" });
    expect(res.status).toBe(200);
    expect(h.streams).toEqual([{ runId: RUN_ID, text: "salut" }]);
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
    expect((await call("POST", "/messages")).status).toBe(404);
  });

  it("refuse un run qui n'existe pas", async () => {
    h.run = null;
    expect((await call("POST", "/events", { type: "status" })).status).toBe(404);
  });
});
