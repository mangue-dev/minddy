import "server-only";

import { randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";
import {
  encryptBoardSsoSecret,
  isSsoCryptoConfigured,
  readBoardSsoSecret,
} from "@/lib/server/feedback/sso-crypto";

/**
 * Feedback boards (MIN-37). One board per project, opt-in. The token is the
 * capability of the public URL (/f/<token>), stored in plaintext like the shared
 * views (it must be redisplayable). enabled=false = the public page 404
 * but the collection (API + internal + AI) continues. feedback_boards is RLS
 * deny-all: everything goes through customer service, access checks on the road side.
 *
 * The SSO secret is encrypted at rest (MIN-119): this module is the ONLY
 * place that sees it pass, and it always returns plaintext to its callers —
 * `hydrateBoard` decrypts reads, and the secret writers encrypt before storage.
 * So no caller has to know that the column carries an envelope.
 */

export interface FeedbackBoardRow {
  id: string;
  project_id: string;
  token: string;
  enabled: boolean;
  /** Opt-in coupling with shared views (public site tabs). */
  show_views: boolean;
  /** Views (views.id) displayed in tabs — each view is opt-in. */
  visible_view_ids: string[];
  /** Opt-in coupling with published pages as public site tabs. */
  show_pages: boolean;
  /** Published pages (pages.id) displayed in tabs — each page is opt-in. */
  visible_page_ids: string[];
  /** Opt-in: display the post categories on the public board (MIN-52). */
  show_categories: boolean;
  /** Public Comments on Returns (MIN-196). False = read only:
 the thread already written remains readable, no one adds anything to it. */
  allow_comments: boolean;
  /** Optional public board accents (MIN-59), hex by theme; null = default. */
  accent_light: string | null;
  accent_dark: string | null;
  sso_secret: string | null;
  created_at: string;
  updated_at: string;
}

const PUBLIC_BOARD_SELECT =
  "id, project_id, token, enabled, show_views, visible_view_ids, show_pages, visible_page_ids, show_categories, allow_comments, accent_light, accent_dark, created_at, updated_at";
const BOARD_SELECT = `${PUBLIC_BOARD_SELECT}, sso_secret`;

export type PublicFeedbackBoardRow = Omit<FeedbackBoardRow, "sso_secret">;

export interface PublicBoardContext {
  board: PublicFeedbackBoardRow;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  };
}

/**
 * Returns the line as the rest of the code expects: `sso_secret` in plaintext.
 *
 * A secret still in plaintext in the base (board before MIN-119) is resealed at the
 * passage, after the response. `afterOrNow` and not a detached `void`: reading
 * of a board is done in full rendering of the page, and a detached promise would die
 * when the invocation is frozen — the secret would never be encrypted, without saying anything.
 */
function hydrateBoard(row: FeedbackBoardRow | null): FeedbackBoardRow | null {
  if (!row) return null;
  const { plain, legacy } = readBoardSsoSecret(row.sso_secret);

  if (legacy && plain && isSsoCryptoConfigured()) {
    const sealed = encryptBoardSsoSecret(plain);
    afterOrNow(async () => {
      const { error } = await getServiceClient()
        .from("feedback_boards")
        .update({ sso_secret: sealed })
        .eq("id", row.id)
        // Anti-crush guard: if a rotation has passed between reading and
        // ce rescellement, on ne remet pas l'ancien secret en place.
        .eq("sso_secret", row.sso_secret as string);
      if (error) {
        console.error("[feedback-boards] sso reseal failed:", error.message);
      }
    });
  }

  return { ...row, sso_secret: plain };
}

/** Public token resolution. Do NOT filter on enabled: the page decides
 (the SSO landing and the “My feedback” space need the board row). */
export async function getBoardByToken(token: string): Promise<PublicBoardContext | null> {
  if (!token) return null;
  const service = getServiceClient();
  const { data: board } = await service
    .from("feedback_boards")
    .select(PUBLIC_BOARD_SELECT)
    .eq("token", token)
    .maybeSingle();
  if (!board) return null;

  const { data: project } = await service
    .from("projects")
    .select("id, key, name, icon_url, orb_seed")
    .eq("id", board.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return null;

  return {
    board: board as PublicFeedbackBoardRow,
    project: project as PublicBoardContext["project"],
  };
}

export interface SsoBoardContext extends PublicBoardContext {
  board: FeedbackBoardRow;
}

/**
 * Resolves and decrypts SSO material only for the rate-limited SSO landing.
 * General public board reads must use `getBoardByToken` instead.
 */
export async function getBoardWithSsoSecretByToken(
  token: string
): Promise<SsoBoardContext | null> {
  if (!token) return null;
  const service = getServiceClient();
  const { data: board } = await service
    .from("feedback_boards")
    .select(BOARD_SELECT)
    .eq("token", token)
    .maybeSingle();
  if (!board) return null;

  const { data: project } = await service
    .from("projects")
    .select("id, key, name, icon_url, orb_seed")
    .eq("id", board.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return null;

  return {
    board: hydrateBoard(board as FeedbackBoardRow) as FeedbackBoardRow,
    project: project as PublicBoardContext["project"],
  };
}

/** Public project lookup that never reads or decrypts the SSO secret. */
export async function getPublicBoardForProject(
  projectId: string
): Promise<PublicFeedbackBoardRow | null> {
  const { data } = await getServiceClient()
    .from("feedback_boards")
    .select(PUBLIC_BOARD_SELECT)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as PublicFeedbackBoardRow | null) ?? null;
}

export async function getBoardForProject(projectId: string): Promise<FeedbackBoardRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_boards")
    .select(BOARD_SELECT)
    .eq("project_id", projectId)
    .maybeSingle();
  return hydrateBoard((data as FeedbackBoardRow | null) ?? null);
}

function generateBoardToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Creates the board (enabled) if it does not exist, otherwise reactivates it. */
export async function enableBoardForProject(projectId: string): Promise<FeedbackBoardRow | null> {
  const service = getServiceClient();
  const existing = await getBoardForProject(projectId);
  if (existing) {
    if (existing.enabled) return existing;
    const { data } = await service
      .from("feedback_boards")
      .update({ enabled: true })
      .eq("id", existing.id)
      .select(BOARD_SELECT)
      .maybeSingle();
    return hydrateBoard((data as FeedbackBoardRow | null) ?? null);
  }
  const { data, error } = await service
    .from("feedback_boards")
    .insert({ project_id: projectId, token: generateBoardToken(), enabled: true })
    .select(BOARD_SELECT)
    .maybeSingle();
  if (error) {
    console.error("[feedback-boards] create failed:", error.message);
    return null;
  }
  return hydrateBoard((data as FeedbackBoardRow | null) ?? null);
}

/** Coupling board ⇄ shared views (public site tabs), opt-in. */
export async function setBoardShowViews(
  projectId: string,
  showViews: boolean
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ show_views: showViews })
    .eq("project_id", projectId);
  return !error;
}

/** Selection of shared views displayed in tabs (replaces the list). */
export async function setBoardVisibleViews(
  projectId: string,
  viewIds: string[]
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ visible_view_ids: viewIds })
    .eq("project_id", projectId);
  return !error;
}

/** Coupling board ⇄ published pages (public site tabs), opt-in. */
export async function setBoardShowPages(
  projectId: string,
  showPages: boolean
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ show_pages: showPages })
    .eq("project_id", projectId);
  return !error;
}

/** Selection of published pages displayed in tabs (replaces the list). */
export async function setBoardVisiblePages(
  projectId: string,
  pageIds: string[]
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ visible_page_ids: pageIds })
    .eq("project_id", projectId);
  return !error;
}

/** Opt-in display of post categories on the public board (MIN-52). */
export async function setBoardShowCategories(
  projectId: string,
  showCategories: boolean
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ show_categories: showCategories })
    .eq("project_id", projectId);
  return !error;
}

/** Public comments on board feedback (MIN-196). */
export async function setBoardAllowComments(
  projectId: string,
  allowComments: boolean
): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ allow_comments: allowComments })
    .eq("project_id", projectId);
  return !error;
}

/** Accent color of the public board (MIN-59). Only writes the fields provided
 (hex validated upstream, or null to return to the default). */
export async function setBoardAccent(
  projectId: string,
  patch: { accent_light?: string | null; accent_dark?: string | null }
): Promise<boolean> {
  const update: Record<string, string | null> = {};
  if ("accent_light" in patch) update.accent_light = patch.accent_light ?? null;
  if ("accent_dark" in patch) update.accent_dark = patch.accent_dark ?? null;
  if (Object.keys(update).length === 0) return true;
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update(update)
    .eq("project_id", projectId);
  return !error;
}

export async function disableBoardForProject(projectId: string): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ enabled: false })
    .eq("project_id", projectId);
  return !error;
}

/** New token: the old public URL dies immediately. */
export async function rotateBoardToken(projectId: string): Promise<FeedbackBoardRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_boards")
    .update({ token: generateBoardToken() })
    .eq("project_id", projectId)
    .select(BOARD_SELECT)
    .maybeSingle();
  return hydrateBoard((data as FeedbackBoardRow | null) ?? null);
}

/**
 * Generates/regenerates the SSO secret (HS256). Returns the secret in CLEAR — it is
 * the caller who displays it to the owner — but only stores in base
 * the encrypted envelope (MIN-119).
 *
 * `null` now covers two failures, and the caller treats them the same: redo
 * the maneuver. The second (encryption secret absent from the environment) is
 * deliberately blocking: delivering an SSO secret that we cannot protect
 * would be worse than not delivering it.
 */
async function writeSsoSecret(
  projectId: string,
  onlyIfAbsent: boolean
): Promise<string | null> {
  const secret = "fbsso_" + randomBytes(24).toString("base64url");

  let sealed: string;
  try {
    sealed = encryptBoardSsoSecret(secret);
  } catch (err) {
    console.error(
      `[feedback-boards] sso rotate refused: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }

  const { data, error } = await getServiceClient().rpc(
    "write_feedback_sso_secret",
    {
      p_project_id: projectId,
      p_sso_secret: sealed,
      p_only_if_absent: onlyIfAbsent,
    }
  );
  if (error) {
    console.error("[feedback-boards] serialized SSO write failed:", error.message);
    return null;
  }
  if (typeof data !== "string") return null;
  return readBoardSsoSecret(data).plain;
}

/** Rotate the SSO secret while holding the board row lock in PostgreSQL. */
export async function rotateSsoSecret(projectId: string): Promise<string | null> {
  return writeSsoSecret(projectId, false);
}

/** Return the existing SSO secret or initialize it exactly once. */
export async function getOrCreateSsoSecret(
  projectId: string
): Promise<string | null> {
  return writeSsoSecret(projectId, true);
}

export async function clearSsoSecret(projectId: string): Promise<boolean> {
  const { error } = await getServiceClient().rpc("write_feedback_sso_secret", {
    p_project_id: projectId,
    p_sso_secret: null,
    p_only_if_absent: false,
  });
  return !error;
}
