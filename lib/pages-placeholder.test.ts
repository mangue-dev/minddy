// @vitest-environment jsdom
//
// Le placeholder des blocs vides (MIN-270).
//
// Ce que ce fichier tient, et qu'aucun type ni aucune relecture ne voit : QUELS
// blocs vides portent un placeholder. `Placeholder` de tiptap, laissé sur ses
// options par défaut, ne regarde que le nœud de PROFONDEUR 1 — pour un item de
// liste ou une ligne de citation, c'est la liste ou la citation, qui n'est pas
// un bloc de texte. La moitié des blocs vides restait donc muette, en silence,
// et rien dans le code ne le disait.
//
// Le second point tenu ici est le TEXTE : un titre annonce son niveau, un bloc
// imbriqué invite juste à écrire, et seule la ligne de premier niveau porte
// l'invitation au menu « / » — c'est la seule où « / » est le bon geste.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import { pageExtensions } from "@/components/pages/page-extensions";
import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";

/** Un traducteur qui rend sa clé : on épingle QUELLE clé sort, pas sa langue. */
const t = ((key: string) => key) as never;

/**
 * Les placeholders présents dans le document, curseur posé à `at`.
 *
 * `blur` : on quitte le document après avoir posé le curseur. La sélection
 * SURVIT au focus, donc rien dans l'état ne dit qu'on est parti — c'est
 * exactement le cas qui laissait une invitation à écrire allumée sur un
 * document qu'on venait de quitter.
 *
 * L'événement de focus est envoyé À LA MAIN : jsdom ne considère pas un
 * `contenteditable` comme focalisable et n'en émet donc pas de lui-même, là où
 * un navigateur en émet un à chaque clic dans l'éditeur.
 */
function placeholders(
  content: string,
  at: "start" | "end",
  { blur = false }: { blur?: boolean } = {}
): string[] {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    content,
    extensions: [
      ...pageExtensions({ headless: true }),
      BlockPlaceholder.configure({ text: pagePlaceholder(t) }),
    ] as never,
  });
  editor.commands.focus(at);
  editor.view.dom.dispatchEvent(new FocusEvent("focus"));
  if (blur) editor.view.dom.dispatchEvent(new FocusEvent("blur"));
  const found = [...element.innerHTML.matchAll(/data-placeholder="([^"]*)"/g)]
    .map((match) => match[1]);
  editor.destroy();
  element.remove();
  return found;
}

describe("placeholder d'un bloc vide", () => {
  it("invite au menu « / » sur une ligne de premier niveau", () => {
    expect(placeholders("<p></p>", "start")).toEqual(["placeholder"]);
    expect(placeholders("<p>texte</p><p></p>", "end")).toEqual(["placeholder"]);
  });

  it("annonce son niveau sur un titre vide", () => {
    expect(placeholders("<p>x</p><h1></h1>", "end")).toEqual(["blockHeading1"]);
    expect(placeholders("<p>x</p><h2></h2>", "end")).toEqual(["blockHeading2"]);
    expect(placeholders("<p>x</p><h3></h3>", "end")).toEqual(["blockHeading3"]);
  });

  it("descend dans les blocs IMBRIQUÉS — le défaut de tiptap les oubliait", () => {
    expect(placeholders("<p>x</p><ul><li><p></p></li></ul>", "end")).toEqual([
      "placeholderNested",
    ]);
    expect(
      placeholders("<p>x</p><blockquote><p></p></blockquote>", "end")
    ).toEqual(["placeholderNested"]);
  });

  it("s'éteint dès qu'on quitte le document", () => {
    // La sélection reste sur la ligne vide : seul le FOCUS a changé, et c'est
    // pourtant lui qui décide — une invitation à écrire n'a pas de sens sur un
    // document que l'on vient de quitter.
    expect(placeholders("<p></p>", "start", { blur: true })).toEqual([]);
    expect(placeholders("<p>x</p><h2></h2>", "end", { blur: true })).toEqual([]);
  });

  it("ne décore ni un bloc plein, ni un bloc vide sans le curseur", () => {
    expect(placeholders("<p>plein</p>", "end")).toEqual([]);
    // Deux blocs vides qui se TOUCHENT : ils partagent une borne, et tiptap les
    // allumait tous les deux (plus leurs ancêtres vides) dès que le curseur se
    // posait entre eux. Un seul, toujours — celui du curseur.
    expect(placeholders("<p></p><p></p>", "start")).toHaveLength(1);
    expect(placeholders("<p></p><p></p><p></p>", "end")).toHaveLength(1);
    expect(
      placeholders("<ul><li><p></p></li><li><p></p></li></ul>", "end")
    ).toHaveLength(1);
  });
});
