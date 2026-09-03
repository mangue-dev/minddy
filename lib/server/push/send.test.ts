import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PushPayload } from "./payload";

/**
 * MIN-183 — maintenance of the subscription base.
 *
 * This behavior is invisible while trying the app. A subscription dies without
 * warning when the PWA is uninstalled, permission is revoked, or site data is
 * deleted, and the push service reports it only through a delivery status code.
 * A wrong policy either fills the table with dead rows shown as active devices,
 * or deletes healthy subscriptions after a transient incident.
 *
 * The four cases below ARE this policy.
 */

const H = vi.hoisted(() => ({
  send: vi.fn<(sub: unknown, payload: string, opts: unknown) => Promise<void>>(),
  sendApns: vi.fn(),
  sendWns: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn() },
}));
vi.mock("./apns", () => ({ sendApnsNotification: H.sendApns }));
vi.mock("./wns", () => ({ sendWnsNotification: H.sendWns }));
vi.mock("./web", () => ({ sendPinnedWebPushNotification: H.send }));

const { sendPushToUser } = await import("./send");

/** Error such as `web-push` raises: a `statusCode` on the object. */
const webPushError = (statusCode: number) =>
  Object.assign(new Error(`push failed: ${statusCode}`), { statusCode });

const PAYLOAD: PushPayload = {
  title: "MIN-42 · Repair the selector",
  body: "Alice commented",
  lang: "fr-FR",
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
  H.sendWns.mockReset();
});

describe("sendPushToUser", () => {
  it("sends and resets the failure counter", async () => {
    H.send.mockResolvedValue(undefined);
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

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

  it("routes a native device through APNs", async () => {
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

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally).toEqual({ sent: 1, gone: 0, failed: 0 });
    expect(H.sendApns).toHaveBeenCalledWith(`apns:${"ab".repeat(32)}`, PAYLOAD);
    expect(H.send).not.toHaveBeenCalled();
    expect(ops[0]).toMatchObject({
      table: "push_subscriptions",
      op: "update",
      args: { failure_count: 0 },
    });
  });

  it("purges a revoked APNs token", async () => {
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

    expect(await sendPushToUser(service, "u1", PAYLOAD)).toEqual({
      sent: 0,
      gone: 1,
      failed: 0,
    });
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  it("routes WNS and removes an expired channel", async () => {
    H.sendWns.mockResolvedValue({ status: 410, reason: "ChannelExpired" });
    const endpoint = "https://db5p.notify.windows.com/?token=expired";
    const { service, ops } = stubService([
      {
        id: "windows",
        endpoint,
        transport: "wns",
        p256dh: null,
        auth: null,
        locale: "en",
      },
    ]);

    expect(await sendPushToUser(service, "u1", PAYLOAD)).toEqual({
      sent: 0,
      gone: 1,
      failed: 0,
    });
    expect(H.sendWns).toHaveBeenCalledWith(endpoint, PAYLOAD, 86_400);
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  it("counts a transient WNS failure and retains the channel", async () => {
    H.sendWns.mockResolvedValue({ status: 503, reason: "Dropped" });
    const { service, ops } = stubService([
      {
        id: "windows",
        endpoint: "https://db5p.notify.windows.com/?token=retry",
        transport: "wns",
        p256dh: null,
        auth: null,
        locale: "en",
      },
    ]);

    expect(await sendPushToUser(service, "u1", PAYLOAD)).toEqual({
      sent: 0,
      gone: 0,
      failed: 1,
    });
    expect(ops).toEqual([
      { table: "push_subscriptions", op: "update", args: { failure_count: 3 } },
    ]);
  });

  // 404/410: the push service tells us that the subscription no longer exists. It is
  // permanent — the line will never again designate a reachable device.
  it.each([404, 410])("purges the row on %i", async (status) => {
    H.send.mockRejectedValue(webPushError(status));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 1, failed: 0 });
    expect(ops).toEqual([{ table: "push_subscriptions", op: "delete", args: null }]);
  });

  // 403: it is the SIGNATURE which is refused — our VAPID keys have changed under
  // subscription feet. The device is alive; deleting would erase the
  // proof of the problem and would force everyone to resubscribe.
  it("keeps the row on 403", async () => {
    H.send.mockRejectedValue(webPushError(403));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 1 });
    expect(ops).toEqual([]);
  });

  // 429 and 5xx are transient. Count the failure and keep the row.
  it.each([429, 500, 503])("increments and keeps the row on %i", async (status) => {
    H.send.mockRejectedValue(webPushError(status));
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 1 });
    expect(ops).toEqual([
      { table: "push_subscriptions", op: "update", args: { failure_count: 3 } },
    ]);
  });

  it("uses one account-localized payload across devices with stale locale values", async () => {
    H.send.mockResolvedValue(undefined);
    const { service } = stubService([
      { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", locale: "fr" },
      { id: "d2", endpoint: "https://push.example/2", p256dh: "k", auth: "a", locale: "fr-FR" },
      { id: "d3", endpoint: "https://push.example/3", p256dh: "k", auth: "a", locale: "en" },
    ]);
    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally.sent).toBe(3);
    expect(H.send.mock.calls.map((call) => JSON.parse(call[1]))).toEqual([
      PAYLOAD,
      PAYLOAD,
      PAYLOAD,
    ]);
  });

  it("sends only to the device selected by its persisted id", async () => {
    H.send.mockResolvedValue(undefined);
    const { service } = stubService([
      { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", locale: "fr" },
      { id: "d2", endpoint: "https://push.example/2", p256dh: "k", auth: "a", locale: "fr" },
    ]);

    const tally = await sendPushToUser(service, "u1", PAYLOAD, {
      onlyDeviceId: "d2",
    });

    expect(tally.sent).toBe(1);
    expect(H.send.mock.calls[0][0]).toMatchObject({
      endpoint: "https://push.example/2",
    });
  });

  it("does not push when the payload is null", async () => {
    const { service, ops } = stubService(ONE_DEVICE);
    const tally = await sendPushToUser(service, "u1", null);
    expect(tally).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(H.send).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  // Without keys, the app still runs and fills the inbox without touching push rows.
  it("shuts down cleanly without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { service, ops } = stubService(ONE_DEVICE);

    const tally = await sendPushToUser(service, "u1", PAYLOAD);

    expect(tally).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(H.send).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });
});
