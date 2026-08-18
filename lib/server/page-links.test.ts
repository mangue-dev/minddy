import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-279 — the derivation of trackbacks, over two tables in memory.
 *
 * We ONLY mock what comes out of the process (`pages` and `page_links`): the real
 * `lib/server/page-links.ts` runs above, common scanner included. It is he
 * that we want to see rewrite an ENTIRE source, and refuse the two traps which
 * make a derived table lie:
 *
 * - the REMOVED quote which remains (the incremental diff which we refused);
 * - the page WITHOUT TITLE, whose empty label enters the alternation of
 * scan as a branch which matches the empty string — and then makes of
 * EACH “@” in the text a quote from the page that has just been opened.
 */

interface LinkRow {
  page_id: string;
  source_kind: string;
  source_id: string;
  project_id: string;
}

const h = vi.hoisted(() => ({
  pages: [] as Record<string, unknown>[],
  links: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase-service", () => {
  type Filter = (row: Record<string, unknown>) => boolean;

  const from = (table: string) => {
    const rows = () => (table === "pages" ? h.pages : h.links);
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "delete" = "select";
    let payload: Record<string, unknown>[] = [];

    const matching = () => rows().filter((row) => filters.every((f) => f(row)));

    const run = () => {
      if (mode === "delete") {
        for (const row of matching()) {
          rows().splice(rows().indexOf(row), 1);
        }
        return { data: null, error: null };
      }
      if (mode === "insert") {
        rows().push(...payload);
        return { data: payload, error: null };
      }
      return { data: matching(), error: null };
    };

    const api = {
      select: () => api,
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        mode = "insert";
        payload = Array.isArray(values) ? values : [values];
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      then: (
        resolve: (r: { data: unknown; error: null }) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  };

  return { getServiceClient: () => ({ from }) };
});

import { getServiceClient } from "@/lib/supabase-service";
import { citedPageIds, sourceText, syncPageBodyLinks, syncPageLinks } from "./page-links";

const service = getServiceClient();

/** A single paragraph ProseMirror document, as the editor writes it. */
const doc = (text: string) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "b1" },
      content: [{ type: "text", text }],
    },
  ],
});

beforeEach(() => {
  h.pages.length = 0;
  h.links.length = 0;
  h.pages.push(
    { id: "spec", project_id: "p1", title: "Spec API", icon: "📘", content: null },
    { id: "guide", project_id: "p1", title: "Guide", icon: null, content: null },
    // A NEW page, still without title: it cannot be cited, and above all it
    // should not be cited by anything bearing an at sign.
    { id: "draft", project_id: "p1", title: "", icon: null, content: null },
    // ANOTHER project: its titles do not enter p1's scanner.
    { id: "other", project_id: "p2", title: "Spec API", icon: null, content: null }
  );
});

const linksOf = (kind: string, id: string) =>
  (h.links as unknown as LinkRow[])
    .filter((row) => row.source_kind === kind && row.source_id === id)
    .map((row) => row.page_id)
    .sort();

describe("citedPageIds", () => {
  it("ne retient que les pages que le texte nomme", () => {
    const pages = [
      { id: "spec", project_id: "p1", title: "Spec API", icon: null },
      { id: "guide", project_id: "p1", title: "Guide", icon: null },
    ];
    expect(citedPageIds("cf. @Spec API et @Guide", pages).sort()).toEqual([
      "guide",
      "spec",
    ]);
    // Twice the same page = only one link: it's a state, not a counter.
    expect(citedPageIds("@Guide puis @Guide", pages)).toEqual(["guide"]);
    expect(citedPageIds("aucune citation ici", pages)).toEqual([]);
  });
});

describe("sourceText", () => {
  it("aplatit un corps de page, mention posée au sélecteur comprise", () => {
    const withNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "b1" },
          content: [
            { type: "text", text: "voir " },
            { type: "mention", attrs: { mentionLabel: "Spec API" } },
          ],
        },
      ],
    };
    expect(sourceText({ doc: withNode })).toContain("@Spec API");
  });
});

describe("syncPageLinks", () => {
  it("écrit les pages citées par une description de ticket", async () => {
    await syncPageLinks(
      service,
      { kind: "issue", id: "i1", projectId: "p1" },
      "on s'appuie sur @Spec API et sur @Guide"
    );
    expect(linksOf("issue", "i1")).toEqual(["guide", "spec"]);
  });

  it("réécrit la source EN ENTIER : une citation retirée disparaît", async () => {
    const source = { kind: "issue", id: "i1", projectId: "p1" } as const;
    await syncPageLinks(service, source, "@Spec API et @Guide");
    await syncPageLinks(service, source, "plus que @Guide");
    expect(linksOf("issue", "i1")).toEqual(["guide"]);

    await syncPageLinks(service, source, "et maintenant plus rien");
    expect(linksOf("issue", "i1")).toEqual([]);
  });

  it("ne touche pas aux liens des AUTRES sources", async () => {
    await syncPageLinks(service, { kind: "issue", id: "i1", projectId: "p1" }, "@Guide");
    await syncPageLinks(
      service,
      { kind: "objective", id: "o1", projectId: "p1" },
      "@Spec API"
    );
    await syncPageLinks(service, { kind: "issue", id: "i1", projectId: "p1" }, "");
    expect(linksOf("objective", "o1")).toEqual(["spec"]);
  });

  it("ne fait pas d'une page sans titre la cible de chaque arobase", async () => {
    await syncPageLinks(
      service,
      { kind: "issue", id: "i1", projectId: "p1" },
      "merci @Clément de regarder, cf. @Guide"
    );
    expect(linksOf("issue", "i1")).toEqual(["guide"]);
  });

  it("ne cite que dans son projet", async () => {
    await syncPageLinks(
      service,
      { kind: "issue", id: "i2", projectId: "p2" },
      "cf. @Spec API"
    );
    // The title exists on both sides: it is the page of p2 which must come out.
    expect(linksOf("issue", "i2")).toEqual(["other"]);
  });

  it("ne laisse pas une page se citer elle-même", async () => {
    await syncPageLinks(
      service,
      { kind: "page", id: "spec", projectId: "p1" },
      "cette page (@Spec API) parle de @Guide"
    );
    expect(linksOf("page", "spec")).toEqual(["guide"]);
  });
});

describe("syncPageBodyLinks", () => {
  it("relit le corps EN BASE plutôt que de croire l'appelant", async () => {
    const page = h.pages.find((row) => row.id === "guide")!;
    page.content = doc("tout part de @Spec API");

    await syncPageBodyLinks(service, ["guide"]);
    expect(linksOf("page", "guide")).toEqual(["spec"]);

    // Idempotent: replaying the derivation cannot make it diverge — it is
    // ce qui rend un rattrapage rejouable sans risque.
    await syncPageBodyLinks(service, ["guide"]);
    expect(linksOf("page", "guide")).toEqual(["spec"]);
  });
});
