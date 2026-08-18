// The markdown projection of a page, played WITHOUT DOM at the start — environment
// node, like a Vercel function (MIN-273).
//
// This is the only test in this repository that verifies that the DOM installs itself:
// all other page tests run under jsdom, where the lack is not visible
// not. However, it is in a server function that the page tools read and
// write, and a `document is not defined` would only appear in production,
// au premier appel de Numo.
//
// The round trip case carries a RICH block (leaflet, subpage): these are them
// which cross `DOMParser` and the `parseHTML` of the register, so they which
// fall if the installed DOM is incomplete.

import { describe, expect, it } from "vitest";
import {
  bodyFromMarkdownServer,
  markdownToPageServer,
  pageToMarkdownServer,
} from "./pages-projection";

const RICH = [
  "## Contexte",
  "",
  "Un paragraphe avec du **gras** et un [lien](https://minddy.app).",
  "",
  "- [ ] une tâche",
  "- [x] une tâche faite",
  "",
  "> une citation",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "<details>",
  "<summary>Un dépliant</summary>",
  "",
  "son contenu",
  "",
  "</details>",
  "",
  "[[page:11111111-1111-4111-8111-111111111111]]",
].join("\n");

describe("projection de page côté serveur", () => {
  it("installe un DOM et rend le markdown d'une page", async () => {
    expect(
      await pageToMarkdownServer({
        title: "Guide",
        icon: "📘",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Bonjour" }] },
          ],
        },
      })
    ).toBe("# 📘 Guide\n\nBonjour");
  });

  it("relit un en-tête en titre et icône", async () => {
    const page = await markdownToPageServer("# 🚀 Lancement\n\nDu texte.");
    expect(page.title).toBe("Lancement");
    expect(page.icon).toBe("🚀");
    expect(page.content?.content?.[0]?.type).toBe("paragraph");
  });

  it("fait l'aller-retour d'un document à blocs riches sans perdre de contenu", async () => {
    const body = await bodyFromMarkdownServer(RICH);
    const back = await pageToMarkdownServer({
      title: "",
      icon: null,
      content: body,
    });
    expect(back).toBe(RICH);
  });
});
