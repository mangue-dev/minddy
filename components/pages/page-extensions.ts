// LE SCHÉMA d'une page — le catalogue de blocs, plus le substrat qu'il suppose.
//
// Deux surfaces le montent, et elles doivent monter LE MÊME : l'éditeur
// (components/pages/page-editor.tsx) et la projection markdown
// (lib/pages-markdown.ts, donc le MCP et l'agent). Un nœud que l'éditeur sait
// produire et que la projection ne connaît pas, c'est un bloc qui disparaît en
// silence dès qu'un agent relit la page — exactement le défaut que MIN-269
// existe pour rendre impossible. D'où ce fichier : une seule liste, deux
// lectures.
//
// Ce qu'il N'A PAS, et qui reste à l'éditeur : le chrome (marge, menu ⋯), le
// menu « / », la suggestion de mention, le placeholder, `NodeRange`. Rien de
// tout cela ne touche le schéma ni le markdown.
//
// Pas de « use client » ici, volontairement : ce module doit pouvoir être monté
// hors navigateur. C'est aussi pourquoi la mention se PASSE en option — sa
// pilule vit dans un module client, et un module client importé côté serveur ne
// rend qu'une référence, pas une extension tiptap.

import type { AnyExtension, Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import UniqueID from "@tiptap/extension-unique-id";
import { Markdown } from "tiptap-markdown";
import { MentionNodeBase } from "@/components/mention-node";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
  PageBlockShortcuts,
  blockExtensions,
  pageColorExtensions,
} from "@/components/pages/blocks";

export interface PageExtensionsOptions {
  /**
   * Sans vue de nœud ni comportement de navigateur : le schéma et la
   * sérialisation markdown, montables sous jsdom comme dans une fonction
   * serveur. C'est ce que prend la projection.
   */
  headless?: boolean;

  /**
   * Le nœud de mention à monter. Par défaut le nœud NU
   * (components/mention-node.ts) : le texte « @Nom », son schéma et son
   * markdown. L'éditeur passe la version qui porte la pilule — c'est le même
   * nœud, avec une vue en plus.
   */
  mention?: AnyExtension;
}

export function pageExtensions(
  options: PageExtensionsOptions = {}
): Extensions {
  const { headless = false, mention = MentionNodeBase } = options;

  return [
    // Le substrat : document, texte, marques, annuler / refaire, liens. Tous les
    // nœuds de BLOC sont coupés — ils viennent du registre, et deux définitions
    // du même nœud font lever tiptap.
    StarterKit.configure({
      paragraph: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    ...blockExtensions({ headless }),
    ...pageColorExtensions(),
    PageBlockShortcuts,
    mention,
    // L'ID stable des blocs, posé des DEUX côtés : une page écrite en markdown
    // par Numo arrive donc dans l'éditeur avec des blocs déjà identifiés, comme
    // si un humain les avait tapés.
    UniqueID.configure({
      attributeName: BLOCK_ID_ATTRIBUTE,
      types: BLOCK_ID_TYPES,
    }),
    Markdown.configure({
      // `true` : le dépliant et la sous-page se projettent en HTML minimal
      // (cf. blocks/details.ts et blocks/subpage.ts) — markdown n'a ni l'un ni
      // l'autre. Sans ça, les deux repartiraient en texte échappé.
      html: true,
      // `linkify` seulement dans l'ÉDITEUR : une URL tapée s'y transforme en
      // lien, ce qui est un service rendu à l'humain. La projection, elle, doit
      // être fidèle — linkifier une URL nue la ferait ressortir en
      // `[url](url)`, donc un aller-retour qui réécrit le texte de Numo.
      linkify: !headless,
      transformPastedText: !headless,
      transformCopiedText: !headless,
    }),
  ] as unknown as Extensions;
}
