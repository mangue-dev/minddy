import "server-only";

import { SITE_URL } from "@/lib/site";
import { feedbackBoardUrl } from "@/lib/feedback/board-url";
import {
  disableBoardForProject,
  enableBoardForProject,
  getBoardForProject,
  rotateSsoSecret,
  setBoardAllowComments,
  setBoardShowCategories,
  setBoardShowViews,
  setBoardVisibleViews,
} from "@/lib/server/feedback/boards";
import { getDomainForBoard } from "@/lib/server/custom-domains";

/**
 * Le board de feedback tel qu'un AGENT le voit (MIN-106).
 *
 * Numo (dans le chat) et l'agent MCP de l'utilisateur (dans son IDE) ont le même
 * besoin : « quelle est l'URL publique de ce board, et est-elle seulement
 * vivante ? ». Deux tables répondent — `feedback_boards` pour le token et
 * l'activation, `custom_domains` pour l'éventuel domaine du client — et la
 * réponse ne vaut rien si on n'en lit qu'une : un board activé dont le domaine
 * personnalisé est vérifié a une autre URL de référence que son `/f/<token>`.
 *
 * On assemble donc les deux ici, une fois, plutôt que dans chaque outil.
 *
 * Ce qui ne sort jamais d'ici : le secret SSO. `sso_configured` dit s'il existe,
 * et seul `configureFeedbackBoard` le rend — au moment précis où quelqu'un l'a
 * demandé pour l'écrire dans un `.env`.
 */

export interface FeedbackBoardConfig {
  /** false = aucun board n'a jamais été créé pour ce projet. */
  exists: boolean;
  /** false = la page publique répond 404 (la collecte par API continue). */
  enabled: boolean;
  token: string | null;
  /** L'URL à donner à l'utilisateur / à coder en dur dans son app. */
  public_url: string | null;
  custom_domain: { domain: string; status: "pending" | "verified" } | null;
  sso_configured: boolean;
  show_categories: boolean;
  show_views: boolean;
  /** Commentaires publics sur les retours (MIN-196). Faux = lecture seule. */
  allow_comments: boolean;
  /** Les vues partagées montrées en onglets quand `show_views` est vrai. */
  visible_view_ids: string[];
}

const NO_BOARD: FeedbackBoardConfig = {
  exists: false,
  enabled: false,
  token: null,
  public_url: null,
  custom_domain: null,
  sso_configured: false,
  show_categories: false,
  show_views: false,
  allow_comments: false,
  visible_view_ids: [],
};

export async function getFeedbackBoardConfig(
  projectId: string,
  origin: string = SITE_URL
): Promise<FeedbackBoardConfig> {
  const board = await getBoardForProject(projectId);
  if (!board) return NO_BOARD;

  const domainRow = await getDomainForBoard(board.id);
  const customDomain = domainRow
    ? { domain: domainRow.domain, status: domainRow.status }
    : null;

  return {
    exists: true,
    enabled: board.enabled,
    token: board.token,
    public_url: feedbackBoardUrl({ token: board.token, origin, customDomain }),
    custom_domain: customDomain,
    sso_configured: board.sso_secret !== null,
    show_categories: board.show_categories,
    show_views: board.show_views,
    allow_comments: board.allow_comments,
    visible_view_ids: board.visible_view_ids ?? [],
  };
}

export type ConfigureBoardResult =
  | { ok: true; config: FeedbackBoardConfig; sso_secret: string | null }
  | { ok: false; errorKey: "databaseError" | "noFieldsToUpdate" | "boardNotFound" };

/**
 * Publication du board et secret SSO, pour un appelant qui a DÉJÀ vérifié que
 * l'acteur est owner du projet (comme les routes de `app/api/projects/[id]/feedback`).
 *
 * `generateSso` ne rote jamais un secret déjà en place : une intégration SSO
 * vivante chez le client casserait silencieusement, et un agent qui relance sa
 * configuration deux fois de suite ne doit pas être un moyen de casser la
 * production. Il renvoie l'existant, ou en crée un s'il n'y en a pas. La
 * rotation reste un geste explicite, dans les réglages.
 */
export async function configureFeedbackBoard(input: {
  projectId: string;
  enabled?: boolean;
  generateSso?: boolean;
  /** Options d'affichage de la page publique — mêmes bascules que le PATCH des
   *  réglages, pour que Numo puisse RÉGLER ce que get_feedback_board lui LIT. */
  showCategories?: boolean;
  showViews?: boolean;
  allowComments?: boolean;
  visibleViewIds?: string[];
  origin?: string;
}): Promise<ConfigureBoardResult> {
  const {
    projectId,
    enabled,
    generateSso,
    showCategories,
    showViews,
    allowComments,
    visibleViewIds,
  } = input;
  const touchesDisplay =
    showCategories !== undefined ||
    showViews !== undefined ||
    allowComments !== undefined ||
    visibleViewIds !== undefined;
  if (enabled === undefined && !generateSso && !touchesDisplay) {
    return { ok: false, errorKey: "noFieldsToUpdate" };
  }

  if (enabled === true) {
    const board = await enableBoardForProject(projectId);
    if (!board) return { ok: false, errorKey: "databaseError" };
  } else if (enabled === false) {
    const done = await disableBoardForProject(projectId);
    if (!done) return { ok: false, errorKey: "databaseError" };
  }

  // Les options d'affichage s'écrivent sur un board EXISTANT : sans board, il
  // n'y a pas de page publique à régler.
  if (touchesDisplay) {
    if (!(await getBoardForProject(projectId))) {
      return { ok: false, errorKey: "boardNotFound" };
    }
    if (showCategories !== undefined && !(await setBoardShowCategories(projectId, showCategories))) {
      return { ok: false, errorKey: "databaseError" };
    }
    if (showViews !== undefined && !(await setBoardShowViews(projectId, showViews))) {
      return { ok: false, errorKey: "databaseError" };
    }
    if (
      allowComments !== undefined &&
      !(await setBoardAllowComments(projectId, allowComments))
    ) {
      return { ok: false, errorKey: "databaseError" };
    }
    if (visibleViewIds !== undefined && !(await setBoardVisibleViews(projectId, visibleViewIds))) {
      return { ok: false, errorKey: "databaseError" };
    }
  }

  let ssoSecret: string | null = null;
  if (generateSso) {
    // Le SSO n'a de sens que sur un board existant. Sans board ET sans
    // `enabled: true` dans le même appel, on refuse plutôt que d'en créer un
    // au passage : publier le board d'un projet est une décision, pas un effet
    // de bord d'une demande de secret.
    const board = await getBoardForProject(projectId);
    if (!board) return { ok: false, errorKey: "boardNotFound" };
    ssoSecret = board.sso_secret ?? (await rotateSsoSecret(projectId));
    if (!ssoSecret) return { ok: false, errorKey: "databaseError" };
  }

  return {
    ok: true,
    config: await getFeedbackBoardConfig(projectId, input.origin),
    sso_secret: ssoSecret,
  };
}
