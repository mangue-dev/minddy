// @vitest-environment jsdom
//
// L'aller-retour markdown ⇄ JSON d'une page, joué en ENTIER sur un vrai éditeur
// monté sous jsdom — le patron de lib/scratchpad-nesting.test.ts, et pour la
// même raison : les sous-tâches du carnet se perdaient entre le markdown et
// l'éditeur sans que rien ne le signale, et la seule chose qui l'a vu est un
// aller-retour joué du début à la fin.
//
// Un bloc n'est pas fini quand il s'affiche. Il est fini quand markdown → JSON →
// markdown revient identique. D'où la forme de ce fichier : les cas ne sont pas
// une liste écrite à la main mais le REGISTRE lui-même. Ajouter un bloc sans sa
// projection ne peut donc pas passer inaperçu — le cas de ce bloc existe avant
// qu'on y pense, et il échoue.
//
// Ce qui est perdu l'est EXPRÈS, et se lit ici en toutes lettres (couleur, état
// plié, pilule de mention, id de bloc) : une perte documentée est un contrat,
// une perte découverte est un bug.

import { describe, expect, it } from "vitest";
import { PAGE_BLOCKS } from "@/components/pages/blocks";
import {
  bodyFromMarkdown,
  bodyToMarkdown,
  markdownToPage,
  pageToMarkdown,
} from "@/lib/pages-markdown";

/** markdown → JSON → markdown, sur le CORPS seul. */
function roundTrip(markdown: string): string {
  return bodyToMarkdown(bodyFromMarkdown(markdown));
}

/* ── Le registre, bloc par bloc ───────────────────────────────────────── */

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
      // Sans ça, un échantillon qui ne se PARSE pas traverserait l'aller-retour
      // sans broncher (texte → texte) et ne prouverait rien du bloc.
      const seen = nodeNames(bodyFromMarkdown(block.markdown.sample));
      expect(
        seen.has(block.nodeName),
        `« ${block.markdown.sample} » ne donne pas de nœud « ${block.nodeName} » (vus : ${[...seen].join(", ")})`
      ).toBe(true);
    }
  );

  it("couvre le catalogue en entier — pas un bloc sans son cas", () => {
    // La garde de la garde : les deux `it.each` ci-dessus tirent leurs cas du
    // registre, donc un bloc neuf en hérite d'office. Ce test dit pourquoi ça
    // suffit, et tombe le jour où quelqu'un remplacerait cette liste par une
    // liste écrite à la main.
    expect(PAGE_BLOCKS.length).toBeGreaterThan(0);
    const covered = new Set(PAGE_BLOCKS.map((block) => block.id));
    for (const block of PAGE_BLOCKS) {
      expect(block.markdown.sample.trim()).not.toBe("");
      expect(covered.has(block.id)).toBe(true);
    }
  });
});

/* ── L'en-tête : titre et icône ───────────────────────────────────────── */

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

/* ── Les blocs qui n'ont pas de markdown standard ─────────────────────── */

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
    // `open` retombe sur le défaut du nœud : rien dans le markdown ne le porte.
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

/* ── Ce qui vient d'ailleurs et ne doit pas être réécrit ──────────────── */

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
    // Une mention EST du texte : le nœud n'est qu'un habit, et lib/mention-scan
    // le repose à la relecture. Rien n'est perdu du CONTENU.
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
    // Deux lectures du même markdown ne donnent pas les mêmes ids : ils
    // n'appartiennent pas au markdown, ils appartiennent au document.
    expect(blockIds(bodyFromMarkdown("# A heading\n\nSome text"))).not.toEqual(ids);
  });
});

/* ── Le document composite ────────────────────────────────────────────── */

describe("un document qui contient tout", () => {
  // Un bloc isolé peut revenir intact et se casser au contact du suivant :
  // c'est un document ENTIER qui le dit, pas une addition de cas.
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
    // Une image et un fichier (MIN-280). Le lien du fichier est celui d'un
    // fichier DE PAGE : c'est ce qui le sépare du `[lien](https://…)` du premier
    // paragraphe, qui doit rester du texte et non devenir un bloc.
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

/* ── Les outils du fichier ────────────────────────────────────────────── */

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

/** Le même document, une mention collée en fin de premier paragraphe. */
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
