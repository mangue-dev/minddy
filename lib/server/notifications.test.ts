import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { NOTIF_COMMENT_META_KEY, NOTIF_PAGE_META_KEY } from "@/lib/notification-prefs";

/**
 * MIN-183 — the connection of the push to the notification insertion point.
 *
 * What this test protects is not the sending (covered by `push/send.test.ts`)
 * but the three conditions of the connection, none of which are visible in trying
 * the app:
 *
 * • the push follows `kept`, AFTER the preferences filter (MIN-82) — a cut
 * category must silence BOTH surfaces. One day when someone
 * moved the call before the filter, the inbox would remain silent and the
 * phone would still ring: exactly the bug that we only notice
 * by undergoing it;
 * • the push ONLY goes off if the insert was successful — otherwise a notification that one
 * did not know how to write would ring on a telephone leaving the inbox empty;
 * • `afterOrNow` and not a detached `void`: half of the producers turn
 * outside the request (cf. lib/server/after-safe.ts).
 */

const H = vi.hoisted(() => ({
  after: vi.fn<(fn: () => void | Promise<void>) => void>(),
  // Explicit signatures: without them, `mock.calls` is typed on an empty tuple
  // and reading `c[1]` doesn't compile.
  sendPushToUser: vi.fn<
    (
      service: unknown,
      userId: string,
      payloadFor: unknown
    ) => Promise<{ sent: number; gone: number; failed: number }>
  >(async () => ({ sent: 1, gone: 0, failed: 0 })),
  loadPushContext: vi.fn<(service: unknown, rows: unknown) => Promise<never>>(
    async () => ({}) as never
  ),
  toPushLocale: vi.fn((raw: string | null | undefined) => {
    if (raw?.toLowerCase().startsWith("fr")) return "fr";
    if (raw?.toLowerCase().startsWith("de")) return "de";
    return "en";
  }),
  buildPushPayload: vi.fn<
    (context: unknown, row: unknown, locale: string) => {
      title: string;
      body: string;
      lang: string;
      url: string;
      tag: string;
    }
  >(() => ({
    title: "T",
    body: "B",
    lang: "en-GB",
    url: "/u",
    tag: "/u",
  })),
}));

vi.mock("next/server", () => ({ after: H.after }));
vi.mock("./push/send", () => ({ sendPushToUser: H.sendPushToUser }));
vi.mock("./push/payload", () => ({
  loadPushContext: H.loadPushContext,
  buildPushPayload: H.buildPushPayload,
  toPushLocale: H.toPushLocale,
}));

const { insertNotifications } = await import("./notifications");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

/** Minimal Supabase Client: The insert succeeds or fails on command, and each account's
 * preferences come out of the table below. */
function stubService(opts: {
  insertError?: string;
  upsertedRows?: unknown[];
  prefs?: Record<string, Record<string, unknown>>;
}) {
  const inserted: unknown[] = [];
  const upserted: unknown[] = [];
  const service = {
    from: () => ({
      insert: (rows: unknown[]) => {
        inserted.push(...rows);
        return Promise.resolve({
          error: opts.insertError ? { message: opts.insertError } : null,
        });
      },
      upsert: (rows: unknown[], options: unknown) => {
        upserted.push({ rows, options });
        return {
          select: () =>
            Promise.resolve({
              data: opts.upsertedRows ?? rows,
              error: opts.insertError ? { message: opts.insertError } : null,
            }),
        };
      },
    }),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: { id, user_metadata: opts.prefs?.[id] ?? {} } },
            error: null,
          }),
      },
    },
  } as unknown as SupabaseClient;
  return { service, inserted, upserted };
}

const pageMentionRow = (userId: string) => ({
  user_id: userId,
  project_id: "p1",
  type: "page_mention" as const,
  issue_id: null,
  page_id: "page-1",
  block_id: "b2",
  actor_id: "someone",
});

const commentRow = (userId: string) => ({
  user_id: userId,
  project_id: "p1",
  type: "comment" as const,
  issue_id: "i1",
  actor_id: "someone",
});

const pullRequestOpenedRow = (userId: string) => ({
  user_id: userId,
  project_id: "p1",
  type: "pr_opened" as const,
  issue_id: null,
  pull_request_id: "pr-1",
  actor_id: null,
});

/** Executes what `afterOrNow` has queued. */
async function runScheduledWork() {
  for (const fn of H.after.mock.calls.map((c) => c[0])) await fn();
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("MINDDY_PUBLIC_VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");
  H.after.mockReset();
  H.sendPushToUser.mockClear();
  H.loadPushContext.mockClear();
  H.buildPushPayload.mockClear();
  H.toPushLocale.mockClear();
});

describe("insertNotifications — volet push (MIN-183)", () => {
  it("pushes to each recipient after a successful insert", async () => {
    const { service, inserted } = stubService({
      prefs: {
        [ALICE]: { locale: "fr" },
        [BOB]: { locale: "de-DE" },
      },
    });

    await insertNotifications(service, [commentRow(ALICE), commentRow(BOB)]);

    expect(inserted).toHaveLength(2);
    // Deferred, not on critical path.
    expect(H.sendPushToUser).not.toHaveBeenCalled();
    expect(H.after).toHaveBeenCalledTimes(1);

    await runScheduledWork();
    expect(H.sendPushToUser.mock.calls.map((c) => c[1])).toEqual([ALICE, BOB]);
    expect(H.buildPushPayload.mock.calls.map((call) => call[2])).toEqual([
      "fr",
      "de",
    ]);
    // Just one hydration for the whole lot.
    expect(H.loadPushContext).toHaveBeenCalledTimes(1);
  });

  it("ne pousse RIEN quand l'insert a échoué", async () => {
    const { service } = stubService({ insertError: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await insertNotifications(service, [commentRow(ALICE)]);
    await runScheduledWork();

    expect(H.after).not.toHaveBeenCalled();
    expect(H.sendPushToUser).not.toHaveBeenCalled();
  });

  // A single rocker, two surfaces: “Comments” cut at Bob must him
  // spare the inbox line AND the system notification.
  it("follows the preference filter: no row, no push", async () => {
    const { service, inserted } = stubService({
      prefs: { [BOB]: { [NOTIF_COMMENT_META_KEY]: false } },
    });

    await insertNotifications(service, [commentRow(ALICE), commentRow(BOB)]);
    await runScheduledWork();

    expect(inserted).toHaveLength(1);
    expect(H.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(H.sendPushToUser.mock.calls[0][1]).toBe(ALICE);
  });

  // MIN-278: the two signals from the wiki pass through the same door, therefore through the
  // same filter. Without this toggle, cutting “Pages” would have missed the
  // quotes — half of what we wanted to cut.
  it("respecte la bascule « Pages » comme n'importe quelle autre", async () => {
    const { service, inserted } = stubService({
      prefs: { [BOB]: { [NOTIF_PAGE_META_KEY]: false } },
    });

    await insertNotifications(service, [pageMentionRow(ALICE), pageMentionRow(BOB)]);
    await runScheduledWork();

    expect(inserted).toHaveLength(1);
    expect(H.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(H.sendPushToUser.mock.calls[0][1]).toBe(ALICE);
  });

  it("schedules nothing without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { service, inserted } = stubService({});

    await insertNotifications(service, [commentRow(ALICE)]);

    // The inbox still works: it's the whole contract of extinction.
    expect(inserted).toHaveLength(1);
    expect(H.after).not.toHaveBeenCalled();
  });

  it("does not push an opening that the database already recorded", async () => {
    const { service, inserted, upserted } = stubService({ upsertedRows: [] });

    await insertNotifications(service, [pullRequestOpenedRow(ALICE)], {
      deduplicatePullRequestOpened: true,
    });
    await runScheduledWork();

    expect(inserted).toEqual([]);
    expect(upserted).toEqual([
      {
        rows: [pullRequestOpenedRow(ALICE)],
        options: {
          onConflict: "user_id,type,pull_request_id",
          ignoreDuplicates: true,
        },
      },
    ]);
    expect(H.after).not.toHaveBeenCalled();
    expect(H.sendPushToUser).not.toHaveBeenCalled();
  });
});
