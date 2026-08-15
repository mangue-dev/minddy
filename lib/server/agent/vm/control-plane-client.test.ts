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
/** Ce que le plan de contrôle répond. Réglable par test ; `{ ok: true }` sinon. */
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true } };

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: { ok: true } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
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

  /**
   * MIN-357 — LA CLÉ DU MODÈLE N'A AUCUN REPLI, contrairement à sa voisine
   * `repoAuthUrl` (qui retombe sur le token que le job porte déjà).
   *
   * Il n'y a aucune clé ailleurs, et il ne doit pas y en avoir : un échec ici veut
   * dire « ce déploiement ne sait pas plafonner », et la seule conduite juste est
   * que le tour ne parte pas. La seule exception est `key: null`, contrat
   * explicite d'un endpoint local sans authentification.
   */
  it("rend la clé du tour local, ou null quand l'endpoint n'en demande pas", async () => {
    const cp = createControlPlaneClient(ORIGIN, () => "jeton-du-bail");
    reply = { status: 200, body: { key: "sk-or-v1-clef-du-run", capUsd: 3 } };
    await expect(cp.llmKey()).resolves.toBe("sk-or-v1-clef-du-run");
    expect(calls.at(-1)!.url).toBe(`${ORIGIN}/api/agent-vm/llm-key`);

    reply = { status: 200, body: { key: null } };
    await expect(cp.llmKey()).resolves.toBeNull();

    // Un 200 sans clé serait une faute de chez nous : sans ce refus, elle devient
    // un `authorization` vide et un 401 du fournisseur qui ne dit rien.
    reply = { status: 200, body: { capUsd: 3 } };
    await expect(cp.llmKey()).rejects.toThrow(/no key/);

    // Un refus n'est pas retenté (403), et il remonte tel quel : c'est ce texte
    // que le rapport de fin de tour portera.
    reply = { status: 403, body: { error: "a microVM gets its model key from the firewall" } };
    await expect(cp.llmKey()).rejects.toThrow(/firewall/);
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
