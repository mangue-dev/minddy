// @vitest-environment jsdom
//
// The round trip markdown ⇄ JSON of a page, played in ENTIRE on a real editor
// mounted under jsdom — the pattern of lib/scratchpad-nesting.test.ts, and for
// same reason: the notebook subtasks were lost between markdown and
// the editor without anything indicating it, and the only thing that saw it was a
// back and forth played from start to finish.
//
// A block is not finished when it is displayed. It is finished when markdown → JSON →
// markdown returns identical. Hence the form of this file: the cases are not
// a handwritten list but the REGISTER itself. Add a block without its
// projection therefore cannot go unnoticed — the case of this block exists before
// think about it, and it fails.
//
// What is lost is lost EXPRESSLY, and is read here in full (color, state
// folded, mention pill, block id): a documented loss is a contract,
// a discovered loss is a bug.

import { describe, expect, it } from "vitest";
import { PAGE_BLOCKS } from "@/components/pages/blocks";
import {
  bodyFromMarkdown,
  bodyToMarkdown,
  markdownToPage,
  pageToMarkdown,
} from "@/lib/pages-markdown";

/** markdown → JSON → markdown, on the BODY only. */
function roundTrip(markdown: string): string {
  return bodyToMarkdown(bodyFromMarkdown(markdown));
}

/* ── The register, block by block ──────────────────── ───────────────────── */

describe("l'aller-retour de chaque bloc du catalogue", () => {
  it.each(PAGE_BLOCKS.map((block) => [block.id, block] as const))(
    "%s revient intact",
    (_id, block) => {
      expect(roundTrip(block.markdown.sample)).toBe(block.markdown.sample);
    }
  );

  it.each(PAGE_BLOCKS.map((block) => [block.id, block] as const))(
    "%s produit bien son nœud, et pas un paragraphe",
    (_id, block) => {
      // Without this, a sample that does not PARSE would go through the round trip
      // without flinching (text → text) and would prove nothing of the block.
      const seen = nodeNames(bodyFromMarkdown(block.markdown.sample));
      expect(
        seen.has(block.nodeName),
        `« ${block.markdown.sample} » ne donne pas de nœud « ${block.nodeName} » (vus : ${[...seen].join(", ")})`
      ).toBe(true);
    }
  );

  it("couvre le catalogue en entier — pas un bloc sans son cas", () => {
    // The guard of the guard: the two `it.each` above draw their cases from
    // register, so a new block automatically inherits it. This test says why
    // is enough, and the day falls when someone replaces this list with one
    // handwritten list.
    expect(PAGE_BLOCKS.length).toBeGreaterThan(0);
    const covered = new Set(PAGE_BLOCKS.map((block) => block.id));
    for (const block of PAGE_BLOCKS) {
      expect(block.markdown.sample.trim()).not.toBe("");
      expect(covered.has(block.id)).toBe(true);
    }
  });
});

/* ── The header: title and icon ──────────────────── ───────────────────── */

describe("l'en-tête d'une page", () => {
  it("rend le titre et l'icône en tête, et les relit", () => {
    const page = {
      title: "Le manuel",
      icon: "📘",
      content: bodyFromMarkdown("Some text"),
    };
    const markdown = pageToMarkdown(page);
    expect(markdown).toBe("# 📘 Le manuel\n\nSome text");

    const back = markdownToPage(markdown);
    expect(back.title).toBe("Le manuel");
    expect(back.icon).toBe("📘");
    expect(bodyToMarkdown(back.content)).toBe("Some text");
  });

  it("se passe d'icône sans laisser d'espace en trop", () => {
    const markdown = pageToMarkdown({
      title: "Sans icône",
      icon: null,
      content: bodyFromMarkdown("Some text"),
    });
    expect(markdown).toBe("# Sans icône\n\nSome text");
    expect(markdownToPage(markdown).icon).toBeNull();
  });

  it("accepte un émoji composé et un drapeau", () => {
    for (const icon of ["👩‍💻", "🇫🇷", "⚙️"]) {
      const back = markdownToPage(`# ${icon} Titre\n\nSome text`);
      expect(back.icon, `icône « ${icon} »`).toBe(icon);
      expect(back.title).toBe("Titre");
    }
  });

  it("laisse les titres de niveau 2 et 3 au corps", () => {
    const back = markdownToPage("# Titre\n\n## Une section\n\n### Une autre");
    expect(back.title).toBe("Titre");
    expect(bodyToMarkdown(back.content)).toBe("## Une section\n\n### Une autre");
  });

  it("n'invente pas de titre quand le markdown n'en porte pas", () => {
    const back = markdownToPage("Some text\n\n## Une section");
    expect(back.title).toBe("");
    expect(back.icon).toBeNull();
    expect(bodyToMarkdown(back.content)).toBe("Some text\n\n## Une section");
  });

  it("écrit un corps nu quand la page n'a ni titre ni icône", () => {
    expect(
      pageToMarkdown({ title: "", icon: null, content: bodyFromMarkdown("Some text") })
    ).toBe("Some text");
  });

  it("revient identique de bout en bout", () => {
    const source = "# 📘 Le manuel\n\n## Une section\n\n- [ ] A task";
    const once = pageToMarkdown(markdownToPage(source));
    expect(once).toBe(source);
    expect(pageToMarkdown(markdownToPage(once))).toBe(once);
  });

  it("rend une page vide sans corps", () => {
    expect(pageToMarkdown({ title: "Vide", icon: null, content: null })).toBe(
      "# Vide"
    );
  });
});

/* ── Blocks that do not have standard markdown ─────────────────────── */

describe("le dépliant", () => {
  const FOLD = "<details>\n<summary>A summary</summary>\n\nHidden text\n\n</details>";

  it("accepte celui qu'un agent écrit à la main", () => {
    const json = bodyFromMarkdown(FOLD);
    const seen = nodeNames(json);
    expect(seen.has("details")).toBe(true);
    expect(seen.has("detailsSummary")).toBe(true);
    expect(bodyToMarkdown(json)).toBe(FOLD);
  });

  it("garde ce qu'il replie, y compris plusieurs blocs", () => {
    const rich =
      "<details>\n<summary>A summary</summary>\n\n- [x] A task\n\n> A quote\n\n</details>";
    expect(roundTrip(rich)).toBe(rich);
  });

  it("perd l'état PLIÉ — c'est écrit, et c'est de la présentation", () => {
    const open = bodyFromMarkdown(FOLD);
    const details = findNode(open, "details");
    // `open` falls back on the node's defect: nothing in the markdown carries it.
    expect(bodyToMarkdown(open)).toBe(FOLD);
    expect(details).toBeTruthy();
  });
});

describe("la sous-page", () => {
  const ID = "00000000-0000-4000-8000-000000000000";

  it("se dit en une ligne que Numo peut écrire", () => {
    const json = bodyFromMarkdown(`[[page:${ID}]]`);
    const subpage = findNode(json, "subpage");
    expect(subpage?.attrs?.pageId).toBe(ID);
    expect(bodyToMarkdown(json)).toBe(`[[page:${ID}]]`);
  });

  it("ne happe pas un lien markdown ordinaire", () => {
    const link = "[minddy](https://www.minddy.app)";
    expect(roundTrip(link)).toBe(link);
    expect(nodeNames(bodyFromMarkdown(link)).has("subpage")).toBe(false);
  });

  it("survit au milieu d'un texte", () => {
    const source = `Avant\n\n[[page:${ID}]]\n\nAprès`;
    expect(roundTrip(source)).toBe(source);
  });
});

/* ── What comes from elsewhere and should not be rewritten ──────────────── */

describe("les tâches", () => {
  it("gardent les quatre états du plan", () => {
    const states = "- [ ] pending\n- [~] doing\n- [x] done\n- [-] dropped";
    expect(roundTrip(states)).toBe(states);
  });

  it("gardent l'imbrication des sous-tâches, et son pas de deux espaces", () => {
    const nested = "- [ ] parent\n  - [~] child\n    - [x] grand\n- [ ] sib";
    expect(roundTrip(nested)).toBe(nested);
  });
});

describe("les mentions", () => {
  it("passent en texte, à la lettre — la pilule se re-déduit", () => {
    // A mention IS of the text: the node is only a habit, and lib/mention-scan
    // put it back on rereading. Nothing is lost from the CONTENT.
    const json = bodyFromMarkdown("Hello");
    const doc = withMention(json, "MIN-42");
    expect(bodyToMarkdown(doc)).toBe("Hello @MIN-42");
    expect(roundTrip("Hello @MIN-42")).toBe("Hello @MIN-42");
  });

  it("n'échappent pas un libellé à caractères spéciaux", () => {
    const doc = withMention(bodyFromMarkdown("Hello"), "Jean*Marc");
    expect(bodyToMarkdown(doc)).toBe("Hello @Jean*Marc");
  });
});

describe("les pertes assumées", () => {
  it("la couleur tombe, et ne fuit pas en balise", () => {
    const doc: Record<string, unknown> = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Rouge",
              marks: [{ type: "pageTextColor", attrs: { color: "red" } }],
            },
          ],
        },
      ],
    };
    const markdown = bodyToMarkdown(doc);
    expect(markdown).toBe("Rouge");
    expect(markdown).not.toContain("span");
  });

  it("l'id de bloc est REPOSÉ à la relecture, pas conservé", () => {
    const json = bodyFromMarkdown("# A heading\n\nSome text");
    const ids = blockIds(json);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    // Two readings of the same markdown do not give the same ids: they
    // n'appartiennent pas au markdown, ils appartiennent au document.
    expect(blockIds(bodyFromMarkdown("# A heading\n\nSome text"))).not.toEqual(ids);
  });
});

/* ── The composite document ─────────────────────── ─────────────────────── */

describe("un document qui contient tout", () => {
  // An isolated block can return intact and break on contact with the next one:
  // it's an ENTIRE document that says it, not an addition of cases.
  const DOC = [
    "# 📘 Le manuel",
    "",
    "Un paragraphe avec du **gras**, de l'*italique*, du `code` et un [lien](https://www.minddy.app).",
    "",
    "## Une section",
    "",
    "- Une puce",
    "  - Une sous-puce",
    "- Une autre",
    "",
    "1. Premier",
    "2. Second",
    "",
    "- [ ] parent",
    "  - [~] child",
    "    - [x] grand",
    "- [-] abandonnée",
    "",
    "> Une citation",
    "",
    '<aside data-type="callout" data-page-callout-color="blue" data-page-callout-icon="💡">',
    "",
    "Une information mise en avant.",
    "",
    "</aside>",
    "",
    "```ts",
    "const fence = `un backtick dans du code`",
    "```",
    "",
    "---",
    "",
    "<details>",
    "<summary>Un dépliant</summary>",
    "",
    "Ce qui est replié reste du markdown ordinaire.",
    "",
    "</details>",
    "",
    "[[page:00000000-0000-4000-8000-000000000000]]",
    "",
    // An image and a file (MIN-280). The file link is that of a
    // PAGE file: this is what separates it from `[lien](https://…)` from the first
    // paragraph, which must remain text and not become a block.
    "![Une capture d'écran](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/11111111-1111-4111-8111-111111111111)",
    "",
    "[rapport.pdf](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/22222222-2222-4222-8222-222222222222)",
    "",
    "### Et pour finir",
    "",
    "Une mention @MIN-42 et une personne @Clément.",
  ].join("\n");

  it("revient identique, en-tête compris", () => {
    expect(pageToMarkdown(markdownToPage(DOC))).toBe(DOC);
  });

  it("est stable d'un aller-retour au suivant", () => {
    const once = pageToMarkdown(markdownToPage(DOC));
    expect(pageToMarkdown(markdownToPage(once))).toBe(once);
  });

  it("porte réellement tous les nœuds du catalogue", () => {
    const seen = nodeNames(markdownToPage(DOC).content);
    for (const block of PAGE_BLOCKS) {
      expect(
        seen.has(block.nodeName),
        `le document composite ne contient pas de « ${block.nodeName} » (${block.id})`
      ).toBe(true);
    }
  });
});

/* ── The projection exhaust (MIN-350) ─────────────────────────── */

describe("ce qui a un sens dans une balise ou dans un lien", () => {
  const PROJECT = "00000000-0000-4000-8000-000000000000";
  const FILE = "22222222-2222-4222-8222-222222222222";

  // The leaflet projects HTML: a `<` in a summary would close the
  // tag. It comes out escaped — not by blocks/details.ts, but by the
  // tiptap-markdown TEXT serializer, which passes any text node through
  // `escapeHTML` (see the comment of `summaryMarkdown`). This case is here for
  // that the guarantee is VERIFIED rather than assumed: it is due to a
  // dependence, and it is this test which will tell the day it moves.
  it("échappe le `<` d'un résumé de dépliant, dans les deux sens", () => {
    const json = bodyFromMarkdown(
      "<details>\n<summary>A &lt;b&gt; x</summary>\n\nHidden\n\n</details>"
    );
    const summary = findNode(json, "detailsSummary");
    expect((summary?.content?.[0] as { text?: string } | undefined)?.text).toBe(
      "A <b> x"
    );
    const markdown = bodyToMarkdown(json);
    expect(markdown).toContain("<summary>A &lt;b&gt; x</summary>");
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("échappe le guillemet du nom d'un fichier qui entre par le markdown", () => {
    // The name travels in an HTML attribute handcrafted by the rule
    // markdown-it of the block: a bare quote would have closed it, and the block would be
    // revenu sans son nom.
    const json = bodyFromMarkdown(
      `[rap"port.pdf](/api/projects/${PROJECT}/pages/files/${FILE})`
    );
    expect(findNode(json, "pageFile")?.attrs?.name).toBe('rap"port.pdf');
  });

  it("n'écrit pas de lien vers un protocole refusé", () => {
    // The blocks are made by hand: such a `src` can no longer enter through
    // reading (lib/page-files.ts refuses it), and this is precisely the case that we
    // wants to hold — an inherited body, written before the safeguard, does not emerge in
    // clickable link in a markdown that we export.
    const doc = {
      type: "doc",
      content: [
        { type: "pageFile", attrs: { src: "javascript:alert(1)", name: "x.pdf" } },
        { type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } },
      ],
    };
    expect(bodyToMarkdown(doc)).not.toContain("javascript:");
  });

  it("échappe les parenthèses d'une adresse", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "pageFile",
          attrs: { src: "https://exemple.org/a(b).pdf", name: "a(b).pdf" },
        },
      ],
    };
    expect(bodyToMarkdown(doc)).toContain("(https://exemple.org/a\\(b\\).pdf)");
  });
});

/* ── The origin, removed at the entrance (MIN-284) ──────────────────────────── */

describe("l'adresse d'un fichier de page entrant avec une ORIGINE", () => {
  // The real case: copying and pasting an image block goes through the clipboard, which
  // carries HTML, and Chrome absolutizes `src` there. The body put away
  // `http://localhost:3000/api/…`; the image no longer loaded in production, and
  // the sweep of the orphans, who no longer recognized her, was preparing to
  // delete the file it named. The path markdown → HTML → parseHTML
  // played here is EXACTLY that of a collage.
  const PROJECT = "00000000-0000-4000-8000-000000000000";
  const IMAGE = "11111111-1111-4111-8111-111111111111";
  const FILE = "22222222-2222-4222-8222-222222222222";

  it("perd son origine et revient relative", () => {
    const body = bodyFromMarkdown(
      [
        `![Une capture](http://localhost:3000/api/projects/${PROJECT}/pages/files/${IMAGE})`,
        "",
        `[rapport.pdf](https://www.minddy.app/api/projects/${PROJECT}/pages/files/${FILE})`,
      ].join("\n")
    );
    const srcs = attrsOf(body.content ?? [])
      .map((attrs) => attrs.src)
      .filter(Boolean);
    expect(srcs).toEqual([
      `/api/projects/${PROJECT}/pages/files/${IMAGE}`,
      `/api/projects/${PROJECT}/pages/files/${FILE}`,
    ]);
  });

  it("laisse une image EXTERNE telle quelle", () => {
    const body = bodyFromMarkdown("![Un graphe](https://exemple.org/graphe.png)");
    expect(attrsOf(body.content ?? [])[0]?.src).toBe(
      "https://exemple.org/graphe.png"
    );
  });

  /** The attributes of the image and file nodes, in document order. */
  function attrsOf(nodes: JsonNode[]): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    const walk = (list: JsonNode[]) => {
      for (const node of list) {
        if (node.type === "image" || node.type === "pageFile") {
          out.push(node.attrs ?? {});
        }
        if (node.content) walk(node.content);
      }
    };
    walk(nodes);
    return out;
  }
});

/* ── File tools ─────────────────────── ─────────────────────── */

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
}

function walk(node: unknown, visit: (node: JsonNode) => void): void {
  const current = node as JsonNode | null;
  if (!current || typeof current !== "object") return;
  if (current.type) visit(current);
  for (const child of current.content ?? []) walk(child, visit);
}

function nodeNames(json: unknown): Set<string> {
  const names = new Set<string>();
  walk(json, (node) => {
    if (node.type) names.add(node.type);
  });
  return names;
}

function findNode(json: unknown, type: string): JsonNode | null {
  let found: JsonNode | null = null;
  walk(json, (node) => {
    if (!found && node.type === type) found = node;
  });
  return found;
}

function blockIds(json: unknown): unknown[] {
  const ids: unknown[] = [];
  walk(json, (node) => {
    const id = node.attrs?.blockId;
    if (id != null) ids.push(id);
  });
  return ids;
}

/** The same document, a note pasted at the end of the first paragraph. */
function withMention(json: unknown, label: string): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(json)) as JsonNode;
  const paragraph = findNode(doc, "paragraph");
  paragraph?.content?.push(
    { type: "text", text: " " } as JsonNode,
    {
      type: "mention",
      attrs: { mentionType: "issue", mentionId: "x", mentionLabel: label },
    } as JsonNode
  );
  return doc as Record<string, unknown>;
}
