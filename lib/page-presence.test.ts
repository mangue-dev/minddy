import { describe, expect, it, vi } from "vitest";

import {
  openPagePresence,
  pagePresenceTopic,
  type PagePresenceMap,
} from "./page-presence";

/**
 * MIN-271 — le CYCLE DE VIE de l'abonnement de présence.
 *
 * Ce que ce fichier attrape, et que ni `tsc` ni une relecture n'attrapent : un
 * abonnement qui monte et ne redescend jamais. On l'a déjà livré une fois (la
 * feature de la PR 48) — le code compilait, il se lisait bien, et le canal
 * restait ouvert pour toujours. La seule preuve possible est de monter, de
 * démonter, et de regarder ce qui a été appelé.
 *
 * Le décor est un faux client Supabase qui GARDE les callbacks passés à
 * `on` et à `subscribe` : c'est le seul moyen de rejouer un `sync` de présence
 * sans socket, comme `compact-path.test.ts` rejoue un flux SSE sans provider.
 */

type PresenceEntry = { userId: string; pageId: string };

function fakeSupabase() {
  const calls = {
    channels: [] as string[],
    tracked: [] as PresenceEntry[],
    untracked: 0,
    removed: 0,
  };
  let syncHandler: (() => void) | null = null;
  let state: Record<string, PresenceEntry[]> = {};

  const channel = {
    on(_type: string, _filter: unknown, handler: () => void) {
      syncHandler = handler;
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.("SUBSCRIBED");
      return channel;
    },
    presenceState: () => state,
    track: async (payload: PresenceEntry) => {
      calls.tracked.push(payload);
      return "ok";
    },
    untrack: async () => {
      calls.untracked += 1;
      return "ok";
    },
  };

  const client = {
    realtime: { setAuth: async () => undefined },
    channel: (topic: string) => {
      calls.channels.push(topic);
      return channel as never;
    },
    removeChannel: async () => {
      calls.removed += 1;
      return "ok" as never;
    },
  };

  return {
    client: client as never,
    calls,
    /** Rejoue un `sync` de présence avec l'état donné. */
    emit(next: Record<string, PresenceEntry[]>) {
      state = next;
      syncHandler?.();
    },
  };
}

describe("openPagePresence", () => {
  it("rejoint le canal du PROJET et s'y déclare sur la page ouverte", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    // Un canal, celui du projet — pas un par page.
    expect(supabase.calls.channels).toEqual([pagePresenceTopic("proj")]);
    expect(supabase.calls.tracked).toEqual([
      { userId: "moi", pageId: "page-1" },
    ]);
    handle.close();
  });

  it("redescend du canal au démontage", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    handle.close();

    // Les deux : `untrack` retire l'avatar chez les autres tout de suite,
    // `removeChannel` ferme l'abonnement.
    expect(supabase.calls.untracked).toBe(1);
    expect(supabase.calls.removed).toBe(1);

    // Et fermer deux fois (React monte/démonte deux fois en développement) ne
    // ferme pas deux fois.
    handle.close();
    expect(supabase.calls.removed).toBe(1);
  });

  it("ne rejoint RIEN quand on part avant que le token soit poussé", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    // Le démontage arrive dans le même tick que l'ouverture : c'est ce que fait
    // un clic rapide d'une page à l'autre, et c'est le chemin par lequel un
    // canal fantôme survit à son composant.
    handle.close();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabase.calls.channels).toEqual([]);
    expect(supabase.calls.removed).toBe(0);
  });

  it("change de page sans rejoindre un second canal", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.tracked).toHaveLength(1));

    handle.move("page-2");

    expect(supabase.calls.channels).toHaveLength(1);
    expect(supabase.calls.tracked.at(-1)).toEqual({
      userId: "moi",
      pageId: "page-2",
    });
    handle.close();
  });

  it("range les présents par page, un avatar par compte", async () => {
    const supabase = fakeSupabase();
    let seen: PagePresenceMap = new Map();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: (present) => {
        seen = present;
      },
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    supabase.emit({
      // Deux onglets du même compte sur la même page : un seul avatar.
      a: [{ userId: "moi", pageId: "page-1" }],
      b: [{ userId: "moi", pageId: "page-1" }],
      c: [{ userId: "elle", pageId: "page-1" }],
      d: [{ userId: "lui", pageId: "page-2" }],
    });

    expect(seen.get("page-1")).toEqual(["moi", "elle"]);
    expect(seen.get("page-2")).toEqual(["lui"]);
    handle.close();
  });
});
