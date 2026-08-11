import { describe, expect, it } from "vitest";

import {
  fileDownloadHref,
  formatFileSize,
  pageFileIdFromSrc,
  pageFileIdsInBody,
  pageFileProjectFromSrc,
  pageFileStoragePrefix,
  pageFileUrl,
} from "@/lib/page-files";

/**
 * MIN-280 — l'adresse d'un fichier de page est un CONTRAT entre quatre endroits.
 *
 * Le nœud du bloc l'écrit, la projection markdown la recopie, la route la relit
 * pour servir les octets, et le ménage la cherche dans les corps pour savoir ce
 * qui est encore vivant. Aucun de ces quatre ne peut vérifier les trois autres :
 * si la forme change d'un côté, la seule chose qui se passe est qu'un balayage
 * nocturne cesse de reconnaître des fichiers vivants — et les supprime.
 *
 * C'est le pire défaut possible de ce sujet, et il est silencieux. D'où ce test,
 * qui joue les deux sens sur la MÊME forme.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const FILE = "11111111-1111-4111-8111-111111111111";

describe("l'adresse d'un fichier de page", () => {
  it("se relit dans les deux sens", () => {
    const url = pageFileUrl(PROJECT, FILE);
    expect(pageFileIdFromSrc(url)).toBe(FILE);
    expect(pageFileProjectFromSrc(url)).toBe(PROJECT);
  });

  it("ne reconnaît pas une adresse qui n'est pas la sienne", () => {
    // Une image EXTERNE est un cas normal, pas une erreur : elle ne coûte rien
    // au bucket, donc elle n'a rien à faire dans le ménage.
    for (const src of [
      "https://exemple.org/capture.png",
      "/api/attachments/file?path=projects/x/y/f.png",
      `/api/projects/${PROJECT}/pages/${FILE}`,
      "",
      null,
      42,
    ]) {
      expect(pageFileIdFromSrc(src), String(src)).toBeNull();
    }
  });

  it("range les octets sous le préfixe du PROJET", () => {
    // Et non sous un préfixe `pages/` à la racine : c'est ce qui fait que la
    // politique d'insertion du storage et la porte de lecture des ressources
    // valent déjà, sans une branche de plus (cf. la migration).
    expect(pageFileStoragePrefix(PROJECT, "page-1")).toBe(
      `projects/${PROJECT}/pages/page-1`
    );
  });
});

describe("les fichiers cités par un corps", () => {
  const body = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Voici :" }] },
      { type: "image", attrs: { src: pageFileUrl(PROJECT, FILE), alt: "Une capture" } },
      {
        type: "details",
        content: [
          {
            type: "detailsContent",
            content: [
              {
                type: "pageFile",
                attrs: {
                  src: pageFileUrl(PROJECT, "22222222-2222-4222-8222-222222222222"),
                  name: "rapport.pdf",
                },
              },
            ],
          },
        ],
      },
      { type: "image", attrs: { src: "https://exemple.org/graphe.png" } },
    ],
  };

  it("les trouve, y compris IMBRIQUÉS dans un autre bloc", () => {
    // Un fichier posé dans un dépliant est le cas qui casse une lecture au
    // premier niveau — et c'est exactement le fichier que le ménage effacerait.
    expect([...pageFileIdsInBody(body)].sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("ne voit rien dans un corps vide ou absent", () => {
    expect(pageFileIdsInBody(null).size).toBe(0);
    expect(pageFileIdsInBody({ type: "doc", content: [] }).size).toBe(0);
  });
});

describe("le poids affiché", () => {
  it("se lit d'un coup d'œil", () => {
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(820)).toBe("820 B");
    expect(formatFileSize(1_400)).toBe("1.4 kB");
    expect(formatFileSize(2_400_000)).toBe("2.4 MB");
    // Au-delà de dix unités, la décimale n'apprend plus rien.
    expect(formatFileSize(24_000_000)).toBe("24 MB");
  });
});

describe("fileDownloadHref", () => {
  const url = pageFileUrl(
    "07b14964-0def-4941-8ddf-686572d6345d",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  );

  it("demande la pièce jointe à l'adresse d'application", () => {
    expect(fileDownloadHref(url)).toBe(`${url}?download=1`);
  });

  it("laisse INTACTE une URL signée (MIN-283)", () => {
    // Elle porte déjà sa disposition : un second `download` fait répondre 400
    // au storage — « querystring/download must be string ».
    const signed = "https://xyz.supabase.co/storage/v1/object/sign/a.pdf?token=abc&download=rapport.pdf";
    expect(fileDownloadHref(signed)).toBe(signed);
  });
});
