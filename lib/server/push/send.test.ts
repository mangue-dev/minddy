import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PushPayload } from "./payload";

/**
 * MIN-183 — maintenance of the subscription base.
 *
 * This is the part that you CANNOT see when trying the app: a subscription
 * dies without warning (PWA uninstalled, permission revoked, site data
 * deleted), and the push service says it only once, by a status code,
 * at the time of sending. Getting the policy wrong is never noticed right away — either the table fills up with dead rows that the map presents as
 * active devices, or we delete perfectly alive subscriptions
 * on a passing incident, and people stop being notified without knowing it.
 *
 * The four cases below ARE this policy.
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

/** Error such as `web-push` raises: a `statusCode` on the object. */
const webPushError = (statusCode: number) =>
  Object.assign(new Error(`push failed: ${statusCode}`), { statusCode });

const PAYLOAD: PushPayload = {
  title: "MIN-42 · Réparer le sélecteur",
  body: "Alice a commenté",
  url: "/projects/p/?issue=i",
  tag: "/projects/p/?issue=i",
};

type Op = { table: string; op: string; args: unknown };

/** Minimal Supabase client: saves each writing for rereading. */
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
  // Rereading `failure_count` before increment.
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
  vi.stubEnv("MINDDY_PUBLIC_VAPID_PUBLIC_KEY", "public");
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
    // The payload leaves as JSON — that's what `public/sw.js` parses.
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

  // 404/410: the push service tells us that the subscription no longer exists. It is
  // permanent — the line will never again designate a reachable device.
  it.each([404, 410])("PURGE la ligne sur un %i", async (status) => {
    H.send.mockRejectedValue(webPushError(status));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 1, failed: 0 });
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  // 403: it is the SIGNATURE which is refused — our VAPID keys have changed under
  // subscription feet. The device is alive; deleting would erase the
  // proof of the problem and would force everyone to resubscribe.
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
    // Explicit signature: without it, `mock.calls` is typed on an empty tuple
    // and reading `c[0]` doesn't compile.
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

  // Without keys, the app must run: the inbox fills, nothing is raised, we do not
  // don't even touch the base.
  it("s'éteint proprement sans clés VAPID", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", () => PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(H.send).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });
});
