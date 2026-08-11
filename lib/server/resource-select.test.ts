import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { joinedPage, resourceSummary } = await import("./resource-select");

/**
 * MIN-275 — la forme sous laquelle un AGENT lit une ressource.
 *
 * Ce n'est pas de la cosmétique de champ : cette forme est la seule chose qui
 * dise à Numo, au MCP et à l'agent de code qu'une ressource peut être une PAGE
 * du wiki. Elle a été écrite trois fois (le ticket, les objectifs du chat, le
 * MCP) avant d'être écrite une — et c'est exactement de cette dispersion que
 * venait le trou : deux des trois copies ne connaissaient que les fichiers et
 * les liens, et un modèle apprend la forme qu'on lui montre.
 *
 * Ce que ce fichier tient, donc :
 *
 *  - une page rend `page_id` ET un titre, celui de la JOINTURE — sans quoi une
 *    page renommée garderait son ancien nom sur tous les tickets qui la citent ;
 *  - un fichier ne rend jamais son contenu : nom, type, taille, et rien de plus ;
 *  - la jointure PostgREST arrive tantôt en objet, tantôt en tableau, et les
 *    deux se lisent pareil.
 */

const PAGE_ROW = {
  id: "att-1",
  kind: "page",
  page_id: "page-9",
  // La photo prise au moment de l'attachement : elle ne sert que de secours.
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
    // Client de session + page corbeillée : la policy `pages_select` l'exclut,
    // la jointure redescend vide. La pilule doit rester lisible.
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
    // L'url interne du stockage ne sort pas : les octets passent par une URL
    // signée, demandée à part.
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
