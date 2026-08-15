/**
 * « Copier pour l'agent » — ce que ⌘L et l'entrée du menu ⋯ d'une page
 * déposent dans le presse-papiers.
 *
 * Une page n'a PAS d'identifiant humain. Un ticket se donne à un agent en
 * l'appelant « MIN-42 » ; une page, elle, n'existe pour le MCP que par deux
 * UUID (cf. `PAGE_ID`, lib/server/mcp/page-tools.ts) — que personne ne lit ni
 * ne retape. C'est toute la raison de ce geste : coller son URL ne suffit pas,
 * puisque rien n'y dit à l'agent quel outil ouvre ça.
 *
 * D'où les deux moitiés du texte copié, et pas une seule :
 *
 * - l'URL, parce qu'un lien doit rester un lien — celui qui le colle dans une
 *   conversation, un commit ou un message à un collègue veut qu'on puisse
 *   cliquer dessus ;
 * - les COORDONNÉES MCP, parce qu'un agent ne devine pas qu'un chemin
 *   `/projects/<uuid>/pages/<uuid>` se lit avec `minddy_get_page`. Les deux
 *   ids sont réécrits en clair plutôt que laissés à extraire de l'URL : un
 *   argument d'outil ne se fabrique pas par découpage d'une chaîne.
 *
 * Et, au milieu, la CONSIGNE — facultative, sur le patron du prompt
 * personnalisé d'un ticket (`buildIssueCustomPrompt`, lib/issue-prompt.ts) :
 * « transforme cette page en tickets », « relis la section Sécurité ». Sans
 * elle, le texte ne demande rien et ne fait que désigner la page ; c'est à
 * l'agent qu'on dira quoi en faire, dans la conversation. Avec elle, le geste
 * est complet — et c'est le cas fréquent, puisqu'on donne rarement une page
 * pour le plaisir de la donner.
 *
 * Elle est reprise VERBATIM, dans la langue où elle a été écrite : c'est LA
 * demande. Le reste est TOUJOURS en anglais, comme les prompts de ticket : le
 * titre de la page part tel quel, mais ce qui l'entoure s'adresse à un modèle,
 * pas à l'utilisateur, quelle que soit la langue de l'interface.
 *
 * Les outils d'écriture sont NOMMÉS. Ils sont dans la liste de l'agent, mais
 * cette liste se charge parfois à la demande : les citer coûte une phrase et
 * évite un aller-retour « je ne peux que lire ».
 */

/** Faute de titre, la page reste nommable — et en anglais, comme le reste. */
const UNTITLED = "Untitled";

export interface PageAgentPromptInput {
  /** Origine de l'app (`window.location.origin`) : l'URL doit ramener LÀ d'où
      elle a été copiée — le domaine de production, mais aussi le poste de
      développement ou l'app desktop. */
  origin: string;
  projectId: string;
  pageId: string;
  title: string;
  /** Ce que l'utilisateur veut voir fait de cette page. Vide = on ne demande
      rien, on désigne seulement la page. */
  instructions?: string;
}

/** L'URL in-app d'une page, telle que la sidebar et le fil d'Ariane la font. */
export function pageHref(
  origin: string,
  projectId: string,
  pageId: string
): string {
  return `${origin.replace(/\/+$/, "")}/projects/${projectId}/pages/${pageId}`;
}

export function buildPageAgentPrompt({
  origin,
  projectId,
  pageId,
  title,
  instructions,
}: PageAgentPromptInput): string {
  const name = title.trim() || UNTITLED;
  const asked = instructions?.trim();

  // Le corps de la page n'est jamais inliné : il peut faire des dizaines de
  // milliers de jetons, et l'agent a l'outil pour le lire — c'est même le seul
  // moyen qu'il le lise À JOUR plutôt que dans l'état où il était à la copie.
  const tools = `Read it with the minddy MCP tool \`minddy_get_page\` (project_id "${projectId}", page_id "${pageId}"). Write back with \`minddy_update_page\`, \`minddy_append_to_page\` or \`minddy_edit_page_text\`, and comment with \`minddy_add_page_comment\`.`;

  const head = `minddy page "${name}" — ${pageHref(origin, projectId, pageId)}`;

  if (!asked) return `${head}\n\n${tools}`;

  // « these instructions are the request itself » : la même précaution que sur
  // un ticket. Sans elle, un modèle prend la consigne pour une précision et se
  // met à faire « tout ce qu'on peut faire d'une page » par-dessus.
  return `${head}

Here is what I want you to do with this page — these instructions are the request itself, so follow them rather than inventing a broader task:

${asked}

${tools}`;
}
