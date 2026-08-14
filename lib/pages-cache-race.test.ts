import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { pagesKey } from "./use-pages-query";

/**
 * LA COURSE QUE `hushPages` FERME (MIN-346).
 *
 * `usePagesQuery` est un hook : vitest tourne en node nu, il ne peut pas le
 * monter. Ce qui se teste, en revanche, c'est le MÉCANISME sur lequel le
 * correctif repose — l'ordre exact des trois gestes de `createPage`, joués ici
 * sur un vrai `QueryClient`, avec une requête de liste réellement en vol.
 *
 * Sans le `cancelQueries`, ce fichier échoue : la réponse partie AVANT la
 * création écrase la liste en arrivant, et la page neuve disparaît de l'arbre
 * une fraction de seconde après y être apparue. C'est ce que le bouton « + »
 * de la barre secondaire donnait à voir — rien, sans une erreur nulle part.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";

type Row = { id: string; title: string };

const BRIEF: Row = { id: "brief", title: "Brief initial" };
const CREATED: Row = { id: "neuve", title: "" };

/** Une liste dont la réponse est retenue, comme une requête lente en vol. */
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
    const list = slowList([BRIEF]); // l'état d'AVANT la création

    const inFlight = client.fetchQuery({
      queryKey: pagesKey(PROJECT),
      queryFn: list.queryFn,
    });
    client.setQueryData(pagesKey(PROJECT), [BRIEF]);

    // Le POST a répondu : on pose la ligne rendue par le serveur.
    client.setQueryData(pagesKey(PROJECT), [BRIEF, CREATED]);
    // …et la requête partie avant lui arrive maintenant.
    list.release();
    await inFlight;

    const rows = client.getQueryData<Row[]>(pagesKey(PROJECT));
    // La démonstration du bug : la page neuve n'est plus là.
    expect(rows?.map((r) => r.id)).toEqual(["brief"]);
  });

  it("avec cancelQueries, la page créée tient", async () => {
    const client = makeClient();
    const list = slowList([BRIEF]);

    const inFlight = client
      .fetchQuery({ queryKey: pagesKey(PROJECT), queryFn: list.queryFn })
      // `cancelQueries` fait rejeter le fetch en cours : c'est le propos, et
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
