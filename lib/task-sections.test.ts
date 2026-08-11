// @vitest-environment jsdom
//
// La section d'une tâche, jouée sur un VRAI document de page.
//
// C'est le seul canal par lequel une tâche confiée à un agent emporte de quoi
// se situer (MIN-274) : « relancer le cron » sous « Déploiement » n'est pas la
// même tâche que sous « Idées ». Rien ne signale l'erreur si ce chemin se
// trompe — le prompt part quand même, il décrit juste autre chose. D'où ce
// fichier : on monte le schéma réel des pages, on écrit du markdown, et on
// demande à chaque tâche du document où elle croit vivre.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { taskSectionHeadings } from "@/lib/task-sections";

/** Un éditeur de PAGE sans vue de nœud, et le markdown chargé dedans. */
function pageWith(markdown: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: pageExtensions({ headless: true }) as never,
  });
  editor.commands.setContent(markdown);
  return editor;
}

/** La section de la `n`-ième tâche du document, dans l'ordre de lecture. */
function sectionOf(editor: Editor, index: number): string[] {
  const found: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "taskItem") found.push(pos);
    return true;
  });
  return taskSectionHeadings(editor, found[index]);
}

describe("la section d'une tâche de page", () => {
  it("porte la chaîne ENTIÈRE des titres qui la contiennent", () => {
    const editor = pageWith(
      "# Pull requests\n\n## Sidebar\n\n- [ ] relancer le cron\n"
    );
    expect(sectionOf(editor, 0)).toEqual(["# Pull requests", "## Sidebar"]);
    editor.destroy();
  });

  it("ne prend pas la section d'à côté pour la sienne", () => {
    const editor = pageWith(
      [
        "# Post-mortem",
        "",
        "## Ce qui a cassé",
        "",
        "- [x] identifier la requête",
        "",
        "## Suites",
        "",
        "- [ ] relancer le cron",
        "",
      ].join("\n")
    );
    expect(sectionOf(editor, 0)).toEqual([
      "# Post-mortem",
      "## Ce qui a cassé",
    ]);
    // La section précédente est FERMÉE par sa sœur de même rang : la deuxième
    // tâche n'en a jamais fait partie.
    expect(sectionOf(editor, 1)).toEqual(["# Post-mortem", "## Suites"]);
    editor.destroy();
  });

  it("ne donne rien à une tâche écrite avant tout titre", () => {
    const editor = pageWith("- [ ] écrire le compte-rendu\n\n# Plus tard\n");
    expect(sectionOf(editor, 0)).toEqual([]);
    editor.destroy();
  });

  it("donne à une SOUS-tâche la section de son parent", () => {
    const editor = pageWith(
      "## Suites\n\n- [ ] relancer le cron\n  - [ ] vérifier les logs\n"
    );
    // La sous-tâche est bien IMBRIQUÉE (sans quoi le cas ne prouverait rien) :
    // c'est de son bloc de premier niveau qu'on remonte, pas d'elle-même.
    const depths: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "taskItem")
        depths.push(editor.state.doc.resolve(pos).depth);
      return true;
    });
    expect(depths[1]).toBeGreaterThan(depths[0]);

    expect(sectionOf(editor, 0)).toEqual(["## Suites"]);
    expect(sectionOf(editor, 1)).toEqual(["## Suites"]);
    editor.destroy();
  });

  it("rend le vide plutôt que de deviner, hors du document", () => {
    const editor = pageWith("# Titre\n\n- [ ] une tâche\n");
    expect(taskSectionHeadings(editor, undefined)).toEqual([]);
    expect(taskSectionHeadings(editor, -1)).toEqual([]);
    expect(
      taskSectionHeadings(editor, editor.state.doc.content.size + 10)
    ).toEqual([]);
    editor.destroy();
  });
});
