import { describe, expect, it } from "vitest";

import {
  normalizeSyncEvents,
  OpencodeClient,
  OpencodeHttpError,
  parseFrame,
} from "./opencode-client";

/**
 * MIN-286 batch 1 — the opencode server client.
 *
 * This file does not test HTTP: it tests the **three measured traps** which, without
 *, would pay off in production at three in the morning.
 */

function clientWith(
  handler: (url: string, init?: RequestInit) => Response,
  auth?: { username: string; password: string },
): OpencodeClient {
  return new OpencodeClient({
    baseUrl: "http://127.0.0.1:4096",
    directory: "/vercel/sandbox/repo",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init)) as typeof fetch,
    ...(auth ? { auth } : {}),
  });
}

describe("server authentication", () => {
  it("adds HTTP Basic credentials to every request", async () => {
    const headers: string[] = [];
    const client = clientWith(
      (_url, init) => {
        headers.push(new Headers(init?.headers).get("authorization") ?? "");
        return new Response('{"healthy":true}', { status: 200 });
      },
      { username: "minddy", password: "per-turn-password" },
    );

    await client.healthy();
    await client.createSession();
    expect(headers).toEqual([
      `Basic ${Buffer.from("minddy:per-turn-password").toString("base64")}`,
      `Basic ${Buffer.from("minddy:per-turn-password").toString("base64")}`,
    ]);
  });
});

describe("le piège des deux générations d'API", () => {
  it("dit « la route n'existe pas » au lieu d'exploser sur du HTML", async () => {
    // Measured: a fault in a segment does not return a 404 but the TUI page. THE
    // default message would be “Unexpected token < in JSON”, which sends
    // look for a serialization bug where there is only one false URL.
    const client = clientWith(() => new Response("<!doctype html><html>…", { status: 200 }));
    await expect(client.createSession()).rejects.toThrow(/route n'existe pas/);
  });

  it("porte le statut et la route dans l'erreur", async () => {
    const client = clientWith(() => new Response("boom", { status: 503 }));
    await expect(client.createSession()).rejects.toBeInstanceOf(OpencodeHttpError);
  });

  it("passe `?directory=` sur les routes héritées", async () => {
    // Without it, the server works in ITS cwd rather than the run repository.
    let seen = "";
    const client = clientWith((url) => {
      seen = url;
      return new Response("{}", { status: 200 });
    });
    await client.createSession();
    expect(seen).toContain("directory=%2Fvercel%2Fsandbox%2Frepo");
  });

  it("amorce le catalogue avec le modèle et le dossier du run", async () => {
    let seen = "";
    const client = clientWith((url) => {
      seen = url;
      return new Response('[{"id":"read"}]', { status: 200 });
    });
    await client.warmTools("openai/gpt-oss-20b");
    const url = new URL(seen);
    expect(url.pathname).toBe("/experimental/tool");
    expect(url.searchParams.get("provider")).toBe("minddy");
    expect(url.searchParams.get("model")).toBe("openai/gpt-oss-20b");
    expect(url.searchParams.get("agent")).toBe("build");
    expect(url.searchParams.get("directory")).toBe("/vercel/sandbox/repo");
  });
});

describe("le piège du snake_case", () => {
  it("traduit `aggregate_id` en `aggregateID` dans les deux sens", () => {
    // The export emits snake_case, replay expects camelCase — this is in
    // opencode's schema, not a probe accident.
    expect(
      normalizeSyncEvents([{ aggregate_id: "ses_1", seq: 3, type: "x" }]),
    ).toEqual([{ aggregateID: "ses_1", seq: 3, type: "x" }]);
    // Idempotent: an already normalized journal (the checkpoint's) does not move.
    expect(normalizeSyncEvents([{ aggregateID: "ses_1", seq: 3 }])).toEqual([
      { aggregateID: "ses_1", seq: 3 },
    ]);
  });

  it("normalise DÈS LA LECTURE de l'historique", async () => {
    const client = clientWith(
      () =>
        new Response(JSON.stringify({ events: [{ aggregate_id: "ses_1", seq: 2 }] }), {
          status: 200,
        }),
    );
    // The export cursor is derived from `aggregateID`: letting snake_case through
    // produced an empty cursor, and therefore a full export on every turn.
    expect(await client.syncHistory()).toEqual([{ aggregateID: "ses_1", seq: 2 }]);
  });
});

describe("finite request timeouts", () => {
  it("bounds journal synchronization", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://127.0.0.1:4096",
      directory: "/repo",
      requestTimeoutMs: 20,
      fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("request aborted")),
            { once: true },
          );
        })) as typeof fetch,
    });

    await expect(client.syncHistory()).rejects.toThrow(/aborted/);
  });
});

describe("abort acknowledgement", () => {
  it("rejects a false acknowledgement even with HTTP 200", async () => {
    await expect(clientWith(() => new Response("false")).abort("ses_1"))
      .resolves.toBe(false);
  });

  it("bounds an unresponsive abort independently of normal requests", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: "/repo",
      fetchImpl: ((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
      })) as typeof fetch,
    });
    await expect(client.abort("ses_1", 10)).resolves.toBe(false);
  });

  it("waits for delegated sessions as well as the parent to become idle", async () => {
    let polls = 0;
    const client = clientWith(() => new Response(JSON.stringify(
      ++polls === 1 ? { child: { type: "busy" } } : {},
    )));
    await expect(client.waitIdle()).resolves.toBe(true);
    expect(polls).toBe(2);
  });

  it("does not treat a busy or unreachable server as idle", async () => {
    await expect(clientWith(() => new Response('{"child":{"type":"busy"}}'))
      .waitIdle(10)).resolves.toBe(false);
    await expect(clientWith(() => new Response("unavailable", { status: 503 }))
      .waitIdle()).resolves.toBe(false);
  });

  it("reports whether OpenCode accepted the abort request", async () => {
    const accepted = clientWith(() => new Response("true", { status: 200 }));
    const refused = clientWith(() => new Response("busy", { status: 503 }));
    const unreachable = clientWith(() => {
      throw new Error("connection lost");
    });

    await expect(accepted.abort("ses_1")).resolves.toBe(true);
    await expect(refused.abort("ses_1")).resolves.toBe(false);
    await expect(unreachable.abort("ses_1")).resolves.toBe(false);
  });
});

describe("le flux d'events", () => {
  it("lit une frame SSE", () => {
    expect(parseFrame('data: {"type":"session.idle"}')).toEqual({ type: "session.idle" });
  });

  it("ignore ce qui n'est pas un événement, sans lever", () => {
    // A third-party stream that sends a ping, a comment, or an unreadable frame
    // must not kill a two-hour turn.
    expect(parseFrame(": ping")).toBeNull();
    expect(parseFrame("data: pas du json")).toBeNull();
    expect(parseFrame('data: {"sans":"type"}')).toBeNull();
    expect(parseFrame("")).toBeNull();
  });

  it("rend les événements d'un flux découpé n'importe comment", async () => {
    // Frames arrive in socket chunks, not clean lines.
    const chunks = ['data: {"type":"a"}\n', '\ndata: {"ty', 'pe":"b"}\n\n'];
    const client = clientWith(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );
    const seen: string[] = [];
    for await (const event of client.events()) seen.push(event.type);
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("la santé du serveur", () => {
  it("ne lève pas quand le serveur n'écoute pas encore", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://127.0.0.1:4096",
      directory: "/repo",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });
    expect(await client.healthy()).toBe(false);
    // And the wait returns `false` instead of looping: it's the caller who decides
    // what to say about a server that will never start.
    expect(await client.waitHealthy(30, async () => {})).toBe(false);
  });

  it("ne reste pas pendue à une connexion acceptée mais sans réponse", async () => {
    /**
 * THE FAULT OF THE FIRST PRODUCTION RUN (2026-08-12). On a new microVM,
 * the server accepts the connection well before knowing how to respond. Without ceiling
 * by probe, the `fetch` waits for the `headersTimeout` from undici — 300 s — and the
 * deadline of `waitHealthy` no longer means anything: the run died at
 * 6 min 30 on a message which announced 60 s.
 *
 * What this test keeps is that the probe ABORTS: we give it a
 * `fetch` which never returns, and the wait must still return `false`.
 */
    const client = new OpencodeClient({
      baseUrl: "http://127.0.0.1:4096",
      directory: "/repo",
      fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("TimeoutError")));
        })) as typeof fetch,
    });
    expect(await client.healthy(20)).toBe(false);
  });
});
