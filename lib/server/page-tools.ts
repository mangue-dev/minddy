import "server-only";

import type { JSONContent } from "@tiptap/core";
import {
  createPage,
  getPage,
  listPages,
  updatePage,
  type PageErrorKey,
} from "@/lib/server/pages";
import {
  bodyFromMarkdownServer,
  markdownToPageServer,
  pageBodyToMarkdownServer,
} from "@/lib/server/pages-projection";
import { editTextPassage } from "@/lib/server/text-edit";

/**
 * LES SIX GESTES d'un agent sur les pages (MIN-273), une seule fois.
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
  pageParentNotFound: "parent_not_found",
  pageCycle: "page_cycle",
  pageStale: "page_stale",
  pageNotEmpty: "page_not_empty",
  pageTooLarge: "page_too_large",
  noFieldsToUpdate: "invalid_params",
  databaseError: "database_error",
};

/** Les refus du noyau, dits en anglais et en codes stables — comme le reste de
    la surface agent (cf. lib/server/mcp/tool-helpers.ts). */
const MESSAGES: Record<PageErrorKey, string> = {
  projectNotFound: "Project not found or not accessible.",
  pageNotFound: "Page not found in this project.",
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
  /** Le corps SEUL, en markdown (le titre et l'icône sont au-dessus). */
  markdown: string;
  /** Le compteur d'écritures du corps — à repasser pour écrire sans écraser. */
  version: number;
  /** Les sous-pages DIRECTES, pour descendre l'arbre sans un second appel. */
  subpages: Array<{ page_id: string; title: string; icon: string | null }>;
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
}: {
  pageId: string;
  /** Le projet attendu : une page d'un AUTRE projet accessible ne répond pas ici. */
  projectId?: string;
  actorId: string;
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

  return {
    ok: true,
    data: { ...entry(page), markdown, version: page.version, subpages },
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
}: {
  projectId: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  parentPageId?: string | null;
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

  const result = await createPage({ projectId, actorId, input });
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
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  version?: number;
  parentPageId?: string | null;
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

  const result = await updatePage({ pageId, actorId, input });
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
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  markdown: string;
}): Promise<PageToolResult<PageWritten>> {
  if (!markdown.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: "markdown must carry the block to add.",
    };
  }

  const current = await readPageForAgent({ pageId, projectId, actorId });
  if (!current.ok) return current;

  const body = current.data.markdown.trim();
  const next = body ? `${body}\n\n${markdown.trim()}` : markdown.trim();

  return writeBody({
    pageId,
    actorId,
    markdown: next,
    version: current.data.version,
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
}): Promise<
  PageToolResult<PageWritten & { diff: string; additions: number; deletions: number }>
> {
  const current = await readPageForAgent({ pageId, projectId, actorId });
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
}: {
  pageId: string;
  actorId: string;
  markdown: string;
  version: number;
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
