"use client";

import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";

import { PageEditor } from "@/components/pages/page-editor";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/**
 * Le corps d'une PAGE PUBLIÉE (MIN-283), rendu pour quelqu'un qui n'a pas de
 * compte.
 *
 * C'est le VRAI éditeur, monté en lecture seule — le même choix que l'aperçu
 * d'une version dans l'historique (MIN-277), et pour la même raison : l'éditeur
 * EST la surface de rendu. Un second rendu écrit à côté finirait par diverger
 * sur exactement les blocs qu'on regarde le moins — un dépliant, une image
 * redimensionnée —, et il divergerait en silence : une page publiée est
 * justement celle que son auteur ne relit jamais.
 *
 * Ce qu'on ne lui donne PAS, et chaque absence est une décision :
 *
 *  - `mentions` / `mentionLinks` : une mention est du TEXTE dans le document,
 *    la pilule n'étant reposée qu'à la lecture par la surface qui en a les
 *    sources (MIN-269). Sans elles, « @Clément » et « @MIN-42 » restent du
 *    texte — ni avatar, ni lien, rien à apprendre du projet ;
 *  - `uploads`, `onComment` : rien à écrire ici, donc rien à téléverser ni à
 *    commenter ;
 *  - les pages hors de l'ensemble publié : le lookup ne les connaît pas, et
 *    leur bloc se rend inerte sous un libellé neutre. Leur titre n'a jamais
 *    quitté le serveur (cf. lib/server/page-publication.ts).
 */
export function PublicPageBody({
  content,
  pages,
  token,
  rootId,
  missingLabel,
}: {
  content: unknown;
  /** L'ensemble PUBLIÉ, et lui seul. */
  pages: Array<{ id: string; title: string; icon: string | null }>;
  token: string;
  /** La page que le lien désigne : elle vit à `/p/<token>`, ses filles sous. */
  rootId: string;
  /** Ce que dit un bloc sous-page non publié — jamais « corbeille », qui serait
      faux, jamais son titre, qui serait la fuite. */
  missingLabel: string;
}) {
  const lookup = useMemo<PagesLookup>(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const href = (id: string) =>
      id === rootId ? `/p/${token}` : `/p/${token}/${id}`;
    return {
      // `ready` d'emblée : le serveur a tout résolu, il n'y a aucune attente à
      // distinguer d'une absence. Un bloc sans page est donc inerte tout de
      // suite, et le reste.
      ready: true,
      get: (id) => byId.get(id),
      href,
      // `navigate` est OBLIGATOIRE, même sans routeur d'application : le clic
      // ordinaire sur l'ancre d'une vue de nœud est préempté par l'éditeur
      // (`handleNodeLinkClick`, components/editor-node-link.ts), qui coupe
      // l'extension Link ET le comportement par défaut, puis laisse la vue
      // prendre le relais. Sans ce relais-ci, cliquer une sous-page publiée ne
      // faisait rigoureusement RIEN.
      navigate: (id) => {
        window.location.href = href(id);
      },
      missingLabel,
    };
  }, [pages, token, rootId, missingLabel]);

  return (
    <PageEditor
      initialContent={(content as JSONContent | null) ?? null}
      onChange={() => {}}
      editable={false}
      pages={lookup}
    />
  );
}
