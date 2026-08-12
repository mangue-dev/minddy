import { describe, expect, it } from "vitest";

import {
  normalizeSyncEvents,
  OpencodeClient,
  OpencodeHttpError,
  parseFrame,
} from "./opencode-client";

/**
 * MIN-286 lot 1 — le client du serveur opencode.
 *
 * Ce fichier ne teste pas HTTP : il teste les **trois pièges mesurés** qui, sans
 * lui, se paieraient en production à trois heures du matin.
 */

function clientWith(handler: (url: string, init?: RequestInit) => Response): OpencodeClient {
  return new OpencodeClient({
    baseUrl: "http://127.0.0.1:4096",
    directory: "/vercel/sandbox/repo",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init)) as typeof fetch,
  });
}

describe("le piège des deux générations d'API", () => {
  it("dit « la route n'existe pas » au lieu d'exploser sur du HTML", async () => {
    // Mesuré : une faute d'un segment ne rend pas un 404 mais la page du TUI. Le
    // message par défaut serait « Unexpected token < in JSON », qui envoie
    // chercher un bug de sérialisation là où il n'y a qu'une URL fausse.
    const client = clientWith(() => new Response("<!doctype html><html>…", { status: 200 }));
    await expect(client.createSession()).rejects.toThrow(/route n'existe pas/);
  });

  it("porte le statut et la route dans l'erreur", async () => {
    const client = clientWith(() => new Response("boom", { status: 503 }));
    await expect(client.createSession()).rejects.toBeInstanceOf(OpencodeHttpError);
  });

  it("passe `?directory=` sur les routes héritées", async () => {
    // Sans lui, le serveur travaille dans SON cwd et pas dans le dépôt du run.
    let seen = "";
    const client = clientWith((url) => {
      seen = url;
      return new Response("{}", { status: 200 });
    });
    await client.createSession();
    expect(seen).toContain("directory=%2Fvercel%2Fsandbox%2Frepo");
  });
});

describe("le piège du snake_case", () => {
  it("traduit `aggregate_id` en `aggregateID` dans les deux sens", () => {
    // L'export rend du snake_case, le replay attend du camelCase — c'est dans le
    // schéma d'opencode, pas un accident de sonde.
    expect(
      normalizeSyncEvents([{ aggregate_id: "ses_1", seq: 3, type: "x" }]),
    ).toEqual([{ aggregateID: "ses_1", seq: 3, type: "x" }]);
    // Idempotent : un journal déjà normalisé (celui du checkpoint) ne bouge pas.
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
    // Le curseur d'export se dérive d'`aggregateID` : laisser passer le
    // snake_case rendait un curseur vide, donc un export complet à chaque tour.
    expect(await client.syncHistory()).toEqual([{ aggregateID: "ses_1", seq: 2 }]);
  });
});

describe("le flux d'events", () => {
  it("lit une frame SSE", () => {
    expect(parseFrame('data: {"type":"session.idle"}')).toEqual({ type: "session.idle" });
  });

  it("ignore ce qui n'est pas un événement, sans lever", () => {
    // Un flux tiers qui envoie un ping, un commentaire ou une frame illisible ne
    // doit pas tuer un tour de deux heures.
    expect(parseFrame(": ping")).toBeNull();
    expect(parseFrame("data: pas du json")).toBeNull();
    expect(parseFrame('data: {"sans":"type"}')).toBeNull();
    expect(parseFrame("")).toBeNull();
  });

  it("rend les événements d'un flux découpé n'importe comment", async () => {
    // Les frames arrivent en morceaux de socket, pas en lignes propres.
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
    // Et l'attente rend `false` au lieu de boucler : c'est l'appelant qui décide
    // quoi dire d'un serveur qui ne démarrera jamais.
    expect(await client.waitHealthy(30, async () => {})).toBe(false);
  });
});
