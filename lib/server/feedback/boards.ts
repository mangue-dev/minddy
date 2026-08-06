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
 * Boards de feedback (MIN-37). Un board par projet, opt-in. Le token est la
 * capability de l'URL publique (/f/<token>), stocké en clair comme les vues
 * partagées (il doit être réaffichable). enabled=false = la page publique 404
 * mais la collecte (API + interne + IA) continue. feedback_boards est RLS
 * deny-all : tout passe par le service client, checks d'accès côté routes.
 *
 * Le secret SSO, lui, est chiffré au repos (MIN-119) : ce module est le SEUL
 * endroit qui le voit passer, et il rend toujours du clair à ses appelants —
 * `hydrateBoard` déchiffre à la lecture, `rotateSsoSecret` chiffre à l'écriture.
 * Aucun appelant n'a donc à savoir que la colonne porte une enveloppe.
 */

export interface FeedbackBoardRow {
  id: string;
  project_id: string;
  token: string;
  enabled: boolean;
  /** Couplage opt-in avec les vues partagées (onglets du site public). */
  show_views: boolean;
  /** Les vues (views.id) affichées en onglets — chaque vue est opt-in. */
  visible_view_ids: string[];
  /** Opt-in : afficher les catégories des posts sur le board public (MIN-52). */
  show_categories: boolean;
  /** Commentaires publics sur les retours (MIN-196). Faux = lecture seule :
      le fil déjà écrit reste lisible, plus personne n'y ajoute rien. */
  allow_comments: boolean;
  /** Accents optionnels du board public (MIN-59), hex par thème ; null = défaut. */
  accent_light: string | null;
  accent_dark: string | null;
  sso_secret: string | null;
  created_at: string;
  updated_at: string;
}

const BOARD_SELECT =
  "id, project_id, token, enabled, show_views, visible_view_ids, show_categories, allow_comments, accent_light, accent_dark, sso_secret, created_at, updated_at";

export interface PublicBoardContext {
  board: FeedbackBoardRow;
  project: { id: string; key: string; name: string; icon_url: string | null };
}

/**
 * Rend la ligne telle que le reste du code l'attend : `sso_secret` en clair.
 *
 * Un secret encore en clair en base (board d'avant MIN-119) est rescellé au
 * passage, après la réponse. `afterOrNow` et non un `void` détaché : la lecture
 * d'un board se fait en plein rendu de page, et une promesse détachée mourrait
 * au gel de l'invocation — le secret ne serait jamais chiffré, sans rien dire.
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
        // Garde anti-écrasement : si une rotation est passée entre la lecture et
        // ce rescellement, on ne remet pas l'ancien secret en place.
        .eq("sso_secret", row.sso_secret as string);
      if (error) {
        console.error("[feedback-boards] sso reseal failed:", error.message);
      }
    });
  }

  return { ...row, sso_secret: plain };
}

/** Résolution du token public. Ne filtre PAS sur enabled : la page décide
    (le SSO landing et l'espace « Mes feedbacks » ont besoin du board row). */
export async function getBoardByToken(token: string): Promise<PublicBoardContext | null> {
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
    .select("id, key, name, icon_url")
    .eq("id", board.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return null;

  return {
    board: hydrateBoard(board as FeedbackBoardRow) as FeedbackBoardRow,
    project: project as PublicBoardContext["project"],
  };
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

/** Crée le board (enabled) s'il n'existe pas, sinon le réactive. */
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

/** Couplage board ⇄ vues partagées (onglets du site public), opt-in. */
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

/** Sélection des vues partagées affichées en onglets (remplace la liste). */
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

/** Affichage opt-in des catégories des posts sur le board public (MIN-52). */
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

/** Commentaires publics sur les retours du board (MIN-196). */
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

/** Couleur d'accent du board public (MIN-59). N'écrit que les champs fournis
    (hex validé en amont, ou null pour revenir au défaut). */
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

/** Nouveau token : l'ancienne URL publique meurt immédiatement. */
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
 * Génère/régénère le secret SSO (HS256). Retourne le secret en CLAIR — c'est
 * l'appelant qui l'affiche au propriétaire — mais n'en range en base que
 * l'enveloppe chiffrée (MIN-119).
 *
 * `null` couvre désormais deux échecs, et l'appelant les traite pareil : refaire
 * la manœuvre. Le second (secret de chiffrement absent de l'environnement) est
 * délibérément bloquant : livrer un secret SSO qu'on ne saurait pas protéger
 * serait pire que ne pas le livrer.
 */
export async function rotateSsoSecret(projectId: string): Promise<string | null> {
  const service = getServiceClient();
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

  const { error } = await service
    .from("feedback_boards")
    .update({ sso_secret: sealed })
    .eq("project_id", projectId);
  if (error) {
    console.error("[feedback-boards] sso rotate failed:", error.message);
    return null;
  }
  return secret;
}

export async function clearSsoSecret(projectId: string): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_boards")
    .update({ sso_secret: null })
    .eq("project_id", projectId);
  return !error;
}
