import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneClient } from "./control-plane-client";

/**
 * MIN-355 — THE TOKEN ON BOTH FETCH, and not just the one we are looking at.
 *
 * This module places its headers in TWO places: `request()`, which serves everything, and
 * `emitLive`, which has its own `fetch` detached from the empty `catch` because it draws
 * four times per second. The token placed on the first and forgotten on the second
 * results in a successful turn, a thread that no longer streams for hours, and zero
 * errors anywhere — the hardest failure to see on the entire local path.
 *
 * Hence a test that tests almost nothing else.
 */

const ORIGIN = "https://minddy.test";

/** What a call actually sent — the URL and headers, nothing else. */
let calls: Array<{ url: string; headers: Record<string, string> }> = [];
/** What the control plane responds to. Adjustable by test; `{ ok: true }` otherwise. */
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
    // A token lasts fifteen minutes, a turn of hours: a chain frozen at the
    // building the client would doom the round on its first expiration.
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
 * MIN-357 — THE MODEL KEY HAS NO FALLBACK, unlike its neighbor
 * `repoAuthUrl` (which falls on the token that the job already carries).
 *
 * There is no key elsewhere, and there should not be: a failure here wants
 * to say “this deployment does not know how to cap”, and the only correct behavior is
 * that the turn does not start. The only exception is `key: null`, explicit contract
 * of a local endpoint without authentication.
 */
  it("rend la clé du tour local, ou null quand l'endpoint n'en demande pas", async () => {
    const cp = createControlPlaneClient(ORIGIN, () => "jeton-du-bail");
    reply = { status: 200, body: { key: "sk-or-v1-clef-du-run", capUsd: 3 } };
    await expect(cp.llmKey()).resolves.toBe("sk-or-v1-clef-du-run");
    expect(calls.at(-1)!.url).toBe(`${ORIGIN}/api/agent-vm/llm-key`);

    reply = { status: 200, body: { key: null } };
    await expect(cp.llmKey()).resolves.toBeNull();

    // A 200 without a key would be a fault on our part: without this refusal, it becomes
    // an empty `authorization` and a 401 from the provider which says nothing.
    reply = { status: 200, body: { capUsd: 3 } };
    await expect(cp.llmKey()).rejects.toThrow(/no key/);

    // A refusal is not retried (403), and it goes back as is: this is the text
    // that the end of turn report will carry.
    reply = { status: 403, body: { error: "a microVM gets its model key from the firewall" } };
    await expect(cp.llmKey()).rejects.toThrow(/firewall/);
  });

  it("garde le `content-type` là où il y a un corps, et nulle part ailleurs", async () => {
    // Merging headers is the kind of refactor that loses a field in
    // silence: the control plane would then refuse the JSON sent to it.
    const cp = createControlPlaneClient(ORIGIN, () => "t");
    await cp.emit("status", {});
    await cp.checkInterrupt();
    expect(calls.map((c) => c.headers["content-type"])).toEqual([
      "application/json",
      undefined,
    ]);
  });
});
