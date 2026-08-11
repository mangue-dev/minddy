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
import { appendSubpage, remapSubpages, removeSubpages } from "@/lib/pages-subpage";
import { bodyFromMarkdownServer } from "@/lib/server/pages-projection";
import {
  queueSearchText,
  runPageSearch,
  type PageSearchHit,
} from "@/lib/server/pages-search";
import type { PageDocJSON } from "@/lib/pages-merge";

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
 *
 * Depuis MIN-276, une règle de plus, et c'est un INVARIANT du module : **toute
 * écriture de `content` est suivie de `queueSearchText`**, qui rejoue la
 * projection markdown dans la colonne `search_text` — celle qu'indexe la
 * recherche. Un chemin d'écriture qui l'oublie ne casse rien de visible : il
 * laisse simplement la page introuvable par son contenu, en silence. D'où le
 * test STRUCTUREL de `pages-search-paths.test.ts`, qui relit ce fichier et
 * refuse un `insert`/`update` portant `content` sans son rattrapage.
 */

export type PageResult<T> =
  | { ok: true; page: T }
  | {
      ok: false;
      status: number;
      errorKey: PageErrorKey;
      /**
       * La page TELLE QU'ELLE EST en base, jointe au refus de version (MIN-271).
       * Sans elle, le client n'aurait qu'un 409 et devrait redemander le
       * document pour fusionner — un aller-retour de plus au pire moment, celui
       * où deux personnes écrivent en même temps.
       */
      conflict?: Page;
    };

export type PageErrorKey =
  | "projectNotFound"
  | "pageNotFound"
  | "pageParentNotFound"
  | "pageCycle"
  | "pageStale"
  | "pageNotEmpty"
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
  "id, project_id, parent_id, title, icon, version, position, favorite, created_by, created_at, updated_at, deleted_at, deleted_by, deleted_root_id, parent_block_removed";

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

/**
 * Chercher dans les pages d'UN projet, titre et contenu (MIN-276).
 *
 * Le tri et l'extrait viennent de Postgres (`search_pages`, cf. la migration) :
 * `ts_rank_cd` sait ce qu'un `ilike` ne saura jamais — qu'un mot en titre pèse
 * plus qu'un mot cité en passant, et où couper la phrase qui explique le
 * résultat.
 *
 * Une requête vide rend une liste vide SANS aller en base : c'est l'état de la
 * barre de recherche à l'ouverture, et il ne vaut pas un aller-retour.
 */
export async function searchProjectPages({
  projectId,
  actorId,
  query,
  limit = 20,
}: {
  projectId: string;
  actorId: string;
  query: string;
  limit?: number;
}): Promise<
  | { ok: true; hits: PageSearchHit[] }
  | { ok: false; status: number; errorKey: PageErrorKey }
> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }
  if (!query.trim()) return { ok: true, hits: [] };

  const result = await runPageSearch(getServiceClient(), {
    query,
    projectId,
    limit,
  });
  if (!result.ok) return { ok: false, status: 500, errorKey: "databaseError" };
  return { ok: true, hits: result.hits };
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

  // Le corps peut arriver en MARKDOWN plutôt qu'en JSON ProseMirror : c'est par
  // là que le wizard de projet pose le brief collé en page « Brief initial »
  // (MIN-170). La projection est la MÊME que celle des outils de Numo
  // (lib/server/pages-projection.ts) — une page écrite par le wizard et une
  // page écrite par l'agent se relisent donc pareil, blocs et ids compris.
  //
  // La faire ICI et non chez l'appelant a deux effets : le schéma de page
  // (tiptap, le registre de blocs) reste hors du bundle du navigateur, et le
  // plafond de taille pèse le JSON PRODUIT, celui qui part vraiment en base.
  //
  // `content` l'emporte quand les deux sont là : c'est le format natif.
  const raw =
    input.content === undefined && typeof input.markdown === "string"
      ? await bodyFromMarkdownServer(input.markdown)
      : input.content;

  const content = readContent(raw);
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
  const page = data as unknown as Page;
  queueSearchText(service, [page.id]);
  return { ok: true, page };
}

/* ─── Duplication ──────────────────────────────────────────────────────────── */

/**
 * Copie une page ET toute sa descendance (MIN-272).
 *
 * Deux choses la distinguent d'un `insert` de plus, et les deux comptent :
 *
 * 1. **les liens internes sont réécrits.** Recopier les corps tels quels
 *    donnerait une copie dont les blocs sous-page pointent encore vers les
 *    ORIGINAUX — deux arbres dans la sidebar, un seul jeu de liens. D'où les
 *    ids tirés AVANT l'écriture : il faut connaître la table
 *    `ancien → nouveau` pour réécrire les corps, donc on ne peut pas laisser la
 *    base les fabriquer. Une citation hors de la branche copiée reste intacte.
 * 2. **une seule écriture.** Le tableau part d'un coup : une copie à moitié
 *    faite laisserait des pages orphelines qu'il faudrait retrouver à la main.
 *
 * La copie prend le MÊME titre. Un suffixe « (copie) » demanderait une
 * traduction, donc ferait dépendre une donnée de la langue de qui a cliqué —
 * et la page s'ouvre juste après, où le titre se change en une frappe.
 *
 * La racine reste chez le même parent, en fin de fratrie ; les descendants
 * gardent leur position, l'ordre interne de la branche est donc préservé.
 */
export async function duplicatePage(
  pageId: string,
  actorId: string
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const live = all.filter((p) => !p.deleted_at);
  // `descendantIds` rend les descendants en largeur, donc les parents avant
  // leurs enfants : l'ordre d'insertion satisfait la clé étrangère de lui-même.
  const family = [pageId, ...descendantIds(live, pageId)];

  const { data: sources, error: readError } = await service
    .from("pages")
    .select(FULL_COLUMNS)
    .in("id", family);
  if (readError || !sources) {
    console.error("[pages] duplicate read failed:", readError?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const byId = new Map((sources as unknown as Page[]).map((row) => [row.id, row]));
  const idMap = new Map(family.map((id) => [id, crypto.randomUUID()]));
  const rootPosition = positionAtEnd(
    live.filter((p) => (p.parent_id ?? null) === (page.parent_id ?? null))
  );

  const rows = family.flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    const root = id === pageId;
    return [
      {
        id: idMap.get(id)!,
        project_id: source.project_id,
        // La RACINE reste où elle est ; les descendants suivent leur parent
        // COPIÉ, jamais l'original — sans quoi la copie s'accrocherait à l'arbre
        // d'origine et les deux branches se mélangeraient.
        parent_id: root
          ? source.parent_id
          : (idMap.get(source.parent_id ?? "") ?? null),
        title: source.title,
        icon: source.icon,
        content: remapSubpages(source.content as PageDocJSON | null, idMap),
        position: root ? rootPosition : source.position,
        created_by: actorId,
      },
    ];
  });

  const { data, error } = await service
    .from("pages")
    .insert(rows)
    .select(FULL_COLUMNS);
  if (error || !data) {
    console.error("[pages] duplicate failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Toute la branche, pas seulement la racine : chaque copie porte son propre
  // corps (les liens internes y ont même été réécrits), donc son propre texte.
  queueSearchText(
    service,
    (data as unknown as Page[]).map((row) => row.id)
  );

  const rootId = idMap.get(pageId);
  const copy = (data as unknown as Page[]).find((row) => row.id === rootId);
  if (!copy) return { ok: false, status: 500, errorKey: "databaseError" };
  return { ok: true, page: copy };
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

  // Le favori est un booléen NU : partagé par le projet, il n'a ni ordre ni
  // propriétaire à écrire à côté (cf. la migration `pages_favorite`).
  if (typeof input.favorite === "boolean") patch.favorite = input.favorite;

  const content = readContent(input.content);
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }

  // La VERSION sur laquelle l'écriture s'appuie (MIN-271). Elle n'a de sens
  // qu'avec un corps : renommer une page ne se dispute avec personne.
  const expected =
    content !== undefined && typeof input.version === "number"
      ? input.version
      : null;
  if (expected !== null && expected !== page.version) {
    return { ok: false, status: 409, errorKey: "pageStale", conflict: page };
  }

  if (content !== undefined) {
    patch.content = content;
    // `version` compte les écritures du CORPS, pas les renommages : c'est le
    // garde-fou de la sauvegarde concurrente (MIN-271).
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

  // Le verrou est DANS l'écriture, pas seulement dans le contrôle ci-dessus :
  // deux enregistrements partis à la même milliseconde passent tous les deux le
  // contrôle (ils ont lu la même ligne) et le second effacerait le premier. La
  // condition `version = celle qu'on a lue` fait que l'un des deux n'écrit
  // rien, et repart en fusion comme s'il avait été refusé d'emblée.
  const write = service.from("pages").update(patch).eq("id", pageId);
  if (expected !== null) write.eq("version", expected);

  const { data, error } = await write
    .is("deleted_at", null)
    .select(FULL_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[pages] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    // Aucune ligne : soit la page vient de partir à la corbeille, soit la
    // version a bougé entre la lecture et l'écriture. On relit pour trancher —
    // les deux réponses ne se rattrapent pas de la même façon.
    if (expected !== null) {
      const fresh = await loadPage(service, pageId);
      if (fresh) {
        return { ok: false, status: 409, errorKey: "pageStale", conflict: fresh };
      }
    }
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  // Le titre entre dans l'index par la colonne générée, sans rien à écrire ; le
  // corps, lui, a besoin de sa projection. La file ne part donc que quand le
  // corps a bougé — un renommage n'a aucun texte à rejouer.
  if (patch.content !== undefined) queueSearchText(service, [pageId]);
  return { ok: true, page: data as unknown as Page };
}

/* ─── Le miroir : le bloc sous-page dans le corps du parent ────────────────── */

/**
 * La même information est portée à deux endroits, et c'est là que sont tous les
 * pièges (MIN-272) : `parent_id` fait la vérité, le bloc `subpage` du corps du
 * parent n'en est qu'une VUE. Ces deux fonctions tiennent la vue à jour quand la
 * vérité bouge.
 *
 * Pourquoi ici, et pas dans l'éditeur : mettre une page à la corbeille depuis
 * l'arbre doit retirer son bloc du corps du parent **même si personne n'a le
 * parent ouvert** — et c'est le cas courant. Un geste fait dans la sidebar, ou
 * par Numo via le MCP, doit laisser la base cohérente sans qu'un navigateur y
 * soit pour quelque chose.
 *
 * Ce que ça fait à un client qui a justement ce parent sous les yeux : sa
 * prochaine sauvegarde part sur une `version` périmée, donc en 409, et la fusion
 * de MIN-271 avale la suppression SANS BRUIT — un bloc qu'il n'a pas touché et
 * que le distant a retiré s'en va sans bandeau (lib/pages-merge.ts, `decide`).
 * Le bloc reste visible à l'écran jusque-là, en état orphelin, ce que sa vue
 * sait rendre.
 *
 * Une panne sur cette écriture-là ne fait PAS échouer le geste : la page est
 * bien à la corbeille, et un bloc orphelin de plus se rend proprement. Refuser
 * la suppression parce que le miroir n'a pas suivi serait le mauvais échange.
 */
async function syncParentBody(
  service: Service,
  parentId: string,
  edit: (doc: PageDocJSON | null) => { doc: PageDocJSON; changed: boolean }
): Promise<void> {
  const parent = await loadPage(service, parentId);
  if (!parent) return;

  const { doc, changed } = edit((parent.content as PageDocJSON | null) ?? null);
  if (!changed) return;

  // `version` est incrémentée comme pour n'importe quelle écriture du corps :
  // c'est ce compteur qui déclenche la fusion chez qui édite en même temps.
  // La condition sur la version lue fait le reste — si quelqu'un a écrit entre
  // la lecture et ici, on ne l'écrase pas ; son propre enregistrement suivant
  // repassera par la fusion, et le bloc orphelin se rendra en attendant.
  const { error } = await service
    .from("pages")
    .update({ content: doc, version: parent.version + 1 })
    .eq("id", parentId)
    .eq("version", parent.version)
    .is("deleted_at", null);
  if (error) console.error("[pages] subpage sync failed:", error.message);
  // Le corps du PARENT vient de changer (un bloc sous-page en moins ou en
  // plus) : c'est une écriture de `content` comme une autre, et son texte
  // indexé doit suivre — même quand personne n'a le parent ouvert.
  else queueSearchText(service, [parentId]);
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

  // Le sens inverse (MIN-272) : le bloc du corps du parent s'en va avec la
  // page. Seule la RACINE du geste est concernée — les blocs des descendants
  // vivent dans des corps qui partent à la corbeille en même temps.
  //
  // Et on RETIENT qu'on l'a retiré : la restauration ne doit remettre un bloc
  // que là où il y en avait un (cf. la migration, colonne
  // `parent_block_removed`). Une page née dans la sidebar n'a jamais eu de
  // bloc, la ressortir de la corbeille ne doit pas lui en inventer un.
  if (page.parent_id) {
    let cleared = false;
    await syncParentBody(service, page.parent_id, (doc) => {
      const { doc: next, removed } = removeSubpages(doc, [pageId]);
      cleared = removed > 0;
      return {
        doc: (next ?? { type: "doc", content: [] }) as PageDocJSON,
        changed: cleared,
      };
    });
    if (cleared) {
      await service
        .from("pages")
        .update({ parent_block_removed: true })
        .eq("id", pageId);
    }
  }

  return { ok: true, trashed: descendants.length + 1 };
}

/**
 * Un corps qu'on peut considérer comme JAMAIS ÉCRIT : vide, ou réduit au
 * paragraphe vide que rend une page qu'on vient de créer.
 */
function isBlankDoc(content: unknown): boolean {
  const blocks = (content as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0] as { type?: string; content?: unknown[] };
  return only?.type === "paragraph" && !only.content?.length;
}

/**
 * DÉTRUIT une page restée vide — le seul geste du module qui ne passe pas par
 * la corbeille (MIN-270).
 *
 * Il ne sert qu'à une chose : créer une page puis repartir sans y écrire une
 * lettre ne doit rien laisser derrière. Passer par la corbeille remplirait
 * celle-ci de pages sans titre que personne n'a voulues, ce qui est exactement
 * le bruit qu'on cherche à éviter.
 *
 * Ce qui rend la destruction acceptable, c'est la GARDE, et elle est vérifiée
 * ICI plutôt qu'au client : sans titre, sans icône, sans corps, sans
 * sous-page. Une page qui échoue à ce test répond 409 et n'est pas touchée —
 * le client n'a donc aucun moyen de faire disparaître du contenu par ce
 * chemin, même en mentant sur ce qu'il croit vide.
 */
export async function discardPage(
  pageId: string,
  actorId: string
): Promise<{ ok: true } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  if (page.title.trim() !== "" || page.icon || !isBlankDoc(page.content)) {
    return { ok: false, status: 409, errorKey: "pageNotEmpty" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const hasChildren = all.some(
    (p) => p.parent_id === pageId && !p.deleted_at
  );
  if (hasChildren) return { ok: false, status: 409, errorKey: "pageNotEmpty" };

  // Le bloc du corps du parent part AVANT la ligne : c'est le même sens que la
  // corbeille (MIN-272), et l'ordre compte — une ligne détruite dont le bloc
  // survit laisse un lien mort dans le document du parent.
  if (page.parent_id) {
    await syncParentBody(service, page.parent_id, (doc) => {
      const { doc: next, removed } = removeSubpages(doc, [pageId]);
      return {
        doc: (next ?? { type: "doc", content: [] }) as PageDocJSON,
        changed: removed > 0,
      };
    });
  }

  const { error } = await service.from("pages").delete().eq("id", pageId);
  if (error) {
    console.error("[pages] discard failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true };
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
  } else if (parent && page.parent_block_removed) {
    // Le bloc revient dans le corps du parent, en FIN de document (MIN-272).
    // Rien ne se remet en double : `appendSubpage` ne pose rien si le corps
    // cite déjà la page — le cas d'un bloc recréé à la main entre-temps.
    await syncParentBody(service, parent.id, (doc) => {
      const { doc: next, added } = appendSubpage(doc, pageId);
      return { doc: next, changed: added };
    });
  }

  // La marque ne survit pas à la restauration : la page est de nouveau vivante,
  // et c'est le prochain passage à la corbeille qui dira ce qu'il en est alors.
  if (page.parent_block_removed) {
    await service
      .from("pages")
      .update({ parent_block_removed: false })
      .eq("id", pageId);
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
