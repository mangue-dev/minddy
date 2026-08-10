import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  descendantIds,
  isPosition,
  positionAtEnd,
  wouldCreateCycle,
  type Page,
} from "@/lib/pages";

/**
 * Les PAGES d'un projet (MIN-266) — le noyau serveur, partagé par les routes
 * (`app/api/projects/[id]/pages/**`) et, plus tard, par le MCP.
 *
 * TOUT passe par le client service, RLS contournée : le contrôle d'accès vit
 * donc ici, dans `access()`, et il est le même pour les six gestes — lire,
 * créer, modifier, déplacer, corbeiller, restaurer. Membre du projet = tous les
 * droits, comme pour les objectifs : un wiki d'équipe qui demanderait une
 * permission par page n'est plus un wiki d'équipe.
 *
 * Deux raisons de ne PAS écrire au client de session, alors que la policy
 * `pages_update` le permettrait :
 *
 * 1. la garde de CYCLE (`wouldCreateCycle`) a besoin de lire toutes les pages
 *    du projet, corbeillées comprises, avant d'écrire — ce que la policy de
 *    lecture masque justement ;
 * 2. la corbeille rend la ligne invisible à `pages_select`, donc le RETURNING
 *    d'un `update` fait au client de session ne la rendrait plus et la route
 *    croirait à un 404 (même piège que `lib/server/trash.ts`).
 */

export type PageResult<T> =
  | { ok: true; page: T }
  | { ok: false; status: number; errorKey: PageErrorKey };

export type PageErrorKey =
  | "projectNotFound"
  | "pageNotFound"
  | "pageParentNotFound"
  | "pageCycle"
  | "pageTooLarge"
  | "noFieldsToUpdate"
  | "databaseError";

/** Le titre d'une page : même plafond qu'un titre de ticket (MIN-118). */
const MAX_TITLE_LENGTH = 500;

/**
 * Le corps, en octets de JSON. Un document ProseMirror de 1 Mo, c'est déjà une
 * page qu'aucun éditeur ne rend confortablement ; au-delà on refuse plutôt que
 * de laisser une écriture faire tomber la requête sur une limite de plateforme,
 * là où l'utilisateur ne comprendrait rien au message.
 */
const MAX_CONTENT_BYTES = 1_000_000;

/** Un emoji, pas une phrase : on borne court plutôt que de valider un alphabet. */
const MAX_ICON_LENGTH = 16;

/**
 * Les colonnes de la LISTE. Le corps en est absent, volontairement : la sidebar
 * charge toutes les pages du projet d'un coup (c'est tout l'intérêt du modèle à
 * plat), et y joindre chaque document ProseMirror ferait de cette requête la
 * plus lourde de l'écran pour un contenu que personne n'affiche. Le corps se
 * lit page par page, à l'ouverture.
 */
const LIST_COLUMNS =
  "id, project_id, parent_id, title, icon, version, position, created_by, created_at, updated_at, deleted_at, deleted_by, deleted_root_id";

const FULL_COLUMNS = `${LIST_COLUMNS}, content`;

/** Une page sans son corps — ce que rend la liste. */
export type PageSummary = Omit<Page, "content">;

type Service = ReturnType<typeof getServiceClient>;

/* ─── Accès ────────────────────────────────────────────────────────────────── */

/** Le projet doit être accessible à l'acteur, sinon il n'existe pas pour lui. */
async function access(actorId: string, projectId: string): Promise<boolean> {
  return (await getProjectAccess(actorId, projectId)) !== null;
}

/**
 * Une page et son projet, ou null. `includeTrashed` n'est vrai que pour les
 * gestes qui portent justement sur une page corbeillée (restaurer).
 */
async function loadPage(
  service: Service,
  pageId: string,
  { includeTrashed = false }: { includeTrashed?: boolean } = {}
): Promise<Page | null> {
  const query = service.from("pages").select(FULL_COLUMNS).eq("id", pageId);
  if (!includeTrashed) query.is("deleted_at", null);
  const { data } = await query.maybeSingle();
  return (data as Page | null) ?? null;
}

/**
 * Toutes les pages du projet, corbeillées comprises, en une requête.
 *
 * C'est la lecture qui rend la garde de cycle possible : reparenter demande de
 * connaître la chaîne des ancêtres, et la reconstituer par sauts successifs
 * serait un N+1 dont la profondeur est justement illimitée.
 */
async function loadProjectPages(
  service: Service,
  projectId: string
): Promise<Page[]> {
  const { data } = await service
    .from("pages")
    .select("id, parent_id, position, deleted_at, deleted_root_id")
    .eq("project_id", projectId);
  return (data ?? []) as unknown as Page[];
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** Les pages VIVANTES du projet, à plat. L'arbre se reconstruit chez l'appelant. */
export async function listPages(
  projectId: string,
  actorId: string
): Promise<
  { ok: true; pages: PageSummary[] } | { ok: false; status: number; errorKey: PageErrorKey }
> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const { data, error } = await getServiceClient()
    .from("pages")
    .select(LIST_COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) {
    console.error("[pages] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, pages: (data ?? []) as unknown as PageSummary[] };
}

/** Une page avec son corps. */
export async function getPage(
  pageId: string,
  actorId: string
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  return { ok: true, page };
}

/* ─── Création ─────────────────────────────────────────────────────────────── */

export async function createPage({
  projectId,
  actorId,
  input,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<PageResult<Page>> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const service = getServiceClient();
  const parentId = typeof input.parent_id === "string" ? input.parent_id : null;

  const all = await loadProjectPages(service, projectId);
  if (parentId) {
    // Le parent doit exister, appartenir au MÊME projet et être vivant : créer
    // sous une page corbeillée fabriquerait une page invisible dès sa naissance.
    const parent = all.find((p) => p.id === parentId && !p.deleted_at);
    if (!parent) return { ok: false, status: 404, errorKey: "pageParentNotFound" };
  }

  const content = readContent(input.content);
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    parent_id: parentId,
    title: readTitle(input.title) ?? "",
    icon: readIcon(input.icon),
    position: positionAtEnd(
      all.filter((p) => !p.deleted_at && (p.parent_id ?? null) === parentId)
    ),
    created_by: actorId,
  };
  if (content !== undefined) row.content = content;

  const { data, error } = await service
    .from("pages")
    .insert(row)
    .select(FULL_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[pages] create failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, page: data as unknown as Page };
}

/* ─── Modification ─────────────────────────────────────────────────────────── */

/**
 * Modifie une page. Les champs absents ne bougent pas.
 *
 * `parent_id` est le seul qui puisse être REFUSÉ : la profondeur étant
 * illimitée, mettre une page sous un de ses propres descendants fermerait une
 * boucle et ferait partir la sidebar en récursion infinie. 409, et rien n'est
 * écrit — pas même les autres champs de la même requête, qui seraient sinon
 * appliqués « à moitié » sur un geste que l'utilisateur croit refusé.
 *
 * Un reparentage sans `position` explicite replace la page en fin de sa NOUVELLE
 * fratrie : garder l'ancienne clé la ferait atterrir à une place arbitraire au
 * milieu de pages qui n'ont rien à voir.
 */
export async function updatePage({
  pageId,
  actorId,
  input,
}: {
  pageId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const patch: Record<string, unknown> = {};

  const title = readTitle(input.title);
  if (title !== undefined) patch.title = title;

  if ("icon" in input) patch.icon = readIcon(input.icon);

  const content = readContent(input.content);
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }
  if (content !== undefined) {
    patch.content = content;
    // `version` compte les écritures du CORPS, pas les renommages : c'est de
    // lui que MIN-271 fera son garde-fou de sauvegarde concurrente.
    patch.version = page.version + 1;
  }

  const moving = "parent_id" in input;
  if (moving) {
    const nextParentId =
      typeof input.parent_id === "string" ? input.parent_id : null;
    const all = await loadProjectPages(service, page.project_id);

    if (nextParentId) {
      const parent = all.find((p) => p.id === nextParentId && !p.deleted_at);
      if (!parent) {
        return { ok: false, status: 404, errorKey: "pageParentNotFound" };
      }
    }
    if (wouldCreateCycle(all, pageId, nextParentId)) {
      return { ok: false, status: 409, errorKey: "pageCycle" };
    }

    patch.parent_id = nextParentId;
    if (!isPosition(input.position)) {
      patch.position = positionAtEnd(
        all.filter(
          (p) =>
            !p.deleted_at &&
            p.id !== pageId &&
            (p.parent_id ?? null) === nextParentId
        )
      );
    }
  }

  // Une position explicite vient du glisser-déposer : le client a calculé la
  // clé entre les deux voisines qu'il voit (`positionBetween`). Hors alphabet,
  // elle trierait n'importe où — on l'ignore plutôt que de l'écrire.
  if (isPosition(input.position)) patch.position = input.position;

  if (Object.keys(patch).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const { data, error } = await service
    .from("pages")
    .update(patch)
    .eq("id", pageId)
    .is("deleted_at", null)
    .select(FULL_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[pages] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "pageNotFound" };
  return { ok: true, page: data as unknown as Page };
}

/* ─── Corbeille ────────────────────────────────────────────────────────────── */

/**
 * Met une page à la corbeille AVEC toute sa descendance (MIN-266).
 *
 * Récursive parce que le geste qui l'appelle le plus souvent n'est pas un
 * bouton « supprimer » : c'est l'effacement du bloc sous-page dans le corps du
 * parent (MIN-272). Laisser les descendants vivants ferait apparaître vingt
 * pages orphelines à la racine de la sidebar pour une ligne de texte effacée.
 *
 * `deleted_root_id` marque les descendants et NON la racine : la corbeille
 * n'affiche donc qu'une ligne pour tout l'arbre, et la restauration retrouve
 * exactement ce qui est parti ensemble. Une sous-page DÉJÀ à la corbeille avant
 * ce geste n'est pas retouchée (`is deleted_at null`) : elle garde sa propre
 * racine, et restaurer le parent ne la ramène pas — ce que personne n'a demandé.
 */
export async function trashPage(
  pageId: string,
  actorId: string
): Promise<{ ok: true; trashed: number } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const descendants = descendantIds(
    all.filter((p) => !p.deleted_at),
    pageId
  );
  const deletedAt = new Date().toISOString();

  const { error: rootError } = await service
    .from("pages")
    .update({ deleted_at: deletedAt, deleted_by: actorId, deleted_root_id: null })
    .eq("id", pageId)
    .is("deleted_at", null);
  if (rootError) {
    console.error("[pages] trash failed:", rootError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  if (descendants.length > 0) {
    const { error } = await service
      .from("pages")
      .update({
        deleted_at: deletedAt,
        deleted_by: actorId,
        deleted_root_id: pageId,
      })
      .in("id", descendants)
      .is("deleted_at", null);
    if (error) {
      console.error("[pages] trash descendants failed:", error.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  return { ok: true, trashed: descendants.length + 1 };
}

/**
 * Restaure une page et tout ce qui est parti avec elle.
 *
 * Le cas qui compte : la page restaurée avait un parent, lui-même encore à la
 * corbeille (il a été supprimé séparément, ou l'utilisateur restaure depuis la
 * corbeille une page dont l'arbre a bougé). Rendre l'enfant sans le parent le
 * laisserait VISIBLE nulle part — la sidebar ne l'affiche pas, et sa page est
 * un lien mort. Il remonte donc à la racine, en fin de fratrie : mal placé
 * plutôt qu'introuvable.
 */
export async function restorePage(
  pageId: string,
  actorId: string
): Promise<{ ok: true; restored: number } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, { includeTrashed: true });
  if (!page || !page.deleted_at) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const family = [pageId, ...all.filter((p) => p.deleted_root_id === pageId).map((p) => p.id)];

  const { error } = await service
    .from("pages")
    .update({ deleted_at: null, deleted_by: null, deleted_root_id: null })
    .in("id", family);
  if (error) {
    console.error("[pages] restore failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Le parent est-il encore absent ? (Corbeillé de son côté, ou purgé.)
  const parent = page.parent_id
    ? all.find((p) => p.id === page.parent_id && !p.deleted_at)
    : null;
  if (page.parent_id && !parent) {
    const { error: liftError } = await service
      .from("pages")
      .update({
        parent_id: null,
        position: positionAtEnd(
          all.filter((p) => !p.deleted_at && p.parent_id === null)
        ),
      })
      .eq("id", pageId);
    if (liftError) {
      console.error("[pages] restore lift failed:", liftError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  return { ok: true, restored: family.length };
}

/* ─── Lecture des entrées ──────────────────────────────────────────────────── */

function readTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, MAX_TITLE_LENGTH);
}

function readIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const icon = value.trim();
  return icon ? icon.slice(0, MAX_ICON_LENGTH) : null;
}

/**
 * Le corps ProseMirror. `undefined` = le champ n'est pas dans la requête,
 * `"too-large"` = refusé. Une valeur qui n'est pas un objet est ignorée plutôt
 * que refusée : c'est le même traitement qu'un statut inconnu ailleurs, et le
 * seul dommage possible est de ne pas écrire ce qu'on n'a pas su lire.
 */
function readContent(value: unknown): unknown | undefined | "too-large" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  if (JSON.stringify(value).length > MAX_CONTENT_BYTES) return "too-large";
  return value;
}
