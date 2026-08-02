import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import {
  ONBOARDING_STARTED_META_KEY,
  resolveOnboardingState,
} from "@/lib/onboarding";

/**
 * Lecture partagée des comptes pour la console d'admin (MIN-90).
 *
 * `/api/admin/users` (la liste paginée) et `/api/admin/overview` (l'entonnoir
 * d'onboarding et la répartition des plans) ont besoin des mêmes lignes : une
 * par compte `auth.users`, avec ses compteurs. Elles passent donc toutes deux
 * par ici — la RPC renvoie les ingrédients bruts, et l'onboarding se résout
 * avec le MÊME `resolveOnboardingState` que la home, jamais réimplémenté.
 */

/** Une ligne brute de `get_admin_users_overview`. */
export interface AdminUserRpcRow {
  user_id: string;
  email: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  /** Compte interne (équipe, démo, bot) : visible ici, jamais dans les stats. */
  is_internal: boolean;
  projects_owned: number;
  projects_member: number;
  issues_accessible: number;
  issues_created: number;
  last_activity_at: string | null;
  spent_month: number | string;
  ai_calls: number;
  reset_at: string | null;
  total_count: number;
}

export interface AdminUsersPage {
  rows: AdminUserRpcRow[];
  total: number;
}

/** Une page de comptes, la plus récente inscription d'abord. */
export async function fetchAdminUsers(params: {
  search?: string | null;
  limit: number;
  offset: number;
}): Promise<AdminUsersPage> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("get_admin_users_overview", {
    p_search: params.search?.trim() || null,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AdminUserRpcRow[];
  // `total_count` est porté par chaque ligne (window function) ; sans ligne, la
  // recherche ne correspond à personne.
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) || 0 : 0 };
}

/**
 * Les comptes qui ont posé une clé BYOK. L'étape « clé » de l'onboarding se
 * coche dessus (MIN-149) : sans cet ensemble, l'entonnoir d'admin compterait
 * bloqués sur cette étape des comptes qui l'ont franchie.
 *
 * Lue en entier plutôt que filtrée sur la page : `user_ai_keys` ne porte qu'une
 * ligne par compte en BYOK — un sous-ensemble minuscule des comptes — et une
 * seule lecture sert les deux routes d'admin quelle que soit leur pagination.
 */
export async function fetchByokUserIds(): Promise<Set<string>> {
  const { data, error } = await getServiceClient().from("user_ai_keys").select("user_id");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => (row as { user_id: string }).user_id));
}

/** L'état d'onboarding d'un compte, résolu comme la home le résout. */
export function onboardingOf(row: AdminUserRpcRow, byokUserIds: ReadonlySet<string>) {
  const meta = row.meta ?? {};
  const state = resolveOnboardingState({
    meta,
    projectCount: Number(row.projects_owned) + Number(row.projects_member),
    issueCount: Number(row.issues_accessible),
    hasAiKey: byokUserIds.has(row.user_id),
    cyclesEnabled: resolveCyclePrefs(meta).enabled,
  });
  return {
    // `eligible` mélange « l'onboarding a démarré » et « le compte est vide » ;
    // pour l'admin seule la première moitié est un fait, d'où la lecture directe
    // du filigrane posé au premier affichage.
    started: meta[ONBOARDING_STARTED_META_KEY] === true,
    completed: state.completedCount,
    total: state.totalCount,
    allComplete: state.allComplete,
    dismissed: state.dismissed,
    currentStep: state.currentStepId,
  };
}

/** Nom d'affichage du compte (display_name → full_name → name → handle). */
export function nameOf(row: AdminUserRpcRow): string {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const pick = (key: string) => {
    const value = meta[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const full = pick("display_name") ?? pick("full_name") ?? pick("name");
  return displayName({ full_name: full, email: row.email }, "—");
}

/**
 * Marque (ou démarque) un compte comme INTERNE — équipe, démo, bot.
 *
 * Le drapeau vit dans `app_metadata`, comme le rôle admin : l'utilisateur ne
 * peut pas se l'attribuer lui-même.
 *
 * L'écriture est volontairement défensive sur DEUX points. On relit d'abord le
 * compte et on renvoie l'objet complet : si GoTrue venait à REMPLACER
 * `app_metadata` au lieu de le fusionner, envoyer le seul drapeau effacerait
 * `role: "admin"`. Et on retire le drapeau avec `null`, pas en omettant la clé :
 * la sémantique actuelle est une fusion, où une clé absente ne supprime rien.
 * Les deux comportements donnent le bon résultat.
 */
export async function setUserInternal(
  userId: string,
  internal: boolean,
): Promise<void> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error(error?.message ?? "User not found");

  const current = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    app_metadata: { ...current, internal: internal ? true : null },
  });
  if (updateError) throw new Error(updateError.message);
}

