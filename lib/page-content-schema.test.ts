// @vitest-environment jsdom
//
// Le garde-fou de la PORTE d'écriture des pages (MIN-350).
//
// Deux choses, et la première est celle qui se périme : `lib/page-content-schema.ts`
// écrit à la main la liste des nœuds, des marques et de leurs attributs, parce
// qu'un serveur ne peut pas monter un éditeur tiptap à chaque sauvegarde pour la
// demander au registre. Cette liste doit donc être tenue égale au registre — et
// c'est ce fichier qui la tient, en montant le VRAI schéma sous jsdom, comme
// lib/pages-blocks.test.ts.
//
// Un bloc ajouté sans son entrée dans la liste fait tomber ce test. C'est la
// seule façon d'avoir les deux : une validation qui ne coûte rien à l'écriture,
// et une liste qui ne dérive pas.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  PAGE_MARK_ATTRIBUTES,
  PAGE_NODE_ATTRIBUTES,
  checkPageContent,
  isSafePageUrl,
} from "@/lib/page-content-schema";

function schema() {
  const editor = new Editor({ extensions: pageExtensions({ headless: true }) });
  const nodes: Record<string, string[]> = {};
  for (const [name, type] of Object.entries(editor.schema.nodes)) {
    nodes[name] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  const marks: Record<string, string[]> = {};
  for (const [name, type] of Object.entries(editor.schema.marks)) {
    marks[name] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  editor.destroy();
  return { nodes, marks };
}

function sorted(table: Record<string, readonly string[]>) {
  return Object.fromEntries(
    Object.entries(table).map(([name, attrs]) => [name, [...attrs].sort()])
  );
}

describe("la liste écrite à la main et le registre", () => {
  it("disent exactement les mêmes nœuds et les mêmes attributs", () => {
    expect(sorted(PAGE_NODE_ATTRIBUTES)).toEqual(schema().nodes);
  });

  it("disent exactement les mêmes marques et les mêmes attributs", () => {
    expect(sorted(PAGE_MARK_ATTRIBUTES)).toEqual(schema().marks);
  });
});

describe("les adresses", () => {
  it("accepte ce que minddy sert et ce qu'un auteur cite légitimement", () => {
    // Nos fichiers sont RELATIFS (lib/page-files.ts), et une image externe est
    // un cas normal et documenté (blocks/image.ts).
    expect(isSafePageUrl("/api/projects/x/pages/files/y")).toBe(true);
    expect(isSafePageUrl("https://exemple.org/graphe.png")).toBe(true);
    expect(isSafePageUrl("//exemple.org/graphe.png")).toBe(true);
    expect(isSafePageUrl("mailto:contact@minddy.app")).toBe(true);
  });

  it("refuse un protocole qui exécute, blancs et casse compris", () => {
    expect(isSafePageUrl("javascript:alert(1)")).toBe(false);
    // Les navigateurs suivent celles-ci : la normalisation retire blancs et
    // caractères de contrôle AVANT de lire le protocole.
    expect(isSafePageUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafePageUrl(" JavaScript:alert(1)")).toBe(false);
    expect(isSafePageUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafePageUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafePageUrl("blob:https://minddy.app/abc")).toBe(false);
    expect(isSafePageUrl("")).toBe(false);
    expect(isSafePageUrl(null)).toBe(false);
  });
});

describe("le corps", () => {
  it("refuse tout le document dès qu'une adresse est hostile", () => {
    expect(
      checkPageContent({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } },
        ],
      })
    ).toEqual({ ok: false, reason: "unsafe-url" });
  });

  it("refuse un `href` de marque hostile aussi", () => {
    expect(
      checkPageContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "clique",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      })
    ).toEqual({ ok: false, reason: "unsafe-url" });
  });

  it("refuse un nœud et une marque que personne ne sait rendre", () => {
    expect(
      checkPageContent({ type: "doc", content: [{ type: "script" }] })
    ).toEqual({ ok: false, reason: "unknown-node" });
    expect(
      checkPageContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "onclick" }] }],
          },
        ],
      })
    ).toEqual({ ok: false, reason: "unknown-node" });
  });

  it("refuse une racine qui n'est pas un document", () => {
    expect(checkPageContent({ type: "paragraph" })).toEqual({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("RETIRE un attribut inconnu au lieu de refuser la page", () => {
    // C'est déjà ce que fait ProseMirror en chargeant le document ; refuser
    // rendrait tout déploiement de l'éditeur capable de bloquer un onglet resté
    // ouvert sur la version d'avant.
    const checked = checkPageContent({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/api/x", alt: "a", onerror: "alert(1)" },
        },
      ],
    });
    expect(checked).toMatchObject({ ok: true });
    expect(checked.ok && checked.content).toEqual({
      type: "doc",
      content: [{ type: "image", attrs: { src: "/api/x", alt: "a" } }],
    });
  });

  it("laisse un document ordinaire intact", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "b1" },
          content: [
            {
              type: "text",
              text: "minddy",
              marks: [
                { type: "bold" },
                { type: "link", attrs: { href: "https://www.minddy.app" } },
              ],
            },
          ],
        },
      ],
    };
    const checked = checkPageContent(doc);
    expect(checked).toEqual({ ok: true, content: doc });
  });
});
