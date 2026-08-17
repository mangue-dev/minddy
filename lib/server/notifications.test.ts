import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { NOTIF_COMMENT_META_KEY, NOTIF_PAGE_META_KEY } from "@/lib/notification-prefs";

/**
 * MIN-183 — le branchement du push sur le point d'insertion des notifications.
 *
 * Ce que ce test protège n'est pas l'envoi (couvert par `push/send.test.ts`)
 * mais les trois conditions du branchement, dont aucune ne se voit en essayant
 * l'app :
 *
 *   • le push suit `kept`, APRÈS le filtre de préférences (MIN-82) — une
 *     catégorie coupée doit taire les DEUX surfaces. Un jour où quelqu'un
 *     déplacerait l'appel avant le filtre, l'inbox resterait muette et le
 *     téléphone sonnerait quand même : exactement le bug qu'on ne remarque
 *     qu'en le subissant ;
 *   • le push ne part QUE si l'insert a réussi — sinon une notification qu'on
 *     n'a pas su écrire sonnerait sur un téléphone en laissant l'inbox vide ;
 *   • `afterOrNow` et non un `void` détaché : la moitié des producteurs tournent
 *     hors requête (cf. lib/server/after-safe.ts).
 */

const H = vi.hoisted(() => ({
  after: vi.fn<(fn: () => void | Promise<void>) => void>(),
  // Signatures explicites : sans elles, `mock.calls` est typé sur un tuple vide
  // et lire `c[1]` ne compile pas.
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
  buildPushPayload: vi.fn(() => ({ title: "T", body: "B", url: "/u", tag: "/u" })),
}));

vi.mock("next/server", () => ({ after: H.after }));
vi.mock("./push/send", () => ({ sendPushToUser: H.sendPushToUser }));
vi.mock("./push/payload", () => ({
  loadPushContext: H.loadPushContext,
  buildPushPayload: H.buildPushPayload,
}));

const { insertNotifications } = await import("./notifications");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

/** Client Supabase minimal : l'insert réussit ou échoue sur commande, et les
 *  préférences de chaque compte sortent de la table ci-dessous. */
function stubService(opts: {
  insertError?: string;
  prefs?: Record<string, Record<string, unknown>>;
}) {
  const inserted: unknown[] = [];
  const service = {
    from: () => ({
      insert: (rows: unknown[]) => {
        inserted.push(...rows);
        return Promise.resolve({
          error: opts.insertError ? { message: opts.insertError } : null,
        });
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
  return { service, inserted };
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

/** Exécute ce qu'`afterOrNow` a mis en attente. */
async function runScheduledWork() {
  for (const fn of H.after.mock.calls.map((c) => c[0])) await fn();
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");
  H.after.mockReset();
  H.sendPushToUser.mockClear();
  H.loadPushContext.mockClear();
  H.buildPushPayload.mockClear();
});

describe("insertNotifications — volet push (MIN-183)", () => {
  it("pousse vers chaque destinataire après un insert réussi", async () => {
    const { service, inserted } = stubService({});

    await insertNotifications(service, [commentRow(ALICE), commentRow(BOB)]);

    expect(inserted).toHaveLength(2);
    // Différé, pas sur le chemin critique.
    expect(H.sendPushToUser).not.toHaveBeenCalled();
    expect(H.after).toHaveBeenCalledTimes(1);

    await runScheduledWork();
    expect(H.sendPushToUser.mock.calls.map((c) => c[1])).toEqual([ALICE, BOB]);
    // Une seule hydratation pour tout le lot.
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

  // Une seule bascule, deux surfaces : « Commentaires » coupé chez Bob doit lui
  // épargner la ligne d'inbox ET la notification système.
  it("suit le filtre de préférences : pas de ligne, pas de push", async () => {
    const { service, inserted } = stubService({
      prefs: { [BOB]: { [NOTIF_COMMENT_META_KEY]: false } },
    });

    await insertNotifications(service, [commentRow(ALICE), commentRow(BOB)]);
    await runScheduledWork();

    expect(inserted).toHaveLength(1);
    expect(H.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(H.sendPushToUser.mock.calls[0][1]).toBe(ALICE);
  });

  // MIN-278 : les deux signaux du wiki passent par la même porte, donc par le
  // même filtre. Sans cette bascule, couper « Pages » aurait laissé passer les
  // citations — la moitié de ce qu'on voulait couper.
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

  it("ne programme rien du tout sans clés VAPID", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { service, inserted } = stubService({});

    await insertNotifications(service, [commentRow(ALICE)]);

    // L'inbox, elle, marche toujours : c'est tout le contrat de l'extinction.
    expect(inserted).toHaveLength(1);
    expect(H.after).not.toHaveBeenCalled();
  });
});
