import { describe, expect, it } from "vitest";

import {
  exportFileName,
  exportPagesToFiles,
  pageFileSlug,
  relativePath,
} from "@/lib/pages-export";

/**
 * MIN-283 — exporting a branch. What this test pins is not the
 * markdown (MIN-269 covers it, block by block) but what the export adds:
 * a TREE of files, and links that work once the archive
 * is unzipped on someone else's desktop.
 */

const md = (id: string, extra = "") => `# ${id}\n\n${extra}`;

describe("pageFileSlug", () => {
  it("garde les accents et les espaces — c'est un fichier qu'on ouvre", () => {
    expect(pageFileSlug("Spécification tarifs 2027")).toBe(
      "Spécification tarifs 2027"
    );
  });

  it("remplace ce qu'un système de fichiers refuse", () => {
    expect(pageFileSlug('Roadmap Q1/Q2 : "v2"')).toBe("Roadmap Q1-Q2 - -v2-");
  });

  it("ne rend jamais un fichier caché, ni un nom vide", () => {
    expect(pageFileSlug("..gitignore")).toBe("gitignore");
    expect(pageFileSlug("   ")).toBe("page");
  });
});

describe("relativePath", () => {
  it("descend avec ./ et remonte avec ..", () => {
    expect(relativePath("Guide/index.md", "Guide/Intro.md")).toBe("./Intro.md");
    expect(relativePath("Guide/Intro.md", "Guide/index.md")).toBe("./index.md");
    expect(relativePath("Guide/A/index.md", "Guide/B.md")).toBe("../B.md");
  });
});

describe("exportPagesToFiles", () => {
  const pages = [
    { id: "root", parent_id: null, title: "Guide", icon: null, markdown: md("root", "[[page:kid]]") },
    { id: "kid", parent_id: "root", title: "Intro", icon: "📘", markdown: md("kid", "[[page:root]]") },
    { id: "grand", parent_id: "kid", title: "Détails", icon: null, markdown: md("grand") },
  ];

  it("fait un dossier d'une page qui a des enfants, un fichier des autres", () => {
    const files = exportPagesToFiles(pages);
    expect(files.map((f) => f.path)).toEqual([
      "Guide/index.md",
      "Guide/Intro/index.md",
      "Guide/Intro/Détails.md",
    ]);
  });

  it("réécrit les blocs sous-page en liens relatifs, avec leur titre", () => {
    const files = exportPagesToFiles(pages);
    expect(files[0].markdown).toContain("[📘 Intro](./Intro/index.md)");
    expect(files[1].markdown).toContain("[Guide](../index.md)");
  });

  it("laisse intact un lien vers une page HORS de l'archive", () => {
    const [file] = exportPagesToFiles([
      { id: "solo", parent_id: null, title: "Solo", icon: null, markdown: md("solo", "[[page:ailleurs]]") },
    ]);
    // Inventing a path that doesn't resolve would be worse than the original mark.
    expect(file.markdown).toContain("[[page:ailleurs]]");
  });

  it("ne laisse pas une sous-page « Index » écraser le corps de son parent", () => {
    // A parent's file shows their body under `index.md`: a girl
    // entitled “Index” wrote the SAME path there, and the archive did not keep
    // qu'un des deux fichiers — sans rien dire.
    const files = exportPagesToFiles([
      { id: "r", parent_id: null, title: "Guide", icon: null, markdown: md("r") },
      { id: "i", parent_id: "r", title: "Index", icon: null, markdown: md("i") },
    ]);
    expect(files.map((f) => f.path)).toEqual(["Guide/index.md", "Guide/Index (2).md"]);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
  });

  it("départage deux sœurs qui portent le même titre", () => {
    const files = exportPagesToFiles([
      { id: "r", parent_id: null, title: "R", icon: null, markdown: md("r") },
      { id: "a", parent_id: "r", title: "Notes", icon: null, markdown: md("a") },
      { id: "b", parent_id: "r", title: "Notes", icon: null, markdown: md("b") },
    ]);
    expect(files.map((f) => f.path)).toEqual([
      "R/index.md",
      "R/Notes.md",
      "R/Notes (2).md",
    ]);
  });
});

describe("exportFileName", () => {
  it("nomme le téléchargement d'après la page", () => {
    expect(exportFileName("Compte rendu", "md")).toBe("Compte rendu.md");
    expect(exportFileName("Compte rendu", "zip")).toBe("Compte rendu.zip");
  });
});
