// La projection markdown d'une page, jouée SANS DOM au départ — environnement
// node, comme une fonction Vercel (MIN-273).
//
// C'est le seul test de ce dépôt qui vérifie que le DOM s'installe tout seul :
// tous les autres tests de page tournent sous jsdom, où le manque ne se voit
// pas. Or c'est bien dans une fonction serveur que les outils de page lisent et
// écrivent, et un `document is not defined` n'y apparaîtrait qu'en production,
// au premier appel de Numo.
//
// Le cas d'aller-retour porte un bloc RICHE (dépliant, sous-page) : ce sont eux
// qui traversent `DOMParser` et le `parseHTML` du registre, donc eux qui
// tombent si le DOM installé est incomplet.

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
