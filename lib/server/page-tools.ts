import "server-only";

import type { JSONContent } from "@tiptap/core";
import {
  createPage,
  getPage,
  listPages,
  searchProjectPages,
  updatePage,
  type PageErrorKey,
} from "@/lib/server/pages";
import {
  bodyFromMarkdownServer,
  markdownToPageServer,
  pageBodyToMarkdownServer,
} from "@/lib/server/pages-projection";
import { editTextPassage } from "@/lib/server/text-edit";
import {
  pageBacklinks,
  type BacklinkQueryable,
  type PageBacklink,
} from "@/lib/server/page-backlinks";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  addPageComment,
  openPageThreadsForAgent,
} from "@/lib/server/page-comments";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { SITE_NAME } from "@/lib/site";
import type { Page, PageWriteKind } from "@/lib/pages";

/**
 * LES GESTES d'un agent sur les pages (MIN-273), une seule fois.
 *
 * Six à l'origine, sept depuis MIN-276 : chercher. C'est celui qui manquait le
 * plus — l'arbre dit ce qui existe, pas ce qui parle de quoi.
 *
 * Trois surfaces les servent — le serveur MCP (`minddy_*_page`), le chat Numo
 * (`*_page`) et l'agent de code —, et c'est justement pourquoi la logique ne vit
 * dans aucune des trois : un agent qui lit une page dans le chat et la corrige
 * depuis le MCP doit voir le MÊME document, refusé de la même façon. Les
 * adaptateurs ne font donc que traduire les arguments et les codes d'erreur.
 *
 * Deux règles tiennent tout le module :
 *
 * 1. **l'agent ne voit que du markdown.** Le JSON ProseMirror ne sort jamais
 *    d'ici : la projection (`lib/server/pages-projection.ts`) le traduit dans les
 *    deux sens, et c'est ce qui fait que MIN-269 est une dépendance stricte et
 *    pas une commodité.
 * 2. **l'écriture passe par le même noyau que l'UI** (`lib/server/pages.ts`) :
 *    même garde d'accès, même garde de cycle, même compteur de `version`. Un
 *    chemin parallèle aurait ses propres trous.
 * 3. **toute écriture d'ici est signée `kind: "agent"`** (MIN-277). C'est le
 *    seul endroit du dépôt qui le sait : l'`actorId` qui arrive est celui d'un
 *    compte humain — le porteur de la clé MCP, l'utilisateur de Numo, le
 *    propriétaire du projet —, et le laisser signer seul afficherait « modifiée
 *    par Clément » sur une page que Clément n'a pas écrite. Le geste est
 *    automatisé, il porte donc le nom de minddy, dans l'en-tête comme dans
 *    l'historique.
 *
 * Ce qui n'est PAS exposé, et c'est une décision : la corbeille. Un agent qui
 * efface des pages est un risque sans contrepartie, et supprimer reste un geste
 * humain — l'UI le fait très bien.
 */

/* ─── Résultats ────────────────────────────────────────────────────────────── */

export type PageToolCode =
  | "invalid_params"
  | "project_not_found"
  | "page_not_found"
  | "parent_not_found"
  | "page_cycle"
  | "page_stale"
  | "page_not_empty"
  | "page_too_large"
  | "text_not_found"
  | "text_ambiguous"
  | "database_error";

export type PageToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PageToolCode; message: string };

const CODES: Record<PageErrorKey, PageToolCode> = {
  projectNotFound: "project_not_found",
  pageNotFound: "page_not_found",
  pageVersionNotFound: "page_not_found",
  pageParentNotFound: "parent_not_found",
  pageCycle: "page_cycle",
  pageStale: "page_stale",
  pageNotEmpty: "page_not_empty",
  pageTooLarge: "page_too_large",
  pageTooDeep: "page_too_large",
  noFieldsToUpdate: "invalid_params",
  databaseError: "database_error",
};

/** Les refus du noyau, dits en anglais et en codes stables — comme le reste de
    la surface agent (cf. lib/server/mcp/tool-helpers.ts). */
const MESSAGES: Record<PageErrorKey, string> = {
  projectNotFound: "Project not found or not accessible.",
  pageNotFound: "Page not found in this project.",
  pageVersionNotFound: "That version of the page no longer exists.",
  pageParentNotFound:
    "The parent page does not exist in this project (or is in the trash).",
  pageCycle: "Refused: that move would put the page under one of its own subpages.",
  pageStale:
    "The page was written by someone else since you read it. Read it again and " +
    "re-apply your change on the current text.",
  pageNotEmpty:
    "Refused: that page is no longer empty. Only a page created and left blank " +
    "can be discarded; move a written page to the trash instead.",
  pageTooLarge: "The page body is too large; split it into subpages.",
  pageTooDeep:
    "The page body nests blocks too deeply; flatten it or split it into subpages.",
  noFieldsToUpdate: "Nothing to update: pass a title, an icon or a markdown body.",
  databaseError: "Database error.",
};

function refuse<T>(errorKey: PageErrorKey): PageToolResult<T> {
  return { ok: false, code: CODES[errorKey], message: MESSAGES[errorKey] };
}

/**
 * Le plafond du markdown accepté en ENTRÉE. Le noyau borne déjà le JSON stocké
 * (1 Mo), mais il le fait APRÈS la projection : refuser tôt évite de monter un
 * éditeur sur un document qu'on n'écrira pas, et rend un message qui parle de ce
 * que l'agent a envoyé plutôt que de sa traduction.
 */
export const MAX_PAGE_MARKDOWN = 400_000;

/* ─── Ce que l'agent lit ───────────────────────────────────────────────────── */

/** Une page dans l'arbre, sans son corps. */
export interface PageTreeEntry {
  page_id: string;
  title: string;
  icon: string | null;
  /** `null` = page racine. L'arbre se reconstruit chez l'appelant. */
  parent_page_id: string | null;
  updated_at: string;
}

/** Une page lue en entier : son en-tête, son corps en markdown, ses enfants. */
export interface PageRead extends PageTreeEntry {
  /**
   * QUI a écrit en dernier (MIN-277), et de quelle nature était le geste.
   *
   * Un agent qui relit une page doit savoir si un humain y est passé depuis son
   * dernier tour : c'est la différence entre « je reprends mon texte » et « je
   * m'apprête à écraser celui de quelqu'un ». Le nom suit la règle d'identité —
   * « minddy » quand la dernière écriture vient d'un agent, quel que soit le
   * compte qui l'a permise.
   */
  last_edited_by: string;
  last_edited_kind: PageWriteKind;
  /** Le corps SEUL, en markdown (le titre et l'icône sont au-dessus). */
  markdown: string;
  /** Le compteur d'écritures du corps — à repasser pour écrire sans écraser. */
  version: number;
  /** Les sous-pages DIRECTES, pour descendre l'arbre sans un second appel. */
  subpages: Array<{ page_id: string; title: string; icon: string | null }>;
  /**
   * QUI s'appuie sur cette page (MIN-279) — tickets, objectifs et autres pages,
   * par la ressource comme par la mention.
   *
   * C'est ce qui manque le plus à un agent qui ouvre une spec : sans ça, « que
   * casse-t-on en changeant cette décision ? » se répond en fouillant tout le
   * projet, ou ne se répond pas. Le lien allait dans un seul sens.
   */
  backlinks: PageBacklink[];
  /**
   * Les fils de discussion de la page (MIN-282).
   *
   * C'est souvent là qu'est la vraie contrainte : une spec dit ce qui a été
   * décidé, ses commentaires disent ce qui est contesté et n'a pas encore été
   * réécrit. Un agent qui réécrit une page sans les avoir lus tranche sans le
   * savoir un débat en cours.
   */
  threads: PageThreadForAgent[];
}

/** Un fil, tel qu'un agent le lit : ce dont il parle, et ce qui s'y est dit. */
export interface PageThreadForAgent {
  /** L'adresse du fil, à repasser en `parent_comment_id` pour répondre DEDANS
      plutôt que d'en ouvrir un second à côté. */
  thread_id: string;
  /** L'extrait commenté, figé au moment du commentaire. Null = sur la page. */
  quote: string | null;
  /** L'ancre, à repasser à `minddy_add_page_comment` pour répondre au même
      endroit. Null = un commentaire sur la page entière. */
  block_id: string | null;
  messages: { author: string; body: string; at: string }[];
}

/** L'écriture, telle qu'un agent la relit : de quoi confirmer, pas le document. */
export interface PageWritten extends PageTreeEntry {
  version: number;
  /** Longueur du corps en markdown, après écriture. */
  markdown_length: number;
}

function entry(page: {
  id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  updated_at: string;
}): PageTreeEntry {
  return {
    page_id: page.id,
    title: page.title,
    icon: page.icon,
    parent_page_id: page.parent_id ?? null,
    updated_at: page.updated_at,
  };
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** L'arbre des pages du projet, à plat, sans les corps. */
export async function listPagesForAgent({
  projectId,
  actorId,
}: {
  projectId: string;
  actorId: string;
}): Promise<PageToolResult<{ pages: PageTreeEntry[] }>> {
  const result = await listPages(projectId, actorId);
  if (!result.ok) return refuse(result.errorKey);
  return { ok: true, data: { pages: result.pages.map(entry) } };
}

/** Une page en markdown, en-tête et sous-pages directes comprises. */
export async function readPageForAgent({
  pageId,
  projectId,
  actorId,
  withBacklinks = true,
}: {
  pageId: string;
  /** Le projet attendu : une page d'un AUTRE projet accessible ne répond pas ici. */
  projectId?: string;
  actorId: string;
  /** Coupé par les LECTURES INTERNES (l'ajout d'un bloc, la réécriture d'un
      passage) : elles ne veulent que le markdown et la version, et payer les
      requêtes de rétroliens à chaque édition serait payer pour une liste que
      personne ne lit. */
  withBacklinks?: boolean;
}): Promise<PageToolResult<PageRead>> {
  const result = await getPage(pageId, actorId);
  if (!result.ok) return refuse(result.errorKey);
  const page = result.page;
  if (projectId && page.project_id !== projectId) return refuse("pageNotFound");

  const markdown = await pageBodyToMarkdownServer(
    (page.content as JSONContent | null) ?? null
  );

  // Les enfants viennent de la LISTE du projet : une requête de plus, mais elle
  // est déjà indexée et sans corps, et elle évite à l'agent un second appel
  // rien que pour savoir si la page a une descendance.
  const siblings = await listPages(page.project_id, actorId);
  const subpages = siblings.ok
    ? siblings.pages
        .filter((p) => p.parent_id === page.id)
        .map((p) => ({ page_id: p.id, title: p.title, icon: p.icon }))
    : [];

  // La CLÉ du projet, pour que les rétroliens de tickets se lisent « MIN-42 »
  // et pas en UUID — c'est sous cette forme que l'agent les repassera aux autres
  // outils. Client SERVICE pour la lecture elle-même : la garde d'accès vient
  // d'être faite par `getPage`, et la RLS ne s'applique pas ici.
  let backlinks: PageBacklink[] = [];
  let threads: PageThreadForAgent[] = [];
  if (withBacklinks) {
    const projectAccess = await getProjectAccess(actorId, page.project_id);
    backlinks = await pageBacklinks(
      getServiceClient() as unknown as BacklinkQueryable,
      {
        pageId: page.id,
        projectKey: (projectAccess?.project.key as string | undefined) ?? "",
      }
    );
    // Les FILS (MIN-282), sous la même garde que les rétroliens : les deux
    // répondent à « sur quoi ce texte engage-t-il ? », et les lectures internes
    // (ajouter un bloc, corriger un passage) n'en veulent aucun.
    threads = await readThreads(page.id);
  }

  return {
    ok: true,
    data: {
      ...entry(page),
      last_edited_by: await lastWriterName(page),
      last_edited_kind: page.updated_kind ?? "human",
      markdown,
      version: page.version,
      subpages,
      backlinks,
      threads,
    },
  };
}

/**
 * Les fils d'une page, auteurs NOMMÉS.
 *
 * Les noms sortent des comptes, comme partout ailleurs — jamais l'email brut
 * (lib/display-name.ts) —, et une écriture d'agent se dit « minddy » : la règle
 * d'identité vaut pour ce que lit un agent comme pour ce que lit un humain.
 */
async function readThreads(pageId: string): Promise<PageThreadForAgent[]> {
  const service = getServiceClient();
  const raw = await openPageThreadsForAgent(service, pageId, (id) => id ?? "");
  const ids = [
    ...new Set(
      raw.flatMap((thread) => thread.messages.map((m) => m.author)).filter(Boolean)
    ),
  ];
  const users = ids.length ? await fetchAuthUsersById(service, ids) : new Map();
  const name = (id: string) => {
    const user = users.get(id);
    return user ? displayName(toNamed(user), "") || SITE_NAME : SITE_NAME;
  };
  return raw.map((thread) => ({
    ...thread,
    messages: thread.messages.map((m) => ({ ...m, author: name(m.author) })),
  }));
}

/** Les refus du noyau des commentaires, traduits dans le vocabulaire des outils
    de page (codes stables, messages en anglais). */
const COMMENT_REFUSALS: Record<
  "commentEmpty" | "pageNotFound" | "commentNotFound" | "databaseError",
  { ok: false; code: PageToolCode; message: string }
> = {
  commentEmpty: {
    ok: false,
    code: "invalid_params",
    message: "A comment cannot be empty.",
  },
  pageNotFound: {
    ok: false,
    code: "page_not_found",
    message: MESSAGES.pageNotFound,
  },
  commentNotFound: {
    ok: false,
    code: "invalid_params",
    message:
      "That comment is not on this page — reply to a thread you read with " +
      "minddy_get_page.",
  },
  databaseError: {
    ok: false,
    code: "database_error",
    message: MESSAGES.databaseError,
  },
};

/**
 * COMMENTER une page, ou l'un de ses blocs, en tant qu'agent (MIN-282).
 *
 * Le seul geste d'écriture des pages qui ne touche pas au document : répondre à
 * une objection, en poser une, dire pourquoi on n'a pas fait ce qui était
 * demandé. Sans lui, un agent lisait des questions sans pouvoir y répondre.
 *
 * L'ancre est le `block_id` d'un fil déjà lu (`threads`) : un agent ne
 * fabrique pas d'ancre, il en reprend une — les ids de blocs ne sont pas dans le
 * markdown qu'il lit, et une ancre inventée ferait un fil détaché à la seconde
 * où il est écrit.
 */
export async function addPageCommentForAgent({
  pageId,
  projectId,
  actorId,
  body,
  blockId,
  parentCommentId,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  body: string;
  blockId?: string | null;
  parentCommentId?: string | null;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<PageToolResult<{ page_id: string; comment_id: string }>> {
  // La page d'abord : le contrôle d'accès et la garde « ce projet-ci » sont les
  // mêmes que pour une lecture, et ils doivent l'être — un commentaire sur une
  // page invisible en apprendrait l'existence.
  const found = await getPage(pageId, actorId);
  if (!found.ok) return refuse(found.errorKey);
  if (projectId && found.page.project_id !== projectId) return refuse("pageNotFound");

  // L'extrait : on le RELIT dans le document plutôt que de le demander à
  // l'agent. Un extrait dicté serait une citation qu'il aurait pu reformuler,
  // affichée à l'humain comme le texte de sa page.
  const quote = blockId
    ? (pageBlockTexts((found.page.content as JSONContent | null) ?? null).find(
        (block) => block.blockId === blockId
      )?.text ?? null)
    : null;

  const result = await addPageComment({
    pageId,
    actorId,
    body,
    blockId: blockId ?? null,
    quote,
    parentId: parentCommentId ?? null,
    viaAssistant,
    mcpKeyId,
  });
  if (!result.ok) return COMMENT_REFUSALS[result.errorKey];
  return {
    ok: true,
    data: { page_id: pageId, comment_id: result.comment.id as string },
  };
}

/**
 * Le nom du dernier auteur, tel que la règle d'identité de minddy l'impose.
 *
 * Une écriture d'agent porte l'id du compte qui l'a permise ; on ne le lit
 * pas — le rendre ferait passer pour sien, aux yeux de l'agent suivant, un
 * texte que personne n'a écrit.
 */
async function lastWriterName(page: Page): Promise<string> {
  if (page.updated_kind === "agent") return SITE_NAME;
  const id = page.updated_by ?? page.created_by;
  if (!id) return "";
  const users = await fetchAuthUsersById(getServiceClient(), [id]);
  const user = users.get(id);
  return user ? displayName(toNamed(user), "") : "";
}

/** Une page trouvée : de quoi décider laquelle ouvrir, sans l'ouvrir. */
export interface PageSearchResult {
  page_id: string;
  title: string;
  icon: string | null;
  /** Le chemin des ancêtres, du plus haut au parent direct — « Specs › API ».
      Deux pages « Notes » dans un wiki, c'est le chemin qui les distingue. */
  path: string[];
  /** Le passage du corps qui a répondu. Vide quand seul le titre a répondu. */
  excerpt: string;
  updated_at: string;
}

/**
 * Chercher dans le wiki, titre ET contenu (MIN-276).
 *
 * C'est l'outil qui manquait le plus à un agent : sans lui, « où a-t-on écrit
 * la décision sur X » se répond en lisant le wiki entier, ou ne se répond pas.
 * L'arbre (`list_pages`) dit ce qui existe, pas ce qui parle de quoi.
 *
 * Le chemin d'ancêtres est reconstruit ici, à partir de la liste à plat que le
 * noyau rend déjà — une requête de plus, sans corps, contre un aller-retour par
 * page côté agent.
 */
export async function searchPagesForAgent({
  projectId,
  actorId,
  query,
  limit,
}: {
  projectId: string;
  actorId: string;
  query: string;
  limit?: number;
}): Promise<PageToolResult<{ query: string; pages: PageSearchResult[] }>> {
  if (!query.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: "query must carry the words to look for.",
    };
  }

  const found = await searchProjectPages({ projectId, actorId, query, limit });
  if (!found.ok) return refuse(found.errorKey);
  if (found.hits.length === 0) {
    return { ok: true, data: { query, pages: [] } };
  }

  const all = await listPages(projectId, actorId);
  const byId = new Map(
    (all.ok ? all.pages : []).map((page) => [page.id, page] as const)
  );
  const pathOf = (parentId: string | null): string[] => {
    const path: string[] = [];
    let cursor = parentId;
    // Le garde-fou vaut mieux qu'une confiance : la profondeur est illimitée,
    // et une boucle dans les données ferait tourner cette remontée sans fin.
    while (cursor && path.length < 20) {
      const parent = byId.get(cursor);
      if (!parent) break;
      path.unshift(parent.title || "(untitled)");
      cursor = parent.parent_id ?? null;
    }
    return path;
  };

  return {
    ok: true,
    data: {
      query,
      pages: found.hits.map((hit) => ({
        page_id: hit.id,
        title: hit.title,
        icon: hit.icon,
        path: pathOf(hit.parent_id),
        excerpt: hit.excerpt,
        updated_at: hit.updated_at,
      })),
    },
  };
}

/* ─── Écriture ─────────────────────────────────────────────────────────────── */

/**
 * Le corps, lu depuis le markdown de l'agent.
 *
 * `consumeHead` décide du sort d'un `# ` en tête : CONSOMMÉ comme titre (et son
 * émoji comme icône), ou gardé comme du contenu. C'est le point délicat de tout
 * ce module, et il ne se voit qu'au deuxième aller-retour.
 *
 * À la CRÉATION sans titre, consommer est le service rendu : Numo écrit une page
 * entière d'un seul jet, en-tête compris, comme le fait `markdownToPage`
 * (MIN-269). Le champ `title` est requis côté outil (un petit modèle ne remplit
 * pas un champ optionnel), donc « je n'ai pas de titre à part » s'écrit
 * forcément `""` — d'où le titre vide traité comme absent.
 *
 * À la MISE À JOUR, jamais. Un bloc titre de niveau 1 est un bloc de page
 * parfaitement légitime : `minddy_get_page` rend donc des corps qui COMMENCENT
 * par `# `, et les renvoyer tels quels à `minddy_update_page` ferait remonter
 * cette première ligne dans le titre de la page — un document qui perd son
 * premier titre à chaque écriture, sans que rien ne le dise. Sur une page qui
 * existe, un corps est un corps.
 */
async function readBody(
  markdown: string,
  { consumeHead }: { consumeHead: boolean }
): Promise<
  | { ok: true; content: JSONContent | null; title?: string; icon?: string | null }
  | { ok: false; code: PageToolCode; message: string }
> {
  if (markdown.length > MAX_PAGE_MARKDOWN) {
    return {
      ok: false,
      code: "page_too_large",
      message:
        `The markdown body is capped at ${MAX_PAGE_MARKDOWN} characters (got ` +
        `${markdown.length}); split the page into subpages.`,
    };
  }
  if (consumeHead) {
    const projected = await markdownToPageServer(markdown);
    if (projected.title || projected.icon) {
      return {
        ok: true,
        content: projected.content,
        title: projected.title,
        icon: projected.icon,
      };
    }
    return { ok: true, content: projected.content };
  }
  return { ok: true, content: await bodyFromMarkdownServer(markdown) };
}

export async function createPageForAgent({
  projectId,
  actorId,
  title,
  icon,
  markdown,
  parentPageId,
  mcpKeyId,
}: {
  projectId: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  parentPageId?: string | null;
  /** La clé MCP derrière l'appel, quand la surface en a une (MIN-278) : c'est
      elle qui NOMME l'agent dans l'activité de la page et dans les citations
      qu'il y pose. Absente sur le chat et sur l'agent de code, qui sont Numo. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  const input: Record<string, unknown> = {
    parent_id: parentPageId ?? null,
  };
  let body = "";

  if (markdown !== undefined && markdown.trim()) {
    const read = await readBody(markdown, { consumeHead: !title?.trim() });
    if (!read.ok) return read;
    input.content = read.content;
    if (read.title !== undefined) input.title = read.title;
    if (read.icon !== undefined) input.icon = read.icon;
    body = markdown;
  }
  if (title?.trim()) input.title = title;
  if (icon !== undefined) input.icon = icon;
  if (input.title === undefined) input.title = "";

  const result = await createPage({
    projectId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input,
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: body.trim().length,
    },
  };
}

/**
 * Remplacer le corps, le titre, l'icône. Les champs absents ne bougent pas.
 *
 * `version` est le garde-fou de l'écriture concurrente (MIN-271) : passée, elle
 * fait échouer l'écriture si quelqu'un — un humain dans l'éditeur, un autre
 * agent — a écrit le corps entre-temps. C'est le même verrou que celui de
 * l'éditeur, et c'est pour ça qu'un agent qui remplace un corps devrait toujours
 * la passer.
 */
export async function updatePageForAgent({
  pageId,
  projectId,
  actorId,
  title,
  icon,
  markdown,
  version,
  parentPageId,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  version?: number;
  parentPageId?: string | null;
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (
    !title?.trim() &&
    icon === undefined &&
    markdown === undefined &&
    parentPageId === undefined
  ) {
    return refuse("noFieldsToUpdate");
  }

  // La garde de projet ne peut pas vivre dans le noyau (il travaille par id de
  // page) : on relit la page pour la poser, et cette lecture sert aussi de 404
  // franc avant d'écrire.
  if (projectId) {
    const current = await getPage(pageId, actorId);
    if (!current.ok) return refuse(current.errorKey);
    if (current.page.project_id !== projectId) return refuse("pageNotFound");
  }

  const input: Record<string, unknown> = {};
  let body = "";
  if (markdown !== undefined) {
    // Pas de consommation d'en-tête sur une page qui existe : cf. `readBody`.
    const read = await readBody(markdown, { consumeHead: false });
    if (!read.ok) return read;
    input.content = read.content ?? { type: "doc", content: [] };
    if (version !== undefined) input.version = version;
    body = markdown;
  }
  if (title?.trim()) input.title = title;
  if (icon !== undefined) input.icon = icon;
  if (parentPageId !== undefined) input.parent_id = parentPageId;

  const result = await updatePage({
    pageId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input,
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: body.trim().length,
    },
  };
}

/**
 * Ajouter un bloc EN FIN de page, sans renvoyer le document.
 *
 * La page est relue, le bloc collé au bout du markdown, et l'écriture repart
 * avec la `version` qui vient d'être lue : si quelqu'un a écrit dans
 * l'intervalle, l'ajout est refusé plutôt que d'écraser. C'est le même patron
 * que `minddy_append_to_plan`, à la fusion près — un plan est un champ texte,
 * une page un document versionné.
 */
export async function appendToPageForAgent({
  pageId,
  projectId,
  actorId,
  markdown,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  markdown: string;
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (!markdown.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: "markdown must carry the block to add.",
    };
  }

  const current = await readPageForAgent({
    pageId,
    projectId,
    actorId,
    withBacklinks: false,
  });
  if (!current.ok) return current;

  const body = current.data.markdown.trim();
  const next = body ? `${body}\n\n${markdown.trim()}` : markdown.trim();

  return writeBody({
    pageId,
    actorId,
    markdown: next,
    version: current.data.version,
    mcpKeyId,
  });
}

/** Réécrire UN passage du corps : `old_string` → `new_string`. */
export async function editPageTextForAgent({
  pageId,
  projectId,
  actorId,
  oldString,
  newString,
  replaceAll = false,
  tools,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  /** Les noms que porte la surface appelante, pour que les refus renvoient vers
      des tools qui existent chez elle (cf. IssueTextTools). */
  tools: { read: string; replaceWhole: string };
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<
  PageToolResult<PageWritten & { diff: string; additions: number; deletions: number }>
> {
  const current = await readPageForAgent({
    pageId,
    projectId,
    actorId,
    withBacklinks: false,
  });
  if (!current.ok) return current;

  const edit = editTextPassage({
    field: "body",
    subject: "page",
    current: current.data.markdown,
    oldString,
    newString,
    replaceAll,
    read: tools.read,
    otherWay: `Use ${tools.replaceWhole} to write the whole body.`,
  });
  if (!edit.ok) return { ok: false, code: edit.code, message: edit.message };

  const written = await writeBody({
    pageId,
    actorId,
    markdown: edit.content,
    version: current.data.version,
    mcpKeyId,
  });
  if (!written.ok) return written;
  return {
    ok: true,
    data: {
      ...written.data,
      diff: edit.diff,
      additions: edit.additions,
      deletions: edit.deletions,
    },
  };
}

/** Le corps seul, écrit sur une version lue. Le titre et l'icône ne bougent
    pas : un `# ` en tête d'un ajout est du CONTENU, pas un renommage. */
async function writeBody({
  pageId,
  actorId,
  markdown,
  version,
  mcpKeyId,
}: {
  pageId: string;
  actorId: string;
  markdown: string;
  version: number;
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (markdown.length > MAX_PAGE_MARKDOWN) {
    return {
      ok: false,
      code: "page_too_large",
      message:
        `The page body would reach ${markdown.length} characters, over the ` +
        `${MAX_PAGE_MARKDOWN} cap; split it into subpages.`,
    };
  }
  const content = await bodyFromMarkdownServer(markdown);
  const result = await updatePage({
    pageId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input: { content, version },
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: markdown.trim().length,
    },
  };
}
