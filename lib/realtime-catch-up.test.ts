import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATCH_UP_COALESCE_MS,
  createCatchUpQueue,
  matchesCatchUpScope,
} from "./realtime-catch-up";

/**
 * Le périmètre de rattrapage, en réduction : des clés exactes, des clés-préfixes
 * partagées entre projets, et des agrégats à clé composée.
 */
const SCOPE = [
  ["notifications"],
  ["views", "global"],
  ["issues", "p1"],
  ["comments"],
  ["me", "board"],
];

/**
 * Ce qu'un cache réel contient au bout d'une journée : des requêtes visées par
 * un préfixe, des requêtes visées à l'identique, et des voisines qui ne doivent
 * PAS bouger — dont celles dont la clé commence par la même chaîne sans être
 * le même préfixe (`["views", "p2"]` face à `["views", "global"]`).
 */
const CACHE_KEYS = [
  ["notifications"],
  ["notifications", "unread"],
  ["views", "global"],
  ["views", "p2"],
  ["issues", "p1"],
  ["issues", "p1", "todo"],
  ["issues", "p2"],
  ["comments", "i1"],
  ["comments", "i2"],
  ["me", "board"],
  ["me", "cycle"],
  ["billing"],
  ["projects"],
];

/** Ce que la boucle d'origine invalidait — une clé après l'autre, en préfixe. */
function invalidatedByLoop(scope: unknown[][], cacheKeys: unknown[][]) {
  const hit = new Set<string>();
  for (const key of scope) {
    for (const cacheKey of cacheKeys) {
      const isPrefix =
        cacheKey.length >= key.length &&
        key.every((part, i) => Object.is(part, cacheKey[i]));
      if (isPrefix) hit.add(JSON.stringify(cacheKey));
    }
  }
  return hit;
}

describe("matchesCatchUpScope", () => {
  it("couvre exactement ce que couvrait la boucle clé-par-clé", () => {
    const wanted = new Set(SCOPE.map((k) => JSON.stringify(k)));
    const byPredicate = new Set(
      CACHE_KEYS.filter((k) => matchesCatchUpScope(k, wanted)).map((k) =>
        JSON.stringify(k)
      )
    );
    expect([...byPredicate].sort()).toEqual(
      [...invalidatedByLoop(SCOPE, CACHE_KEYS)].sort()
    );
  });

  it("ne matche pas un préfixe seulement partiel", () => {
    const wanted = new Set([JSON.stringify(["views", "global"])]);
    expect(matchesCatchUpScope(["views", "p2"], wanted)).toBe(false);
    expect(matchesCatchUpScope(["views"], wanted)).toBe(false);
  });
});

describe("createCatchUpQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ne balaie qu'une fois pour toute la volée de rejoins", () => {
    vi.useFakeTimers();
    const flushes: ((k: readonly unknown[]) => boolean)[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));

    // Une coupure ferme tous les canaux d'un coup ; les rejoins arrivent au fil
    // des ACK, chacun avec son propre périmètre.
    queue.push([["issues", "p1"], ["comments"]]);
    vi.advanceTimersByTime(20);
    queue.push([["issues", "p2"], ["comments"]]);
    vi.advanceTimersByTime(20);
    queue.push([["notifications"]]);
    expect(flushes).toHaveLength(0);

    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);
    expect(flushes).toHaveLength(1);

    // …et le balayage unique couvre les trois périmètres empilés.
    const matches = flushes[0];
    expect(matches(["issues", "p1"])).toBe(true);
    expect(matches(["issues", "p2", "todo"])).toBe(true);
    expect(matches(["comments", "i1"])).toBe(true);
    expect(matches(["notifications"])).toBe(true);
    expect(matches(["billing"])).toBe(false);
  });

  it("repart à zéro après un balayage", () => {
    vi.useFakeTimers();
    const flushes: ((k: readonly unknown[]) => boolean)[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));

    queue.push([["issues", "p1"]]);
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);
    queue.push([["notifications"]]);
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);

    expect(flushes).toHaveLength(2);
    expect(flushes[1](["issues", "p1"])).toBe(false);
    expect(flushes[1](["notifications"])).toBe(true);
  });

  it("ne balaie rien après un démontage", () => {
    vi.useFakeTimers();
    const flushes: unknown[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));
    queue.push([["issues", "p1"]]);
    queue.cancel();
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS * 10);
    expect(flushes).toHaveLength(0);
  });
});

describe("sur un vrai QueryClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Le piège du ticket : la couverture doit être identique, pas seulement plus
   * rapide. On le vérifie sur le vrai `invalidateQueries` — requêtes INACTIVES
   * comprises, puisque c'est ce que `type: "active"` aurait cassé.
   */
  it("marque les mêmes requêtes que la boucle, actives et inactives", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    for (const key of CACHE_KEYS) {
      client.setQueryData(key, { value: 1 });
    }
    const expected = invalidatedByLoop(SCOPE, CACHE_KEYS);
    const wanted = new Set(SCOPE.map((k) => JSON.stringify(k)));

    await client.invalidateQueries({
      predicate: (query) => matchesCatchUpScope(query.queryKey, wanted),
    });

    const stale = new Set(
      client
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.isInvalidated)
        .map((q) => JSON.stringify(q.queryKey))
    );
    expect([...stale].sort()).toEqual([...expected].sort());
    client.clear();
  });
});
