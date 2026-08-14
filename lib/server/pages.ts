import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  descendantIds,
  isPosition,
  positionAtEnd,
  wouldCreateCycle,
  type Page,
  type PageWriteKind,
} from "@/lib/pages";
import { exceedsJsonDepth, MAX_PAGE_JSON_DEPTH } from "@/lib/json-depth";
import { checkPageContent } from "@/lib/page-content-schema";
import { afterOrNow } from "@/lib/server/after-safe";
import {
  notifyAgentPageWrite,
  recordPageEvent,
  type PageEventType,
} from "@/lib/server/page-activity";
import { notifyPageMentions } from "@/lib/server/page-mentions";
import { queuePageBodyLinks } from "@/lib/server/page-links";
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
 *
 * Depuis MIN-277, la même règle vaut une seconde fois, et pour la même raison :
 * **toute écriture du corps porte son auteur (`writtenBy`) et archive l'état
 * qu'elle recouvre (`stampPageWrite`)**. Un chemin qui l'oublie ne casse rien de
 * visible non plus — il rend juste une écriture anonyme et irréversible, ce
 * qu'on ne découvre que le jour où l'agent a écrasé une page. Le test
 * structurel de `pages-history-paths.test.ts` le refuse de la même façon.
 *
 * Depuis MIN-278, une TROISIÈME, de la même famille : **toute écriture ANNONCE
 * ce qu'elle fait** (`announcePageWrite`) — sa ligne d'activité, les gens
 * qu'elle vient de citer, et le lanceur du run quand c'est l'agent qui écrit.
 * L'oublier ne casse rien de visible une fois de plus : ça rend simplement une
 * page qui change sans que rien ne se passe, ce qui était l'état d'avant le
 * ticket. Même test structurel, avec une seule exception nommée — le miroir
 * `syncParentBody`, qui n'est jamais un geste en soi.
 *
 * Depuis MIN-279, une QUATRIÈME, et c'est la même famille une fois de plus :
 * **toute écriture de `content` rejoue les liens de la page**
 * (`queuePageBodyLinks`), c'est-à-dire les rétroliens que son corps FABRIQUE
 * chez les pages qu'il cite. L'oublier ne casse rien de visible ici — ça laisse
 * juste une AUTRE page ignorer qu'elle est citée, ce qu'on ne découvre jamais
 * depuis celle qu'on est en train d'écrire. `page-links-paths.test.ts` le refuse
 * avec la même règle : `queueSearchText` et `queuePageBodyLinks` vont ensemble.
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
  | "pageVersionNotFound"
  | "pageParentNotFound"
  | "pageCycle"
  | "pageStale"
  | "pageNotEmpty"
  | "pageTooLarge"
  | "pageTooDeep"
  | "pageContentRefused"
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
  "id, project_id, parent_id, title, icon, version, position, favorite, created_by, updated_by, updated_kind, updated_api_key_id, created_at, updated_at, deleted_at, deleted_by, deleted_root_id, parent_block_removed";

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

/* ─── L'auteur d'une écriture, et l'état qu'elle recouvre (MIN-277) ────────── */

/**
 * Les colonnes d'AUTEUR à poser sur toute écriture de page.
 *
 * `kind` ne se déduit pas de `actorId` : une écriture de Numo, du MCP ou de
 * l'agent de code porte l'id du compte qui l'a permise. C'est la SURFACE qui
 * sait de quel geste il s'agit, et elle le transporte jusqu'ici.
 */
function writtenBy(
  actorId: string,
  kind: PageWriteKind,
  mcpKeyId: string | null = null
): {
  updated_by: string;
  updated_kind: PageWriteKind;
  updated_api_key_id: string | null;
} {
  // La CLÉ, quand l'écriture vient du MCP (MIN-282) : « agent » recouvre deux
  // visages — Numo, et l'agent qui tient une clé, qui a un nom et un logo. La
  // colonne est ce qui permet à l'historique de montrer le bon, comme
  // l'activité le fait déjà par `issue_events.api_key_id`.
  return {
    updated_by: actorId,
    updated_kind: kind,
    updated_api_key_id: kind === "agent" ? mcpKeyId : null,
  };
}

/**
 * La fenêtre de COALESCENCE de l'historique.
 *
 * L'éditeur enregistre une seconde après la dernière frappe : une version par
 * écriture ferait quarante lignes pour un paragraphe écrit d'une traite, et un
 * historique qu'on ne lit plus. Une même personne qui écrit sans s'arrêter ne
 * produit donc qu'une ligne par tranche de cinq minutes — la règle de Notion,
 * et celle qui rend l'historique lisible plutôt qu'exhaustif.
 *
 * Ce que la fenêtre ne recouvre JAMAIS : un changement d'auteur. L'état écrit
 * par un humain est archivé quoi qu'il arrive avant que l'agent (ou un
 * coéquipier) ne le recouvre — c'est exactement l'état qu'on viendra chercher.
 */
const VERSION_COALESCE_MS = 5 * 60_000;

/**
 * Archive l'état qu'une écriture vient de RECOUVRIR.
 *
 * Appelée après l'écriture, jamais avant : une écriture refusée (conflit de
 * version) n'a rien recouvert, et sa ligne d'historique serait un doublon de
 * l'état courant.
 *
 * `previous` à `null` = une CRÉATION : il n'y a rien derrière elle. Le point
 * d'appel est conservé quand même, et c'est voulu — la règle « toute écriture
 * du corps passe par ici » se lit alors sur tous les chemins, sans exception à
 * retenir (cf. `pages-history-paths.test.ts`).
 *
 * Hors chemin critique (`afterOrNow`) : la sauvegarde de l'éditeur ne doit pas
 * attendre l'archivage, et une promesse détachée mourrait avec la réponse
 * (lib/server/after-safe.ts).
 */
function stampPageWrite({
  service,
  previous,
  actorId,
  kind,
  always = false,
}: {
  service: Service;
  /** L'état d'AVANT l'écriture, tel qu'il a été lu. `null` sur une création. */
  previous: Page | null;
  /** L'auteur de l'écriture qui recouvre — celui qui ferme la fenêtre. */
  actorId: string;
  kind: PageWriteKind;
  /** Archive sans passer par la coalescence : la restauration d'une version ne
      doit jamais perdre l'état d'avant elle, même écrit dix secondes plus tôt. */
  always?: boolean;
}): void {
  if (!previous) return;

  // L'auteur de l'ÉTAT archivé, et non celui de l'écriture qui l'efface. Sur
  // une page jamais réécrite depuis sa création (ou née avant MIN-277), c'est
  // son créateur : la ligne d'historique nomme quelqu'un plutôt que personne.
  const authorId = previous.updated_by ?? previous.created_by;
  const authorKind: PageWriteKind = previous.updated_kind ?? "human";
  // La clé de l'état ARCHIVÉ, comme son auteur : celle d'avant l'écriture qui
  // le recouvre. Null dès que l'auteur n'est pas un agent de clé.
  const authorKeyId = previous.updated_api_key_id ?? null;

  afterOrNow(async () => {
    if (!always && authorId === actorId && authorKind === kind) {
      const { data } = await service
        .from("page_versions")
        .select("id")
        .eq("page_id", previous.id)
        .gte("created_at", new Date(Date.now() - VERSION_COALESCE_MS).toISOString())
        .limit(1);
      if (data && data.length > 0) return;
    }

    const { error } = await service.from("page_versions").insert({
      page_id: previous.id,
      project_id: previous.project_id,
      version: previous.version,
      title: previous.title,
      icon: previous.icon,
      content: previous.content ?? { type: "doc", content: [] },
      author_id: authorId,
      author_kind: authorKind,
      author_api_key_id: authorKeyId,
    });
    if (error) console.error("[pages] version snapshot failed:", error.message);
  });
}

/**
 * Ce qu'une écriture de page FAIT SAVOIR (MIN-278).
 *
 * Le pendant de `stampPageWrite`, et posé au même endroit pour la même raison :
 * une page pouvait changer sans que rien ne se passe — ni notification, ni ligne
 * d'activité, nulle part. Trois signaux, un seul point de passage :
 *
 *  1. **l'activité** — « créée / modifiée / mise à la corbeille / restaurée »,
 *     avec son auteur, coalescée par page + acteur + 5 minutes ;
 *  2. **les mentions** — ceux qu'on vient de citer, et eux seuls (la comparaison
 *     avec le document PRÉCÉDENT est ce qui fait qu'une rafale d'autosaves ne
 *     notifie qu'une fois, à la sauvegarde où le nom apparaît) ;
 *  3. **l'écriture d'AGENT** — au seul lanceur du run.
 *
 * Hors chemin critique (`afterOrNow`), comme l'archivage : la sauvegarde de
 * l'éditeur ne doit attendre aucun des trois, et une promesse détachée mourrait
 * avec la réponse (lib/server/after-safe.ts).
 *
 * Best-effort de bout en bout : aucun des trois ne remonte à l'appelant. Une
 * ligne d'activité perdue ne doit pas faire échouer une écriture réussie.
 */
function announcePageWrite({
  service,
  page,
  previous,
  actorId,
  kind,
  mcpKeyId,
  event,
  scanMentions = true,
}: {
  service: Service;
  /** La page telle qu'elle vient d'être écrite. */
  page: Page;
  /** L'état d'AVANT, pour le diff des mentions. `null` sur une création. */
  previous: Page | null;
  actorId: string;
  kind: PageWriteKind;
  /** La clé MCP derrière l'écriture, quand elle vient de là. C'est ce qui
      distingue les deux agents que `kind: "agent"` recouvre : celui d'une clé,
      qui a un nom (« Claude Code (mcp) »), et le nôtre, qui s'appelle Numo. */
  mcpKeyId?: string | null;
  event: PageEventType;
  /** La DUPLICATION le coupe : recopier un texte n'est pas citer quelqu'un, et
      copier une page repingerait tous les noms qu'elle porte. */
  scanMentions?: boolean;
}): void {
  afterOrNow(async () => {
    await recordPageEvent(service, {
      pageId: page.id,
      actorId,
      kind,
      type: event,
      mcpKeyId,
    });

    // Les mentions ne se lisent que sur un CORPS. Un renommage ne cite
    // personne, et une corbeille encore moins.
    if (scanMentions && page.content !== undefined && page.content !== null) {
      await notifyPageMentions(service, {
        projectId: page.project_id,
        pageId: page.id,
        actorId,
        doc: page.content,
        previousDoc: previous?.content ?? undefined,
        // Citer quelqu'un depuis un texte écrit par l'agent reste une citation
        // de l'AGENT : la ligne le nomme, lui, et pas le compte sous lequel il
        // a écrit.
        viaAssistant: kind === "agent",
        mcpKeyId,
      });
    }

    // « seulement quand l'acteur est l'agent » : c'est la SURFACE qui le sait
    // (les six outils de lib/server/page-tools.ts signent `kind: "agent"`), et
    // `actorId` est le compte qui l'a permise — donc le lanceur du run.
    if (kind === "agent") {
      await notifyAgentPageWrite(service, {
        projectId: page.project_id,
        pageId: page.id,
        actorId,
      });
    }
  });
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
  kind = "human",
  mcpKeyId,
  input,
}: {
  projectId: string;
  actorId: string;
  /** La nature du geste (MIN-277) : « agent » sur les six outils d'écriture. */
  kind?: PageWriteKind;
  /** La clé MCP derrière le geste (MIN-278) : elle NOMME l'agent dans l'activité
      et dans les citations. Absente sur nos propres agents, qui sont Numo. */
  mcpKeyId?: string | null;
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
  if (content === "too-deep") {
    return { ok: false, status: 400, errorKey: "pageTooDeep" };
  }
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }
  if (content === "refused") {
    return { ok: false, status: 400, errorKey: "pageContentRefused" };
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
    ...writtenBy(actorId, kind),
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
  queuePageBodyLinks(service, [page.id]);
  // Une création ne recouvre rien : l'appel ne pose que la règle (cf.
  // `stampPageWrite`), il n'écrit aucune ligne d'historique.
  stampPageWrite({ service, previous: null, actorId, kind });
  // Elle se DIT, en revanche : le wizard de projet et les agents créent des
  // pages entières d'un coup, mentions comprises (MIN-278).
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    mcpKeyId,
    event: "page_created",
  });
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
  actorId: string,
  kind: PageWriteKind = "human"
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
        // La COPIE est une écriture neuve, de celui qui l'a demandée : elle
        // porte son nom, et non celui du dernier auteur de l'original.
        ...writtenBy(actorId, kind),
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
  queuePageBodyLinks(
    service,
    (data as unknown as Page[]).map((row) => row.id)
  );
  // Des pages NEUVES : comme la création, elles ne recouvrent rien.
  stampPageWrite({ service, previous: null, actorId, kind });

  const rootId = idMap.get(pageId);
  const copy = (data as unknown as Page[]).find((row) => row.id === rootId);
  if (!copy) return { ok: false, status: 500, errorKey: "databaseError" };
  // La RACINE seule est annoncée : une branche de vingt pages copiée d'un geste
  // est un geste, pas vingt.
  announcePageWrite({
    service,
    page: copy,
    previous: null,
    actorId,
    kind,
    event: "page_created",
    scanMentions: false,
  });
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
  kind = "human",
  mcpKeyId,
  alwaysArchive = false,
  input,
}: {
  pageId: string;
  actorId: string;
  /** La nature du geste (MIN-277) : « agent » sur les six outils d'écriture. */
  kind?: PageWriteKind;
  /** La clé MCP derrière le geste (MIN-278) : cf. `createPage`. */
  mcpKeyId?: string | null;
  /** Archive l'état recouvert hors coalescence — la restauration d'une version
      (cf. `restorePageVersion`), seul geste qui l'exige. */
  alwaysArchive?: boolean;
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
  if (content === "too-deep") {
    return { ok: false, status: 400, errorKey: "pageTooDeep" };
  }
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }
  if (content === "refused") {
    return { ok: false, status: 400, errorKey: "pageContentRefused" };
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

  // L'auteur est posé sur ce qui touche au DOCUMENT — corps, titre, icône :
  // renommer une page est bien la modifier, et l'en-tête dit « modifiée par »,
  // pas « corps écrit par ».
  //
  // Le RANGEMENT, lui, ne signe pas. Épingler une page (le favori est partagé
  // par le projet, cf. la migration `pages_favorite`) ou la glisser dans
  // l'arbre ne dit rien de son contenu, et signer ces gestes-là ferait afficher
  // « modifiée par Bob » en tête d'une page que Bob n'a jamais ouverte —
  // exactement la fausse attribution que MIN-277 existe pour éviter.
  //
  // L'HISTORIQUE, lui, ne s'occupe que du corps — c'est le seul état qu'on
  // puisse vouloir remonter.
  const writesDocument =
    patch.content !== undefined || patch.title !== undefined || "icon" in patch;
  if (writesDocument) Object.assign(patch, writtenBy(actorId, kind));

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
  if (patch.content !== undefined) {
    queueSearchText(service, [pageId]);
    queuePageBodyLinks(service, [pageId]);
    // L'état d'AVANT, celui qu'on vient de recouvrir : la ligne lue en tête de
    // cette fonction. Une écriture qui porte sa `version` (l'éditeur, les outils
    // d'agent) garantit en plus que c'était bien l'état EN BASE à l'instant de
    // l'écriture — la condition `eq("version", expected)` a filtré le reste.
    stampPageWrite({ service, previous: page, actorId, kind, always: alwaysArchive });
  }
  // L'annonce suit la MÊME frontière que la signature (`writesDocument`) : le
  // rangement — épingler, glisser dans l'arbre — ne fait pas une ligne
  // « modifiée par ». Sinon réordonner la sidebar remplirait l'activité d'un
  // projet de gestes que personne ne considère comme des modifications.
  if (writesDocument) {
    announcePageWrite({
      service,
      page: data as unknown as Page,
      previous: page,
      actorId,
      kind,
      mcpKeyId,
      event: "page_updated",
    });
  }
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
  actorId: string,
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
    .update({
      content: doc,
      version: parent.version + 1,
      // L'auteur du miroir est celui du GESTE (corbeille, restauration), et le
      // geste est humain : l'agent n'a pas de chemin vers la corbeille.
      ...writtenBy(actorId, "human"),
    })
    .eq("id", parentId)
    .eq("version", parent.version)
    .is("deleted_at", null);
  if (error) console.error("[pages] subpage sync failed:", error.message);
  // Le corps du PARENT vient de changer (un bloc sous-page en moins ou en
  // plus) : c'est une écriture de `content` comme une autre, et son texte
  // indexé doit suivre — même quand personne n'a le parent ouvert.
  else {
    queueSearchText(service, [parentId]);
    queuePageBodyLinks(service, [parentId]);
    // Et son état d'avant est archivé comme n'importe quel autre : le corps du
    // parent perd un bloc sans que personne l'ait ouvert, c'est précisément une
    // écriture qu'on peut vouloir remonter.
    stampPageWrite({ service, previous: parent, actorId, kind: "human" });
    // Pas d'ANNONCE ici (MIN-278), et c'est délibéré : ce miroir n'est jamais
    // un geste en soi — il accompagne toujours une corbeille ou une
    // restauration, qui a déjà posé sa ligne. En poser une seconde ferait lire
    // « X a modifié Dossier » à chaque sous-page supprimée. Et il ne peut pas
    // faire apparaître de mention : il ne fait qu'ajouter ou retirer un bloc
    // sous-page.
  }
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
  actorId: string,
  /** La nature du geste (MIN-278) : « agent » quand c'est Numo qui corbeille —
      la corbeille lui est ouverte (`move_to_trash`, type `page`), et sans ça la
      ligne d'activité nommerait l'humain d'un geste qu'il n'a pas fait. */
  kind: PageWriteKind = "human"
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
    await syncParentBody(service, page.parent_id, actorId, (doc) => {
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

  // La RACINE du geste seule (MIN-278) : la descendance part avec elle, et une
  // ligne par page ferait vingt lignes pour un bloc effacé. La corbeille reste
  // le seul geste destructeur des pages — c'est la ligne qu'on vient chercher.
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    event: "page_trashed",
    scanMentions: false,
  });
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
    await syncParentBody(service, page.parent_id, actorId, (doc) => {
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
  actorId: string,
  /** Comme la corbeille ci-dessus : restaurer est le geste inverse, et il
      s'ouvre au même appelant. */
  kind: PageWriteKind = "human"
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
    await syncParentBody(service, parent.id, actorId, (doc) => {
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

  // Le pendant de la corbeille : sans cette ligne, une page réapparue dans la
  // sidebar l'aurait fait sans que rien ne le dise.
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    event: "page_restored",
    scanMentions: false,
  });
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
 *
 * Trois gardes, dans CET ordre, et l'ordre est le sujet :
 *
 * 1. la PROFONDEUR d'abord (MIN-348) — peser un document, c'est le sérialiser,
 *    et `JSON.stringify` descend l'arbre par la pile d'appels : sur un corps
 *    imbriqué dix mille fois, c'est le garde-fou qui tombe, pas ce qu'il devait
 *    arrêter. La descente récursive du schéma tomberait de même ;
 * 2. la TAILLE, avant de parcourir l'arbre nœud par nœud ;
 * 3. le SCHÉMA (MIN-350) : types connus, attributs connus, adresses sans
 *    protocole hostile (lib/page-content-schema.ts). Il rend le corps NETTOYÉ
 *    de ses attributs inconnus — c'est cette valeur-là qui part en base.
 */
function readContent(
  value: unknown
): unknown | undefined | "too-large" | "too-deep" | "refused" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  if (exceedsJsonDepth(value, MAX_PAGE_JSON_DEPTH)) return "too-deep";
  if (JSON.stringify(value).length > MAX_CONTENT_BYTES) return "too-large";
  const checked = checkPageContent(value);
  if (!checked.ok) return "refused";
  return checked.content;
}
