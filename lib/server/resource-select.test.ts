import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { joinedPage, resourceSummary } = await import("./resource-select");

/**
 * MIN-275 — the form in which an AGENT reads a resource.
 *
 * This is not field cosmetics: this form is the only thing that
 * tells Numo, the MCP and the code agent that a resource can be a PAGE
 * from the wiki. It was written three times (the ticket, the chat objectives, the
 * MCP) before being written once — and it is exactly from this dispersion that
 * the hole came: two of the three copies only knew the files and
 * the links, and a model learned the form shown to it.
 *
 * What this file holds, therefore:
 *
 * - a page returns `page_id` AND a title, that of the JOIN — otherwise a renamed
 * page would keep its old name on all the tickets which cite it;
 * - a file never returns its content: name, type, size, and nothing more;
 * - the PostgREST join arrives sometimes as an object, sometimes as an array, and the
 * both read the same.
 */

const PAGE_ROW = {
  id: "att-1",
  kind: "page",
  page_id: "page-9",
  // The photo taken at the time of attachment: it only serves as a backup.
  file_name: "Le titre d'avant",
  page: { id: "page-9", title: "Spec du board" },
};

describe("la forme d'une ressource pour un agent", () => {
  it("rend une PAGE avec son id et son titre vivant", () => {
    expect(resourceSummary(PAGE_ROW)).toEqual({
      id: "att-1",
      kind: "page",
      page_id: "page-9",
      title: "Spec du board",
    });
  });

  it("retombe sur le nom stocké quand la jointure n'a rien ramené", () => {
    // Session client + trashed page: the `pages_select` policy excludes it,
    // the join comes back empty. The pill must remain legible.
    expect(resourceSummary({ ...PAGE_ROW, page: null })).toMatchObject({
      title: "Le titre d'avant",
    });
  });

  it("signale une page corbeillée quand la lecture est faite en clé service", () => {
    expect(
      resourceSummary({
        ...PAGE_ROW,
        page: { id: "page-9", title: "Spec du board", deleted_at: "2026-08-01" },
      })
    ).toMatchObject({ page_in_trash: true });
  });

  it("rend un LIEN avec son url, et son titre sous le nom `title`", () => {
    expect(
      resourceSummary({
        id: "att-2",
        kind: "link",
        url: "https://minddy.app",
        file_name: "minddy",
      })
    ).toEqual({
      id: "att-2",
      kind: "link",
      url: "https://minddy.app",
      title: "minddy",
    });
  });

  it("rend un FICHIER en métadonnées seules — jamais ses octets", () => {
    const file = resourceSummary({
      id: "att-3",
      kind: "file",
      file_name: "capture.png",
      mime_type: "image/png",
      size_bytes: 4096,
      url: "https://storage/interne",
    });
    expect(file).toEqual({
      id: "att-3",
      kind: "file",
      file_name: "capture.png",
      mime_type: "image/png",
      size_bytes: 4096,
    });
    // The internal storage URL does not go out: the bytes go through a URL
    // signed, requested separately.
    expect(file).not.toHaveProperty("url");
  });
});

describe("la jointure de page", () => {
  it("se lit en objet comme en tableau", () => {
    const page = { id: "p", title: "T" };
    expect(joinedPage(page)).toEqual(page);
    expect(joinedPage([page])).toEqual(page);
    expect(joinedPage([])).toBeNull();
    expect(joinedPage(null)).toBeNull();
  });
});
