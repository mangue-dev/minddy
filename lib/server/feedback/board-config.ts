import "server-only";

import { SITE_URL } from "@/lib/site";
import { feedbackBoardUrl } from "@/lib/feedback/board-url";
import {
  disableBoardForProject,
  enableBoardForProject,
  getBoardForProject,
  getOrCreateSsoSecret,
  setBoardAllowComments,
  setBoardShowCategories,
  setBoardShowPages,
  setBoardShowViews,
  setBoardVisiblePages,
  setBoardVisibleViews,
} from "@/lib/server/feedback/boards";
import { getDomainForBoard } from "@/lib/server/custom-domains";

/**
 * The feedback board as an AGENT sees it (MIN-106).
 *
 * Numo (in chat) and the user's MCP agent (in their IDE) have the same
 * need: "what is the public URL of this board, and is it only
 * alive? ". Two tables respond — `feedback_boards` for the token and
 * the activation, `custom_domains` for the possible client domain — and the
 * response is worthless if we only read one: an activated board whose personalized domain
 * is verified has a reference URL other than its `/f/<token>`.
 *
 * So we put the two together here, once, rather than in each tool.
 *
 * What never leaves here: the SSO secret. `sso_configured` says if it exists,
 * and only `configureFeedbackBoard` returns it — at the precise moment when someone asked it to write it to a `.env`.
 */

export interface FeedbackBoardConfig {
  /** false = no boards have ever been created for this project. */
  exists: boolean;
  /** false = the public page responds 404 (API collection continues). */
  enabled: boolean;
  token: string | null;
  /** The URL to give to the user / to hardcode into their app. */
  public_url: string | null;
  custom_domain: { domain: string; status: "pending" | "verified" } | null;
  sso_configured: boolean;
  show_categories: boolean;
  show_views: boolean;
  /** Public Comments on Returns (MIN-196). False = read only. */
  allow_comments: boolean;
  /** Shared views shown in tabs when `show_views` is true. */
  visible_view_ids: string[];
  show_pages: boolean;
  /** Published pages shown in tabs when `show_pages` is true. */
  visible_page_ids: string[];
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
  show_pages: false,
  visible_page_ids: [],
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
    show_pages: board.show_pages,
    visible_page_ids: board.visible_page_ids ?? [],
  };
}

export type ConfigureBoardResult =
  | { ok: true; config: FeedbackBoardConfig; sso_secret: string | null }
  | { ok: false; errorKey: "databaseError" | "noFieldsToUpdate" | "boardNotFound" };

/**
 * Publication of the board and SSO secret, for a caller who has ALREADY verified that
 * the actor is the owner of the project (like the routes of `app/api/projects/[id]/feedback`).
 *
 * `generateSso` never burps a secret already in place: an integration SSO
 * live at the client would silently break, and an agent relaunching its
 * configuration twice in a row should not be a way to break the
 * production. It returns the existing one, or creates one if there is none. The
 * rotation remains an explicit gesture, in the settings.
 */
export async function configureFeedbackBoard(input: {
  projectId: string;
  enabled?: boolean;
  generateSso?: boolean;
  /** Public page display options — same toggles as the PATCH of
 * settings, so Numo can SET what get_feedback_board READS to it. */
  showCategories?: boolean;
  showViews?: boolean;
  allowComments?: boolean;
  visibleViewIds?: string[];
  showPages?: boolean;
  visiblePageIds?: string[];
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
    showPages,
    visiblePageIds,
  } = input;
  const touchesDisplay =
    showCategories !== undefined ||
    showViews !== undefined ||
    allowComments !== undefined ||
    visibleViewIds !== undefined ||
    showPages !== undefined ||
    visiblePageIds !== undefined;
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

  // The display options are written on an EXISTING board: without a board, it
  // there is no public page to adjust.
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
    if (showPages !== undefined && !(await setBoardShowPages(projectId, showPages))) {
      return { ok: false, errorKey: "databaseError" };
    }
    if (visiblePageIds !== undefined && !(await setBoardVisiblePages(projectId, visiblePageIds))) {
      return { ok: false, errorKey: "databaseError" };
    }
  }

  let ssoSecret: string | null = null;
  if (generateSso) {
    // SSO only makes sense on an existing board. Without board AND without
    // `enabled: true` in the same call, we refuse rather than creating one
    // by the way: publishing the board of a project is a decision, not an effect
    // edge of a secrecy request.
    const board = await getBoardForProject(projectId);
    if (!board) return { ok: false, errorKey: "boardNotFound" };
    // The database row lock makes simultaneous setup calls converge on the
    // same stored secret instead of returning a value another call overwrote.
    ssoSecret = await getOrCreateSsoSecret(projectId);
    if (!ssoSecret) return { ok: false, errorKey: "databaseError" };
  }

  return {
    ok: true,
    config: await getFeedbackBoardConfig(projectId, input.origin),
    sso_secret: ssoSecret,
  };
}
