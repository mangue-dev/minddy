import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { pagesKey } from "./use-pages-query";

/**
 * THE RUN THAT `hushPages` CLOSES (MIN-346).
 *
 * `usePagesQuery` is a hook: vitest runs in bare node, it cannot
 * mount it. What is being tested, however, is the MECHANISM on which the
 * patch relies — the exact order of the three `createPage` gestures, played here
 * on a real `QueryClient`, with a list query actually in flight.
 *
 * Without the `cancelQueries`, this file fails: the response left BEFORE the
 * creation overwrites the list upon arrival, and the new page disappears from the
 * tree a fraction of a second after appearing there. This is what the “+”
 * button on the secondary bar showed — nothing, without an error anywhere.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";

type Row = { id: string; title: string };

const BRIEF: Row = { id: "brief", title: "Brief initial" };
const CREATED: Row = { id: "neuve", title: "" };

/** A list whose response is held back, like a slow query in flight. */
function slowList(rows: Row[]) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    queryFn: async () => {
      await gate;
      return rows;
    },
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
  });
}

describe("créer une page pendant que la liste est en vol", () => {
  it("sans cancelQueries, la réponse d'avant efface la page créée", async () => {
    const client = makeClient();
    const list = slowList([BRIEF]); // the state BEFORE creation

    const inFlight = client.fetchQuery({
      queryKey: pagesKey(PROJECT),
      queryFn: list.queryFn,
    });
    client.setQueryData(pagesKey(PROJECT), [BRIEF]);

    // POST responded: we put the line rendered by the server.
    client.setQueryData(pagesKey(PROJECT), [BRIEF, CREATED]);
    // …and the request from before now arrives to him.
    list.release();
    await inFlight;

    const rows = client.getQueryData<Row[]>(pagesKey(PROJECT));
    // Demonstration of the bug: the new page is no longer there.
    expect(rows?.map((r) => r.id)).toEqual(["brief"]);
  });

  it("avec cancelQueries, la page créée tient", async () => {
    const client = makeClient();
    const list = slowList([BRIEF]);

    const inFlight = client
      .fetchQuery({ queryKey: pagesKey(PROJECT), queryFn: list.queryFn })
      // `cancelQueries` rejects the current fetch: that's the point, and
      // personne ne l'attendait.
      .catch(() => undefined);
    client.setQueryData(pagesKey(PROJECT), [BRIEF]);

    await client.cancelQueries({ queryKey: pagesKey(PROJECT) }); // hushPages
    client.setQueryData(pagesKey(PROJECT), [BRIEF, CREATED]);
    list.release();
    await inFlight;

    const rows = client.getQueryData<Row[]>(pagesKey(PROJECT));
    expect(rows?.map((r) => r.id)).toEqual(["brief", "neuve"]);
  });
});
