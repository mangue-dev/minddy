import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * LE FANTÔME de l'éditeur de description : le gris qu'on voit après le caret,
 * que Tab accepte et qu'Échap chasse.
 *
 * C'est une DÉCORATION widget, pas du texte : elle n'est nulle part dans le
 * document, donc elle ne part ni dans le markdown, ni dans l'historique
 * d'annulation, ni dans un copier-coller, et elle n'a rien à retirer si
 * personne ne l'accepte. Un texte réel qu'on effacerait après coup aurait à
 * faire les quatre, et se ferait attraper par au moins un des quatre.
 *
 * L'extension ne DÉCIDE de rien : elle affiche ce qu'on lui donne
 * (`setInlineSuggestion`) et rend la main sur Tab / Échap. Le quand et le quoi
 * vivent dans `lib/use-inline-completion.ts`.
 */

export const inlineSuggestionKey = new PluginKey<string>("inlineSuggestion");

/** Poser le texte fantôme (chaîne vide = l'effacer). */
export const SET_INLINE_SUGGESTION = "inlineSuggestion:set";

export interface InlineSuggestionOptions {
  /** Tab a accepté le fantôme — le texte vient d'être inséré. */
  onAccept: (text: string) => void;
  /** Échap l'a chassé. */
  onDismiss: () => void;
}

export const InlineSuggestion = Extension.create<InlineSuggestionOptions>({
  name: "inlineSuggestion",

  addOptions() {
    return { onAccept: () => {}, onDismiss: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<string>({
        key: inlineSuggestionKey,
        state: {
          init: () => "",
          apply(tr, value) {
            const next = tr.getMeta(SET_INLINE_SUGGESTION);
            if (typeof next === "string") return next;
            // Toute frappe périme le fantôme : le hook en reposera un (souvent
            // le même, rogné) dans la foulée. Le laisser vivre le ferait
            // clignoter une frame de travers sous le caret.
            if (tr.docChanged) return "";
            return value;
          },
        },
        props: {
          /**
           * Tab et Échap se prennent ICI, et non dans `addKeyboardShortcuts`,
           * pour une raison qui ne se voit qu'à l'usage : les raccourcis de
           * tiptap ne reçoivent pas l'événement, et ProseMirror se contente
           * d'un `preventDefault` sur ce qu'ils ont traité. L'Échap continuerait
           * donc de remonter jusqu'au dialog — refuser une suggestion fermerait
           * le formulaire de ticket, en emportant ce qu'on venait d'écrire.
           *
           * Rendre `false` laisse la touche à qui la voulait : sans fantôme,
           * Tab reste la tabulation et Échap ferme le dialog. Le menu des
           * mentions, lui, est branché AVANT dans la liste des plugins : quand
           * il est ouvert, c'est lui qui se sert le premier.
           */
          handleKeyDown(view, event) {
            const text = inlineSuggestionKey.getState(view.state);
            if (!text) return false;
            if (event.key === "Tab") {
              event.preventDefault();
              const tr = view.state.tr;
              tr.insertText(text, tr.selection.from);
              tr.setMeta(SET_INLINE_SUGGESTION, "");
              view.dispatch(tr);
              options.onAccept(text);
              return true;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              view.dispatch(view.state.tr.setMeta(SET_INLINE_SUGGESTION, ""));
              options.onDismiss();
              return true;
            }
            return false;
          },
          decorations(state) {
            const text = inlineSuggestionKey.getState(state);
            if (!text) return null;
            const { empty, from } = state.selection;
            if (!empty) return null;
            const span = document.createElement("span");
            span.className = "pointer-events-none text-muted-foreground/50";
            span.contentEditable = "false";
            span.textContent = text;
            // `side: 1` pose le widget APRÈS le caret — sinon le caret se
            // retrouve derrière le gris, et on croit taper au mauvais endroit.
            return DecorationSet.create(state.doc, [
              Decoration.widget(from, span, { side: 1 }),
            ]);
          },
        },
      }),
    ];
  },
});
