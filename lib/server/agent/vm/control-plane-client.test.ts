import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneClient } from "./control-plane-client";

/**
 * MIN-355 — LE JETON SUR LES DEUX FETCH, et pas seulement sur celui qu'on regarde.
 *
 * Ce module pose ses en-têtes à DEUX endroits : `request()`, qui sert tout, et
 * `emitLive`, qui a son propre `fetch` détaché au `catch` vide parce qu'il tire
 * quatre fois par seconde. Le jeton posé sur le premier et oublié sur le second
 * donne un tour qui aboutit, un fil qui ne stream plus pendant des heures, et zéro
 * erreur nulle part — la panne la plus difficile à voir de tout le chemin local.
 *
 * D'où un test qui ne teste presque rien d'autre.
 */

const ORIGIN = "https://minddy.test";

/** Ce qu'un appel a réellement envoyé — l'URL et les en-têtes, rien d'autre. */
let calls: Array<{ url: string; headers: Record<string, string> }> = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("le client du plan de contrôle, sur une machine", () => {
  it("porte le jeton sur une surface ordinaire ET sur le direct", async () => {
    const cp = createControlPlaneClient(ORIGIN, () => "jeton-du-bail");
    await cp.emit("status", { text: "x" });
    cp.emitLive({ text: "x", tools: 0, reasoningActive: false, reasoningMs: 0 });

    expect(calls.map((c) => c.url)).toEqual([
      `${ORIGIN}/api/agent-vm/events`,
      `${ORIGIN}/api/agent-vm/stream`,
    ]);
    for (const call of calls) {
      expect([call.url, call.headers.authorization]).toEqual([call.url, "Bearer jeton-du-bail"]);
    }
  });

  it("n'invente aucun en-tête en microVM, où il n'y a rien à porter", async () => {
    const cp = createControlPlaneClient(ORIGIN);
    await cp.emit("status", { text: "x" });
    cp.emitLive({ text: "x", tools: 0, reasoningActive: false, reasoningMs: 0 });
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.headers.authorization).toBeUndefined();
  });

  it("RELIT le jeton à chaque appel — c'est par là que passera le renouvellement", async () => {
    // Un jeton dure quinze minutes, un tour des heures : une chaîne figée à la
    // construction du client condamnerait le tour à sa première expiration.
    let token = "premier";
    const cp = createControlPlaneClient(ORIGIN, () => token);
    await cp.emit("status", {});
    token = "renouvelé";
    await cp.emit("status", {});
    expect(calls.map((c) => c.headers.authorization)).toEqual([
      "Bearer premier",
      "Bearer renouvelé",
    ]);
  });

  it("garde le `content-type` là où il y a un corps, et nulle part ailleurs", async () => {
    // La fusion des en-têtes est le genre de refactor qui perd un champ en
    // silence : le plan de contrôle refuserait alors le JSON qu'on lui envoie.
    const cp = createControlPlaneClient(ORIGIN, () => "t");
    await cp.emit("status", {});
    await cp.checkInterrupt();
    expect(calls.map((c) => c.headers["content-type"])).toEqual([
      "application/json",
      undefined,
    ]);
  });
});
