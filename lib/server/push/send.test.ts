import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PushPayload } from "./payload";

/**
 * MIN-183 — l'entretien du parc d'abonnements.
 *
 * C'est la partie qu'on ne peut PAS voir en essayant l'app : un abonnement
 * meurt sans prévenir (PWA désinstallée, permission révoquée, données du site
 * effacées), et le service de push le dit une seule fois, par un code de statut,
 * au moment de l'envoi. Se tromper de politique ne se remarque jamais tout de
 * suite — soit la table se remplit de lignes mortes que la carte présente comme
 * des appareils actifs, soit on supprime des abonnements parfaitement vivants
 * sur un incident passager, et les gens cessent d'être notifiés sans le savoir.
 *
 * Les quatre cas ci-dessous SONT cette politique.
 */

const H = vi.hoisted(() => ({
  send: vi.fn<(sub: unknown, payload: string, opts: unknown) => Promise<void>>(),
  sendApns: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { sendNotification: H.send, setVapidDetails: vi.fn() },
}));
vi.mock("./apns", () => ({ sendApnsNotification: H.sendApns }));

const { sendPushToUser } = await import("./send");

/** Erreur telle que `web-push` la lève : un `statusCode` sur l'objet. */
const webPushError = (statusCode: number) =>
  Object.assign(new Error(`push failed: ${statusCode}`), { statusCode });

const PAYLOAD: PushPayload = {
  title: "MIN-42 · Réparer le sélecteur",
  body: "Alice a commenté",
  url: "/projects/p/?issue=i",
  tag: "/projects/p/?issue=i",
};

type Op = { table: string; op: string; args: unknown };

/** Client Supabase minimal : enregistre chaque écriture pour qu'on la relise. */
function stubService(subs: Record<string, unknown>[]) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: current, error: null }),
      update: (values: unknown) => {
        ops.push({ table, op: "update", args: values });
        return chain;
      },
      delete: () => {
        ops.push({ table, op: "delete", args: null });
        return chain;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: subs, error: null })),
    };
    return chain;
  };
  // La relecture de `failure_count` avant incrément.
  let current: Record<string, unknown> | null = { failure_count: 2 };
  return {
    service: { from } as unknown as SupabaseClient,
    ops,
    setCurrent: (v: Record<string, unknown> | null) => {
      current = v;
    },
  };
}

const ONE_DEVICE = [
  { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", locale: "fr" },
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");
  H.send.mockReset();
  H.sendApns.mockReset();
});

describe("sendPushToUser", () => {
  it("envoie, et remet le compteur d'échecs à zéro", async () => {
    H.send.mockResolvedValue(undefined);
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 1, gone: 0, failed: 0 });
    expect(H.send).toHaveBeenCalledTimes(1);
    // La charge utile part en JSON — c'est ce que `public/sw.js` parse.
    expect(JSON.parse(H.send.mock.calls[0][1])).toEqual(PAYLOAD);
    expect(H.send.mock.calls[0][2]).toMatchObject({ urgency: "normal" });
    expect(ops).toEqual([
      {
        table: "push_subscriptions",
        op: "update",
        args: expect.objectContaining({ failure_count: 0 }),
      },
    ]);
  });

  it("route un appareil natif vers APNs", async () => {
    H.sendApns.mockResolvedValue({ status: 200, reason: null });
    const { service, ops } = stubService([
      {
        id: "mac",
        endpoint: `apns:${"ab".repeat(32)}`,
        transport: "apns",
        p256dh: null,
        auth: null,
        locale: "fr",
      },
    ]);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 1, gone: 0, failed: 0 });
    expect(H.sendApns).toHaveBeenCalledWith(`apns:${"ab".repeat(32)}`, PAYLOAD);
    expect(H.send).not.toHaveBeenCalled();
    expect(ops[0]).toMatchObject({
      table: "push_subscriptions",
      op: "update",
      args: { failure_count: 0 },
    });
  });

  it("purge un token APNs révoqué", async () => {
    H.sendApns.mockResolvedValue({ status: 410, reason: "Unregistered" });
    const { service, ops } = stubService([
      {
        id: "mac",
        endpoint: `apns:${"cd".repeat(32)}`,
        transport: "apns",
        p256dh: null,
        auth: null,
        locale: "en",
      },
    ]);

    expect(await sendPushToUser(service, "u1", () => PAYLOAD)).toEqual({
      sent: 0,
      gone: 1,
      failed: 0,
    });
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  // 404/410 : le service de push nous dit que l'abonnement n'existe plus. C'est
  // définitif — la ligne ne désignera plus jamais un appareil joignable.
  it.each([404, 410])("PURGE la ligne sur un %i", async (status) => {
    H.send.mockRejectedValue(webPushError(status));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 1, failed: 0 });
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  // 403 : c'est la SIGNATURE qui est refusée — nos clés VAPID ont changé sous
  // les pieds des abonnements. L'appareil est vivant ; supprimer effacerait la
  // preuve du problème et forcerait tout le monde à se réabonner.
  it("GARDE la ligne sur un 403", async () => {
    H.send.mockRejectedValue(webPushError(403));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 1 });
    expect(ops).toEqual([]);
  });

  // 429 / 5xx : passager. On compte, on garde.
  it.each([429, 500, 503])("incrémente et garde sur un %i", async (status) => {
    H.send.mockRejectedValue(webPushError(status));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 1 });
    expect(ops).toEqual([
      { table: "push_subscriptions", op: "update", args: { failure_count: 3 } },
    ]);
  });

  it("ne construit la charge utile qu'UNE FOIS par langue, pas par appareil", async () => {
    H.send.mockResolvedValue(undefined);
    const { service } = stubService([
      { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", locale: "fr" },
      { id: "d2", endpoint: "https://push.example/2", p256dh: "k", auth: "a", locale: "fr-FR" },
      { id: "d3", endpoint: "https://push.example/3", p256dh: "k", auth: "a", locale: "en" },
    ]);
    // Signature explicite : sans elle, `mock.calls` est typé sur un tuple vide
    // et lire `c[0]` ne compile pas.
    const payloadFor = vi.fn<(locale: "fr" | "en") => PushPayload>(() => PAYLOAD);

    const tally = await sendPushToUser(service, "u1", payloadFor);

    expect(tally.sent).toBe(3);
    expect(payloadFor.mock.calls.map((c) => c[0]).sort()).toEqual(["en", "fr"]);
  });

  it("n'envoie qu'à l'appareil demandé avec `onlyEndpoint` (bouton d'essai)", async () => {
    H.send.mockResolvedValue(undefined);
    const { service } = stubService([
      { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", locale: "fr" },
      { id: "d2", endpoint: "https://push.example/2", p256dh: "k", auth: "a", locale: "fr" },
    ]);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD, {
      onlyEndpoint: "https://push.example/2",
    });

    expect(tally.sent).toBe(1);
    expect(H.send.mock.calls[0][0]).toMatchObject({
      endpoint: "https://push.example/2",
    });
  });

  it("ne pousse rien quand la charge utile est nulle (cible disparue)", async () => {
    const { service, ops } = stubService(ONE_DEVICE);
    const tally = await sendPushToUser(service, "u1", () => null);
    expect(tally).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(H.send).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  // Sans clés, l'app doit tourner : l'inbox se remplit, rien ne lève, on ne
  // touche même pas à la base.
  it("s'éteint proprement sans clés VAPID", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(H.send).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });
});
